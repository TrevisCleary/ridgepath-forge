import { neon } from "@neondatabase/serverless";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.resolve(process.cwd(), "data", "command-center");
const AGENT_RUNS_FILE = path.join(DATA_DIR, "agent-runs.json");
const PROPOSALS_FILE = path.join(DATA_DIR, "proposals.json");
const APPROVAL_EVENTS_FILE = path.join(DATA_DIR, "approval-events.json");
const FINDINGS_FILE = path.join(DATA_DIR, "findings.json");
let commandCenterSql = null;
let schemaReady = false;

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
