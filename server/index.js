import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  deleteRidgeFabricDevice as deleteRidgeFabricDeviceRecord,
  resolveRegistryPath,
  ridgeFabricRegistry as readRidgeFabricRegistry,
  updateRidgeFabricDevice as updateRidgeFabricDeviceRecord,
} from "./domains/ridge-fabric/repository.js";
import {
  commandCenterStatus,
  createProjectReviewRun,
  listAgentRuns,
  listApprovalEvents,
  listProposals,
  updateProposal,
} from "./domains/command-center/repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
loadLocalEnvFiles(APP_ROOT);
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
let demoPortalSql = null;

function loadLocalEnvFiles(root) {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(root, fileName);
    if (!fsSync.existsSync(filePath)) continue;
    const text = fsSync.readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (!key || process.env[key]) continue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

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
  portfolioIntegration: {
    projectId: "trevis-portfolio",
    root: "C:\\Development\\Projects\\trevis-portfolio",
    projectIdeasFile: "src/data/projectIdeas.json",
    blogPostsFile: "src/data/blogPosts.json",
    draftScreenshotsDirectory: "public/portfolio-drafts",
    maxScreenshots: 4,
    openAiSecretFile: "openai-secret.txt",
    openAiModel: "gpt-5.5",
  },
  demoPortalIntegration: {
    root: "C:\\Development\\Projects\\ridgepath-technologies-website",
    clientsFile: "data/demo-clients.local.json",
    publicBaseUrl: "https://ridgepath.io/demos",
    passwordLength: 18,
    defaultExpiryDays: 45,
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

function demoSlug(value, fallback = "client-demo") {
  return slug(String(value || fallback)).slice(0, 80) || fallback;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

function isLocalHostName(hostname = "") {
  const host = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) return true;
  if (host.endsWith(".local")) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return private172 ? Number(private172[1]) >= 16 && Number(private172[1]) <= 31 : false;
}

function isProductionHttpUrl(value = "") {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !isLocalHostName(url.hostname);
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

function productionProjectUrl(pkg = {}, override = {}) {
  const candidates = [
    override.productionUrl,
    override.deploymentUrl,
    override.publicUrl,
    pkg.productionUrl,
    pkg.deploymentUrl,
    pkg.homepage,
    pkg.liveUrl,
    override.liveUrl,
    override.externalUrl,
    override.url,
  ];
  return candidates.find((candidate) => isProductionHttpUrl(candidate)) || "";
}

function portfolioIntegrationSettings(settings) {
  const configured = settings.portfolioIntegration || {};
  return {
    ...DEFAULT_SETTINGS.portfolioIntegration,
    ...configured,
    root: path.resolve(process.env.PORTFOLIO_PROJECT_ROOT || configured.root || DEFAULT_SETTINGS.portfolioIntegration.root),
  };
}

function demoPortalIntegrationSettings(settings) {
  const configured = settings.demoPortalIntegration || {};
  return {
    ...DEFAULT_SETTINGS.demoPortalIntegration,
    ...configured,
    root: path.resolve(process.env.DEMO_PORTAL_PROJECT_ROOT || configured.root || DEFAULT_SETTINGS.demoPortalIntegration.root),
    publicBaseUrl: process.env.DEMO_PORTAL_PUBLIC_BASE_URL || configured.publicBaseUrl || DEFAULT_SETTINGS.demoPortalIntegration.publicBaseUrl,
  };
}

function sentence(value, fallback) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function titleFromSlug(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueList(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function displayProjectTitle(project) {
  const raw = sentence(project.name, project.folderName || project.id);
  return /^[a-z0-9][a-z0-9-_]+$/i.test(raw) && /[-_]/.test(raw) ? titleFromSlug(raw) : raw;
}

function ensureSentence(value) {
  const clean = sentence(value, "Needs manual review");
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function sanitizeFileName(value) {
  return slug(value || "page") || "page";
}

function portfolioPrimaryUrl(project) {
  const services = Array.isArray(project.services) ? project.services : [];
  const primary = services.find((service) => service.kind === "primary" && service.port) || services.find((service) => service.port);
  if (!primary?.port) return "";
  const canOpen = project.status === "running" && (primary.managedRunning || primary.portStatus === "open");
  return canOpen ? `http://localhost:${primary.port}` : "";
}

function normalizeSameOriginUrl(value, origin) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function screenshotTitle(url, baseUrl) {
  const parsed = new URL(url);
  if (url === baseUrl || parsed.pathname === "/") return "Home";
  return titleFromSlug(parsed.pathname.split("/").filter(Boolean).at(-1) || "Page");
}

function upsertByKey(items, key, value, entry) {
  const index = items.findIndex((item) => item?.[key] === value);
  if (index >= 0) {
    const existing = items[index];
    items[index] = {
      ...existing,
      ...entry,
      importedAt: existing.importedAt || entry.importedAt,
      publish: existing.publish ?? entry.publish,
    };
    return { items, created: false };
  }
  items.push(entry);
  return { items, created: true };
}

async function readOpenAiKey(portfolio) {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  const configuredPath = process.env.OPENAI_API_KEY_FILE || portfolio.openAiSecretFile || "openai-secret.txt";
  const secretPath = path.isAbsolute(configuredPath) ? configuredPath : path.join(portfolio.root, normalizeRelativePath(configuredPath));
  try {
    const value = (await fs.readFile(secretPath, "utf8")).trim();
    return value || "";
  } catch {
    return "";
  }
}

function responseOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
      if (typeof content?.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("\n").trim();
}

function portfolioContentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "summary",
      "description",
      "portfolioAngle",
      "tags",
      "blogTitle",
      "blogExcerpt",
      "blogSections",
      "seoTitle",
      "seoDescription",
      "reviewNotes",
    ],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      description: { type: "string" },
      portfolioAngle: { type: "string" },
      tags: { type: "array", items: { type: "string" }, maxItems: 8 },
      blogTitle: { type: "string" },
      blogExcerpt: { type: "string" },
      blogSections: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "body"],
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
        },
      },
      seoTitle: { type: "string" },
      seoDescription: { type: "string" },
      reviewNotes: {
        type: "array",
        items: { type: "string" },
        maxItems: 8,
      },
    },
  };
}

