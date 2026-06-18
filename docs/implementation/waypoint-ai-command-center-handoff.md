# Waypoint AI Command Center Handoff

Created: 2026-06-18

## Current Local State

Repository: `C:\Development\Shared\ridgepath-forge`

Branch: `codex/forge-command-center-ui`

Review UI: `http://127.0.0.1:3075`

Local API: `http://127.0.0.1:3059`

Latest verified local checks:

- `GET http://127.0.0.1:3059/api/health` returned HTTP 200.
- `GET http://127.0.0.1:3075` returned HTTP 200.
- `npm.cmd run build` passed.
- Browser smoke test on port `3075` verified Overview, Projects, Fabric, and Runtime.

## Important Handoff Caveat

The branch currently has uncommitted working-tree changes. Do not assume Waypoint can get this exact state by only checking out `codex/forge-command-center-ui` from GitHub unless the branch is intentionally committed and pushed first.

Transfer options:

1. If Syncthing copies `C:\Development\Shared\ridgepath-forge` to Waypoint, use the synced working tree directly.
2. If Waypoint will clone from GitHub, first create an intentional commit/push from this machine.
3. If avoiding a commit, create and apply a patch bundle on Waypoint.

## What Exists Now

### Command Center UI

- Left navigation shell.
- Top command bar.
- Overview page.
- Existing Projects page preserved.
- Existing Ridge Fabric page preserved.
- Runtime, Automation, Publishing, Operations Library, and Settings placeholders.

### Ridge Fabric

- Registry source of truth: `C:\Development\Shared\ridge-fabric-registry`.
- Device records: `devices\*.json`.
- Generated summary: `devices.md`.
- Copy Inventory Prompt includes the Atlas topology-auditor prompt and Ridge Fabric JSON deliverable.

### AI Command Center Planning

Primary docs:

- `docs/implementation/forge-command-center-improvement-plan.md`
- `docs/implementation/forge-ai-command-center-agent-model.md`
- `docs/implementation/forge-storage-architecture.md`
- `docs/implementation/ridge-fabric-refactor-project.md`

The AI model is approval-centered:

1. Agents inspect.
2. Agents create evidence-backed proposals.
3. Owner approves/rejects/defers.
4. Approved work becomes a Codex task packet.
5. Execution happens in branch/worktree context.
6. Results return with validation evidence.

## Recommended Waypoint Setup

Waypoint should run background review loops, not unsupervised project mutations.

Recommended first Waypoint responsibilities:

- Scheduled read-only project inventory scans.
- Scheduled project-management freshness scans.
- Scheduled Ridge Fabric workload/device drift scans.
- Markdown finding and recommendation updates in project repositories.
- Proposal generation.
- Agent-run logging.

Implemented Forge foundation for owner-approved agent review:

- `GET /api/agent-runs`
- `POST /api/agent-runs/project-review`
- `GET /api/proposals`
- `PATCH /api/proposals/:id`
- Approval Queue UI.
- Agent Runs UI.
- Neon-primary/local-JSON-fallback storage for agent runs, proposals, and approval events.

Use local JSON only as an offline fallback. Do not use shared JSON as the long-term queue for multi-machine agent coordination.

## Waypoint Markdown Feedback Loop

Waypoint should create and update project-level Markdown findings as durable artifacts.

Recommended files per project:

- `docs/project-management/agent-findings.md`
- `docs/project-management/recommendations.md`
- `docs/project-management/approval-history.md`
- `docs/project-management/codex-activity.md`
- `docs/project-management/project-dashboard.json`

Expected flow:

1. Waypoint pulls/fetches the project repository.
2. Waypoint runs a read-only review.
3. Waypoint writes structured findings and evidence to Neon.
4. Waypoint writes proposal metadata to Neon, including project context, confidence, risk, validation plan, rollback plan, evidence, and optional report/export references.
5. Forge shows the proposal in the Approval Queue.
6. Owner saves feedback, approves, rejects, defers, or requests more evidence.
7. Approval records the allowed branch target:
   - feature branch
   - current active branch
   - pull request only
   - direct `main`
8. Codex executes only after approval and only according to that branch policy.
9. Codex updates implementation, validation evidence, and PM artifacts.
10. Waypoint/Forge updates proposal status and approval history.

