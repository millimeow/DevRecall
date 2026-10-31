"""Run a real adapter → evidence verification → SQLite → API pipeline; no mocks."""
import argparse
import json
import time
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app import config

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',required=True)
    parser.add_argument('--output',default='examples/sample_output.json')
    args=parser.parse_args()
    payload=json.loads(Path(args.input).read_text())
    start=time.monotonic()
    with TestClient(app) as client:
        health=client.get('/api/health').json()
        if not health['model']['available']:
            raise SystemExit(health['model'].get('error','Model unavailable'))
        created=client.post('/api/discussions',json=payload)
        created.raise_for_status()
        identifier=created.json()['id']
        result=client.post(f'/api/discussions/{identifier}/analyze')
        result.raise_for_status()
        export=client.get(f'/api/discussions/{identifier}/export').json()
    export['runtime']={'model':config.MODEL,'model_digest':health['model'].get('digest'),'model_details':health['model'].get('details'),'provider':'Ollama','elapsed_seconds':round(time.monotonic()-start,2),'input_file':args.input,'real_inference':True}
    Path(args.output).write_text(json.dumps(export,indent=2,ensure_ascii=False)+'\n')
    print(f"Saved {len(export['decisions'])} model-generated decisions to {args.output}")

if __name__=='__main__':
    main()
