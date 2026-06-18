# RidgePath Forge Command Center Improvement Plan

Created: 2026-06-18

## Goal

Turn RidgePath Forge from a local project launcher into a command center for the whole RidgePath/Fabric ecosystem: projects, local runtimes, infrastructure inventory, automation workload health, project-management artifacts, demo publishing, portfolio publishing, and cross-machine topology.

## Current Shape

Forge currently has a useful local-control core:

- Local Express API on port `3059`.
- Local Vite UI on port `3060`.
- Redirect on port `80`.
- Project discovery and start/stop/restart/take-over actions.
- Project detail workspace.
- Operations Library status.
- Ridge Fabric registry.
- Demo Portal linking.
- Portfolio draft generation.
- Project registration.

The weakness is not capability. The weakness is information architecture. Everything is reachable, but the app still behaves like a launcher with added panels rather than a true operating console.

## Core Architecture Decision

Forge should become two cooperating products:

| Layer | Purpose | Where it runs |
| --- | --- | --- |
| Forge Command Center | Read-heavy dashboard, project catalog, Fabric registry, automation status, project-management review, publishing surfaces | Local and optionally hosted |
| Forge Local Agent | Local-only privileged bridge for start/stop/restart/open-folder/screenshot/local filesystem operations | Each Windows machine |

Do not expose local machine control directly from the public internet. Hosted Forge can show synchronized data and offer actions, but any local action must be executed by the local agent on the active machine after local authentication/handshake.

## Product Areas

### 1. Home / Operations Overview

Purpose: give a single screen that answers "what needs attention?"

Recommended contents:

- Active machine and agent status.
- Running project count.
- Projects with failing health checks.
- Port conflicts.
- Ridge Fabric unknown devices.
- Project-management gaps.
- Demo portal readiness gaps.
- Recent Codex/Forge activity.
- Quick actions: refresh, open registry, open project root, copy inventory prompt.

### 2. Projects

Purpose: day-to-day launcher and project command surface.

Recommended views:

- Table view for dense scanning.
- Board/grouped view by status, client, audience, or lifecycle.
- Project detail page with tabs:
  - Overview
  - Runtime
  - Project Management
  - Tasks / Backlog
  - Automation
  - Publishing
  - Files / Docs
  - Activity

Recommended improvements:

- Replace the current top metric buttons with a real left navigation shell.
- Add persistent project search.
- Add saved filters: Work, RidgePath, Personal, Running, Needs Review, Dirty Git, No PM, Demo Ready.
- Add a compact command bar per project.
- Make start/stop actions local-agent-gated.

### 3. Local Runtime

Purpose: make local actions reliable and explainable.

Recommended contents:

- Local Agent status.
- Current machine identity.
- API health.
- Port listeners.
- Managed processes.
- Recent logs.
- Startup task/service status.
- "Why action is disabled" messages.

Required technical direction:

- Keep start/stop/restart/open-folder local-only.
- Add an explicit agent capability model:
  - `canStartProjects`
  - `canOpenFolders`
  - `canReadRegistry`
  - `canWriteRegistry`
  - `canCaptureScreenshots`
  - `canRunInventory`
- Surface degraded mode clearly when hosted Forge cannot reach the local agent.

### 3A. AI Approval Queue

Purpose: make Forge an AI-directed but owner-approved command center.

Recommended contents:

- Agent-generated proposals.
- Evidence and affected files.
- Risk and confidence.
- Suggested executor.
- Validation plan.
- Owner decision controls:
  - Approve
  - Reject
  - Defer
  - Request more evidence
  - Convert to backlog
  - Start Codex task

Implementation direction:

- Agents inspect and propose by default.
- Agents do not mutate repositories or infrastructure unless the proposal is approved.
- Every proposal needs an evidence trail and validation plan.

### 3B. Agent Runs

Purpose: show what the background agents are doing and what they found.

Recommended contents:

- Scheduled scans.
- Manual scans.
- Per-project review history.
- Agent run logs.
- Findings created.
- Proposals created.
- Validation failures.
- Next scheduled review.

Implementation direction:

- Waypoint can host scheduled read-only review loops.
- Agent runs should be resumable and non-destructive.
- Store agent run summaries as structured JSON before considering a hosted database.

### 4. Ridge Fabric

Purpose: source of truth for machines, network dependencies, and automation topology.

Recommended views:

