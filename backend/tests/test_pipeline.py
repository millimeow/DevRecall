"""Offline tests mock only the LLM boundary. All discussions here are synthetic."""
import asyncio
import json
from unittest.mock import AsyncMock
import pytest
from fastapi.testclient import TestClient
from app import config, llm
from app.main import app
from app.schemas import Decision, Evidence
from app.evidence import validate_decision, verify

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as client:
        yield client

def imported(client):
    r = client.post('/api/discussions', json={"title": "Synthetic storage discussion", "messages": [
        {"author": "A", "body": "We choose SQLite in src/store.py. Reject flat files because writes race. Reject Redis because persistence requires extra operations."},
        {"author": "B", "body": "Agreed, SQLite is the accepted approach."}]})
    assert r.status_code == 201
    return r.json()

def candidate(payload):
    for d in payload['decisions']:
        approaches = []
        quotes = d.pop('evidence', [])
        outcome = next((e for e in quotes if e['claim_type'] == 'decision_status'), None)
        if outcome:
            approaches.append({'name':d.get('chosen_approach') or 'Candidate', 'status':d['status'], 'reason_is_stated':False, 'message_id':outcome['message_id'], 'quote':outcome['quote']})
        for a in d.pop('alternatives', []):
            e = a['evidence'][0]
            approaches.append({'name':a['name'], 'status':a['status'], 'reason_is_stated':bool(a['reason']), 'message_id':e['message_id'], 'quote':e['quote']})
        d['approaches'] = approaches
        d.setdefault('summary', 'Synthetic discussion summary')
    return payload

def output(d):
    mid = d['messages'][0]['id']
    def ev(quote, claim):
        return {"message_id": mid, "quote": quote, "claim_type": claim}
    return candidate({"decisions": [{"title": "Storage", "question": "Which storage should we use?", "chosen_approach": "SQLite", "status": "accepted", "summary": "SQLite selected.", "confidence": "high", "code_refs": ["src/store.py", "invented.py"], "evidence": [ev("We choose SQLite in src/store.py.", "decision_status"), ev("We choose SQLite in src/store.py.", "chosen_approach")], "alternatives": [{"name": "Flat files", "status": "rejected", "reason": "Writes race", "evidence": [ev("Reject flat files because writes race.", "alternative_status"), ev("Reject flat files because writes race.", "rejection_reason")]}, {"name": "Redis", "status": "rejected", "reason": "Extra operations", "evidence": [ev("Reject Redis because persistence requires extra operations.", "alternative_status"), ev("Reject Redis because persistence requires extra operations.", "rejection_reason")]}]}]})

def test_import_validation_and_stable_ids(client):
    assert client.post('/api/discussions', json={"title": "Empty"}).status_code == 422
    assert client.post('/api/discussions', json={"title": " ", "raw_text": "text"}).status_code == 422
    assert client.post('/api/discussions', json={"title":"x", "raw_text":"text", "source_url":"javascript:alert(1)"}).status_code == 422
    d = imported(client)
    assert client.get('/api/discussions/' + d['id']).json()['messages'] == d['messages']
    assert client.get('/api/discussions/missing').status_code == 404

def test_quote_validation():
    messages = [{"id":"m1", "body":"Reject flat files\nbecause writes race.", "source_url":"https://example.org/thread", "author":"A"}]
    good = Evidence(message_id="m1",quote="flat files because writes race.")
    bad = Evidence(message_id="m1",quote="Flat files are perfect.")
    missing = Evidence(message_id="made-up",quote="writes race.")
    assert [e.verified for e in verify([good,bad,missing],messages)] == [True,False,False]
    assert good.source_url == "https://example.org/thread"

def test_unsupported_assertions_are_removed():
    d = Decision(title="Storage", status="accepted", chosen_approach="SQLite", alternatives=[{"name":"Redis","status":"rejected","reason":"invented"}])
    result = validate_decision(d, [])
    assert result.status == 'uncertain' and result.chosen_approach is None
    assert result.alternatives[0].status == 'uncertain' and result.alternatives[0].reason is None
    assert result.uncertainties and result.confidence == 'low'

def test_genuine_but_unrelated_quote_cannot_support_a_reason():
    d = Decision(title="Storage", alternatives=[{"name":"Redis", "status":"rejected", "reason":"It requires a separate server", "evidence":[
        {"message_id":"m1", "quote":"We could use Redis or SQLite.", "claim_type":"alternative_status"},
        {"message_id":"m1", "quote":"We could use Redis or SQLite.", "claim_type":"rejection_reason"}]}])
    result = validate_decision(d, [{"id":"m1", "body":"We could use Redis or SQLite."}])
    assert result.alternatives[0].reason is None
    assert result.uncertainties

def test_code_example_and_proposal_are_not_confirmed_outcomes():
    d = Decision(title="Type hints", status="accepted", chosen_approach="String annotations", evidence=[
        {"message_id":"m1", "quote":"def f(x: 'Foo|int'): pass", "claim_type":"decision_status"},
        {"message_id":"m1", "quote":"def f(x: 'Foo|int'): pass", "claim_type":"chosen_approach"}], alternatives=[
        {"name":"Redis", "status":"rejected", "evidence":[{"message_id":"m2", "quote":"We could consider Redis.", "claim_type":"alternative_status"}]}])
    result=validate_decision(d,[{"id":"m1","body":"def f(x: 'Foo|int'): pass"},{"id":"m2","body":"We could consider Redis."}])
    assert result.status=='uncertain' and result.chosen_approach is None
    assert result.alternatives[0].status=='uncertain'

