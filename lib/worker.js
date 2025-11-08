import db from "./db.js";
import { exec } from "child_process";
import { getConfig } from "./config.js";

//------- Run shell command -----------
function runCommand(cmd) {
  return new Promise((resolve) => {
    const proc = exec(cmd, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, stderr });
      else resolve({ ok: true });
    });
    
    // Allow external cancellation
    runCommand.currentProcess = proc;
  });
}

// Track the currently running command process
runCommand.currentProcess = null;

//----------- Pick next job atomically ----------------
function pickNext(workerId) {
  return db.transaction(() => {
    const job = db.prepare(
      `SELECT * FROM jobs 
       WHERE state='pending' 
       AND (scheduled_at IS NULL OR CAST(scheduled_at AS INTEGER) <= ?)
       ORDER BY 
         priority DESC,                    -- Highest priority first
         CASE 
           WHEN scheduled_at IS NULL THEN 1
           ELSE 0
         END,                             -- Scheduled jobs before non-scheduled
         CAST(scheduled_at AS INTEGER) ASC,                -- Earlier scheduled jobs first
         created_at ASC                   -- Older jobs first within same priority/schedule
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


//-------------------- Process one job ----------------------
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
  const nextScheduledAt = Date.now() + delay;

  if (attempts > max) {
    // Move to DLQ in a transaction
    db.transaction(() => {
      // Update job state to dead
      db.prepare(
        `UPDATE jobs SET state='dead', updated_at=?, last_error=? WHERE id=?`
      ).run(new Date().toISOString(), res.stderr || 'Command failed', job.id);

      // Insert into DLQ table
      db.prepare(`
        INSERT INTO dlq (
          id, command, attempts, max_retries, last_error, created_at, failed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        job.id,
        job.command,
        attempts,
        max,
        res.stderr || 'Command failed',
        job.created_at,
        new Date().toISOString()
      );
    })();

    console.log(`${job.id} moved to DLQ`);
    return { status: "dead", jobId: job.id, error: res.stderr };
  }

  // For retries, we keep the job in 'processing' state during graceful shutdown
  const isGracefulShutdown = global.isGracefulShutdown || false;
  const nextState = isGracefulShutdown ? 'processing' : 'pending';
  
  db.prepare(
    `UPDATE jobs 
     SET state=?, attempts=?, scheduled_at=?, updated_at=?, worker_id=? 
     WHERE id=?`
  ).run(
  nextState,
  attempts,
  nextScheduledAt,
  new Date().toISOString(),
  isGracefulShutdown ? job.worker_id : null,
  job.id
  );

  console.log(`${job.id} retry in ${delay / 1000}s`);
  return { 
    status: "retry",
    jobId: job.id,
    nextAttemptIn: delay,
    attempts: attempts,
    maxRetries: max
  };
}

export { processOne };
