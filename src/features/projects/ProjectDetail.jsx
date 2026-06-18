import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  GitPullRequestArrow,
  Network,
  Pencil,
  Play,
  Rocket,
  RotateCw,
  Save,
  Server,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { getProjectRuntimeState } from "./runtime.js";

export function ProjectDetail({ project, busy, localControlsEnabled = true, onBack, onStart, onStop, onRestart, onTakeOver, onGitSync, onInitializeProjectManagement, onCreatePortfolioDraft, onLinkDemoPortal, onSaveDescription, onOpenFolder, onOpenProjectManagementFolder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description);
  const [activeMenu, setActiveMenu] = useState("overview");
  const projectManagement = project.projectManagement || {};
  const {
    isBusy,
    hasManagedRunning,
    canStart,
    canUseManagedActions,
    canTakeOver,
    primaryUrl,
  } = getProjectRuntimeState(project, busy);

  useEffect(() => {
    setDraft(project.description);
    setEditing(false);
    setActiveMenu("overview");
  }, [project.id, project.description]);

  const menuItems = [
    { key: "overview", label: "Overview", icon: <FileText size={16} /> },
    { key: "management", label: "Project Management", icon: <ClipboardList size={16} /> },
    { key: "services", label: "Services", icon: <Server size={16} /> },
    { key: "activity", label: "Activity", icon: <Activity size={16} /> },
    { key: "logs", label: "Recent Output", icon: <Terminal size={16} /> },
  ];

  return (
    <section className="project-workspace">
      <aside className="project-menu">
        <button className="back-button" type="button" onClick={onBack}>
          <X size={16} />
          Projects
        </button>
        <div className="menu-project-card">
          {project.faviconUrl ? <img className="favicon" src={project.faviconUrl} alt="" /> : <span className="fallback-icon">{project.name.slice(0, 1).toUpperCase()}</span>}
          <span>
            <strong>{project.name}</strong>
            <small>{project.folderName}</small>
          </span>
        </div>
        <nav className="menu-list" aria-label={`${project.name} sections`}>
          {menuItems.map((item) => (
            <button key={item.key} className={activeMenu === item.key ? "active" : ""} type="button" onClick={() => setActiveMenu(item.key)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="workspace-body">
        <div className="detail-head">
          <div className="title-group">
            {project.faviconUrl ? <img className="favicon" src={project.faviconUrl} alt="" /> : <span className="fallback-icon">{project.name.slice(0, 1).toUpperCase()}</span>}
            <div>
              <p className="eyebrow">{project.folderName}</p>
              <h2>{project.name}</h2>
            </div>
          </div>
          <div className="actions">
            {primaryUrl ? (
              <a className="action-button open-app" href={primaryUrl} target="_blank" rel="noreferrer" aria-label={`Open ${project.name}`}>
                <ExternalLink size={16} />
                Open
              </a>
            ) : null}
            <button className="start" disabled={!localControlsEnabled || !canStart} onClick={onStart}>
              <Play size={16} />
              Start
            </button>
            {canTakeOver ? (
              <button className="take-over" disabled={!localControlsEnabled} onClick={onTakeOver}>
                <RotateCw size={16} />
                Take Over
              </button>
            ) : null}
            {hasManagedRunning ? (
              <>
                <button className="restart" disabled={!localControlsEnabled || !canUseManagedActions} onClick={onRestart}>
                  <RotateCw size={16} />
                  Restart
                </button>
                <button className="stop" disabled={!localControlsEnabled || !canUseManagedActions} onClick={onStop}>
                  <Square size={15} />
                  Stop
                </button>
              </>
            ) : null}
          </div>
        </div>

        <ProjectManagementStatusStrip projectManagement={projectManagement} />

        <div className="detail-scroll">
          {activeMenu === "overview" ? (
            <ProjectOverview
              project={project}
              editing={editing}
              draft={draft}
              onDraftChange={setDraft}
              onEdit={() => setEditing(true)}
              onCancelEdit={() => { setDraft(project.description); setEditing(false); }}
              onSaveDescription={onSaveDescription}
              onOpenFolder={onOpenFolder}
              onGitSync={onGitSync}
              onCreatePortfolioDraft={onCreatePortfolioDraft}
              onLinkDemoPortal={onLinkDemoPortal}
              localControlsEnabled={localControlsEnabled}
              isBusy={isBusy}
              isCreatingPortfolioDraft={busy === `${project.id}:create-portfolio-draft`}
              isLinkingDemoPortal={busy === `${project.id}:link-demo-portal`}
            />
          ) : null}
          {activeMenu === "management" ? (
            <ProjectManagementDashboard
              project={project}
              projectManagement={projectManagement}
              onOpen={onOpenProjectManagementFolder}
              onInitialize={onInitializeProjectManagement}
              localControlsEnabled={localControlsEnabled}
              isInitializing={busy === `${project.id}:initialize-project-management`}
            />
          ) : null}
          {activeMenu === "services" ? <ProjectServices project={project} /> : null}
          {activeMenu === "activity" ? <ProjectActivity project={project} /> : null}
          {activeMenu === "logs" ? <ProjectLogs project={project} /> : null}
        </div>
      </div>
    </section>
  );
}

function ProjectOverview({ project, editing, draft, onDraftChange, onEdit, onCancelEdit, onSaveDescription, onOpenFolder, onGitSync, onCreatePortfolioDraft, onLinkDemoPortal, localControlsEnabled, isBusy, isCreatingPortfolioDraft, isLinkingDemoPortal }) {
  const primaryServices = project.services.filter((service) => service.kind === "primary");
  const apiServices = project.services.filter((service) => service.kind === "api");
  const liveUrl = project.liveUrl || project.externalUrl || project.homepage || "";

  return (
    <div className="workspace-panel">
      <div className="description-row">
        {editing ? (
          <>
            <textarea className="description-input" value={draft} onChange={(event) => onDraftChange(event.target.value)} />
            <button className="icon-button" onClick={() => onSaveDescription(draft)} aria-label="Save description">
              <Save size={17} />
            </button>
            <button className="icon-button" onClick={onCancelEdit} aria-label="Cancel edit">
              <X size={17} />
            </button>
          </>
        ) : (
          <>
            <p className="description">{project.description}</p>
            <button className="icon-button" onClick={onEdit} aria-label="Edit description">
              <Pencil size={16} />
            </button>
          </>
        )}
      </div>

      <div className="info-grid">
        <Info label="Type" value={project.audience} />
        <Info label="Owner" value={project.owner || "n/a"} />
        <Info label="Framework" value={project.framework} />
        <Info label="Status" value={project.status} tone={project.status} />
      </div>

      <div className="resource-section">
        <div className="section-title compact">
          <FolderOpen size={17} />
          <h3>Locations</h3>
        </div>
        <div className="resource-stack">
          <div className="resource-row">
            <div className="resource-meta">
              <FolderOpen size={16} />
              <span>
                <strong>Local Directory</strong>
                <small>{project.path}</small>
              </span>
            </div>
            <button className="secondary-action" disabled={!localControlsEnabled} onClick={onOpenFolder} title={localControlsEnabled ? "Open local directory" : "Requires a paired local runner"}>
              Open Directory
            </button>
          </div>
          <div className="resource-row">
            <div className="resource-meta">
              <GitPullRequestArrow size={16} />
              <span>
                <strong>Repository</strong>
                <small>{project.origin || "No remote detected"}</small>
              </span>
            </div>
            <div className="repo-badges">
              {project.git?.branch ? <span><GitBranch size={13} />{project.git.branch}</span> : null}
              {project.git ? <span className={project.git.dirty ? "warn" : ""}>{project.git.dirty ? "Dirty" : "Clean"}</span> : null}
              {project.git?.lastSync ? <span>Synced {formatTime(project.git.lastSync)}</span> : null}
            </div>
            <button className="secondary-action" disabled={!localControlsEnabled || isBusy || !project.origin} onClick={onGitSync} title={localControlsEnabled ? "Synchronize local repository" : "Requires a paired local runner"}>
              Git Sync
            </button>
          </div>
          {liveUrl ? (
            <div className="resource-row">
              <div className="resource-meta">
                <ExternalLink size={16} />
                <span>
                  <strong>Live URL</strong>
                  <small>{liveUrl}</small>
                </span>
              </div>
              <a className="secondary-action" href={liveUrl} target="_blank" rel="noreferrer">
                Open URL
              </a>
            </div>
          ) : null}
        </div>
      </div>

      <div className="resource-section">
        <div className="section-title compact">
          <BookOpen size={17} />
          <h3>Publishing Integrations</h3>
        </div>
        <div className="resource-stack">
          <div className="resource-row">
            <div className="resource-meta">
              <Rocket size={16} />
              <span>
                <strong>RidgePath Demo Portal</strong>
                <small>Configure client workspace access, contact email, deep link, project status, credentials, and connection reminders.</small>
              </span>
            </div>
            <button className="secondary-action primary-secondary" disabled={isBusy || isLinkingDemoPortal} onClick={onLinkDemoPortal}>
              {isLinkingDemoPortal ? "Opening..." : "Add to Demo Portal"}
            </button>
          </div>
          <div className="resource-row">
            <div className="resource-meta">
              <BookOpen size={16} />
              <span>
                <strong>Trevis Portfolio Draft</strong>
                <small>Create or update a local project idea and blog draft. Drafts are hidden from production until reviewed.</small>
              </span>
            </div>
            <button className="secondary-action primary-secondary" disabled={!localControlsEnabled || isBusy || isCreatingPortfolioDraft} onClick={onCreatePortfolioDraft}>
              {isCreatingPortfolioDraft ? "Creating..." : "Add to Portfolio"}
            </button>
          </div>
        </div>
      </div>

      <div className="resource-section">
        <div className="section-title compact">
          <Network size={17} />
          <h3>Port Assignments</h3>
        </div>
        <div className="resource-stack">
          {primaryServices.length ? primaryServices.map((service) => (
            <EndpointResourceRow key={service.id} service={service} title={service.combined ? "Application + API" : "Application"} />
          )) : (
            <div className="empty compact-empty">No application port assigned.</div>
          )}
          {apiServices.length ? apiServices.map((service) => (
            <EndpointResourceRow key={service.id} service={service} title="Associated API" />
          )) : (
            <div className="empty compact-empty">No associated API port assigned.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EndpointResourceRow({ service, title }) {
  const url = service.port ? `http://localhost:${service.port}` : "";
  const canOpen = url && (service.managedRunning || service.portStatus === "open");
  return (
    <div className="resource-row endpoint-row">
      <div className="resource-meta">
        {service.kind === "api" ? <Server size={16} /> : <Network size={16} />}
        <span>
          <strong>{title}</strong>
          <small>{service.label} · {service.framework} · {service.script ? `npm run ${service.script}` : "script unknown"}</small>
        </span>
      </div>
      <div className="endpoint-badges">
        <span>{service.port || "Port unknown"}</span>
        {service.portConflict ? <span className="collision"><AlertTriangle size={13} />Conflict</span> : null}
        <span className={`port-state ${service.managedRunning ? "running" : service.portStatus}`}>{service.managedRunning ? "managed" : service.portStatus}</span>
      </div>
      {canOpen ? (
        <a className="secondary-action" href={url} target="_blank" rel="noreferrer">
          Open
        </a>
      ) : (
        <button className="secondary-action" type="button" disabled>Open</button>
      )}
    </div>
  );
}

function ProjectServices({ project }) {
  return (
    <div className="workspace-panel">
      <div className="section-title">
        <Server size={17} />
        <h3>Services</h3>
      </div>
      <div className="services">
        {project.services.length ? (
          project.services.map((service) => <ServiceRow key={service.id} service={service} />)
        ) : (
          <div className="empty">No runnable application script found.</div>
        )}
      </div>
    </div>
  );
}

function ProjectActivity({ project }) {
  return (
    <div className="workspace-panel">
      <div className="section-title">
        <Activity size={17} />
        <h3>Activity</h3>
      </div>
      <div className="activity-list">
        {project.activity?.length ? (
          project.activity.map((entry) => (
            <div className="activity-row" key={entry.id}>
              <strong>{entry.action}</strong>
              <span>{entry.message}</span>
              <small>{formatTime(entry.at)}</small>
            </div>
          ))
        ) : (
          <div className="empty compact-empty">No RidgePath Forge activity yet.</div>
        )}
      </div>
    </div>
  );
}

function ProjectLogs({ project }) {
  return (
    <div className="workspace-panel">
      <div className="section-title">
        <Terminal size={17} />
        <h3>Recent output</h3>
      </div>
      <pre className="logs">{project.logs?.length ? project.logs.join("\n") : "No RidgePath Forge output yet."}</pre>
    </div>
  );
}

function ProjectManagementStatusStrip({ projectManagement }) {
  if (!projectManagement.initialized) {
    return (
      <div className="pm-strip not-initialized">
        <div className="pm-strip-title">
          <ClipboardList size={16} />
          <strong>Project Management Not Initialized</strong>
        </div>
        <span className="pm-chip neutral">Recommended Next Action: {projectManagement.recommendedNextAction || "Needs Manual Review"}</span>
      </div>
    );
  }

  const dashboard = projectManagement.dashboard || {};
  const summary = dashboard.summary || {};
  const counts = dashboard.counts || {};
  return (
    <div className={`pm-strip ${projectManagement.status === "Current" ? "current" : "needs-review"}`}>
      <div className="pm-strip-title">
        <ClipboardList size={16} />
        <strong>Project Management Initialized</strong>
      </div>
      <span className="pm-chip">Phase: {fieldValue(summary.currentPhase)}</span>
      <span className="pm-chip">Lifecycle: {formatStatus(summary.lifecycleStatus)}</span>
      <span className="pm-chip">Governance: {formatStatus(summary.governanceStatus)}</span>
      <span className="pm-chip">Open Backlog: {fieldValue(counts.backlogOpen)}</span>
      <span className="pm-chip">Open Bugs: {fieldValue(counts.bugsOpen)}</span>
      <span className="pm-chip">Sprint Blockers: {fieldValue(counts.sprintBlocked)}</span>
      <span className="pm-chip wide">Next Codex Action: {fieldValue(summary.nextCodexAction)}</span>
      {projectManagement.status !== "Current" ? <span className="pm-chip warn">Needs Manual Review</span> : null}
    </div>
  );
}

const PROJECT_MANAGEMENT_TABS = ["Overview", "Backlog", "Bugs", "Governance", "Codex Activity"];

function ProjectManagementDashboard({ project, projectManagement, onOpen, onInitialize, localControlsEnabled, isInitializing }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [backlogFilters, setBacklogFilters] = useState({ status: "all", priority: "all", type: "all" });
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedScopedPrompt, setCopiedScopedPrompt] = useState("");

  useEffect(() => {
    setActiveTab("Overview");
    setBacklogFilters({ status: "all", priority: "all", type: "all" });
    setCopiedPrompt(false);
    setCopiedScopedPrompt("");
  }, [projectManagement.dashboardPath]);

  const dashboard = projectManagement.dashboard || {};
  const canOpenFolder = Boolean(projectManagement.initialized);
  const promptContent = projectManagement.codexPrompt?.content || "";

  async function copyCodexPrompt() {
    if (!promptContent) return;
    await copyTextToClipboard(promptContent);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1800);
  }

  async function copyScopedPrompt(scope) {
    const content = scopedProjectManagementPrompt(project, projectManagement, scope);
    await copyTextToClipboard(content);
    setCopiedScopedPrompt(scope);
    window.setTimeout(() => setCopiedScopedPrompt(""), 1800);
  }

  return (
    <section className="pm-overview" aria-labelledby="pm-overview-title">
      <div className="section-title">
        <ClipboardList size={17} />
        <h3 id="pm-overview-title">Project Management</h3>
      </div>
      <div className="pm-tabbar" role="tablist" aria-label="Project Management">
        {PROJECT_MANAGEMENT_TABS.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {!projectManagement.initialized ? (
        <div className="pm-empty">
          <strong>Project Management Not Initialized</strong>
          <span>Recommended Next Action: {projectManagement.recommendedNextAction || "Needs Manual Review"}</span>
          <div className="pm-empty-actions">
            <button className="secondary-action primary-secondary" type="button" disabled={!localControlsEnabled || isInitializing} onClick={onInitialize} title={localControlsEnabled ? "Initialize local project-management files" : "Requires a paired local runner"}>
              <ClipboardList size={15} />
              {isInitializing ? "Initializing..." : "Initialize Project Management"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pm-init-summary">
            <div>
              <strong>Project Management Initialized</strong>
              <span>Next Recommended Action: {projectManagement.recommendedNextAction || "Needs Manual Review"}</span>
            </div>
            <button className="secondary-action" type="button" disabled={!promptContent} onClick={copyCodexPrompt}>
              {copiedPrompt ? <Check size={15} /> : <Copy size={15} />}
              {copiedPrompt ? "Copied" : "Copy Codex Prompt"}
            </button>
          </div>
          {projectManagement.status !== "Current" ? (
            <div className="pm-warning">
              <AlertTriangle size={16} />
              <span>{projectManagement.validation?.issues?.length ? projectManagement.validation.issues.join("; ") : "Needs Manual Review"}</span>
            </div>
          ) : null}
          {activeTab === "Overview" ? <ProjectManagementOverview projectManagement={projectManagement} /> : null}
          {activeTab === "Backlog" ? <ProjectManagementBacklog dashboard={dashboard} filters={backlogFilters} onFiltersChange={setBacklogFilters} onCopyPrompt={() => copyScopedPrompt("backlog")} copiedPrompt={copiedScopedPrompt === "backlog"} /> : null}
          {activeTab === "Bugs" ? <ProjectManagementBugs dashboard={dashboard} onCopyPrompt={() => copyScopedPrompt("bugs")} copiedPrompt={copiedScopedPrompt === "bugs"} /> : null}
          {activeTab === "Governance" ? <ProjectManagementGovernance dashboard={dashboard} onCopyPrompt={() => copyScopedPrompt("governance")} copiedPrompt={copiedScopedPrompt === "governance"} /> : null}
          {activeTab === "Codex Activity" ? <ProjectManagementCodexActivity dashboard={dashboard} /> : null}
        </>
      )}
            <ProjectManagementFileActions projectManagement={projectManagement} canOpenFolder={localControlsEnabled && canOpenFolder} onOpen={onOpen} />
    </section>
  );
}

function ProjectManagementOverview({ projectManagement }) {
  const dashboard = projectManagement.dashboard || {};
  const summary = dashboard.summary || {};
  const counts = dashboard.counts || {};
  const metadata = dashboard.metadata || {};

  return (
    <>
      <div className="pm-overview-grid">
        <Info label="Current Phase" value={fieldValue(summary.currentPhase)} />
        <Info label="Next Codex Action" value={fieldValue(summary.nextCodexAction)} />
        <Info label="Governance Status" value={formatStatus(summary.governanceStatus)} />
        <Info label="Current Sprint" value={fieldValue(summary.currentSprint)} />
        <Info label="Backlog Summary" value={`${fieldValue(counts.backlogOpen)} open / ${fieldValue(counts.backlogReady)} ready`} />
        <Info label="Bug Summary" value={`${fieldValue(counts.bugsOpen)} open / ${fieldValue(counts.bugsCritical)} critical`} />
        <Info label="Last Dashboard Update" value={formatTime(metadata.generatedAt) || "Needs Manual Review"} />
        <Info label="Dashboard Freshness" value={projectManagement.freshness || "Needs Manual Review"} />
      </div>
      <ProjectManagementFileHealth projectManagement={projectManagement} />
    </>
  );
}

function ProjectManagementBacklog({ dashboard, filters, onFiltersChange, onCopyPrompt, copiedPrompt }) {
  const backlog = Array.isArray(dashboard.backlog) ? dashboard.backlog : null;
  const rows = backlog || [];
  const filterOptions = (field) => uniqueValues(rows.map((row) => fieldValue(row?.[field])).filter((value) => value !== "Needs Manual Review"));
  const filteredRows = rows.filter((row) => (
    filterMatches(filters.status, row?.status)
    && filterMatches(filters.priority, row?.priority)
    && filterMatches(filters.type, row?.type)
  ));

  if (!backlog) return <ManualReviewPanel message="Backlog data is missing or invalid." />;
  return (
    <div className="pm-panel">
      <ProjectManagementPromptAction label="Copy Backlog Codex Prompt" copied={copiedPrompt} onCopy={onCopyPrompt} />
      <div className="pm-filter-row">
        <FilterSelect label="Status" value={filters.status} options={filterOptions("status")} onChange={(value) => onFiltersChange((current) => ({ ...current, status: value }))} />
        <FilterSelect label="Priority" value={filters.priority} options={filterOptions("priority")} onChange={(value) => onFiltersChange((current) => ({ ...current, priority: value }))} />
        <FilterSelect label="Type" value={filters.type} options={filterOptions("type")} onChange={(value) => onFiltersChange((current) => ({ ...current, type: value }))} />
      </div>
      {!rows.length ? <ManualReviewPanel message="Empty backlog. Needs Manual Review." /> : null}
      {rows.length && !filteredRows.length ? <ManualReviewPanel message="No backlog items match the current filters." /> : null}
      {filteredRows.length ? (
        <DataTable
          columns={["ID", "Title", "Type", "Priority", "Status", "Phase"]}
          rows={filteredRows.map((row) => projectManagementRow(row, ["id", "title", "type", "priority", "status", "phase"]))}
        />
      ) : null}
    </div>
  );
}

function ProjectManagementBugs({ dashboard, onCopyPrompt, copiedPrompt }) {
  const bugs = Array.isArray(dashboard.bugs) ? dashboard.bugs : null;
  const rows = bugs || [];
  const openCount = rows.filter((bug) => bugGroup(bug?.status) !== "Closed").length;
  const criticalCount = rows.filter((bug) => String(bug?.severity || "").toLowerCase() === "critical").length;
  const highCount = rows.filter((bug) => String(bug?.severity || "").toLowerCase() === "high").length;

  if (!bugs) return <ManualReviewPanel message="Bug data is missing or invalid." />;
  return (
    <div className="pm-panel">
      <ProjectManagementPromptAction label="Copy Bugs Codex Prompt" copied={copiedPrompt} onCopy={onCopyPrompt} />
      <div className="pm-overview-grid compact">
        <Info label="Open Bugs" value={openCount} />
        <Info label="Critical Bugs" value={criticalCount} />
        <Info label="High Severity" value={highCount} />
      </div>
      {!rows.length ? <ManualReviewPanel message="Empty bug register. Needs Manual Review." /> : null}
      {["Open", "Validating", "Blocked", "Closed"].map((group) => {
        const groupRows = rows.filter((bug) => bugGroup(bug?.status) === group);
        return (
          <div className="pm-group" key={group}>
            <h4>{group}</h4>
            {groupRows.length ? (
              <DataTable
                columns={["ID", "Title", "Severity", "Priority", "Status", "Affected Workflow"]}
                rows={groupRows.map((row) => projectManagementRow(row, ["id", "title", "severity", "priority", "status", "affectedWorkflow"]))}
              />
            ) : (
              <div className="empty compact-empty">No {group.toLowerCase()} bugs.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectManagementGovernance({ dashboard, onCopyPrompt, copiedPrompt }) {
  const governance = dashboard.governance && typeof dashboard.governance === "object" ? dashboard.governance : null;
  if (!governance) return <ManualReviewPanel message="Governance data is missing or invalid." />;
  const phases = Array.isArray(governance.phases) ? governance.phases : [];

  return (
    <div className="pm-panel">
      <ProjectManagementPromptAction label="Copy Governance Codex Prompt" copied={copiedPrompt} onCopy={onCopyPrompt} />
      <div className="pm-overview-grid compact">
        <Info label="Security Status" value={formatStatus(governance.security)} />
        <Info label="Data Status" value={formatStatus(governance.data)} />
        <Info label="Testing Status" value={formatStatus(governance.testing)} />
        <Info label="Release Status" value={formatStatus(governance.release)} />
      </div>
      {!phases.length ? <ManualReviewPanel message="Lifecycle phases are missing. Needs Manual Review." /> : (
        <DataTable
          columns={["Lifecycle Phase", "Status", "Evidence", "Blocking Gaps"]}
          rows={phases.map((phase) => projectManagementRow({
            phase: phase?.phase,
            status: phase?.status,
            evidence: listValue(phase?.evidence),
            blockingGaps: listValue(phase?.blockingGaps),
          }, ["phase", "status", "evidence", "blockingGaps"]))}
        />
      )}
    </div>
  );
}

function ProjectManagementPromptAction({ label, copied, onCopy }) {
  return (
    <div className="pm-panel-action">
      <button className="secondary-action" type="button" onClick={onCopy}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}

function ProjectManagementCodexActivity({ dashboard }) {
  const activity = Array.isArray(dashboard.codexActivity) ? dashboard.codexActivity : null;
  if (!activity) return <ManualReviewPanel message="Codex activity data is missing or invalid." />;
  const sorted = [...activity].sort((left, right) => sortableTime(right?.timestamp) - sortableTime(left?.timestamp));
  if (!sorted.length) return <ManualReviewPanel message="No Codex activity recorded. Needs Manual Review." />;

  return (
    <div className="pm-timeline">
      {sorted.map((entry, index) => (
        <div className="pm-activity-card" key={entry?.id || `${entry?.timestamp || "activity"}-${index}`}>
          <div>
            <strong>{fieldValue(entry?.workflow)}</strong>
            <small>{fieldValue(entry?.timestamp)}</small>
          </div>
          <p>{fieldValue(entry?.summary)}</p>
          <span>Next Action: {fieldValue(entry?.nextAction)}</span>
          {entry?.filesChanged ? <span>Files Changed: {listValue(entry.filesChanged)}</span> : null}
          {activityValidation(entry) ? <span>Validation Notes: {listValue(activityValidation(entry))}</span> : null}
        </div>
      ))}
    </div>
  );
}

function ProjectManagementFileHealth({ projectManagement }) {
  const dashboard = projectManagement.dashboard || {};
  const metadata = dashboard.metadata || {};
  const sourceFiles = projectManagement.sourceFiles || [];
  const issues = projectManagement.validation?.issues || [];
  const schemaIssues = issues.filter((issue) => /schema|field|metadata/i.test(issue));
  const validationIssues = issues.filter((issue) => !schemaIssues.includes(issue));
  return (
    <div className="pm-file-health">
      <h4>Project Management File Health</h4>
      <div className="pm-overview-grid compact">
        <Info label="Dashboard Current" value={projectManagement.status === "Current" ? "Yes" : "No"} />
        <Info label="Dashboard Stale" value={projectManagement.staleStatus === "Needs Manual Review" ? "Yes" : "No"} />
        <Info label="Dashboard Missing" value={projectManagement.dashboardMissing ? "Yes" : "No"} />
        <Info label="Generated At" value={formatTime(metadata.generatedAt) || "Needs Manual Review"} />
      </div>
      {projectManagement.validation?.missingFields?.length || projectManagement.missingFiles?.length || projectManagement.staleFiles?.length || issues.length ? (
        <div className="pm-diagnostics">
          {projectManagement.validation?.missingFields?.length ? <span>Missing fields: {projectManagement.validation.missingFields.join(", ")}</span> : null}
          {projectManagement.missingFiles?.length ? <span>Missing Source Files: {projectManagement.missingFiles.join(", ")}</span> : null}
          {projectManagement.staleFiles?.length ? <span>Newer source files: {projectManagement.staleFiles.join(", ")}</span> : null}
          {validationIssues.length ? <span>Validation Issues: {validationIssues.join("; ")}</span> : null}
          {schemaIssues.length ? <span>Schema Issues: {schemaIssues.join("; ")}</span> : null}
        </div>
      ) : null}
      <div className="pm-source-list">
        {sourceFiles.length ? sourceFiles.map((source) => (
          <span key={source.relativePath} className={source.exists && !source.stale ? "" : "warn"}>
            {source.relativePath}: {source.exists ? (source.stale ? "Stale" : "Current") : "Missing"}
          </span>
        )) : <span>metadata.sourceFiles: Needs Manual Review</span>}
      </div>
    </div>
  );
}

function ProjectManagementFileActions({ projectManagement, canOpenFolder, onOpen }) {
  const files = projectManagement.files || {};
  const actions = [
    { key: "", label: "Open Project Management Folder", icon: <FolderOpen size={15} />, enabled: canOpenFolder },
    { key: "lifecycle", label: "Open lifecycle-status.md", icon: <FileText size={15} />, enabled: files.lifecycle?.exists },
    { key: "backlog", label: "Open backlog.md", icon: <FileText size={15} />, enabled: files.backlog?.exists },
    { key: "bugs", label: "Open bugs.md", icon: <FileText size={15} />, enabled: files.bugs?.exists },
    { key: "codexActivity", label: "Open codex-activity.md", icon: <FileText size={15} />, enabled: files.codexActivity?.exists },
  ];
  return (
    <div className="pm-file-actions">
      {actions.map((action) => (
        <button className="secondary-action pm-open-folder" key={action.label} disabled={!action.enabled} onClick={() => onOpen(action.key)}>
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="pm-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{formatStatus(option)}</option>)}
      </select>
    </label>
  );
}

function ManualReviewPanel({ message }) {
  return <div className="pm-empty"><strong>Needs Manual Review</strong><span>{message}</span></div>;
}

function DataTable({ columns, rows }) {
  return (
    <div className="pm-table-wrap">
      <table className="pm-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join("|")}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${columns[cellIndex]}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Info({ label, value, tone }) {
  return (
    <div className="info">
      <small>{label}</small>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function ServiceRow({ service }) {
  const url = service.port && (service.managedRunning || service.portStatus === "open") ? `http://localhost:${service.port}` : "";
  return (
    <div className={`service-row ${service.available ? "" : "unavailable"}`}>
      <div className="service-main">
        <span className={`status-dot ${service.managedRunning ? "running" : service.portStatus}`} />
        <span>
          <strong>{service.label}</strong>
          <small>{service.framework} · npm run {service.script}</small>
        </span>
      </div>
      <code>{service.command}</code>
      <div className="service-port">
        <span>{service.port || "Port unknown"}</span>
        {service.portConflict ? <span className="collision"><AlertTriangle size={13} />Conflict</span> : null}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${service.label}`}>
            <ExternalLink size={15} />
          </a>
        ) : null}
      </div>
      {service.note ? <p className="service-note">{service.note}</p> : null}
    </div>
  );
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fieldValue(value) {
  if (value === 0) return "0";
  if (value === false) return "false";
  if (value === null || value === undefined || value === "") return "Needs Manual Review";
  return String(value);
}

function formatStatus(value) {
  return fieldValue(value).replaceAll("-", " ");
}

function filterMatches(filter, value) {
  return filter === "all" || fieldValue(value) === filter;
}

function uniqueValues(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function listValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  return fieldValue(value);
}

function sortableTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function activityValidation(entry) {
  return entry?.validationNotes ?? entry?.validation ?? entry?.validationStatus ?? "";
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

function projectManagementRow(source, fields) {
  return fields.map((field) => {
    const value = source?.[field];
    return Array.isArray(value) ? listValue(value) : fieldValue(value);
  });
}

function scopedProjectManagementPrompt(project, projectManagement, scope) {
  const dashboard = projectManagement.dashboard || {};
  const projectName = dashboard.project?.name || project.name || "Needs Manual Review";
  const repositoryPath = project.path || dashboard.project?.path || "Needs Manual Review";
  const summary = dashboard.summary || {};
  const scopeConfigs = {
    backlog: {
      title: "Backlog",
      sourceFile: "docs/project-management/backlog.md",
      dashboardField: "backlog",
      objective: "Review, validate, and update backlog items so they are actionable, prioritized, and grounded in repository evidence.",
      requiredWork: [
        "Review existing backlog rows, repository code, README files, docs, tests, and recent project-management activity.",
        "Add or update backlog items only when there is source evidence or a clear manual-review placeholder is needed.",
        "For every item, include priority, status, type, source notes, and acceptance criteria.",
      ],
    },
    bugs: {
      title: "Bugs",
      sourceFile: "docs/project-management/bugs.md",
      dashboardField: "bugs",
      objective: "Review, validate, and update the bug register without inventing defects that are not supported by evidence.",
      requiredWork: [
        "Review existing bug rows, test failures, runtime notes, issue documentation, logs, and source-code evidence.",
        "Classify severity, priority, status, affected workflow, evidence, and recommended next action for each bug.",
        "Use Needs manual review when a suspected defect lacks enough evidence to confirm.",
      ],
    },
    governance: {
      title: "Governance",
      sourceFile: "docs/project-management/lifecycle-status.md",
      dashboardField: "governance",
      objective: "Review and update lifecycle and governance status for security, data, testing, and release readiness.",
      requiredWork: [
        "Review the repository, docs, scripts, tests, deployment notes, and existing project-management artifacts.",
        "Update lifecycle phase evidence, blocking gaps, gate status, and governance readiness fields.",
        "Use Needs manual review for unknown, stale, conflicting, or incomplete governance information.",
      ],
    },
  };
  const config = scopeConfigs[scope] || scopeConfigs.backlog;
  const rows = dashboard[config.dashboardField];
  const rowSummary = Array.isArray(rows)
    ? rows.slice(0, 8).map((row) => `- ${fieldValue(row?.id)}: ${fieldValue(row?.title || row?.phase)} (${fieldValue(row?.status)})`).join("\n") || "- No current rows. Needs manual review."
    : "- Dashboard data missing or invalid. Needs manual review.";

  return `# Codex Project Management ${config.title} Update

Repository: \`${repositoryPath}\`
Project: \`${projectName}\`
Project Management Source: \`${config.sourceFile}\`
Dashboard: \`docs/project-management/project-dashboard.json\`

Use the Codex Operations Library as the source of truth. RidgePath Forge displays the project-management read model only; Codex owns repository analysis and artifact updates.

## Objective

${config.objective}

## Current Dashboard Context

- Current Phase: ${fieldValue(summary.currentPhase)}
- Lifecycle Status: ${formatStatus(summary.lifecycleStatus)}
- Governance Status: ${formatStatus(summary.governanceStatus)}
- Next Codex Action: ${fieldValue(summary.nextCodexAction)}

## Current ${config.title} Items

${rowSummary}

## Required Work

${config.requiredWork.map((item, index) => `${index + 1}. ${item}`).join("\n")}
${config.requiredWork.length + 1}. Update \`${config.sourceFile}\` as the Markdown source of truth.
${config.requiredWork.length + 2}. Update \`docs/project-management/project-dashboard.json\` so RidgePath Forge reflects the current ${config.title.toLowerCase()} state.
${config.requiredWork.length + 3}. Add an entry to \`docs/project-management/codex-activity.md\` describing the work, evidence reviewed, files changed, and validation result.

## Validation

- Verify edited Markdown files are internally consistent.
- Verify \`project-dashboard.json\` is valid JSON.
- Verify dashboard \`metadata.sourceFiles\` references the source files used.
- Use \`Needs manual review\` instead of guessing when evidence is incomplete.
`;
}

function bugGroup(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "validating") return "Validating";
  if (normalized === "blocked") return "Blocked";
  if (["closed", "deferred", "duplicate", "out-of-scope"].includes(normalized)) return "Closed";
  return "Open";
}
