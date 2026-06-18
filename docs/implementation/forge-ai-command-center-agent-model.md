# Forge AI Command Center Agent Model

Created: 2026-06-18

## Objective

Make RidgePath Forge a practical AI-directed command center for all local and hosted projects. The system should inspect projects, summarize current state, identify risks/opportunities, recommend next actions, and prepare approval-ready work packets for the owner to accept, reject, edit, or schedule.

The design goal is functional operational leverage, not a theatrical agent UI.

## Operating Principle

Agents may inspect, analyze, draft, score, and propose.

Agents may not make consequential project changes without explicit owner approval, unless a specific low-risk automation has been pre-approved.

The owner remains the final approver and prioritization authority.

## Recommended Mental Model

Forge should operate like an executive project operations console:

1. Agents continuously inspect project state.
2. Agents produce evidence-backed findings.
3. Forge groups findings into proposed actions.
4. The owner reviews an approval queue.
5. Approved work becomes a Codex-ready task packet.
6. Execution happens in a branch/worktree or local project context.
7. Results return to Forge with validation evidence.

## Roles

### Owner

The owner is the CEO/final approver.

Responsibilities:

- Decide priorities.
- Approve or reject proposed work.
- Approve mutations to repositories, deployments, registries, or automation schedules.
- Resolve ambiguous business/product direction.

### Forge Command Center

The UI and orchestration plane.

Responsibilities:

- Show project health.
- Show agent findings.
- Show approval queue.
- Show recent activity.
- Store project-management state.
- Launch local or Codex tasks.
- Preserve audit history.

### Forge Local Agent

The local machine bridge.

Responsibilities:

- Read local project files.
- Inspect local runtime state.
- Start/stop/restart local projects when approved.
- Run safe validation commands.
- Collect local inventory.
- Write Syncthing-backed registry files when approved.

### Project Review Agents

Task-oriented analyzers.

Examples:

- Project health reviewer.
- Security/config reviewer.
- Dependency freshness reviewer.
- Test coverage reviewer.
- UX/product polish reviewer.
- Deployment readiness reviewer.
- Documentation reviewer.
- Project-management artifact reviewer.

These agents should produce structured findings, not directly mutate projects.

### Execution Agents

Implementation workers.

Responsibilities:

- Execute approved task packets.
- Work in an isolated branch/worktree.
- Run validation.
- Return summary, changed files, risks, and follow-up recommendations.

## Agent Loop

### 1. Discover

Scheduled or manually triggered project scan.

Inputs:

- Project registry.
- Git status.
- Package files.
- Readme/docs.
- Test config.
- Deployment config.
- Project-management files.
- Recent Forge activity.
- Ridge Fabric device/workload context.

Output:

- Current state snapshot.
- Known gaps.
- Changed-since-last-scan summary.

### 2. Analyze

Agents evaluate the snapshot.

Outputs should include:

- Finding title.
- Severity/priority.
- Evidence.
- Affected files/areas.
- Suggested next action.
- Confidence.
- Risk of acting.
- Estimated effort.
- Whether owner approval is required.

### 3. Propose

Forge groups findings into approval-ready proposals.

Waypoint should write structured findings and proposal records into the command-center store. Neon/queryable storage is the primary operational source of truth for agent recommendations, approvals, and execution state.

Markdown artifacts are optional later if they are useful for repo-local context, but Forge should not depend on Markdown for querying the system.

Proposal shape:

```json
{
  "id": "",
  "projectId": "",
  "title": "",
  "summary": "",
  "whyNow": "",
  "evidence": [],
  "recommendedAction": "",
  "risk": "low | medium | high",
  "approvalRequired": true,
  "suggestedExecutor": "codex | local-agent | manual",
  "targetBranchPolicy": "feature-branch | active-branch | pull-request | direct-main",
  "validationPlan": [],
  "rollbackPlan": "",
  "status": "proposed"
}
```

### 4. Approve

Owner reviews proposals in Forge.

Allowed decisions:

- Approve.
- Reject.
- Defer.
- Ask for more evidence.
- Convert to backlog item.
- Convert to bug.
- Start Codex task.

Approval should also capture the allowed branch target:

- Create feature branch.
- Use current active branch.
- Open pull request only.
- Push directly to `main`.

Default approval should create a feature branch or pull request. Direct push to `main` requires explicit owner approval for that proposal.

### 5. Execute

Approved work becomes an execution packet.

Execution packet includes:

- Objective.
- Project path.
- Branch/worktree rules.
- Approved branch target.
- Constraints.
- Evidence gathered.
- Files likely involved.
- Validation requirements.
- Approval boundary.

### 6. Validate

Execution agent returns:

