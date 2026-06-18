# Ridge Fabric Refactor Project

Started: 2026-06-18

## Goal

Refactor RidgePath Forge so Ridge Fabric is maintained as a first-class, Syncthing-friendly infrastructure registry instead of a Markdown-table side feature.

## Working Decisions

| Decision | Status | Notes |
| --- | --- | --- |
| Canonical registry data should be plain files | Accepted | Use JSON files so Syncthing can transfer records between machines. |
| SQLite should not be the synced source of truth | Accepted | SQLite can be a future local cache, not the canonical synced store. |
| Only one computer edits at a time | Accepted | Use a lightweight active-editor lock to prevent accidental laptop/desktop overlap. |
| Markdown should remain useful | Accepted | Generate Markdown summaries from JSON records rather than hand-editing tables. |
| Refactor should be staged | Accepted | Keep the app usable after each pass. |

## Major Passes

| Pass | Status | Outcome |
| --- | --- | --- |
| 1. Project tracker | Complete | Created this tracker and updated it at each major pass. |
| 2. JSON registry repository | Complete | Added server module for JSON records, migration from `devices.md`, generated Markdown, conflict detection, and lock metadata. |
| 3. API wiring | Complete | Ridge Fabric routes now use the repository module; old inline Markdown-table parser was removed from `server/index.js`. |
| 4. Frontend workflow | Complete | Full-page Fabric workspace now displays edit mode, active host, conflict count, and disables writes in read-only states. |
| 5. Broader Forge modularization | Complete | Split Ridge Fabric, operations, registration, project detail, project table, demo portal, and port map UI into domain modules. |
| 6. Runtime verification | Complete | Rebuilt, restarted, fixed API launch persistence, and browser-verified Projects and Fabric views. |

## Current Progress

### 2026-06-18

- Created the refactor tracker.
- Added `server/domains/ridge-fabric/repository.js` as the new Ridge Fabric storage boundary.
- The repository can migrate current `devices.md` rows into `devices/*.json`, regenerate `devices.md`, detect Syncthing conflict files, and maintain `.active-editor.json`.
- Migrated the current registry into 11 JSON device records under `C:\Development\Shared\ridge-fabric-registry\devices`.
- Confirmed `devices.md` is now generated from JSON records and `.active-editor.json` identifies `411100-PCK39` as the active editor.
- Wired the Ridge Fabric API routes to the repository module.
- Removed the old inline Ridge Fabric Markdown parser from `server/index.js`.
- Updated the Fabric workspace to surface editable/read-only mode, active host, and Syncthing conflict warnings.
- Restarted Forge and verified health, project discovery, Fabric registry, and browser behavior end to end.
- Verified no secret-looking patterns in the Ridge Fabric registry after JSON migration.
- Current verification: `GET /api/health`, `GET /api/projects`, `GET /api/ridge-fabric`, and `http://127.0.0.1:3060` all returned healthy responses.
- Next step: broader Forge modularization, starting with extracting the Ridge Fabric frontend components and shared API helper into feature/lib files.

### Frontend Extraction Pass

- Added `src/lib/api.js` for the shared `apiJson()` request helper.
- Added `src/features/ridge-fabric/RidgeFabricWorkspace.jsx` for the full-page Ridge Fabric workspace.
- Updated `src/main.jsx` to import the shared API helper and Ridge Fabric workspace.
- Removed the inline Ridge Fabric workspace from `src/main.jsx`, reducing it from roughly 2,094 lines to 1,875 lines.
- Verified `npm.cmd run build` after extraction.
- Restarted Forge and verified `GET /api/health`, `GET /api/projects`, `GET /api/ridge-fabric`, and `http://127.0.0.1:3060`.
- Browser-verified the extracted Fabric workspace: 11 rows, editable state, active host `411100-PCK39`, no action error, no console errors, and no horizontal overflow.
- Next step: split additional Forge frontend sections, starting with modal/workspace components that are currently embedded in `src/main.jsx`; the best next targets are `OperationsLibraryModal`, `RegisterProjectModal`, and `ProjectDetail`.

### Operations Library Extraction Pass

- Added `src/features/operations-library/OperationsLibraryModal.jsx`.
- Updated `src/main.jsx` to import `OperationsLibraryModal`.
- Removed the inline operations modal and helper lists from `src/main.jsx`, reducing it to roughly 1,810 lines.
- Verified `npm.cmd run build` after extraction.
- Next step: extract `RegisterProjectModal` and its local segmented-control helper.

