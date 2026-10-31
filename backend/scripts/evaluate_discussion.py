"""Discussion-only evaluation. Does not fetch the PEP or invent repository ownership."""
import argparse
import json
from pathlib import Path
import httpx

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--api', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text())
    # Historical fixtures may include review metadata; only discussion fields are sent.
    payload = {k:v for k,v in payload.items() if k in {'title','raw_text','messages','source_url','source_type'}}
    response = httpx.post(args.api.rstrip('/')+'/api/evaluations/analyze',json=payload,timeout=600)
    if not response.is_success:
        raise SystemExit(f'Evaluation failed ({response.status_code}): {response.text}')
    # No output is written when configuration/inference fails.
    Path(args.output).write_text(json.dumps(response.json(),indent=2,ensure_ascii=False)+'\n')

if __name__ == '__main__': main()
