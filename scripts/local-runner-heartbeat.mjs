import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runnerMetadata } from "./runner-identity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

await loadEnvFile(path.join(repoRoot, ".env.local"));
await loadEnvFile(path.join(repoRoot, ".env"));

const { upsertLocalRunner } = await import("../server/domains/command-center/repository.js");

const watchMode = process.argv.includes("--watch");
const heartbeatSeconds = Math.max(15, Number(process.env.RIDGEPATH_RUNNER_HEARTBEAT_SECONDS || 60));

await sendHeartbeat();

if (watchMode) {
  console.log(`RidgePath local runner heartbeat active every ${heartbeatSeconds}s.`);
  setInterval(() => {
    sendHeartbeat().catch((error) => {
      console.error(`[${new Date().toISOString()}] heartbeat failed: ${error.message}`);
    });
  }, heartbeatSeconds * 1000);
}

async function sendHeartbeat() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const machineId = process.env.RIDGEPATH_RUNNER_ID || hostname;
  const displayName = process.env.RIDGEPATH_RUNNER_NAME || `${hostname} (${username})`;

  const runner = await upsertLocalRunner({
    id: machineId,
    machineId,
    displayName,
    hostname,
    username,
    platform: os.platform(),
    architecture: os.arch(),
    workingDirectory: repoRoot,
    capabilities: [
      "heartbeat",
      "project-catalog-sync",
      "fabric-registry-sync",
      "operations-library-sync",
      "project-inventory",
      "fabric-inventory",
      "project-review",
      "command-queue-read",
      "approved-command-execution",
      "execution-packet-claim",
      "codex-handoff",
      "local-actions-require-approval",
    ],
    metadata: runnerMetadata(),
  });

  console.log(JSON.stringify({
    ok: true,
    runner: {
      id: runner.id,
      displayName: runner.displayName,
      status: runner.status,
      lastSeenAt: runner.lastSeenAt,
    },
  }));
}

async function loadEnvFile(filePath) {
  let text = "";
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, ...valueParts] = line.split("=");
    const key = name.trim();
    if (!key || process.env[key]) continue;
    process.env[key] = valueParts.join("=").trim();
  }
}