Default branch policy should be feature branch or pull request. Direct push to `main` requires explicit owner approval for that proposal.

Markdown is optional supporting material, not the coordination source of truth. Neon should remain the queryable system of record for runs, findings, proposals, approval feedback, execution state, and audit history.

## Startup Commands

From the repo root on the active machine:

```powershell
cd C:\Development\Shared\ridgepath-forge
git status --short
git branch --show-current
npm.cmd install
npm.cmd run build
```

For normal local Forge:

```powershell
& 'C:\Development\Shared\ridgepath-forge\scripts\restart-launcher.ps1'
```

For temporary command-center review UI:

```powershell
npm.cmd run client -- --host 127.0.0.1 --port 3075
```

Health checks:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:3059/api/health' -UseBasicParsing
Invoke-WebRequest -Uri 'http://127.0.0.1:3075' -UseBasicParsing
```

## Hosted Ops Emergency Access Gate

`ops.ridgepath.io` should not be public while DNS and hosted deployment setup are settling.

Current emergency control:

- Root `middleware.js` protects all hosted routes with HTTP Basic Auth.
- Required Vercel environment variables:
  - `OPS_AUTH_USERNAME`
  - `OPS_AUTH_PASSWORD`
- If either variable is missing, hosted Ops returns HTTP 503 instead of serving the app.
- Keep `COMMAND_CENTER_DATABASE_URL` configured separately for Neon-backed command-center records.

Recommended immediate Vercel settings:

- Enable Vercel Authentication or Deployment Protection for the project if available on the active plan.
- Keep the middleware gate even with Vercel protection until Microsoft/Entra auth is implemented.
- Do not put local runner secrets, RustDesk unattended passwords, or local filesystem credentials into Vercel env vars.

Durable follow-up:

- Replace Basic Auth with Microsoft/Entra authentication tied to the RidgePath operator account.
- Keep local machine actions behind a paired local runner, not direct hosted execution.

## Local Runner Foundation

Initial local-runner pairing is heartbeat-only. It does not execute remote commands.

Current runner behavior:

- `npm.cmd run runner:heartbeat` writes a single local-runner heartbeat to Neon.
- `npm.cmd run runner:start` runs the heartbeat loop every 60 seconds.
- `npm.cmd run runner:execute` claims and executes one approved queued command through the local Forge API.
- `npm.cmd run runner:execute:start` runs the approved-command executor loop every `RIDGEPATH_RUNNER_EXECUTE_SECONDS` seconds, defaulting to 15.
- `npm.cmd run runner:queue` writes a heartbeat and reads approved queued commands once.
- `npm.cmd run runner:queue:start` watches approved queued commands every `RIDGEPATH_RUNNER_QUEUE_SECONDS` seconds, defaulting to 60.
- `npm.cmd run runner:sync-all` publishes Projects, Fabric, and Operations Library snapshots into Neon.
- `npm.cmd run runner:sync-projects` reads the local Forge API and publishes the hosted project catalog into Neon.
- `npm.cmd run runner:sync-fabric` reads the local Forge API and publishes the hosted Ridge Fabric snapshot into Neon.
- `npm.cmd run runner:sync-operations` reads the local Forge API and publishes the hosted Operations Library validation snapshot into Neon.
- The runner loads `.env.local` or `.env` and uses `COMMAND_CENTER_DATABASE_URL`.
- Runner identity defaults to the Windows hostname and can be overridden with:
  - `RIDGEPATH_RUNNER_ID`
  - `RIDGEPATH_RUNNER_NAME`
- Hosted Ops reads `/api/runners` and `/api/command-center/status`.
- `/api/command-center/status` includes runner, project, Fabric, and command queue counts.
- A runner is considered paired while it is online and not stale.
- Queue monitoring reports approved commands but does not claim or execute them.

Current capabilities reported by the heartbeat:

- `heartbeat`
- `project-catalog-sync`
- `fabric-registry-sync`
- `operations-library-sync`
- `project-inventory`
- `fabric-inventory`
- `project-review`
- `command-queue-read`
- `approved-command-execution`
- `local-actions-require-approval`

## Command Queue Foundation

Hosted Ops has a command-request queue backed by local runner execution.

Current command queue behavior:

- `/api/commands` lists and creates command requests.
- `/api/commands/[commandId]` updates approval and execution state.
- `/api/commands/claim` atomically claims one approved queued command for a runner and assigns a five-minute lease.
- `/api/commands` returns recent command audit events with the command list.
- Command requests are persisted in Neon when `COMMAND_CENTER_DATABASE_URL` is configured.
- Local JSON remains available as an offline fallback.
- New requests require an owner reason and start as `approvalStatus: pending` and `executionStatus: blocked`.
- Owner approval moves a blocked request to `executionStatus: queued`.
- The Runtime page shows the queue and allows pending requests to be approved or cancelled.
- The local runner monitor can read-list queued requests without executing them.
- The local runner executor can claim approved queued requests and run allowlisted commands through the local Forge API.
- Command creation, updates, and claims write immutable `command_events` audit records.

Approved command execution is now available through the local runner executor, not through hosted Vercel.

Executor behavior:

- Claims one approved queued command at a time.
- Uses the existing local Forge API at `RIDGEPATH_LOCAL_FORGE_API`, defaulting to `http://127.0.0.1:3059`.
- Supports an explicit allowlist: project sync, Fabric sync, Operations sync, project review, project start/stop/restart/take-over/git-sync, project-management initialization, portfolio draft creation, project registration, project description update, Fabric device update/remove, and project-folder open.
- Writes `running`, `succeeded`, or `failed` back to Neon with command events.
- Refreshes the hosted Projects snapshot after successful local project mutations.
- Refreshes the hosted Fabric snapshot after successful Fabric device mutations.
- Unsupported command types fail closed with an error.

