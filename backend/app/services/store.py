"""Repository-scoped persistence. No GitHub or inference calls belong in this module."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import re
from uuid import UUID
from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.db.models import Repository, DecisionIndex, IngestionJob
from app.schemas import Decision
from app.evidence import validate_decision

class NotFound(Exception): pass
class Conflict(Exception): pass
class DocumentUnavailable(Exception): pass

def now():
    return datetime.now(timezone.utc)

def topic_key(value):
    key = re.sub(r'[^a-z0-9]+', '-', value.casefold()).strip('-')
    if not key or len(key) > 200:
        raise ValueError('Use a stable nonempty topic key under 200 characters, independent of title.')
    return key

def row_dict(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}

class Store:
    def __init__(self, engine, mongo):
        self.engine, self.mongo = engine, mongo

    @contextmanager
    def lock(self, key):
        # Session-level lock survives SQL commits in the cross-database saga.
        lock_id = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], 'big', signed=True)
        with self.engine.connect() as conn:
            conn.execute(text('SELECT pg_advisory_lock(:key)'), {'key': lock_id})
            conn.commit()
            try:
                yield
            finally:
                conn.execute(text('SELECT pg_advisory_unlock(:key)'), {'key': lock_id})
                conn.commit()

    def register_repository(self, metadata):
        """Internal boundary: metadata must come from the public GitHub resolver, never a client ID."""
        values = {k: metadata[k] for k in ('repo_id','owner_login','name','full_name','html_url')}
        if metadata.get('visibility', 'public') != 'public' or metadata.get('private', False):
            raise ValueError('Only public repositories are supported')
        values.update({k: metadata.get(k) for k in ('github_node_id','default_branch')})
        values['last_checked_at'] = now()
        with Session(self.engine) as session, session.begin():
            stmt = insert(Repository).values(**values)
            session.execute(stmt.on_conflict_do_update(index_elements=['repo_id'], set_={**values, 'updated_at': now()}))
        return self.repository(values['repo_id'])

    def repository(self, repo_id):
        with Session(self.engine) as session:
            repo = session.get(Repository, repo_id)
            if not repo: raise NotFound('Repository not found')
            result = row_dict(repo)
            latest = session.scalar(select(IngestionJob).where(IngestionJob.repo_id == repo_id)
                .order_by(IngestionJob.created_at.desc()).limit(1))
            result['latest_job'] = row_dict(latest) if latest else None
            result['decision_count'] = session.scalar(select(func.count()).select_from(DecisionIndex).where(
                DecisionIndex.repo_id == repo_id, DecisionIndex.document_status == 'ready'))
            return result

    def by_alias(self, full_name):
        with Session(self.engine) as session:
            repo = session.scalar(select(Repository).where(func.lower(Repository.full_name) == full_name.lower()))
            return row_dict(repo) if repo else None

    def enqueue(self, repo_id, job_type):
        with Session(self.engine) as session, session.begin():
            repo = session.scalar(select(Repository).where(Repository.repo_id == repo_id).with_for_update())
            if not repo: raise NotFound('Repository not found')
            active = session.scalar(select(IngestionJob).where(IngestionJob.repo_id == repo_id,
                                                             IngestionJob.status.in_(['queued','running'])))
            if active: raise Conflict('Repository already has an active job')
            previous = session.scalar(select(IngestionJob).where(IngestionJob.repo_id == repo_id,
                IngestionJob.status.in_(['partial','failed'])).order_by(IngestionJob.created_at.desc()).limit(1))
            latest = session.scalar(select(IngestionJob).where(IngestionJob.repo_id == repo_id)
                                    .order_by(IngestionJob.created_at.desc()).limit(1))
            resume = previous if previous is not None and latest.job_id == previous.job_id else None
            job = IngestionJob(repo_id=repo_id, job_type=job_type,
                checkpoint=dict(resume.checkpoint) if resume else {},
                sources_scanned=resume.sources_scanned if resume else 0,
                decisions_written=resume.decisions_written if resume else 0,
                retry_count=resume.retry_count + 1 if resume else 0)
            session.add(job)
            repo.ingestion_status = 'queued'
            session.flush()
            return row_dict(job)

    def job(self, job_id):
        with Session(self.engine) as session:
            job = session.get(IngestionJob, job_id)
            if not job: raise NotFound('Job not found')
            return row_dict(job)

    def write_decision(self, repo_id, source_key, candidate_key, decision, messages, extraction,
                       source_updated_at=None):
        """Validate against stored source messages; reuse UUID; publish only after durable Mongo writes."""
        key = topic_key(candidate_key)
        self.repository(repo_id)
        # Never trust caller-provided message text or self-verified model evidence.
        thread_id = f'{repo_id}:{source_key}'
        thread = self.mongo.source_threads.find_one({'_id':thread_id})
        stored = list(self.mongo.source_messages.find({'thread_id': thread_id,
            '_id': {'$in': thread.get('message_ids', []) if thread else []}}))
        trusted = [{**m, 'id': m['_id']} for m in stored]
        validated = validate_decision(Decision.model_validate(decision), trusted).model_dump()
        with self.lock(f'decision:{repo_id}:{source_key}:{key}'):
            # Finish an older interrupted revision before applying a newer source version.
            with Session(self.engine) as recovery:
                previous = recovery.scalar(select(DecisionIndex).where(DecisionIndex.repo_id == repo_id,
                    DecisionIndex.source_key == source_key, DecisionIndex.topic_key == key))
                snapshot = self.mongo.decision_revisions.find_one({'decision_id': str(previous.decision_id),
                    'revision': previous.pending_revision}) if previous and previous.pending_revision else None
            if snapshot and extraction.get('source_hash') and snapshot.get('extraction',{}).get('source_hash') != extraction['source_hash']:
                ident = snapshot.pop('decision_id')
                snapshot['_id'] = ident
                self.mongo.decisions.replace_one({'_id':ident}, snapshot, upsert=True)
                self._publish(ident, snapshot)
            with Session(self.engine) as session, session.begin():
                row = session.scalar(select(DecisionIndex).where(DecisionIndex.repo_id == repo_id,
                    DecisionIndex.source_key == source_key, DecisionIndex.topic_key == key))
                if row is None:
                    row = DecisionIndex(repo_id=repo_id, source_key=source_key, topic_key=key,
                                        title=validated['title'], status=validated['status'])
                    session.add(row)
                    session.flush()
                if row.document_status == 'ready' and row.pending_revision is None and extraction.get('source_hash'):
                    current = self._document(row)
                    if current.get('extraction',{}).get('source_hash') == extraction['source_hash']:
                        return current
                revision = (row.pending_revision or row.published_revision + 1)
                row.pending_revision = revision
                decision_id = str(row.decision_id)
                created_at = row.created_at
            document = {**validated, '_id': decision_id, 'repo_id': repo_id, 'source_key': source_key,
                        'topic_key': key, 'revision': revision, 'extraction': extraction,
                        'source_updated_at': source_updated_at, 'created_at': created_at, 'updated_at': now()}
            try:
                # Retry an interrupted revision with its original contents, not a new interpretation.
                revision_id = f'{decision_id}:{revision}'
                self.mongo.decision_revisions.update_one({'_id': revision_id}, {'$setOnInsert': {
                    **document, '_id': revision_id, 'decision_id': decision_id}}, upsert=True)
                snapshot = self.mongo.decision_revisions.find_one({'_id': revision_id})
                document = {k: v for k, v in snapshot.items() if k != 'decision_id'}
                document['_id'] = decision_id
                self.mongo.decisions.replace_one({'_id': decision_id}, document, upsert=True)
                self._publish(decision_id, document)
            except Exception:
                with Session(self.engine) as session, session.begin():
                    row = session.get(DecisionIndex, UUID(decision_id))
                    if row.published_revision == 0: row.document_status = 'error'
                raise
            return self.decision(UUID(decision_id))

    def _publish(self, decision_id, document):
        with Session(self.engine) as session, session.begin():
            row = session.get(DecisionIndex, UUID(decision_id))
            row.document_status = 'ready'
            row.published_revision = document['revision']
            row.pending_revision = None
            row.title, row.status = document['title'], document['status']
            row.source_updated_at = document.get('source_updated_at')

    def _document(self, row):
        doc = self.mongo.decisions.find_one({'_id': str(row.decision_id), 'repo_id': row.repo_id})
        if not doc: raise DocumentUnavailable('Decision document missing; reconciliation required')
        if doc.get('revision') != row.published_revision:
            doc = self.mongo.decision_revisions.find_one({'decision_id': str(row.decision_id),
                'repo_id': row.repo_id, 'revision': row.published_revision})
            if doc: doc['_id'] = str(row.decision_id)
        if not doc or doc.get('source_key') != row.source_key or doc.get('topic_key') != row.topic_key:
            raise DocumentUnavailable('Decision document identity mismatch')
        return doc

    def decision(self, decision_id):
        with Session(self.engine) as session:
            row = session.get(DecisionIndex, decision_id)
            if not row: raise NotFound('Decision not found')
            if row.document_status != 'ready': raise DocumentUnavailable('Decision not yet available')
            return self._document(row)

    def decisions(self, repo_id, offset=0, limit=30):
        self.repository(repo_id)
        with Session(self.engine) as session:
            rows = session.scalars(select(DecisionIndex).where(DecisionIndex.repo_id == repo_id,
                DecisionIndex.document_status == 'ready').order_by(DecisionIndex.created_at, DecisionIndex.decision_id)
                .offset(offset).limit(limit))
            return [self._document(row) for row in rows]

    def reconcile(self, repair=False):
        """Operator-triggered, bounded-memory scan; never delete unindexed evidence."""
        report = {'missing': [], 'orphaned': [], 'pending': [], 'repaired': []}
        with Session(self.engine) as session:
            for row in session.scalars(select(DecisionIndex).execution_options(yield_per=100)):
                ident = str(row.decision_id)
                doc = self.mongo.decisions.find_one({'_id': ident, 'repo_id': row.repo_id,
                    'source_key': row.source_key, 'topic_key': row.topic_key})
                if doc is None:
                    report['missing'].append(ident)
                if row.pending_revision is not None:
                    report['pending'].append(ident)
                    if repair:
                        with self.lock(f'decision:{row.repo_id}:{row.source_key}:{row.topic_key}'):
                            # Reload after lock; a writer might already have completed.
                            with Session(self.engine) as fresh:
                                current = fresh.get(DecisionIndex, row.decision_id)
                                revision = current.pending_revision
                            snapshot = self.mongo.decision_revisions.find_one({'decision_id': ident,
                                'repo_id': row.repo_id, 'source_key': row.source_key,
                                'topic_key': row.topic_key, 'revision': revision}) if revision else None
                            if snapshot:
                                snapshot['_id'] = ident
                                snapshot.pop('decision_id', None)
                                self.mongo.decisions.replace_one({'_id': ident}, snapshot, upsert=True)
                                self._publish(ident, snapshot)
                                report['repaired'].append(ident)
            for doc in self.mongo.decisions.find({}, {'_id': 1}):
                try: ident = UUID(doc['_id'])
                except (ValueError, TypeError):
                    report['orphaned'].append(str(doc['_id'])); continue
                if session.get(DecisionIndex, ident) is None: report['orphaned'].append(str(ident))
        return report
