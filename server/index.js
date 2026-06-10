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
const SETTINGS_FILE = path.join(APP_ROOT, "launcher-settings.json");
const OVERRIDES_FILE = path.join(DATA_DIR, "project-overrides.json");
const REGISTRY_FILE = path.join(DATA_DIR, "project-registry.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity-log.json");
const PORT = Number(process.env.LAUNCHER_API_PORT || 3059);
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || "C:\\Development\\Projects";
const OPERATIONS_LIBRARY_ROOT = process.env.OPERATIONS_LIBRARY_ROOT || "C:\\Development\\Shared\\codex-operations-library";
const MANAGED = new Map();
const LOG_LIMIT = 120;
const ACTIVITY_LIMIT = 200;
const DEFAULT_SETTINGS = {
  operationsLibrary: {
    root: OPERATIONS_LIBRARY_ROOT,
    requiredFolders: ["templates", "prompts", "docs", "standards", "bootstrap"],
    requiredFiles: [
      "README.md",
      "START-HERE.md",
      "docs/prompt-catalog.md",
      "docs/workflow-traceability-matrix.md",
      "docs/project-management-architecture.md",
      "docs/project-management-data-model.md",
      "docs/project-launcher-ui-integration.md",
      "bootstrap/bootstrap-config-template.md",
    ],
  },
  projectManagement: {
    directory: "docs/project-management",
    dashboardFileName: "project-dashboard.json",
    supportedDashboardSchemaVersions: ["1.1"],
    initializationFiles: {
      roadmap: "roadmap.md",
      backlog: "backlog.md",
      sprintCurrent: "sprint-current.md",
      bugs: "bugs.md",
      codexActivity: "codex-activity.md",
      lifecycle: "lifecycle-status.md",
      dashboard: "project-dashboard.json",
      codexPrompt: "codex-project-management-initiation.md",
    },
    openFiles: {
      lifecycle: "lifecycle-status.md",
      backlog: "backlog.md",
      bugs: "bugs.md",
      codexActivity: "codex-activity.md",
    },
  },
  templates: {
    bootstrapConfig: "templates/bootstrap/launcher-bootstrap-config-template.md",
    launcherHandoff: "templates/handoff/launcher-handoff-template.md",
    legacyOperationsLibraryHandoff: "templates/handoff/operations-library-handoff-template.md",
    governanceBootstrap: "templates/governance/launcher-governance-bootstrap-template.md",
    projectInitiation: "templates/project-initiation-template.md",
    projectSourceReadme: "templates/project-source-readme-template.md",
    codexNextPrompt: "templates/handoff/codex-next-prompt-template.md",
    projectManagement: {
      roadmap: "templates/project-management/roadmap.md",
      backlog: "templates/project-management/backlog.md",
      sprintCurrent: "templates/project-management/sprint-current.md",
      bugs: "templates/project-management/bugs.md",
      codexActivity: "templates/project-management/codex-activity.md",
      lifecycle: "templates/project-management/lifecycle-status.md",
      dashboard: "templates/project-dashboard-template.json",
    },
  },
  workflows: {
    startNewProject: {
      name: "Start New Project",
      promptPath: "prompts/start-new-project.md",
      expectedInputs: ["Project identity", "Problem statement", "Desired outcome", "Source artifacts", "Technology preferences"],
      expectedOutputs: ["project-initiation.md", "project-source/", "bootstrap-config.md", "docs/launcher-handoff.md", "codex-next-prompt.md"],
    },
    onboardExistingProject: {
      name: "Onboard Existing Project",
      promptPath: "prompts/onboard-existing-project.md",
      expectedInputs: ["Repository path", "Application purpose", "Owner", "Documentation sources"],
      expectedOutputs: ["Onboarding summary", "Source reconciliation notes", "Governance assessment", "Standardization plan"],
    },
    projectInitiation: {
      name: "Project Initiation",
      promptPath: "prompts/project-initiation-prompt.md",
      expectedInputs: ["project-initiation.md", "project-source/", "bootstrap-config.md"],
      expectedOutputs: ["Discovery notes", "Readiness assessment", "Carry-forward questions"],
    },
  },
  artifacts: {
    projectSourceDirectories: [
      "project-source",
      "project-source/workflows",
      "project-source/spreadsheets",
      "project-source/screenshots",
      "project-source/policies",
      "project-source/requirements",
      "project-source/meetings",
      "project-source/diagrams",
      "project-source/legacy",
    ],
    standardDirectories: [
      "docs/requirements",
      "docs/architecture",
      "docs/features",
      "docs/decisions",
      "docs/validation",
      "assets",
      "scripts",
      "tests",
    ],
  },
};
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

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeSettings(base, override) {
  if (!isPlainObject(override)) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) next[key] = mergeSettings(base[key], value);
    else next[key] = value;
  }
  return next;
}

