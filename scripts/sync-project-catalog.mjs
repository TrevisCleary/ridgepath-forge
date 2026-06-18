import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_LOCAL_API = "http://127.0.0.1:3059";

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const { syncCommandCenterProjects, upsertLocalRunner } = await import("../server/domains/command-center/repository.js");

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
      "project-inventory",
      "fabric-inventory",
      "project-review",
      "command-queue-read",
      "local-actions-require-approval",
      "execution-disabled",
    ],
    metadata: {
      nodeVersion: process.version,
      homedir: os.homedir(),
      projectRoot: process.env.PROJECTS_ROOT || "C:\\Development\\Projects",
      ridgeFabricRoot: process.env.RIDGE_FABRIC_ROOT || "C:\\Development\\Shared\\ridge-fabric-registry",
    },
  };
}

async function fetchLocalProjects() {
  const baseUrl = process.env.RIDGEPATH_LOCAL_FORGE_API || DEFAULT_LOCAL_API;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/projects`);
  if (!response.ok) {
    throw new Error(`Local Forge API returned HTTP ${response.status}. Start local Forge API before syncing projects.`);
  }
  const data = await response.json();
  return {
    root: data.root || "",
    projects: Array.isArray(data.projects) ? data.projects : [],
  };
}

async function main() {
  const runner = await upsertLocalRunner(runnerIdentity());
  const data = await fetchLocalProjects();
  const projects = await syncCommandCenterProjects(data.projects, {
    machineId: runner.id,
    syncedBy: runner.displayName,
    sourceRoot: data.root,
  });
  console.log(JSON.stringify({
    ok: true,
    runner: {
      id: runner.id,
      displayName: runner.displayName,
      status: runner.status,
      lastSeenAt: runner.lastSeenAt,
    },
    root: data.root,
    projectCount: projects.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