- Devices table.
- Device modal/detail page.
- Networks.
- Workloads.
- Dependencies graph.
- Inventory reports.
- Unknown devices.
- Syncthing conflict state.

Recommended improvements:

- Add graph view: machine -> project -> service -> port -> dependency.
- Add "Add this machine" workflow using the copied inventory prompt.
- Add report attachment links per device.
- Add archive/remove flow for personal devices.
- Add confidence and last-observed filters.

### 5. Automation Workloads

Purpose: understand what runs where.

Recommended contents:

- Scheduled tasks.
- Services.
- PM2/process managers if present.
- GitHub/self-hosted runners.
- Browser automation workloads.
- PCC/Infinity/RidgePath automation links.
- Logs/artifact paths.

Implementation direction:

- Treat workloads as first-class records, not just notes inside devices.
- Store canonical records in Syncthing-friendly JSON:
  - `workloads/*.json`
  - generated `workloads.md`

### 6. Project Management

Purpose: centralize Codex-readable planning and execution state across projects.

Recommended contents:

- PM initialized/uninitialized.
- Current phase.
- Next Codex action.
- Open backlog.
- Open bugs.
- Governance gaps.
- Recent Codex activity.
- Copy scoped prompts.

Implementation direction:

- Keep repository-owned PM files as source of truth.
- Forge displays and launches workflows; Codex performs repository analysis.
- Add command-center rollups across all projects.

### 7. Publishing / External Surfaces

Purpose: manage how local projects become shareable.

Recommended contents:

- RidgePath demo portal records.
- Portfolio drafts.
- Production URL readiness.
- Screenshot/readme/blog status.
- Deployment status where available.

Implementation direction:

- Separate "local preview" from "public/demo/production URL".
- Never write localhost as a shareable client URL.

### 8. Settings / Registry / Integrations

Purpose: make Forge configurable without editing source files.

Recommended contents:

- Project roots.
- Registry root.
- Operations Library root.
- Local agent settings.
- Vercel/hosted mode settings.
- Feature flags.
- Startup/restart helper status.

## Hosting Model

### Local-only mode

Best for privileged operations:

- Start/stop/restart projects.
- Open local folders.
- Read local logs.
- Inventory the current machine.
- Write Syncthing-backed registry files.

### Hosted mode

Best for visibility and review:

- Project catalog.
- Fabric registry read model.
- Project-management rollups.
- Demo/portfolio readiness.
- Inventory report browsing.
- Copy prompts.
- Cross-machine overview.

### Hybrid mode

Best long-term model:

- Vercel-hosted Command Center.
- Local Forge Agent running on each computer.
- Hosted UI shows cloud/synced data.
- Local actions appear only when the browser can pair with a local agent.
- Local agent only accepts requests from explicit allowed origins and requires a local pairing token.

## Data Model Direction

Prefer plain, syncable source-of-truth records where practical:

- `ridge-fabric-registry/devices/*.json`
- `ridge-fabric-registry/workloads/*.json`
- `ridge-fabric-registry/networks/*.json`
- `ridge-fabric-registry/reports/*.md`

For hosted mode, use a read-optimized backend:

- Start with generated JSON snapshots.
- Later optionally add a database for remote browsing/search.
- Do not make hosted database the only source of truth until sync/conflict rules are mature.

For AI command-center coordination, use Neon earlier:

- Agent runs.
- Findings.
- Proposals.
- Approval decisions.
- Execution packets.
- Machine observations.

See `docs/implementation/forge-storage-architecture.md`.

## UI Redesign Direction

### Shell

Use a left navigation rail:

- Overview
- Projects
- Approval Queue
- Agent Runs
- Runtime
- Fabric
- Automation
- Project Management
- Publishing
- Operations Library
- Settings

Use a top command bar:

- Global search.
- Active machine.
- Agent status.
- Refresh/sync.
- Current mode: Local / Hosted / Hybrid.

### Visual Style

- Dense, operational, and calm.
- Tables first, cards only for rollups/repeated summaries.
- Avoid modal-first navigation except for detail inspection and confirmations.
- Use drawers/modals for secondary edits.
- Use full pages for major domains.
- Make disabled actions explain why.

### Interaction Patterns

- Every action should show:
  - what machine will execute it
  - whether it is local or hosted
  - whether it mutates local state
  - result and log link

## Implementation Phases

