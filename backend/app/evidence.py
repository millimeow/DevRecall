import re
from .schemas import Decision

def normalize(text):
    return re.sub(r"\s+", " ", text).strip()

def explicit_outcome(name, status, evidence):
    """Conservative English-language guard; matching is not semantic proof."""
    language = r"\b(accept\w*|choos\w*|chose\w*|agreed|proceed|settled|use)\b" if status == "accepted" else r"\b(reject\w*|dislik\w*|oppose\w*|unacceptable|infeasible|against|cannot)\b|not worth|too complex|bad way|can't|won't"
    return any(normalize(name).casefold() in normalize(e.quote).casefold() and re.search(language, e.quote, re.I) for e in evidence)

def verify(evidence, messages):
    by_id = {m["id"]: m for m in messages}
    for e in evidence:
        message = by_id.get(e.message_id)
        e.verified = bool(message and normalize(e.quote) and normalize(e.quote) in normalize(message["body"]))
        e.source_url = message.get("source_url") if message else None
        e.author = message.get("author") if message else None
    return evidence

def validate_decision(decision: Decision, messages):
    verify(decision.evidence, messages)
    verified = [e for e in decision.evidence if e.verified]
    if not any(e.claim_type == "decision_status" for e in verified):
        if decision.status != "uncertain":
            decision.uncertainties.append("Decision outcome lacks verified status evidence.")
        decision.status = "uncertain"
    if decision.chosen_approach and not any(e.claim_type == "chosen_approach" for e in verified):
        decision.chosen_approach = None
        decision.uncertainties.append("Chosen approach was removed: no verified supporting quote.")
    if decision.status == "accepted" and (not decision.chosen_approach or not explicit_outcome(decision.chosen_approach, "accepted", [e for e in verified if e.claim_type == "decision_status"])):
        decision.status, decision.chosen_approach = "uncertain", None
        decision.uncertainties.append("The quoted text does not explicitly name and select the claimed approach; outcome downgraded to uncertain.")
    for alternative in decision.alternatives:
        verify(alternative.evidence, messages)
        valid = [e for e in alternative.evidence if e.verified]
        if not any(e.claim_type == "alternative_status" for e in valid):
            alternative.status = "uncertain"
            decision.uncertainties.append(f"{alternative.name}: outcome lacks verified status evidence.")
        if alternative.status in ("accepted", "rejected") and not explicit_outcome(alternative.name, alternative.status, [e for e in valid if e.claim_type == "alternative_status"]):
            alternative.status = "uncertain"
            decision.uncertainties.append(f"{alternative.name}: quote does not explicitly name this approach with a clear outcome; review the source.")
        reason_type = "rejection_reason" if alternative.status == "rejected" else "rationale"
        if alternative.reason and not any(e.claim_type == reason_type for e in valid):
            alternative.reason = None
            decision.uncertainties.append(f"{alternative.name}: reason removed because its evidence could not be verified.")
        if alternative.reason and not any(normalize(alternative.reason).casefold() in normalize(e.quote).casefold() for e in valid if e.claim_type == reason_type):
            alternative.reason = None
            decision.uncertainties.append(f"{alternative.name}: reason removed because it was not an explanatory excerpt of its cited quote.")
    for rationale in decision.rationales:
        verify(rationale.evidence, messages)
        rationale.verified = any(e.verified for e in rationale.evidence)
    # Code references are retained only when literally present in a verified quote.
    all_evidence = verified + [e for a in decision.alternatives for e in a.evidence if e.verified] + [e for r in decision.rationales for e in r.evidence if e.verified]
    decision.code_refs = [ref for ref in decision.code_refs if any(ref in e.quote for e in all_evidence)]
    if any(not e.verified for e in decision.evidence) or decision.uncertainties:
        decision.confidence = "low"
    if not verified:
        decision.summary = "Insufficient verified evidence. Review the original messages."
    return decision
