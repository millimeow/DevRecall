import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

export const now = () => new Date().toISOString();

export function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=20000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS discussions (id TEXT PRIMARY KEY, title TEXT NOT NULL, source_type TEXT, source_url TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, discussion_id TEXT REFERENCES discussions(id), author TEXT, body TEXT NOT NULL, source_url TEXT, created_at TEXT, sequence_number INTEGER);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, discussion_id TEXT REFERENCES discussions(id), model_name TEXT, model_provider TEXT, status TEXT, error_message TEXT, created_at TEXT, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, discussion_id TEXT REFERENCES discussions(id), run_id TEXT REFERENCES runs(id), payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_discussion ON messages(discussion_id);
    CREATE INDEX IF NOT EXISTS decisions_discussion ON decisions(discussion_id);
  `);
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createStore(db) {
  const store = {
    getDiscussion(id) {
      const row = db.prepare('SELECT * FROM discussions WHERE id=?').get(id);
      if (!row) throw new AppError(404, 'Discussion not found');
      return { ...row, messages: db.prepare('SELECT * FROM messages WHERE discussion_id=? ORDER BY sequence_number').all(id), runs: db.prepare('SELECT * FROM runs WHERE discussion_id=? ORDER BY rowid DESC').all(id) };
    },
    importDiscussion(data) {
      const id = randomUUID();
      const messages = data.messages.length ? data.messages : [{ body: data.raw_text.trim() }];
      transaction(db, () => {
        db.prepare('INSERT INTO discussions VALUES (?,?,?,?,?)').run(id, data.title, data.source_type, data.source_url || null, now());
        const insert = db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?)');
        messages.forEach((m, i) => insert.run(`${id}:msg_${String(i + 1).padStart(4, '0')}`, id, m.author || null, m.body, m.source_url || data.source_url || null, m.created_at || null, i + 1));
      });
      return store.getDiscussion(id);
    },
    listDiscussions() {
      return db.prepare(`SELECT s.*,
        (SELECT count(*) FROM decisions d WHERE d.discussion_id=s.id) decision_count,
        (SELECT count(*) FROM messages m WHERE m.discussion_id=s.id) message_count,
        (SELECT status FROM runs r WHERE r.discussion_id=s.id ORDER BY rowid DESC LIMIT 1) latest_status
        FROM discussions s ORDER BY s.rowid DESC`).all();
    },
    decisions(discussionId) {
      const sql = 'SELECT d.*, s.title discussion_title, s.source_url FROM decisions d JOIN discussions s ON s.id=d.discussion_id';
      const rows = discussionId ? db.prepare(`${sql} WHERE d.discussion_id=? ORDER BY d.rowid DESC`).all(discussionId) : db.prepare(`${sql} ORDER BY d.rowid DESC`).all();
      return rows.map(row => ({ ...row, ...JSON.parse(row.payload), payload: null }));
    },
    messages(discussionId) {
      return discussionId ? db.prepare('SELECT * FROM messages WHERE discussion_id=?').all(discussionId) : db.prepare('SELECT * FROM messages').all();
    },
    startRun(discussionId, model) {
      const id = randomUUID();
      db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?)').run(id, discussionId, model, 'Ollama', 'running', null, now(), null);
      return id;
    },
    finishRun(id, discussionId, results) {
      transaction(db, () => {
        db.prepare('DELETE FROM decisions WHERE discussion_id=?').run(discussionId);
        const insert = db.prepare('INSERT INTO decisions VALUES (?,?,?,?)');
        results.forEach(result => insert.run(randomUUID(), discussionId, id, JSON.stringify(result)));
        db.prepare("UPDATE runs SET status='completed', completed_at=? WHERE id=?").run(now(), id);
      });
    },
    failRun(id, message) { db.prepare("UPDATE runs SET status='failed', error_message=?, completed_at=? WHERE id=?").run(message, now(), id); },
  };
  return store;
}
