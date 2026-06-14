# Project Management Discovery

## Scope

Discovery reviewed the current RidgePath Forge codebase for the Project Management MVP data foundation. Reference architecture and data-contract documents were found in `C:\Development\Shared\codex-operations-library\docs` because this repository did not yet contain a `docs` directory.

## Existing Project Detail Views

- `src/main.jsx` owns the full launcher UI.
- `ProjectDetail` is the selected-project detail surface.
- Existing detail sections are project header/actions, editable description, basic project info, local/repository locations, services, launcher activity, and recent process output.
- The detail pane receives one hydrated `project` object from `/api/projects`; this is the correct surface for read-only Project Management status and Overview data.

## Existing Project Registry Models

- `server/index.js` discovers project folders under `PROJECTS_ROOT`.
- `data/project-registry.json` is written when a project is registered through the launcher.
- `data/project-overrides.json` stores mutable local launcher metadata such as descriptions and last Git sync.
- Runtime project objects are assembled from discovered files, `package.json`, Git remote metadata, override records, service inference, activity logs, and live port checks.
- The registry is local launcher metadata only; it is not the source of truth for project-management state.

## Existing API Endpoints

- `GET /api/projects` returns the complete list of hydrated project objects.
- `GET /api/ports/next` and `GET /api/ports/suggestions` expose port allocation helpers.
- `POST /api/projects/register` creates a new registered project.
- `POST /api/projects/:projectId/start`, `stop`, `restart`, and `take-over` manage local services.
- `POST /api/projects/:projectId/git-sync` runs `git pull --ff-only`.
- `PATCH /api/projects/:projectId` updates local launcher description overrides.
- `POST /api/projects/:projectId/open-folder` opens the project root.
- `GET /api/projects/:projectId/favicon` and `GET /api/projects/:projectId/logs` provide display assets and launcher output.

## Existing Project Metadata Loading Patterns

- Project metadata is loaded during `discoverProjects()`.
- The server prefers lightweight file reads and JSON parsing through `safeReadJson`, `readJson`, `readIfExists`, and `fs.stat`-style checks.
- Project hydration happens before response serialization, so adding a read-only `projectManagement` object to each project matches the current API shape.
- Existing polling is frontend-driven through `POLL_MS = 5000`; the Project Management MVP data is therefore refreshed with the same `/api/projects` response.

## Existing File Access Patterns

- The server reads project files directly from `PROJECTS_ROOT` using `node:fs/promises` and `node:fs`.
- File access is synchronous only for cheap metadata helpers such as `safeReadJson`, `gitOrigin`, and favicon checks.
- User-triggered open-folder behavior uses `explorer.exe` and does not modify files.
- Existing path-sensitive asset routes resolve paths against the selected project root; Project Management source-file validation should use the same project-root boundary.

## MVP Integration Recommendation

- Load `docs/project-management/project-dashboard.json` during project discovery.
- Attach read-only loader output as `project.projectManagement`.
- Validate only the MVP dashboard contract fields required by the status strip and Overview.
- Treat missing, invalid, stale, or incomplete data as `Needs Manual Review`.
- Treat a missing `docs/project-management/` folder as a normal empty state, not an error.
- Do not add Roadmap, Sprint, GitHub, Portfolio, or editing behavior in this sprint.
