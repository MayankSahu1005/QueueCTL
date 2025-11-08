import { processOne } from "./worker.js";

export class WorkerPool {
  constructor(count) {
    this.count = count;
    this.workers = [];
    this.stopping = false;
  }

  async workerLoop(id) {
    console.log(`${id} started`);

    while (!this.stopping) {
      const result = await processOne(id);
      if (!result) {
        await new Promise((res) => setTimeout(res, 300));
      }
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

  async stop() {
    if (this.stopping) return;  
    this.stopping = true;

    console.log("WorkerPool stopping");

    await Promise.all(this.workers.map((w) => w.promise));

    console.log("All workers stopped");
  }
}