### Project Registration Extraction Pass

- Added `src/features/project-registration/RegisterProjectModal.jsx`.
- Moved the registration form defaults and segmented control into the project-registration feature.
- Updated `src/main.jsx` to import `RegisterProjectModal`.
- Removed the inline registration modal from `src/main.jsx`, reducing it to roughly 1,592 lines.
- Verified `npm.cmd run build` after extraction.
- Next step: extract the project detail workspace and its overview/services/activity/log sections.

### Project Detail Extraction Pass

- Added `src/features/projects/ProjectDetail.jsx`.
- Added `src/features/projects/runtime.js` for shared project runtime state and port label helpers.
- Updated `src/main.jsx` to import the project detail workspace and runtime helpers.
- Removed the inline project detail workspace, project-management dashboard helpers, service row, info row, and clipboard/prompt helpers from `src/main.jsx`.
- Reduced `src/main.jsx` from roughly 1,592 lines to roughly 752 lines.
- Verified `npm.cmd run build` after extraction.
- Next step: extract remaining project list, demo portal, and port map UI so `src/main.jsx` mostly owns application state and route/view orchestration.

### Project List And Modal Extraction Pass

- Added `src/features/projects/ProjectTable.jsx`.
- Added `src/features/projects/PortTreeModal.jsx`.
- Added `src/features/demo-portal/DemoPortalModal.jsx`.
- Moved the project table filters/actions, port map modal, and RidgePath Demo Portal modal out of `src/main.jsx`.
- Removed demo portal constants from `src/main.jsx`; the demo portal feature now owns its own public route construction.
- Reduced `src/main.jsx` from roughly 752 lines to roughly 410 lines.
- Verified `npm.cmd run build` after extraction.
- Next step: restart Forge and verify the API/UI path end to end after the modularization.

### Runtime Verification Pass

- Restarted Forge with `scripts/restart-launcher.ps1`.
- Found the UI stayed up while the API stopped after initially reporting healthy.
- Checked `.launcher-logs/forge-api.*.log`; the API had started cleanly with no stderr, so this was launcher persistence rather than an application crash.
- Updated `scripts/start-launcher.ps1` to start `node.exe server/index.js` directly instead of going through `cmd.exe /c npm.cmd run server`.
- Restarted again and confirmed listeners remained active on API port `3059` and UI port `3060`.
- Verified `GET /api/health`, `GET /api/projects`, `GET /api/ridge-fabric`, and `http://127.0.0.1:3060` all returned HTTP 200.
- Browser-verified the project directory: 16 rows, no loading/no-match state, no action error, no console errors, and no horizontal overflow.
- Browser-verified the Fabric workspace: 9 active device rows, editable state, active host `411100-PCK39`, no action error, no console errors, and no horizontal overflow.
- Saved verification screenshot to `C:\Development\Shared\ridgepath-forge\ridge-fabric-refactor-final-verification.png`.
- Next step: optional follow-up is deeper decomposition of `ProjectDetail.jsx` into project-management submodules; current refactor target is complete and verified.

### 502 Reset Follow-Up

- User reported `Forge API request failed with HTTP 502` after the refactor.
- Verified root cause: redirect/UI ports `80` and `3060` were listening, but API port `3059` was not listening.
- Confirmed `http://127.0.0.1/api/health` returned 502 while `http://127.0.0.1:3059/api/health` refused the connection.
- Started the API directly with `node.exe server/index.js`; direct and proxied health checks returned HTTP 200.
- Strengthened `scripts/restart-launcher.ps1` so `Wait-ForHttpStatus` requires repeated successful responses before reporting a service as healthy.
- Ran the full restart helper again and confirmed, after a delay, that `GET /api/health`, proxied `GET /api/health`, `GET /api/ridge-fabric`, and the UI all returned HTTP 200.
- Browser-reloaded Forge and confirmed the 502 text was gone, no action error was present, and no console errors were captured.

### Fabric Header And Device Modal Pass

