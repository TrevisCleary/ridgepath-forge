import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

export const RIDGE_FABRIC_ROOT = process.env.RIDGE_FABRIC_ROOT || "C:\\Development\\Shared\\ridge-fabric-registry";

const DEVICES_DIR = path.join(RIDGE_FABRIC_ROOT, "devices");
const DEVICES_FILE = path.join(RIDGE_FABRIC_ROOT, "devices.md");
const ACTIVE_EDITOR_FILE = path.join(RIDGE_FABRIC_ROOT, ".active-editor.json");
const LOCK_STALE_MS = 10 * 60 * 1000;
const HOSTNAME = os.hostname();
const USERNAME = os.userInfo().username;

function slug(value) {
  const normalized = String(value || "device")
    .toLowerCase()
    .replaceAll("`", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || "device";
}

function stripMarkdownCode(value) {
  return String(value || "").trim().replaceAll("`", "");
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replaceAll("\r\n", " ")
    .replaceAll("\n", " ")
    .replaceAll("|", "\\|")
    .trim();
}

function splitMarkdownRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  const cells = [];
  let current = "";
  let escaped = false;
  for (const char of trimmed.slice(1, -1)) {
    if (char === "|" && !escaped) {
      cells.push(current.trim().replaceAll("\\|", "|"));
      current = "";
      escaped = false;
      continue;
    }
    current += char;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  cells.push(current.trim().replaceAll("\\|", "|"));
  return cells;
}

function parseMarkdownTableAfterHeading(markdown, heading) {
  const lines = String(markdown || "").split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) return { headers: [], rows: [] };
  const tableStart = lines.findIndex((line, index) => index > headingIndex && line.trim().startsWith("|"));
  if (tableStart < 0) return { headers: [], rows: [] };
  let tableEnd = tableStart;
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|")) tableEnd += 1;
  const headers = splitMarkdownRow(lines[tableStart]);
  const rows = lines.slice(tableStart + 2, tableEnd).map((line) => {
    const cells = splitMarkdownRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
  return { headers, rows };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(tempPath, filePath);
}

function deviceFromMarkdownRow(row, index) {
  const stableIdentifier = stripMarkdownCode(row["Stable identifier"]);
  const id = slug(row["Proposed nickname"] || stableIdentifier || `device-${index + 1}`);
  return {
    schemaVersion: 1,
    id,
    stableIdentifier,
    nickname: row["Proposed nickname"] || "",
    currentName: stripMarkdownCode(row["Current name / DNS"]),
    ipAddress: stripMarkdownCode(row["IP address"]),
    mac: stripMarkdownCode(row.MAC),
    role: row.Role || "",
    scope: row.Scope || "",
    confidence: row.Confidence || "",
    notes: row.Notes || "",
    source: {
      migratedFrom: "devices.md",
      migratedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
    updatedByHost: HOSTNAME,
  };
}

function deviceFilePath(device) {
  return path.join(DEVICES_DIR, `${slug(device.id || device.stableIdentifier)}.json`);
}

async function listDeviceJsonFiles() {
  await fs.mkdir(DEVICES_DIR, { recursive: true });
  const entries = await fs.readdir(DEVICES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(DEVICES_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function migrateDevicesFromMarkdownIfNeeded() {
  const jsonFiles = await listDeviceJsonFiles();
  if (jsonFiles.length) return;
  if (!(await pathExists(DEVICES_FILE))) return;

  const markdown = await fs.readFile(DEVICES_FILE, "utf8");
  const table = parseMarkdownTableAfterHeading(markdown, "## Known Devices");
  const devices = table.rows.map(deviceFromMarkdownRow);
  for (const device of devices) {
    await writeJsonAtomic(deviceFilePath(device), device);
  }
}

function toApiDevice(device, index) {
  const remoteAccess = normalizeRemoteAccess(device);
  return {
    index,
    stableIdentifier: device.stableIdentifier || device.hostname || device.id,
    nickname: device.nickname || "",
    currentName: device.currentName || device.hostname || "",
    ipAddress: device.ipAddress || "",
    mac: device.mac || "",
    role: device.role || "",
    scope: device.scope || "",
    confidence: device.confidence || "",
    notes: device.notes || "",
    remoteAccess,
    hasRemoteAccess: Boolean(remoteAccess.rustdeskId),
    id: device.id,
    updatedAt: device.updatedAt || "",
    updatedByHost: device.updatedByHost || "",
  };
}

function normalizeRemoteAccess(device = {}) {
  const remoteAccess = device.remoteAccess && typeof device.remoteAccess === "object" ? device.remoteAccess : {};
  const provider = String(remoteAccess.provider || device.remoteProvider || (remoteAccess.rustdeskId || device.rustdeskId || device.rustdesk_id ? "rustdesk" : "")).trim();
  return {
    provider,
    rustdeskId: String(remoteAccess.rustdeskId || device.rustdeskId || device.rustdesk_id || "").replace(/\s+/g, "").trim(),
    rustdeskServer: String(remoteAccess.rustdeskServer || device.rustdeskServer || device.rustdesk_server || "rustdesk.ridgepath.io").trim(),
    relayServer: String(remoteAccess.relayServer || device.relayServer || device.relay_server || "").trim(),
    serverKey: String(remoteAccess.serverKey || device.serverKey || device.server_key || "").trim(),
    notes: String(remoteAccess.notes || "").trim(),
  };
}

async function readDevices() {
  await migrateDevicesFromMarkdownIfNeeded();
  const files = await listDeviceJsonFiles();
  const devices = [];
  for (const file of files) {
    const device = await readJson(file, null);
    if (device) devices.push({ ...device, id: device.id || slug(device.stableIdentifier || path.basename(file, ".json")) });
  }
  return devices.sort((left, right) => {
    const leftName = left.nickname || left.stableIdentifier || left.id;
    const rightName = right.nickname || right.stableIdentifier || right.id;
    if (leftName === "Atlas") return -1;
    if (rightName === "Atlas") return 1;
    return leftName.localeCompare(rightName);
  });
}

function renderDevicesMarkdown(devices) {
  const headers = ["Stable identifier", "Proposed nickname", "Current name / DNS", "IP address", "MAC", "Role", "Scope", "Remote", "Confidence", "Notes"];
  const rows = devices.map((device) => [
    `\`${device.stableIdentifier || device.id}\``,
    device.nickname || "",
    device.currentName || "",
    device.ipAddress || "",
    device.mac || "",
    device.role || "",
    device.scope || "",
    normalizeRemoteAccess(device).rustdeskId ? "RustDesk configured" : "",
    device.confidence || "",
    device.notes || "",
  ].map(escapeMarkdownCell));

  return `# Ridge Fabric Device Registry

Generated from JSON device records.

Last generated: ${new Date().toISOString()}

## Current Naming Approach

| Concept | Value |
| --- | --- |
| Architecture name | Ridge Fabric |
| Registry location | \`${RIDGE_FABRIC_ROOT}\` |
| Canonical source | JSON files under \`devices/*.json\` |
| Hostname policy | Keep current hostnames for now. |
| Nickname policy | Use memorable aliases for conversation and planning; do not depend on them in scripts. |
| Primary key | JSON record \`id\`, with hostname/DNS/IP/MAC tracked as fields. |

## Known Devices

| ${headers.join(" | ")} |
| ${headers.map(() => "---").join(" | ")} |
${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}

## Follow-Up Inventory Passes

1. Check router/client lists to confirm unknown MAC addresses.
2. Directly inspect known Windows/Linux hosts and add per-device topology files under \`devices/\`.
3. Record which devices are required for Codex, local launchers, scheduled automations, databases, and remote support.
4. Resolve Syncthing conflict files before editing records.
`;
}

async function regenerateDevicesMarkdown(devices = null) {
  const currentDevices = devices || await readDevices();
  await fs.writeFile(DEVICES_FILE, renderDevicesMarkdown(currentDevices));
}

async function findConflictFiles(dir = RIDGE_FABRIC_ROOT) {
  const conflicts = [];
  async function visit(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(currentDir, entry.name);
      if (entry.name.toLowerCase().includes("sync-conflict")) {
        const stat = await fs.stat(filePath).catch(() => null);
        conflicts.push({
          relativePath: path.relative(RIDGE_FABRIC_ROOT, filePath),
          fullPath: filePath,
          size: stat?.size || 0,
          modified: stat?.mtime?.toISOString() || "",
        });
      }
      if (entry.isDirectory()) await visit(filePath);
    }
  }
  await visit(dir);
  return conflicts;
}

async function readActiveEditor() {
  const lock = await readJson(ACTIVE_EDITOR_FILE, null);
  if (!lock) {
    return {
      mode: "editable",
      currentHost: HOSTNAME,
      active: null,
    };
  }
  const lastSeen = Date.parse(lock.lastSeenAt || lock.startedAt || "");
  const stale = !lastSeen || Date.now() - lastSeen > LOCK_STALE_MS;
  const sameHost = String(lock.host || "").toLowerCase() === HOSTNAME.toLowerCase();
  return {
    mode: sameHost || stale ? "editable" : "read-only",
    currentHost: HOSTNAME,
    stale,
    active: lock,
  };
}

async function touchActiveEditor(force = false) {
  const current = await readActiveEditor();
  if (current.mode === "read-only" && !force) return current;
  const now = new Date().toISOString();
  const next = {
    host: HOSTNAME,
    user: USERNAME,
    app: "RidgePath Forge",
    startedAt: current.active?.host === HOSTNAME ? current.active.startedAt || now : now,
    lastSeenAt: now,
  };
  await writeJsonAtomic(ACTIVE_EDITOR_FILE, next);
  return readActiveEditor();
}

async function registryFiles() {
  const relativePaths = [
    "README.md",
    "devices.md",
    "automation-topology.md",
    ".active-editor.json",
    "devices/atlas-automation-topology.md",
    "networks/atlas-connectivity.md",
    "workloads/atlas-workloads.md",
  ];
  const jsonFiles = (await listDeviceJsonFiles()).map((file) => path.relative(RIDGE_FABRIC_ROOT, file));
  return [...relativePaths, ...jsonFiles].map((relativePath) => {
    const filePath = path.join(RIDGE_FABRIC_ROOT, relativePath);
    let stat = null;
    try {
      stat = fsSync.statSync(filePath);
    } catch {}
    return {
      relativePath,
      fullPath: filePath,
      exists: Boolean(stat),
      size: stat?.size || 0,
      modified: stat?.mtime?.toISOString() || "",
    };
  });
}

export async function ridgeFabricRegistry({ touchLock = true } = {}) {
  await fs.mkdir(RIDGE_FABRIC_ROOT, { recursive: true });
  await fs.mkdir(DEVICES_DIR, { recursive: true });
  const lock = touchLock ? await touchActiveEditor(false) : await readActiveEditor();
  const devices = await readDevices();
  await regenerateDevicesMarkdown(devices);
  const conflicts = await findConflictFiles();
  return {
    root: RIDGE_FABRIC_ROOT,
    devices: devices.map(toApiDevice),
    files: await registryFiles(),
    conflicts,
    editSession: {
      ...lock,
      readOnly: lock.mode === "read-only" || conflicts.length > 0,
      conflictCount: conflicts.length,
    },
    counts: {
      devices: devices.length,
      confirmed: devices.filter((device) => String(device.confidence).toLowerCase().includes("confirmed")).length,
      unknown: devices.filter((device) => String(device.role).toLowerCase().includes("unknown") || String(device.scope).toLowerCase().includes("unknown")).length,
      followUps: devices.filter((device) => String(device.notes).toLowerCase().includes("needs") || String(device.notes).toLowerCase().includes("verify")).length,
    },
  };
}

export async function updateRidgeFabricDevice(stableIdentifier, patch) {
  const registry = await ridgeFabricRegistry();
  if (registry.editSession.readOnly) throw new Error("Ridge Fabric registry is read-only until the active editor or sync conflicts are resolved.");
  const devices = await readDevices();
  const target = devices.find((device) => (device.stableIdentifier || device.id) === stableIdentifier);
  if (!target) throw new Error("Device not found.");
  const allowedFields = ["nickname", "currentName", "ipAddress", "mac", "role", "scope", "confidence", "notes"];
  for (const field of allowedFields) {
    if (field in patch) target[field] = String(patch[field] || "").trim();
  }
  if (patch.remoteAccess && typeof patch.remoteAccess === "object") {
    target.remoteAccess = normalizeRemoteAccess({ remoteAccess: patch.remoteAccess });
  }
  target.updatedAt = new Date().toISOString();
  target.updatedByHost = HOSTNAME;
  await writeJsonAtomic(deviceFilePath(target), target);
  await regenerateDevicesMarkdown(await readDevices());
  return toApiDevice(target, 0);
}

export async function deleteRidgeFabricDevice(stableIdentifier) {
  const registry = await ridgeFabricRegistry();
  if (registry.editSession.readOnly) throw new Error("Ridge Fabric registry is read-only until the active editor or sync conflicts are resolved.");
  const devices = await readDevices();
  const target = devices.find((device) => (device.stableIdentifier || device.id) === stableIdentifier);
  if (!target) throw new Error("Device not found.");
  await fs.rm(deviceFilePath(target), { force: true });
  await regenerateDevicesMarkdown(await readDevices());
  return toApiDevice(target, 0);
}

export function resolveRegistryPath(relativePath = "") {
  const normalized = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const target = normalized ? path.resolve(RIDGE_FABRIC_ROOT, normalized) : path.resolve(RIDGE_FABRIC_ROOT);
  if (!target.startsWith(path.resolve(RIDGE_FABRIC_ROOT))) throw new Error("Invalid registry path.");
  return target;
}