function safeProjectContext(project, projectIdea, capture) {
  const dashboard = project.projectManagement?.dashboard || {};
  return {
    project: {
      id: project.id,
      title: projectIdea.title,
      description: project.description,
      audience: project.audience,
      framework: project.framework,
      owner: project.owner,
      repositoryOwner: githubOwner(project.origin),
      status: project.status,
      services: (project.services || []).map((service) => ({
        label: service.label,
        kind: service.kind,
        framework: service.framework,
        port: service.port,
        script: service.script,
      })),
    },
    projectManagement: {
      currentPhase: dashboard.summary?.currentPhase,
      lifecycleStatus: dashboard.summary?.lifecycleStatus,
      governanceStatus: dashboard.summary?.governanceStatus,
      nextCodexAction: dashboard.summary?.nextCodexAction,
      counts: dashboard.counts,
      backlog: Array.isArray(dashboard.backlog)
        ? dashboard.backlog.slice(0, 8).map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          priority: item.priority,
          status: item.status,
        }))
        : [],
      bugs: Array.isArray(dashboard.bugs)
        ? dashboard.bugs.slice(0, 5).map((bug) => ({
          id: bug.id,
          title: bug.title,
          severity: bug.severity,
          status: bug.status,
        }))
        : [],
    },
    screenshots: {
      status: capture.status,
      count: capture.screenshots.length,
      routes: capture.screenshots.map((screenshot) => ({
        title: screenshot.title,
        url: screenshot.url,
      })),
      note: capture.reason || "",
    },
  };
}

async function generatePortfolioContent(project, portfolio, projectIdea, blogPost, capture) {
  const apiKey = await readOpenAiKey(portfolio);
  if (!apiKey) {
    return {
      status: "skipped",
      message: "No OpenAI API key was available to the launcher server.",
      projectIdea,
      blogPost,
    };
  }
  if (typeof fetch !== "function") {
    return {
      status: "failed",
      message: "This Node runtime does not provide fetch for OpenAI API calls.",
      projectIdea,
      blogPost,
    };
  }

  const context = safeProjectContext(project, projectIdea, capture);
  const model = process.env.OPENAI_MODEL || portfolio.openAiModel || "gpt-5.5";
  const body = {
    model,
    instructions: [
      "You write public-safe portfolio and technical blog draft copy for a healthcare technology leader.",
      "Use only the provided metadata. Do not invent metrics, client names, patient data, customer names, credentials, URLs, internal hostnames, or claims not supported by the context.",
      "Keep copy polished, specific, and reviewable. If information is missing, frame it as a draft note or manual-review need.",
      "Do not mark anything as published."
    ].join(" "),
    input: `Create draft portfolio and blog copy from this RidgePath Forge project context:\n${JSON.stringify(context, null, 2)}`,
    reasoning: { effort: "low" },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "portfolio_content_draft",
        strict: true,
        schema: portfolioContentSchema(),
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || `OpenAI request failed with status ${response.status}.`;
      return { status: "failed", message, projectIdea, blogPost };
    }

    const text = responseOutputText(data);
    const generated = JSON.parse(text);
    const generatedTags = uniqueList([...(projectIdea.tags || []), ...(generated.tags || [])]).slice(0, 10);
    const updatedProjectIdea = {
      ...projectIdea,
      title: sentence(generated.title, projectIdea.title),
      summary: sentence(generated.summary, projectIdea.summary),
      description: sentence(generated.description, projectIdea.description),
      portfolioAngle: sentence(generated.portfolioAngle, projectIdea.portfolioAngle),
      tags: generatedTags,
      seoTitle: sentence(generated.seoTitle, ""),
      seoDescription: sentence(generated.seoDescription, ""),
      aiStatus: "generated",
      aiModel: model,
      aiGeneratedAt: new Date().toISOString(),
      aiReviewNotes: Array.isArray(generated.reviewNotes) ? generated.reviewNotes : [],
    };
    const updatedBlogPost = {
      ...blogPost,
      title: sentence(generated.blogTitle, blogPost.title),
      excerpt: sentence(generated.blogExcerpt, blogPost.excerpt),
      tags: generatedTags,
      sections: Array.isArray(generated.blogSections) && generated.blogSections.length
        ? generated.blogSections.map((section) => ({
          heading: sentence(section.heading, "Needs manual review"),
          body: sentence(section.body, "Needs manual review"),
        }))
        : blogPost.sections,
      seoTitle: sentence(generated.seoTitle, ""),
      seoDescription: sentence(generated.seoDescription, ""),
      aiStatus: "generated",
      aiModel: model,
      aiGeneratedAt: updatedProjectIdea.aiGeneratedAt,
      aiReviewNotes: updatedProjectIdea.aiReviewNotes,
    };

    return {
      status: "generated",
      message: "OpenAI generated draft project and blog copy.",
      projectIdea: updatedProjectIdea,
      blogPost: updatedBlogPost,
    };
  } catch (error) {
    return {
      status: "failed",
      message: error.message || "OpenAI content generation failed.",
      projectIdea,
      blogPost,
    };
  }
}

