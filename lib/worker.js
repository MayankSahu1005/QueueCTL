const db = require("./db");
const { exec } = require("child_process");
const { getConfig } = require("./config");

/* Run shell command */
function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, stderr });
      else resolve({ ok: true });
    });
  });
}

/* Pick next job atomically */
function pickNext(workerId) {
  return db.transaction(() => {
    const job = db.prepare(
      `SELECT * FROM jobs 
       WHERE state='pending' 
       AND scheduled_at <= ? 
       ORDER BY created_at 
       LIMIT 1`
    ).get(Date.now());

    if (!job) return null;

    db.prepare(
      `UPDATE jobs 
       SET state='processing', worker_id=?, updated_at=? 
       WHERE id=?`
    ).run(workerId, new Date().toISOString(), job.id);

    return job;
  })();
}

/* Process one job */
async function processOne(workerId) {
  const job = pickNext(workerId);
  if (!job) return null;

  console.log(`${workerId} processing ${job.id}`);

  const res = await runCommand(job.command);

  if (res.ok) {
    db.prepare(
      `UPDATE jobs 
       SET state='completed', updated_at=? 
       WHERE id=?`
    ).run(new Date().toISOString(), job.id);

    console.log(`${job.id} completed`);
    return { status: "done" };
  }

  const attempts = job.attempts + 1;
  const max = job.max_retries;
  const base = Number(getConfig("backoff_base") || 2);
  const delay = Math.pow(base, attempts) * 1000;

  if (attempts > max) {
    db.prepare(
      `UPDATE jobs SET state='dead', updated_at=? WHERE id=?`
    ).run(new Date().toISOString(), job.id);

    console.log(`${job.id} moved to DLQ`);
    return { status: "dead" };
  }

  db.prepare(
    `UPDATE jobs 
     SET state='pending', attempts=?, scheduled_at=?, updated_at=? 
     WHERE id=?`
  ).run(attempts, Date.now() + delay, new Date().toISOString(), job.id);

  console.log(`${job.id} retry in ${delay / 1000}s`);
  return { status: "retry" };
}

module.exports = { processOne };
