# 🧰 QueueCTL — CLI-based Background Job Queue System

`queuectl` is a **Node.js-based background job queue** that allows you to enqueue, manage, and execute background jobs with retries, persistence, and a Dead Letter Queue (DLQ). It supports background workers, exponential backoff, configurable retry counts, job timeouts, and optional features like job priorities, delayed jobs, metrics, and dashboards.

---

## 🚀 Features

* Persistent job storage (SQLite)
* Multiple worker processes
* Automatic retries with exponential backoff
* Separate **Dead Letter Queue (DLQ)** table
* Configurable retry & backoff base
* Background **daemon mode** with PID management
* Graceful shutdown
* Optional features:


---

## ⚙️ Installation

```bash
git clone <your_repo_url>
cd queuectl
npm install
```

---

## 🧩 Making `queuectl` a Global CLI Command

To run commands directly like `queuectl enqueue job.json` instead of `npm run queuectl`, follow these steps:


Run this in your project root:

```bash
npm install -g .
```

###  Verify

```bash
queuectl --help
```

You should now be able to run all commands directly:

```bash
queuectl enqueue job.json
queuectl worker start --count 2 --daemon
queuectl status
queuectl dlq list
```

To update after code changes:

```bash
npm install -g .
```

---

## 🧩 CLI Commands Overview

| Command                                        | Description                          |
| ---------------------------------------------- | ------------------------------------ |
| `queuectl enqueue <json or file>`              | Add a new job                        |
| `queuectl worker start [--count N] [--daemon]` | Start workers (optional daemon mode) |
| `queuectl worker stop`                         | Stop background workers              |
| `queuectl status`                              | Show system/job status               |
| `queuectl list [--state STATE]`                | List jobs by state                   |
| `queuectl dlq list`                            | View DLQ                             |
| `queuectl dlq retry <id>`                      | Retry DLQ job                        |
| `queuectl dlq clear`                           | Clear all DLQ jobs                   |
| `queuectl config set/get`                      | Manage configuration                 |
| `queuectl logs <jobId>`                        | Show job logs (optional)             |
| `queuectl metrics`                             | Display system metrics (optional)    |

---

## 🧩 Usage Examples

### ▶️ Enqueue a job (inline JSON)

```bash
queuectl enqueue '{"id":"job1","command":"echo Hello"}'
```

### ▶️ Enqueue from a JSON file

`job.json`:

```json
{
  "id": "job1",
  "command": "echo Hello && exit 0",
  "max_retries": 3,
  "timeout": 10000
}
```

Run:

```bash
queuectl enqueue job.json
```

---

### ▶️ Start Workers

```bash
queuectl worker start --count 2
```

Start worker in background:

```bash
queuectl worker start --count 2 --daemon
```

Stop workers:

```bash
queuectl worker stop
```

---

### ▶️ Status

```bash
queuectl status
```

### ▶️ DLQ Management

```bash
queuectl dlq list
queuectl dlq retry job1
queuectl dlq clear
```

### ▶️ Config

```bash
queuectl config set backoff_base 2
queuectl config get max_retries
```

---

## 🔄 Retry & Backoff Logic

```
delay = backoff_base ^ attempts
```

| Attempt | Delay (seconds) |
| ------- | --------------- |
| 1       | 2               |
| 2       | 4               |
| 3       | 8               |

After exceeding `max_retries`, job is moved to **DLQ**.

---

## ⏱ Timeout Handling

Each job has a timeout (default 30s). If exceeded, job is terminated and retried.

```json
{
  "id": "job2",
  "command": "sleep 60",
  "timeout": 5000
}
```

---


## 📂 Project Structure

```
queuectl/
├── bin/
│   └── queuectl.js          # CLI entry point
├── lib/
│   ├── db.js                # SQLite setup
│   ├── config.js            # Config helpers
│   ├── cli.js               # CLI logic
│   ├── worker.js            # Job execution + retry logic
│   ├── workerManager.js     # Worker pool management
├── data/
│   ├── queue.db             # SQLite DB
│   ├── worker.log           # Daemon logs
│   └── worker.pid           # PID for daemon workers
├── migrate.js               # Schema migration helper
└── README.md
```

---