async function launcherSettings() {
  const fileSettings = await readJson(SETTINGS_FILE, {});
  const merged = mergeSettings(DEFAULT_SETTINGS, fileSettings);
  return {
    ...merged,
    operationsLibrary: {
      ...merged.operationsLibrary,
      root: process.env.OPERATIONS_LIBRARY_ROOT || merged.operationsLibrary?.root || OPERATIONS_LIBRARY_ROOT,
    },
  };
}

function normalizeRelativePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function projectManagementDirectory(settings) {
  return normalizeRelativePath(settings.projectManagement?.directory || DEFAULT_SETTINGS.projectManagement.directory);
}

function projectManagementDashboardPath(settings) {
  return path.join(projectManagementDirectory(settings), settings.projectManagement?.dashboardFileName || DEFAULT_SETTINGS.projectManagement.dashboardFileName);
}

function projectManagementOpenFileMap(settings) {
  return settings.projectManagement?.openFiles || DEFAULT_SETTINGS.projectManagement.openFiles;
}

function projectManagementInitializationFiles(settings) {
  return settings.projectManagement?.initializationFiles || DEFAULT_SETTINGS.projectManagement.initializationFiles;
}

function operationsLibraryRoot(settings) {
  return path.resolve(settings.operationsLibrary?.root || OPERATIONS_LIBRARY_ROOT);
}

function operationsLibraryPath(settings, relativePath) {
  return path.join(operationsLibraryRoot(settings), normalizeRelativePath(relativePath));
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key) => String(values[key] ?? "Needs manual review"));
}

function jsonTemplateValues(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    JSON.stringify(String(value ?? "Needs manual review")).slice(1, -1),
  ]));
}

async function renderOperationsTemplate(settings, relativePath, values) {
  const templatePath = operationsLibraryPath(settings, relativePath);
  const template = await fs.readFile(templatePath, "utf8");
  return renderTemplate(template, values);
}

function projectManagementTemplateValues(project, settings) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    PROJECT_NAME: project.name || project.folderName || project.id,
    PROJECT_SLUG: project.id,
    PROJECT_PATH: project.path,
    REPOSITORY_OWNER: project.owner || "Needs manual review",
    REPOSITORY_VISIBILITY: "Needs manual review",
    OPERATIONS_LIBRARY_ROOT: operationsLibraryRoot(settings),
    DATE: date,
  };
}

function missingProjectManagementTemplateContent(fileName, values) {
  if (fileName.endsWith(".json")) {
    return JSON.stringify({
      schemaVersion: "1.1",
      project: {
        id: values.PROJECT_SLUG,
        name: values.PROJECT_NAME,
        path: values.PROJECT_PATH,
        repository: {
          owner: values.REPOSITORY_OWNER,
          name: values.PROJECT_SLUG,
          visibility: values.REPOSITORY_VISIBILITY,
          url: "",
        },
      },
      summary: {
        currentPhase: "Project Initiation",
        lifecycleStatus: "needs-manual-review",
        governanceStatus: "needs-manual-review",
        currentSprint: "",
        nextCodexAction: "Run codex-project-management-initiation.md to populate project-management artifacts.",
      },
      counts: {
        epicsOpen: 0,
        epicsBlocked: 0,
        epicsReleaseReady: 0,
        backlogOpen: 0,
        backlogReady: 0,
        bugsOpen: 0,
        bugsCritical: 0,
        sprintCommitted: 0,
        sprintBlocked: 0,
      },
      roadmap: [],
      epics: [],
      backlog: [],
      sprint: {
        id: "",
        name: "",
        goal: "",
        status: "not-started",
        linkedEpics: [],
        items: [],
      },
      bugs: [],
      governance: {
        phases: [
          {
            phase: "Project Initiation",
            status: "needs-manual-review",
            evidence: [],
            blockingGaps: ["Operations Library dashboard template was missing during RidgePath Forge initialization."],
          },
        ],
        security: "not-reviewed",
        data: "not-reviewed",
        testing: "not-reviewed",
        release: "not-started",
      },
      codexActivity: [
        {
          id: `CX-${values.DATE}-001`,
          timestamp: values.DATE,
          workflow: "Project Management Initialization",
          summary: "Starter project-management dashboard created with fallback content because the Operations Library template was missing.",
          epicIds: [],
          filesChanged: ["docs/project-management/project-dashboard.json"],
          validation: "Needs manual review",
          nextAction: "Run codex-project-management-initiation.md.",
        },
      ],
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: "RidgePath Forge fallback",
        sourceFiles: [
          "docs/project-management/roadmap.md",
          "docs/project-management/backlog.md",
          "docs/project-management/sprint-current.md",
          "docs/project-management/bugs.md",
          "docs/project-management/codex-activity.md",
          "docs/project-management/lifecycle-status.md",
        ],
      },
    }, null, 2);
  }

  const title = fileName.replace(/\.md$/i, "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `# ${title}

Project: \`${values.PROJECT_NAME}\`
Last Updated: \`${values.DATE}\`

Needs manual review.

This fallback artifact was created by RidgePath Forge because the matching Operations Library template was missing.
`;
}

