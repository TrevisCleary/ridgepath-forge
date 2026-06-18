import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const WATCH = process.argv.includes("--watch");
const DEFAULT_INTERVAL_SECONDS = 60;
const MIN_INTERVAL_SECONDS = 30;
const HANDOFF_DIR = path.join(ROOT, "data", "command-center", "execution-packet-handoffs");

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const {
  claimNextExecutionPacketForRunner,
  listCommandCenterProjects,
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
    metadata: {
      nodeVersion: process.version,
      homedir: os.homedir(),
      projectRoot: process.env.PROJECTS_ROOT || "C:\\Development\\Projects",
      ridgeFabricRoot: process.env.RIDGE_FABRIC_ROOT || "C:\\Development\\Shared\\ridge-fabric-registry",
    },
  };
}

function formatPrompt(packet, project) {
  const constraints = packet.constraints?.length
    ? packet.constraints.map((item) => `- ${item}`).join("\n")
    : "- No additional constraints were captured.";
  const projectPath = project?.path || project?.primaryLocalPath || "";
  const projectName = project?.name || packet.projectId || "Unassigned project";

  return [
    "You are Codex acting on an owner-approved RidgePath Forge execution packet.",
    "",
    "Treat the packet as approved scope, but still inspect the repository before editing. Do not expand the scope beyond the packet constraints.",
    "",
    `Packet ID: ${packet.id}`,
    `Proposal ID: ${packet.proposalId}`,
    `Project: ${projectName}`,
    `Project ID: ${packet.projectId || "unassigned"}`,
    projectPath ? `Local path: ${projectPath}` : "Local path: not available from the hosted catalog",
    `Branch policy: ${packet.branchPolicy}`,
    packet.branchName ? `Requested branch name: ${packet.branchName}` : "Requested branch name: create one that matches the branch policy and objective",
    "",
    "Objective:",
    packet.objective,
    "",
    "Constraints and owner direction:",
    constraints,
    "",
    "Implementation rules:",
    "- Verify the current branch and dirty worktree before editing.",
    "- Use a feature branch unless the packet branch policy explicitly allows the active branch or direct main.",
    "- Keep edits tightly scoped to the packet objective.",
    "- Run the relevant build, tests, or smoke checks.",
    "- Do not push to main or deploy unless the packet branch policy explicitly permits it.",
    "- When complete, update the execution packet status and validation result in Forge/Neon.",
  ].filter(Boolean).join("\n");
}

async function writeHandoff(packet, runner) {
  const projects = await listCommandCenterProjects();
  const project = projects.find((candidate) => candidate.id === packet.projectId);
  const prompt = formatPrompt(packet, project);
  const handoff = {
    generatedAt: new Date().toISOString(),
    runner: {
      id: runner.id,
      displayName: runner.displayName,
    },
    packet,
    project: project ? {
      id: project.id,
      name: project.name,
      path: project.path,
      status: project.status,
      framework: project.framework,
    } : null,
    prompt,
  };
  await fsp.mkdir(HANDOFF_DIR, { recursive: true });
  const handoffPath = path.join(HANDOFF_DIR, `${packet.id}.json`);
  await fsp.writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  return { handoffPath, prompt };
}

async function runOnce() {
  const runner = await upsertLocalRunner(runnerIdentity());
  const packet = await claimNextExecutionPacketForRunner(runner.id);
  if (!packet) {
    console.log(JSON.stringify({ ok: true, runnerId: runner.id, claimed: false, execution: "idle" }));
    return;
  }

  const handoff = await writeHandoff(packet, runner);
  console.log(JSON.stringify({
    ok: true,
    runnerId: runner.id,
    claimed: true,
    packetId: packet.id,
    proposalId: packet.proposalId,
    projectId: packet.projectId,
    status: packet.status,
    handoffPath: handoff.handoffPath,
  }));
}

async function main() {
  await runOnce();
  if (!WATCH) return;
  const intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, Number(process.env.RIDGEPATH_RUNNER_PACKET_SECONDS || DEFAULT_INTERVAL_SECONDS) || DEFAULT_INTERVAL_SECONDS);
  console.log(`RidgePath execution packet handoff active every ${intervalSeconds}s.`);
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
