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
const PORT = Number(process.env.LAUNCHER_API_PORT || 3059);
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || "C:\\Development\\Projects";
const MANAGED = new Map();
const LOG_LIMIT = 120;
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

  return {
    ...project,
    status: services.some((service) => service.managedRunning) ? "running" : "stopped",
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
    }));
  }

  return projects;
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

app.post("/api/projects/:projectId/start", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    await startProject(project);
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
  await stopProject(projectId);
  res.json(await findProject(projectId));
});

app.post("/api/projects/:projectId/restart", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "running") return res.status(400).json({ error: "Project is not running." });
    await stopProject(project.id);
    await startProject(project);
    res.json(await hydrateStatus(project));
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
