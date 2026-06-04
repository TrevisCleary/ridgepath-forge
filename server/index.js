import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(APP_ROOT, "data");
const OVERRIDES_FILE = path.join(DATA_DIR, "project-overrides.json");
const REGISTRY_FILE = path.join(DATA_DIR, "project-registry.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity-log.json");
const PORT = Number(process.env.LAUNCHER_API_PORT || 3059);
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || "C:\\Development\\Projects";
const OPERATIONS_LIBRARY_ROOT = process.env.OPERATIONS_LIBRARY_ROOT || "C:\\Development\\Shared\\codex-operations-library";
const MANAGED = new Map();
const LOG_LIMIT = 120;
const ACTIVITY_LIMIT = 200;
const WORK_OWNERS = new Set(
  String(process.env.WORK_GITHUB_OWNERS || "")
    .split(",")
    .map((owner) => owner.trim().toLowerCase())
    .filter(Boolean),
);

const app = express();
app.use(express.json());

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendActivity(projectId, action, message, meta = {}) {
  const activity = await readJson(ACTIVITY_FILE, []);
  activity.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    projectId,
    action,
    message,
    meta,
  });
  await writeJson(ACTIVITY_FILE, activity.slice(0, ACTIVITY_LIMIT));
}

async function projectActivity(projectId) {
  const activity = await readJson(ACTIVITY_FILE, []);
  return activity.filter((entry) => entry.projectId === projectId).slice(0, 20);
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function getProjectFiles(projectPath) {
  try {
    return await fs.readdir(projectPath);
  } catch {
    return [];
  }
}

function inferFramework(pkg, files) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.next || files.some((file) => file.startsWith("next.config."))) return "Next.js";
  if (deps.vite || files.some((file) => file.startsWith("vite.config."))) return "Vite";
  if (deps.express) return "Express";
  if (pkg.workspaces) return "Node workspace";
  return "Node";
}

