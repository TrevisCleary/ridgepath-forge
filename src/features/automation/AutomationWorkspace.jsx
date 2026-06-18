import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock, Database, MonitorCog, PlayCircle, RefreshCw, Server, Workflow } from "lucide-react";

const QUICK_SYNC_COMMANDS = [
  {
    key: "project-catalog-sync",
    label: "Sync Projects",
    target: "Project catalog",
    reason: "Owner requested Automation workspace project catalog refresh from the paired local runner.",
  },
  {
    key: "fabric-registry-sync",
    label: "Sync Fabric",
    target: "Ridge Fabric registry",
    reason: "Owner requested Automation workspace Ridge Fabric refresh from the paired local runner.",
  },
  {
    key: "operations-library-sync",
    label: "Sync Ops Library",
    target: "Operations Library validation snapshot",
    reason: "Owner requested Automation workspace Operations Library refresh from the paired local runner.",
  },
];

export function AutomationWorkspace({
  projects = [],
  fabric = null,
  agentRuns = [],
  proposals = [],
  commands = [],
  runners = [],
  busy = "",
  localControlsEnabled = false,
  onOpenProject,
  onQueueCommand,
  onRunProjectReview,
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const activeRunners = useMemo(() => runners.filter((runner) => runner.paired), [runners]);
  const stats = useMemo(() => buildAutomationStats(projects, fabric, agentRuns, proposals, commands, runners), [projects, fabric, agentRuns, proposals, commands, runners]);
  const workloadProjects = useMemo(() => {
    return [...projects]
      .sort((left, right) => countServices(right) - countServices(left) || left.name.localeCompare(right.name))
      .slice(0, 12);
  }, [projects]);
  const recentActivity = useMemo(() => buildRecentActivity(agentRuns, commands), [agentRuns, commands]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0];

  const queueSyncCommand = (command) => {
    const runner = activeRunners[0] || runners[0];
    return onQueueCommand({
      runnerId: runner?.id || "",
      commandType: command.key,
      target: command.target,
      reason: command.reason,
      requestedBy: "owner",
      approvalStatus: "approved",
      executionStatus: "queued",
      approvedBy: "owner",
      approvedAt: new Date().toISOString(),
    });
  };

  return (
    <section className="automation-workspace" aria-labelledby="automation-workspace-title">
      <div className="overview-hero automation-hero">
        <div>
          <p className="eyebrow">Workload Control</p>
          <h2 id="automation-workspace-title">Automation</h2>
          <p>Review known services, local runners, Fabric-hosted workloads, project review coverage, and owner-approved automation queue actions.</p>
        </div>
        <div className="automation-runner-summary">
          <span>{activeRunners.length} active</span>
          <strong>{runners.length} known runners</strong>
          <small>{localControlsEnabled ? "Local controller paired" : "Local controller required"}</small>
        </div>
      </div>

      <div className="overview-metrics automation-metrics">
        <AutomationMetric label="Project Services" value={stats.serviceCount} detail={`${stats.runnableServiceCount} runnable scripts`} icon={<Server size={18} />} />
        <AutomationMetric label="Open Workloads" value={stats.openServiceCount} detail="Detected open ports" icon={<Activity size={18} />} tone={stats.openServiceCount ? "warning" : "success"} />
        <AutomationMetric label="Automation Devices" value={stats.automationDeviceCount} detail={`${stats.fabricDeviceCount} Fabric devices`} icon={<MonitorCog size={18} />} />
        <AutomationMetric label="Open Queue" value={stats.openCommandCount + stats.openProposalCount} detail="Commands and proposals" icon={<Workflow size={18} />} tone={stats.openCommandCount + stats.openProposalCount ? "warning" : "success"} />
      </div>

      <div className="automation-quick-panel">
        <div className="automation-quick-actions" aria-label="Automation quick actions">
          {QUICK_SYNC_COMMANDS.map((command) => (
            <button key={command.key} className="secondary-action" type="button" disabled={busy === "command-create"} onClick={() => queueSyncCommand(command)} title={localControlsEnabled ? "Queue approved sync for paired runner" : "Requires a paired local runner"}>
              <RefreshCw size={15} />
              {command.label}
            </button>
          ))}
        </div>
        <div className="automation-review-target">
          <select value={selectedProject?.id || ""} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className="secondary-action primary-secondary" type="button" disabled={!localControlsEnabled || !selectedProject || busy === "project-review"} onClick={() => onRunProjectReview(selectedProject.id)} title={localControlsEnabled ? "Queue or run a read-only project review" : "Requires a paired local runner"}>
            <PlayCircle size={15} />
            {busy === "project-review" ? "Reviewing..." : "Run Read-only Review"}
          </button>
        </div>
      </div>

      <div className="automation-grid">
        <section className="automation-panel automation-workloads" aria-labelledby="automation-workloads-title">
          <div className="runtime-section-heading">
            <span>
              <Server size={17} />
              <strong id="automation-workloads-title">Project Workloads</strong>
            </span>
            <em>{workloadProjects.length} visible</em>
          </div>
          <div className="automation-workload-list">
            {workloadProjects.length ? workloadProjects.map((project) => (
              <ProjectWorkloadCard key={project.id} project={project} onOpenProject={onOpenProject} onRunProjectReview={onRunProjectReview} localControlsEnabled={localControlsEnabled} busy={busy} />
            )) : <div className="empty compact-empty">No projects are loaded into the catalog yet.</div>}
          </div>
        </section>

        <section className="automation-panel" aria-labelledby="automation-devices-title">
          <div className="runtime-section-heading">
            <span>
              <MonitorCog size={17} />
              <strong id="automation-devices-title">Fabric Workload Hosts</strong>
            </span>
            <em>{fabric?.devices?.length || 0} devices</em>
          </div>
          <div className="automation-device-list">
            {fabric?.devices?.length ? fabric.devices.map((device) => <FabricDeviceCard key={device.id || device.stableIdentifier} device={device} />) : (
              <div className="empty compact-empty">Fabric devices are not loaded yet. Sync Fabric from a paired runner.</div>
            )}
          </div>
        </section>

        <section className="automation-panel" aria-labelledby="automation-activity-title">
          <div className="runtime-section-heading">
            <span>
              <Bot size={17} />
              <strong id="automation-activity-title">Recent Automation Activity</strong>
            </span>
            <em>{recentActivity.length} visible</em>
          </div>
          <div className="automation-activity-list">
            {recentActivity.length ? recentActivity.map((item) => <AutomationActivity key={item.id} item={item} />) : (
              <div className="empty compact-empty">No automation runs or command requests have been recorded yet.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProjectWorkloadCard({ project, onOpenProject, onRunProjectReview, localControlsEnabled, busy }) {
  const services = Array.isArray(project.services) ? project.services : [];
  const runnable = services.filter((service) => service.available);
  const open = services.filter((service) => service.portStatus === "open" || service.managedRunning);
  return (
    <article className={`automation-workload-card ${open.length ? "active" : ""}`}>
      <div>
        <div className="automation-card-title">
          {open.length ? <Activity size={16} /> : <Server size={16} />}
          <span>
            <strong>{project.name}</strong>
            <small>{project.framework || "Unknown framework"} · {project.projectManagement?.status || "PM status unknown"}</small>
          </span>
        </div>
        <div className="automation-card-meta">
          <span>{services.length} services</span>
          <span>{runnable.length} runnable</span>
          <span>{open.length} open/running</span>
          {project.git?.dirty ? <span className="warn">dirty git</span> : null}
        </div>
      </div>
      <div className="automation-card-actions">
        <button className="secondary-action" type="button" onClick={() => onOpenProject(project.id)}>Open</button>
        <button className="secondary-action" type="button" disabled={!localControlsEnabled || busy === "project-review"} onClick={() => onRunProjectReview(project.id)} title={localControlsEnabled ? "Run read-only review" : "Requires a paired local runner"}>Review</button>
      </div>
    </article>
  );
}

function FabricDeviceCard({ device }) {
  const hasWorkloadNotes = /automation|worker|scheduler|scheduled|runner|postgres|iis|service/i.test(`${device.role || ""} ${device.notes || ""}`);
  return (
    <article className={`automation-device-card ${hasWorkloadNotes ? "known" : ""}`}>
      <div className="automation-card-title">
        {hasWorkloadNotes ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <span>
          <strong>{device.nickname || device.stableIdentifier || device.id}</strong>
          <small>{device.currentName || device.ipAddress || "identifier unknown"}</small>
        </span>
      </div>
      <p>{device.role || "Role not documented."}</p>
      <div className="automation-card-meta">
        <span>{device.scope || "scope unknown"}</span>
        <span>{device.confidence || "confidence unknown"}</span>
        <span>{hasWorkloadNotes ? "workload notes present" : "needs workload inventory"}</span>
      </div>
    </article>
  );
}

function AutomationActivity({ item }) {
  return (
    <article className="automation-activity-card">
      <div className="automation-card-title">
        {item.tone === "success" ? <CheckCircle2 size={16} /> : item.tone === "warning" ? <AlertTriangle size={16} /> : <Clock size={16} />}
        <span>
          <strong>{item.title}</strong>
          <small>{item.subtitle}</small>
        </span>
      </div>
      <p>{item.summary}</p>
      <div className="automation-card-meta">
        <span className={`status-pill ${item.status}`}>{formatStatus(item.status)}</span>
        <span>{formatTime(item.updatedAt)}</span>
      </div>
    </article>
  );
}

function AutomationMetric({ label, value, detail, icon, tone = "" }) {
  return (
    <div className={`overview-metric automation-metric ${tone}`}>
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      <em>{detail}</em>
    </div>
  );
}

function buildAutomationStats(projects, fabric, agentRuns, proposals, commands, runners) {
  const services = projects.flatMap((project) => Array.isArray(project.services) ? project.services : []);
  const openCommandCount = commands.filter((command) => ["pending", "approved"].includes(command.approvalStatus) && !["succeeded", "failed", "cancelled"].includes(command.executionStatus)).length;
  const openProposalCount = proposals.filter((proposal) => ["proposed", "needs-evidence", "deferred"].includes(proposal.status)).length;
  const devices = fabric?.devices || [];
  return {
    serviceCount: services.length,
    runnableServiceCount: services.filter((service) => service.available).length,
    openServiceCount: services.filter((service) => service.portStatus === "open" || service.managedRunning).length,
    fabricDeviceCount: devices.length,
    automationDeviceCount: devices.filter((device) => /automation|worker|scheduler|scheduled|runner|postgres|iis|service/i.test(`${device.role || ""} ${device.notes || ""}`)).length,
    agentRunCount: agentRuns.length,
    runnerCount: runners.length,
    openCommandCount,
    openProposalCount,
  };
}

function buildRecentActivity(agentRuns, commands) {
  const runs = agentRuns.map((run) => ({
    id: `run-${run.id}`,
    title: run.agentType || "Agent run",
    subtitle: run.projectId || run.machineId || "agent activity",
    summary: run.summary || "No summary recorded.",
    status: run.status || "unknown",
    updatedAt: run.finishedAt || run.startedAt || run.createdAt,
    tone: run.status === "completed" ? "success" : run.status === "failed" ? "warning" : "",
  }));
  const commandItems = commands.map((command) => ({
    id: `command-${command.id}`,
    title: formatStatus(command.commandType || "command request"),
    subtitle: command.target || command.projectId || "local runner command",
    summary: command.reason || "No reason recorded.",
    status: command.executionStatus || command.approvalStatus || "unknown",
    updatedAt: command.updatedAt || command.createdAt,
    tone: ["failed", "cancelled"].includes(command.executionStatus) ? "warning" : command.executionStatus === "succeeded" ? "success" : "",
  }));
  return [...runs, ...commandItems]
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, 10);
}

function countServices(project) {
  return Array.isArray(project.services) ? project.services.length : 0;
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
