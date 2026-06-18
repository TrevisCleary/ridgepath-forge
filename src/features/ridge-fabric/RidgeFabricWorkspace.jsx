import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, FileText, FolderOpen, RefreshCw, X } from "lucide-react";

export function RidgeFabricWorkspace({ registry, busy, localControlsEnabled = true, onRefresh, onSaveDevice, onDeleteDevice, onOpenPath, onBack }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const devices = registry?.devices || [];
  const editSession = registry?.editSession || {};
  const readOnly = Boolean(editSession.readOnly) || !localControlsEnabled;
  const conflicts = registry?.conflicts || [];
  const selectedDevice = devices.find((device) => device.stableIdentifier === selectedDeviceId) || null;
  const activeDraft = draft || selectedDevice;
  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return devices;
    return devices.filter((device) =>
      [device.stableIdentifier, device.nickname, device.currentName, device.ipAddress, device.role, device.scope, device.confidence, device.notes, device.remoteAccess?.rustdeskId, device.remoteAccess?.rustdeskServer]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [devices, query]);

  useEffect(() => {
    setDraft(selectedDevice ? { ...selectedDevice } : null);
  }, [selectedDevice?.stableIdentifier]);

  const setField = (field, value) => setDraft((current) => ({ ...(current || selectedDevice || {}), [field]: value }));
  const setRemoteField = (field, value) => setDraft((current) => {
    const base = current || selectedDevice || {};
    return {
      ...base,
      remoteAccess: {
        ...(base.remoteAccess || {}),
        provider: "rustdesk",
        [field]: value,
      },
    };
  });
  const saving = activeDraft ? busy === `ridge-fabric:${activeDraft.stableIdentifier}` : false;
  const deleting = activeDraft ? busy === `ridge-fabric-delete:${activeDraft.stableIdentifier}` : false;
  const canSave = Boolean(!readOnly && activeDraft?.stableIdentifier && selectedDevice && JSON.stringify(activeDraft) !== JSON.stringify(selectedDevice));
  const requestDelete = async () => {
    if (!activeDraft?.stableIdentifier) return;
    const label = activeDraft.nickname || activeDraft.stableIdentifier;
    if (!window.confirm(`Remove ${label} from the Ridge Fabric registry? This only removes the row from devices.md.`)) return;
    const removed = await onDeleteDevice(activeDraft.stableIdentifier);
    if (removed) {
      setSelectedDeviceId("");
      setDraft(null);
      setDeviceModalOpen(false);
    }
  };
  const copyInventoryPrompt = async () => {
    await copyTextToClipboard(buildMachineInventoryPrompt(registry));
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1800);
  };

  return (
    <section className="fabric-workspace" aria-labelledby="ridge-fabric-title">
      <div className="fabric-head">
        <div>
          <p className="eyebrow">Infrastructure</p>
          <h2 id="ridge-fabric-title">Ridge Fabric Registry</h2>
        </div>
        <div className="actions fabric-head-actions">
          <button className="fabric-action-button fabric-action-primary" type="button" onClick={copyInventoryPrompt}>
            {promptCopied ? <Check size={15} /> : <Copy size={15} />}
            {promptCopied ? "Prompt Copied" : "Copy Inventory Prompt"}
          </button>
          <button className="fabric-action-button" type="button" onClick={onBack} title="Return to the project directory">
            <X size={15} />
            Projects
          </button>
          <button className="fabric-action-button" type="button" onClick={() => onOpenPath("")} disabled={!localControlsEnabled} title={localControlsEnabled ? "Open the Ridge Fabric registry folder" : "Requires a paired local runner"}>
            <FolderOpen size={15} />
            Open Registry
          </button>
          <button className="fabric-action-button" type="button" onClick={onRefresh} title="Reload registry data from disk">
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {!registry ? (
        <div className="fabric-empty">Loading registry...</div>
      ) : (
        <div className="fabric-body">
          <div className="pm-overview-grid compact">
            <FabricInfo label="Devices" value={registry.counts?.devices ?? 0} />
            <FabricInfo label="Edit Mode" value={readOnly ? "Read-only" : "Editable"} tone={readOnly ? "warning" : "running"} />
            <FabricInfo label="Unknown" value={registry.counts?.unknown ?? 0} tone={(registry.counts?.unknown || 0) ? "warning" : ""} />
            <FabricInfo label="Active Host" value={editSession.active?.host || editSession.currentHost || "n/a"} />
          </div>

          {readOnly ? (
            <div className="pm-warning">
              <AlertTriangle size={16} />
              <span>
                {!localControlsEnabled
                  ? "Hosted Ops is read-only for Fabric until a local runner is paired."
                  : conflicts.length
                  ? `${conflicts.length} Syncthing conflict file${conflicts.length === 1 ? "" : "s"} detected. Resolve conflicts before editing.`
                  : `Registry is locked by ${editSession.active?.host || "another host"}.`}
              </span>
            </div>
          ) : null}

          <div className="fabric-grid fabric-grid-single">
            <section className="fabric-table-panel">
              <div className="fabric-toolbar">
                <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search devices" />
                <button className="secondary-action" type="button" onClick={() => onOpenPath("devices.md")} disabled={!localControlsEnabled} title={localControlsEnabled ? "Open generated devices summary" : "Requires a paired local runner"}>
                  <FileText size={15} />
                  Devices
                </button>
              </div>
              <div className="fabric-table-wrap">
                <table className="fabric-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Role</th>
                      <th>Scope</th>
                      <th>IP</th>
                      <th>Remote</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevices.length ? filteredDevices.map((device) => (
                      <tr
                        key={device.stableIdentifier}
                        className={selectedDevice?.stableIdentifier === device.stableIdentifier ? "active" : ""}
                        onClick={() => {
                          setSelectedDeviceId(device.stableIdentifier);
                          setDeviceModalOpen(true);
                        }}
                      >
                        <td>
                          <strong>{device.nickname || device.stableIdentifier}</strong>
                          <small>{device.stableIdentifier}</small>
                        </td>
                        <td>{device.role || "Needs review"}</td>
                        <td>{device.scope || "Needs review"}</td>
                        <td>{device.ipAddress || "n/a"}</td>
                        <td>
                          <RemoteLaunchButton device={device} compact />
                        </td>
                        <td>{device.confidence || "Needs review"}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="6">No devices match the current filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {deviceModalOpen && activeDraft ? (
            <DeviceModal
              device={activeDraft}
              readOnly={readOnly}
              canSave={canSave}
              saving={saving}
              deleting={deleting}
              onClose={() => setDeviceModalOpen(false)}
              onDelete={requestDelete}
              onReset={() => setDraft({ ...selectedDevice })}
              onSave={() => onSaveDevice(activeDraft.stableIdentifier, activeDraft)}
              onFieldChange={setField}
              onRemoteFieldChange={setRemoteField}
            />
          ) : null}

          <section className="fabric-files">
            <h3>Registry Files</h3>
            {(registry.files || []).map((file) => (
              <button className={`resource-row fabric-file-row ${file.exists ? "" : "missing"}`} key={file.relativePath} type="button" onClick={() => file.exists && onOpenPath(file.relativePath)} disabled={!localControlsEnabled || !file.exists}>
                <span className="resource-meta">
                  <FileText size={16} />
                  <span>
                    <strong>{file.relativePath}</strong>
                    <small>{file.exists ? `${Math.round(file.size / 1024)} KB · ${formatTime(file.modified)}` : "Missing"}</small>
                  </span>
                </span>
                <ExternalLink size={15} />
              </button>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}

function DeviceModal({ device, readOnly, canSave, saving, deleting, onClose, onDelete, onReset, onSave, onFieldChange, onRemoteFieldChange }) {
  const remoteAccess = normalizeRemoteAccess(device);
  return (
    <div className="modal-backdrop fabric-device-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal fabric-device-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-device-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Fabric Device</p>
            <h2 id="fabric-device-title">{device.nickname || device.stableIdentifier}</h2>
            <small>{device.stableIdentifier}</small>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close device details">
            <X size={18} />
          </button>
        </div>

        <div className="fabric-remote-strip">
          <div>
            <strong>RustDesk Remote Access</strong>
            <span>{remoteAccess.rustdeskId ? `${formatRustDeskId(remoteAccess.rustdeskId)} via ${remoteAccess.rustdeskServer || "rustdesk.ridgepath.io"}` : "No RustDesk ID is registered for this device."}</span>
          </div>
          <RemoteLaunchButton device={device} />
        </div>

        <div className="fabric-form fabric-modal-form">
          <label>
            <span>Nickname</span>
            <input value={device.nickname || ""} onChange={(event) => onFieldChange("nickname", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>Current name / DNS</span>
            <input value={device.currentName || ""} onChange={(event) => onFieldChange("currentName", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>IP address</span>
            <input value={device.ipAddress || ""} onChange={(event) => onFieldChange("ipAddress", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>MAC</span>
            <input value={device.mac || ""} onChange={(event) => onFieldChange("mac", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>Role</span>
            <input value={device.role || ""} onChange={(event) => onFieldChange("role", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>Scope</span>
            <input value={device.scope || ""} onChange={(event) => onFieldChange("scope", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>Confidence</span>
            <select value={device.confidence || ""} onChange={(event) => onFieldChange("confidence", event.target.value)} disabled={readOnly}>
              <option value="">Needs review</option>
              <option>confirmed</option>
              <option>observed</option>
              <option>inferred</option>
              <option>proposed</option>
              <option>confirmed from copied Atlas topology report</option>
              <option>observed; nickname proposed</option>
              <option>observed; nickname inferred from DNS</option>
            </select>
          </label>
          <label className="fabric-notes">
            <span>Notes</span>
            <textarea value={device.notes || ""} onChange={(event) => onFieldChange("notes", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>RustDesk ID</span>
            <input value={remoteAccess.rustdeskId || ""} onChange={(event) => onRemoteFieldChange("rustdeskId", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>RustDesk server</span>
            <input value={remoteAccess.rustdeskServer || "rustdesk.ridgepath.io"} onChange={(event) => onRemoteFieldChange("rustdeskServer", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>Relay server</span>
            <input value={remoteAccess.relayServer || ""} onChange={(event) => onRemoteFieldChange("relayServer", event.target.value)} disabled={readOnly} />
          </label>
          <label>
            <span>Server key</span>
            <input value={remoteAccess.serverKey || ""} onChange={(event) => onRemoteFieldChange("serverKey", event.target.value)} disabled={readOnly} placeholder="Optional; do not store passwords" />
          </label>
          <label className="fabric-notes">
            <span>Remote notes</span>
            <textarea value={remoteAccess.notes || ""} onChange={(event) => onRemoteFieldChange("notes", event.target.value)} disabled={readOnly} />
          </label>
        </div>

        <div className="modal-actions fabric-editor-actions">
          <button className="secondary-action danger-secondary" type="button" disabled={readOnly || deleting || saving} onClick={onDelete}>
            {deleting ? "Removing..." : "Remove"}
          </button>
          <button className="secondary-action" type="button" disabled={!canSave || saving} onClick={onReset}>
            Reset
          </button>
          <button className="secondary-action primary-secondary" type="button" disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving..." : "Save Device"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RemoteLaunchButton({ device, compact = false }) {
  const remoteAccess = normalizeRemoteAccess(device);
  const href = buildRustDeskHref(remoteAccess);
  if (!href) {
    return compact ? <span className="fabric-remote-empty">Not set</span> : (
      <button className="secondary-action" type="button" disabled>
        <ExternalLink size={15} />
        Launch RustDesk
      </button>
    );
  }
  return (
    <a
      className={compact ? "fabric-remote-link compact" : "secondary-action fabric-remote-launch"}
      href={href}
      onClick={(event) => event.stopPropagation()}
      title={`Launch RustDesk for ${device.nickname || device.stableIdentifier}`}
      aria-label={`Launch RustDesk for ${device.nickname || device.stableIdentifier}`}
    >
      <ExternalLink size={15} />
      {compact ? "Connect" : "Launch RustDesk"}
    </a>
  );
}

function normalizeRemoteAccess(device = {}) {
  const remoteAccess = device.remoteAccess || {};
  return {
    provider: remoteAccess.provider || (remoteAccess.rustdeskId ? "rustdesk" : ""),
    rustdeskId: String(remoteAccess.rustdeskId || "").replace(/\s+/g, "").trim(),
    rustdeskServer: String(remoteAccess.rustdeskServer || "rustdesk.ridgepath.io").trim(),
    relayServer: String(remoteAccess.relayServer || "").trim(),
    serverKey: String(remoteAccess.serverKey || "").trim(),
    notes: String(remoteAccess.notes || "").trim(),
  };
}

function buildRustDeskHref(remoteAccess) {
  const id = String(remoteAccess.rustdeskId || "").replace(/\s+/g, "");
  if (!id) return "";
  const rawServer = String(remoteAccess.rustdeskServer || "rustdesk.ridgepath.io").trim();
  const server = rawServer.includes(":") ? rawServer : `${rawServer}:21117`;
  const key = remoteAccess.serverKey ? `?key=${encodeURIComponent(remoteAccess.serverKey)}` : "";
  return `rustdesk://${id}@${server}${key}`;
}

function formatRustDeskId(value) {
  return String(value || "").replace(/\s+/g, "").replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

function FabricInfo({ label, value, tone }) {
  return (
    <div className="info">
      <small>{label}</small>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function FabricEmptyPanel({ message }) {
  return <div className="pm-empty"><strong>Needs Manual Review</strong><span>{message}</span></div>;
}

function buildMachineInventoryPrompt(registry) {
  const currentHost = registry?.editSession?.currentHost || registry?.editSession?.active?.host || "the current Windows host";
  const knownDevices = (registry?.devices || [])
    .map((device) => `- ${device.nickname || device.stableIdentifier}: ${device.stableIdentifier}${device.ipAddress ? ` (${device.ipAddress})` : ""} - ${device.role || "Needs review"}`)
    .join("\n") || "- No current device records were loaded in Forge.";

  return `You are Codex acting as an infrastructure automation topology auditor for Ridge Fabric.

Goal: create a safe, repo-agnostic machine topology snapshot for the Windows computer I am currently running Codex on, then produce everything needed to add or update this machine in the Ridge Fabric registry.

Important safety rules:
- Do not print, copy, summarize, or commit secret values.
- Do not read credential files unless needed to identify presence, path, key names, or file purpose.
- For config files, report only path, existence, size, timestamp, and non-secret key names or presence booleans.
- Do not include passwords, tokens, cookies, private keys, connection strings, API keys, storage-state JSON, browser session files, or .env values.
- For RustDesk, record only the device ID, configured ID/relay server host names, and whether a server key is configured. Do not print unattended-access passwords.
- Do not restart services, modify scheduled tasks, install software, delete files, or make destructive system changes.
- Prefer read-only inspection commands.
- If a command requires elevation, note that it was skipped or requires admin rights.

Registry source of truth:
- Root: C:\\Development\\Shared\\ridge-fabric-registry
- Device records: C:\\Development\\Shared\\ridge-fabric-registry\\devices\\*.json
- Generated summary: C:\\Development\\Shared\\ridge-fabric-registry\\devices.md
- Machine topology report target: C:\\Development\\Shared\\ridge-fabric-registry\\devices\\<stableIdentifier>-automation-topology.md
- Current Forge-observed host: ${currentHost}

Existing known devices from Forge:
${knownDevices}

Use PowerShell on this Windows host. Prefer read-only commands and do not rename devices. Collect enough evidence to identify this machine, its role, local network identity, automation dependencies, installed tooling, safe operating boundaries, and co-dependence on other machines.

Run and summarize these core Windows checks:

\`\`\`powershell
Get-ComputerInfo
Get-CimInstance Win32_ComputerSystem
Get-CimInstance Win32_BIOS
Get-CimInstance Win32_OperatingSystem
Get-CimInstance Win32_Processor
Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum
Get-CimInstance Win32_LogicalDisk
Get-Volume
Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled }
Get-NetIPConfiguration
Get-NetAdapter | Sort-Object Name
Get-NetTCPConnection | Where-Object { $_.State -eq 'Listen' } | Sort-Object LocalPort
Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' } | Select-Object TaskName,TaskPath,State,Author
Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' } | ForEach-Object { $_ | Select-Object TaskName,TaskPath,State; $_.Triggers; $_.Actions }
Get-Service | Where-Object { $_.Status -eq 'Running' } | Select-Object Name,DisplayName,Status,StartType
Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate
Get-OdbcDriver
Get-ExecutionPolicy -List
Get-NetFirewallProfile
Get-LocalUser
Get-LocalGroup
Get-LocalGroupMember Administrators
arp -a
ipconfig /all
hostname
whoami
whoami /groups
\`\`\`

Detect versions and paths for common development and automation tooling when present:

\`\`\`powershell
$commands = 'python','py','pip','node','npm','npx','pnpm','yarn','git','gh','pwsh','powershell','winget','choco','scoop','docker','dotnet','java','go','rustc','cargo','ruby','php','code'
foreach ($command in $commands) {
  $cmd = Get-Command $command -ErrorAction SilentlyContinue
  if ($cmd) {
    [pscustomobject]@{ Command = $command; Path = $cmd.Source; Version = (& $command --version 2>$null | Select-Object -First 1) }
  }
}
npm list -g --depth=0 2>$null
pip list 2>$null
docker context ls 2>$null
docker ps -a 2>$null
docker images 2>$null
dotnet --list-sdks 2>$null
\`\`\`

Also inspect likely local automation and sync context if those paths exist:

\`\`\`powershell
Test-Path 'C:\\Development\\Shared\\ridge-fabric-registry'
Test-Path 'C:\\Development\\Shared\\ridgepath-forge'
Test-Path 'C:\\Development\\Projects'
Test-Path 'C:\\Development\\Shared'
Test-Path 'C:\\Dev'
Test-Path "$env:USERPROFILE\\.codex"
Test-Path "$env:USERPROFILE\\.agents"
Get-ChildItem 'C:\\Development\\Shared' -Directory -ErrorAction SilentlyContinue
Get-ChildItem 'C:\\Development\\Projects' -Directory -ErrorAction SilentlyContinue | Select-Object -First 80 Name,FullName
Get-ChildItem 'C:\\Development\\Shared' -Recurse -File -Include package.json,*.ps1,*.cmd,*.bat,*.md,*.json -ErrorAction SilentlyContinue | Select-Object -First 300 FullName,Length,LastWriteTime
Get-ChildItem 'C:\\Development\\Projects' -Recurse -File -Include package.json,*.ps1,*.cmd,*.bat,*.md,*.json -ErrorAction SilentlyContinue | Select-Object -First 300 FullName,Length,LastWriteTime
\`\`\`

If inside a Git repository or a likely project directory, document source-control context without changing anything:

\`\`\`powershell
git rev-parse --show-toplevel 2>$null
git status --short 2>$null
git branch --show-current 2>$null
git rev-parse HEAD 2>$null
git remote -v 2>$null
\`\`\`

Deliverables:

1. Create or update a safe Markdown report named \`automation-topology.md\`.
- If the Ridge Fabric registry exists and the machine identity is clear, place the durable machine report at \`C:\\Development\\Shared\\ridge-fabric-registry\\devices\\<stableIdentifier>-automation-topology.md\`.
- If the registry does not exist or the machine identity is ambiguous, create \`automation-topology.md\` in the current working directory and explain why.
- Use tables where helpful.
- Scan the report for common secret patterns before finalizing and state whether anything suspicious was found.

The report should include these sections:
- Purpose
- Host identity
- Storage
- Network and remote access posture
- Source control and workspace context
- Runtime toolchain
- Language/project environments
- Installed applications
- Running services
- Scheduled jobs / automation runners
- Browser and UI automation
- Databases and local data services
- Security posture and safe boundaries
- Current automation workloads
- Known gaps and follow-ups
- Inventory commands used

2. A concise Ridge Fabric summary of this computer:
- proposed Ridge Fabric nickname
- stable identifier candidates, with the recommended stableIdentifier
- host/DNS names
- IP/MAC addresses
- role
- scope
- confidence
- dependencies on other local machines
- automation workloads, scheduled tasks, services, listeners, and sync assumptions

3. A proposed JSON record for \`devices/<stableIdentifier>.json\` using this shape:

\`\`\`json
{
  "stableIdentifier": "",
  "nickname": "",
  "currentName": "",
  "ipAddress": "",
  "mac": "",
  "role": "",
  "scope": "",
  "confidence": "",
  "notes": "",
  "remoteAccess": {
    "provider": "rustdesk",
    "rustdeskId": "",
    "rustdeskServer": "rustdesk.ridgepath.io",
    "relayServer": "",
    "serverKey": "",
    "notes": ""
  },
  "lastObservedAt": "",
  "sources": []
}
\`\`\`

4. Any questions or manual-review gaps that should be resolved before adding this device to Ridge Fabric.

If the registry exists locally and the machine is clearly identified, update the JSON record, write the machine topology Markdown report, and regenerate the generated Markdown summary using the existing Ridge Fabric repository/Forge patterns. If anything is ambiguous, stop after the report and proposed record, then explain what needs manual review.`;
}

async function copyTextToClipboard(content) {
  try {
    await navigator.clipboard.writeText(content);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function formatTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
