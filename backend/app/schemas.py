from typing import Literal
from pydantic import BaseModel, Field, model_validator

Status = Literal["accepted", "rejected", "proposed", "contested", "uncertain"]

class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=60000)
    author: str | None = Field(default=None, max_length=200)
    source_url: str | None = Field(default=None, max_length=2000)
    created_at: str | None = None

class DiscussionInput(BaseModel):
    model_config = {"extra": "forbid"}
    title: str = Field(min_length=1, max_length=240)
    source_type: Literal["paste", "github_issue", "github_pr", "forum"] = "paste"
    source_url: str | None = Field(default=None, max_length=2000)
    raw_text: str | None = Field(default=None, max_length=200000)
    messages: list[MessageInput] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def content(self):
        self.title = self.title.strip()
        if not self.title or not (self.raw_text and self.raw_text.strip() or self.messages):
            raise ValueError("Add a title and public discussion text or messages.")
        if self.raw_text and self.messages:
            raise ValueError("Use raw_text or messages, not both.")
        if any(not m.body.strip() for m in self.messages):
            raise ValueError("Messages cannot be blank.")
        if sum(len(m.body) for m in self.messages) > 200000:
            raise ValueError("Discussion exceeds 200,000 characters.")
        for url in [self.source_url, *(m.source_url for m in self.messages)]:
            if url and not url.startswith(("https://", "http://")):
                raise ValueError("Source links must use HTTP or HTTPS.")
        return self

class Evidence(BaseModel):
    message_id: str
    quote: str = Field(min_length=1, max_length=600)
    claim_type: Literal["decision_status", "chosen_approach", "alternative_status", "rejection_reason", "rationale", "code_reference"] = "rationale"
    verified: bool = False
    source_url: str | None = None
    author: str | None = None

class Alternative(BaseModel):
    name: str
    status: Status = "uncertain"
    reason: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)

class Rationale(BaseModel):
    text: str
    evidence: list[Evidence] = Field(default_factory=list)
    verified: bool = False

class Decision(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    question: str | None = None
    chosen_approach: str | None = None
    status: Status = "uncertain"
    summary: str = ""
    confidence: Literal["high", "medium", "low"] = "low"
    alternatives: list[Alternative] = Field(default_factory=list)
    rationales: list[Rationale] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    code_refs: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)

class Extraction(BaseModel):
    decisions: list[Decision] = Field(max_length=50)

class ModelApproach(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    status: Status
    reason_is_stated: bool
    message_id: str
    quote: str = Field(min_length=1, max_length=500)

class ModelDecision(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    question: str
    summary: str
    approaches: list[ModelApproach] = Field(max_length=20)
    code_refs: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)

class ModelExtraction(BaseModel):
    decisions: list[ModelDecision] = Field(max_length=30)

class AskInput(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    discussion_id: str | None = None

class Answer(BaseModel):
    answer: str
    supporting_message_ids: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    uncertainty_note: str | None = None

class GitHubInput(BaseModel):
    url: str = Field(max_length=2000)

class ContextInput(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=200)
