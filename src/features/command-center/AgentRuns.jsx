import React, { useMemo } from "react";
import { Activity, CheckCircle2, Database, XCircle } from "lucide-react";

export function AgentRuns({ runs, proposals, storageStatus }) {
  const proposalCounts = useMemo(() => {
    return proposals.reduce((counts, proposal) => {
      counts[proposal.status] = (counts[proposal.status] || 0) + 1;
      return counts;
    }, {});
  }, [proposals]);

  return (
    <section className="agent-runs-workspace" aria-labelledby="agent-runs-title">
      <div className="overview-hero">
        <div>
          <p className="eyebrow">Agent Operations</p>
          <h2 id="agent-runs-title">Agent Runs</h2>
          <p>{storageStatus?.storage === "neon" ? "Neon-backed audit trail" : "Local JSON fallback audit trail"}</p>
        </div>
        <div className="overview-metrics compact-row">
          <RunMetric label="Runs" value={runs.length} icon={<Activity size={17} />} />
          <RunMetric label="Proposed" value={proposalCounts.proposed || 0} icon={<Database size={17} />} />
          <RunMetric label="Approved" value={proposalCounts.approved || 0} icon={<CheckCircle2 size={17} />} />
        </div>
      </div>

      <div className="agent-run-list">
        {runs.length ? runs.map((run) => (
          <article className="agent-run-card" key={run.id}>
            <div className="agent-run-icon">
              {run.status === "completed" ? <CheckCircle2 size={17} /> : run.status === "failed" ? <XCircle size={17} /> : <Activity size={17} />}
            </div>
            <div>
              <strong>{run.agentType}</strong>
              <p>{run.summary || "No summary recorded."}</p>
              <div className="approval-meta">
                <span className={`status-pill ${run.status}`}>{run.status}</span>
                <span>{run.trigger}</span>
                <span>{run.machineId}</span>
                {run.projectId ? <span>{run.projectId}</span> : null}
                <span>{formatTime(run.startedAt)}</span>
              </div>
              {run.evidence?.length ? (
                <div className="approval-evidence">
                  <strong>Evidence</strong>
                  <ul>
                    {run.evidence.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </article>
        )) : (
          <div className="empty compact-empty">No agent runs yet. Run a read-only project review from the Approval Queue.</div>
        )}
      </div>
    </section>
  );
}

function RunMetric({ label, value, icon }) {
  return (
    <div className="overview-metric">
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function formatTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
