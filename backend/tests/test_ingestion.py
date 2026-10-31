import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import Settings
from app.main import create_app
from app.services.github import GitHubClient, GitHubError, ScanLimit
from app.services.ingestion import IngestionWorker
from app.db.models import SourceIndex

class TestProvider:
    __test__ = False
    def __init__(self): self.calls = 0
    def health(self): return {'available':True,'provider':'test-only','model':'synthetic'}
    def extract_decisions(self,messages,context):
        self.calls += 1
        return {'decisions':[{'topic_key':'explicit-storage-question','title':'Synthetic test topic',
            'status':'uncertain','uncertainties':['Test provider; no real inference']} ]}

class PublicGitHubFixture:
    def __init__(self): self.calls = []; self.edit = False; self.count = 1
    def __call__(self,request):
        self.calls.append(str(request.url))
        path = request.url.path
        if path == '/repos/public/project':
            return httpx.Response(200,json={'id':100,'owner':{'login':'public'},'name':'project',
                'full_name':'public/project','html_url':'https://github.com/public/project','private':False})
        if path.endswith('/issues'):
            return httpx.Response(200,json=[{'id':500+n,'number':n,'title':'Synthetic public fixture',
                'body':'Edited proposal' if self.edit else 'A proposal', 'user':{'login':'test'},
                'html_url':f'https://github.com/public/project/pull/{n}','updated_at':'2026-10-31T00:00:00Z',
                'pull_request':{}} for n in range(1,self.count+1)])
        return httpx.Response(200,json=[])

@pytest.mark.integration
def test_initial_cache_manual_sync_and_unchanged_hash(store):
    fixture = PublicGitHubFixture()
    github = GitHubClient(transport=httpx.MockTransport(fixture))
    provider = TestProvider()
    with TestClient(create_app(Settings(),store,provider,github.resolve)) as client:
        first = client.post('/api/repositories',json={'url':'https://github.com/public/project'})
        assert first.status_code == 202
        worker = IngestionWorker(store,github,provider)
        assert worker.run_one()['status'] == 'completed'
        assert provider.calls == 1
        saved = store.decisions(100)[0]
        calls = len(fixture.calls)
        assert client.post('/api/repositories',json={'url':'https://github.com/public/project'}).json()['cached']
        assert client.get('/api/repositories/100/decisions').status_code == 200
        assert len(fixture.calls) == calls and provider.calls == 1
        assert client.post('/api/repositories/100/sync').status_code == 202
        assert client.post('/api/repositories/100/sync').status_code == 409
        assert worker.run_one()['status'] == 'completed'
        assert provider.calls == 1
        fixture.edit = True
        fixture.count = 2
        assert client.post('/api/repositories/100/sync').status_code == 202
        assert worker.run_one()['status'] == 'completed'
        assert provider.calls == 3
        assert store.decisions(100)[0]['_id'] == saved['_id']
        assert store.mongo.source_messages.count_documents({}) == 3
        assert any('/reviews?' in call for call in fixture.calls)
        assert any('/pulls/1/comments?' in call for call in fixture.calls)
    github.close()

@pytest.mark.integration
def test_partial_scan_resumes_only_on_explicit_sync(store):
    fixture = PublicGitHubFixture(); fixture.count = 3
    github = GitHubClient(transport=httpx.MockTransport(fixture))
    provider = TestProvider()
    store.register_repository(github.resolve('public/project'))
    store.enqueue(100,'initial')
    worker = IngestionWorker(store,github,provider,source_budget=1)
    assert worker.run_one()['status'] == 'partial'
    assert worker.run_one() is None
    assert store.repository(100)['last_synced_at'] is None
    store.enqueue(100,'manual_sync')
    assert worker.run_one()['status'] == 'partial'
    store.enqueue(100,'manual_sync')
    assert worker.run_one()['status'] == 'completed'
    assert len(store.decisions(100)) == 3
    assert provider.calls == 3
    github.close()

@pytest.mark.integration
def test_extraction_failure_does_not_advance_source_checkpoint(store):
    fixture = PublicGitHubFixture()
    github = GitHubClient(transport=httpx.MockTransport(fixture))
    class Failing(TestProvider):
        def extract_decisions(self,*args): raise RuntimeError('Synthetic failure')
    store.register_repository(github.resolve('public/project'))
    store.enqueue(100,'initial')
    result = IngestionWorker(store,github,Failing()).run_one()
    assert result['status'] == 'failed' and result['checkpoint'] == {}
    assert store.decisions(100) == []
    with Session(store.engine) as s: assert list(s.scalars(select(SourceIndex))) == []
    assert store.mongo.analysis_runs.find_one({})['state'] == 'failed'
    github.close()

def test_private_rate_limit_and_bounded_pagination():
    private = GitHubClient(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'private':True})))
    with pytest.raises(GitHubError) as err: private.resolve('a/b')
    assert err.value.status == 404
    private.close()
    limited = GitHubClient(transport=httpx.MockTransport(lambda _:httpx.Response(429)))
    with pytest.raises(GitHubError) as err: limited.resolve('a/b')
    assert err.value.status == 429
    limited.close()
    paginated = GitHubClient(max_pages=1,transport=httpx.MockTransport(lambda _:httpx.Response(200,json=[{}]*100)))
    with pytest.raises(ScanLimit): list(paginated.pages('/repos/a/b/issues'))
    paginated.close()