- Added a right-aligned `Copy Inventory Prompt` button to the Ridge Fabric header.
- The copied prompt is machine-portable: it instructs Codex to run read-only Windows inventory commands such as `Get-ComputerInfo`, `Get-CimInstance`, `Get-ScheduledTask`, `Get-Service`, `Get-NetTCPConnection`, uninstall registry reads, `Get-OdbcDriver`, `Get-ExecutionPolicy`, and `Get-NetFirewallProfile`.
- The prompt includes the local Ridge Fabric source-of-truth paths and a summary of known devices currently loaded in Forge.
- Replaced the Fabric right-side device context panel with a centered device modal that opens when a registry table row is clicked.
- Kept edit, reset, save, and remove actions inside the device modal.
- Added Fabric-specific header button styling so `Projects`, `Open Registry`, and `Refresh` no longer render as white/blank buttons under the broader `.actions button` rule.
- Verified with local Playwright: clipboard contains the inventory prompt, header buttons have visible text, table row click opens a centered device modal, the old right editor is absent, no horizontal overflow is present, and no console errors were captured.

### Atlas Prompt Integration Pass

- Integrated the Atlas topology-auditor prompt into Forge's `Copy Inventory Prompt` action.
- Added explicit safety rules: no secret values, no credential-file reads beyond metadata/key presence, no destructive changes, and elevation skips should be documented.
- Expanded the copied prompt to request a durable `automation-topology.md` style machine report in addition to the Ridge Fabric JSON device record.
- Added report sections for host identity, storage, network posture, source control, runtime toolchain, language environments, installed applications, running services, scheduled jobs, browser/UI automation, databases, security boundaries, current workloads, gaps, and inventory commands used.
- Expanded command coverage for storage, processor/RAM, local users/groups, toolchain versions, global packages, Docker, Git context, and workspace/project file discovery.
- Verified `npm.cmd run build`.
- Verified the Fabric copy button places a prompt on the clipboard containing the safety rules, `automation-topology.md`, runtime/toolchain sections, scheduled-job coverage, secret scan instruction, Ridge Fabric JSON deliverable, and core PowerShell inventory commands.

### RustDesk Remote Access Pass

- Reviewed `C:\Development\Projects\ridgepath-support-desk` and reused its RustDesk launch convention: `rustdesk://<id>@<server>:21117`, with an optional key query parameter.
- Added a `remoteAccess` subrecord to Fabric devices with provider, RustDesk ID, ID server, relay server, optional server key, and notes.
- Kept the integration metadata-only; Fabric does not store unattended-access passwords.
- Exposed `remoteAccess` and `hasRemoteAccess` through the Ridge Fabric API.
- Added a Remote column to the Fabric device table.
- Added a RustDesk remote-access strip and editable RustDesk fields inside the centered Fabric device modal.
- Added `Launch RustDesk` links that are enabled only when a RustDesk ID is registered for the device.
- Updated the copied inventory prompt so new machine reports can propose a safe `remoteAccess` block without printing passwords.
- Verified `npm.cmd run build`.
- Restarted Forge and verified API `3059`, normal UI `3060`, and temporary review UI `3075`.
- Verified the Fabric API returns `remoteAccess` metadata for devices.
- Headless UI verification on `http://127.0.0.1:3075`: Remote column rendered once, device modal rendered RustDesk controls, `Launch RustDesk` rendered, no console errors, and no horizontal overflow.
- Saved verification screenshot to `C:\Development\Shared\ridgepath-forge\fabric-rustdesk-verification.png`.

### Command Center Planning Pass

- Added `docs/implementation/forge-command-center-improvement-plan.md`.
- The plan reframes Forge as a two-layer system: a local Forge Agent for privileged local actions, and a Forge Command Center for project/Fabric/automation visibility.
- The recommended implementation starts with a navigation shell, overview page, project command center redesign, and local-agent capability contract before any hosted/Vercel read model.
- Created branch `codex/forge-command-center-ui` for the command-center implementation.
- Started Phase 1 by adding the left navigation shell, top command bar, Overview page, and first-class section placeholders while preserving current local action APIs.

## Open Questions

| Question | Current answer |
| --- | --- |
| Should removal delete records or archive them? | Start with removal from active registry; consider `_removed/` archive if mistakes become likely. |
| Should generated Markdown overwrite `devices.md`? | Yes, after JSON migration, `devices.md` should become generated summary output. |
| Should reports like `atlas-automation-topology.md` move? | No, preserve existing reports and link them from JSON records. |
