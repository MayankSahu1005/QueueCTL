
// command line logics
import db from './db.js';
import { v4 as uuidv4 } from 'uuid';

function enqueueFromJson(jsonStr) {
  let job;
  try {
    job = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Invalid JSON');
  }
  const id = job.id || uuidv4();
  const command = job.command;
  if (!command) throw new Error('job must have command');
  const now = new Date().toISOString();
  const max_retries = job.max_retries ?? parseInt(db.prepare('SELECT value FROM config WHERE key=?').get('max_retries').value, 10);

  // Always store scheduled_at as a timestamp (number)
  let scheduledAt = Date.now();
  if (job.scheduled_at) {
    // If already a number, use as is; if string, parse
    scheduledAt = typeof job.scheduled_at === 'number' ? job.scheduled_at : new Date(job.scheduled_at).getTime();
  }

  // Get priority from job object or default to 0
  const priority = job.priority ?? 0;

  const stmt = db.prepare(`INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, scheduled_at, priority)
    VALUES (?, ?, 'pending', 0, ?, ?, ?, ?, ?)`);
  stmt.run(id, command, max_retries, now, now, scheduledAt, priority);
  console.log(`Enqueued job ${id}`);
  // Return the job object so callers can inspect the inserted id/fields
  return { id, command, max_retries, priority };
}
export { enqueueFromJson };