function inferPortFromText(text, framework, scriptName = "") {
  const patterns = [
    /\bPORT\s*=\s*(\d{2,5})\b/i,
    /\b(?:const|let|var)\s+\w*port\w*\s*=\s*process\.env\.PORT\s*\|\|\s*["']?(\d{2,5})/i,
    /\bprocess\.env\.PORT\s*\|\|\s*["']?(\d{2,5})/i,
    /(?:^|\s)--port\s+(\d{2,5})\b/i,
    /\s-p\s+(\d{2,5})\b/i,
    /\bport:\s*(\d{2,5})\b/i,
    /\blisten\(\s*(\d{2,5})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[match.length - 1]);
  }

  if (scriptName.includes("api")) return null;
  if (framework === "Next.js") return 3000;
  if (framework === "Vite") return 5173;
  return null;
}

function workspacePath(projectPath, command) {
  const match = command.match(/--workspace\s+([^\s]+)/i);
  return match ? path.join(projectPath, match[1]) : projectPath;
}

function workspaceScriptName(command) {
  const match = command.match(/\brun\s+([^\s]+)/i);
  return match ? match[1] : "";
}

function gitOrigin(projectPath) {
  try {
    const gitConfig = fsSync.readFileSync(path.join(projectPath, ".git", "config"), "utf8");
    return gitConfig.match(/url\s*=\s*(.+)/)?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function githubOwner(origin = "") {
  const normalized = origin.replace(/^git@github\.com:/i, "https://github.com/");
  return normalized.match(/github\.com[:/](?<owner>[^/]+)\//i)?.groups?.owner || "";
}

function runCapture(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.on("error", () => resolve(""));
    child.on("exit", (code) => resolve(code === 0 ? stdout.trim() : ""));
  });
}

async function gitStatus(projectPath, lastSync = "") {
  if (!fsSync.existsSync(path.join(projectPath, ".git"))) {
    return { branch: "", dirty: false, lastSync };
  }
  const branch = await runCapture("git.exe", ["branch", "--show-current"], projectPath);
  const status = await runCapture("git.exe", ["status", "--porcelain"], projectPath);
  return {
    branch,
    dirty: Boolean(status),
    lastSync,
  };
}

function projectAudience(origin) {
  const owner = githubOwner(origin).toLowerCase();
  if (!owner) return "unknown";
  return WORK_OWNERS.has(owner) ? "work" : "personal";
}

function firstReadmeLine(readme) {
  return readme
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line && !line.startsWith("!"));
}

function findFavicon(projectPath, files) {
  const candidates = [
    "public/favicon.ico",
    "public/favicon.svg",
    "public/icon.svg",
    "public/icon.png",
    "src/app/favicon.ico",
    "app/favicon.ico",
    "app/icon.svg",
    "assets/favicon.ico",
    "assets/favicon-32x32.png",
    "assets/infinity-reference-library-icon.png",
  ];
  for (const relative of candidates) {
    if (fsSync.existsSync(path.join(projectPath, relative))) return relative.replaceAll("\\", "/");
  }
  return files.find((item) => /favicon|icon\.(ico|png|svg|jpg|jpeg)$/i.test(item)) || "";
}

async function inferPort(projectPath, framework, scriptName, command, kind) {
  const servicePath = workspacePath(projectPath, command);
  const shared = [
    command,
    await readIfExists(path.join(servicePath, ".env.local")),
    await readIfExists(path.join(servicePath, ".env")),
    await readIfExists(path.join(projectPath, ".env.local")),
    await readIfExists(path.join(projectPath, ".env")),
  ];
  const appFiles = [
    await readIfExists(path.join(servicePath, "vite.config.js")),
    await readIfExists(path.join(servicePath, "vite.config.ts")),
    await readIfExists(path.join(projectPath, "vite.config.js")),
    await readIfExists(path.join(projectPath, "vite.config.ts")),
  ];
  const apiFiles = [
    await readIfExists(path.join(servicePath, "server", "index.js")),
    await readIfExists(path.join(servicePath, "server.js")),
    await readIfExists(path.join(projectPath, "server", "index.js")),
    await readIfExists(path.join(projectPath, "server.js")),
    await readIfExists(path.join(projectPath, "scripts", "dev-with-api.mjs")),
  ];
  const candidates = [...shared, ...(kind === "api" ? apiFiles : appFiles), ...(kind === "api" ? appFiles : apiFiles)];

  for (const candidate of candidates) {
    const port = inferPortFromText(candidate, "", scriptName);
    if (port) return port;
  }

  return inferPortFromText("", framework, scriptName);
}

function classifyScript(scriptName, command) {
  const value = `${scriptName} ${command}`.toLowerCase();
  if (value.includes("api") || value.includes("server/index") || value.includes("backend")) return "api";
  if (value.includes("db:") || value.includes("postgres") || value.includes("migrate") || value.includes("seed")) return "database";
  return "primary";
}

function nextAssignedPort(projects, audience, kind = "primary") {
  const ranges = {
    "work:primary": 3100,
    "work:api": 4100,
    "personal:primary": 3200,
    "personal:api": 4200,
    "unknown:primary": 3300,
    "unknown:api": 4300,
  };
  const base = ranges[`${audience}:${kind}`] || ranges["unknown:primary"];
  const used = new Set(projects.flatMap((project) => project.services.map((service) => service.port).filter(Boolean)));
  for (let port = base + 1; port < base + 100; port++) {
    if (!used.has(port)) return port;
  }
  return base + 100;
}

function decoratePortCollisions(projects) {
  const counts = new Map();
  for (const project of projects) {
    for (const service of project.services) {
      if (service.port) counts.set(service.port, (counts.get(service.port) || 0) + 1);
    }
  }
  return projects.map((project) => ({
    ...project,
    services: project.services.map((service) => ({
      ...service,
      portConflict: service.port ? counts.get(service.port) > 1 : false,
    })),
  }));
}

async function buildService(projectPath, pkg, files, scriptName, label, kind, options = {}) {
  const command = pkg.scripts[scriptName];
  const servicePath = workspacePath(projectPath, command);
  const servicePkg = servicePath === projectPath ? pkg : safeReadJson(path.join(servicePath, "package.json"));
  const available = servicePath === projectPath || Boolean(servicePkg?.scripts?.[workspaceScriptName(command)]);
  const effectivePkg = servicePkg || pkg;
  const serviceFiles = servicePath === projectPath ? files : await getProjectFiles(servicePath);
  const framework = inferFramework(effectivePkg, serviceFiles);
  const nestedScript = servicePath === projectPath ? "" : servicePkg?.scripts?.[workspaceScriptName(command)];
  const portCommand = nestedScript ? `${command}\n${nestedScript}` : command;
  return {
    id: `${slug(label)}-${scriptName.replace(/[^a-z0-9:.-]/gi, "-")}`,
    label,
    kind,
    script: scriptName,
    command,
    framework,
    port: await inferPort(projectPath, framework, scriptName, portCommand, kind),
    available,
    note: available ? "" : "Workspace script target is missing package metadata.",
    combined: Boolean(options.combined),
  };
}

function isRunning(child) {
  return Boolean(child && child.exitCode === null && !child.killed);
}

async function checkPort(port) {
  if (!port) return "unknown";
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port, timeout: 450 });
    socket.on("connect", () => {
      socket.destroy();
      resolve("open");
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve("closed");
    });
    socket.on("error", () => resolve("closed"));
  });
}

