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
  projects,
  storageStatus,
  busy,
  onUpdateProposal,
  onRunProjectReview,
}) {
  const [selectedStatus, setSelectedStatus] = useState("open");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [branchPolicies, setBranchPolicies] = useState({});
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
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
          <button className="secondary-action primary-secondary" type="button" disabled={!selectedProjectId || busy === "project-review"} onClick={() => onRunProjectReview(selectedProjectId)}>
            <Play size={15} />
            {busy === "project-review" ? "Reviewing..." : "Run Read-only Review"}
          </button>
        </div>
      </div>

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
