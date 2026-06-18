import React from "react";
import { Activity, AlertTriangle, CheckCircle2, Database, FolderOpen, RefreshCw, Server, Settings } from "lucide-react";

export function SettingsWorkspace({
  root = "",
  ridgeFabric,
  operationsLibrary,
  commandCenterStatus,
  runners = [],
  projects = [],
  commands = [],
  executionPackets = [],
  hostedMode = false,
  localRunnerPaired = false,
  busy = "",
  onRefresh,
}) {
  const activeRunners = runners.filter((runner) => runner.paired);
  const openCommands = commands.filter((command) => ["pending", "approved"].includes(command.approvalStatus) && !["succeeded", "failed", "cancelled"].includes(command.executionStatus));
  const openPackets = executionPackets.filter((packet) => !["complete", "failed", "cancelled"].includes(packet.status));
  const storage = commandCenterStatus?.storage || (commandCenterStatus?.databaseConfigured ? "neon" : "local-json");
  const fabricEdit = ridgeFabric?.editSession || {};
  const operationsValidation = operationsLibrary?.validation || {};

  return (
    <section className="settings-workspace" aria-labelledby="settings-workspace-title">
      <div className="overview-hero settings-hero">
        <div>
          <p className="eyebrow">Control Plane</p>
          <h2 id="settings-workspace-title">Settings</h2>
          <p>{hostedMode ? "Hosted Ops reads shared Neon state and delegates privileged actions to paired local runners." : "Local Forge can read project roots, registries, and machine-local process state directly."}</p>
        </div>
        <div className="overview-hero-actions">
          <button className="secondary-action primary-secondary" type="button" disabled={busy === "settings-refresh"} onClick={onRefresh}>
            <RefreshCw size={16} />
            {busy === "settings-refresh" ? "Refreshing..." : "Refresh State"}
          </button>
        </div>
      </div>

      <div className="overview-metrics settings-metrics">
        <SettingsMetric label="Mode" value={hostedMode ? "Hosted Ops" : "Local"} detail={localRunnerPaired ? "Runner paired" : "Runner not paired"} tone={localRunnerPaired ? "success" : hostedMode ? "warning" : "success"} />
        <SettingsMetric label="Storage" value={storage} detail={commandCenterStatus?.databaseConfigured ? "Database configured" : "Local fallback"} tone={commandCenterStatus?.databaseConfigured ? "success" : "warning"} />
        <SettingsMetric label="Runners" value={`${activeRunners.length}/${runners.length}`} detail="Active / known" tone={activeRunners.length ? "success" : "warning"} />
        <SettingsMetric label="Queue" value={openCommands.length + openPackets.length} detail="Open commands and packets" tone={openCommands.length + openPackets.length ? "warning" : "success"} />
      </div>

      <div className="settings-grid">
        <section className="settings-panel">
          <div className="section-title compact">
            <Database size={17} />
            <h3>Hosted State</h3>
          </div>
          <SettingsRows rows={[
            ["Storage", storage],
            ["Database configured", yesNo(commandCenterStatus?.databaseConfigured)],
            ["Hosted API", yesNo(commandCenterStatus?.hosted)],
            ["Project catalog", `${commandCenterStatus?.projectCount ?? projects.length} projects`],
            ["Fabric devices", `${commandCenterStatus?.fabricDeviceCount ?? ridgeFabric?.counts?.devices ?? 0}`],
            ["Command requests", `${commandCenterStatus?.commandRequestCount ?? commands.length}`],
            ["Execution packets", `${commandCenterStatus?.executionPacketCount ?? executionPackets.length}`],
          ]} />
        </section>

        <section className="settings-panel">
          <div className="section-title compact">
            <FolderOpen size={17} />
            <h3>Roots</h3>
          </div>
          <SettingsRows rows={[
            ["Project root", root || "Not loaded"],
            ["Fabric root", ridgeFabric?.root || "Not synced"],
            ["Operations root", operationsValidation.configuredPath || operationsLibrary?.settings?.operationsLibrary?.root || "Not synced"],
            ["Fabric edit mode", fabricEdit.mode || "Unknown"],
            ["Fabric read-only", yesNo(fabricEdit.readOnly)],
            ["Fabric conflicts", `${fabricEdit.conflictCount ?? ridgeFabric?.conflicts?.length ?? 0}`],
          ]} />
        </section>

        <section className="settings-panel wide">
          <div className="section-title compact">
            <Server size={17} />
            <h3>Local Runners</h3>
          </div>
          <div className="runner-settings-list">
            {runners.length ? runners.map((runner) => (
              <article className={`runner-settings-card ${runner.paired ? "paired" : "stale"}`} key={runner.id}>
                <div>
                  <strong>{runner.displayName || runner.id}</strong>
                  <span>{runner.id}</span>
                  <span>{runner.hostname || "hostname unknown"}{runner.username ? ` / ${runner.username}` : ""}</span>
                </div>
                <div className="runner-settings-meta">
                  <span>{runner.status || "unknown"}</span>
                  <span>Last seen {formatTime(runner.lastSeenAt)}</span>
                  <span>{runner.workingDirectory || "working directory not reported"}</span>
                </div>
                <div className="runner-capabilities">
                  {(runner.capabilities || []).length ? runner.capabilities.map((capability) => <em key={capability}>{capability}</em>) : <em>No capabilities reported</em>}
                </div>
              </article>
            )) : <div className="empty compact-empty">No local runners have checked in yet.</div>}
          </div>
        </section>

        <section className="settings-panel wide">
          <div className="section-title compact">
            <Activity size={17} />
            <h3>Operational Guardrails</h3>
          </div>
          <div className="settings-guardrail-grid">
            <Guardrail label="Local actions" value={hostedMode ? "Runner-gated" : "Direct local API"} good={localRunnerPaired || !hostedMode} />
            <Guardrail label="Machine controls" value={localRunnerPaired || !hostedMode ? "Enabled" : "Disabled"} good={localRunnerPaired || !hostedMode} />
            <Guardrail label="Command approval" value="Required for queued local actions" good />
            <Guardrail label="Execution packets" value={`${openPackets.length} open`} good={!openPackets.length} />
            <Guardrail label="Operations Library" value={operationsValidation.status || "Not checked"} good={operationsValidation.status === "Valid"} />
            <Guardrail label="Fabric registry" value={fabricEdit.readOnly ? "Read-only" : "Writable"} good={!fabricEdit.conflictCount} />
          </div>
        </section>
      </div>
    </section>
  );
}

function SettingsMetric({ label, value, detail, tone = "" }) {
  return (
    <div className={`overview-metric settings-metric ${tone}`}>
      {tone === "warning" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      <em>{detail}</em>
    </div>
  );
}

function SettingsRows({ rows }) {
  return (
    <div className="settings-rows">
      {rows.map(([label, value]) => (
        <div className="status-line" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Guardrail({ label, value, good = false }) {
  return (
    <div className={`settings-guardrail ${good ? "good" : "attention"}`}>
      {good ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>
        <strong>{label}</strong>
        <em>{value}</em>
      </span>
    </div>
  );
}

function yesNo(value) {
  if (value === undefined || value === null) return "Unknown";
  return value ? "Yes" : "No";
}

function formatTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