### Phase 1: Navigation and Information Architecture

- Replace metric-button header with left navigation shell.
- Add top command bar.
- Keep existing feature components but route them as pages.
- Add Overview page with current metrics and attention items.

### Phase 2: Project Command Center

- Redesign Projects table and project detail page.
- Add saved filters.
- Add runtime health indicators.
- Add clearer local-action gating.
- Split `ProjectDetail.jsx` into smaller modules.

### Phase 3: Local Agent Contract

- Formalize `/api/agent/status`.
- Add capability model.
- Add sustained health checks.
- Add local action audit events.
- Add pairing/origin controls for future hosted mode.

### Phase 3A: AI Review And Approval Loop

- Add proposal storage in `data/proposals/*.json`.
- Add agent-run storage in `data/agent-runs/*.json`.
- Add `Approval Queue` page.
- Add `Agent Runs` page.
- Add first read-only project review agent.
- Add proposal lifecycle states: proposed, approved, rejected, deferred, needs-evidence, executing, complete.
- Require owner approval before execution.

### Phase 4: Fabric Expansion

- Add devices/networks/workloads tabs.
- Add dependency graph.
- Add inventory report browser.
- Add unknown-device and stale-device workflows.

### Phase 5: Automation Workload Registry

- Promote scheduled tasks/services/listeners into first-class workload records.
- Add workload health table.
- Link workloads to devices and projects.

### Phase 6: Hosted Read Model

- Create deployable Command Center mode.
- Disable local actions unless local agent is paired.
- Add protected deployment/auth.
- Decide whether the remote read model comes from generated JSON, Git, blob storage, or database.

### Phase 7: Publishing and Portfolio Console

- Add demo portal dashboard.
- Add portfolio drafts dashboard.
- Add production readiness checks.
- Add screenshot/content generation status.

## First Build Pass Recommendation

Start with Phase 1 and Phase 2 together:

1. Build the left navigation shell.
2. Add Overview page.
3. Convert current Projects/Fabric views into routed pages.
4. Improve Projects table/detail ergonomics.
5. Keep all existing API contracts intact.

This gives an immediate command-center feel without destabilizing start/stop/runtime behavior.

## Implementation Log

### 2026-06-18 Branch Start

- Created branch `codex/forge-command-center-ui`.
- Kept the existing local API contracts intact.
- Added `src/features/overview/CommandCenterOverview.jsx`.
- Replaced the old metric-button header as the primary navigation model with a left command-center navigation rail.
- Added a top command bar with global project search, port map, refresh, and add-project actions.
- Added first-class command-center sections:
  - Overview
  - Projects
  - Runtime
  - Fabric
  - Automation
  - Publishing
  - Operations Library
  - Settings
- Added placeholder pages for Runtime, Automation, Publishing, Operations Library, and Settings so the navigation structure is in place before deeper feature work.
- Preserved the existing Projects table, Project Detail workspace, Ridge Fabric workspace, register-project modal, port map modal, demo portal modal, and operations modal.
- Added command-center shell CSS, overview metric panels, attention list, runtime/readiness panels, and responsive behavior.
- Verified `npm.cmd run build`.
- Started temporary review UI on `http://127.0.0.1:3075`.
- Verified API health on `http://127.0.0.1:3059/api/health`.
- Browser-verified on port `3075`: Overview renders with 4 metrics, nav has all 8 sections, Projects renders 16 rows, Fabric renders 5 device rows, no action error appears, no console errors were captured, and no horizontal overflow was detected.
- Saved verification screenshot to `C:\Development\Shared\ridgepath-forge\command-center-shell-verification.png`.
- Next step: deepen the Projects command-center redesign and replace the Operations Library modal with a full page.

### AI Command Center Planning

- Added `docs/implementation/forge-ai-command-center-agent-model.md`.
- Defined Forge as an approval-centered AI operations console rather than an autonomous mutation bot.
- Added recommended agent loop: discover, analyze, propose, approve, execute, validate, record.
- Added owner/final-approver role, local agent role, project review agent role, and execution agent role.
- Promoted `Approval Queue` and `Agent Runs` to first-class command-center sections.
- Recommended Waypoint as a good always-on host for scheduled read-only review loops.
- Next implementation priority should shift from visual polish to proposal/agent-run data contracts and UI.

### Waypoint Handoff Readiness