function projectPortfolioDraft(project) {
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const title = displayProjectTitle(project);
  const description = sentence(project.description, `${title} is an imported project idea awaiting portfolio review.`);
  const dashboard = project.projectManagement?.dashboard || {};
  const summary = dashboard.summary || {};
  const counts = dashboard.counts || {};
  const phase = sentence(summary.currentPhase, "Needs manual review");
  const nextAction = sentence(summary.nextCodexAction, "Needs manual review");
  const safeOrigin = isHttpUrl(project.origin) ? project.origin : project.origin?.replace(/^git@github\.com:/i, "https://github.com/").replace(/\.git$/i, "") || "";
  const blogSlug = `${project.id}-project-notes`;
  const tags = uniqueList([
    project.framework,
    project.audience,
    project.owner,
    phase === "Needs manual review" ? "" : phase,
  ]);

  return {
    projectIdea: {
      id: `idea-${project.id}`,
      sourceProjectId: project.id,
      slug: project.id,
      title,
      summary: description,
      description,
      image: "",
      screenshots: [],
      screenshotStatus: "pending",
      screenshotNotes: "Screenshots are captured from the running local app when available.",
      publish: false,
      reviewStatus: "Needs manual review",
      importedAt: now,
      updatedAt: now,
      audience: project.audience,
      framework: project.framework,
      owner: project.owner || "",
      repositoryUrl: safeOrigin,
      liveUrl: project.liveUrl || "",
      localPath: project.path,
      lifecyclePhase: phase,
      nextAction,
      portfolioAngle: `${title} may become a portfolio case study after public-safe outcomes, screenshots, architecture notes, and implementation details are reviewed.`,
      tags,
      blogSlug,
      publicationChecklist: [
        "Confirm this project can be discussed publicly.",
        "Scrub internal names, customer data, credentials, hostnames, tenant identifiers, and private URLs.",
        "Add public-safe screenshots or diagrams.",
        "Summarize the business problem, technical approach, and measurable outcome.",
        "Set publish to true only after review."
      ]
    },
    blogPost: {
      id: `blog-${project.id}`,
      sourceProjectId: project.id,
      slug: blogSlug,
      projectSlug: project.id,
      title: `Project Notes: ${title}`,
      excerpt: `A draft writeup about ${title}, imported from RidgePath Forge for review and expansion.`,
      date,
      publish: false,
      reviewStatus: "Needs manual review",
      importedAt: now,
      updatedAt: now,
      tags,
      sections: [
        {
          heading: "What this project is about",
          body: description
        },
        {
          heading: "Current state",
          body: `RidgePath Forge lists this project as ${project.status || "Needs manual review"} with ${project.framework || "an unknown framework"}. Project-management phase: ${phase}. Open backlog: ${counts.backlogOpen ?? "Needs manual review"}. Open bugs: ${counts.bugsOpen ?? "Needs manual review"}.`
        },
        {
          heading: "What to write next",
          body: `Next action from project management: ${ensureSentence(nextAction)} Before publishing, convert this draft into a public-safe story with problem context, design choices, implementation tradeoffs, screenshots, and validation evidence.`
        }
      ]
    }
  };
}

