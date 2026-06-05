# Operations Library Dependencies

## Scope

This assessment reviews the current RidgePath Forge implementation and identifies which Operations Library documents, schemas, templates, and paths the launcher runtime depends on today.

Important distinction: RidgePath Forge currently reads configured Operations Library templates for selected workflows and project-owned files that follow Operations Library conventions. It writes handoff documents that point users back to the Operations Library.

## Required Documents

### Runtime Required From Operations Library Root

None.

RidgePath Forge has a configurable `OPERATIONS_LIBRARY_ROOT` and validates configured Operations Library files, templates, prompts, and schema support.

### Runtime Required From Each Managed Project

For the Project Management dashboard to render live project-management data, RidgePath Forge expects:

```text
docs/project-management/project-dashboard.json
```

This file is required only for initialized Project Management visibility. Projects without it can still be discovered, started, stopped, viewed, and registered by RidgePath Forge.

### Required For General Project Discovery

These are not Operations Library documents, but they are required or preferred by the RidgePath Forge discovery model:

- `package.json`: required for runnable service discovery.
- `README.md`: optional source for fallback project description.
- `.git/config`: optional source for GitHub remote and owner inference.
- `.env` / `.env.local`: optional source for port inference.
- Common app config/server files such as `vite.config.*`, `next.config.*`, `server.js`, and `server/index.js`: optional source for framework and port inference.

## Optional Documents

The Project Management UI can surface or open these project-owned Operations Library convention files when they exist:

```text
docs/project-management/lifecycle-status.md
docs/project-management/backlog.md
docs/project-management/bugs.md
docs/project-management/codex-activity.md
```

The dashboard freshness checker also treats every path listed in `project-dashboard.json.metadata.sourceFiles` as an optional source reference that becomes operationally important once declared. Missing or newer referenced files mark the dashboard as needing manual review.

Registration currently creates these project documents through RidgePath Forge generation and configured Operations Library templates:

```text
bootstrap-config.md
docs/operations-library-handoff.md
docs/governance-bootstrap.md
```

`docs/governance-bootstrap.md` is only created when the registration form requests governance assets.

Registration may also create standard folders, but not required documents:

```text
docs/requirements/
docs/architecture/
docs/features/
docs/decisions/
docs/validation/
assets/
scripts/
tests/
```

## Required Schemas

### Project Dashboard Schema

The only schema currently enforced by RidgePath Forge is:

```text
docs/project-management/project-dashboard.json
schemaVersion: "1.1"
```

The loader requires these top-level/dashboard fields:

- `schemaVersion`
- `project`
- `summary.currentPhase`
- `summary.lifecycleStatus`
- `summary.governanceStatus`
- `summary.currentSprint`
- `summary.nextCodexAction`
- `counts.backlogOpen`
- `counts.bugsOpen`
- `counts.sprintBlocked`
- `governance`
- `metadata.generatedAt`
- `metadata.sourceFiles`

The UI reads additional fields when present:

- `counts.backlogReady`
- `counts.bugsCritical`
- `backlog[]`
- `bugs[]`
- `governance.phases[]`
- `governance.security`
- `governance.data`
- `governance.testing`
- `governance.release`
- `codexActivity[]`

Backlog row fields displayed:

- `id`
- `title`
- `type`
- `priority`
- `status`
- `phase`

Bug row fields displayed:

- `id`
- `title`
- `severity`
- `priority`
- `status`
- `affectedWorkflow`

Governance phase fields displayed:

- `phase`
- `status`
- `evidence`
- `blockingGaps`

Codex activity fields displayed:

- `timestamp`
- `workflow`
- `summary`
- `nextAction`
- `filesChanged` optional
- `validation` optional

### Current Schema Gaps

The loader validates required top-level fields and source file references, but it does not deeply validate every backlog, bug, governance phase, or Codex activity row. Missing row values are displayed as `Needs manual review` in the UI.

## Required Templates

RidgePath Forge validates and renders configured Operations Library templates for project registration and Project Management initialization.

The remaining inline starter templates in `server/index.js` create:

- Minimal `package.json`
- Minimal `server.js`
- Project `README.md`

Configured Operations Library templates create registration handoff, governance, project-source, next-prompt, and project-management starter artifacts. The inline starter runtime templates remain operational dependencies even though they are not separate template files.

## Failure Behavior

### Operations Library Root Missing

If `OPERATIONS_LIBRARY_ROOT` points to a missing directory, Operations Library status is `Invalid` and project registration is blocked because registration renders configured templates from the library.

Risk: generated instructions or initialization actions may be blocked until the configured Operations Library checkout is restored.

### Project Management Folder Missing

If `docs/project-management/` does not exist in a project:

- The dashboard status is `Project Management Not Initialized`.
- The UI shows an empty state and recommended next action.
- Open Project Management Folder and file-specific actions are disabled.
- Existing RidgePath Forge project discovery and service controls continue to work.

