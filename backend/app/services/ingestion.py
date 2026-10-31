"""Durable, explicitly queued work. Page cursors advance only after source publication."""
from datetime import datetime
from hashlib import sha256
import json
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.db.models import Repository, SourceIndex, IngestionJob
from app.services.store import now, Conflict
from app.services.github import ScanLimit
from app.schemas import Decision

def content_hash(value):
    return sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()

class IngestionWorker:
    def __init__(self, store, github, provider, source_budget=50):
        self.store, self.github, self.provider = store, github, provider
        self.source_budget = source_budget

    def run_one(self):
        # A global PostgreSQL advisory lock makes worker restart recovery unambiguous:
        # no second process can classify a live worker's running job as abandoned.
        with self.store.lock('devrecall:ingestion-worker'):
            with Session(self.store.engine) as s, s.begin():
                job = s.scalar(select(IngestionJob).where(IngestionJob.status.in_(['running','queued']))
                    .order_by(IngestionJob.created_at).with_for_update(skip_locked=True).limit(1))
                if not job: return None
                if job.status == 'running': job.retry_count += 1
                job.status, job.started_at = 'running', now()
                s.get(Repository,job.repo_id).ingestion_status = 'processing'
                job_id, repo_id, checkpoint = job.job_id, job.repo_id, dict(job.checkpoint)
            try:
                if not self.provider.health()['available']:
                    raise RuntimeError(self.provider.health()['state'])
                repo = self.store.repository(repo_id)
                # Verify visibility/rename again before fetching source content using a token.
                resolved = self.github.resolve(repo['full_name'])
                if resolved['repo_id'] != repo_id: raise RuntimeError('repository_identity_changed')
                repo = self.store.register_repository(resolved)
                page, position = checkpoint.get('page',1), checkpoint.get('position',0)
                processed = 0
                while processed < self.source_budget:
                    issues = self.github.issue_page(repo['full_name'],page)
                    for index in range(position,len(issues)):
                        if processed >= self.source_budget:
                            raise ScanLimit('Batch limit reached; explicitly Sync Repository to continue')
                        thread, messages = self.github.thread(repo,issues[index])
                        written = self.process_source(repo_id,thread,messages)
                        processed += 1
                        checkpoint = {'page':page,'position':index+1}
                        with Session(self.store.engine) as s, s.begin():
                            job = s.get(IngestionJob,job_id)
                            job.checkpoint = checkpoint
                            job.sources_scanned += 1
                            job.decisions_written += written
                    if len(issues) < 100:
                        with Session(self.store.engine) as s, s.begin():
                            job = s.get(IngestionJob,job_id)
                            job.status, job.completed_at = 'completed', now()
                            job.sources_total = job.sources_scanned
                            repo_row = s.get(Repository,repo_id)
                            repo_row.ingestion_status = 'completed'
                            repo_row.last_synced_at = now()
                            repo_row.sync_state = {'last_completed_job':str(job_id)}
                        return self.store.job(job_id)
                    page, position = page+1, 0
                raise ScanLimit('Batch limit reached; explicitly Sync Repository to continue')
            except Exception as exc:
                # Store controlled error classifications only, never exception strings containing credentials.
                error = str(exc) if isinstance(exc,ScanLimit) else getattr(exc,'code',type(exc).__name__)
                with Session(self.store.engine) as s, s.begin():
                    job = s.get(IngestionJob,job_id)
                    job.status = 'partial' if job.sources_scanned or isinstance(exc,ScanLimit) else 'failed'
                    job.error_summary = error
                    s.get(Repository,repo_id).ingestion_status = job.status
                return self.store.job(job_id)

    def process_source(self, repo_id, thread, messages):
        digest = content_hash({'thread':thread,'messages':messages})
        with Session(self.store.engine) as s:
            previous = s.scalar(select(SourceIndex).where(SourceIndex.repo_id==repo_id,
                                SourceIndex.source_key==thread['source_key']))
            if previous and previous.content_hash == digest and previous.processed_at: return 0
        # Immutable message versions retain exact evidence even when GitHub comments are edited/deleted.
        for message in messages:
            message['_id'] = message['original_id'] + ':' + content_hash(message)[:24]
            self.store.mongo.source_messages.update_one({'_id':message['_id']}, {'$setOnInsert':message}, upsert=True)
        self.store.mongo.source_threads.replace_one({'_id':thread['_id']}, {**thread,
            'content_hash':digest, 'message_ids':[m['_id'] for m in messages]}, upsert=True)
        run_id = str(uuid4())
        model = self.provider.health()
        metadata = {'run_id':run_id,'provider':model.get('provider'),'model':model.get('model'),
                    'schema_version':'2','source_hash':digest}
        self.store.mongo.analysis_runs.insert_one({'_id':run_id,'repo_id':repo_id,
            'source_key':thread['source_key'],**metadata,'state':'running','created_at':now()})
        try:
            normalized = [{**m,'id':m['_id']} for m in messages]
            output = self.provider.extract_decisions(normalized, {'title':thread['title'],
                'source_key':thread['source_key'],'existing_topics':self.existing_topics(repo_id,thread['source_key'])})
            candidates = output['decisions']
            if not isinstance(candidates,list) or len(candidates)>50: raise ValueError('Invalid decision list')
            keys = set()
            for candidate in candidates:
                from app.services.store import topic_key
                key = topic_key(candidate['topic_key'])
                if key in keys: raise ValueError('Duplicate topic key; reconciliation required')
                keys.add(key)
                Decision.model_validate(candidate)
            for candidate in candidates:
                self.store.write_decision(repo_id,thread['source_key'],candidate['topic_key'],candidate,
                    normalized,metadata,datetime.fromisoformat(thread['github_updated_at'].replace('Z','+00:00')))
            self.store.mongo.analysis_runs.update_one({'_id':run_id},{'$set':{'state':'completed',
                'completed_at':now(),'evidence_validation':{'performed':True,'decisions':len(candidates)}}})
            values = {'repo_id':repo_id,'source_key':thread['source_key'],'kind':thread['kind'],
                'external_id':thread['external_id'],'source_url':thread['source_url'],
                'github_updated_at':datetime.fromisoformat(thread['github_updated_at'].replace('Z','+00:00')),
                'content_hash':digest,'processed_at':now()}
            with Session(self.store.engine) as s, s.begin():
                stmt = insert(SourceIndex).values(**values)
                s.execute(stmt.on_conflict_do_update(constraint='uq_repo_source',set_=values))
            return len(candidates)
        except Exception as exc:
            self.store.mongo.analysis_runs.update_one({'_id':run_id},{'$set':{'state':'failed',
                'error':type(exc).__name__,'completed_at':now()}})
            raise

    def existing_topics(self,repo_id,source_key):
        from app.db.models import DecisionIndex
        with Session(self.store.engine) as s:
            return [{'topic_key':r.topic_key,'title':r.title} for r in s.scalars(select(DecisionIndex).where(
                DecisionIndex.repo_id==repo_id,DecisionIndex.source_key==source_key))]
