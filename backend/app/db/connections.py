from sqlalchemy import create_engine
from pymongo import MongoClient, ASCENDING
from pymongo.write_concern import WriteConcern

def postgres_engine(url):
    if not url.startswith('postgresql+psycopg://'):
        raise ValueError('POSTGRES_DATABASE_URL must use postgresql+psycopg://')
    return create_engine(url, pool_pre_ping=True, connect_args={'connect_timeout': 5})

def mongo_client(uri):
    return MongoClient(uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000,
                       socketTimeoutMS=10000, tz_aware=True)

def mongo_database(client, name):
    return client.get_database(name, write_concern=WriteConcern(w='majority'))

def ensure_indexes(db):
    db.decisions.create_index([('repo_id', ASCENDING)])
    db.decisions.create_index([('repo_id', 1), ('source_key', 1)])
    db.decisions.create_index([('repo_id', 1), ('source_key', 1), ('topic_key', 1)], unique=True)
    db.source_threads.create_index([('repo_id', 1)])
    db.source_messages.create_index([('thread_id', 1), ('sequence_number', 1)])
    db.analysis_runs.create_index([('repo_id', 1), ('source_key', 1)])
    # Separate revision documents keep growing history out of the 16 MB current-document limit.
    db.decision_revisions.create_index([('decision_id', 1), ('revision', 1)], unique=True)
    db.decision_revisions.create_index([('repo_id', 1)])