async function hydrateStatus(project) {
  const managed = MANAGED.get(project.id);
  const services = await Promise.all(project.services.map(async (service) => {
    const managedService = managed?.services.get(service.id);
    return {
      ...service,
      managedRunning: isRunning(managedService?.process),
      portStatus: await checkPort(service.port),
    };
  }));
  const hasManagedRunning = services.some((service) => service.managedRunning);
  const hasAssignedPortOpen = services.some((service) => service.portStatus === "open");

  return {
    ...project,
    managedRunning: hasManagedRunning,
    status: hasManagedRunning || hasAssignedPortOpen ? "running" : "stopped",
    services,
    logs: managed?.logs || [],
  };
}

async function discoverProjects() {
  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const overrides = await readJson(OVERRIDES_FILE, {});
  const projects = [];

  for (const entry of entries.filter((item) => item.isDirectory() && !item.name.startsWith("."))) {
    const projectPath = path.join(PROJECTS_ROOT, entry.name);
    const pkg = safeReadJson(path.join(projectPath, "package.json"));
    const files = await getProjectFiles(projectPath);
    const readme = await readIfExists(path.join(projectPath, "README.md"));
    const origin = gitOrigin(projectPath);
    const id = slug(entry.name);
    const override = overrides[id] || {};
    const services = [];

    if (!pkg) {
      projects.push(await hydrateStatus({
        id,
        folderName: entry.name,
        name: entry.name,
        description: override.description || firstReadmeLine(readme) || "No package metadata found.",
        path: projectPath,
        origin,
        owner: githubOwner(origin),
        audience: override.audience || projectAudience(origin),
        framework: "Unknown",
        faviconUrl: "",
        services,
        scripts: {},
        managed: false,
        git: await gitStatus(projectPath, override.lastGitSync || ""),
        activity: await projectActivity(id),
      }));
      continue;
    }

    const scripts = pkg.scripts || {};
    if (scripts["dev:db"] && scripts["dev:db"].includes("dev-with-api")) {
      services.push(await buildService(projectPath, pkg, files, "dev:db", "Application + API", "primary", { combined: true }));
    } else {
      if (scripts["dev:frontend"]) services.push(await buildService(projectPath, pkg, files, "dev:frontend", "Application", "primary"));
      if (scripts["dev:api"]) services.push(await buildService(projectPath, pkg, files, "dev:api", "API", "api"));
      if (!services.some((service) => service.kind === "primary") && scripts.dev) {
        services.push(await buildService(projectPath, pkg, files, "dev", "Application", classifyScript("dev", scripts.dev)));
      }
      if (!services.some((service) => service.kind === "primary") && scripts.start) {
        services.push(await buildService(projectPath, pkg, files, "start", "Application", classifyScript("start", scripts.start)));
      }
      if (!services.some((service) => service.kind === "api") && scripts.api) services.push(await buildService(projectPath, pkg, files, "api", "API", "api"));
      if (!services.some((service) => service.kind === "api") && scripts["dev:db"]) {
        services.push(await buildService(projectPath, pkg, files, "dev:db", "API / data service", "api"));
      }
    }

    const framework = inferFramework(pkg, files);
    const favicon = findFavicon(projectPath, files);
    projects.push(await hydrateStatus({
      id,
      folderName: entry.name,
      name: pkg.name || entry.name,
      version: pkg.version || "",
      description: override.description || pkg.description || firstReadmeLine(readme) || "No description available.",
      path: projectPath,
      origin,
      owner: githubOwner(origin),
      audience: override.audience || projectAudience(origin),
      framework,
      packageManager: pkg.packageManager || "npm",
      faviconUrl: favicon ? `/api/projects/${id}/favicon?path=${encodeURIComponent(favicon)}` : "",
      services,
      scripts,
      managed: Boolean(MANAGED.get(id)),
      git: await gitStatus(projectPath, override.lastGitSync || ""),
      activity: await projectActivity(id),
    }));
  }

  return decoratePortCollisions(projects);
}

