import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FolderOpen, RefreshCw } from "lucide-react";

export function OperationsLibraryWorkspace({
  status,
  hostedMode = false,
  localRunnerPaired = false,
  latestSyncCommand = null,
  busy = "",
  onRefresh,
  onSyncOperations,
}) {
  const validation = status?.validation || {};
  const requiredFolders = validation.requiredFolders || [];
  const requiredFiles = validation.requiredFiles || [];
  const templates = validation.templates || [];
  const prompts = validation.prompts || [];
  const folderCount = availableCount(requiredFolders);
  const fileCount = availableCount(requiredFiles);
  const templateCount = availableCount(templates);
  const promptCount = availableCount(prompts);
  const canSync = hostedMode && localRunnerPaired && typeof onSyncOperations === "function";
  const syncBusy = latestSyncCommand && ["queued", "claimed", "running"].includes(latestSyncCommand.executionStatus);

  return (
    <section className="operations-workspace" aria-labelledby="operations-library-title">
      <div className="overview-hero operations-hero">
        <div>
          <p className="eyebrow">Operations Contract</p>
          <h2 id="operations-library-title">Operations Library</h2>
          <p>{validation.configuredPath || status?.settings?.operationsLibrary?.root || "Operations Library path has not been synced."}</p>
        </div>
        <div className="overview-hero-actions">
          <button className="secondary-action" type="button" disabled={busy === "operations-refresh"} onClick={onRefresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
          {hostedMode ? (
            <button
              className="secondary-action primary-secondary"
              type="button"
              disabled={!canSync || syncBusy || busy === "command-create"}
              onClick={onSyncOperations}
              title={canSync ? "Queue an owner-approved read-only Operations Library sync" : "Requires a paired local runner"}
            >
              <RefreshCw size={16} />
              {syncBusy ? "Sync Queued" : "Sync Ops Library"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="overview-metrics operations-metrics">
        <OperationsMetric label="Validation" value={validation.status || "Not checked"} detail={status?.message || validation.message || "Current snapshot"} tone={validationTone(validation.status)} />
        <OperationsMetric label="Required Folders" value={`${folderCount}/${requiredFolders.length || 0}`} detail="Contract directories" />
        <OperationsMetric label="Required Files" value={`${fileCount}/${requiredFiles.length || 0}`} detail="Contract documents" />
        <OperationsMetric label="Templates" value={`${templateCount}/${templates.length || 0}`} detail={`${promptCount}/${prompts.length || 0} prompts`} />
      </div>

      <div className="operations-grid">
        <section className="operations-panel">
          <div className="section-title compact">
            <AlertTriangle size={17} />
            <h3>Attention</h3>
          </div>
          <OperationsMessages title="Issues" items={validation.issues || []} tone="warning" empty="No blocking contract issues." />
          <OperationsMessages title="Warnings" items={validation.warnings || []} tone="info" empty="No warnings recorded." />
          <div className="operations-sync-status">
            <strong>Latest Sync</strong>
            <span>{latestSyncCommand ? formatCommandStatus(latestSyncCommand) : status?.observedAt ? `Observed ${formatTime(status.observedAt)}` : "No sync command recorded."}</span>
          </div>
        </section>

        <section className="operations-panel">
          <div className="section-title compact">
            <FolderOpen size={17} />
            <h3>Contract Paths</h3>
          </div>
          <OperationsAvailability title="Required Folders" items={requiredFolders} />
          <OperationsAvailability title="Required Files" items={requiredFiles} />
        </section>

        <section className="operations-panel wide">
          <div className="section-title compact">
            <ClipboardList size={17} />
            <h3>Workflow Assets</h3>
          </div>
          <div className="operations-asset-grid">
            <OperationsAvailability title="Templates" items={templates} />
            <OperationsAvailability title="Prompts" items={prompts} />
          </div>
        </section>
      </div>
    </section>
  );
}

function OperationsMetric({ label, value, detail, tone = "" }) {
  return (
    <div className={`overview-metric operations-metric ${tone}`}>
      {tone === "danger" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      <em>{detail}</em>
    </div>
  );
}

function OperationsMessages({ title, items, tone, empty }) {
  return (
    <div className={`operations-message-list ${tone}`}>
      <strong>{title}</strong>
      {items.length ? items.map((item) => <span key={item}>{item}</span>) : <span>{empty}</span>}
    </div>
  );
}

function OperationsAvailability({ title, items }) {
  return (
    <div className="operations-availability">
      <strong>{title}</strong>
      {items.length ? items.map((item) => (
        <span key={`${item.key || item.relativePath}-${item.relativePath}`} className={item.exists ? "available" : "missing"}>
          {item.exists ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <em>{item.name ? `${item.name}: ` : ""}{item.relativePath}</em>
        </span>
      )) : <span className="missing"><AlertTriangle size={14} /><em>Needs manual review</em></span>}
    </div>
  );
}

function availableCount(items) {
  return items.filter((item) => item.exists).length;
}

function validationTone(status = "") {
  if (status === "Invalid") return "danger";
  if (status === "Warning") return "warning";
  return "success";
}

function formatCommandStatus(command) {
  if (!command) return "";
  const execution = formatStatus(command.executionStatus || "");
  if (command.executionStatus === "succeeded") return `Succeeded ${formatTime(command.finishedAt || command.updatedAt || command.createdAt)}`;
  if (command.executionStatus === "failed") return `Failed ${formatTime(command.finishedAt || command.updatedAt || command.createdAt)}: ${command.error || "no error detail"}`;
  return `${formatStatus(command.approvalStatus)} / ${execution}`;
}

function formatStatus(value) {
  return String(value || "").replaceAll("-", " ");
}

function formatTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
