import React, { useMemo, useState } from "react";
import { Check, ClipboardCheck, Clock, PlayCircle, ShieldCheck, X } from "lucide-react";
import "./CommandQueue.css";

const COMMAND_TYPES = [
  { value: "project-catalog-sync", label: "Project catalog sync" },
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
  events = [],
  executionPackets = [],
  executionPacketEvents = [],
  runners,
  projects,
  busy,
  onCreateCommand,
  onUpdateCommand,
}) {
  const activeRunners = useMemo(() => runners.filter((runner) => runner.paired), [runners]);
  const [copiedPacketId, setCopiedPacketId] = useState("");
  const eventsByCommand = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const current = map.get(event.commandId) || [];
      current.push(event);
      map.set(event.commandId, current);
    }
    return map;
  }, [events]);
  const eventsByPacket = useMemo(() => {
    const map = new Map();
    for (const event of executionPacketEvents) {
      const current = map.get(event.packetId) || [];
      current.push(event);
      map.set(event.packetId, current);
    }
    return map;
  }, [executionPacketEvents]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const [draft, setDraft] = useState({
    runnerId: activeRunners[0]?.id || runners[0]?.id || "",
    commandType: "project-review",
    projectId: "",
    target: "",
    reason: "",
  });

  const visibleCommands = commands.slice(0, 25);
  const visiblePackets = executionPackets.slice(0, 12);
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
  const queueQuickCommand = (commandType, target, reason) => onCreateCommand({
    runnerId: activeRunners[0]?.id || "",
    commandType,
    target,
    reason,
    requestedBy: "owner",
  });
  const copyPacketPrompt = async (packet) => {
    await navigator.clipboard.writeText(buildExecutionPrompt(packet, projectById.get(packet.projectId)));
    setCopiedPacketId(packet.id);
    window.setTimeout(() => setCopiedPacketId((current) => current === packet.id ? "" : current), 1800);
  };

  return (
    <section className="command-queue" aria-labelledby="command-queue-title">
      <div className="overview-hero">
        <div>
          <p className="eyebrow">Local Controller</p>
          <h2 id="command-queue-title">Command Queue</h2>
          <p>Owner-approved local actions are claimed by the paired runner, executed through the local Forge API, and written back with audit events.</p>
        </div>
        <div className="queue-runner-summary">
          <span>{activeRunners.length} active</span>
          <strong>{runners.length} known runners</strong>
        </div>
      </div>

      <div className="runtime-quick-actions" aria-label="Queue sync actions">
        <button type="button" className="secondary-action" disabled={busy === "command-create"} onClick={() => queueQuickCommand("project-catalog-sync", "Project catalog", "Owner requested hosted project catalog refresh from the paired local runner.")}>
          <PlayCircle size={15} />
          Sync Projects
        </button>
        <button type="button" className="secondary-action" disabled={busy === "command-create"} onClick={() => queueQuickCommand("fabric-registry-sync", "Ridge Fabric registry", "Owner requested hosted Ridge Fabric snapshot refresh from the paired local runner.")}>
          <PlayCircle size={15} />
          Sync Fabric
        </button>
        <button type="button" className="secondary-action" disabled={busy === "command-create"} onClick={() => queueQuickCommand("operations-library-sync", "Operations Library validation snapshot", "Owner requested hosted Operations Library validation refresh from the paired local runner.")}>
          <PlayCircle size={15} />
          Sync Ops Library
        </button>
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

      <section className="execution-packet-panel" aria-labelledby="execution-packet-title">
        <div className="runtime-section-heading">
          <span>
            <ClipboardCheck size={17} />
            <strong id="execution-packet-title">Execution Packets</strong>
          </span>
          <em>{visiblePackets.length} visible</em>
        </div>
        <div className="command-queue-list">
          {visiblePackets.length ? visiblePackets.map((packet) => {
            const packetEvents = eventsByPacket.get(packet.id) || [];
            const project = projectById.get(packet.projectId);
            return (
              <article className="command-request-card execution-packet-card" key={packet.id}>
                <div>
                  <div className="command-request-title">
                    <ClipboardCheck size={16} />
                    <strong>{packet.objective || "Approved execution packet"}</strong>
                    <span>{project?.name || packet.projectId || "Unassigned project"}</span>
                  </div>
                  <div className="command-request-meta">
                    <span className={`status-pill ${packet.status}`}>{formatStatus(packet.status)}</span>
                    <span>{formatStatus(packet.branchPolicy)}</span>
                    {packet.branchName ? <span>{packet.branchName}</span> : null}
                    {packet.claimedByRunnerId ? <span>Claimed by {packet.claimedByRunnerId}</span> : null}
                    <span>{formatTime(packet.updatedAt || packet.createdAt)}</span>
                  </div>
                  {packet.validationResult ? (
                    <div className="command-request-result">
                      <strong>Validation</strong>
                      <code>{packet.validationResult}</code>
                    </div>
                  ) : null}
                  {packet.error ? (
                    <div className="command-request-error">
                      <strong>Error</strong>
                      <span>{packet.error}</span>
                    </div>
                  ) : null}
                  {packetEvents.length ? (
                    <div className="command-event-list">
                      <strong>Audit</strong>
                      {packetEvents.slice(0, 4).map((event) => (
                        <span key={event.id}>
                          {formatStatus(event.eventType)} by {event.actor || "system"} · {formatTime(event.createdAt)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="command-request-actions">
                  <button type="button" className="secondary-action" onClick={() => copyPacketPrompt(packet)}>
                    <ClipboardCheck size={15} />
                    {copiedPacketId === packet.id ? "Copied Prompt" : "Copy Prompt"}
                  </button>
                </div>
              </article>
            );
          }) : (
            <div className="empty compact-empty">No approved execution packets yet. Approve a proposal to create one.</div>
          )}
        </div>
      </section>

      <div className="command-queue-list">
        {visibleCommands.length ? visibleCommands.map((command) => {
          const commandEvents = eventsByCommand.get(command.id) || [];
          const latestEvent = commandEvents[0];
          return (
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
              {command.error ? (
                <div className="command-request-error">
                  <strong>Error</strong>
                  <span>{command.error}</span>
                </div>
              ) : null}
              {hasResult(command) ? (
                <div className="command-request-result">
                  <strong>Result</strong>
                  <code>{resultSummary(command.result)}</code>
                </div>
              ) : null}
              {commandEvents.length ? (
                <div className="command-event-list">
                  <strong>Audit</strong>
                  {commandEvents.slice(0, 4).map((event) => (
                    <span key={event.id}>
                      {formatStatus(event.eventType)} by {event.actor || "system"} · {formatTime(event.createdAt)}
                    </span>
                  ))}
                  {latestEvent?.detail?.execution ? <em>{latestEvent.detail.execution}</em> : null}
                </div>
              ) : null}
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
              ) : ["queued", "claimed", "running"].includes(command.executionStatus) ? (
                <span><Clock size={15} /> Awaiting runner</span>
              ) : (
                <span><Clock size={15} /> {formatStatus(command.executionStatus)}</span>
              )}
            </div>
          </article>
        ); }) : (
          <div className="empty compact-empty">No command requests have been queued yet.</div>
        )}
      </div>
    </section>
  );
}

function buildExecutionPrompt(packet, project) {
  const constraints = packet.constraints?.length
    ? packet.constraints.map((item) => `- ${item}`).join("\n")
    : "- No additional constraints were captured.";
  return [
    "You are Codex acting on an owner-approved RidgePath Forge execution packet.",
    "",
    `Packet ID: ${packet.id}`,
    `Proposal ID: ${packet.proposalId}`,
    `Project: ${project?.name || packet.projectId || "Unassigned project"}`,
    project?.path ? `Local path: ${project.path}` : "Local path: not available from the hosted catalog",
    `Branch policy: ${packet.branchPolicy || "feature-branch"}`,
    packet.branchName ? `Requested branch name: ${packet.branchName}` : "Requested branch name: create one that matches the objective",
    "",
    "Objective:",
    packet.objective || "No objective recorded.",
    "",
    "Constraints and owner direction:",
    constraints,
    "",
    "Execution rules:",
    "- Inspect the repository and current branch before editing.",
    "- Keep edits tightly scoped to the packet objective.",
    "- Run relevant validation before marking the packet complete.",
    "- Update the execution packet status and validation result in Forge/Neon when finished.",
  ].join("\n");
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

function hasResult(command) {
  return command.result && typeof command.result === "object" && Object.keys(command.result).length > 0;
}

function resultSummary(result) {
  if (!result || typeof result !== "object") return "";
  const payload = result.result && typeof result.result === "object" ? result.result : result;
  const summary = {
    commandType: result.commandType,
    completedBy: result.completedBy,
    completedAt: result.completedAt,
    projectCount: payload.projectCount,
    deviceCount: payload.deviceCount,
    validationStatus: payload.validationStatus,
    proposalCount: Array.isArray(payload.proposals) ? payload.proposals.length : undefined,
  };
  const entries = Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined && value !== ""));
  return JSON.stringify(Object.keys(entries).length ? entries : payload);
}

function formatTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