- Added `docs/implementation/waypoint-ai-command-center-handoff.md`.
- Captured current branch, local review ports, startup commands, transfer caveat, Waypoint responsibilities, agent loop guardrails, and next build step.
- Important caveat: this working tree contains uncommitted changes, so Waypoint needs either the synced working tree, an intentional commit/push, or a patch bundle to reproduce the exact state.

### Storage Architecture Planning

- Added `docs/implementation/forge-storage-architecture.md`.
- Decided on a hybrid storage model: local JSON for machine-specific launcher state, Ridge Fabric JSON/Markdown for topology source-of-truth, and Neon for command-center coordination records.
- Recommended Neon-backed storage for agent runs, findings, proposals, approvals, execution packets, and machine observations before relying on Waypoint for continuous multi-project agent loops.
- Updated the Waypoint handoff so shared JSON is not treated as the long-term agent queue.

### Approval Loop Foundation Pass

- Added `server/domains/command-center/repository.js`.
- Added Neon-primary/local-JSON-fallback storage for command-center status, agent runs, proposals, and approval events.
- Added API routes:
  - `GET /api/command-center/status`
  - `GET /api/agent-runs`
  - `POST /api/agent-runs/project-review`
  - `GET /api/proposals`
  - `PATCH /api/proposals/:proposalId`
- Added `src/features/command-center/ApprovalQueue.jsx`.
- Added `src/features/command-center/AgentRuns.jsx`.
- Added `Approval Queue` and `Agent Runs` navigation items.
- Added a lightweight read-only project review action that creates agent-run records and proposal records without mutating project repos.
- Added owner decision controls for approve, reject, defer, and request more evidence.
- Added API support for recording approval events when proposal status changes.
- Added `scripts/start-api-watchdog.ps1` and changed `scripts/start-launcher.ps1` to launch the API through the watchdog because the unsupervised API process was exiting cleanly without stderr.
- Verified local fallback storage by creating a read-only review for `annual-evaluations`, producing one agent run and two proposals.
- Verified proposal lifecycle by updating one proposal to `needs-evidence` and recording one approval event.
- Browser-verified on `http://127.0.0.1:3075`: Approval Queue rendered 2 cards, Agent Runs rendered 1 card, no action error appeared, no console errors were captured, and no horizontal overflow was detected.
- Saved verification screenshot to `C:\Development\Shared\ridgepath-forge\command-center-approval-agent-runs-verification.png`.

### Neon And Owner Feedback Pass

- Added `.env.local` support to `scripts/start-api-watchdog.ps1` so the API can load local secret configuration without committing secrets.
- Narrowed command-center database configuration to `COMMAND_CENTER_DATABASE_URL` so the new Neon-backed approval loop does not implicitly change unrelated Forge database consumers.
- Confirmed `GET /api/command-center/status` reports `storage: neon` with the configured RidgePath Technologies Neon database.
- Added owner feedback/direction text areas to approval cards.
- Added an independent `Save Feedback` proposal action so owner instructions can be stored before approve/reject/defer decisions.
- Persisted proposal feedback and branch target policy through `PATCH /api/proposals/:proposalId`.
- Added project-registration fields for `Overall context` and `Key features`.
- Wrote new-project context and features into registered project bootstrap metadata and generated README content.
- Fed registered-project bootstrap context back into project discovery so future review agents can include that context in run evidence and proposal reasoning.
- Created a Neon-backed read-only project review for `annual-evaluations`, producing one completed agent run and two proposal records.
- Verified saved feedback remains on the proposal while the proposal status remains `proposed`.
- Restarted Forge through `scripts/restart-launcher.ps1`; API `3059`, UI `3060`, and temporary review UI `3075` returned HTTP 200.
- Verified the temporary review UI proxy returns Neon-backed command-center status, agent runs, proposals, and saved owner feedback.
- Remaining next step: add a proposal detail page/drawer with full evidence, approval history, and execution readiness checks before enabling any mutation agent.

### Hosted Ops Stabilization Pass

