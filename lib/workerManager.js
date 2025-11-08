import { processOne } from "./worker.js";

export class WorkerPool {
  constructor(count) {
    this.count = count;
    this.workers = [];
    this.stopping = false;
    this.gracefulShutdown = false;
  }

  async workerLoop(id) {
    console.log(`${id} started`);
    let currentJob = null;
    let retryingJob = null;

    while (!this.stopping || (this.gracefulShutdown && (currentJob || retryingJob))) {
      if (!this.stopping) {
        currentJob = await processOne(id);
        if (!currentJob) {
          await new Promise((res) => setTimeout(res, 300));
        } else if (currentJob.status === "retry") {
          // Track retrying job
          retryingJob = {
            id: currentJob.jobId,
            attempts: currentJob.attempts,
            maxRetries: currentJob.maxRetries,
            nextAttemptTime: Date.now() + currentJob.nextAttemptIn
          };
          currentJob = null;
        } else {
          currentJob = null;
          retryingJob = null;
        }
      } else if (this.gracefulShutdown) {
        if (currentJob) {
          // Handle active job
          const result = await currentJob;
          if (result?.status === "retry") {
            retryingJob = {
              id: result.jobId,
              attempts: result.attempts,
              maxRetries: result.maxRetries,
              nextAttemptTime: Date.now() + result.nextAttemptIn
            };
          }
          currentJob = null;
        } else if (retryingJob && Date.now() >= retryingJob.nextAttemptTime) {
          // Handle retry during graceful shutdown
          global.isGracefulShutdown = true;
          currentJob = await processOne(id);
          global.isGracefulShutdown = false;
          
          if (!currentJob || currentJob.status === "completed" || currentJob.status === "dead") {
            retryingJob = null;
          }
        } else if (retryingJob) {
          // Wait for retry time
          await new Promise(res => setTimeout(res, 100));
        }
      }
    }

    // Clean up any running process if not in graceful shutdown
    if (!this.gracefulShutdown && runCommand.currentProcess) {
      runCommand.currentProcess.kill();
    }

    console.log(`${id} exiting`);
  }

  start() {
    for (let i = 0; i < this.count; i++) {
      const id = `worker-${Date.now()}-${i}`;
      this.workers.push({
        id,
        promise: this.workerLoop(id)
      });
    }
    console.log(`Started ${this.count} workers`);
  }

  async stop(graceful = true) {
    if (this.stopping) return;
    
    this.gracefulShutdown = graceful;
    this.stopping = true;

    // Mark current jobs as pending if not doing graceful shutdown
    if (!graceful) {
      db.prepare(`
        UPDATE jobs 
        SET state='pending', worker_id=NULL, updated_at=?, scheduled_at=NULL 
        WHERE state='processing'
      `).run(new Date().toISOString());
      
      // Kill any running processes
      if (runCommand.currentProcess) {
        runCommand.currentProcess.kill();
      }
    }

    console.log(`WorkerPool stopping (${graceful ? 'graceful' : 'immediate'})`);

    // Wait for all workers to complete their current jobs (including retries)
    await Promise.all(this.workers.map((w) => w.promise));

    console.log("All workers stopped");
  }
}