function appendLog(projectId, line) {
  const managed = MANAGED.get(projectId);
  if (!managed) return;
  managed.logs.push(line.toString().replace(/\s+$/g, ""));
  if (managed.logs.length > LOG_LIMIT) managed.logs.splice(0, managed.logs.length - LOG_LIMIT);
}

async function findProject(projectId) {
  const projects = await discoverProjects();
  return projects.find((project) => project.id === projectId);
}

function spawnService(project, service) {
  const child = spawn("cmd.exe", ["/c", "npm.cmd", "run", service.script], {
    cwd: project.path,
    env: { ...process.env, FORCE_COLOR: "1" },
    windowsHide: true,
  });

  appendLog(project.id, `[${service.label}] npm run ${service.script}`);
  child.stdout.on("data", (data) => appendLog(project.id, `[${service.label}] ${data}`));
  child.stderr.on("data", (data) => appendLog(project.id, `[${service.label}] ${data}`));
  child.on("exit", (code, signal) => appendLog(project.id, `[${service.label}] exited code=${code ?? "null"} signal=${signal ?? "null"}`));
  return child;
}

function stopProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    killer.on("exit", () => resolve());
    killer.on("error", () => resolve());
  });
}

function listenerPidsForPort(port) {
  return new Promise((resolve) => {
    if (!port) return resolve([]);
    const command = `Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`;
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", () => resolve([]));
    child.on("exit", () => {
      const pids = output
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
      resolve([...new Set(pids)]);
    });
  });
}

function runProjectCommand(project, command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: project.path,
      windowsHide: true,
    });
    appendLog(project.id, `[${label}] ${command} ${args.join(" ")}`);
    child.stdout.on("data", (data) => appendLog(project.id, `[${label}] ${data}`));
    child.stderr.on("data", (data) => appendLog(project.id, `[${label}] ${data}`));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      appendLog(project.id, `[${label}] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}.`));
    });
  });
}

async function stopProject(projectId) {
  const managed = MANAGED.get(projectId);
  if (!managed) return false;
  const stops = [];
  for (const managedService of managed.services.values()) {
    if (isRunning(managedService.process)) stops.push(stopProcessTree(managedService.process.pid));
  }
  if (!stops.length) return false;
  await Promise.all(stops);
  managed.services.clear();
  appendLog(projectId, "[launcher] stopped managed services");
  return true;
}

async function takeOverProject(project) {
  const managed = MANAGED.get(project.id) || { services: new Map(), logs: [] };
  MANAGED.set(project.id, managed);

  const openServices = project.services.filter((service) => service.available && service.port && service.portStatus === "open");
  if (!openServices.length) throw new Error("No assigned open ports found to take over.");

  const pids = new Set();
  for (const service of openServices) {
    for (const pid of await listenerPidsForPort(service.port)) {
      pids.add(pid);
    }
  }
  if (!pids.size) throw new Error("No listener process found for the assigned open ports.");

  appendLog(project.id, `[launcher] taking over ports ${openServices.map((service) => service.port).join(", ")}`);
  await Promise.all([...pids].map((pid) => stopProcessTree(pid)));
  await new Promise((resolve) => setTimeout(resolve, 800));
  await startProject(await findProject(project.id));
}

