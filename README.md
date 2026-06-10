# RidgePath Forge

Application Delivery Platform for launching, monitoring, registering, and governing development projects under a configurable project root.

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:3060`.

The RidgePath Forge API runs on `http://localhost:3059` and can be pointed at another project root:

```powershell
$env:PROJECTS_ROOT = "<project-root>"
npm run dev
```

To classify GitHub owners as work projects without hardcoding organization names:

```powershell
$env:WORK_GITHUB_OWNERS = "owner-one,owner-two"
npm run dev
```

## Behavior

- Discovers top-level project folders from `PROJECTS_ROOT`.
- Reads `package.json`, README titles, Vite config, Next.js config, `.env`, and common server files.
- Shows primary application services and API/data services when scripts such as `dev`, `start`, `dev:frontend`, `dev:api`, `api`, or `dev:db` exist.
- Starts all discovered services for a project with one Start button.
- Stops only processes started by RidgePath Forge with one Stop button.
- Restarts services with one Restart button.
- Takes over manually started projects by stopping the process on the assigned open port and restarting through RidgePath Forge.
- Hides Open, Restart, and Stop project actions unless the selected project is running.
- Shows a Port Map modal from the top KPI row with discovered ports and open/closed status.
- Runs `git pull --ff-only` for a selected project from the Repository Git Sync button when a GitHub remote exists.
- Registers new starter projects with automatic port assignment, Operations Library handoff docs, immediate start, and normal auto-discovery.
- Shows port collision warnings, repository branch/dirty/sync status, and a per-project activity timeline.
- Infers work vs. personal projects from the GitHub remote owner.
- Opens project folders in File Explorer from the displayed project path.
- Stores edited project descriptions in `data/project-overrides.json`, which is ignored by Git.
- Displays project favicons when a known favicon/icon file exists.

Projects that are already running outside RidgePath Forge are treated as running when one of their assigned ports is open. Stop and Restart are still limited to processes started by RidgePath Forge.

Use Take Over on an externally running project to stop the listener on the assigned port and restart the project as a RidgePath Forge-managed process.

## Project Registration

Use Add Project to create a minimal runnable project under `PROJECTS_ROOT`. RidgePath Forge assigns the next available primary port by audience:

- Work application ports start at `3101`.
- RidgePath application ports start at `3151`.
- Personal application ports start at `3201`.

Registration writes `bootstrap-config.md` and `docs/operations-library-handoff.md` into the new project. Those files point back to the Codex Operations Library and preserve the next workflow entry points. RidgePath Forge starts the project immediately, then the normal 5-second discovery cycle keeps it visible.

## Refresh Cadence

The UI refreshes project status every 5 seconds and after RidgePath Forge actions complete. A managed process that exits should be reflected on the next refresh cycle.

## Start On Sign-In

Register a local scheduled task:

```powershell
.\scripts\register-startup-task.ps1
```

The task runs `.\scripts\start-launcher.ps1` when the current Windows user signs in.

If Task Scheduler registration is blocked by local permissions, use the current-user Startup folder fallback:

```powershell
.\scripts\register-startup-folder.ps1
```

To restart RidgePath Forge manually from this project folder, double-click `Restart RidgePath Forge.cmd` or run:

```powershell
.\scripts\restart-launcher.ps1
```

## Local Name

Windows host resolution can map a name to `127.0.0.1`, but it cannot map a name to a port. The legacy local hostname `dev-launcher` is preserved for compatibility and can be used as:

```text
http://dev-launcher:3060/
```

The default `npm run dev` command also starts a small local redirect on port 80, so this shorter legacy URL works when port 80 is available:

```text
http://dev-launcher/
```

Register the local hostnames from an elevated PowerShell session:

```powershell
.\scripts\register-hostnames.ps1
```