On 2026-06-18, `411100-PCK39` completed an end-to-end safe runner execution smoke test for `operations-library-sync`; the command was created, approved, claimed, executed, and marked `succeeded`.

## Hosted Project Catalog

Hosted `/api/projects` now reads `command_center_projects` from Neon instead of returning an empty project list.

Current behavior:

- Local Forge remains responsible for filesystem discovery.
- `runner:sync-projects` copies the discovered local project snapshot into Neon.
- Hosted Ops reads the Neon project catalog and can display Projects without direct filesystem access.
- Local start/stop/open-folder actions are routed through approved runner commands.
- On 2026-06-18, `411100-PCK39` synced 16 projects from `C:\Development\Projects`.

## Hosted Fabric Snapshot

Hosted `/api/ridge-fabric` now reads the latest synced Ridge Fabric snapshot from Neon instead of returning an empty registry.

Current behavior:

- Syncthing JSON/Markdown remains the canonical Ridge Fabric source of truth.
- Local Forge remains responsible for filesystem reads and writes.
- `runner:sync-fabric` copies the local Fabric registry snapshot into Neon.
- Hosted Fabric can display devices, files, counts, and conflicts from the latest sync.
- Hosted Fabric edits, deletes, and open-folder requests are queued as local runner commands instead of direct hosted filesystem writes.
- On 2026-06-18, `411100-PCK39` synced 5 Fabric devices from `C:\Development\Shared\ridge-fabric-registry`.

## Hosted Operations Library Snapshot

Hosted `/api/operations-library/status` now reads the latest synced Operations Library validation snapshot from Neon.

Current behavior:

- Local Forge remains responsible for validating the local Operations Library filesystem.
- `runner:sync-operations` copies the validation result into Neon.
- Hosted Overview and the Operations modal can show the real validation status.
- On 2026-06-18, `411100-PCK39` synced Operations Library status as `Valid` with 0 issues from `C:\Development\Shared\codex-operations-library`.

## Waypoint Agent Loop Guardrails

Default allowed:

- Read-only scans.
- Git status/log/diff inspection.
- Dependency metadata inspection.
- PM artifact review.
- Proposal creation.
- Markdown report creation.

Default denied without explicit owner approval:

- File edits in project repos.
- Git commits or pushes.
- Production deployments.
- Scheduled task edits.
- Service restarts.
- Secret changes.
- Registry record changes.
- Database migrations.

## Immediate Next Build Step

Deepen the approval-centered backend and UI foundation:

1. Add runner polling that can read approved queued commands without executing them.
2. Add command claiming and lease semantics so one runner owns one command at a time.
3. Define an allowlist for command types and per-command payload schemas.
4. Add result capture and command audit events.
5. Only then enable low-risk local execution behind explicit owner approval.
