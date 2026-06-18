# Forge Storage Architecture

Created: 2026-06-18

## Decision

Use a hybrid storage model.

Do not move every JSON file into Neon.

Do move command-center coordination data into Neon before building serious multi-machine agent loops.

For agent findings and approvals, prioritize queryable structured storage. Markdown can still be generated later as an export or project-context artifact, but it should not be the primary query/index layer.

## Storage Layers

| Layer | Best storage | Why |
| --- | --- | --- |
| Local runtime control | Local Forge Agent memory/files | Start/stop/open-folder actions are machine-specific. |
| Local launcher preferences | Local JSON | Machine-specific overrides should not automatically apply everywhere. |
| Ridge Fabric source of truth | Syncthing-friendly JSON + generated Markdown | Human-readable, portable, resilient, works without internet/database. |
| Project-owned PM artifacts | Markdown/JSON inside each repo | Project state can travel with the project and remain Codex-readable when useful. |
| Agent findings | Neon plus optional generated Markdown | Forge needs queryable, filterable findings; Markdown can be generated for project context later. |
| Agent runs/proposals/approvals | Neon | Multi-machine coordination, queueing, review, audit history, central visibility. |
| Hosted command-center read model | Neon plus optional generated snapshots | Hosted UI needs centralized queryable state. |

## What Should Stay Local JSON

Current Forge local files:

- `data/project-overrides.json`
- `data/project-registry.json`
- `data/activity-log.json`

Recommended treatment:

- Keep these local for now.
- Treat them as local-agent state, not cross-machine truth.
- Later, sync selected normalized fields into Neon as observations.

Why:

- Different machines may have different project paths, ports, availability, running state, and local notes.
- Local start/stop behavior depends on the active machine.
- Making local paths globally authoritative would create false state on other machines.

## What Should Stay Ridge Fabric JSON

Current registry:

- `C:\Development\Shared\ridge-fabric-registry\devices\*.json`
- `C:\Development\Shared\ridge-fabric-registry\devices.md`
- `C:\Development\Shared\ridge-fabric-registry\networks\*`
- `C:\Development\Shared\ridge-fabric-registry\workloads\*`

Recommended treatment:

- Keep JSON/Markdown as canonical source-of-truth for topology.
- Use Neon only as an indexed/read model if needed.
- Keep generated Markdown for human review and Codex context.

Why:

- Syncthing keeps topology available across machines.
- The files are easy to inspect, diff, repair, and attach to Codex sessions.
- The registry should remain useful even if Neon is offline.

## What Should Move To Neon

Move these planned features to Neon early:

- Agent runs.
- Agent findings.
- Proposals.
- Approval decisions.
- Execution packets.
- Review queue.
- Project scan snapshots.
- Cross-project PM rollups.
- Agent schedules.
- Agent heartbeat/status records.

Why:

- These are coordination records, not local machine preferences.
- Waypoint and other machines need one shared queue.
- Hosted Forge needs queryable state.
- Approvals need audit history.
- JSON files will become awkward once multiple machines and scheduled agents are writing observations.

## Findings As Queryable Records

Waypoint should create structured finding and proposal records that Forge can query efficiently.

Neon is the primary coordination/query layer for:

- findings
- recommendations
- proposal status
- owner decisions
- execution status
- validation evidence

Markdown should be optional output, not the operational source of truth.

Optional project artifacts later:

- `docs/project-management/agent-findings.md`
- `docs/project-management/recommendations.md`
- `docs/project-management/approval-history.md`
- `docs/project-management/codex-activity.md`
- `docs/project-management/project-dashboard.json`

If generated, Markdown should be derived from Neon/repository state and should not be required for Forge querying.

Recommended structured fields:

- finding file path
- finding section anchor
- proposal status
- approval decision
- assigned executor
- target branch
- execution status
- validation result

## Feedback Loop

Owner feedback should update Neon first. Optional Markdown/project-management artifacts can be generated or updated after the structured decision is recorded.

Example flow:

1. Waypoint runs a read-only scan.
2. Waypoint writes agent run, finding, and proposal records to Neon.
3. Forge shows the proposal in the Approval Queue.
4. Owner approves, rejects, defers, or adds direction.
5. Forge records the decision in Neon.
6. Waypoint or Codex may generate/update Markdown artifacts for project context.
7. If approved, Codex creates an execution branch/worktree and implements the work.
8. Codex returns validation evidence.
9. Forge updates proposal/execution status and, when configured, project-management artifacts.

## Branch Target Policy

Approvals must specify where implementation is allowed to land.

Recommended approval options:

- Create feature branch.
- Use existing active branch.
- Open pull request only.
- Push directly to `main`.

Default should be feature branch or PR.

Direct push to `main` should require explicit approval for that proposal.

## Proposed Neon Tables

### command_center_projects

Canonical project catalog/read model.

Fields:

- `id`
- `name`
- `repository_url`
- `default_branch`
- `primary_local_path`
- `audience`
- `owner`
- `status`
- `created_at`
- `updated_at`

### machine_observations

What each local agent sees on a machine.

Fields:

- `id`
- `machine_id`
- `project_id`
- `observed_path`
- `branch`
- `commit_sha`
- `dirty`
- `running`
- `managed_running`
- `ports`
- `observed_at`
- `raw_summary`

### agent_runs

Every scheduled or manual agent pass.

Fields:

