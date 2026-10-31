import json
import httpx
from . import config

class ModelUnavailable(Exception):
    pass

def output_schema(model):
    """Require complete candidates without asking the model to grade its own quotes."""
    schema = model.model_json_schema()
    def visit(node):
        if not isinstance(node, dict):
            return
        node.pop("default", None)
        if "properties" in node:
            for field in ("verified", "author", "source_url"):
                node["properties"].pop(field, None)
            node["required"] = list(node["properties"])
            node["additionalProperties"] = False
        for value in node.values():
            if isinstance(value, dict):
                visit(value)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
    visit(schema)
    return schema

async def health():
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{config.OLLAMA_URL}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
            installed = [m["name"] for m in models]
        available = config.MODEL in installed or f"{config.MODEL}:latest" in installed
        selected = next((m for m in models if m["name"] in (config.MODEL, f"{config.MODEL}:latest")), {})
        return {"available": available, "name": config.MODEL, "digest": selected.get("digest"), "details": selected.get("details"), "provider": "Ollama", "installed": installed, "error": None if available else f"Install the model: ollama pull {config.MODEL}"}
    except (httpx.HTTPError, ValueError, KeyError):
        return {"available": False, "name": config.MODEL, "provider": "Ollama", "installed": [], "error": "Ollama is offline. Start it with ollama serve."}

async def generate(system, prompt, schema):
    try:
        async with httpx.AsyncClient(timeout=config.TIMEOUT) as client:
            response = await client.post(f"{config.OLLAMA_URL}/api/chat", json={
                "model": config.MODEL, "stream": False, "format": schema,
                "messages": [{"role": "system", "content": system + "\nRequired output JSON schema:\n" + json.dumps(schema)}, {"role": "user", "content": prompt}],
                "options": {"temperature": 0, "num_ctx": 16384, "num_predict": 6000},
            })
            response.raise_for_status()
            return json.loads(response.json()["message"]["content"])
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise ModelUnavailable(f"Model {config.MODEL} is not installed. Run ollama pull {config.MODEL}, then retry; your discussion is saved.") from exc
        raise ModelUnavailable(f"Ollama could not run {config.MODEL}. Check ollama list and available memory.") from exc
    except httpx.HTTPError as exc:
        raise ModelUnavailable("Ollama is offline or timed out. Start ollama serve and retry; your discussion is saved.") from exc
