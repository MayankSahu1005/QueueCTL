#!/usr/bin/env node

import { Command } from "commander";
import { enqueueFromJson } from "../lib/cli.js";
import { WorkerPool } from "../lib/workerManager.js";
import db from "../lib/db.js";
import { setConfig, getConfig } from "../lib/config.js";
import { createWriteStream, mkdirSync, existsSync, writeFileSync, unlinkSync, openSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from 'url';
import { printJobs, printDLQ,printWorkerStatus } from "../lib/print.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();


// ------------------------------- Log Redirection ----------------------

function redirectLogs(logFilePath) {
  mkdirSync(dirname(logFilePath), { recursive: true });

  const logStream = createWriteStream(logFilePath, { flags: "a" });

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

// ---------------------------------- CLI Setup ---------------------------

program
  .name("queuectl")
  .description("Background job queue system")
  .version("1.0.0");

// --------------------------------- Enqueue -----------------------------------

program
  .command("enqueue")
  .argument("<input>", "JSON string or path to JSON file")
  .option("--priority <n>", "Set job priority (higher = earlier)")
  .option("--run-at <time>", "Schedule job to execute at exact ISO datetime")
  .option("--delay <seconds>", "Delay job execution by N seconds")
  .description("Add a job to the queue")
  .action(async (input, opts) => {
    try {
      let json = input;

      // Load from file if file path
      if (existsSync(input) && input.endsWith(".json")) {
        json = readFileSync(input, "utf8");
      }

      const job = JSON.parse(json);

     
      // Sets priority of job
      if (opts.priority !== undefined) {
  job.priority = Number(opts.priority);
} else if (job.priority === undefined) {
  job.priority = 0; // default
}

     const now = Date.now();
      // Scheduling logic
      if (opts.runAt) {
        job.scheduled_at = new Date(opts.runAt).getTime();
      } else if (opts.delay) {
        job.scheduled_at = now + Number(opts.delay) * 1000;
      } else {
        // default behavior (old behavior)
        job.scheduled_at = now;
      }

      const result = enqueueFromJson(JSON.stringify(job));

      const inserted = db.prepare("SELECT * FROM jobs WHERE id=?").get(result.id);

      console.log("\n✅ Job successfully enqueued!\n");
      printJobs([inserted]);
    } catch (e) {
      console.error("❌ Failed to enqueue job:", e.message);
      process.exit(1);
    }
  });


// ---------------------------------- Worker Start/Stop-----------------------------------

program
  .command("worker")
  .argument("<action>", "start|stop")
  .option("--count <n>", "number of workers", "1")
  .option("--daemon", "run workers in background")
  .description("Start or stop worker processes")
  .action(async (action, opts) => {
    if (action !== "start" && action !== "stop") {
      console.error(`Unknown action: ${action}. Use 'start' or 'stop'.`);
      process.exit(1);
    }

    const dataDir = join(__dirname, "..", "data");
    const pidFile = join(dataDir, "worker.pid");
    const logFile = join(dataDir, "worker.log");
    const stopFile = join(dataDir, "worker.stop");

  // --------------------------------- Stop Worker ----------------------------------
    if (action === "stop") {
      console.log("🛑 Stopping workers...");

      try {
        // Check if workers are running
        if (!existsSync(pidFile)) {
          console.log("❌ No workers appear to be running (no PID file found)");
          return;
        }

        // Read PID and verify process exists
        const pid = Number(readFileSync(pidFile, 'utf8'));
        try {
          process.kill(pid, 0); // Check if process exists
        } catch (e) {
          console.log("❌ Worker process not found (stale PID file)");
          unlinkSync(pidFile);
          return;
        }

        // Create stop signal file
        writeFileSync(stopFile, "stop");

        // Send SIGTERM to the process for graceful shutdown
        process.kill(pid, 'SIGTERM');

        console.log("✅ Stop signal sent to workers (PID: " + pid + ")");
        console.log("Workers will shut down gracefully after current jobs complete.");
        return;
      } catch (err) {
        console.error("❌ Error stopping workers:", err.message);
        process.exit(1);
      }
    }

    // ----------------------------- Start Worker ---------------------------------------

    const count = parseInt(opts.count, 10);

    // ------------- DAEMON MODE --------------- 
    if (opts.daemon) {
      mkdirSync(dataDir, { recursive: true });

      console.log(`🟢 Starting ${count} workers in background...`);

      const child = spawn(
        process.execPath,
        [join(__dirname, "queuectl.js"), "worker", "start", "--count", String(count)],
        {
          detached: true,
          stdio: [
            "ignore",
            openSync(logFile, "a"),
            openSync(logFile, "a")
          ]
        }
      );

      writeFileSync(pidFile, String(child.pid));
      console.log(`✅ Workers started (PID: ${child.pid})`);
      console.log(`📜 Log file: ${logFile}`);

      // Add error handler for the child process
      child.on('error', (err) => {
        console.error('Failed to start worker process:', err);
        if (existsSync(pidFile)) unlinkSync(pidFile);
        process.exit(1);
      });

      child.unref();
      process.exit(0);
    }

    //------------- FOREGROUND MODE --------------- 
    redirectLogs(logFile);
    mkdirSync(dataDir, { recursive: true });

    // Remove stale files
    if (existsSync(stopFile)) unlinkSync(stopFile);
    if (existsSync(pidFile)) unlinkSync(pidFile);

    // Write current PID
    writeFileSync(pidFile, String(process.pid));
    console.log(`Starting ${count} workers (PID: ${process.pid})...`);

    const pool = new WorkerPool(count);
    pool.start();

    // Handle various shutdown signals
    let shuttingDown = false;
    const cleanup = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\nStop signal received. Initiating graceful shutdown...');
      
      // Write stop file and clean up PID
      writeFileSync(stopFile, 'stop');
      if (existsSync(pidFile)) unlinkSync(pidFile);
      
      await pool.stop();
      console.log('✅ Workers stopped gracefully.');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
      if (existsSync(pidFile)) unlinkSync(pidFile);
    });

    const checkStop = setInterval(async () => {
      if (existsSync(stopFile) && !shuttingDown) {
        shuttingDown = true;
        clearInterval(checkStop);
        console.log('Stop signal detected. Stopping workers...');
        await pool.stop();
        console.log('✅ Workers stopped gracefully.');
        setTimeout(() => process.exit(0), 300);
      }
    }, 500);


    // keep process alive
    await new Promise(() => {});
  });

