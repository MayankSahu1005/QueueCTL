const express = require("express");
const db = require("./lib/db");

const app = express();
const PORT = 4000;

// Serve a dashboard HTML page
app.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #fafafa; }
        h1, h2 { color: #333; }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 30px; 
          background: white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        th, td {
          padding: 10px; 
          border-bottom: 1px solid #ddd; 
          text-align: left;
        }
        th {
          background: #f4f4f4;
          font-weight: bold;
        }
        tr:hover { background: #f9f9f9; }
        .section { margin-bottom: 40px; }
        button { 
          padding: 8px 14px; 
          background: #007bff; 
          border: none; 
          color: white; 
          border-radius: 4px; 
          cursor: pointer; 
          margin-bottom: 20px;
        }
        button:hover { background: #0056b3; }
      </style>
    </head>

    <body>
      <h1>📊 queuectl Monitoring Dashboard</h1>
      <button onclick="refresh()">Refresh</button>

      <div class="section">
        <h2>✅ Active Jobs</h2>
        <table id="jobsTable"></table>
      </div>

      <div class="section">
        <h2>⚰️ Dead Letter Queue</h2>
        <table id="dlqTable"></table>
      </div>

      <div class="section">
        <h2>📈 Metrics</h2>
        <table id="metricsTable"></table>
      </div>

      <div class="section">
        <h2>🟢 Worker Status</h2>
        <table id="workerTable"></table>
      </div>

      <script>
        async function loadTable(url, tableId) {
          const res = await fetch(url);
          const data = await res.json();

          const table = document.getElementById(tableId);
          table.innerHTML = "";

          if (!data.length) {
            table.innerHTML = "<tr><td>No data found</td></tr>";
            return;
          }

          const header = Object.keys(data[0]);
          let headerHtml = "<tr>";
          header.forEach(h => headerHtml += "<th>" + h + "</th>");
          headerHtml += "</tr>";
          table.innerHTML += headerHtml;

          data.forEach(row => {
            let rowHtml = "<tr>";
            header.forEach(h => rowHtml += "<td>" + row[h] + "</td>");
            rowHtml += "</tr>";
            table.innerHTML += rowHtml;
          });
        }

        async function loadMetrics() {
          const res = await fetch('/metrics');
          const data = await res.json();

          const table = document.getElementById("metricsTable");
          table.innerHTML = "<tr><th>Metric</th><th>Value</th></tr>";

          Object.entries(data).forEach(([key, val]) => {
            table.innerHTML += \`
              <tr>
                <td>\${key}</td>
                <td>\${typeof val === 'object' ? JSON.stringify(val) : val}</td>
              </tr>
            \`;
          });
        }

        async function loadWorkers() {
          const res = await fetch('/workers');
          const data = await res.json();

          const table = document.getElementById("workerTable");
          table.innerHTML = "<tr><th>Status</th><th>PID</th></tr>";

          table.innerHTML += \`
            <tr>
              <td>\${data.running ? "🟢 Running" : "🔴 Not Running"}</td>
              <td>\${data.pid || "-"}</td>
            </tr>
          \`;
        }

        async function refresh() {
          loadTable("/jobs", "jobsTable");
          loadTable("/dlq", "dlqTable");
          loadMetrics();
          loadWorkers();
        }

        refresh(); // Load once on page open
      </script>
    </body>
    </html>
  `);
});



// List all jobs
app.get("/jobs", (req, res) => {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all();
  res.json(jobs);
});

// List all DLQ jobs
app.get("/dlq", (req, res) => {
  const dlq = db.prepare("SELECT * FROM dlq ORDER BY failed_at DESC").all();
  res.json(dlq);
});

// Simple metrics
app.get("/metrics", (req, res) => {
  const counts = db
    .prepare("SELECT state, COUNT(*) AS count FROM jobs GROUP BY state")
    .all();

  const formatted = {};
  counts.forEach((r) => {
    formatted[r.state] = r.count;
  });

  const dlqCount = db.prepare("SELECT COUNT(*) AS c FROM dlq").get().c;

  res.json({
    jobs: formatted,
    dlq_count: dlqCount,
  });
});

// Workers (based on PID file)
const fs = require("fs");
const path = require("path");

app.get("/workers", (req, res) => {
  const pidFile = path.join(process.cwd(), "data", "worker.pid");

  if (!fs.existsSync(pidFile)) {
    return res.json({ running: false });
  }

  const pid = fs.readFileSync(pidFile, "utf8");
  res.json({ running: true, pid });
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});
