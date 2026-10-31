from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pymongo.errors import AutoReconnect
from fastapi.testclient import TestClient
from app.db.models import Repository, DecisionIndex, IngestionJob, SourceIndex
from app.services.store import Conflict, DocumentUnavailable
from app.main import create_app
from app.config import Settings

pytestmark = pytest.mark.integration

def repo(store, ident=123456789, name='example/project'):
    owner, short = name.split('/')
    return store.register_repository({'repo_id':ident,'owner_login':owner,'name':short,
        'full_name':name,'html_url':f'https://github.com/{name}'})

def write(store, key='storage', title='Storage', ident=123456789):
    return store.write_decision(ident, 'github:issue:42', key,
        {'title':title, 'status':'uncertain','uncertainties':['Synthetic persistence fixture']}, [],
        {'provider':'test-only', 'model':'synthetic', 'run_id':str(uuid4())})

def test_foreign_keys_uniqueness_and_thin_index(store):
    repo(store)
    assert 'alternatives' not in DecisionIndex.__table__.columns
    assert 'body' not in SourceIndex.__table__.columns
    with pytest.raises(IntegrityError), Session(store.engine) as s, s.begin():
        s.add(DecisionIndex(repo_id=999, source_key='x',topic_key='x',title='x',status='uncertain'))
    a = write(store)
    b = write(store, 'different-topic')
    assert UUID(a['_id']) != UUID(b['_id'])
    assert a['repo_id'] == 123456789
    with pytest.raises(IntegrityError), Session(store.engine) as s, s.begin():
        s.add(DecisionIndex(repo_id=123456789, source_key='github:issue:42',topic_key='storage',title='x',status='uncertain'))
    repo(store, 222, 'other/project')
    assert store.decisions(222) == []
    assert len(store.decisions(123456789)) == 2

def test_rename_preserves_id_and_cached_api_never_calls_external_services(store):
    repo(store)
    before = write(store)
    repo(store, name='renamed/project')
    class NeverModel:
        def health(self): raise AssertionError('Cached reads invoked AI')
    def never_resolve(alias): raise AssertionError('Cached reads invoked GitHub')
    with TestClient(create_app(Settings(), store, NeverModel(), never_resolve)) as client:
        assert client.post('/api/repositories', json={'url':'https://github.com/RENAMED/project'}).json()['cached']
        assert client.get('/api/repositories/123456789').json()['repo_id'] == 123456789
        assert client.get('/api/repositories/123456789/decisions').json()[0]['_id'] == before['_id']
        assert client.get('/api/decisions/' + before['_id']).status_code == 200
    with Session(store.engine) as s: assert len(list(s.scalars(select(Repository)))) == 1

def test_retries_and_changed_titles_preserve_uuid_and_history(store):
    repo(store)
    first = write(store)
    second = write(store, title='A new title for the same question')
    assert first['_id'] == second['_id']
    assert second['revision'] == 2
    assert store.mongo.decision_revisions.count_documents({'decision_id':first['_id']}) == 2
    assert store.mongo.decision_revisions.find_one({'revision':1})['title'] == 'Storage'

def test_mongo_failure_is_not_published_and_retry_recovers(store, monkeypatch):
    repo(store)
    original = type(store.mongo.decisions).replace_one
    def fail(*args, **kwargs): raise AutoReconnect('Synthetic injected failure')
    monkeypatch.setattr(type(store.mongo.decisions), 'replace_one', fail)
    with pytest.raises(AutoReconnect): write(store)
    assert store.decisions(123456789) == []
    with Session(store.engine) as s:
        row = s.scalar(select(DecisionIndex))
        assert row.document_status == 'error'
        ident = row.decision_id
    monkeypatch.setattr(type(store.mongo.decisions), 'replace_one', original)
    assert write(store)['_id'] == str(ident)
    assert len(store.decisions(123456789)) == 1

def test_failed_reanalysis_preserves_published_revision(store, monkeypatch):
    repo(store)
    first = write(store)
    original = store._publish
    def fail(*args): raise RuntimeError('Synthetic SQL publication interruption')
    monkeypatch.setattr(store, '_publish', fail)
    with pytest.raises(RuntimeError): write(store, title='Changed')
    assert store.decision(UUID(first['_id']))['title'] == 'Storage'
    monkeypatch.setattr(store, '_publish', original)
    assert store.reconcile(repair=True)['repaired'] == [first['_id']]
    assert store.decision(UUID(first['_id']))['title'] == 'Changed'

def test_reconciliation_missing_orphaned_and_pending(store, monkeypatch):
    repo(store)
    original = type(store.mongo.decisions).replace_one
    def fail(*args, **kwargs): raise AutoReconnect('Synthetic interruption')
    monkeypatch.setattr(type(store.mongo.decisions), 'replace_one', fail)
    with pytest.raises(AutoReconnect): write(store)
    monkeypatch.setattr(type(store.mongo.decisions), 'replace_one', original)
    report = store.reconcile(repair=True)
    assert len(report['repaired']) == 1
    ident = report['repaired'][0]
    store.mongo.decisions.delete_one({'_id':ident})
    with pytest.raises(DocumentUnavailable): store.decision(UUID(ident))
    orphan = str(uuid4())
    store.mongo.decisions.insert_one({'_id':orphan})
    report = store.reconcile()
    assert report['missing'] == [ident]
    assert report['orphaned'] == [orphan]

