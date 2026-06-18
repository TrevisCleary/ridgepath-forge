import React from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  Network,
  Rocket,
  Server,
} from "lucide-react";

export function CommandCenterOverview({
  projects,
  operationsLibrary,
  ridgeFabric,
  root,
  hostedMode,
  localRunnerPaired,
  onOpenProjects,
  onOpenFabric,
  onOpenPorts,
  onOpenOperations,
}) {
  const runningProjects = projects.filter((project) => project.status === "running");
  const dirtyProjects = projects.filter((project) => project.git?.dirty);
  const unmanagedRunning = projects.filter((project) => project.status === "running" && !project.managedRunning);
  const projectManagementNeedsReview = projects.filter((project) => project.projectManagement?.status && project.projectManagement.status !== "Current");
  const demoGaps = projects.filter((project) => !project.productionUrl && (project.externalUrl || project.liveUrl));
  const fabricUnknown = ridgeFabric?.counts?.unknown || 0;
  const fabricDevices = ridgeFabric?.counts?.devices || 0;
  const operationsStatus = operationsLibrary?.validation?.status || "Not checked";
  const attentionItems = [
    ...unmanagedRunning.map((project) => ({
      key: `unmanaged-${project.id}`,
      label: project.name,
      detail: "Running outside Forge management",
      tone: "warning",
    })),
    ...dirtyProjects.slice(0, 5).map((project) => ({
      key: `dirty-${project.id}`,
      label: project.name,
      detail: `Git working tree is dirty${project.git?.branch ? ` on ${project.git.branch}` : ""}`,
      tone: "info",
    })),
    ...projectManagementNeedsReview.slice(0, 5).map((project) => ({
      key: `pm-${project.id}`,
      label: project.name,
      detail: project.projectManagement?.recommendedNextAction || "Project management needs review",
      tone: "warning",
    })),
  ];

  return (
    <section className="command-overview" aria-labelledby="command-overview-title">
      <div className="overview-hero">
        <div>
          <p className="eyebrow">Command Center</p>
          <h2 id="command-overview-title">RidgePath Forge</h2>
          <p>{root || "Project root not loaded"}</p>
        </div>
        <div className="overview-hero-actions">
          <button className="secondary-action primary-secondary" type="button" onClick={onOpenProjects}>
            <Rocket size={16} />
            Projects
          </button>
          <button className="secondary-action" type="button" onClick={onOpenFabric}>
            <Network size={16} />
            Fabric
          </button>
          <button className="secondary-action" type="button" onClick={onOpenOperations}>
            <ClipboardList size={16} />
            Ops Library
          </button>
        </div>
      </div>

      <div className="overview-metrics">
        <OverviewMetric label="Projects" value={projects.length} detail={`${runningProjects.length} running`} icon={<Boxes size={18} />} />
        <OverviewMetric label="Services" value={projects.reduce((count, project) => count + project.services.length, 0)} detail="Discovered local scripts" icon={<Server size={18} />} />
        <OverviewMetric label="Fabric Devices" value={fabricDevices || "Load"} detail={fabricUnknown ? `${fabricUnknown} unknown` : "Registry inventory"} icon={<Network size={18} />} />
        <OverviewMetric label="Operations" value={operationsStatus} detail="Library validation" icon={<ClipboardList size={18} />} />
      </div>

      <div className="overview-grid">
        <section className="overview-panel">
          <div className="section-title compact">
            <AlertTriangle size={17} />
            <h3>Attention</h3>
          </div>
          <div className="attention-list">
            {attentionItems.length ? attentionItems.slice(0, 8).map((item) => (
              <div className={`attention-row ${item.tone}`} key={item.key}>
                <span className="attention-icon">{item.tone === "warning" ? <AlertTriangle size={15} /> : <GitBranch size={15} />}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </div>
            )) : (
              <div className="empty compact-empty">No immediate project or runtime issues surfaced.</div>
            )}
          </div>
        </section>

        <section className="overview-panel">
          <div className="section-title compact">
            <Activity size={17} />
            <h3>Runtime</h3>
          </div>
          <div className="runtime-summary">
            <StatusLine label="Managed running" value={runningProjects.filter((project) => project.managedRunning).length} />
            <StatusLine label="Unmanaged running" value={unmanagedRunning.length} tone={unmanagedRunning.length ? "warning" : ""} />
            <StatusLine label="Dirty repositories" value={dirtyProjects.length} tone={dirtyProjects.length ? "info" : ""} />
            <StatusLine label="Port map" value="Available" action="Open" onAction={onOpenPorts} />
          </div>
        </section>

        <section className="overview-panel">
          <div className="section-title compact">
            <CheckCircle2 size={17} />
            <h3>Readiness</h3>
          </div>
          <div className="runtime-summary">
            <StatusLine label="Project management review" value={projectManagementNeedsReview.length} tone={projectManagementNeedsReview.length ? "warning" : ""} />
            <StatusLine label="Demo URL gaps" value={demoGaps.length} tone={demoGaps.length ? "warning" : ""} />
            <StatusLine label="Fabric unknown devices" value={fabricUnknown} tone={fabricUnknown ? "warning" : ""} />
            <StatusLine label="Operations library" value={operationsStatus} />
          </div>
        </section>

        <section className="overview-panel">
          <div className="section-title compact">
            <Server size={17} />
            <h3>Runner</h3>
          </div>
          <div className="runtime-summary">
            <StatusLine label="Hosted Ops" value={hostedMode ? "Online" : "Local"} />
            <StatusLine label="Local runner" value={localRunnerPaired ? "Paired" : "Not paired"} tone={hostedMode && !localRunnerPaired ? "warning" : ""} />
            <StatusLine label="Local controls" value={hostedMode && !localRunnerPaired ? "Disabled" : "Enabled"} tone={hostedMode && !localRunnerPaired ? "warning" : ""} />
            <StatusLine label="Command queue" value="Neon" />
          </div>
        </section>
      </div>
    </section>
  );
}

function OverviewMetric({ label, value, detail, icon }) {
  return (
    <div className="overview-metric">
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      <em>{detail}</em>
    </div>
  );
}

function StatusLine({ label, value, tone = "", action = "", onAction }) {
  return (
    <div className={`status-line ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {action ? (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}