### `project-dashboard.json` Missing

If `docs/project-management/` exists but `project-dashboard.json` is missing:

- Validation status becomes `Needs Manual Review`.
- Missing files includes `docs/project-management/project-dashboard.json`.
- Dashboard data is not inferred from Markdown.

### Invalid JSON

If `project-dashboard.json` cannot be parsed:

- Validation status becomes `Needs Manual Review`.
- Dashboard data is not rendered.
- No fallback extraction is attempted.

### Unsupported Schema Version

If `schemaVersion` is missing or not `"1.1"`:

- Validation issues include unsupported or missing schema version.
- Dashboard status becomes `Needs Manual Review`.

### Missing Required Fields

If required dashboard fields are missing:

- Validation issues include missing required dashboard fields.
- Missing field names are shown in Project Management File Health.
- Missing displayed values render as `Needs manual review`.

### Missing Source Files

If a path listed in `metadata.sourceFiles` is missing or resolves outside the project root:

- Validation status becomes `Needs Manual Review`.
- Missing source files are displayed in File Health.

### Stale Dashboard

If any source file listed in `metadata.sourceFiles` has a newer modified time than `project-dashboard.json`:

- Freshness and stale status become `Needs Manual Review`.
- Newer source files are displayed in File Health.

### Missing Tab Data

If `backlog`, `bugs`, `governance`, or `codexActivity` are missing or invalid:

- The relevant tab displays `Needs Manual Review`.
- Other tabs and RidgePath Forge features continue to render.

## Expected Future Dependencies

Based on the current UI integration design and deferred Project Management scope, likely future dependencies are:

- `docs/project-management/roadmap.md`
- `docs/project-management/epics.md`
- `docs/project-management/sprint-current.md`
- Roadmap fields in `project-dashboard.json.roadmap[]`
- Epic fields in `project-dashboard.json.epics[]`
- Sprint fields in `project-dashboard.json.sprint`
- Optional GitHub issue URLs in backlog and bug items
- Optional generated prompt or handoff file for next Codex action, such as `codex-next-prompt.md`
- External Operations Library templates for registration, governance bootstrap, and project-management initialization
- Operations Library workflow entry points currently referenced only as text:
  - `New-CodexProject.ps1`
  - `prompts/onboard-existing-project.md`
  - `prompts/start-new-project.md`

These should remain optional until RidgePath Forge intentionally validates the Operations Library checkout or invokes Operations Library workflows.

## Hardcoded Paths And Settings To Make Configurable

### Already Configurable But Hardcoded As Defaults

- `PROJECTS_ROOT` default: configured project root
- `OPERATIONS_LIBRARY_ROOT` default: `C:\Development\Shared\codex-operations-library`
- `LAUNCHER_API_PORT` default: `3059`
- `LAUNCHER_REDIRECT_PORT` default: `80`
- `LAUNCHER_HOSTNAME` default: `dev-launcher`
- `LAUNCHER_CLIENT_PORT` default: `3060`

These are environment-variable configurable, but the hardcoded defaults still encode this machine's expected layout.

### Not Currently Configurable

- Project Management folder: `docs/project-management`
- Project dashboard file: `docs/project-management/project-dashboard.json`
- Supported dashboard schema versions: `"1.1"`
- Open-file allowlist:
  - `lifecycle-status.md`
  - `backlog.md`
  - `bugs.md`
  - `codex-activity.md`
- Registration handoff files:
  - `bootstrap-config.md`
  - `docs/operations-library-handoff.md`
  - `docs/governance-bootstrap.md`
- Registration standard folders:
  - `docs/requirements`
  - `docs/architecture`
  - `docs/features`
  - `docs/decisions`
  - `docs/validation`
  - `assets`
  - `scripts`
  - `tests`
- Operations Library command embedded in generated handoff:
  - `.\New-CodexProject.ps1 -BasePath ${PROJECTS_ROOT}`
- Operations Library prompt references embedded in generated handoff:
  - `prompts/onboard-existing-project.md`
  - `prompts/start-new-project.md`
- Vite proxy target: `http://localhost:3059`
- Vite allowed hosts: `dev-launcher`, `devlauncher`
- Host registration script entry: `127.0.0.1 dev-launcher devlauncher`
- Windows hosts file path derived from `%WINDIR%\System32\drivers\etc\hosts`

## Recommendation

Add a small launcher configuration layer before adding more Operations Library dependencies. At minimum, centralize:

- Project Management directory and dashboard filename.
- Supported dashboard schema versions.
- Operations Library root validation behavior.
- Registration handoff template paths.
- Operations Library workflow command and prompt references.
- Local hostnames and Vite proxy/API port settings.

This would keep the launcher portable while preserving the current read-only Project Management dashboard behavior.
