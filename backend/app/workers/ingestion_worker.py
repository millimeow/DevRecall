import argparse
import time
from app.config import Settings
from app.db.connections import postgres_engine, mongo_client, mongo_database
from app.services.store import Store
from app.services.github import GitHubClient
from app.services.provider import UnconfiguredProvider
from app.services.ingestion import IngestionWorker

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    settings = Settings()
    engine = postgres_engine(settings.postgres_url)
    client = mongo_client(settings.mongo_uri)
    github = GitHubClient(settings.github_token)
    worker = IngestionWorker(Store(engine,mongo_database(client,settings.mongo_database)),
                             github,UnconfiguredProvider(settings))
    try:
        while True:
            worker.run_one()
            if args.once: break
            time.sleep(2)
    finally:
        github.close(); client.close(); engine.dispose()

if __name__ == '__main__': main()
