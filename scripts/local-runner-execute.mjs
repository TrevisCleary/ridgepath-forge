import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { runnerMetadata } from "./runner-identity.mjs";

const ROOT = process.cwd();
const WATCH = process.argv.includes("--watch");
const DEFAULT_LOCAL_API = "http://127.0.0.1:3059";
const DEFAULT_INTERVAL_SECONDS = 15;
const MIN_INTERVAL_SECONDS = 10;
const LOCAL_API_RETRY_COUNT = 3;
const LOCAL_API_RETRY_DELAY_MS = 750;

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const {
  claimNextCommandForRunner,
  syncCommandCenterProjects,
  syncOperationsLibrarySnapshot,
  syncRidgeFabricSnapshot,
  updateCommandRequest,
  upsertLocalRunner,
} = await import("../server/domains/command-center/repository.js");

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

function localApiBase() {
  return (process.env.RIDGEPATH_LOCAL_FORGE_API || DEFAULT_LOCAL_API).replace(/\/$/, "");
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
      "approved-command-execution",
      "execution-packet-claim",
      "codex-handoff",
      "local-actions-require-approval",
    ],
    metadata: runnerMetadata(),
  };
}

async function apiJson(route, options = {}) {
  const url = `${localApiBase()}${route}`;
  let lastError = null;
  for (let attempt = 1; attempt <= LOCAL_API_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Local Forge API returned non-JSON for ${route}: ${text.slice(0, 180)}`);
      }
      if (!response.ok) {
        throw new Error(data.error || `Local Forge API returned HTTP ${response.status} for ${route}.`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < LOCAL_API_RETRY_COUNT) {
        await sleep(LOCAL_API_RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw new Error(`Local Forge API request failed for ${route} at ${url}: ${lastError?.message || "unknown error"}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncProjects(runner) {
  const data = await apiJson("/api/projects");
  const projects = await syncCommandCenterProjects(data.projects || [], {
    machineId: runner.id,
    syncedBy: runner.displayName,
    sourceRoot: data.root,
  });
  return { projectCount: projects.length, root: data.root };
}

async function syncFabric(runner) {
  const registry = await apiJson("/api/ridge-fabric");
  const snapshot = await syncRidgeFabricSnapshot(registry, { machineId: runner.id });
  return { deviceCount: snapshot.devices.length, conflictCount: snapshot.conflicts.length, root: snapshot.root };
}

async function syncOperations(runner) {
  const status = await apiJson("/api/operations-library/status");
  const snapshot = await syncOperationsLibrarySnapshot(status, { machineId: runner.id });
  return { validationStatus: snapshot.validation?.status || "Unknown", issueCount: snapshot.validation?.issues?.length || 0 };
}

async function executeCommand(command, runner) {
  const payload = command.payload || {};
  const projectId = command.projectId || payload.projectId || "";
  switch (command.commandType) {
    case "project-catalog-sync":
      return await syncProjects(runner);
    case "fabric-registry-sync":
    case "fabric-inventory":
      return await syncFabric(runner);
    case "operations-library-sync":
      return await syncOperations(runner);
    case "project-review":
      if (!projectId) throw new Error("project-review requires projectId.");
      return await apiJson("/api/agent-runs/project-review", { method: "POST", body: JSON.stringify({ projectId }) });
    case "start-project":
      return await projectActionWithSync(projectId, "start", runner);
    case "stop-project":
      return await projectActionWithSync(projectId, "stop", runner);
    case "restart-project":
      return await projectActionWithSync(projectId, "restart", runner);
    case "take-over-project":
      return await projectActionWithSync(projectId, "take-over", runner);
    case "git-sync":
      return await projectActionWithSync(projectId, "git-sync", runner);
    case "initialize-project-management":
      return await projectActionWithSync(projectId, "initialize-project-management", runner);
    case "create-portfolio-draft":
      return await projectActionWithSync(projectId, "create-portfolio-draft", runner);
    case "update-project-description":
      if (!projectId) throw new Error("update-project-description requires projectId.");
      return await projectPatchWithSync(projectId, { description: payload.description || "" }, runner);
    case "register-project":
      return await registerProjectWithSync(payload, runner);
    case "fabric-device-update":
      if (!command.target) throw new Error("fabric-device-update requires target stable identifier.");
      return await fabricActionWithSync(`/api/ridge-fabric/devices/${encodeURIComponent(command.target)}`, { method: "PATCH", body: JSON.stringify(payload) }, runner);
    case "fabric-device-remove":
      if (!command.target) throw new Error("fabric-device-remove requires target stable identifier.");
      return await fabricActionWithSync(`/api/ridge-fabric/devices/${encodeURIComponent(command.target)}`, { method: "DELETE" }, runner);
    case "open-path":
      if (projectId) return await projectAction(projectId, "open-folder");
      throw new Error("open-path is only enabled for project folders until generic path policy is defined.");
    default:
      throw new Error(`Unsupported command type: ${command.commandType}`);
  }
}

async function projectAction(projectId, action) {
  if (!projectId) throw new Error(`${action} requires projectId.`);
  return await apiJson(`/api/projects/${encodeURIComponent(projectId)}/${action}`, { method: "POST" });
}

async function projectActionWithSync(projectId, action, runner) {
  const actionResult = await projectAction(projectId, action);
  const sync = await syncProjects(runner);
  return { actionResult, sync };
}

async function projectPatchWithSync(projectId, patch, runner) {
  const actionResult = await apiJson(`/api/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  const sync = await syncProjects(runner);
  return { actionResult, sync };
}

async function registerProjectWithSync(payload, runner) {
  const actionResult = await apiJson("/api/projects/register", { method: "POST", body: JSON.stringify(payload) });
  const sync = await syncProjects(runner);
  return { actionResult, sync };
}

async function fabricActionWithSync(route, options, runner) {
  const actionResult = await apiJson(route, options);
  const sync = await syncFabric(runner);
  return { actionResult, sync };
}

async function runOnce() {
  const runner = await upsertLocalRunner(runnerIdentity());
  const command = await claimNextCommandForRunner(runner.id);
  if (!command) {
    console.log(JSON.stringify({ ok: true, runnerId: runner.id, claimed: false }));
    return;
  }

  await updateCommandRequest(command.id, {
    executionStatus: "running",
    actor: runner.id,
  });

  try {
    const result = await executeCommand(command, runner);
    await updateCommandRequest(command.id, {
      executionStatus: "succeeded",
      result: {
        commandType: command.commandType,
        completedBy: runner.id,
        completedAt: new Date().toISOString(),
        result,
      },
      actor: runner.id,
    });
    console.log(JSON.stringify({ ok: true, runnerId: runner.id, claimed: true, commandId: command.id, commandType: command.commandType, status: "succeeded" }));
  } catch (error) {
    await updateCommandRequest(command.id, {
      executionStatus: "failed",
      error: error.message || String(error),
      actor: runner.id,
    });
    console.log(JSON.stringify({ ok: false, runnerId: runner.id, claimed: true, commandId: command.id, commandType: command.commandType, status: "failed", error: error.message || String(error) }));
  }
}

async function main() {
  await runOnce();
  if (!WATCH) return;
  const intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, Number(process.env.RIDGEPATH_RUNNER_EXECUTE_SECONDS || DEFAULT_INTERVAL_SECONDS) || DEFAULT_INTERVAL_SECONDS);
  console.log(`RidgePath local runner executor active every ${intervalSeconds}s.`);
  setInterval(() => {
    runOnce().catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
    });
  }, intervalSeconds * 1000);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
