from contextlib import asynccontextmanager
from uuid import UUID, uuid4
import re
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from pymongo.errors import PyMongoError
from app.config import Settings
from app.db.connections import postgres_engine, mongo_client, mongo_database
from app.services.provider import UnconfiguredProvider, ModelUnavailable
from app.services.store import Store, NotFound, Conflict, DocumentUnavailable
from app.schemas import DiscussionInput, Extraction, Answer
from app.services.github import GitHubClient, GitHubError
from app.evidence import validate_decision, verify

class RepositoryInput(BaseModel):
    url: str = Field(max_length=2000)

class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

class PRContextRequest(BaseModel):
    repo_id: int = Field(gt=0)
    paths: list[str] = Field(min_length=1, max_length=200)

def parse_repository_url(url):
    match = re.fullmatch(r'https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/?', url.strip())
    if not match or any(part in ('.', '..') for part in match.groups()):
        raise ValueError('Use https://github.com/owner/repository')
    owner, name = match.groups()
    if name.endswith('.git'): name = name[:-4]
    if not name: raise ValueError('Repository name is required')
    return f'{owner}/{name}'

def create_app(settings=None, store=None, provider=None, resolver=None):
    settings = settings or Settings()
    provider = provider or UnconfiguredProvider(settings)
    owned_engine = owned_client = None
    github = GitHubClient(settings.github_token) if resolver is None else None
    resolver = resolver or github.resolve
    if store is None and settings.postgres_url and settings.mongo_uri:
        owned_engine = postgres_engine(settings.postgres_url)
        owned_client = mongo_client(settings.mongo_uri)
        store = Store(owned_engine, mongo_database(owned_client, settings.mongo_database))

    @asynccontextmanager
    async def lifespan(app):
        yield
        if owned_engine is not None: owned_engine.dispose()
        if owned_client is not None: owned_client.close()
        if github is not None: github.close()

    app = FastAPI(title='DevRecall', version='0.3.0', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5173','http://localhost:5173'],
                       allow_methods=['GET','POST'], allow_headers=['Content-Type'])

    def database():
        if store is None: raise DocumentUnavailable('database_not_configured')
        return store

    for error, status, code in [(NotFound,404,'not_found'), (Conflict,409,'conflict'),
                               (DocumentUnavailable,503,'document_unavailable'),
                               (ModelUnavailable,503,'model_unavailable')]:
        def handler(request, exc, status=status, code=code):
            return JSONResponse(status_code=status, content={'error': {'code': code, 'message': str(exc)}})
        app.add_exception_handler(error, handler)

    def db_error(request, exc):
        return JSONResponse(status_code=503, content={'error': {'code': 'database_unavailable',
            'message': 'Database operation failed. Retry after checking database health.'}})
    app.add_exception_handler(SQLAlchemyError, db_error)
    app.add_exception_handler(PyMongoError, db_error)
    @app.exception_handler(GitHubError)
    def github_error(request, exc):
        return JSONResponse(status_code=exc.status, content={'error':{'code':exc.code,'message':exc.code}})

    @app.get('/api/health')
    def health():
        states = {'postgresql': 'not_configured', 'mongodb': 'not_configured'}
        if store:
            try:
                with store.engine.connect() as conn: conn.execute(text('SELECT 1'))
                states['postgresql'] = 'ok'
            except SQLAlchemyError: states['postgresql'] = 'unavailable'
            try:
                store.mongo.command('ping')
                states['mongodb'] = 'ok'
            except PyMongoError: states['mongodb'] = 'unavailable'
        return {'status': 'ok' if all(s == 'ok' for s in states.values()) else 'degraded',
                **states, 'model': provider.health()}

    @app.post('/api/repositories')
    def register(data: RepositoryInput):
        try: alias = parse_repository_url(data.url)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={'error': {'code':'invalid_url','message':str(exc)}})
        db = database()
        known = db.by_alias(alias)
        if known: return {**db.repository(known['repo_id']), 'cached': True}
        metadata = resolver(alias)
        try:
            db.repository(metadata['repo_id'])
            cached = True
        except NotFound: cached = False
        repo = db.register_repository(metadata)
        if cached: return {**repo, 'cached': True}
        model = provider.health()
        if not model['available']:
            return {**repo, 'cached':False, 'analysis_state':model['state']}
        job = db.enqueue(repo['repo_id'], 'initial')
        from fastapi.encoders import jsonable_encoder
        return JSONResponse(status_code=202, content=jsonable_encoder({**repo, 'cached':False, 'job':job}))

    @app.get('/api/repositories/{repo_id}')
    def repository(repo_id: int): return database().repository(repo_id)

    @app.get('/api/repositories/{repo_id}/decisions')
    def decisions(repo_id: int, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
        return database().decisions(repo_id, offset, limit)

    @app.get('/api/decisions/{decision_id}')
    def decision(decision_id: UUID): return database().decision(decision_id)

    @app.get('/api/jobs/{job_id}')
    def job(job_id: UUID): return database().job(job_id)

    @app.post('/api/repositories/{repo_id}/sync', status_code=202)
    def sync(repo_id: int):
        db = database()
        db.repository(repo_id)
        if not provider.health()['available']: raise ModelUnavailable(provider.health()['state'])
        return db.enqueue(repo_id, 'manual_sync')

    @app.get('/api/repositories/{repo_id}/search')
    def search(repo_id: int, q: str = Query('', max_length=2000), limit: int = Query(30, ge=1, le=100)):
        db = database()
        db.repository(repo_id)
        # Query rich content in Mongo, then enforce SQL ownership/readiness for every hit.
        filters = {'repo_id':repo_id}
        if q.strip():
            expression = {'$regex':re.escape(q.strip()),'$options':'i'}
            filters['$or'] = [{field:expression} for field in
                ['title','question','chosen_approach','summary','alternatives.name','alternatives.reason','rationales.text']]
        found = []
        for doc in db.mongo.decisions.find(filters, {'_id':1}).limit(500):
            try: found.append(db.decision(UUID(doc['_id'])))
            except (NotFound,DocumentUnavailable): continue
            if len(found) == limit: break
        return found

    @app.get('/api/repositories/{repo_id}/messages/{message_id:path}')
    def message(repo_id: int, message_id: str):
        db = database()
        db.repository(repo_id)
        value = db.mongo.source_messages.find_one({'_id':message_id})
        if not value or not value.get('thread_id','').startswith(f'{repo_id}:'):
            raise NotFound('Source message not found')
        return value

    @app.post('/api/repositories/{repo_id}/ask')
    def ask(repo_id: int, data: AskRequest):
        db = database()
        db.repository(repo_id)
        if not provider.health()['available']: raise ModelUnavailable(provider.health()['state'])
        evidence = []
        for decision in search(repo_id,data.question,10):
            evidence.extend(decision.get('evidence',[]))
            for alternative in decision.get('alternatives',[]): evidence.extend(alternative.get('evidence',[]))
            for rationale in decision.get('rationales',[]): evidence.extend(rationale.get('evidence',[]))
        evidence = [e for e in evidence if e.get('verified')][:30]
        abstain = {'answer':"I couldn't verify that from the available discussion.", 'citations':[]}
        if not evidence: return abstain
        answer = Answer.model_validate(provider.answer(data.question,evidence))
        supplied = [{'id':e['message_id'],'body':e['quote'],'source_url':e.get('source_url'),
                     'author':e.get('author')} for e in evidence]
        # Verify each citation against any excerpt for that ID, never a broader message the model did not see.
        for citation in answer.evidence:
            matches = [m for m in supplied if m['id']==citation.message_id and citation.quote in m['body']]
            verify([citation], matches[:1])
        cited = {e.message_id for e in answer.evidence if e.verified}
        if not cited or any(not e.verified for e in answer.evidence) or not answer.supporting_message_ids or any(
            ident not in cited for ident in answer.supporting_message_ids): return abstain
        return {'answer':answer.answer,'citations':[e.model_dump() for e in answer.evidence],
                'uncertainty_note':answer.uncertainty_note}

    @app.post('/api/pr-context')
    def pr_context(data: PRContextRequest):
        db = database()
        db.repository(data.repo_id)
        paths = {p.removeprefix('./').replace('\\','/') for p in data.paths}
        result = []
        for doc in db.mongo.decisions.find({'repo_id':data.repo_id,'code_refs':{'$in':list(paths)}}).limit(100):
            try: decision = db.decision(UUID(doc['_id']))
            except (NotFound,DocumentUnavailable): continue
            matched = sorted(paths.intersection(decision.get('code_refs',[])))
            if matched: result.append({'decision':decision,'matched_paths':matched,
                'reason':'Exact match to a path in verified source evidence.'})
        return result

    @app.post('/api/evaluations/analyze')
    def evaluate(data: DiscussionInput):
        # A transient, standalone discussion-only path. No GitHub lookup or invented repository ID.
        messages = [m.model_dump() for m in data.messages] if data.messages else [{'body': data.raw_text}]
        run_id = str(uuid4())
        messages = [{**m, 'id': f'{run_id}:msg_{i+1:04}',
                     'source_url': m.get('source_url') or data.source_url} for i, m in enumerate(messages)]
        output = Extraction.model_validate(provider.extract_decisions(messages, {'title':data.title,
                                            'mode':'discussion_only', 'run_id':run_id}))
        decisions = [validate_decision(d, messages).model_dump() for d in output.decisions]
        return {'run_id':run_id, 'persisted':False, 'messages':messages,
                'decisions':decisions, 'model':provider.health()}
    return app

app = create_app()
