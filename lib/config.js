
// Set the configurations
import db from './db.js';

export function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}
export function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config(key, value) VALUES(?, ?)').run(key, String(value));
}