import { neon } from "@neondatabase/serverless";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.resolve(process.cwd(), "data", "command-center");
const AGENT_RUNS_FILE = path.join(DATA_DIR, "agent-runs.json");
const PROPOSALS_FILE = path.join(DATA_DIR, "proposals.json");
const APPROVAL_EVENTS_FILE = path.join(DATA_DIR, "approval-events.json");
const FINDINGS_FILE = path.join(DATA_DIR, "findings.json");
const LOCAL_RUNNERS_FILE = path.join(DATA_DIR, "local-runners.json");
const COMMAND_REQUESTS_FILE = path.join(DATA_DIR, "command-requests.json");
const COMMAND_EVENTS_FILE = path.join(DATA_DIR, "command-events.json");
let commandCenterSql = null;
let schemaReady = false;
const RUNNER_STALE_MS = 2 * 60 * 1000;
const COMMAND_CLAIM_LEASE_MS = 5 * 60 * 1000;
const COMMAND_APPROVAL_STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);
const COMMAND_EXECUTION_STATUSES = new Set(["blocked", "queued", "claimed", "running", "succeeded", "failed", "cancelled"]);

function databaseUrl() {
  return process.env.COMMAND_CENTER_DATABASE_URL || process.env.DATABASE_URL || "";
}

function db() {
  const url = databaseUrl();
  if (!url) return null;
  commandCenterSql ??= neon(url);
  return commandCenterSql;
}

async function readJson(filePath, fallback = []) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, filePath);
}

function nowIso() {
  return new Date().toISOString();
}

