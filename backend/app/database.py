import json
import sqlite3
from contextlib import contextmanager
from . import config

@contextmanager
def connect():
    db = sqlite3.connect(config.DB_PATH, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def init_db():
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS discussions (id TEXT PRIMARY KEY, title TEXT NOT NULL, source_type TEXT, source_url TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, discussion_id TEXT REFERENCES discussions(id), author TEXT, body TEXT NOT NULL, source_url TEXT, created_at TEXT, sequence_number INTEGER);
        CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, discussion_id TEXT REFERENCES discussions(id), model_name TEXT, model_provider TEXT, status TEXT, error_message TEXT, created_at TEXT, completed_at TEXT);
        CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, discussion_id TEXT REFERENCES discussions(id), run_id TEXT REFERENCES runs(id), payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS messages_discussion ON messages(discussion_id);
        CREATE INDEX IF NOT EXISTS decisions_discussion ON decisions(discussion_id);
        ''')

def read_decisions(discussion_id=None):
    with connect() as db:
        rows = db.execute("SELECT d.*, s.title discussion_title, s.source_url FROM decisions d JOIN discussions s ON s.id=d.discussion_id" + (" WHERE d.discussion_id=?" if discussion_id else "") + " ORDER BY d.rowid DESC", (discussion_id,) if discussion_id else ()).fetchall()
    return [{**dict(r), **json.loads(r["payload"]), "payload": None} for r in rows]
