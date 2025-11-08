import express from 'express';
import db from './lib/db.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const app = express();
const PORT = 4000;

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve a dashboard HTML page
app.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
     <style>
  body {
    font-family: Inter, Arial, sans-serif;
    padding: 25px;
    background: #f2f4f7;
    color: #222;
  }

  h1 {
    font-size: 32px;
    margin-bottom: 20px;
    color: #222;
    font-weight: 700;
    text-align: center;
  }

  h2 {
    margin-top: 30px;
    font-size: 22px;
    color: #333;
    font-weight: 600;
    border-left: 5px solid #4a90e2;
    padding-left: 10px;
    
  }

  button {
    padding: 10px 18px;
    background: #4a90e2;
    border: none;
    color: white;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    margin-bottom: 20px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.12);
    transition: background 0.2s ease;
  }

  button:hover {
    background: #357ABD;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-bottom: 35px;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: rgba(0, 0, 0, 0.06) 0px 4px 12px;
  }

  th {
    background: #eef3f8;
    padding: 12px;
    text-align: left;
    font-size: 14px;
    font-weight: 700;
    color: #333;
    border-bottom: 1px solid #d7dee6;
  }

  td {
    padding: 12px;
    font-size: 14px;
    color: #444;
    border-bottom: 1px solid #e5e7eb;
  }

  /* Special styles for metrics table only */
  #metricsTable {
    width: 100%;
    border-collapse: separate;
    border-spacing: 12px;
    margin-bottom: 35px;
    background: transparent;
    border-radius: 8px;
    box-shadow: none;
  }

  #metricsTable th {
    background: #4a90e2;
    padding: 16px;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    color: white;
    border: none;
    border-radius: 6px;
    box-shadow: rgba(0, 0, 0, 0.06) 0px 4px 12px;
  }

  #metricsTable td {
    background: white;
    padding: 16px 20px;
    font-size: 24px;
    font-weight: 700;
    color: #333;
    text-align: center;
    border: none;
    border-radius: 6px;
    box-shadow: rgba(0, 0, 0, 0.06) 0px 4px 12px;
  }

  #metricsTable tr:hover td {
    background: #f8faff;
    transform: translateY(-1px);
    box-shadow: rgba(0, 0, 0, 0.1) 0px 6px 16px;
    transition: all 0.2s ease;
  }

  /* Metrics specific styles */
  #metricsTable {
    width: 80%;
    margin: 0 auto;
  }
  
  #metricsTable th,
  #metricsTable td {
    padding: 20px;
    font-size: 18px;
    background: white;
    vertical-align: middle;
  }

  #metricsTable th {
    background: #4a90e2;
    color: white;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0 20px;
  }

  #metricsTable td {
    font-size: 24px;
    font-weight: 700;
    color: #333;
    padding: 0 20px;
  }

  .metric-title {
    padding: 10px;
    text-align: center;
  }

  .metric-value {
    padding: 15px;
    text-align: center;
    font-size: 28px;
    font-weight: 700;
  }

  .metrics-header th,
  .metrics-values td {
    min-width: 120px;
    padding: 20px;
    border-radius: 8px;
    margin: 0 10px;
  }

  .metrics-header th {
    background: #4a90e2;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .metrics-values td {
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    transition: transform 0.2s ease;
  }

  .metrics-values td:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: #f5faff;
  }

  .section {
    margin-top: 40px;
  }
</style>

    </head>

    <body>
      <h1> QueueCTL Monitoring Dashboard</h1>
      <button onclick="refresh()">Refresh</button>

      <div class="section">
        <h2>Metrics</h2>
        <table id="metricsTable"></table>
      </div>
      <div class="section">
        <h2>✅ Active Jobs</h2>
        <table id="jobsTable"></table>
      </div>

      <div class="section">
        <h2> Dead Letter Queue</h2>
        <table id="dlqTable"></table>
      </div>

      

      <div class="section">
        <h2>Worker Status</h2>
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
          
          // Create header row with all states and DLQ
          const states = Object.keys(data.jobs);
          let headerHtml = '<tr class="metrics-header">';
          states.forEach(state => {
            headerHtml += '<th><div class="metric-title">' + state.toUpperCase() + '</div></th>';
          });
          headerHtml += '<th><div class="metric-title">DLQ</div></th></tr>';
          
          // Create data row with counts
          let dataHtml = '<tr class="metrics-values">';
          states.forEach(state => {
            dataHtml += '<td><div class="metric-value">' + (data.jobs[state] || 0) + '</div></td>';
          });
          dataHtml += '<td><div class="metric-value">' + data.dlq_count + '</div></td></tr>';
          
          table.innerHTML = headerHtml + dataHtml;
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
  
  // Format timestamps
  const formattedJobs = jobs.map(job => ({
    ...job,
    scheduled_at: job.scheduled_at ? new Date(Number(job.scheduled_at)).toISOString() : null,
    created_at: job.created_at,
    updated_at: job.updated_at
  }));
  
  res.json(formattedJobs);
});

// List all DLQ jobs
app.get("/dlq", (req, res) => {
  try {
    const dlq = db.prepare("SELECT * FROM dlq ORDER BY failed_at DESC").all();
    res.json(dlq || []);
  } catch (err) {
    console.error('Error fetching DLQ:', err);
    res.json([]);
  }
});



// Add metrics endpoint
app.get("/metrics", (req, res) => {
  try {
    const counts = db.prepare("SELECT state, COUNT(*) AS count FROM jobs GROUP BY state").all();
    const formatted = {};
    counts.forEach((r) => {
      formatted[r.state] = r.count;
    });
    
    const dlqCount = db.prepare("SELECT COUNT(*) AS c FROM dlq").get()?.c || 0;
    
    res.json({
      jobs: formatted,
      dlq_count: dlqCount
    });
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.json({ jobs: {}, dlq_count: 0 });
  }
});

// Workers (based on PID file)


app.get("/workers", (req, res) => {
  try {
    const pidFile = join(process.cwd(), "data", "worker.pid");

    if (!existsSync(pidFile)) {
      return res.json({ running: false });
    }

    const pid = readFileSync(pidFile, "utf8");
    
    // Check if the process is actually running
    try {
      process.kill(Number(pid), 0);
      res.json({ running: true, pid });
    } catch (e) {
      // Process is not running
      res.json({ running: false });
    }
  } catch (err) {
    console.error('Error checking worker status:', err);
    res.json({ running: false });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});