function idFor(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function serializeJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function proposalFromRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    summary: row.summary,
    whyNow: row.why_now,
    risk: row.risk,
    confidence: row.confidence,
    status: row.status,
    suggestedExecutor: row.suggested_executor,
    targetBranchPolicy: row.target_branch_policy,
    validationPlan: parseJson(row.validation_plan, []),
    rollbackPlan: row.rollback_plan,
    evidence: parseJson(row.evidence, []),
    ownerNotes: row.owner_notes || "",
    createdByAgentRunId: row.created_by_agent_run_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentRunFromRow(row) {
  return {
    id: row.id,
    agentType: row.agent_type,
    machineId: row.machine_id,
    projectId: row.project_id || "",
    trigger: row.trigger,
    status: row.status,
    summary: row.summary,
    error: row.error || "",
    evidence: parseJson(row.evidence, []),
    startedAt: row.started_at,
    finishedAt: row.finished_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function commandRequestFromRow(row) {
  return normalizeCommandRequest({
    id: row.id,
    runnerId: row.runner_id,
    machineId: row.machine_id,
    projectId: row.project_id || "",
    proposalId: row.proposal_id || "",
    commandType: row.command_type,
    target: row.target,
    reason: row.reason,
    requestedBy: row.requested_by,
    approvalStatus: row.approval_status,
    executionStatus: row.execution_status,
    idempotencyKey: row.idempotency_key || "",
    payload: parseJson(row.payload, {}),
    result: parseJson(row.result, {}),
    error: row.error || "",
    approvedBy: row.approved_by || "",
    approvedAt: row.approved_at || "",
    claimedByRunnerId: row.claimed_by_runner_id || "",
    claimedAt: row.claimed_at || "",
    claimExpiresAt: row.claim_expires_at || "",
    finishedAt: row.finished_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function commandEventFromRow(row) {
  return {
    id: row.id,
    commandId: row.command_id,
    eventType: row.event_type,
    actor: row.actor,
    detail: parseJson(row.detail, {}),
    createdAt: row.created_at,
  };
}

function localRunnerFromRow(row) {
  return normalizeRunner({
    id: row.id,
    machineId: row.machine_id,
    displayName: row.display_name,
    hostname: row.hostname,
    username: row.username,
    platform: row.platform,
    architecture: row.architecture,
    workingDirectory: row.working_directory,
    capabilities: parseJson(row.capabilities, []),
    metadata: parseJson(row.metadata, {}),
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function normalizeCommandRequest(input = {}) {
  const timestamp = input.createdAt || input.updatedAt || nowIso();
  const approvalStatus = COMMAND_APPROVAL_STATUSES.has(input.approvalStatus) ? input.approvalStatus : "pending";
  const executionStatus = COMMAND_EXECUTION_STATUSES.has(input.executionStatus)
    ? input.executionStatus
    : approvalStatus === "approved"
      ? "queued"
      : "blocked";
  return {
    id: input.id || idFor("command"),
    runnerId: input.runnerId || "",
    machineId: input.machineId || "",
    projectId: input.projectId || "",
    proposalId: input.proposalId || "",
    commandType: input.commandType || "project-review",
    target: input.target || "",
    reason: input.reason || "",
    requestedBy: input.requestedBy || "owner",
    approvalStatus,
    executionStatus,
    idempotencyKey: input.idempotencyKey || "",
    payload: normalizeObject(input.payload),
    result: normalizeObject(input.result),
    error: input.error || "",
    approvedBy: input.approvedBy || "",
    approvedAt: input.approvedAt || "",
    claimedByRunnerId: input.claimedByRunnerId || "",
    claimedAt: input.claimedAt || "",
    claimExpiresAt: input.claimExpiresAt || "",
    finishedAt: input.finishedAt || "",
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

function normalizeRunner(input = {}) {
  const lastSeenAt = input.lastSeenAt || input.updatedAt || input.createdAt || "";
  const lastSeenTime = Date.parse(lastSeenAt);
  const stale = !lastSeenTime || Date.now() - lastSeenTime > RUNNER_STALE_MS;
  return {
    id: input.id || input.machineId || "local",
    machineId: input.machineId || input.id || "local",
    displayName: input.displayName || input.hostname || input.machineId || "Local Runner",
    hostname: input.hostname || "",
    username: input.username || "",
    platform: input.platform || "",
    architecture: input.architecture || "",
    workingDirectory: input.workingDirectory || "",
    capabilities: normalizeArray(input.capabilities),
    metadata: normalizeObject(input.metadata),
    status: stale ? "stale" : input.status || "online",
    paired: !stale && (input.status || "online") === "online",
    stale,
    lastSeenAt,
    createdAt: input.createdAt || lastSeenAt,
    updatedAt: input.updatedAt || lastSeenAt,
  };
}

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    create table if not exists agent_runs (
      id text primary key,
      agent_type text not null,
      machine_id text not null,
      project_id text,
      trigger text not null,
      status text not null,
      summary text not null default '',
      error text,
      evidence jsonb not null default '[]'::jsonb,
      started_at timestamptz not null,
      finished_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists findings (
      id text primary key,
      agent_run_id text references agent_runs(id) on delete set null,
      project_id text,
      title text not null,
      severity text not null default 'info',
      confidence text not null default 'medium',
      evidence jsonb not null default '[]'::jsonb,
      affected_files jsonb not null default '[]'::jsonb,
      recommended_action text not null default '',
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists proposals (
      id text primary key,
      project_id text,
      title text not null,
      summary text not null default '',
      why_now text not null default '',
      risk text not null default 'medium',
      confidence text not null default 'medium',
      status text not null default 'proposed',
      suggested_executor text not null default 'codex',
      target_branch_policy text not null default 'feature-branch',
      validation_plan jsonb not null default '[]'::jsonb,
      rollback_plan text not null default '',
      evidence jsonb not null default '[]'::jsonb,
      owner_notes text not null default '',
      created_by_agent_run_id text references agent_runs(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists approval_events (
      id text primary key,
      proposal_id text not null references proposals(id) on delete cascade,
      decision text not null,
      decided_by text not null default 'owner',
      comment text not null default '',
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists local_runners (
      id text primary key,
      machine_id text not null,
      display_name text not null default '',
      hostname text not null default '',
      username text not null default '',
      platform text not null default '',
      architecture text not null default '',
      working_directory text not null default '',
      capabilities jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      status text not null default 'online',
      last_seen_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists command_requests (
      id text primary key,
      runner_id text,
      machine_id text,
      project_id text,
      proposal_id text references proposals(id) on delete set null,
      command_type text not null,
      target text not null default '',
      reason text not null default '',
      requested_by text not null default 'owner',
      approval_status text not null default 'pending',
      execution_status text not null default 'blocked',
      idempotency_key text not null default '',
      payload jsonb not null default '{}'::jsonb,
      result jsonb not null default '{}'::jsonb,
      error text not null default '',
      approved_by text,
      approved_at timestamptz,
      claimed_by_runner_id text,
      claimed_at timestamptz,
      claim_expires_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table command_requests add column if not exists claim_expires_at timestamptz`;
  await sql`
    create table if not exists command_events (
      id text primary key,
      command_id text not null references command_requests(id) on delete cascade,
      event_type text not null,
      actor text not null default 'system',
      detail jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;
  schemaReady = true;
}

export async function commandCenterStatus() {
  const sql = db();
  if (!sql) {
    return {
      storage: "local-json",
      databaseConfigured: false,
      dataDir: DATA_DIR,
    };
  }
  await ensureSchema(sql);
  return {
    storage: "neon",
    databaseConfigured: true,
  };
}

export async function listAgentRuns() {
  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const rows = await sql`
      select *
      from agent_runs
      order by started_at desc
      limit 100
    `;
    return rows.map(agentRunFromRow);
  }
  const runs = await readJson(AGENT_RUNS_FILE, []);
  return normalizeArray(runs).sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")));
}

export async function listProposals() {
  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const rows = await sql`
      select *
      from proposals
      order by updated_at desc
      limit 200
    `;
    return rows.map(proposalFromRow);
  }
  const proposals = await readJson(PROPOSALS_FILE, []);
  return normalizeArray(proposals).sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export async function listApprovalEvents(proposalId = "") {
  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const rows = proposalId
      ? await sql`
          select *
          from approval_events
          where proposal_id = ${proposalId}
          order by created_at desc
        `
      : await sql`
          select *
          from approval_events
          order by created_at desc
          limit 200
        `;
    return rows.map((row) => ({
      id: row.id,
      proposalId: row.proposal_id,
      decision: row.decision,
      decidedBy: row.decided_by,
      comment: row.comment,
      createdAt: row.created_at,
    }));
  }
  const events = normalizeArray(await readJson(APPROVAL_EVENTS_FILE, []));
  return events
    .filter((event) => !proposalId || event.proposalId === proposalId)
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

export async function listLocalRunners() {
  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const rows = await sql`
      select *
      from local_runners
      order by last_seen_at desc
      limit 50
    `;
    return rows.map(localRunnerFromRow);
  }

  const runners = normalizeArray(await readJson(LOCAL_RUNNERS_FILE, []));
  return runners
    .map(normalizeRunner)
    .sort((left, right) => String(right.lastSeenAt || "").localeCompare(String(left.lastSeenAt || "")));
}

export async function activeLocalRunners() {
  const runners = await listLocalRunners();
  return runners.filter((runner) => runner.paired);
}

export async function listCommandRequests(filters = {}) {
  const normalizedFilters = normalizeObject(filters);
  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const runnerId = normalizedFilters.runnerId || "";
    const rows = runnerId
      ? await sql`
          select *
          from command_requests
          where runner_id = ${runnerId} or claimed_by_runner_id = ${runnerId}
          order by updated_at desc
          limit 100
        `
      : await sql`
          select *
          from command_requests
          order by updated_at desc
          limit 200
        `;
    return rows.map(commandRequestFromRow);
  }

  const commands = normalizeArray(await readJson(COMMAND_REQUESTS_FILE, []));
  return commands
    .map(normalizeCommandRequest)
    .filter((command) => !normalizedFilters.runnerId || command.runnerId === normalizedFilters.runnerId || command.claimedByRunnerId === normalizedFilters.runnerId)
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, normalizedFilters.runnerId ? 100 : 200);
}

export async function listQueuedCommandsForRunner(runnerId = "") {
  const commands = await listCommandRequests({ runnerId });
  return commands.filter((command) =>
    command.approvalStatus === "approved" &&
    command.executionStatus === "queued" &&
    (!command.runnerId || !runnerId || command.runnerId === runnerId)
  );
}

export async function listCommandEvents(commandId = "") {
  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const rows = commandId
      ? await sql`
          select *
          from command_events
          where command_id = ${commandId}
          order by created_at desc
        `
      : await sql`
          select *
          from command_events
          order by created_at desc
          limit 250
        `;
    return rows.map(commandEventFromRow);
  }

  const events = normalizeArray(await readJson(COMMAND_EVENTS_FILE, []));
  return events
    .filter((event) => !commandId || event.commandId === commandId)
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, commandId ? events.length : 250);
}

async function appendCommandEvent(commandId, eventType, detail = {}, actor = "system") {
  const event = {
    id: idFor("command_event"),
    commandId,
    eventType,
    actor,
    detail: normalizeObject(detail),
    createdAt: nowIso(),
  };

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    await sql`
      insert into command_events (id, command_id, event_type, actor, detail, created_at)
      values (${event.id}, ${event.commandId}, ${event.eventType}, ${event.actor}, ${serializeJson(event.detail)}::jsonb, ${event.createdAt})
    `;
    return event;
  }

  const events = normalizeArray(await readJson(COMMAND_EVENTS_FILE, []));
  events.unshift(event);
  await writeJson(COMMAND_EVENTS_FILE, events.slice(0, 1000));
  return event;
}

export async function claimNextCommandForRunner(runnerId = "") {
  const normalizedRunnerId = String(runnerId || "").trim();
  if (!normalizedRunnerId) throw new Error("Runner id is required to claim a command.");
  const timestamp = nowIso();
  const claimExpiresAt = new Date(Date.now() + COMMAND_CLAIM_LEASE_MS).toISOString();

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const rows = await sql`
      with candidate as (
        select id
        from command_requests
        where approval_status = 'approved'
          and execution_status = 'queued'
          and (runner_id is null or runner_id = '' or runner_id = ${normalizedRunnerId})
        order by approved_at nulls last, created_at asc
        limit 1
      )
      update command_requests
      set execution_status = 'claimed',
          claimed_by_runner_id = ${normalizedRunnerId},
          claimed_at = ${timestamp},
          claim_expires_at = ${claimExpiresAt},
          updated_at = ${timestamp}
      where id in (select id from candidate)
      returning *
    `;
    if (!rows[0]) return null;
    const command = commandRequestFromRow(rows[0]);
    await appendCommandEvent(command.id, "claimed", {
      runnerId: normalizedRunnerId,
      claimExpiresAt: command.claimExpiresAt,
      execution: "disabled",
    }, normalizedRunnerId);
    return command;
  }

  const commands = normalizeArray(await readJson(COMMAND_REQUESTS_FILE, [])).map(normalizeCommandRequest);
  const index = commands.findIndex((command) =>
    command.approvalStatus === "approved" &&
    command.executionStatus === "queued" &&
    (!command.runnerId || command.runnerId === normalizedRunnerId)
  );
  if (index < 0) return null;
  commands[index] = normalizeCommandRequest({
    ...commands[index],
    executionStatus: "claimed",
    claimedByRunnerId: normalizedRunnerId,
    claimedAt: timestamp,
    claimExpiresAt,
    updatedAt: timestamp,
  });
  await writeJson(COMMAND_REQUESTS_FILE, commands);
  await appendCommandEvent(commands[index].id, "claimed", {
    runnerId: normalizedRunnerId,
    claimExpiresAt,
    execution: "disabled",
  }, normalizedRunnerId);
  return commands[index];
}

export async function createCommandRequest(input = {}) {
  const timestamp = nowIso();
  const command = normalizeCommandRequest({
    ...input,
    approvalStatus: input.approvalStatus || "pending",
    executionStatus: input.executionStatus || "blocked",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (!command.commandType.trim()) throw new Error("Command type is required.");
  if (!command.reason.trim()) throw new Error("Reason is required before a command can enter the approval queue.");

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    await sql`
      insert into command_requests (
        id, runner_id, machine_id, project_id, proposal_id, command_type, target, reason, requested_by,
        approval_status, execution_status, idempotency_key, payload, result, error, approved_by, approved_at,
        claimed_by_runner_id, claimed_at, finished_at, created_at, updated_at
      )
      values (
        ${command.id}, ${command.runnerId || null}, ${command.machineId || null}, ${command.projectId || null}, ${command.proposalId || null},
        ${command.commandType}, ${command.target}, ${command.reason}, ${command.requestedBy}, ${command.approvalStatus}, ${command.executionStatus},
        ${command.idempotencyKey}, ${serializeJson(command.payload)}::jsonb, ${serializeJson(command.result)}::jsonb, ${command.error},
        ${command.approvedBy || null}, ${command.approvedAt || null}, ${command.claimedByRunnerId || null}, ${command.claimedAt || null},
        ${command.finishedAt || null}, ${command.createdAt}, ${command.updatedAt}
      )
    `;
    await appendCommandEvent(command.id, "created", {
      commandType: command.commandType,
      runnerId: command.runnerId,
      projectId: command.projectId,
      approvalStatus: command.approvalStatus,
      executionStatus: command.executionStatus,
    }, command.requestedBy);
    return command;
  }

  const commands = normalizeArray(await readJson(COMMAND_REQUESTS_FILE, []));
  commands.unshift(command);
  await writeJson(COMMAND_REQUESTS_FILE, commands.slice(0, 500));
  await appendCommandEvent(command.id, "created", {
    commandType: command.commandType,
    runnerId: command.runnerId,
    projectId: command.projectId,
    approvalStatus: command.approvalStatus,
    executionStatus: command.executionStatus,
  }, command.requestedBy);
  return command;
}

export async function updateCommandRequest(commandId, patch = {}) {
  const timestamp = nowIso();
  const normalizedPatch = normalizeObject(patch);
  if (normalizedPatch.approvalStatus && !COMMAND_APPROVAL_STATUSES.has(normalizedPatch.approvalStatus)) {
    throw new Error(`Unsupported command approval status: ${normalizedPatch.approvalStatus}`);
  }
  if (normalizedPatch.executionStatus && !COMMAND_EXECUTION_STATUSES.has(normalizedPatch.executionStatus)) {
    throw new Error(`Unsupported command execution status: ${normalizedPatch.executionStatus}`);
  }

  const applyPatch = (current) => {
    const approvalStatus = normalizedPatch.approvalStatus || current.approvalStatus;
    const executionStatus = normalizedPatch.executionStatus || (
      approvalStatus === "approved" && current.executionStatus === "blocked" ? "queued" : current.executionStatus
    );
    return normalizeCommandRequest({
      ...current,
      approvalStatus,
      executionStatus,
      result: normalizedPatch.result ? normalizeObject(normalizedPatch.result) : current.result,
      error: normalizedPatch.error ?? current.error,
      approvedBy: approvalStatus === "approved" ? normalizedPatch.approvedBy || current.approvedBy || "owner" : current.approvedBy,
      approvedAt: approvalStatus === "approved" ? current.approvedAt || timestamp : current.approvedAt,
      finishedAt: ["succeeded", "failed", "cancelled"].includes(executionStatus) ? current.finishedAt || timestamp : current.finishedAt,
      updatedAt: timestamp,
    });
  };

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const existing = await sql`select * from command_requests where id = ${commandId} limit 1`;
    if (!existing.length) throw new Error("Command request not found.");
    const next = applyPatch(commandRequestFromRow(existing[0]));
    await sql`
      update command_requests
      set approval_status = ${next.approvalStatus},
          execution_status = ${next.executionStatus},
          result = ${serializeJson(next.result)}::jsonb,
          error = ${next.error},
          approved_by = ${next.approvedBy || null},
          approved_at = ${next.approvedAt || null},
          finished_at = ${next.finishedAt || null},
          updated_at = ${next.updatedAt}
      where id = ${commandId}
    `;
    await appendCommandEvent(commandId, "updated", {
      approvalStatus: next.approvalStatus,
      executionStatus: next.executionStatus,
      error: next.error,
    }, normalizedPatch.approvedBy || normalizedPatch.actor || "owner");
    return next;
  }

  const commands = normalizeArray(await readJson(COMMAND_REQUESTS_FILE, []));
  const index = commands.findIndex((command) => command.id === commandId);
  if (index < 0) throw new Error("Command request not found.");
  commands[index] = applyPatch(normalizeCommandRequest(commands[index]));
  await writeJson(COMMAND_REQUESTS_FILE, commands);
  await appendCommandEvent(commandId, "updated", {
    approvalStatus: commands[index].approvalStatus,
    executionStatus: commands[index].executionStatus,
    error: commands[index].error,
  }, normalizedPatch.approvedBy || normalizedPatch.actor || "owner");
  return commands[index];
}

export async function upsertLocalRunner(input = {}) {
  const timestamp = nowIso();
  const runner = normalizeRunner({
    ...input,
    id: input.id || input.machineId,
    machineId: input.machineId || input.id,
    status: input.status || "online",
    lastSeenAt: timestamp,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  });

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    await sql`
      insert into local_runners (
        id, machine_id, display_name, hostname, username, platform, architecture, working_directory,
        capabilities, metadata, status, last_seen_at, created_at, updated_at
      )
      values (
        ${runner.id}, ${runner.machineId}, ${runner.displayName}, ${runner.hostname}, ${runner.username},
        ${runner.platform}, ${runner.architecture}, ${runner.workingDirectory},
        ${serializeJson(runner.capabilities)}::jsonb, ${serializeJson(runner.metadata)}::jsonb,
        ${runner.status}, ${runner.lastSeenAt}, ${runner.createdAt}, ${runner.updatedAt}
      )
      on conflict (id) do update set
        machine_id = excluded.machine_id,
        display_name = excluded.display_name,
        hostname = excluded.hostname,
        username = excluded.username,
        platform = excluded.platform,
        architecture = excluded.architecture,
        working_directory = excluded.working_directory,
        capabilities = excluded.capabilities,
        metadata = excluded.metadata,
        status = excluded.status,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `;
    return runner;
  }

  const runners = normalizeArray(await readJson(LOCAL_RUNNERS_FILE, []));
  const index = runners.findIndex((candidate) => (candidate.id || candidate.machineId) === runner.id);
  if (index >= 0) runners[index] = { ...runners[index], ...runner };
  else runners.unshift(runner);
  await writeJson(LOCAL_RUNNERS_FILE, runners.slice(0, 50));
  return runner;
}

export async function createAgentRun(input = {}) {
  const timestamp = nowIso();
  const run = {
    id: input.id || idFor("run"),
    agentType: input.agentType || "project-review",
    machineId: input.machineId || process.env.COMPUTERNAME || "local",
    projectId: input.projectId || "",
    trigger: input.trigger || "manual",
    status: input.status || "completed",
    summary: input.summary || "",
    error: input.error || "",
    evidence: normalizeArray(input.evidence),
    startedAt: input.startedAt || timestamp,
    finishedAt: input.finishedAt || timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    await sql`
      insert into agent_runs (
        id, agent_type, machine_id, project_id, trigger, status, summary, error, evidence, started_at, finished_at, created_at, updated_at
      )
      values (
        ${run.id}, ${run.agentType}, ${run.machineId}, ${run.projectId || null}, ${run.trigger}, ${run.status}, ${run.summary}, ${run.error || null},
        ${serializeJson(run.evidence)}::jsonb, ${run.startedAt}, ${run.finishedAt || null}, ${run.createdAt}, ${run.updatedAt}
      )
    `;
    return run;
  }

  const runs = normalizeArray(await readJson(AGENT_RUNS_FILE, []));
  runs.unshift(run);
  await writeJson(AGENT_RUNS_FILE, runs.slice(0, 250));
  return run;
}

export async function createProposal(input = {}) {
  const timestamp = nowIso();
  const proposal = {
    id: input.id || idFor("proposal"),
    projectId: input.projectId || "",
    title: input.title || "Needs review",
    summary: input.summary || "",
    whyNow: input.whyNow || "",
    risk: input.risk || "medium",
    confidence: input.confidence || "medium",
    status: input.status || "proposed",
    suggestedExecutor: input.suggestedExecutor || "codex",
    targetBranchPolicy: input.targetBranchPolicy || "feature-branch",
    validationPlan: normalizeArray(input.validationPlan),
    rollbackPlan: input.rollbackPlan || "",
    evidence: normalizeArray(input.evidence),
    ownerNotes: input.ownerNotes || "",
    createdByAgentRunId: input.createdByAgentRunId || "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    await sql`
      insert into proposals (
        id, project_id, title, summary, why_now, risk, confidence, status, suggested_executor, target_branch_policy,
        validation_plan, rollback_plan, evidence, owner_notes, created_by_agent_run_id, created_at, updated_at
      )
      values (
        ${proposal.id}, ${proposal.projectId || null}, ${proposal.title}, ${proposal.summary}, ${proposal.whyNow}, ${proposal.risk},
        ${proposal.confidence}, ${proposal.status}, ${proposal.suggestedExecutor}, ${proposal.targetBranchPolicy},
        ${serializeJson(proposal.validationPlan)}::jsonb, ${proposal.rollbackPlan}, ${serializeJson(proposal.evidence)}::jsonb,
        ${proposal.ownerNotes}, ${proposal.createdByAgentRunId || null}, ${proposal.createdAt}, ${proposal.updatedAt}
      )
    `;
    return proposal;
  }

  const proposals = normalizeArray(await readJson(PROPOSALS_FILE, []));
  proposals.unshift(proposal);
  await writeJson(PROPOSALS_FILE, proposals);
  return proposal;
}

export async function updateProposal(proposalId, patch = {}) {
  const allowedStatuses = new Set(["proposed", "approved", "rejected", "deferred", "needs-evidence", "executing", "complete"]);
  const timestamp = nowIso();
  const normalizedPatch = normalizeObject(patch);
  if (normalizedPatch.status && !allowedStatuses.has(normalizedPatch.status)) {
    throw new Error(`Unsupported proposal status: ${normalizedPatch.status}`);
  }

  const sql = db();
  if (sql) {
    await ensureSchema(sql);
    const existing = await sql`select * from proposals where id = ${proposalId} limit 1`;
    if (!existing.length) throw new Error("Proposal not found.");
    const current = proposalFromRow(existing[0]);
    const next = {
      ...current,
      status: normalizedPatch.status || current.status,
      ownerNotes: normalizedPatch.ownerNotes ?? current.ownerNotes,
      targetBranchPolicy: normalizedPatch.targetBranchPolicy || current.targetBranchPolicy,
      updatedAt: timestamp,
    };
    await sql`
      update proposals
      set status = ${next.status},
          owner_notes = ${next.ownerNotes},
          target_branch_policy = ${next.targetBranchPolicy},
          updated_at = ${next.updatedAt}
      where id = ${proposalId}
    `;
    if (normalizedPatch.decision) {
      await sql`
        insert into approval_events (id, proposal_id, decision, decided_by, comment, created_at)
        values (${idFor("approval")}, ${proposalId}, ${normalizedPatch.decision}, ${normalizedPatch.decidedBy || "owner"}, ${normalizedPatch.comment || ""}, ${timestamp})
      `;
    }
    return next;
  }

  const proposals = normalizeArray(await readJson(PROPOSALS_FILE, []));
  const index = proposals.findIndex((proposal) => proposal.id === proposalId);
  if (index < 0) throw new Error("Proposal not found.");
  proposals[index] = {
    ...proposals[index],
    status: normalizedPatch.status || proposals[index].status,
    ownerNotes: normalizedPatch.ownerNotes ?? proposals[index].ownerNotes,
    targetBranchPolicy: normalizedPatch.targetBranchPolicy || proposals[index].targetBranchPolicy,
    updatedAt: timestamp,
  };
  await writeJson(PROPOSALS_FILE, proposals);
  if (normalizedPatch.decision) {
    const events = normalizeArray(await readJson(APPROVAL_EVENTS_FILE, []));
    events.unshift({
      id: idFor("approval"),
      proposalId,
      decision: normalizedPatch.decision,
      decidedBy: normalizedPatch.decidedBy || "owner",
      comment: normalizedPatch.comment || "",
      createdAt: timestamp,
    });
    await writeJson(APPROVAL_EVENTS_FILE, events);
  }
  return proposals[index];
}

export async function createProjectReviewRun(project) {
  const timestamp = nowIso();
  const bootstrap = normalizeObject(project.bootstrap);
  const projectContext = String(bootstrap.projectContext || "").trim();
  const keyFeatures = String(bootstrap.keyFeatures || "").trim();
  const evidence = [
    `Project path: ${project.path}`,
    `Status: ${project.status}`,
    `Framework: ${project.framework}`,
    `Services: ${(project.services || []).length}`,
    `Git: ${project.git?.dirty ? "dirty" : "clean"}${project.git?.branch ? ` on ${project.git.branch}` : ""}`,
    projectContext ? `Project context: ${projectContext}` : "",
    keyFeatures ? `Key features: ${keyFeatures}` : "",
  ].filter(Boolean);
  const run = await createAgentRun({
    agentType: "project-review",
    projectId: project.id,
    trigger: "manual",
    status: "completed",
    summary: `Read-only review completed for ${project.name}.`,
    evidence,
    startedAt: timestamp,
    finishedAt: timestamp,
  });

  const proposals = [];
  if (project.git?.dirty) {
    proposals.push(await createProposal({
      projectId: project.id,
      title: "Review dirty working tree",
      summary: `${project.name} has uncommitted changes that should be reviewed before automated work continues.`,
      whyNow: "Dirty worktrees make agent execution and approval audit harder to reason about.",
      risk: "medium",
      confidence: "high",
      suggestedExecutor: "codex",
      targetBranchPolicy: "feature-branch",
      validationPlan: ["Inspect git diff", "Classify changes as intentional or unrelated", "Recommend commit, stash, or split work"],
      rollbackPlan: "No mutation is proposed by this review.",
      evidence,
      createdByAgentRunId: run.id,
    }));
  }
  if (!project.projectManagement?.initialized) {
    proposals.push(await createProposal({
      projectId: project.id,
      title: "Initialize project management artifacts",
      summary: `${project.name} does not appear to have initialized Forge project-management artifacts.`,
      whyNow: "Agent review loops need roadmap, backlog, bug, governance, and activity artifacts to produce useful proposals.",
      risk: "low",
      confidence: "medium",
      suggestedExecutor: "codex",
      targetBranchPolicy: "feature-branch",
      validationPlan: ["Create or verify docs/project-management files", "Generate project-dashboard.json", "Record codex activity"],
      rollbackPlan: "Remove generated project-management files from the feature branch if rejected.",
      evidence,
      createdByAgentRunId: run.id,
    }));
  }
  if (!proposals.length) {
    proposals.push(await createProposal({
      projectId: project.id,
      title: "Schedule deeper project review",
      summary: `${project.name} has no immediate dirty-worktree or project-management initialization finding from the lightweight scan.`,
      whyNow: "A deeper review can inspect tests, dependencies, deployment readiness, and UX gaps.",
      risk: "low",
      confidence: "medium",
      suggestedExecutor: "codex",
      targetBranchPolicy: "feature-branch",
      validationPlan: ["Run targeted read-only project audit", "Create evidence-backed recommendations", "Return proposals for owner approval"],
      rollbackPlan: "No mutation is proposed by this review.",
      evidence,
      createdByAgentRunId: run.id,
    }));
  }

  return { run, proposals };
}