- `id`
- `agent_type`
- `machine_id`
- `project_id`
- `trigger`
- `status`
- `started_at`
- `finished_at`
- `summary`
- `error`
- `evidence`

### findings

Normalized findings produced by agent runs.

Fields:

- `id`
- `agent_run_id`
- `project_id`
- `title`
- `severity`
- `confidence`
- `evidence`
- `affected_files`
- `recommended_action`
- `created_at`

### proposals

Approval queue records.

Fields:

- `id`
- `project_id`
- `title`
- `summary`
- `why_now`
- `risk`
- `confidence`
- `status`
- `suggested_executor`
- `validation_plan`
- `rollback_plan`
- `created_by_agent_run_id`
- `created_at`
- `updated_at`

### approval_events

Owner decisions and audit trail.

Fields:

- `id`
- `proposal_id`
- `decision`
- `decided_by`
- `comment`
- `created_at`

### command_requests

Owner-approved local runner actions.

Fields:

- `id`
- `runner_id`
- `machine_id`
- `project_id`
- `proposal_id`
- `command_type`
- `target`
- `reason`
- `requested_by`
- `approval_status`
- `execution_status`
- `idempotency_key`
- `payload`
- `result`
- `error`
- `approved_by`
- `approved_at`
- `claimed_by_runner_id`
- `claimed_at`
- `claim_expires_at`
- `finished_at`
- `created_at`
- `updated_at`

### command_events

Immutable audit events for command request changes.

Fields:

- `id`
- `command_id`
- `event_type`
- `actor`
- `detail`
- `created_at`

### execution_packets

Approved work packets for Codex/local agents.

Fields:

- `id`
- `proposal_id`
- `project_id`
- `objective`
- `constraints`
- `branch_name`
- `status`
- `validation_result`
- `result`
- `error`
- `claimed_by_runner_id`
- `claimed_at`
- `claim_expires_at`
- `finished_at`
- `created_at`
- `updated_at`

### execution_packet_events

Immutable packet audit events.

Fields:

- `id`
- `packet_id`
- `event_type`
- `actor`
- `detail`
- `created_at`

## Waypoint Role

Waypoint should not need the whole truth in local JSON.

Waypoint should:

- Keep repos updated through GitHub runner or scheduled fetch.
- Run read-only review agents.
- Write agent runs/findings/proposals to Neon.
- Avoid local project start/stop unless Waypoint is explicitly the runtime host.
- Push no changes without owner approval.

## Local Machine Role

Each active work machine should:

- Run local Forge Agent.
- Report observations to Neon.
- Execute local start/stop/open-folder actions only for that machine.
- Update local project state.
- Optionally write Ridge Fabric JSON when approved.

## Hosted Forge Role

Hosted Forge should:

- Read projects, proposals, agent runs, approvals, and rollups from Neon.
- Show Ridge Fabric read model.
- Let owner approve/reject/defer work.
- Start local execution only through a paired local agent.

## Migration Plan

### Step 1: Keep current local JSON working

Do not block Waypoint setup on a full migration.

### Step 2: Add Neon command-center tables

Start with:

- `agent_runs`
- `findings`
- `proposals`
- `approval_events`
- `machine_observations`

### Step 3: Add repository abstraction

Forge should read/write proposals through a repository module:

- Neon when `COMMAND_CENTER_DATABASE_URL` is configured.
- Local JSON fallback for offline development.

### Step 4: Add Waypoint runner

Waypoint writes to Neon, not to a shared JSON queue.

### Step 5: Add hosted Forge mode

Hosted Forge reads from Neon and disables local actions unless paired with a local agent.

## Recommendation Before Moving To Waypoint

It is not necessary to migrate existing Forge JSON files before remoting into Waypoint.

It is recommended to define and implement Neon-backed proposal/agent-run storage before relying on Waypoint for continuous agent loops.

In short:

- Move to Waypoint for setup and runner planning now.
- Do not start multi-machine autonomous review loops against JSON-only storage.
- Build the Neon-backed approval queue first.

## Current Implementation Status

As of 2026-06-18, Forge has the first Neon-backed command-center storage pass in place:

- `COMMAND_CENTER_DATABASE_URL` is the command-center-specific database setting.
- `.env.local` is loaded by the API watchdog and ignored by Git.
- `agent_runs`, `findings`, `proposals`, `approval_events`, `execution_packets`, `execution_packet_events`, `local_runners`, `command_center_projects`, `command_requests`, and `command_events` are created automatically when Neon is configured.
- Local JSON remains available as an offline fallback for the same repository API.
- Owner feedback, approval events, and proposal branch target policy are persisted in Neon.
- New-project bootstrap context and key features are captured locally in the project registry and surfaced back through project discovery for future review agents.
- Approved proposals create durable `execution_packets` for Codex or a local runner to pick up as owner-authorized implementation work.
- Execution packets can now be claimed, updated, completed, failed, cancelled, and audited through `execution_packet_events`.
- Runtime command requests can be queued, approved, claimed, executed through an allowlisted local runner, and audited through command events.
- Hosted Projects are populated through `runner:sync-projects`, which reads the local Forge API and publishes a hosted-safe project catalog snapshot into Neon.

Do not use the generic `DATABASE_URL` for this feature unless the intent is to make every Forge database consumer share the same database. Prefer feature-specific variables such as `COMMAND_CENTER_DATABASE_URL` and, later, `DEMO_DATABASE_URL`.
