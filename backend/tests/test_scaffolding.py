import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app, parse_repository_url
from app.services.provider import UnconfiguredProvider, ModelUnavailable

def test_url_validation_and_no_model():
    for url in ['http://github.com/a/b','https://github.com/a/b/issues/1','https://evil.test/a/b','https://github.com/../b']:
        with pytest.raises(ValueError): parse_repository_url(url)
    assert parse_repository_url('https://github.com/a/b.git/') == 'a/b'
    provider = UnconfiguredProvider(Settings())
    with pytest.raises(ModelUnavailable, match='model_not_configured'): provider.extract_decisions([], {})
    with TestClient(create_app(Settings(postgres_url='',mongo_uri=''))) as client:
        assert client.get('/api/health').json()['status'] == 'degraded'
        assert client.post('/api/evaluations/analyze',json={'title':'Test','raw_text':'Public discussion'}).status_code == 503
        assert client.post('/api/evaluations/analyze',json={'title':'Empty'}).status_code == 422

def test_standalone_evaluation_does_not_require_or_fabricate_repo():
    class TestOnlyProvider:
        def health(self): return {'available': True, 'model':'test-only'}
        def extract_decisions(self, messages, context):
            assert context['mode'] == 'discussion_only'
            assert messages[0]['body'] == 'No decision was reached.'
            return {'decisions':[{'title':'Synthetic uncertainty','status':'uncertain'}]}
    with TestClient(create_app(Settings(postgres_url='',mongo_uri=''), provider=TestOnlyProvider())) as client:
        result = client.post('/api/evaluations/analyze', json={'title':'Synthetic','raw_text':'No decision was reached.'}).json()
        assert result['persisted'] is False
        assert 'repo_id' not in result
        assert result['decisions'][0]['status'] == 'uncertain'