def test_concurrent_writers_and_job_guard(store):
    repo(store)
    with ThreadPoolExecutor(max_workers=2) as pool:
        docs = list(pool.map(lambda _: write(store), range(2)))
    assert docs[0]['_id'] == docs[1]['_id']
    def enqueue(_):
        try: return store.enqueue(123456789, 'manual_sync')
        except Conflict: return None
    with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(enqueue, range(2)))
    assert sum(r is not None for r in results) == 1
    with pytest.raises(IntegrityError), Session(store.engine) as s, s.begin():
        s.add(IngestionJob(repo_id=123456789,job_type='initial'))

def test_real_health_and_no_model_registration(store):
    with TestClient(create_app(Settings(), store, resolver=lambda _: {
        'repo_id':123456789,'owner_login':'example','name':'project',
        'full_name':'example/project','html_url':'https://github.com/example/project'})) as client:
        health = client.get('/api/health').json()
        assert health['postgresql'] == health['mongodb'] == 'ok'
        assert health['model']['state'] == 'model_not_configured'
        response = client.post('/api/repositories',json={'url':'https://github.com/example/project'})
        assert response.json()['analysis_state'] == 'model_not_configured'
        assert client.post('/api/repositories/123456789/sync').status_code == 503
        assert client.get('/api/jobs/' + str(uuid4())).status_code == 404
        assert client.get('/api/repositories/123456789/decisions?limit=101').status_code == 422
    with Session(store.engine) as s: assert list(s.scalars(select(IngestionJob))) == []

def test_write_uses_only_stored_evidence_not_caller_text(store):
    repo(store)
    document = store.write_decision(123456789,'github:issue:42','topic',
        {'title':'Unsupported', 'status':'accepted','chosen_approach':'X',
         'evidence':[{'message_id':'forged','quote':'We choose X','claim_type':'decision_status','verified':True}]},
        [{'id':'forged','body':'We choose X'}], {})
    assert document['status'] == 'uncertain'
    assert document['evidence'][0]['verified'] is False

def test_new_source_after_interrupted_revision_does_not_publish_stale_content(store, monkeypatch):
    repo(store)
    def save(source_hash,title):
        return store.write_decision(123456789,'github:issue:42','storage',{'title':title},[],{'source_hash':source_hash})
    first = save('old','Old')
    original = store._publish
    monkeypatch.setattr(store,'_publish',lambda *args: (_ for _ in ()).throw(RuntimeError('Interrupted')))
    with pytest.raises(RuntimeError): save('middle','Middle')
    monkeypatch.setattr(store,'_publish',original)
    final = save('new','New')
    assert final['_id'] == first['_id'] and final['title'] == 'New'
    assert final['revision'] == 3
    assert save('new','New')['revision'] == 3


def test_search_source_ask_and_pr_context_are_repo_scoped(store):
    repo(store)
    repo(store,222,'other/project')
    thread_id = '123456789:github:issue:42'
    message_id = thread_id+':comment:1'
    body = 'We choose X in src/store.py. Reject Y because writes race.'
    store.mongo.source_threads.insert_one({'_id':thread_id,'repo_id':123456789,'message_ids':[message_id]})
    store.mongo.source_messages.insert_one({'_id':message_id,'thread_id':thread_id,'body':body,
        'source_url':'https://github.com/example/project/issues/42#issuecomment-1'})
    def evidence(quote,kind): return {'message_id':message_id,'quote':quote,'claim_type':kind}
    data = {'title':'Storage','status':'accepted','chosen_approach':'X','code_refs':['src/store.py','invented.py'],
        'evidence':[evidence('We choose X in src/store.py.','decision_status'),evidence('We choose X in src/store.py.','chosen_approach')],
        'alternatives':[{'name':'Y','status':'rejected','reason':'writes race',
            'evidence':[evidence('Reject Y because writes race.','alternative_status'),evidence('Reject Y because writes race.','rejection_reason')]}]}
    doc = store.write_decision(123456789,'github:issue:42','storage',data,[],{})
    assert doc['code_refs'] == ['src/store.py']
    assert doc['alternatives'][0]['reason'] == 'writes race'
    class TestAnswer:
        def health(self): return {'available':True}
        def answer(self,question,evidence):
            return {'answer':'Unsupported','supporting_message_ids':['fake'],
                'evidence':[{'message_id':'fake','quote':'Not in source'}]}
    with TestClient(create_app(Settings(),store,TestAnswer())) as client:
        assert len(client.get('/api/repositories/123456789/search?q=writes').json()) == 1
        assert client.get('/api/repositories/222/search?q=writes').json() == []
        assert client.get('/api/repositories/222/messages/'+message_id).status_code == 404
        assert client.get('/api/repositories/123456789/messages/'+message_id).json()['body'] == body
        assert len(client.post('/api/pr-context',json={'repo_id':123456789,'paths':['src/store.py']}).json()) == 1
        assert client.post('/api/pr-context',json={'repo_id':222,'paths':['src/store.py']}).json() == []
        assert client.post('/api/repositories/123456789/ask',json={'question':'writes'}).json()['citations'] == []

def test_migration_roundtrip_and_metadata_match(store):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext
    from app.db.models import Base
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    command.downgrade(config,'base')
    command.upgrade(config,'head')
    with store.engine.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection),Base.metadata) == []
