"""Explicit administration only; reading the API never migrates, reconciles, or syncs."""
import argparse
import json
from app.config import Settings
from app.db.connections import postgres_engine, mongo_client, mongo_database, ensure_indexes
from app.services.store import Store

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['indexes','reconcile'])
    parser.add_argument('--repair', action='store_true')
    args = parser.parse_args()
    settings = Settings()
    client = mongo_client(settings.mongo_uri)
    engine = None
    try:
        db = mongo_database(client, settings.mongo_database)
        if args.action == 'indexes':
            ensure_indexes(db)
            print('MongoDB indexes ensured')
        else:
            engine = postgres_engine(settings.postgres_url)
            print(json.dumps(Store(engine, db).reconcile(args.repair), indent=2))
    finally:
        client.close()
        if engine is not None: engine.dispose()

if __name__ == '__main__': main()