- Changed files.
- Commands run.
- Test/build results.
- Screenshots if UI changed.
- Residual risks.
- Next recommended action.

### 7. Record

Forge writes activity back to project-management artifacts:

- Neon proposal/execution state.
- `docs/project-management/project-dashboard.json` where project PM is enabled.
- `docs/project-management/codex-activity.md` or other Markdown artifacts only when configured for that repo.
- backlog/bugs/governance files where applicable and approved.

## Approval Queue

Forge should have a first-class Approval Queue page.

Columns:

- Project.
- Proposal.
- Priority.
- Risk.
- Evidence count.
- Suggested executor.
- Age.
- Status.

Detail modal/page:

- Summary.
- Evidence.
- Agent reasoning.
- Proposed files/areas.
- Validation plan.
- Buttons: Approve, Reject, Defer, More Evidence, Create Backlog Item, Start Codex.

## Project Management Integration

Project management should become the center of the system.

Each project should eventually have:

- Roadmap.
- Backlog.
- Bugs.
- Sprint/current work.
- Lifecycle/governance status.
- Codex activity.
- Project dashboard JSON.

Forge should provide rollups:

- Projects with no PM initialized.
- Projects with stale dashboard.
- Projects with open high-priority backlog.
- Projects with unresolved bugs.
- Projects with next Codex action.
- Projects blocked on owner decision.

## Scheduling Model

Waypoint is a reasonable always-on host for background review agents.

Recommended schedule:

| Loop | Cadence | Purpose |
| --- | --- | --- |
| Project inventory scan | Hourly or every 4 hours | Detect repo/runtime state changes. |
| Project-management freshness scan | Daily | Identify stale PM artifacts. |
| Dependency/security review | Weekly | Find outdated packages and risky config. |
| UX/readiness review | Weekly or manual | Find polish and product gaps. |
| Fabric/device inventory review | Daily | Detect machine/workload drift. |

Loops should be resumable, logged, and non-destructive.

## Storage Model

Use structured command-center storage first:

- Neon-backed agent runs.
- Neon-backed proposals.
- Neon-backed approval events.
- Neon-backed project/machine observations.
- Local JSON fallback for offline development only.

For Syncthing-shared topology:

- `ridge-fabric-registry/devices/*.json`
- `ridge-fabric-registry/workloads/*.json`
- `ridge-fabric-registry/networks/*.json`
- generated Markdown summaries.

For repository-owned project management:

- `docs/project-management/*.md`
- `docs/project-management/project-dashboard.json`

## UI Requirements

Avoid gimmicks. Favor:

- Dense tables.
- Clear status chips.
- Evidence drawers.
- Approval queue.
- Project health rollups.
- Timeline/activity logs.
- "Why this matters" summaries.
- Explicit local/hosted execution context.

Primary sections:

- Overview.
- Projects.
- Approval Queue.
- Agent Runs.
- Project Management.
- Runtime.
- Fabric.
- Automation.
- Publishing.
- Settings.

## Safety Boundaries

Default denied:

- Pushing commits.
- Deploying production.
- Rotating secrets.
- Editing scheduled tasks.
- Restarting critical services.
- Deleting files.
- Modifying registry/device records.
- Running migrations.

Default allowed:

- Read-only scans.
- Git status/log/diff inspection.
- Dependency metadata inspection.
- Test/build dry runs when configured safe.
- Drafting recommendations.
- Creating proposal records.
- Creating Markdown reports.

Conditionally allowed with explicit approval:

- Branch creation.
- File edits.
- Test execution with side effects.
- Local project start/stop.
- Registry updates.
- Backlog/bug file updates.
- Demo/portfolio draft generation.

## Hosted Mode Implications

Hosted Forge on Vercel can be useful for:

- Reviewing proposals.
- Viewing project-management state.
- Viewing Fabric inventory.
- Viewing agent run summaries.
- Approving work.

Hosted Forge should not directly execute local commands.

For local execution from a hosted UI, require:

- Local Forge Agent running on the active machine.
- Pairing token.
- Allowed origin list.
- Capability handshake.
- Clear "executes on this machine" UI.
- Audit log entry for every request.

## First Implementation Pass

Add these before deeper AI automation:

1. `Approval Queue` section.
2. `Agent Runs` section.
3. Structured proposal files in `data/proposals`.
4. Structured agent-run files in `data/agent-runs`.
5. API routes:
   - `GET /api/agent-runs`
   - `POST /api/agent-runs/project-review`
   - `GET /api/proposals`
   - `PATCH /api/proposals/:id`
6. UI for approving/rejecting/defering proposals.
7. A read-only project review agent that scans one project and creates proposals.

Only after that should Forge execute approved changes.
