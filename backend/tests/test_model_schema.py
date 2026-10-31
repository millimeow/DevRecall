from app.llm import output_schema
from app.schemas import ModelExtraction, Answer

def test_model_must_fill_decision_structure_and_cannot_verify_itself():
    schema = output_schema(ModelExtraction)
    decision = schema['$defs']['ModelDecision']
    assert set(decision['required']) == set(decision['properties'])
    assert {'approaches', 'summary', 'question'} <= set(decision['required'])
    alternative = schema['$defs']['ModelApproach']
    assert {'name', 'status', 'reason_is_stated', 'message_id', 'quote'} <= set(alternative['required'])
    assert not {'verified', 'source_url', 'author'} & set(alternative['properties'])
    assert alternative['additionalProperties'] is False

def test_answer_schema_requires_quotes_and_ids():
    schema = output_schema(Answer)
    assert {'evidence', 'supporting_message_ids', 'answer', 'uncertainty_note'} == set(schema['required'])