- Verified the accidental `ridgepath-forge` Vercel project was disconnected, removed, and no longer appears as a live alias target.
- Confirmed the intended production deployment is `ridgepath-ops` with `ops.ridgepath.io` assigned to the latest ready production deployment.
- Confirmed the local checkout has no `.vercel` metadata so future CLI commands do not silently target the wrong Vercel project.
- Confirmed Neon contains 16 synced `command_center_projects` and one local runner record.
- Updated hosted middleware so protected `/api/*` requests return JSON errors instead of plain text.
- Updated the frontend API helper to send same-origin credentials and distinguish authentication/HTTP/non-JSON failures from local API outages.
- Verified `npm.cmd run build`.
- Verified local Neon-backed API status and paired runner endpoints.
- Remaining next step: browser-verify the deployed `ops.ridgepath.io` Projects and Runtime views after the production deployment finishes.

### Projects Catalog Diagnostics Pass

- Added Project Directory metadata showing filtered count, synced catalog count, catalog source, and local runner/control state.
- Added a guided empty state that distinguishes a truly empty project catalog from search/filter mismatch.
- Added a `Reset Filters` action so a hidden catalog can be restored without guessing which filter caused the mismatch.
- Verified local `/api/projects` returns 16 projects from `C:\Development\Projects`.
- Browser-verified local Projects view on `http://127.0.0.1:3060`: 16 rows render, an impossible search shows `0 shown` with `16 synced`, and `Reset Filters` restores all rows.
- Observed one transient local Vite proxy 502 while the API watchdog restarted the API under a new process; direct `/api/health` and `/api/projects` returned HTTP 200 after restart.
- Remaining next step: run the same Projects check on protected `ops.ridgepath.io` from an authenticated browser session.

### Runtime Execution Packet Visibility Pass

- Added Execution Packets as a first-class panel inside Runtime.
- Runtime now shows packet count, project association, status, branch policy, runner claim state, validation result, error output, and packet audit events.
- Added a `Copy Prompt` action for execution packets so a Codex/Waypoint handoff can be generated from Runtime, not only from Approval Queue.
- Adjusted the Runtime navigation badge so open execution packets count as active runtime work alongside command requests.
- Verified `npm.cmd run build`.
- Browser-verified local Runtime on `http://127.0.0.1:3060`: Runtime renders the local command form, paired runner summary, empty execution-packet panel, and existing completed command audit trail.
- Remaining next step: create or approve a non-mutating sample proposal packet to verify the full packet display and copy prompt with a live packet record.

### Runtime Sync Controls Pass

- Added explicit Runtime actions to queue Project catalog, Ridge Fabric, and Operations Library sync requests.
- Kept sync actions on the same owner-approved command queue path instead of bypassing command approval and audit events.
- Added `project-catalog-sync` to the manual command type selector.
- Verified `npm.cmd run build`.
- Browser-verified local Runtime on `http://127.0.0.1:3060`: `Sync Projects`, `Sync Fabric`, and `Sync Ops Library` actions render above the command form.
- Remaining next step: execute one approved sync request from the hosted UI and confirm the runner updates Neon plus audit state end to end.

### Approval Proposal Deduplication Pass

- Added deterministic `proposal_key` support to proposal storage so repeated read-only reviews update an existing active recommendation instead of creating duplicate proposal cards.
- Added repository-level read compaction for open proposal duplicates, preserving useful owner feedback from older matching records.
- Added a compacted-review indicator to Approval Queue cards.
- Verified repeated read-only reviews for `annual-evaluations` created two new agent-run records but did not increase the Neon proposal count: before `4`, after two repeated reviews `4`.
- Verified the local `/api/proposals` read model returns two active proposal cards with `duplicateCount: 2` instead of four duplicate cards.
- Browser-verified local Approval Queue on `http://127.0.0.1:3060`: two cards render, each shows `2 matching reviews compacted`, and the prior PM-initialization feedback remains visible.
- Remaining next step: add an owner-visible proposal detail/history surface so compacted duplicates and approval events can be inspected without reintroducing card noise.

### Approval Detail History Pass

- Added compacted proposal ids to the proposal read model so approval events attached to older duplicate rows remain discoverable.
- Added inline `Details` / `Hide Details` controls to Approval Queue cards.
- Proposal details now show evidence, rollback plan, compacted record ids, and approval history.
- Passed approval events into the Approval Queue surface and matched events across compacted duplicate ids.
- Verified `npm.cmd run build`.
- Restarted local Forge services and verified `/api/proposals` includes `duplicateIds` for compacted active proposals.
- Browser-verified local Approval Queue on `http://127.0.0.1:3060`: expanding the PM-initialization card shows evidence, rollback, both compacted proposal ids, and the prior feedback event.
- Remaining next step: verify the same approval details on protected `ops.ridgepath.io` and then test one owner-approved sync command end to end from hosted Runtime.