def test_pipeline_search_export_and_storage(client, monkeypatch):
    d = imported(client)
    monkeypatch.setattr(llm, 'generate', AsyncMock(return_value=output(d)))
    r = client.post(f"/api/discussions/{d['id']}/analyze")
    assert r.status_code == 200, r.text
    decision = r.json()['decisions'][0]
    assert decision['status'] == 'accepted'
    assert decision['code_refs'] == ['src/store.py']
    assert all(e['verified'] for e in decision['evidence'])
    assert len(client.get('/api/search?q=Redis').json()) == 1
    assert client.get('/api/decisions/' + decision['id']).status_code == 200
    assert 'Storage' in client.get(f"/api/discussions/{d['id']}/export?format=markdown").text
    assert len(client.post('/api/pr-context',json={'paths':['src/store.py']}).json()) == 1
    assert client.post('/api/pr-context',json={'paths':['src/other.py']}).json() == []
    # Opening a new connection preserves source IDs and decisions.
    assert client.get(f"/api/discussions/{d['id']}/decisions").json()[0]['id'] == decision['id']
    assert client.get('/api/discussions').json()[0]['decision_count'] == 1

def test_offline_model_and_failed_rerun_keeps_previous(client, monkeypatch):
    d = imported(client)
    monkeypatch.setattr(llm, 'generate', AsyncMock(return_value=output(d)))
    assert client.post(f"/api/discussions/{d['id']}/analyze").status_code == 200
    monkeypatch.setattr(llm, 'generate', AsyncMock(side_effect=llm.ModelUnavailable('Ollama is offline')))
    assert client.post(f"/api/discussions/{d['id']}/analyze").status_code == 503
    saved = client.get('/api/discussions/' + d['id']).json()
    assert saved['runs'][0]['status'] == 'failed'
    assert len(client.get(f"/api/discussions/{d['id']}/decisions").json()) == 1

def test_invalid_json_retries_once(client, monkeypatch):
    d = imported(client)
    mocked = AsyncMock(side_effect=[ValueError('bad JSON'), output(d), {'decisions':[]}])
    monkeypatch.setattr(llm, 'generate', mocked)
    assert client.post(f"/api/discussions/{d['id']}/analyze").status_code == 200
    assert mocked.call_count == 3  # repair retry, then the focused rejection pass

def test_cross_chunk_disagreement_is_preserved(monkeypatch):
    from app.extraction import extract
    m1 = {"id":"m1", "body":"SQLite is accepted. " + 'a'*13000}
    m2 = {"id":"m2", "body":"SQLite remains contested. " + 'b'*13000}
    a = {"decisions":[{"title":"Storage","question":"Which storage?","status":"accepted","evidence":[{"message_id":"m1","quote":"SQLite is accepted.","claim_type":"decision_status"}]}]}
    b = {"decisions":[{"title":"Storage","question":"Which storage?","status":"contested","evidence":[{"message_id":"m2","quote":"SQLite remains contested.","claim_type":"decision_status"}]}]}
    first, second = candidate(a), candidate(b)
    monkeypatch.setattr(llm,'generate',AsyncMock(side_effect=[first, {'decisions':[]}, second, {'decisions':[]}]))
    results = asyncio.run(extract([m1,m2]))
    assert len(results)==1 and results[0].status=='contested'
    assert {e.message_id for e in results[0].evidence} == {'m1', 'm2'}

def test_ask_abstains_and_checks_citations(client,monkeypatch):
    assert client.post('/api/ask',json={'question':'Why SQLite?'}).json()['citations']==[]
    d=imported(client)
    monkeypatch.setattr(llm,'generate',AsyncMock(return_value=output(d)))
    client.post(f"/api/discussions/{d['id']}/analyze")
    monkeypatch.setattr(llm,'generate',AsyncMock(return_value={'answer':'Redis costs more','supporting_message_ids':['fake'],'evidence':[]}))
    assert client.post('/api/ask',json={'question':'Why Redis?'}).json()['answer'].startswith("I couldn't verify")
    mid=d['messages'][0]['id']
    monkeypatch.setattr(llm,'generate',AsyncMock(return_value={'answer':'Flat files were rejected because writes race.','supporting_message_ids':[mid],'evidence':[{'message_id':mid,'quote':'Reject flat files because writes race.'}]}))
    result=client.post('/api/ask',json={'question':'Why flat files?'}).json()
    assert len(result['citations'])==1 and result['citations'][0]['verified']

def test_ask_retrieves_original_messages_even_when_extraction_missed_them(client,monkeypatch):
    d=imported(client)
    mid=d['messages'][0]['id']
    monkeypatch.setattr(llm,'generate',AsyncMock(return_value={'answer':'Redis would require extra operations.','supporting_message_ids':[mid],'evidence':[{'message_id':mid,'quote':'Reject Redis because persistence requires extra operations.'}]}))
    result=client.post('/api/ask',json={'question':'Why Redis?', 'discussion_id':d['id']}).json()
    assert result['citations'][0]['verified'] is True
    assert result['supporting_message_ids']==[mid]

def test_oversized_model_message_is_actionable(client,monkeypatch):
    d=client.post('/api/discussions',json={'title':'Long','raw_text':'x'*23000}).json()
    mocked=AsyncMock()
    monkeypatch.setattr(llm,'generate',mocked)
    r=client.post(f"/api/discussions/{d['id']}/analyze")
    assert r.status_code==422 and 'Split' in r.json()['detail']
    mocked.assert_not_called()

def test_health_and_public_github_validation(client,monkeypatch):
    monkeypatch.setattr(llm,'health',AsyncMock(return_value={'available':False,'name':'test','provider':'Ollama'}))
    assert client.get('/api/health').json()['model']['available'] is False
    assert client.post('/api/github/import',json={'url':'http://localhost/private'}).status_code==400