async function createRegisteredProject({
  name,
  audience = "personal",
  port,
  applicationClassification = "Internal Business Application",
  technologyStack = "Vite + React + JavaScript",
  repositoryOwner = "treviscleary",
  repositoryVisibility = "Private",
  hostingStrategy = "Vercel",
  hostingPlatform = "",
  packageManager = "npm",
  createStandardDocumentation = true,
  createGovernanceAssets = true,
}) {
  const projectName = String(name || "").trim();
  if (!projectName) throw new Error("Project name is required.");
  const folderName = slug(projectName);
  const projectPath = path.join(PROJECTS_ROOT, folderName);
  if (fsSync.existsSync(projectPath)) throw new Error(`Project path already exists: ${projectPath}`);

  const existing = await discoverProjects();
  const assignedPort = Number(port || nextAssignedPort(existing, audience, "primary"));
  if (existing.some((project) => project.services.some((service) => service.port === assignedPort))) {
    throw new Error(`Port ${assignedPort} is already assigned.`);
  }

  const bootstrap = {
    applicationClassification: String(applicationClassification || "Internal Business Application").trim(),
    technologyStack: String(technologyStack || "Vite + React + JavaScript").trim(),
    repositoryOwner: String(repositoryOwner || "treviscleary").trim(),
    repositoryVisibility: String(repositoryVisibility || "Private").trim(),
    hostingStrategy: String(hostingStrategy || "Vercel").trim(),
    hostingPlatform: String(hostingPlatform || "").trim(),
    packageManager: String(packageManager || "npm").trim(),
    createStandardDocumentation: Boolean(createStandardDocumentation),
    createGovernanceAssets: Boolean(createGovernanceAssets),
  };
  const hostingLabel = bootstrap.hostingStrategy === "Other" && bootstrap.hostingPlatform ? bootstrap.hostingPlatform : bootstrap.hostingStrategy;

  await fs.mkdir(path.join(projectPath, "docs"), { recursive: true });
  if (bootstrap.createStandardDocumentation) {
    await Promise.all([
      fs.mkdir(path.join(projectPath, "docs", "requirements"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "docs", "architecture"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "docs", "features"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "docs", "decisions"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "docs", "validation"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "assets"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "scripts"), { recursive: true }),
      fs.mkdir(path.join(projectPath, "tests"), { recursive: true }),
    ]);
  }
  await fs.writeFile(path.join(projectPath, "package.json"), `${JSON.stringify({
    name: folderName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      start: `set PORT=${assignedPort}&& node server.js`,
    },
  }, null, 2)}\n`);
  await fs.writeFile(path.join(projectPath, "server.js"), `import http from "node:http";\n\nconst port = Number(process.env.PORT || ${assignedPort});\nconst name = ${JSON.stringify(projectName)};\n\nhttp.createServer((_req, res) => {\n  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });\n  res.end(\`<!doctype html><html><head><title>\${name}</title></head><body style="font-family:Segoe UI,sans-serif;padding:32px"><h1>\${name}</h1><p>Registered by Local Project Launcher.</p></body></html>\`);\n}).listen(port, "127.0.0.1", () => {\n  console.log(\`\${name} listening on http://localhost:\${port}\`);\n});\n`);
  await fs.writeFile(path.join(projectPath, "README.md"), `# ${projectName}\n\nRegistered by Local Project Launcher on port ${assignedPort}.\n\n## Bootstrap Snapshot\n\n- Application Classification: ${bootstrap.applicationClassification}\n- Technology Stack: ${bootstrap.technologyStack}\n- Repository: ${bootstrap.repositoryOwner}/${folderName} (${bootstrap.repositoryVisibility})\n- Hosting: ${hostingLabel}\n- Package Manager: ${bootstrap.packageManager}\n\nThis project is registered only. Start it from Local Project Launcher when you are ready.\n`);
  await fs.writeFile(path.join(projectPath, "bootstrap-config.md"), `# Bootstrap Configuration\n\nGenerated By: Local Project Launcher\nProject Name: ${projectName}\nProject Slug: ${folderName}\nProject Root: ${projectPath}\nAudience: ${audience}\nAssigned Port: ${assignedPort}\nApplication Classification: ${bootstrap.applicationClassification}\nTechnology Stack: ${bootstrap.technologyStack}\nRepository Owner: ${bootstrap.repositoryOwner}\nRepository Visibility: ${bootstrap.repositoryVisibility}\nHosting Strategy: ${bootstrap.hostingStrategy}\nHosting Platform: ${bootstrap.hostingPlatform || "N/A"}\nPackage Manager: ${bootstrap.packageManager}\nCreate Standard Documentation: ${bootstrap.createStandardDocumentation ? "Yes" : "No"}\nCreate Governance Assets: ${bootstrap.createGovernanceAssets ? "Yes" : "No"}\nStart Immediately: No\nOperations Library: ${OPERATIONS_LIBRARY_ROOT}\n\nNext Step: Use the Codex Operations Library new-project workflow to complete discovery, planning, and governance assets.\n`);
  await fs.writeFile(path.join(projectPath, "docs", "operations-library-handoff.md"), `# Operations Library Handoff\n\nThis project was registered by Local Project Launcher so it is visible in the development port map. It was not started automatically.\n\n- Project: ${projectName}\n- Path: ${projectPath}\n- Assigned Port: ${assignedPort}\n- Audience: ${audience}\n- Application Classification: ${bootstrap.applicationClassification}\n- Technology Stack: ${bootstrap.technologyStack}\n- Repository: ${bootstrap.repositoryOwner}/${folderName} (${bootstrap.repositoryVisibility})\n- Hosting: ${hostingLabel}\n- Package Manager: ${bootstrap.packageManager}\n- Standard Documentation: ${bootstrap.createStandardDocumentation ? "Created" : "Skipped"}\n- Governance Assets: ${bootstrap.createGovernanceAssets ? "Requested" : "Skipped"}\n- Operations Library Root: ${OPERATIONS_LIBRARY_ROOT}\n\nRecommended Operations Library entry point:\n\n\`\`\`powershell\ncd ${OPERATIONS_LIBRARY_ROOT}\n.\\New-CodexProject.ps1 -BasePath ${PROJECTS_ROOT}\n\`\`\`\n\nIf this project already exists, use \`prompts/onboard-existing-project.md\`. If it is still being initiated, use \`prompts/start-new-project.md\`.\n`);
  if (bootstrap.createGovernanceAssets) {
    await fs.writeFile(path.join(projectPath, "docs", "governance-bootstrap.md"), `# Governance Bootstrap\n\n- Status: Needs manual review\n- Source: Local Project Launcher registration\n- Operations Library Root: ${OPERATIONS_LIBRARY_ROOT}\n\n## Captured Setup\n\n- Application Classification: ${bootstrap.applicationClassification}\n- Technology Stack: ${bootstrap.technologyStack}\n- Repository Visibility: ${bootstrap.repositoryVisibility}\n- Hosting: ${hostingLabel}\n\nUse the Operations Library workflow to confirm requirements, ownership, validation expectations, and release governance before treating this as complete.\n`);
  }

  const registry = await readJson(REGISTRY_FILE, []);
  registry.push({ id: folderName, name: projectName, path: projectPath, audience, assignedPort, createdAt: new Date().toISOString(), operationsLibraryRoot: OPERATIONS_LIBRARY_ROOT, bootstrap });
  await writeJson(REGISTRY_FILE, registry);

  await appendActivity(folderName, "register", `Registered project on port ${assignedPort}`, { projectPath, assignedPort, operationsLibraryRoot: OPERATIONS_LIBRARY_ROOT });
  return await findProject(folderName);
}

