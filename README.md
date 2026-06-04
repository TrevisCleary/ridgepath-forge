# Local Project Launcher

Local dashboard for launching and monitoring development projects under a configurable project root.

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:3060`.

The dashboard API runs on `http://localhost:3059` and can be pointed at another project root:

```powershell
$env:PROJECTS_ROOT = "C:\Development\Projects"
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
- Stops only processes started by this launcher with one Stop button.
- Restarts services with one Restart button.
- Hides Open, Restart, and Stop project actions unless the selected project is running.
- Shows a Port Map modal from the top KPI row with discovered ports and open/closed status.
- Runs `git pull --ff-only` for a selected project from the Git Sync button when a GitHub remote exists.
- Infers work vs. personal projects from the GitHub remote owner.
- Opens project folders in File Explorer from the displayed project path.
- Stores edited project descriptions in `data/project-overrides.json`, which is ignored by Git.
- Displays project favicons when a known favicon/icon file exists.

Projects that are already running outside this launcher may show an open port, but the Stop button will not kill externally started processes.

## Refresh Cadence

The UI refreshes project status every 5 seconds and after launcher actions complete. A managed process that exits should be reflected on the next refresh cycle.

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

## Local Name

Windows host resolution can map a name to `127.0.0.1`, but it cannot map a name to a port. A valid local hostname such as `dev-launcher` can be used as:

```text
http://dev-launcher:3060/
```

The default `npm run dev` command also starts a small local redirect on port 80, so this shorter URL works when port 80 is available:

```text
http://dev-launcher/
```

Register the local hostnames from an elevated PowerShell session:

```powershell
.\scripts\register-hostnames.ps1
```