function projectManagementCodexPrompt(project, values) {
  return `# Codex Project Management Initiation

Repository: \`${project.path}\`
Project: \`${values.PROJECT_NAME}\`
Operations Library: \`${values.OPERATIONS_LIBRARY_ROOT}\`

Use the Codex Operations Library as the source of truth. RidgePath Forge initialized starter files only; Codex owns repository analysis and population.

## Objective

Review this repository and populate the Project Management package under \`docs/project-management/\`.

## Required Work

1. Review the repository structure, package metadata, README files, source code, tests, scripts, and existing documentation.
2. Populate \`docs/project-management/roadmap.md\` with roadmap items grounded in repository evidence.
3. Populate \`docs/project-management/backlog.md\` with actionable backlog items, priorities, statuses, source notes, and acceptance criteria.
4. Populate \`docs/project-management/sprint-current.md\` if current sprint scope can be inferred; otherwise mark it \`Needs manual review\`.
5. Populate \`docs/project-management/bugs.md\` with known or discovered defects; do not invent defects without evidence.
6. Populate \`docs/project-management/lifecycle-status.md\` by determining the current lifecycle phase and governance gates.
7. Populate \`docs/project-management/codex-activity.md\` with this initialization activity and validation evidence.
8. Update \`docs/project-management/project-dashboard.json\` after Markdown updates so the RidgePath Forge dashboard reflects current state.

## Governance Requirements

- Determine lifecycle phase from repository evidence.
- Populate governance status for security, data, testing, and release readiness.
- Use \`Needs manual review\` for unknown, stale, conflicting, or incomplete information.
- Keep Markdown files as the source of truth and \`project-dashboard.json\` as the RidgePath Forge read model.

## Validation

- Verify all Project Management files exist.
- Verify \`project-dashboard.json\` is valid JSON and follows the Operations Library dashboard schema.
- Verify dashboard \`metadata.sourceFiles\` references the Markdown source files.
- Verify the RidgePath Forge dashboard loads without manual restart.
`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

async function validateOperationsLibrary(settings = null) {
  const resolvedSettings = settings || await launcherSettings();
  const root = operationsLibraryRoot(resolvedSettings);
  const issues = [];
  const warnings = [];
  const requiredFolders = resolvedSettings.operationsLibrary?.requiredFolders || [];
  const requiredFiles = resolvedSettings.operationsLibrary?.requiredFiles || [];
  const templates = Object.entries(resolvedSettings.templates || {}).flatMap(([key, value]) => (
    isPlainObject(value)
      ? Object.entries(value).map(([childKey, childValue]) => [`${key}.${childKey}`, childValue])
      : [[key, value]]
  ));
  const workflows = Object.entries(resolvedSettings.workflows || {});

  if (!(await pathExists(root))) {
    return {
      configuredPath: root,
      status: "Invalid",
      message: "Operations Library root does not exist.",
      issues: ["Operations Library root does not exist."],
      warnings: [],
      requiredFolders: requiredFolders.map((relativePath) => ({ relativePath, exists: false })),
      requiredFiles: requiredFiles.map((relativePath) => ({ relativePath, exists: false })),
      templates: templates.map(([key, relativePath]) => ({ key, relativePath, exists: false })),
      prompts: workflows.map(([key, workflow]) => ({ key, name: workflow.name, relativePath: workflow.promptPath, exists: false })),
      dashboardSchemaSupport: resolvedSettings.projectManagement?.supportedDashboardSchemaVersions || [],
    };
  }

  const folderStatuses = [];
  for (const relativePath of requiredFolders) {
    const exists = (await statIfExists(operationsLibraryPath(resolvedSettings, relativePath)))?.isDirectory() || false;
    folderStatuses.push({ relativePath, exists });
    if (!exists) issues.push(`Missing required folder: ${relativePath}`);
  }

  const fileStatuses = [];
  for (const relativePath of requiredFiles) {
    const exists = Boolean(await statIfExists(operationsLibraryPath(resolvedSettings, relativePath)));
    fileStatuses.push({ relativePath, exists });
    if (!exists) issues.push(`Missing required file: ${relativePath}`);
  }

  const templateStatuses = [];
  for (const [key, relativePath] of templates) {
    if (typeof relativePath !== "string") {
      warnings.push(`Configured template is not a path: ${key}`);
      templateStatuses.push({ key, relativePath: "", exists: false });
      continue;
    }
    const exists = Boolean(await statIfExists(operationsLibraryPath(resolvedSettings, relativePath)));
    templateStatuses.push({ key, relativePath, exists });
    if (!exists) warnings.push(`Missing configured template: ${relativePath}`);
  }

  const promptStatuses = [];
  for (const [key, workflow] of workflows) {
    const exists = Boolean(await statIfExists(operationsLibraryPath(resolvedSettings, workflow.promptPath)));
    promptStatuses.push({ key, name: workflow.name, relativePath: workflow.promptPath, exists });
    if (!exists) warnings.push(`Missing configured prompt: ${workflow.promptPath}`);
  }

  const schemaVersions = resolvedSettings.projectManagement?.supportedDashboardSchemaVersions || [];
  if (!schemaVersions.length) issues.push("No supported Project Management dashboard schema versions are configured.");

  const status = issues.length ? "Invalid" : warnings.length ? "Warning" : "Valid";
  return {
    configuredPath: root,
    status,
    message: status === "Valid" ? "Operations Library contract is available." : status === "Warning" ? "Operations Library is available with missing optional contract assets." : "Operations Library contract is incomplete.",
    issues,
    warnings,
    requiredFolders: folderStatuses,
    requiredFiles: fileStatuses,
    templates: templateStatuses,
    prompts: promptStatuses,
    dashboardSchemaSupport: schemaVersions,
  };
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function manualReviewProjectManagement(reason, details = {}) {
  return {
    initialized: true,
    status: "Needs Manual Review",
    freshness: "Needs Manual Review",
    staleStatus: details.staleFiles?.length ? "Needs Manual Review" : "Current",
    missingFileStatus: details.missingFiles?.length ? "Needs Manual Review" : "Current",
    dashboardMissing: Boolean(details.dashboardMissing),
    validation: {
      status: "Needs Manual Review",
      issues: [reason],
      missingFields: details.missingFields || [],
    },
    missingFiles: details.missingFiles || [],
    staleFiles: details.staleFiles || [],
    dashboard: details.dashboard || null,
    dashboardPath: details.dashboardPath || "",
    folderPath: details.folderPath || "",
    files: details.files || {},
    codexPrompt: details.codexPrompt || null,
    sourceFiles: details.sourceFiles || [],
    recommendedNextAction: "Needs Manual Review",
  };
}

function missingDashboardField(data, fieldPath) {
  return fieldPath.split(".").reduce((current, part) => current?.[part], data) === undefined;
}

async function projectManagementOpenFiles(projectPath, settings) {
  const entries = {};
  const directory = projectManagementDirectory(settings);
  for (const [key, fileName] of Object.entries(projectManagementOpenFileMap(settings))) {
    const relativePath = path.join(directory, fileName).replaceAll("\\", "/");
    entries[key] = {
      label: fileName,
      relativePath,
      exists: await pathExists(path.join(projectPath, directory, fileName)),
    };
  }
  return entries;
}

async function projectManagementCodexPromptFile(projectPath, settings) {
  const fileName = projectManagementInitializationFiles(settings).codexPrompt || DEFAULT_SETTINGS.projectManagement.initializationFiles.codexPrompt;
  const relativePath = path.join(projectManagementDirectory(settings), fileName).replaceAll("\\", "/");
  const filePath = path.join(projectPath, relativePath);
  const exists = await pathExists(filePath);
  return {
    label: fileName,
    relativePath,
    exists,
    content: exists ? await fs.readFile(filePath, "utf8") : "",
  };
}

async function loadProjectManagementDashboard(projectPath, settings) {
  const directory = projectManagementDirectory(settings);
  const dashboardRelativePath = projectManagementDashboardPath(settings);
  const folderPath = path.join(projectPath, directory);
  const dashboardPath = path.join(projectPath, dashboardRelativePath);
  const initialized = await pathExists(folderPath);
  const openFiles = await projectManagementOpenFiles(projectPath, settings);
  const codexPrompt = await projectManagementCodexPromptFile(projectPath, settings);

  if (!initialized) {
    return {
      initialized: false,
      status: "Project Management Not Initialized",
      freshness: "Not Initialized",
      staleStatus: "Not Initialized",
      missingFileStatus: "Not Initialized",
      validation: {
        status: "Not Initialized",
        issues: [],
        missingFields: [],
      },
      missingFiles: [],
      staleFiles: [],
      dashboardMissing: false,
      dashboard: null,
      dashboardPath,
      folderPath,
      files: openFiles,
      codexPrompt,
      sourceFiles: [],
      recommendedNextAction: "Initialize docs/project-management/ through the Operations Library project management workflow.",
    };
  }

  const dashboardStat = await statIfExists(dashboardPath);
  if (!dashboardStat) {
    return manualReviewProjectManagement(`Missing ${dashboardRelativePath.replaceAll("\\", "/")}`, {
      missingFiles: [dashboardRelativePath.replaceAll("\\", "/")],
      dashboardMissing: true,
      dashboardPath,
      folderPath,
      files: openFiles,
      codexPrompt,
    });
  }

  let dashboard;
  try {
    dashboard = JSON.parse(await fs.readFile(dashboardPath, "utf8"));
  } catch {
    return manualReviewProjectManagement("project-dashboard.json is not valid JSON", { dashboardPath, folderPath, files: openFiles, codexPrompt });
  }

  const requiredFields = [
    "schemaVersion",
    "project",
    "summary.currentPhase",
    "summary.lifecycleStatus",
    "summary.governanceStatus",
    "summary.currentSprint",
    "summary.nextCodexAction",
    "counts.backlogOpen",
    "counts.bugsOpen",
    "counts.sprintBlocked",
    "governance",
    "metadata.generatedAt",
    "metadata.sourceFiles",
  ];
  const missingFields = requiredFields.filter((field) => missingDashboardField(dashboard, field));
  const issues = [];

  const supportedSchemas = new Set(settings.projectManagement?.supportedDashboardSchemaVersions || []);
  if (!dashboard.schemaVersion || !supportedSchemas.has(String(dashboard.schemaVersion))) {
    issues.push("Unsupported or missing schemaVersion");
  }
  if (!Array.isArray(dashboard.metadata?.sourceFiles)) {
    issues.push("metadata.sourceFiles must be an array");
  }
  if (dashboard.metadata?.generatedAt && Number.isNaN(new Date(dashboard.metadata.generatedAt).getTime())) {
    issues.push("metadata.generatedAt is invalid");
  }

  const sourceFiles = Array.isArray(dashboard.metadata?.sourceFiles) ? dashboard.metadata.sourceFiles : [];
  const sourceFileStatuses = [];
  const missingFiles = [];
  const staleFiles = [];

  for (const sourceFile of sourceFiles) {
    const normalized = String(sourceFile || "").replaceAll("/", path.sep);
    const resolved = path.resolve(projectPath, normalized);
    const relative = path.relative(projectPath, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      missingFiles.push(String(sourceFile));
      sourceFileStatuses.push({ relativePath: String(sourceFile), exists: false, stale: false });
      continue;
    }
    const sourceStat = await statIfExists(resolved);
    if (!sourceStat) {
      missingFiles.push(String(sourceFile));
      sourceFileStatuses.push({ relativePath: String(sourceFile), exists: false, stale: false });
      continue;
    }
    if (sourceStat.mtimeMs > dashboardStat.mtimeMs) {
      staleFiles.push(String(sourceFile));
    }
    sourceFileStatuses.push({
      relativePath: String(sourceFile),
      exists: true,
      stale: sourceStat.mtimeMs > dashboardStat.mtimeMs,
      modifiedAt: sourceStat.mtime.toISOString(),
    });
  }

  if (missingFields.length) issues.push("Required dashboard fields are missing");
  if (missingFiles.length) issues.push("Referenced source files are missing");
  if (staleFiles.length) issues.push("Source files are newer than project-dashboard.json");

  const needsReview = issues.length > 0;
  return {
    initialized: true,
    status: needsReview ? "Needs Manual Review" : "Current",
    freshness: staleFiles.length ? "Needs Manual Review" : "Current",
    staleStatus: staleFiles.length ? "Needs Manual Review" : "Current",
    missingFileStatus: missingFiles.length ? "Needs Manual Review" : "Current",
    validation: {
      status: needsReview ? "Needs Manual Review" : "Valid",
      issues,
      missingFields,
    },
    missingFiles,
    staleFiles,
    dashboardMissing: false,
    dashboard,
    dashboardPath,
    folderPath,
    files: openFiles,
    codexPrompt,
    sourceFiles: sourceFileStatuses,
    recommendedNextAction: dashboard.summary?.nextCodexAction || "Needs Manual Review",
  };
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

function isHttpUrl(value = "") {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function liveProjectUrl(pkg = {}, override = {}) {
  const candidates = [
    override.liveUrl,
    override.externalUrl,
    override.url,
    pkg.homepage,
    pkg.liveUrl,
  ];
  return candidates.find((candidate) => isHttpUrl(candidate)) || "";
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
  if (owner === "ridgepath-tech") return "ridgepath";
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
    "ridgepath:primary": 3150,
    "ridgepath:api": 4150,
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
  const settings = await launcherSettings();
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
        liveUrl: liveProjectUrl({}, override),
        faviconUrl: "",
        services,
        scripts: {},
        managed: false,
        git: await gitStatus(projectPath, override.lastGitSync || ""),
        activity: await projectActivity(id),
        projectManagement: await loadProjectManagementDashboard(projectPath, settings),
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
      liveUrl: liveProjectUrl(pkg, override),
      packageManager: pkg.packageManager || "npm",
      faviconUrl: favicon ? `/api/projects/${id}/favicon?path=${encodeURIComponent(favicon)}` : "",
      services,
      scripts,
      managed: Boolean(MANAGED.get(id)),
      git: await gitStatus(projectPath, override.lastGitSync || ""),
      activity: await projectActivity(id),
      projectManagement: await loadProjectManagementDashboard(projectPath, settings),
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
  appendLog(projectId, "[forge] stopped managed services");
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

  appendLog(project.id, `[forge] taking over ports ${openServices.map((service) => service.port).join(", ")}`);
  await Promise.all([...pids].map((pid) => stopProcessTree(pid)));
  await new Promise((resolve) => setTimeout(resolve, 800));
  await startProject(await findProject(project.id));
}

function registrationTemplateValues({
  projectName,
  folderName,
  projectPath,
  audience,
  assignedPort,
  bootstrap,
  settings,
  hostingLabel,
}) {
  const workflows = settings.workflows || DEFAULT_SETTINGS.workflows;
  return {
    PROJECT_NAME: projectName,
    PROJECT_SLUG: folderName,
    PROJECT_PATH: projectPath,
    AUDIENCE: audience,
    ASSIGNED_PORT: assignedPort,
    APPLICATION_CLASSIFICATION: bootstrap.applicationClassification,
    TECHNOLOGY_STACK: bootstrap.technologyStack,
    REPOSITORY_OWNER: bootstrap.repositoryOwner,
    REPOSITORY_VISIBILITY: bootstrap.repositoryVisibility,
    REPOSITORY_FULL_NAME: `${bootstrap.repositoryOwner}/${folderName}`,
    HOSTING_STRATEGY: bootstrap.hostingStrategy,
    HOSTING_PLATFORM: bootstrap.hostingPlatform || "N/A",
    HOSTING_LABEL: hostingLabel,
    PACKAGE_MANAGER: bootstrap.packageManager,
    CREATE_STANDARD_DOCUMENTATION: yesNo(bootstrap.createStandardDocumentation),
    CREATE_GOVERNANCE_ASSETS: yesNo(bootstrap.createGovernanceAssets),
    CREATE_PROJECT_SOURCE_STRUCTURE: "Yes",
    CREATE_PROJECT_INITIATION_ARTIFACT: "Yes",
    STANDARD_DOCUMENTATION_STATUS: bootstrap.createStandardDocumentation ? "Created" : "Skipped",
    GOVERNANCE_ASSET_STATUS: bootstrap.createGovernanceAssets ? "Requested" : "Skipped",
    OPERATIONS_LIBRARY_ROOT: operationsLibraryRoot(settings),
    START_NEW_PROJECT_WORKFLOW: workflows.startNewProject?.name || "Start New Project",
    START_NEW_PROJECT_PROMPT: workflows.startNewProject?.promptPath || "prompts/start-new-project.md",
    ONBOARD_EXISTING_PROJECT_PROMPT: workflows.onboardExistingProject?.promptPath || "prompts/onboard-existing-project.md",
    PROJECT_INITIATION_PROMPT: workflows.projectInitiation?.promptPath || "prompts/project-initiation-prompt.md",
    DATE: new Date().toISOString().slice(0, 10),
    TECHNOLOGY_PREFERENCES: bootstrap.technologyStack,
    HOSTING_PREFERENCE: hostingLabel,
    IDEA_SUMMARY: "Needs manual review",
    INITIAL_CONTEXT: "Registered by RidgePath Forge.",
    SPONSOR_OR_REQUESTER: "Needs manual review",
    DISCOVERY_SUMMARY: "Needs manual review",
    QUESTION: "What business problem should this project solve?",
    ANSWER: "Needs manual review",
    ASSUMPTION: "RidgePath Forge registration captured technical defaults only.",
    IMPACT: "Project Initiation must confirm business context before planning.",
    YES_NO_OR_NOTES: "Yes",
    RISK: "Project context may be incomplete.",
    MITIGATION_OR_FOLLOW_UP: "Run Project Initiation from the Operations Library.",
    OPPORTUNITY: "Use source artifacts to ground discovery.",
    VALUE: "Improves planning accuracy.",
    PLANNING_NOTE: "Review project-source before Product Planning.",
    USER_OR_STAKEHOLDER_GROUP: "Needs manual review",
    ROLE: "Needs manual review",
    NOTES: "Needs manual review",
    WORKFLOW: "Needs manual review",
    USER_OR_OWNER: "Needs manual review",
    INTEGRATION: "Needs manual review",
    PURPOSE: "Needs manual review",
    MISSING_INFORMATION: "Needs manual review",
    PRODUCT_PLANNING_INPUTS: "Project Initiation outputs and source artifacts.",
    CARRY_FORWARD_QUESTIONS: "Needs manual review",
  };
}

async function writeRenderedTemplate(settings, templateKey, outputPath, values) {
  const templatePath = settings.templates?.[templateKey];
  if (!templatePath) throw new Error(`Missing template setting: ${templateKey}`);
  const rendered = await renderOperationsTemplate(settings, templatePath, values);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, rendered.endsWith("\n") ? rendered : `${rendered}\n`);
}

async function renderProjectManagementSeed(settings, key, fileName, values) {
  const relativePath = settings.templates?.projectManagement?.[key] || DEFAULT_SETTINGS.templates.projectManagement[key];
  if (!relativePath) {
    return {
      content: missingProjectManagementTemplateContent(fileName, values),
      warning: `Missing Project Management template setting: ${key}`,
    };
  }

  try {
    return {
      content: await renderOperationsTemplate(settings, relativePath, key === "dashboard" ? jsonTemplateValues(values) : values),
      warning: "",
    };
  } catch {
    return {
      content: missingProjectManagementTemplateContent(fileName, values),
      warning: `Missing Operations Library template: ${relativePath}`,
    };
  }
}

async function initializeProjectManagement(project) {
  const settings = await launcherSettings();
  const directory = projectManagementDirectory(settings);
  const folderPath = path.join(project.path, directory);

  const files = projectManagementInitializationFiles(settings);
  const values = projectManagementTemplateValues(project, settings);
  const seedFiles = [
    ["roadmap", files.roadmap],
    ["backlog", files.backlog],
    ["sprintCurrent", files.sprintCurrent],
    ["bugs", files.bugs],
    ["codexActivity", files.codexActivity],
    ["lifecycle", files.lifecycle],
    ["dashboard", files.dashboard],
  ];
  const createdFiles = [];
  const skippedFiles = [];
  const warnings = [];

  await fs.mkdir(folderPath, { recursive: true });
  for (const [key, fileName] of seedFiles) {
    const outputPath = path.join(folderPath, fileName);
    const relativePath = path.join(directory, fileName).replaceAll("\\", "/");
    if (await pathExists(outputPath)) {
      skippedFiles.push(relativePath);
      continue;
    }
    const seed = await renderProjectManagementSeed(settings, key, fileName, values);
    if (seed.warning) warnings.push(seed.warning);
    await fs.writeFile(outputPath, seed.content.endsWith("\n") ? seed.content : `${seed.content}\n`);
    createdFiles.push(relativePath);
  }

  const promptFileName = files.codexPrompt || DEFAULT_SETTINGS.projectManagement.initializationFiles.codexPrompt;
  const promptPath = path.join(folderPath, promptFileName);
  const promptRelativePath = path.join(directory, promptFileName).replaceAll("\\", "/");
  if (await pathExists(promptPath)) {
    skippedFiles.push(promptRelativePath);
  } else {
    await fs.writeFile(promptPath, projectManagementCodexPrompt(project, values));
    createdFiles.push(promptRelativePath);
  }

  if (createdFiles.length) {
    await appendActivity(
      project.id,
      "project-management-init",
      warnings.length
        ? `Initialized Project Management with fallback content for ${warnings.length} missing template(s)`
        : "Initialized Project Management from Operations Library templates",
      { createdFiles, skippedFiles, warnings },
    );
  }

  return {
    project: await findProject(project.id),
    createdFiles,
    skippedFiles,
    warnings,
  };
}

async function createProjectSourceStructure(projectPath, settings, values) {
  for (const relative of settings.artifacts?.projectSourceDirectories || DEFAULT_SETTINGS.artifacts.projectSourceDirectories) {
    await fs.mkdir(path.join(projectPath, normalizeRelativePath(relative)), { recursive: true });
  }
  await writeRenderedTemplate(settings, "projectSourceReadme", path.join(projectPath, "project-source", "README.md"), values);
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
  const settings = await launcherSettings();
  const operationsValidation = await validateOperationsLibrary(settings);
  if (operationsValidation.status === "Invalid") {
    throw new Error(`Operations Library contract is invalid: ${operationsValidation.issues.join("; ")}`);
  }
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
  const templateValues = registrationTemplateValues({
    projectName,
    folderName,
    projectPath,
    audience,
    assignedPort,
    bootstrap,
    settings,
    hostingLabel,
  });

  await fs.mkdir(path.join(projectPath, "docs"), { recursive: true });
  if (bootstrap.createStandardDocumentation) {
    await Promise.all((settings.artifacts?.standardDirectories || DEFAULT_SETTINGS.artifacts.standardDirectories).map((relative) =>
      fs.mkdir(path.join(projectPath, normalizeRelativePath(relative)), { recursive: true }),
    ));
  }
  await createProjectSourceStructure(projectPath, settings, templateValues);
  await fs.writeFile(path.join(projectPath, "package.json"), `${JSON.stringify({
    name: folderName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      start: `set PORT=${assignedPort}&& node server.js`,
    },
  }, null, 2)}\n`);
  await fs.writeFile(path.join(projectPath, "server.js"), `import http from "node:http";\n\nconst port = Number(process.env.PORT || ${assignedPort});\nconst name = ${JSON.stringify(projectName)};\n\nhttp.createServer((_req, res) => {\n  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });\n  res.end(\`<!doctype html><html><head><title>\${name}</title></head><body style="font-family:Segoe UI,sans-serif;padding:32px"><h1>\${name}</h1><p>Registered by RidgePath Forge.</p></body></html>\`);\n}).listen(port, "127.0.0.1", () => {\n  console.log(\`\${name} listening on http://localhost:\${port}\`);\n});\n`);
  await fs.writeFile(path.join(projectPath, "README.md"), `# ${projectName}\n\nRegistered by RidgePath Forge on port ${assignedPort}.\n\n## Bootstrap Snapshot\n\n- Application Classification: ${bootstrap.applicationClassification}\n- Technology Stack: ${bootstrap.technologyStack}\n- Repository: ${bootstrap.repositoryOwner}/${folderName} (${bootstrap.repositoryVisibility})\n- Hosting: ${hostingLabel}\n- Package Manager: ${bootstrap.packageManager}\n\nThis project is registered only. Start it from RidgePath Forge when you are ready.\n`);
  await writeRenderedTemplate(settings, "bootstrapConfig", path.join(projectPath, "bootstrap-config.md"), templateValues);
  await writeRenderedTemplate(settings, "projectInitiation", path.join(projectPath, "project-initiation.md"), templateValues);
  await writeRenderedTemplate(settings, "launcherHandoff", path.join(projectPath, "docs", "launcher-handoff.md"), templateValues);
  await writeRenderedTemplate(settings, "legacyOperationsLibraryHandoff", path.join(projectPath, "docs", "operations-library-handoff.md"), templateValues);
  await writeRenderedTemplate(settings, "codexNextPrompt", path.join(projectPath, "codex-next-prompt.md"), templateValues);
  if (bootstrap.createGovernanceAssets) {
    await writeRenderedTemplate(settings, "governanceBootstrap", path.join(projectPath, "docs", "governance-bootstrap.md"), templateValues);
  }

  const registry = await readJson(REGISTRY_FILE, []);
  registry.push({ id: folderName, name: projectName, path: projectPath, audience, assignedPort, createdAt: new Date().toISOString(), operationsLibraryRoot: operationsLibraryRoot(settings), bootstrap });
  await writeJson(REGISTRY_FILE, registry);

  await appendActivity(folderName, "register", `Registered project on port ${assignedPort}`, { projectPath, assignedPort, operationsLibraryRoot: operationsLibraryRoot(settings) });
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

app.get("/api/operations-library/status", async (_req, res) => {
  try {
    const settings = await launcherSettings();
    res.json({
      settings,
      validation: await validateOperationsLibrary(settings),
    });
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
      ridgepath: nextAssignedPort(projects, "ridgepath", "primary"),
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
  if (!project.managedRunning) return res.status(400).json({ error: "Project is running outside RidgePath Forge." });
  await stopProject(projectId);
  await appendActivity(projectId, "stop", "Stopped managed services");
  res.json(await findProject(projectId));
});

app.post("/api/projects/:projectId/restart", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "running") return res.status(400).json({ error: "Project is not running." });
    if (!project.managedRunning) return res.status(400).json({ error: "Project is running outside RidgePath Forge." });
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
    if (project.managedRunning) return res.status(400).json({ error: "Project is already managed by RidgePath Forge." });
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

app.post("/api/projects/:projectId/initialize-project-management", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await initializeProjectManagement(project));
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

app.post("/api/projects/:projectId/open-project-management-folder", async (req, res) => {
  const project = await findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const settings = await launcherSettings();
  const folderPath = path.join(project.path, projectManagementDirectory(settings));
  if (!(await pathExists(folderPath))) {
    return res.status(404).json({ error: "Project management folder is not initialized." });
  }
  spawn("explorer.exe", [folderPath], { windowsHide: true, detached: true });
  res.json({ ok: true });
});

app.post("/api/projects/:projectId/open-project-management-file/:fileKey", async (req, res) => {
  const project = await findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const settings = await launcherSettings();
  const fileName = projectManagementOpenFileMap(settings)[req.params.fileKey];
  if (!fileName) return res.status(400).json({ error: "Unsupported project management file." });
  const filePath = path.join(project.path, projectManagementDirectory(settings), fileName);
  if (!(await pathExists(filePath))) {
    return res.status(404).json({ error: "Project management file does not exist." });
  }
  spawn("explorer.exe", [filePath], { windowsHide: true, detached: true });
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
  console.log(`RidgePath Forge API listening on http://localhost:${PORT}`);
  console.log(`Project root: ${PROJECTS_ROOT}`);
});