async function startProject(project) {
  const runnable = project.services.filter((service) => service.available);
  if (!runnable.length) throw new Error("Project has no runnable dev service.");

  const managed = MANAGED.get(project.id) || { services: new Map(), logs: [] };
  MANAGED.set(project.id, managed);

  for (const service of runnable) {
    const existing = managed.services.get(service.id);
    if (isRunning(existing?.process)) continue;
    managed.services.set(service.id, { process: spawnService(project, service), service });
  }
}

app.get("/api/projects", async (_req, res) => {
  try {
    res.json({ root: PROJECTS_ROOT, projects: await discoverProjects() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ports/next", async (req, res) => {
  try {
    const audience = String(req.query.audience || "personal");
    const kind = String(req.query.kind || "primary");
    res.json({ port: nextAssignedPort(await discoverProjects(), audience, kind) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ports/suggestions", async (_req, res) => {
  try {
    const projects = await discoverProjects();
    res.json({
      personal: nextAssignedPort(projects, "personal", "primary"),
      work: nextAssignedPort(projects, "work", "primary"),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/projects/register", async (req, res) => {
  try {
    res.json(await createRegisteredProject(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/start", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    await startProject(project);
    await appendActivity(project.id, "start", "Started managed services");
    res.json(await hydrateStatus(project));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/stop", async (req, res) => {
  const projectId = req.params.projectId;
  const project = await findProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found." });
  if (project.status !== "running") return res.status(400).json({ error: "Project is not running." });
  if (!project.managedRunning) return res.status(400).json({ error: "Project is running outside the launcher." });
  await stopProject(projectId);
  await appendActivity(projectId, "stop", "Stopped managed services");
  res.json(await findProject(projectId));
});

app.post("/api/projects/:projectId/restart", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "running") return res.status(400).json({ error: "Project is not running." });
    if (!project.managedRunning) return res.status(400).json({ error: "Project is running outside the launcher." });
    await stopProject(project.id);
    await startProject(project);
    await appendActivity(project.id, "restart", "Restarted managed services");
    res.json(await hydrateStatus(project));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/take-over", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.managedRunning) return res.status(400).json({ error: "Project is already managed by the launcher." });
    if (project.status !== "running") return res.status(400).json({ error: "Project is not running on an assigned port." });
    await takeOverProject(project);
    await appendActivity(project.id, "take-over", "Took over externally running assigned port");
    res.json(await findProject(project.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/git-sync", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.origin) return res.status(400).json({ error: "Project has no GitHub remote." });
    const managed = MANAGED.get(project.id) || { services: new Map(), logs: [] };
    MANAGED.set(project.id, managed);
    await runProjectCommand(project, "git.exe", ["pull", "--ff-only"], "git sync");
    const overrides = await readJson(OVERRIDES_FILE, {});
    overrides[project.id] = { ...(overrides[project.id] || {}), lastGitSync: new Date().toISOString() };
    await writeJson(OVERRIDES_FILE, overrides);
    await appendActivity(project.id, "git-sync", "Synced repository with git pull --ff-only");
    res.json(await findProject(project.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/projects/:projectId", async (req, res) => {
  const project = await findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const description = String(req.body.description || "").trim();
  const overrides = await readJson(OVERRIDES_FILE, {});
  overrides[project.id] = { ...(overrides[project.id] || {}), description };
  await writeJson(OVERRIDES_FILE, overrides);
  res.json(await findProject(project.id));
});

app.post("/api/projects/:projectId/open-folder", async (req, res) => {
  const project = await findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found." });
  spawn("explorer.exe", [project.path], { windowsHide: true, detached: true });
  res.json({ ok: true });
});

app.get("/api/projects/:projectId/favicon", async (req, res) => {
  const project = await findProject(req.params.projectId);
  if (!project) return res.status(404).end();
  const requested = String(req.query.path || "");
  const resolved = path.resolve(project.path, requested);
  if (!resolved.startsWith(path.resolve(project.path))) return res.status(400).end();
  res.sendFile(resolved);
});

app.get("/api/projects/:projectId/logs", (req, res) => {
  res.json({ logs: MANAGED.get(req.params.projectId)?.logs || [] });
});

app.listen(PORT, () => {
  console.log(`Local dev launcher API listening on http://localhost:${PORT}`);
  console.log(`Project root: ${PROJECTS_ROOT}`);
});