async function capturePortfolioScreenshots(project, portfolio, projectIdea) {
  const baseUrl = portfolioPrimaryUrl(project);
  if (!baseUrl) {
    return {
      status: "skipped",
      reason: "Project is not running on an assigned primary port. Start it in RidgePath Forge before capturing portfolio screenshots.",
      screenshots: [],
    };
  }

  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1200);

    const origin = new URL(baseUrl).origin;
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]"), (link) => link.href));
    const urls = uniqueList([
      baseUrl,
      ...hrefs.map((href) => normalizeSameOriginUrl(href, origin)),
    ])
      .filter(Boolean)
      .filter((url) => {
        const parsed = new URL(url);
        return !/\.(pdf|zip|docx?|xlsx?|png|jpe?g|gif|svg|ico|mp4|mov)$/i.test(parsed.pathname);
      })
      .slice(0, Number(portfolio.maxScreenshots || 4));

    const outputDirectory = path.join(portfolio.root, normalizeRelativePath(portfolio.draftScreenshotsDirectory), projectIdea.slug);
    await fs.mkdir(outputDirectory, { recursive: true });

    const screenshots = [];
    for (const [index, url] of urls.entries()) {
      const title = screenshotTitle(url, baseUrl);
      const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFileName(title)}.png`;
      const outputPath = path.join(outputDirectory, fileName);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: outputPath, fullPage: true });
      screenshots.push({
        title,
        url,
        image: `/${normalizeRelativePath(path.join(normalizeRelativePath(portfolio.draftScreenshotsDirectory).replace(/^public\//, ""), projectIdea.slug, fileName))}`,
        capturedAt: new Date().toISOString(),
        publishReady: false,
      });
    }

    return {
      status: screenshots.length ? "captured" : "skipped",
      reason: screenshots.length ? "" : "No screenshot routes were found.",
      screenshots,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error.message || "Playwright screenshot capture failed.",
      screenshots: [],
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function createPortfolioDraft(project) {
  const settings = await launcherSettings();
  const portfolio = portfolioIntegrationSettings(settings);
  const projectIdeasPath = path.join(portfolio.root, normalizeRelativePath(portfolio.projectIdeasFile));
  const blogPostsPath = path.join(portfolio.root, normalizeRelativePath(portfolio.blogPostsFile));

  if (!(await pathExists(portfolio.root))) {
    throw new Error(`Portfolio project root does not exist: ${portfolio.root}`);
  }
  if (!(await pathExists(projectIdeasPath))) {
    throw new Error(`Portfolio project ideas file does not exist: ${projectIdeasPath}`);
  }
  if (!(await pathExists(blogPostsPath))) {
    throw new Error(`Portfolio blog posts file does not exist: ${blogPostsPath}`);
  }

  const existingIdeas = await readJson(projectIdeasPath, []);
  const existingPosts = await readJson(blogPostsPath, []);
  if (!Array.isArray(existingIdeas)) throw new Error("Portfolio project ideas file must contain a JSON array.");
  if (!Array.isArray(existingPosts)) throw new Error("Portfolio blog posts file must contain a JSON array.");

  const draft = projectPortfolioDraft(project);
  const capture = await capturePortfolioScreenshots(project, portfolio, draft.projectIdea);
  draft.projectIdea.screenshotStatus = capture.status;
  draft.projectIdea.screenshotNotes = capture.reason || "Screenshots captured from the running local app. Review before publishing.";
  draft.projectIdea.screenshots = capture.screenshots;
  if (capture.screenshots[0]?.image) draft.projectIdea.image = capture.screenshots[0].image;
  const existingIdea = existingIdeas.find((idea) => idea?.sourceProjectId === project.id);
  if (!capture.screenshots.length && Array.isArray(existingIdea?.screenshots) && existingIdea.screenshots.length) {
    draft.projectIdea.screenshots = existingIdea.screenshots;
    draft.projectIdea.image = existingIdea.image || existingIdea.screenshots[0]?.image || "";
    draft.projectIdea.screenshotNotes = `${draft.projectIdea.screenshotNotes} Existing draft screenshots were preserved.`;
  }

  const effectiveCapture = {
    ...capture,
    screenshots: draft.projectIdea.screenshots,
    reason: draft.projectIdea.screenshotNotes,
  };
  const ai = await generatePortfolioContent(project, portfolio, draft.projectIdea, draft.blogPost, effectiveCapture);
  draft.projectIdea = {
    ...ai.projectIdea,
    aiStatus: ai.projectIdea.aiStatus || ai.status,
    aiMessage: ai.message,
  };
  draft.blogPost = {
    ...ai.blogPost,
    aiStatus: ai.blogPost.aiStatus || ai.status,
    aiMessage: ai.message,
  };

  const effectiveScreenshots = Array.isArray(draft.projectIdea.screenshots) ? draft.projectIdea.screenshots : [];
  draft.blogPost.sections.splice(Math.min(2, draft.blogPost.sections.length), 0, {
    heading: "Screenshots captured for review",
    body: effectiveScreenshots.length
      ? `RidgePath Forge captured ${effectiveScreenshots.length} local screenshot draft${effectiveScreenshots.length === 1 ? "" : "s"} for portfolio review. These images remain draft assets until reviewed and promoted into public project media.`
      : `No screenshots were captured. ${capture.reason}`,
  });
  const ideasResult = upsertByKey(existingIdeas, "sourceProjectId", project.id, draft.projectIdea);
  const postsResult = upsertByKey(existingPosts, "sourceProjectId", project.id, draft.blogPost);

  await writeJson(projectIdeasPath, ideasResult.items);
  await writeJson(blogPostsPath, postsResult.items);
  await appendActivity(
    project.id,
    "portfolio-draft",
    `${ideasResult.created ? "Created" : "Updated"} portfolio draft and ${postsResult.created ? "created" : "updated"} blog draft`,
    {
      portfolioRoot: portfolio.root,
      projectIdeasFile: portfolio.projectIdeasFile,
      blogPostsFile: portfolio.blogPostsFile,
      projectSlug: draft.projectIdea.slug,
      blogSlug: draft.blogPost.slug,
      screenshotStatus: capture.status,
      screenshotCount: capture.screenshots.length,
      aiStatus: ai.status,
    },
  );

  return {
    ok: true,
    createdProjectIdea: ideasResult.created,
    createdBlogPost: postsResult.created,
    portfolioRoot: portfolio.root,
    projectIdea: draft.projectIdea,
    blogPost: draft.blogPost,
    screenshotStatus: capture.status,
    screenshotCount: capture.screenshots.length,
    screenshotMessage: capture.reason || "Screenshots captured for draft review.",
    aiStatus: ai.status,
    aiMessage: ai.message,
  };
}

function generateDemoPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(Math.max(Number(length) || 18, 12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function hashDemoPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function demoPortalPublicUrl(settings, slugValue) {
  const base = String(settings.publicBaseUrl || DEFAULT_SETTINGS.demoPortalIntegration.publicBaseUrl).replace(/\/+$/, "");
  return `${base}/${slugValue}`;
}

function demoPortalDeepLink(settings, clientSlug, siteSlug = "") {
  const url = demoPortalPublicUrl(settings, clientSlug);
  return siteSlug ? `${url}?site=${encodeURIComponent(siteSlug)}` : url;
}

function demoPortalConfigDefaults(project, demoPortal = DEFAULT_SETTINGS.demoPortalIntegration) {
  const clientSlug = demoSlug(project.id);
  const siteSlug = demoSlug(project.folderName || project.id);
  const dashboard = project.projectManagement?.dashboard || {};
  const summary = dashboard.summary || {};
  return {
    clientName: displayProjectTitle(project),
    clientSlug,
    clientEmail: "",
    organizationName: "",
    siteTitle: displayProjectTitle(project),
    siteSlug,
    projectStatus: project.productionUrl ? "Production demo linked" : "Needs production deployment URL",
    projectPhase: sentence(summary.currentPhase, "Needs review"),
    progress: demoProgressFromDashboard(project),
    updateMessage: sentence(
      summary.nextCodexAction,
      `${displayProjectTitle(project)} was linked to the RidgePath demo portal from Forge.`,
    ),
    active: true,
    publicDemoUrl: demoPortalPublicUrl(demoPortal, clientSlug),
    deepLink: demoPortalDeepLink(demoPortal, clientSlug, siteSlug),
  };
}

function normalizeDemoPortalConfig(project, demoPortal, input = {}, existing = null) {
  const defaults = demoPortalConfigDefaults(project, demoPortal);
  const clientSlug = demoSlug(input.clientSlug || existing?.slug || defaults.clientSlug);
  const siteSlug = demoSlug(input.siteSlug || defaults.siteSlug);
  const clientEmail = String(input.clientEmail || existing?.client_email || existing?.clientEmail || "").trim();
  if (clientEmail && !validEmail(clientEmail)) {
    throw new Error("Enter a valid client email address.");
  }
  const progress = Math.max(0, Math.min(100, Number(input.progress ?? defaults.progress) || 0));
  const active = input.active === undefined ? true : Boolean(input.active);
  return {
    clientName: sentence(input.clientName || existing?.client_name || existing?.clientName, defaults.clientName),
    clientSlug,
    clientEmail,
    organizationName: String(input.organizationName || existing?.organization_name || existing?.organizationName || "").trim(),
    siteTitle: sentence(input.siteTitle, defaults.siteTitle),
    siteSlug,
    projectStatus: sentence(input.projectStatus, defaults.projectStatus),
    projectPhase: sentence(input.projectPhase, defaults.projectPhase),
    progress,
    updateMessage: sentence(input.updateMessage, defaults.updateMessage),
    active,
    publicDemoUrl: demoPortalPublicUrl(demoPortal, clientSlug),
    deepLink: demoPortalDeepLink(demoPortal, clientSlug, siteSlug),
  };
}

function demoEmailDraft(config, generatedPassword = "") {
  const greeting = config.clientName ? `Hi ${config.clientName},` : "Hi,";
  const credentialLine = generatedPassword
    ? `Temporary password: ${generatedPassword}`
    : "Use your existing RidgePath demo portal password. If you need a reset, reply to this email.";
  const subject = `Your RidgePath demo workspace is ready`;
  const body = [
    greeting,
    "",
    "Your RidgePath demo workspace is ready for review.",
    "",
    `Workspace link: ${config.deepLink || config.publicDemoUrl}`,
    credentialLine,
    "",
    "This link opens your client-facing project workspace where demo sites, status, and updates are collected.",
    "",
    "Thank you,",
    "RidgePath Technologies",
  ].join("\n");
  return { to: config.clientEmail, subject, body };
}

async function sendDemoPortalEmail(draft) {
  const apiKey = process.env.RESEND_API_KEY || process.env.DEMO_EMAIL_API_KEY || "";
  const from = process.env.DEMO_EMAIL_FROM || "RidgePath Technologies <demos@ridgepath.io>";
  if (!apiKey) {
    return {
      sent: false,
      configured: false,
      message: "Email sending is not configured. Copy the draft instead.",
    };
  }
  if (!draft.to || !validEmail(draft.to)) {
    return {
      sent: false,
      configured: true,
      message: "A valid client email is required before sending.",
    };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [draft.to],
      subject: draft.subject,
      text: draft.body,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Email provider rejected the demo portal message.");
  }
  return {
    sent: true,
    configured: true,
    provider: "resend",
    id: payload?.id || "",
    message: "Connection email sent.",
  };
}

function projectRepositoryUrl(project) {
  if (isHttpUrl(project.origin)) return project.origin.replace(/\.git$/i, "");
  return project.origin?.replace(/^git@github\.com:/i, "https://github.com/").replace(/\.git$/i, "") || "";
}

function projectDemoSiteUrl(project, publicDemoUrl = "") {
  if (isProductionHttpUrl(project.productionUrl)) return project.productionUrl;
  if (isProductionHttpUrl(project.liveUrl)) return project.liveUrl;
  return publicDemoUrl;
}

function demoProgressFromDashboard(project) {
  const dashboard = project.projectManagement?.dashboard || {};
  const counts = dashboard.counts || {};
  const open = Number(counts.backlogOpen || 0) + Number(counts.bugsOpen || 0);
  const sprintCommitted = Number(counts.sprintCommitted || 0);
  if (!open && sprintCommitted) return 75;
  if (!open) return 50;
  return Math.max(20, Math.min(70, 70 - (open * 4)));
}

function demoUpdateForProject(project, timestamp) {
  const dashboard = project.projectManagement?.dashboard || {};
  const summary = dashboard.summary || {};
  return {
    id: `forge-link-${timestamp.slice(0, 10)}`,
    title: "Project linked from RidgePath Forge",
    summary: sentence(
      summary.nextCodexAction,
      `${displayProjectTitle(project)} was linked to the RidgePath demo portal from Forge.`,
    ),
    status: sentence(summary.currentPhase, "Linked"),
    date: timestamp.slice(0, 10),
  };
}

function mergeDemoSite(existingSites, site) {
  const sites = Array.isArray(existingSites) ? [...existingSites] : [];
  const index = sites.findIndex((item) => item?.id === site.id);
  if (index >= 0) {
    sites[index] = {
      ...sites[index],
      ...site,
    };
    return sites;
  }
  return [site, ...sites];
}

function mergeDemoUpdate(existingUpdates, update) {
  const updates = Array.isArray(existingUpdates) ? [...existingUpdates] : [];
  const index = updates.findIndex((item) => item?.id === update.id);
  if (index >= 0) {
    updates[index] = {
      ...updates[index],
      ...update,
    };
    return updates;
  }
  return [update, ...updates].slice(0, 12);
}

function serializableDemoClientRecord(record) {
  const { existingClient, existing_client, ...publicRecord } = record;
  return publicRecord;
}

function demoPortalDatabaseUrl() {
  return process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL || "";
}

function demoPortalDb() {
  const databaseUrl = demoPortalDatabaseUrl();
  if (!databaseUrl) return null;
  demoPortalSql ??= neon(databaseUrl);
  return demoPortalSql;
}

async function existingDemoClientFromDb(sql, projectId, slugValue) {
  const rows = await sql`
    select *
    from demo_clients
    where slug = ${slugValue} or source_project_id = ${projectId}
    order by updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

async function upsertDemoPortalDatabaseRecord(project, demoPortal, record, site, update, generatedPassword) {
  const sql = demoPortalDb();
  const created = !record.existingClient;

  await sql`
    insert into demo_clients (
      slug,
      source_project_id,
      client_name,
      status,
      password_hash,
      local_path,
      repository_url,
      branch,
      latest_commit,
      deployment_url,
      public_demo_url,
      client_email,
      organization_name,
      invite_token_hash,
      invite_expires_at,
      last_invite_sent_at,
      access_reset_at,
      expires_at,
      linked_from_forge_at,
      updated_at
    )
    values (
      ${record.slug},
      ${record.sourceProjectId},
      ${record.clientName},
      ${record.status},
      ${record.passwordHash},
      ${record.localPath},
      ${record.repositoryUrl},
      ${record.branch},
      ${record.latestCommit},
      ${record.deploymentUrl},
      ${record.publicDemoUrl},
      ${record.clientEmail},
      ${record.organizationName},
      ${record.inviteTokenHash},
      ${record.inviteExpiresAt},
      ${record.lastInviteSentAt},
      ${record.accessResetAt},
      ${record.expiresAt},
      ${record.linkedFromForgeAt},
      now()
    )
    on conflict (slug) do update set
      source_project_id = excluded.source_project_id,
      client_name = excluded.client_name,
      status = excluded.status,
      password_hash = case
        when ${Boolean(record.forcePasswordUpdate)} then excluded.password_hash
        else coalesce(demo_clients.password_hash, excluded.password_hash)
      end,
      local_path = excluded.local_path,
      repository_url = excluded.repository_url,
      branch = excluded.branch,
      latest_commit = excluded.latest_commit,
      deployment_url = excluded.deployment_url,
      public_demo_url = excluded.public_demo_url,
      client_email = excluded.client_email,
      organization_name = excluded.organization_name,
      invite_token_hash = coalesce(excluded.invite_token_hash, demo_clients.invite_token_hash),
      invite_expires_at = coalesce(excluded.invite_expires_at, demo_clients.invite_expires_at),
      last_invite_sent_at = coalesce(excluded.last_invite_sent_at, demo_clients.last_invite_sent_at),
      access_reset_at = coalesce(excluded.access_reset_at, demo_clients.access_reset_at),
      expires_at = coalesce(demo_clients.expires_at, excluded.expires_at),
      linked_from_forge_at = excluded.linked_from_forge_at,
      updated_at = now()
  `;

  await sql`
    insert into demo_sites (
      client_slug,
      site_id,
      title,
      description,
      url,
      phase,
      status,
      progress,
      last_updated,
      sort_order,
      updated_at
    )
    values (
      ${record.slug},
      ${site.id},
      ${site.title},
      ${site.description},
      ${site.url},
      ${site.phase},
      ${site.status},
      ${site.progress},
      ${site.lastUpdated},
      0,
      now()
    )
    on conflict (client_slug, site_id) do update set
      title = excluded.title,
      description = excluded.description,
      url = excluded.url,
      phase = excluded.phase,
      status = excluded.status,
      progress = excluded.progress,
      last_updated = excluded.last_updated,
      updated_at = now()
  `;

  await sql`
    insert into demo_updates (
      client_slug,
      update_id,
      title,
      summary,
      status,
      update_date,
      updated_at
    )
    values (
      ${record.slug},
      ${update.id},
      ${update.title},
      ${update.summary},
      ${update.status},
      ${update.date},
      now()
    )
    on conflict (client_slug, update_id) do update set
      title = excluded.title,
      summary = excluded.summary,
      status = excluded.status,
      update_date = excluded.update_date,
      updated_at = now()
  `;

  await appendActivity(
    project.id,
    "demo-portal-link",
    `${created ? "Created" : "Updated"} Neon-backed RidgePath demo portal link`,
    {
      storage: "neon",
      clientSlug: record.slug,
      publicDemoUrl: record.publicDemoUrl,
      passwordGenerated: Boolean(generatedPassword),
    },
  );

  return {
    ok: true,
    storage: "neon",
    created,
    passwordGenerated: Boolean(generatedPassword),
    generatedPassword,
    registryPath: "Neon database",
    clientSlug: record.slug,
      clientName: record.clientName,
      clientEmail: record.clientEmail,
      organizationName: record.organizationName,
      publicDemoUrl: record.publicDemoUrl,
      deepLink: record.deepLink,
      siteUrl: site.url,
      deploymentUrl: record.deploymentUrl,
      productionReady: Boolean(record.deploymentUrl),
      expiresAt: record.expiresAt,
      emailDraft: demoEmailDraft(record, generatedPassword),
  };
}

async function demoPortalExistingRecord(project, demoPortal, requestedSlug = "") {
  const settings = await launcherSettings();
  const resolvedDemoPortal = demoPortal || demoPortalIntegrationSettings(settings);
  const sql = demoPortalDb();
  const slugValue = demoSlug(requestedSlug || project.id);
  const registryPath = path.join(resolvedDemoPortal.root, normalizeRelativePath(resolvedDemoPortal.clientsFile));
  if (!(await pathExists(resolvedDemoPortal.root))) {
    throw new Error(`Demo portal project root does not exist: ${resolvedDemoPortal.root}`);
  }
  const clients = sql ? [] : await readJson(registryPath, []);
  if (!sql && !Array.isArray(clients)) {
    throw new Error(`Demo portal registry must contain a JSON array: ${registryPath}`);
  }
  const existingIndex = sql ? -1 : clients.findIndex((client) => client?.slug === slugValue || client?.sourceProjectId === project.id);
  const existing = sql ? await existingDemoClientFromDb(sql, project.id, slugValue) : existingIndex >= 0 ? clients[existingIndex] : null;
  return { sql, registryPath, clients, existingIndex, existing };
}

async function demoPortalConfiguration(project) {
  const settings = await launcherSettings();
  const demoPortal = demoPortalIntegrationSettings(settings);
  const { sql, existing } = await demoPortalExistingRecord(project, demoPortal);
  const defaults = demoPortalConfigDefaults(project, demoPortal);
  const config = normalizeDemoPortalConfig(project, demoPortal, {}, existing);
  return {
    ok: true,
    storage: sql ? "neon" : "local-json",
    emailConfigured: Boolean(process.env.RESEND_API_KEY || process.env.DEMO_EMAIL_API_KEY),
    project: {
      id: project.id,
      name: displayProjectTitle(project),
      path: project.path,
      repositoryUrl: projectRepositoryUrl(project),
      branch: project.git?.branch || "",
      productionUrl: isProductionHttpUrl(project.productionUrl) ? project.productionUrl : "",
      liveUrl: project.liveUrl || "",
    },
    defaults,
    config,
    existing: existing ? {
      clientSlug: existing.slug,
      clientName: existing.clientName || existing.client_name,
      clientEmail: existing.clientEmail || existing.client_email || "",
      organizationName: existing.organizationName || existing.organization_name || "",
      publicDemoUrl: existing.publicDemoUrl || existing.public_demo_url || config.publicDemoUrl,
      lastInviteSentAt: existing.lastInviteSentAt || existing.last_invite_sent_at || "",
      accessResetAt: existing.accessResetAt || existing.access_reset_at || "",
    } : null,
    emailDraft: demoEmailDraft(config),
  };
}

async function linkProjectToDemoPortal(project, input = {}, options = {}) {
  const settings = await launcherSettings();
  const demoPortal = demoPortalIntegrationSettings(settings);
  const { sql, registryPath, clients, existingIndex, existing } = await demoPortalExistingRecord(project, demoPortal, input.clientSlug);

  const now = new Date();
  const timestamp = now.toISOString();
  const config = normalizeDemoPortalConfig(project, demoPortal, input, existing);
  const existingPasswordHash = existing?.passwordHash || existing?.password_hash || "";
  const shouldResetAccess = Boolean(options.resetAccess || input.resetAccess);
  const generatedPassword = existingPasswordHash && !shouldResetAccess ? "" : generateDemoPassword(demoPortal.passwordLength);
  const passwordHash = existingPasswordHash || hashDemoPassword(generatedPassword);
  const resolvedPasswordHash = shouldResetAccess && generatedPassword ? hashDemoPassword(generatedPassword) : passwordHash;
  const productionDeploymentUrl = isProductionHttpUrl(project.productionUrl) ? project.productionUrl : "";
  const expiry = existing?.expiresAt || existing?.expires_at || new Date(now.getTime() + (Number(demoPortal.defaultExpiryDays || 45) * 24 * 60 * 60 * 1000)).toISOString();
  const site = {
    id: config.siteSlug,
    title: config.siteTitle,
    description: sentence(project.description, "Current website demo linked from RidgePath Forge."),
    url: projectDemoSiteUrl(project, config.publicDemoUrl),
    phase: config.projectPhase,
    status: config.projectStatus,
    progress: config.progress,
    lastUpdated: timestamp.slice(0, 10),
  };
  const update = {
    ...demoUpdateForProject(project, timestamp),
    summary: config.updateMessage,
    status: config.projectPhase,
  };
  const record = {
    ...existing,
    existingClient: existing,
    slug: config.clientSlug,
    sourceProjectId: project.id,
    clientName: config.clientName,
    clientEmail: config.clientEmail,
    organizationName: config.organizationName,
    status: config.active ? "active" : "inactive",
    passwordHash: resolvedPasswordHash,
    forcePasswordUpdate: shouldResetAccess,
    localPath: project.path,
    repositoryUrl: projectRepositoryUrl(project),
    branch: project.git?.branch || existing?.branch || "",
    latestCommit: await runCapture("git.exe", ["rev-parse", "--short", "HEAD"], project.path),
    deploymentUrl: productionDeploymentUrl,
    publicDemoUrl: config.publicDemoUrl,
    deepLink: config.deepLink,
    expiresAt: expiry,
    sites: mergeDemoSite(existing?.sites, site),
    updates: mergeDemoUpdate(existing?.updates, update),
    inviteTokenHash: existing?.inviteTokenHash || existing?.invite_token_hash || "",
    inviteExpiresAt: existing?.inviteExpiresAt || existing?.invite_expires_at || null,
    lastInviteSentAt: input.markInviteSent ? timestamp : (existing?.lastInviteSentAt || existing?.last_invite_sent_at || null),
    accessResetAt: shouldResetAccess ? timestamp : (existing?.accessResetAt || existing?.access_reset_at || null),
    linkedFromForgeAt: timestamp,
  };

  if (sql) {
    return upsertDemoPortalDatabaseRecord(project, demoPortal, record, site, update, generatedPassword);
  }

  const persistedRecord = serializableDemoClientRecord(record);
  if (existingIndex >= 0) clients[existingIndex] = persistedRecord;
  else clients.push(persistedRecord);

  await writeJson(registryPath, clients);
  await appendActivity(
    project.id,
    "demo-portal-link",
    `${existing ? "Updated" : "Created"} RidgePath demo portal link`,
    {
      demoPortalRoot: demoPortal.root,
      registryFile: demoPortal.clientsFile,
      clientSlug: record.slug,
      publicDemoUrl: record.publicDemoUrl,
      passwordGenerated: Boolean(generatedPassword),
    },
  );

  return {
    ok: true,
    storage: "local-json",
    created: !existing,
    passwordGenerated: Boolean(generatedPassword),
    generatedPassword,
    registryPath,
    clientSlug: record.slug,
    clientName: record.clientName,
    clientEmail: record.clientEmail,
    organizationName: record.organizationName,
    publicDemoUrl: record.publicDemoUrl,
    deepLink: record.deepLink,
    siteUrl: site.url,
    deploymentUrl: record.deploymentUrl,
    productionReady: Boolean(productionDeploymentUrl),
    expiresAt: record.expiresAt,
    emailDraft: demoEmailDraft(record, generatedPassword),
  };
}

async function resetDemoPortalAccess(project, input = {}) {
  return linkProjectToDemoPortal(project, input, { resetAccess: true });
}

async function sendDemoPortalConnectionLink(project, input = {}) {
  const result = await linkProjectToDemoPortal(project, { ...input, markInviteSent: true });
  const draft = demoEmailDraft(result, "");
  const email = await sendDemoPortalEmail(draft);
  await appendActivity(
    project.id,
    "demo-portal-send-link",
    email.sent ? "Sent RidgePath demo portal connection link" : "Prepared RidgePath demo portal connection link draft",
    {
      clientSlug: result.clientSlug,
      clientEmail: result.clientEmail,
      sent: email.sent,
      configured: email.configured,
    },
  );
  return {
    ...result,
    email,
    emailDraft: draft,
  };
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

function checkPortHost(port, host) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(status);
    };
    const socket = net.createConnection({ host, port, timeout: 450 });
    socket.on("connect", () => finish("open"));
    socket.on("timeout", () => finish("closed"));
    socket.on("error", () => finish("closed"));
  });
}

async function checkPort(port) {
  if (!port) return "unknown";
  const checks = await Promise.all([
    checkPortHost(port, "127.0.0.1"),
    checkPortHost(port, "::1"),
  ]);
  return checks.includes("open") ? "open" : "closed";
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
  const registryEntries = await readJson(REGISTRY_FILE, []);
  const registryById = new Map((Array.isArray(registryEntries) ? registryEntries : []).map((item) => [item.id, item]));
  const projects = [];

  for (const entry of entries.filter((item) => item.isDirectory() && !item.name.startsWith("."))) {
    const projectPath = path.join(PROJECTS_ROOT, entry.name);
    const pkg = safeReadJson(path.join(projectPath, "package.json"));
    const files = await getProjectFiles(projectPath);
    const readme = await readIfExists(path.join(projectPath, "README.md"));
    const origin = gitOrigin(projectPath);
    const id = slug(entry.name);
    const override = overrides[id] || {};
    const registryEntry = registryById.get(id) || {};
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
        bootstrap: registryEntry.bootstrap || {},
        registeredAt: registryEntry.createdAt || "",
        framework: "Unknown",
        liveUrl: liveProjectUrl({}, override),
        productionUrl: productionProjectUrl({}, override),
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
      bootstrap: registryEntry.bootstrap || {},
      registeredAt: registryEntry.createdAt || "",
      framework,
      liveUrl: liveProjectUrl(pkg, override),
      productionUrl: productionProjectUrl(pkg, override),
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
    PROJECT_CONTEXT: bootstrap.projectContext || "Needs manual review",
    KEY_FEATURES: bootstrap.keyFeatures || "Needs manual review",
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

function registeredProjectServerSource(projectName, assignedPort) {
  return `import http from "node:http";

const port = Number(process.env.PORT || ${assignedPort});
const name = ${JSON.stringify(projectName)};
const brand = {
  background: "#f6f8f4",
  surface: "#ffffff",
  text: "#173323",
  muted: "#5d6f64",
  accent: "#6f9938",
  accentDark: "#3d6425",
};

function page(title, eyebrow, message) {
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\${title}</title>
  </head>
  <body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:\${brand.background};color:\${brand.text}">
    <main style="min-height:100vh;display:grid;place-items:center;padding:32px">
      <section style="width:min(720px,100%);background:\${brand.surface};border:1px solid rgba(23,51,35,.14);border-radius:8px;padding:36px;box-shadow:0 20px 48px rgba(23,51,35,.12)">
        <p style="margin:0 0 12px;color:\${brand.accentDark};font-weight:800;text-transform:uppercase">\${eyebrow}</p>
        <h1 style="margin:0 0 16px;font-size:clamp(2rem,4vw,3.5rem);line-height:1.05">\${title}</h1>
        <p style="margin:0 0 28px;color:\${brand.muted};font-size:1.08rem;line-height:1.6">\${message}</p>
        <a href="/" style="display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:6px;background:\${brand.accent};color:white;text-decoration:none;font-weight:800">Return home</a>
      </section>
    </main>
  </body>
</html>\`;
}

http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const isHome = url.pathname === "/";
  const html = isHome
    ? page(name, "Registered by RidgePath Forge", "This starter site is ready for project-specific content, routes, validation, and deployment setup.")
    : page("Page not found", name, "This route is not available yet. The custom 404 should be kept visually aligned with the finished site theme.");

  res.writeHead(isHome ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(\`\${name} listening on http://localhost:\${port}\`);
});
`;
}

function formatFeatureList(value) {
  const lines = String(value || "")
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "- Needs manual review.";
  return lines.map((line) => `- ${line.replace(/^[-*]\s*/, "")}`).join("\n");
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
  projectContext = "",
  keyFeatures = "",
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
    projectContext: String(projectContext || "").trim(),
    keyFeatures: String(keyFeatures || "").trim(),
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
  await fs.writeFile(path.join(projectPath, "server.js"), registeredProjectServerSource(projectName, assignedPort));
  await fs.writeFile(path.join(projectPath, "README.md"), `# ${projectName}\n\nRegistered by RidgePath Forge on port ${assignedPort}.\n\n## Bootstrap Snapshot\n\n- Application Classification: ${bootstrap.applicationClassification}\n- Technology Stack: ${bootstrap.technologyStack}\n- Repository: ${bootstrap.repositoryOwner}/${folderName} (${bootstrap.repositoryVisibility})\n- Hosting: ${hostingLabel}\n- Package Manager: ${bootstrap.packageManager}\n\n## Project Context\n\n${bootstrap.projectContext || "Needs manual review."}\n\n## Key Features\n\n${formatFeatureList(bootstrap.keyFeatures)}\n\n## Website Baseline\n\n- Starter runtime includes a custom 404 response that shares the same visual theme as the home page.\n- For website projects, keep the custom 404 aligned with the final site theme and include it in review evidence before release.\n\nThis project is registered only. Start it from RidgePath Forge when you are ready.\n`);
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ridgepath-forge-api" });
});

app.get("/api/command-center/status", async (_req, res) => {
  try {
    res.json(await commandCenterStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/agent-runs", async (_req, res) => {
  try {
    res.json({ runs: await listAgentRuns() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/agent-runs/project-review", async (req, res) => {
  try {
    const projectId = req.body?.projectId || req.query.projectId;
    if (!projectId) return res.status(400).json({ error: "projectId is required." });
    const project = await findProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await createProjectReviewRun(project));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/proposals", async (_req, res) => {
  try {
    res.json({
      proposals: await listProposals(),
      approvalEvents: await listApprovalEvents(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/proposals/:proposalId", async (req, res) => {
  try {
    res.json(await updateProposal(req.params.proposalId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/runners", async (_req, res) => {
  try {
    const { listLocalRunners } = await import("./domains/command-center/repository.js");
    const runners = await listLocalRunners();
    res.json({
      runners,
      active: runners.filter((runner) => runner.paired),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/commands", async (req, res) => {
  try {
    const { listCommandEvents, listCommandRequests } = await import("./domains/command-center/repository.js");
    const runnerId = req.query?.runnerId || "";
    const [commands, events] = await Promise.all([
      listCommandRequests({ runnerId }),
      listCommandEvents(),
    ]);
    res.json({ commands, events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/commands", async (req, res) => {
  try {
    const { createCommandRequest } = await import("./domains/command-center/repository.js");
    res.status(201).json(await createCommandRequest(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/commands/claim", async (req, res) => {
  try {
    const { claimNextCommandForRunner } = await import("./domains/command-center/repository.js");
    const command = await claimNextCommandForRunner(req.body?.runnerId);
    res.json({
      command,
      execution: command ? "claimed" : "idle",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/commands/:commandId", async (req, res) => {
  try {
    const { updateCommandRequest } = await import("./domains/command-center/repository.js");
    res.json(await updateCommandRequest(req.params.commandId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/execution-packets", async (req, res) => {
  try {
    const { listExecutionPacketEvents, listExecutionPackets } = await import("./domains/command-center/repository.js");
    const proposalId = req.query?.proposalId || "";
    const [packets, events] = await Promise.all([
      listExecutionPackets(proposalId),
      listExecutionPacketEvents(),
    ]);
    res.json({ packets, events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/execution-packets/claim", async (req, res) => {
  try {
    const { claimNextExecutionPacketForRunner } = await import("./domains/command-center/repository.js");
    const packet = await claimNextExecutionPacketForRunner(req.body?.runnerId);
    res.json({
      packet,
      execution: packet ? "claimed" : "idle",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/execution-packets/:packetId", async (req, res) => {
  try {
    const { updateExecutionPacket } = await import("./domains/command-center/repository.js");
    res.json(await updateExecutionPacket(req.params.packetId, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/ridge-fabric", async (_req, res) => {
  try {
    res.json(await readRidgeFabricRegistry());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/ridge-fabric/devices/:stableIdentifier", async (req, res) => {
  try {
    res.json(await updateRidgeFabricDeviceRecord(req.params.stableIdentifier, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/ridge-fabric/devices/:stableIdentifier", async (req, res) => {
  try {
    res.json(await deleteRidgeFabricDeviceRecord(req.params.stableIdentifier));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/ridge-fabric/open", async (req, res) => {
  try {
    const target = resolveRegistryPath(req.body?.relativePath || "");
    if (!(await pathExists(target))) return res.status(404).json({ error: "Registry path does not exist." });
    spawn("explorer.exe", [target], { windowsHide: true, detached: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
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

app.post("/api/projects/:projectId/create-portfolio-draft", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await createPortfolioDraft(project));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/projects/:projectId/demo-portal-config", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await demoPortalConfiguration(project));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/demo-portal-config", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await linkProjectToDemoPortal(project, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/demo-portal-reset-access", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await resetDemoPortalAccess(project, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/demo-portal-send-link", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await sendDemoPortalConnectionLink(project, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/link-demo-portal", async (req, res) => {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await linkProjectToDemoPortal(project, req.body || {}));
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
