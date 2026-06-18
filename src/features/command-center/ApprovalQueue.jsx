import React, { useMemo, useState } from "react";
import { Check, ClipboardCheck, Clock, MessageSquareText, Play, ShieldAlert, X } from "lucide-react";

const STATUS_OPTIONS = [
  { status: "approved", decision: "approved", label: "Approve", icon: <Check size={15} /> },
  { status: "rejected", decision: "rejected", label: "Reject", icon: <X size={15} /> },
  { status: "deferred", decision: "deferred", label: "Defer", icon: <Clock size={15} /> },
  { status: "needs-evidence", decision: "needs-evidence", label: "More Evidence", icon: <ShieldAlert size={15} /> },
];

export function ApprovalQueue({
  proposals,
  executionPackets = [],
  executionPacketEvents = [],
  projects,
  storageStatus,
  busy,
  localRunnerPaired,
  onUpdateProposal,
  onRunProjectReview,
}) {
  const [selectedStatus, setSelectedStatus] = useState("open");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [branchPolicies, setBranchPolicies] = useState({});
  const [copiedPacketId, setCopiedPacketId] = useState("");
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const packetByProposalId = useMemo(
    () => new Map(executionPackets.map((packet) => [packet.proposalId, packet])),
    [executionPackets],
  );
  const latestEventByPacketId = useMemo(() => {
    const map = new Map();
    for (const event of executionPacketEvents) {
      if (!map.has(event.packetId)) map.set(event.packetId, event);
    }
    return map;
  }, [executionPacketEvents]);
  const visible = proposals.filter((proposal) => {
    if (selectedStatus === "open") return ["proposed", "needs-evidence", "deferred"].includes(proposal.status);
    if (selectedStatus === "all") return true;
    return proposal.status === selectedStatus;
  });

  return (
    <section className="approval-workspace" aria-labelledby="approval-queue-title">
      <div className="overview-hero">
        <div>
          <p className="eyebrow">Owner Approval</p>
          <h2 id="approval-queue-title">Approval Queue</h2>
          <p>{storageStatus?.storage === "neon" ? "Neon-backed coordination queue" : "Local JSON fallback queue"}</p>
        </div>
        <div className="approval-runner">
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className="secondary-action primary-secondary" type="button" disabled={!localRunnerPaired || !selectedProjectId || busy === "project-review"} onClick={() => onRunProjectReview(selectedProjectId)} title={localRunnerPaired ? "Run local read-only review" : "Requires a paired local runner"}>
            <Play size={15} />
            {busy === "project-review" ? "Reviewing..." : "Run Read-only Review"}
          </button>
        </div>
      </div>
      {!localRunnerPaired ? (
        <div className="hosted-inline-note">Read-only project scans require a paired local runner. Proposal feedback and approval actions remain available.</div>
      ) : null}

      <div className="approval-toolbar">
        {["open", "approved", "rejected", "deferred", "needs-evidence", "all"].map((status) => (
          <button key={status} className={selectedStatus === status ? "active" : ""} type="button" onClick={() => setSelectedStatus(status)}>
            {formatStatus(status)}
          </button>
        ))}
      </div>

      <div className="approval-list">
        {visible.length ? visible.map((proposal) => {
          const project = projectById.get(proposal.projectId);
          const packet = packetByProposalId.get(proposal.id);
          const latestPacketEvent = packet ? latestEventByPacketId.get(packet.id) : null;
          const feedback = feedbackDrafts[proposal.id] ?? proposal.ownerNotes ?? "";
          const branchPolicy = branchPolicies[proposal.id] ?? proposal.targetBranchPolicy ?? "feature-branch";
          const submitDecision = (option) => onUpdateProposal(proposal.id, {
            status: option.status,
            decision: option.decision,
            ownerNotes: feedback,
            comment: feedback,
            targetBranchPolicy: branchPolicy,
          });
          const saveFeedback = () => onUpdateProposal(proposal.id, {
            decision: "feedback",
            ownerNotes: feedback,
            comment: feedback,
            targetBranchPolicy: branchPolicy,
          });
          const copyPacketPrompt = async () => {
            if (!packet) return;
            await navigator.clipboard.writeText(buildExecutionPrompt(packet, project));
            setCopiedPacketId(packet.id);
            window.setTimeout(() => setCopiedPacketId((current) => current === packet.id ? "" : current), 1800);
          };
          return (
            <article className="approval-card" key={proposal.id}>
              <div className="approval-card-main">
                <div className="approval-card-title">
                  <ClipboardCheck size={17} />
                  <span>
                    <strong>{proposal.title}</strong>
                    <small>{project?.name || proposal.projectId || "Unassigned project"} · {proposal.suggestedExecutor} · {branchPolicy}</small>
                  </span>
                </div>
                <p>{proposal.summary || "No summary provided."}</p>
                {proposal.whyNow ? <p className="approval-why">{proposal.whyNow}</p> : null}
                <div className="approval-meta">
                  <span className={`status-pill ${proposal.status}`}>{formatStatus(proposal.status)}</span>
                  {proposal.status === "approved" ? (
                    <span className={`status-pill ${packet ? packet.status : "pending"}`}>
                      Execution packet: {packet ? `${formatStatus(packet.status)} · ${formatStatus(packet.branchPolicy)}` : "pending"}
                    </span>
                  ) : null}
                  {packet?.claimedByRunnerId ? <span>Claimed by: {packet.claimedByRunnerId}</span> : null}
                  {latestPacketEvent ? <span>Packet event: {formatStatus(latestPacketEvent.eventType)}</span> : null}
                  {proposal.duplicateCount > 1 ? <span>{proposal.duplicateCount} matching reviews compacted</span> : null}
                  <span>Risk: {proposal.risk}</span>
                  <span>Confidence: {proposal.confidence}</span>
                  <span>{formatTime(proposal.updatedAt || proposal.createdAt)}</span>
                </div>
                {proposal.validationPlan?.length ? (
                  <div className="approval-evidence">
                    <strong>Validation</strong>
                    <ul>
                      {proposal.validationPlan.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="approval-feedback">
                  <label>
                    <span>Owner feedback / direction</span>
                    <textarea
                      value={feedback}
                      onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [proposal.id]: event.target.value }))}
                      placeholder="Add context, constraints, priorities, or approval instructions."
                    />
                  </label>
                  <label>
                    <span>Approved branch target</span>
                    <select value={branchPolicy} onChange={(event) => setBranchPolicies((current) => ({ ...current, [proposal.id]: event.target.value }))}>
                      <option value="feature-branch">Create feature branch</option>
                      <option value="active-branch">Use active branch</option>
                      <option value="pull-request">Pull request only</option>
                      <option value="direct-main">Direct main update</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="approval-actions">
                <button type="button" disabled={busy === proposal.id || !feedback.trim()} onClick={saveFeedback}>
                  <MessageSquareText size={15} />
                  Save Feedback
                </button>
                {packet ? (
                  <button type="button" disabled={busy === proposal.id} onClick={copyPacketPrompt}>
                    <ClipboardCheck size={15} />
                    {copiedPacketId === packet.id ? "Copied Prompt" : "Copy Prompt"}
                  </button>
                ) : null}
                {STATUS_OPTIONS.map((option) => (
                  <button key={option.status} className={option.status === "approved" ? "primary-secondary" : ""} type="button" disabled={busy === proposal.id} onClick={() => submitDecision(option)}>
                    {option.icon}
                    {option.label}
                  </button>
                ))}
              </div>
            </article>
          );
        }) : (
          <div className="empty compact-empty">No proposals match the current filter. Run a read-only project review to seed the queue.</div>
        )}
      </div>
    </section>
  );
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

