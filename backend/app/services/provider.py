from typing import Protocol

class ModelUnavailable(Exception):
    pass

class AIProvider(Protocol):
    def health(self) -> dict: ...
    def extract_decisions(self, messages: list[dict], context: dict) -> dict: ...
    def answer(self, question: str, evidence: list[dict]) -> dict: ...

class UnconfiguredProvider:
    def __init__(self, settings):
        self.settings = settings

    def health(self):
        configured = bool(self.settings.ai_provider and self.settings.ai_model)
        return {'configured': configured, 'available': False,
                'state': 'adapter_not_implemented' if configured else 'model_not_configured',
                'provider': self.settings.ai_provider or None, 'model': self.settings.ai_model or None}

    def extract_decisions(self, messages, context):
        raise ModelUnavailable(self.health()['state'])

    def answer(self, question, evidence):
        raise ModelUnavailable(self.health()['state'])
