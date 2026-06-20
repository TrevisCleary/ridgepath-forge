import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { runnerMetadata } from "./runner-identity.mjs";

const ROOT = process.cwd();
const WATCH = process.argv.includes("--watch");
const DEFAULT_INTERVAL_SECONDS = 60;
const MIN_INTERVAL_SECONDS = 15;

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const { listQueuedCommandsForRunner, upsertLocalRunner } = await import("../server/domains/command-center/repository.js");

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
      "execution-packet-claim",
      "codex-handoff",
      "local-actions-require-approval",
    ],
    metadata: runnerMetadata(),
  };
}

async function tick() {
  const runner = await upsertLocalRunner(runnerIdentity());
  const commands = await listQueuedCommandsForRunner(runner.id);
  const summary = commands.map((command) => ({
    id: command.id,
    commandType: command.commandType,
    projectId: command.projectId,
    target: command.target,
    approvedAt: command.approvedAt,
  }));
  console.log(JSON.stringify({
    ok: true,
    runner: {
      id: runner.id,
      displayName: runner.displayName,
      status: runner.status,
      lastSeenAt: runner.lastSeenAt,
    },
    queuedCommandCount: commands.length,
    execution: "monitor-only",
    commands: summary,
  }));
}

async function main() {
  await tick();
  if (!WATCH) return;
  const intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, Number(process.env.RIDGEPATH_RUNNER_QUEUE_SECONDS || DEFAULT_INTERVAL_SECONDS) || DEFAULT_INTERVAL_SECONDS);
  console.log(`RidgePath local runner queue monitor active every ${intervalSeconds}s. Execution is disabled.`);
  setInterval(() => {
    tick().catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
    });
  }, intervalSeconds * 1000);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
