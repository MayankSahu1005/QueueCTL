import Table from "cli-table3";

export function printJobs(jobs) {
  if (!jobs.length) {
    console.log("No jobs found.");
    return;
  }

  const table = new Table({
    head: ["ID", "Command", "State", "Scheduled At", "Updated At", "Worker ID"],
    style: { border: [], header: [] },
    wordWrap: true,
    wrapOnWordBoundary: false,
    colWidths: [20, 20, 10, 12, 12, 24]
  });

  for (const job of jobs) {
    // Format scheduled_at from timestamp to ISO string
    let scheduledAt = '-';
    if (job.scheduled_at) {
      try {
        // Handle both timestamp and ISO string formats
        scheduledAt = job.scheduled_at.includes('T') 
          ? job.scheduled_at
          : new Date(Number(job.scheduled_at)).toISOString();
      } catch (e) {
        scheduledAt = '(invalid date)';
      }
    }
    
    table.push([
      job.id || '',
      job.command || '',
      job.state || '',
      scheduledAt,
      job.updated_at || '',
      job.worker_id || ''
    ]);
  }

  console.log(table.toString());
}

export function printDLQ(rows) {
  if (!rows.length) {
    console.log("DLQ is empty.");
    return;
  }

  const table = new Table({
    head: ["ID", "Command", "Attempts", "MaxRetries", "Last Error", "Failed At"],
     style: { border: [], header: [] },
    wordWrap: true,
    wrapOnWordBoundary: false,
    colWidths: [12, 26, 10, 12, 20, 12]
  });

  for (const job of rows) {
    table.push([
      job.id,
      job.command,
      job.attempts,
      job.max_retries,
      job.last_error,
      job.failed_at
    ]);
  }

  console.log(table.toString());
}


export function printWorkerStatus(status) {
  const table = new Table({
    head: ["Running", "PID"],
    colWidths: [10, 15]
  });

  table.push([
    status.running ? "Yes" : "No",
    status.pid || "-"
  ]);

  console.log(table.toString());
}



export function printMetrics(metrics) {
  const table = new Table({
    head: ["Metric", "Value"],
    colWidths: [20, 40]
  });

  for (const [key, val] of Object.entries(metrics)) {
    table.push([
      key,
      typeof val === "object" ? JSON.stringify(val) : val
    ]);
  }

  console.log(table.toString());
}


