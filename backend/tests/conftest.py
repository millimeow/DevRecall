import os
from uuid import uuid4
from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from app.db.connections import postgres_engine, mongo_client, mongo_database, ensure_indexes
from app.services.store import Store

@pytest.fixture
def store(monkeypatch):
    url = os.getenv('TEST_POSTGRES_DATABASE_URL')
    uri = os.getenv('TEST_MONGODB_URI')
    if not url or not uri:
        if os.getenv('REQUIRE_DB_TESTS') == '1': pytest.fail('Both test database URLs are required')
        pytest.skip('Set TEST_POSTGRES_DATABASE_URL and TEST_MONGODB_URI for real database tests')
    # Only a disposable database whose name ends in _test is accepted.
    from sqlalchemy.engine import make_url
    if not make_url(url).database.endswith('_test'):
        pytest.fail('TEST_POSTGRES_DATABASE_URL must name a disposable *_test database')
    monkeypatch.setenv('POSTGRES_DATABASE_URL', url)
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    command.upgrade(config, 'head')
    engine = postgres_engine(url)
    with engine.begin() as conn:
        conn.execute(text('TRUNCATE decisions, source_index, ingestion_jobs, repositories CASCADE'))
    client = mongo_client(uri)
    name = f'devrecall_test_{uuid4().hex}'
    db = mongo_database(client, name)
    ensure_indexes(db)
    yield Store(engine, db)
    client.drop_database(name)
    client.close()
    engine.dispose()