### Runner Command Sync Verification Pass

- Verified the paired local runner processes were active:
  - `scripts/local-runner-heartbeat.mjs --watch`
  - `scripts/local-runner-execute.mjs --watch`
  - `scripts/local-runner-packets.mjs --watch`
- Created and approved a safe `project-catalog-sync` command through the command API.
- Verified command `command_bec63803-dff9-4779-bede-1a5899e7cbd6` moved through the full lifecycle:
  - `created` as `pending` / `blocked`
  - `approved` as `queued`
  - `claimed` by `411100-PCK39`
  - `running`
  - `succeeded`
- Verified command result:
  - `commandType`: `project-catalog-sync`
  - `completedBy`: `411100-PCK39`
  - `projectCount`: `16`
  - `root`: `C:\Development\Projects`
- Verified the Neon project catalog still contains 16 records and the synced `observedAt` timestamp updated to `2026-06-18T21:21:22.708Z`.
- Browser-verified local Runtime on `http://127.0.0.1:3060`: the completed Project catalog sync appears above the prior Operations Library sync with result and audit trail visible.
- Remaining next step: perform the same owner-approved sync from the hosted `ops.ridgepath.io` Runtime UI in an authenticated browser session.

### Projects Self-Recovery Sync Pass

- Added hosted project catalog status tracking in the main Forge app state so the Projects page can show the API-reported Neon catalog message instead of only a generic empty state.
- Added a Projects-page `Sync Projects` action that creates an owner-approved read-only `project-catalog-sync` command for the paired local runner.
- Kept generic Runtime commands approval-gated; only the explicit Projects-page catalog recovery action is queued as already approved because the owner is pressing that dedicated read-only sync control.
- Added latest project-sync command status to the Project Directory metadata and diagnostic strip.
- Added a Project Directory diagnostic strip that distinguishes hidden synced projects from a genuinely empty hosted catalog.
- Added empty-state actions for `Sync Projects` and `Reset Filters` so the owner can recover from either a stale Neon catalog or a filter/search mismatch directly from the Projects page.
- Browser-verified local Projects view on `http://127.0.0.1:3060`: 16 synced rows render, an impossible search shows `0 shown` / `16 synced`, the diagnostic strip explains that all 16 projects are hidden by filters, and `Reset Filters` restores all rows.
- Verified an owner-approved `project-catalog-sync` command created with the Projects-page payload is claimed by runner `411100-PCK39`.
- Observed one transient runner failure while the local API watchdog restarted the API during `/api/projects`.
- Added retry and route-specific error reporting to `scripts/local-runner-execute.mjs` for local API calls.
- Re-ran the owner-approved sync command after hardening and verified it completed successfully with `projectCount: 16` and root `C:\Development\Projects`.
- Observed a transient browser-side `502 Bad Gateway` while refreshing Projects during an API watchdog restart.
- Added retry handling for idempotent frontend `GET` API calls on network failures and `502` / `503` / `504` responses, while leaving mutating requests non-retried to avoid duplicate commands or writes.
- Hardened local project discovery by cleaning up port-check sockets deterministically and removing the extra `localhost` probe in favor of direct `127.0.0.1` and `::1` checks.
- Pinned the Vite dev proxy to `127.0.0.1:3059` so local browser requests do not depend on Windows `localhost` address resolution.
- Added an in-flight guard around frontend project loading so manual Refresh and polling cannot stack overlapping `/api/projects` discovery calls.
- Remaining next step: deploy the updated production site and verify `ops.ridgepath.io` Projects once an authenticated browser session is available.

### Operations Library Workspace Pass

- Replaced the Operations Library placeholder/modal path with a full-page workspace.
- Added visible Operations Library validation metrics, configured path, issues, warnings, latest sync status, required folder/file availability, and workflow template/prompt availability.
- Added a hosted-mode `Sync Ops Library` action that creates an owner-approved read-only `operations-library-sync` command for the paired local runner.
- Kept local refresh separate from hosted runner sync so local mode can reload the API snapshot without entering the command queue.
- Added responsive layout rules so the workspace collapses cleanly on smaller screens.
- Remaining next step: build and browser-verify the Operations Library workspace locally, then deploy the updated production site.
