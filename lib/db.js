
// Database Initiations and Schema for job and DLQ

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');


const DB_PATH = path.join(__dirname, '..', 'data', 'queue.db');
fs.mkdirSync(path.dirname(DB_PATH), {recursive: true});

const db  = new Database(DB_PATH);


// Database schema
// Create Table for job
db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL DEFAULT 0,
  timeout INTEGER NOT NULL DEFAULT 30000,
  worker_id TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dlq (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  max_retries INTEGER NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  failed_at TEXT NOT NULL
);
`);

// default config values
const setIfMissing = db.prepare('INSERT OR IGNORE INTO config(key, value) VALUES(?, ?)');
setIfMissing.run('max_retries', '3');
setIfMissing.run('backoff_base', '2');

// Ensure existing databases get the new column without a separate migration file
try {
  const cols = db.prepare("PRAGMA table_info(jobs)").all();
  const hasTimeout = cols.some(c => c.name === 'timeout');
  if (!hasTimeout) {
    try {
      db.prepare('ALTER TABLE jobs ADD COLUMN timeout INTEGER DEFAULT 30000;').run();
      console.log('✅ Column "timeout" added to jobs (runtime ALTER).');
    } catch (err) {
      // If ALTER fails for reasons other than duplicate column, surface it
      if (!/duplicate column name/i.test(err.message)) {
        console.error('❌ Failed to add timeout column at startup:', err.message);
      }
    }
  }
} catch (e) {
  // PRAGMA might fail if DB is corrupt; ignore to avoid crashing startup
}

module.exports = db;