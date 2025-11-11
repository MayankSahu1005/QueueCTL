// test-queuectl.js
// Automated test script for QueueCTL
// Run: node test-queuectl.js

import { execSync } from "child_process";

const run = (cmd) => {
  console.log("\n=====================================");
  console.log("▶ Running:", cmd);
  console.log("=====================================\n");
  try {
    const output = execSync(cmd, { stdio: "inherit" });
    return output?.toString();
  } catch (err) {
    console.error("❌ Command failed:", cmd);
  }
};

// 1) CLEAN START
console.log("\n🔥 Starting FULL QueueCTL system test...\n");

// 2) CONFIG TEST
run(`queuectl config set max_retries 3`);
run(`queuectl config get max_retries`);

// 3) ENQUEUE BASIC
run(`queuectl enqueue "{\\"id\\":\\"job_basic\\",\\"command\\":\\"echo basic\\"}"`);

// 4) ENQUEUE PRIORITY
run(`queuectl enqueue "{\\"id\\":\\"job_pri\\",\\"command\\":\\"echo priority\\",\\"priority\\":5}"`);

// 5) ENQUEUE DELAYED
run(`queuectl enqueue "{\\"id\\":\\"job_delay\\",\\"command\\":\\"echo delayed\\"}" --delay 5`);

// 6) ENQUEUE SCHEDULED
const future = new Date(Date.now() + 10_000).toISOString();
run(`queuectl enqueue "{\\"id\\":\\"job_future\\",\\"command\\":\\"echo future\\"}" --run-at ${future}`);

// 7) ENQUEUE FAILING JOB FOR DLQ
run(`queuectl enqueue "{\\"id\\":\\"failjob_test\\",\\"command\\":\\"exit 1\\"}"`);

// 8) START WORKERS
run(`queuectl worker start --count 2`);

// Wait 6 seconds for delayed jobs to execute
console.log("\n⏳ Waiting 6 seconds for delayed + scheduled jobs...\n");
await new Promise((r) => setTimeout(r, 6000));

// 9) STATUS
run(`queuectl status`);

// 10) LIST ALL JOBS
run(`queuectl list`);

// 11) LIST DLQ
run(`queuectl dlq list`);

// 12) RETRY DLQ
run(`queuectl dlq retry failjob_test`);

// 13) STOP WORKERS
run(`queuectl worker stop`);

console.log("\n✅ ALL TESTS COMPLETED\n");
