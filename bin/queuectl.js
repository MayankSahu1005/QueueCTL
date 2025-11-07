#!/usr/bin/env node

const { Command } = require("commander");
const program = new Command();
const { enqueueFromJson } = require("../lib/cli");
const WorkerPool = require("../lib/workerManager");
const db = require("../lib/db");
const { setConfig, getConfig } = require("../lib/config");

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

/* -------------------------------------------------------
   LOG REDIRECTION (WORKS IN ALL MODES)
--------------------------------------------------------- */
function redirectLogs(logFilePath) {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });

  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

  const origLog = console.log;
  const origErr = console.error;

  console.log = (...args) => {
    const msg = args.join(" ");
    // Always write a timestamped entry to the log file
    logStream.write(`[LOG ${new Date().toISOString()}] ${msg}\n`);
    // Only print to the original stdout when interactive to avoid double-writing
    if (process.stdout && process.stdout.isTTY) {
      origLog(msg);
    }
  };

  console.error = (...args) => {
    const msg = args.join(" ");
    logStream.write(`[ERR ${new Date().toISOString()}] ${msg}\n`);
    if (process.stderr && process.stderr.isTTY) {
      origErr(msg);
    }
  };

  process.on("exit", () => {
    logStream.end();
  });
}

/* -------------------------------------------------------
   CLI SETUP
--------------------------------------------------------- */

program
  .name("queuectl")
  .description("Background job queue system")
  .version("1.0.0");

/* -------------------------------------------------------
   ENQUEUE
--------------------------------------------------------- */

program
  .command("enqueue")
  .argument("<input>", "JSON string or path to JSON file")
  .description("Add a job to the queue")
  .action(async (input) => {
    try {
      let json = input;

      if (fs.existsSync(input) && input.endsWith(".json")) {
        json = fs.readFileSync(input, "utf8");
      }

      const job = enqueueFromJson(json);
      const inserted = db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id);

      console.log("\n✅ Job successfully enqueued!\n");
      console.table([inserted]);
    } catch (e) {
      console.error("❌ Failed to enqueue job:", e.message);
      process.exit(1);
    }
  });

/* -------------------------------------------------------
   WORKER START / STOP (WINDOWS SAFE)
--------------------------------------------------------- */

program
  .command("worker")
  .argument("<action>", "start|stop")
  .option("--count <n>", "number of workers", "1")
  .option("--daemon", "run workers in background")
  .description("Start or stop worker processes")
  .action(async (action, opts) => {
    const dataDir = path.join(__dirname, "..", "data");
    const pidFile = path.join(dataDir, "worker.pid");
    const logFile = path.join(dataDir, "worker.log");
    const stopFile = path.join(dataDir, "worker.stop");

    /* -------------------------------
       STOP WORKERS (Windows safe)
    --------------------------------*/
    if (action === "stop") {
      console.log("🛑 Stopping workers...");

      // create stop signal file
      fs.writeFileSync(stopFile, "stop");

      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);

      console.log("✅ Stop signal sent (worker.stop created).");
      console.log("Workers will shut down gracefully and log stop event.");
      return;
    }

    /* -------------------------------
       START WORKERS
    --------------------------------*/
    const count = parseInt(opts.count, 10);

    /* ------------- DAEMON MODE --------------- */
    if (opts.daemon) {
      fs.mkdirSync(dataDir, { recursive: true });

      console.log(`🟢 Starting ${count} workers in background...`);

      const child = spawn(
        process.execPath,
        [path.join(__dirname, "queuectl.js"), "worker", "start", "--count", String(count)],
        {
          detached: true,
          stdio: [
            "ignore",
            fs.openSync(logFile, "a"),
            fs.openSync(logFile, "a")
          ]
        }
      );

      fs.writeFileSync(pidFile, String(child.pid));
      console.log(`✅ Workers started (PID: ${child.pid})`);
      console.log(`📜 Log file: ${logFile}`);

      child.unref();
      process.exit(0);
    }

    /* ------------- FOREGROUND MODE --------------- */
    redirectLogs(logFile);
    fs.mkdirSync(dataDir, { recursive: true });

    // Remove stale stop file
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);

    console.log(`Starting ${count} workers...`);

    const pool = new WorkerPool(count);
    pool.start();

    /* WINDOWS-SAFE STOP — CHECK STOP FILE */
    const checkStop = setInterval(async () => {
  if (fs.existsSync(stopFile)) {
    clearInterval(checkStop);

    console.log("Stop signal detected. Stopping workers...");

    await pool.stop();  // logs "⏳ WorkerPool stopping..." + "✅ All workers stopped."

    console.log("✅ Workers stopped gracefully.");
    setTimeout(() => process.exit(0), 300);
  }
}, 500);


    // keep process alive
    await new Promise(() => {});
  });

/* -------------------------------------------------------
   STATUS
--------------------------------------------------------- */

program
  .command("status")
  .description("Show worker & job status")
  .action(() => {
    const dataDir = path.join(__dirname, "..", "data");
    const pidFile = path.join(dataDir, "worker.pid");

    const jobs = db.prepare(
      "SELECT state, COUNT(*) as count FROM jobs GROUP BY state"
    ).all();

    const counts = {};
    jobs.forEach((j) => (counts[j.state] = j.count));

    console.log("📊 Job state summary:", counts);

    if (fs.existsSync(pidFile)) {
      console.log(`🟢 Background worker running (PID ${fs.readFileSync(pidFile, "utf8")})`);
    } else {
      console.log("🔴 No daemon worker running.");
    }
  });

/* -------------------------------------------------------
   LIST JOBS
--------------------------------------------------------- */

program
  .command("list")
  .option("--state <state>")
  .description("List jobs")
  .action((opts) => {
    const rows = opts.state
      ? db.prepare("SELECT * FROM jobs WHERE state=?").all(opts.state)
      : db.prepare("SELECT * FROM jobs").all();

    console.table(rows);
  });

/* -------------------------------------------------------
   DLQ
--------------------------------------------------------- */

program
  .command("dlq")
  .argument("[action]", "list|retry")
  .argument("[id]", "job ID")
  .description("View or retry DLQ jobs")
  .action((action = "list", id) => {
    if (action === "list") {
      const rows = db.prepare("SELECT * FROM jobs WHERE state='dead'").all();
      console.table(rows);
      return;
    }

    if (action === "retry") {
      if (!id) return console.error("❌ Need job ID to retry");

      db.prepare(
        `UPDATE jobs SET state='pending', attempts=0, scheduled_at=0 WHERE id=?`
      ).run(id);

      console.log(`✅ Job ${id} requeued.`);
      return;
    }

    console.error("Unknown DLQ command");
  });

/* -------------------------------------------------------
   CONFIG
--------------------------------------------------------- */

program
  .command("config")
  .argument("<action>", "get|set")
  .argument("<key>")
  .argument("[value]")
  .action((action, key, value) => {
    if (action === "get") {
      console.log(`${key} = ${getConfig(key)}`);
      return;
    }

    if (action === "set") {
      if (!value) return console.error("Value required");
      setConfig(key, value);
      console.log(`✅ Set ${key} = ${value}`);
      return;
    }
  });

program.parse(process.argv);
