# Project Management Operational Visibility Review

## Files Modified

- `server/index.js`
- `src/main.jsx`
- `src/styles.css`
- `docs/implementation/project-management-operational-visibility-review.md`

## Components Added

- `ProjectManagementDashboard`
- `ProjectManagementBacklog`
- `ProjectManagementBugs`
- `ProjectManagementGovernance`
- `ProjectManagementCodexActivity`
- `ProjectManagementFileHealth`
- `ProjectManagementFileActions`
- Shared read-only table, filter, and manual-review display helpers.

## Data Contract Compliance

- Backlog tab reads `project-dashboard.json.backlog`.
- Backlog rows display ID, Title, Type, Priority, Status, and Phase.
- Backlog supports Status, Priority, and Type filters.
- Bugs tab reads `project-dashboard.json.bugs`.
- Bugs rows display ID, Title, Severity, Priority, Status, and Affected Workflow.
- Bugs are grouped into Open, Validating, Blocked, and Closed.
- Bugs surface Open, Critical, and High severity counts.
- Governance tab reads `project-dashboard.json.governance`.
- Governance displays lifecycle phases, status, evidence, blocking gaps, and security/data/testing/release statuses.
- Codex Activity tab reads `project-dashboard.json.codexActivity`.
- Codex Activity displays timestamp, workflow, summary, next action, optional files changed, and optional validation notes newest first.
- Codex Activity accepts `validationNotes`, `validation`, or `validationStatus` for forward-compatible validation display.
- File Health displays dashboard current/stale/missing state, `metadata.generatedAt`, `metadata.sourceFiles`, missing source files, stale source files, validation issues, and schema issues.
- Open file actions are allowlisted and only enabled when the files exist.

## Read-Only Behavior

- No project-management files are created, edited, regenerated, or deleted.
- The launcher only reads dashboard JSON, source file metadata, and file existence.
- Open actions call Windows Explorer for existing folders/files only.
- No Roadmap, Sprint, Portfolio, GitHub sync, or editing features were added.

## Manual Testing Instructions

1. Start or restart the launcher:

   ```powershell
   npm run dev
   ```

2. Open:

   ```text
   http://127.0.0.1:3060
   ```

3. Select a project without `docs/project-management/`.

   Expected: Project Management shows `Project Management Not Initialized` and no error state.

4. Select a project with `docs/project-management/project-dashboard.json`.

   Expected: tabs show Overview, Backlog, Bugs, Governance, and Codex Activity.

5. On Backlog, change Status, Priority, and Type filters.

   Expected: rows filter in-place without modifying project files.

6. On Bugs, confirm items are grouped into Open, Validating, Blocked, and Closed.

   Expected: Open, Critical, and High severity counts are visible.

7. On Governance, confirm lifecycle phases and gate statuses render.

   Expected: missing fields show `Needs Manual Review`.

8. On Codex Activity, confirm newest entries appear first.

   Expected: missing optional files/validation fields do not block the row.

9. On Overview, inspect Project Management File Health.

   Expected: dashboard stale/missing/source-file state matches the loader response.

10. Use Open File Actions.

   Expected: Project Management Folder opens when initialized; individual file buttons are disabled unless the matching file exists.

## Known Limitations

- Markdown fallback parsing is still not implemented.
- File health uses filesystem modified times for freshness.
- Backlog filtering is local UI state and is reset when selected project data changes.
- Bug grouping is based on the dashboard `status` value only.
- Optional GitHub issue links remain intentionally unused.
- Roadmap and Sprint remain deferred by sprint scope.
- Browser verification used the currently configured real project root, where no project had initialized Project Management artifacts at verification time. Full tab content was therefore validated through temporary API fixtures and build/runtime checks.

## Verification Run

- `node --check server/index.js`
- `npm run build`
- Temporary `PROJECTS_ROOT` API smoke test covering:
  - missing project-management folder
  - missing `project-dashboard.json`
  - invalid dashboard JSON
  - stale dashboard JSON
  - empty backlog
  - empty bugs
  - empty governance phases
  - empty Codex activity
- In-app browser check at `http://127.0.0.1:3060/`:
  - page loaded successfully
  - Project Management navigation labels rendered
  - selected project without Project Management artifacts rendered the not-initialized state without crashing

## Recommended Next Sprint

- Add a small fixture-backed regression test for `loadProjectManagementDashboard`.
- Add sample `docs/project-management/project-dashboard.json` artifacts to one non-production demo project so the full visual tab flow can be smoke-tested without touching active project data.