//---------------------------------------------- STATUS -------------------------------

program
  .command("status")
  .description("Show worker & job status")
  .action(() => {
    const dataDir = join(__dirname, "..", "data");
    const pidFile = join(dataDir, "worker.pid");

    const jobs = db.prepare(
      "SELECT state, COUNT(*) as count FROM jobs GROUP BY state"
    ).all();

    const counts = {};
    jobs.forEach((j) => (counts[j.state] = j.count));

    console.log("📊 Job state summary:", counts);

    if (existsSync(pidFile)) {
      console.log(`🟢 Background worker running (PID ${readFileSync(pidFile, "utf8")})`);
    } else {
      console.log("🔴 No daemon worker running.");
    }
  });

/// ----------------------------------- Job List ------------------------------------

program
  .command("list")
  .option("--state <state>")
  .description("List jobs")
  .action((opts) => {
    const rows = opts.state
      ? db.prepare("SELECT * FROM jobs WHERE state=?").all(opts.state)
      : db.prepare("SELECT * FROM jobs").all();

    printJobs(rows);
  });

// -------------------------------------- DLQ ----------------------------------------

program
  .command("dlq")
  .argument("[action]", "list|retry")
  .argument("[id]", "job ID")
  .description("View or retry DLQ jobs")
  .action((action = "list", id) => {
    if (action === "list") {
      const rows = db.prepare("SELECT * FROM dlq ORDER BY failed_at DESC").all();
      printDLQ(rows);
      return;
    }

    if (action === "retry") {
      if (!id) return console.error("❌ Need job ID to retry");

      // Get the job from DLQ
      const dlqJob = db.prepare("SELECT * FROM dlq WHERE id = ?").get(id);
      if (!dlqJob) {
        console.error(`❌ Job ${id} not found in DLQ`);
        return;
      }

      // Requeue in a transaction
      db.transaction(() => {
        // Remove from DLQ
        db.prepare("DELETE FROM dlq WHERE id = ?").run(id);

        // Requeue the job
        db.prepare(`
          INSERT INTO jobs (
            id, command, state, attempts, max_retries, 
            created_at, updated_at, scheduled_at
          ) VALUES (?, ?, 'pending', 0, ?, ?, ?, ?)
        `).run(
          dlqJob.id,
          dlqJob.command,
          dlqJob.max_retries,
          new Date().toISOString(),
          new Date().toISOString(),
          Date.now()
        );
      })();

      console.log(`✅ Job ${id} requeued from DLQ`);
      return;
    }

    console.error("Unknown DLQ command");
  });

// ------------------------------------------ COnfiguration----------------------------

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
