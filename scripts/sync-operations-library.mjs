import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_LOCAL_API = "http://127.0.0.1:3059";

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const { syncOperationsLibrarySnapshot, upsertLocalRunner } = await import("../server/domains/command-center/repository.js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function runnerIdentity() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  return {
    id: process.env.RIDGEPATH_RUNNER_ID || hostname,
    machineId: process.env.RIDGEPATH_RUNNER_ID || hostname,
    displayName: process.env.RIDGEPATH_RUNNER_NAME || `${hostname} (${username})`,
    hostname,
    username,
    platform: process.platform,
    architecture: process.arch,
    workingDirectory: ROOT,
    capabilities: [
      "heartbeat",
      "project-catalog-sync",
      "fabric-registry-sync",
      "operations-library-sync",
      "project-inventory",
      "fabric-inventory",
      "project-review",
      "command-queue-read",
      "local-actions-require-approval",
    ],
  };
}

async function fetchLocalOperationsStatus() {
  const baseUrl = process.env.RIDGEPATH_LOCAL_FORGE_API || DEFAULT_LOCAL_API;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/operations-library/status`);
  if (!response.ok) {
    throw new Error(`Local Forge API returned HTTP ${response.status}. Start local Forge API before syncing Operations Library.`);
  }
  return await response.json();
}

async function main() {
  const runner = await upsertLocalRunner(runnerIdentity());
  const status = await fetchLocalOperationsStatus();
  const snapshot = await syncOperationsLibrarySnapshot(status, { machineId: runner.id });
  console.log(JSON.stringify({
    ok: true,
    runner: {
      id: runner.id,
      displayName: runner.displayName,
      status: runner.status,
      lastSeenAt: runner.lastSeenAt,
    },
    validationStatus: snapshot.validation?.status || "Unknown",
    issueCount: snapshot.validation?.issues?.length || 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
