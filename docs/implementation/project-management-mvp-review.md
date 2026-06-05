# Project Management MVP Review

## Files Modified

- `server/index.js`
- `src/main.jsx`
- `src/styles.css`
- `docs/implementation/project-management-discovery.md`
- `docs/implementation/project-management-mvp-review.md`

## Components Added

- Project Management dashboard loader on the Express server.
- `projectManagement` read-only data contract attached to each `/api/projects` project object.
- Project Management Status Strip in `ProjectDetail`.
- Project Management `Overview` tab inside the project detail scroll area.
- Empty-state handling for projects without `docs/project-management/`.
- Open Project Management Folder action for initialized projects.

## Data Contract Compliance

- Loads `docs/project-management/project-dashboard.json`.
- Validates `schemaVersion` against the supported MVP schema `1.1`.
- Validates required MVP fields:
  - `summary.currentPhase`
  - `summary.lifecycleStatus`
  - `summary.governanceStatus`
  - `summary.currentSprint`
  - `summary.nextCodexAction`
  - `counts.backlogOpen`
  - `counts.bugsOpen`
  - `counts.sprintBlocked`
  - `metadata.generatedAt`
  - `metadata.sourceFiles`
- Validates referenced `metadata.sourceFiles` exist inside the project root.
- Compares `project-dashboard.json` modified time against referenced source files.
- Returns explicit `validation.status`, `staleStatus`, and `missingFileStatus` values.
- Marks stale, missing, invalid, unsupported, or incomplete dashboard data as `Needs Manual Review`.
- Does not infer replacement values when data is missing.

## Known Limitations

- Only schema version `1.1` is accepted.
- The MVP does not parse Markdown fallback files when JSON is missing.
- Freshness checks use filesystem modified times, not semantic `metadata.generatedAt` comparisons.
- The Overview uses only summary/count/governance metadata from the dashboard projection.
- The launcher still refreshes project-management data through the existing `/api/projects` polling cadence.
- Opening the Project Management folder is disabled when the folder does not exist; the launcher does not create it.

## Not Implemented In This Sprint

- Roadmap tab or roadmap visualization.
- Sprint tab or sprint item details.
- GitHub issue sync or live GitHub metadata.
- Portfolio or cross-project aggregation.
- Launcher-side editing of project-management files.

## Manual Testing Instructions

1. Start the launcher:

   ```powershell
   npm run dev
   ```

2. Open the UI:

   ```text
   http://127.0.0.1:3060
   ```

3. Select a project that does not have `docs/project-management/`.

   Expected: the Status Strip and Overview show `Project Management Not Initialized` with a recommended next action and no error UI.

4. Select a project that has `docs/project-management/project-dashboard.json`.

   Expected: the Status Strip shows Current Phase, Lifecycle Status, Governance Status, Open Backlog, Open Bugs, Sprint Blockers, and Next Codex Action.

5. Make one referenced source file newer than `project-dashboard.json`.

   Expected: dashboard freshness changes to `Needs Manual Review`, and the Overview lists the newer source file.

6. Remove or rename a referenced source file.

   Expected: validation changes to `Needs Manual Review`, and the Overview lists the missing file.

## Verification Run

- `node --check server/index.js`
- `npm run build`
- API smoke check against `GET /api/projects`
- Browser check at `http://127.0.0.1:3060`
- Browser console error check