function buildExecutionPrompt(packet, project) {
  const constraints = packet.constraints?.length
    ? packet.constraints.map((item) => `- ${item}`).join("\n")
    : "- No additional constraints were captured.";
  const projectPath = project?.path || "";
  return [
    "You are Codex acting on an owner-approved RidgePath Forge execution packet.",
    "",
    "Treat the packet as approved scope, but inspect the repository before editing. Do not expand the scope beyond the packet constraints.",
    "",
    `Packet ID: ${packet.id}`,
    `Proposal ID: ${packet.proposalId}`,
    `Project: ${project?.name || packet.projectId || "Unassigned project"}`,
    `Project ID: ${packet.projectId || "unassigned"}`,
    projectPath ? `Local path: ${projectPath}` : "Local path: not available from the hosted catalog",
    `Branch policy: ${packet.branchPolicy}`,
    packet.branchName ? `Requested branch name: ${packet.branchName}` : "Requested branch name: create one that matches the branch policy and objective",
    "",
    "Objective:",
    packet.objective,
    "",
    "Constraints and owner direction:",
    constraints,
    "",
    "Implementation rules:",
    "- Verify the current branch and dirty worktree before editing.",
    "- Use a feature branch unless the packet branch policy explicitly allows the active branch or direct main.",
    "- Keep edits tightly scoped to the packet objective.",
    "- Run the relevant build, tests, or smoke checks.",
    "- Do not push to main or deploy unless the packet branch policy explicitly permits it.",
    "- When complete, update the execution packet status and validation result in Forge/Neon.",
  ].join("\n");
}
