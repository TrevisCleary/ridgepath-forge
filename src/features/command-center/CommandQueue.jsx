import React, { useMemo, useState } from "react";
import { Check, Clock, PlayCircle, ShieldCheck, X } from "lucide-react";
import "./CommandQueue.css";

const COMMAND_TYPES = [
  { value: "project-review", label: "Project review" },
  { value: "fabric-inventory", label: "Fabric inventory" },
  { value: "fabric-registry-sync", label: "Fabric sync" },
  { value: "fabric-device-update", label: "Fabric device update" },
  { value: "fabric-device-remove", label: "Fabric device remove" },
  { value: "start-project", label: "Start project" },
  { value: "stop-project", label: "Stop project" },
  { value: "restart-project", label: "Restart project" },
  { value: "take-over-project", label: "Take over project" },
  { value: "git-sync", label: "Git sync" },
  { value: "initialize-project-management", label: "Initialize PM" },
  { value: "create-portfolio-draft", label: "Portfolio draft" },
  { value: "register-project", label: "Register project" },
  { value: "update-project-description", label: "Update description" },
  { value: "rustdesk-connect", label: "RustDesk connection" },
  { value: "open-path", label: "Open local path" },
];

export function CommandQueue({
  commands,
  runners,
  projects,
  busy,
  onCreateCommand,
  onUpdateCommand,
}) {
  const activeRunners = useMemo(() => runners.filter((runner) => runner.paired), [runners]);
  const [draft, setDraft] = useState({
    runnerId: activeRunners[0]?.id || runners[0]?.id || "",
    commandType: "project-review",
    projectId: "",
    target: "",
    reason: "",
  });

  const visibleCommands = commands.slice(0, 25);
  const canSubmit = draft.commandType && draft.reason.trim();

  const createCommand = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    onCreateCommand({
      ...draft,
      target: draft.target.trim(),
      reason: draft.reason.trim(),
      requestedBy: "owner",
    }).then((command) => {
      if (!command) return;
      setDraft((current) => ({ ...current, target: "", reason: "" }));
    });
  };

  return (
    <section className="command-queue" aria-labelledby="command-queue-title">
      <div className="overview-hero">
        <div>
          <p className="eyebrow">Local Controller</p>
          <h2 id="command-queue-title">Command Queue</h2>
          <p>Approval and audit records for local runner actions. Execution is intentionally disabled in this phase.</p>
        </div>
        <div className="queue-runner-summary">
          <span>{activeRunners.length} active</span>
          <strong>{runners.length} known runners</strong>
        </div>
      </div>

      <form className="command-request-form" onSubmit={createCommand}>
        <label>
          <span>Runner</span>
          <select value={draft.runnerId} onChange={(event) => setDraft((current) => ({ ...current, runnerId: event.target.value }))}>
            <option value="">Any paired runner</option>
            {runners.map((runner) => (
              <option key={runner.id} value={runner.id}>{runner.displayName || runner.id}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Command</span>
          <select value={draft.commandType} onChange={(event) => setDraft((current) => ({ ...current, commandType: event.target.value }))}>
            {COMMAND_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label>
          <span>Project</span>
          <select value={draft.projectId} onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}>
            <option value="">No project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          <span>Target</span>
          <input value={draft.target} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))} placeholder="Path, service, device, or note" />
        </label>
        <label className="command-reason">
          <span>Reason</span>
          <textarea value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Why this local action should be queued." />
        </label>
        <button className="secondary-action primary-secondary" type="submit" disabled={!canSubmit || busy === "command-create"}>
          <PlayCircle size={15} />
          {busy === "command-create" ? "Queueing..." : "Queue Request"}
        </button>
      </form>

      <div className="command-queue-list">
        {visibleCommands.length ? visibleCommands.map((command) => (
          <article className="command-request-card" key={command.id}>
            <div>
              <div className="command-request-title">
                <ShieldCheck size={16} />
                <strong>{labelForCommand(command.commandType)}</strong>
                <span>{command.target || command.projectId || "No target"}</span>
              </div>
              <p>{command.reason || "No reason recorded."}</p>
              <div className="command-request-meta">
                <span className={`status-pill ${command.approvalStatus}`}>{formatStatus(command.approvalStatus)}</span>
                <span className={`status-pill ${command.executionStatus}`}>{formatStatus(command.executionStatus)}</span>
                <span>{runnerLabel(command, runners)}</span>
                <span>{formatTime(command.updatedAt || command.createdAt)}</span>
              </div>
            </div>
            <div className="command-request-actions">
              {command.approvalStatus === "pending" ? (
                <>
                  <button type="button" className="secondary-action primary-secondary" disabled={busy === command.id} onClick={() => onUpdateCommand(command.id, { approvalStatus: "approved" })}>
                    <Check size={15} />
                    Approve
                  </button>
                  <button type="button" className="secondary-action" disabled={busy === command.id} onClick={() => onUpdateCommand(command.id, { approvalStatus: "cancelled", executionStatus: "cancelled" })}>
                    <X size={15} />
                    Cancel
                  </button>
                </>
              ) : (
                <span><Clock size={15} /> Execution disabled</span>
              )}
            </div>
          </article>
        )) : (
          <div className="empty compact-empty">No command requests have been queued yet.</div>
        )}
      </div>
    </section>
  );
}

function labelForCommand(value) {
  return COMMAND_TYPES.find((type) => type.value === value)?.label || formatStatus(value);
}

function runnerLabel(command, runners) {
  if (!command.runnerId) return "Any paired runner";
  return runners.find((runner) => runner.id === command.runnerId)?.displayName || command.runnerId;
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
