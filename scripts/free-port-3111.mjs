import { execSync } from "node:child_process";

const PORT = 3111;

function getListeningPidsOnWindows(port) {
  const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8"
  });

  const pids = new Set();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (!line || !/LISTENING/i.test(line)) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function freePort3111() {
  if (process.platform !== "win32") {
    return;
  }

  let pids = [];
  try {
    pids = getListeningPidsOnWindows(PORT);
  } catch {
    pids = [];
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: ["ignore", "ignore", "ignore"] });
      console.log(`Stopped PID ${pid} on port ${PORT}`);
    } catch {
      // Ignore kill failures to keep dev boot resilient.
    }
  }
}

try {
  freePort3111();
} finally {
  process.exit(0);
}
