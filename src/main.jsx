import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Check,
  Code2,
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
  Plus,
  RefreshCw,
  Rocket,
  RotateCw,
  Save,
  Server,
  Square,
  Terminal,
  X,
} from "lucide-react";
import "./styles.css";

const POLL_MS = 5000;

function App() {
  const [root, setRoot] = useState("");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ work: true, ridgepath: true, personal: true });
  const [showPortTree, setShowPortTree] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showOperationsLibrary, setShowOperationsLibrary] = useState(false);
  const [operationsLibrary, setOperationsLibrary] = useState(null);
  const [actionError, setActionError] = useState("");

  async function loadProjects() {
    const response = await fetch("/api/projects");
    const data = await response.json();
    setRoot(data.root);
    setProjects(data.projects || []);
    setSelectedId((current) => (data.projects || []).some((project) => project.id === current) ? current : "");
    setLoading(false);
  }

  async function loadOperationsLibraryStatus() {
    const response = await fetch("/api/operations-library/status");
    const data = await response.json();
    setOperationsLibrary(data);
  }

  useEffect(() => {
    loadProjects();
    loadOperationsLibraryStatus();
    const timer = window.setInterval(loadProjects, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  async function runAction(projectId, action) {
    setBusy(`${projectId}:${action}`);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/${action}`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Action failed.");
      }
      await loadProjects();
    } catch (error) {
      setActionError(error.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveDescription(projectId, description) {
    setBusy(`${projectId}:save`);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Save failed.");
      }
      await loadProjects();
    } finally {
      setBusy("");
    }
  }

  async function openFolder(projectId) {
    await fetch(`/api/projects/${projectId}/open-folder`, { method: "POST" });
  }

  async function openProjectManagementFolder(projectId, fileKey = "") {
    const path = fileKey ? `open-project-management-file/${fileKey}` : "open-project-management-folder";
    await fetch(`/api/projects/${projectId}/${path}`, { method: "POST" });
  }

  async function initializeProjectManagement(projectId) {
    await runAction(projectId, "initialize-project-management");
  }

  async function registerProject(values) {
    setBusy("register");
    try {
      const response = await fetch("/api/projects/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed.");
      }
      const project = await response.json();
      await loadProjects();
      setSelectedId(project.id);
      setShowRegister(false);
    } finally {
      setBusy("");
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      const audienceVisible =
        (filters.work && project.audience === "work") ||
        (filters.ridgepath && project.audience === "ridgepath") ||
        (filters.personal && project.audience === "personal") ||
        (filters.work && filters.ridgepath && filters.personal && project.audience === "unknown");
      if (!audienceVisible) return false;
      if (!needle) return true;
      return [project.name, project.folderName, project.framework, project.description, project.owner]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [projects, query, filters]);

  const selected = projects.find((project) => project.id === selectedId);
  const runningCount = projects.filter((project) => project.status === "running").length;
  const serviceCount = projects.reduce((count, project) => count + project.services.length, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/assets/ridgepath-forge-horizontal-logo-transparent.png" alt="RidgePath Forge" />
        </div>
        <div className="top-actions">
          <Metric label="Projects" value={projects.length} icon={<Code2 size={18} />} />
          <Metric label="Services" value={serviceCount} icon={<Server size={18} />} />
          <Metric label="Running" value={runningCount} icon={<Activity size={18} />} />
          <button className="metric metric-button" onClick={() => { loadOperationsLibraryStatus(); setShowOperationsLibrary(true); }}>
            <ClipboardList size={18} />
            <span>
              <strong>{operationsLibrary?.validation?.status || "Check"}</strong>
              <small>Ops Library</small>
            </span>
          </button>
          <button className="metric metric-button" onClick={() => setShowPortTree(true)}>
            <Network size={18} />
            <span>
              <strong>Ports</strong>
              <small>Map</small>
            </span>
          </button>
          <button className="metric metric-button" onClick={() => setShowRegister(true)}>
            <Plus size={18} />
            <span>
              <strong>Add</strong>
              <small>Project</small>
            </span>
          </button>
          <button className="icon-button" onClick={loadProjects} aria-label="Refresh projects">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>
      {actionError ? (
        <div className="action-error" role="alert">
          <AlertTriangle size={16} />
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError("")} aria-label="Dismiss action error">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {selected ? (
        <ProjectDetail
          project={selected}
          busy={busy}
          onBack={() => setSelectedId("")}
          onStart={() => runAction(selected.id, "start")}
          onStop={() => runAction(selected.id, "stop")}
          onRestart={() => runAction(selected.id, "restart")}
          onTakeOver={() => runAction(selected.id, "take-over")}
          onGitSync={() => runAction(selected.id, "git-sync")}
          onInitializeProjectManagement={() => initializeProjectManagement(selected.id)}
          onSaveDescription={(description) => saveDescription(selected.id, description)}
          onOpenFolder={() => openFolder(selected.id)}
          onOpenProjectManagementFolder={(fileKey) => openProjectManagementFolder(selected.id, fileKey)}
        />
      ) : (
        <ProjectTable
          busy={busy}
          loading={loading}
          projects={filtered}
          query={query}
          filters={filters}
          onQueryChange={setQuery}
          onFiltersChange={setFilters}
          onOpenProject={(projectId) => setSelectedId(projectId)}
          onStartProject={(projectId) => runAction(projectId, "start")}
          onStopProject={(projectId) => runAction(projectId, "stop")}
          onRestartProject={(projectId) => runAction(projectId, "restart")}
          onTakeOverProject={(projectId) => runAction(projectId, "take-over")}
        />
      )}
      {showPortTree ? <PortTreeModal projects={projects} onClose={() => setShowPortTree(false)} /> : null}
      {showRegister ? <RegisterProjectModal busy={busy === "register"} onSubmit={registerProject} onClose={() => setShowRegister(false)} /> : null}
      {showOperationsLibrary ? <OperationsLibraryModal status={operationsLibrary} onRefresh={loadOperationsLibraryStatus} onClose={() => setShowOperationsLibrary(false)} /> : null}
    </main>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="metric">
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function ProjectTable({
  busy,
  loading,
  projects,
  query,
  filters,
  onQueryChange,
  onFiltersChange,
  onOpenProject,
  onStartProject,
  onStopProject,
  onRestartProject,
  onTakeOverProject,
}) {
  return (
    <section className="project-directory" aria-labelledby="project-directory-title">
      <div className="directory-toolbar">
        <div>
          <h2 id="project-directory-title">Project Directory</h2>
        </div>
        <div className="directory-filters">
          <input
            className="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search projects"
          />
          <Toggle label="Work" checked={filters.work} onChange={() => onFiltersChange((current) => ({ ...current, work: !current.work }))} />
          <Toggle label="RidgePath" checked={filters.ridgepath} onChange={() => onFiltersChange((current) => ({ ...current, ridgepath: !current.ridgepath }))} />
          <Toggle label="Personal" checked={filters.personal} onChange={() => onFiltersChange((current) => ({ ...current, personal: !current.personal }))} />
        </div>
      </div>
      <div className="project-table-wrap">
        <table className="project-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Type</th>
              <th>Framework</th>
              <th>Ports</th>
              <th>Owner</th>
              <th>Repository</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8">Loading projects...</td>
              </tr>
            ) : projects.length ? (
              projects.map((project) => {
                const runtime = getProjectRuntimeState(project, busy);
                return (
                  <tr key={project.id} className="project-table-row" onClick={() => onOpenProject(project.id)}>
                    <td>
                      <div className="project-name-cell">
                        {project.faviconUrl ? <img className="table-favicon" src={project.faviconUrl} alt="" /> : <span className="table-fallback">{project.name.slice(0, 1).toUpperCase()}</span>}
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.folderName}</small>
                        </span>
                      </div>
                    </td>
                    <td><span className={`table-status ${project.status}`}><span className={`status-dot ${project.status}`} />{project.status}</span></td>
                    <td>{project.audience}</td>
                    <td>{project.framework}</td>
                    <td>{portsLabel(project)}</td>
                    <td>{project.owner || "n/a"}</td>
                    <td>{project.git?.branch || project.origin ? (project.git?.dirty ? "Dirty" : "Clean") : "No remote"}</td>
                    <td>
                      <ProjectTableActions
                        project={project}
                        runtime={runtime}
                        onStartProject={onStartProject}
                        onStopProject={onStopProject}
                        onRestartProject={onRestartProject}
                        onTakeOverProject={onTakeOverProject}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8">No matching projects.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectTableActions({ project, runtime, onStartProject, onStopProject, onRestartProject, onTakeOverProject }) {
  const stopEvent = (event) => event.stopPropagation();
  const runTableAction = (event, callback) => {
    event.stopPropagation();
    callback(project.id);
  };

  return (
    <div className="table-actions" onClick={stopEvent}>
      {runtime.primaryUrl ? (
        <a
          className="table-action table-action-launch"
          href={runtime.primaryUrl}
          target="_blank"
          rel="noreferrer"
          title={`Launch ${project.name}`}
          aria-label={`Launch ${project.name}`}
        >
          <Rocket size={15} />
        </a>
      ) : (
        <button className="table-action table-action-launch" type="button" disabled title="Launch available when running" aria-label={`Launch ${project.name} when running`}>
          <Rocket size={15} />
        </button>
      )}
      <button className="table-action table-action-start" type="button" disabled={!runtime.canStart} onClick={(event) => runTableAction(event, onStartProject)} title="Start" aria-label={`Start ${project.name}`}>
        <Play size={15} />
      </button>
      <button className="table-action table-action-restart" type="button" disabled={!runtime.canUseManagedActions} onClick={(event) => runTableAction(event, onRestartProject)} title="Restart" aria-label={`Restart ${project.name}`}>
        <RotateCw size={15} />
      </button>
      <button className="table-action table-action-stop" type="button" disabled={!runtime.canUseManagedActions} onClick={(event) => runTableAction(event, onStopProject)} title="Stop" aria-label={`Stop ${project.name}`}>
        <Square size={14} />
      </button>
      <button className="table-action table-action-take-over" type="button" disabled={!runtime.canTakeOver} onClick={(event) => runTableAction(event, onTakeOverProject)} title="Take over" aria-label={`Take over ${project.name}`}>
        <BadgeCheck size={15} />
      </button>
    </div>
  );
}

function ProjectDetail({ project, busy, onBack, onStart, onStop, onRestart, onTakeOver, onGitSync, onInitializeProjectManagement, onSaveDescription, onOpenFolder, onOpenProjectManagementFolder }) {
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
            <button className="start" disabled={!canStart} onClick={onStart}>
              <Play size={16} />
              Start
            </button>
            {canTakeOver ? (
              <button className="take-over" onClick={onTakeOver}>
                <RotateCw size={16} />
                Take Over
              </button>
            ) : null}
            {hasManagedRunning ? (
              <>
                <button className="restart" disabled={!canUseManagedActions} onClick={onRestart}>
                  <RotateCw size={16} />
                  Restart
                </button>
                <button className="stop" disabled={!canUseManagedActions} onClick={onStop}>
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
              isBusy={isBusy}
            />
          ) : null}
          {activeMenu === "management" ? (
            <ProjectManagementDashboard
              projectManagement={projectManagement}
              onOpen={onOpenProjectManagementFolder}
              onInitialize={onInitializeProjectManagement}
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

function ProjectOverview({ project, editing, draft, onDraftChange, onEdit, onCancelEdit, onSaveDescription, onOpenFolder, onGitSync, isBusy }) {
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
            <button className="secondary-action" onClick={onOpenFolder}>
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
            <button className="secondary-action" disabled={isBusy || !project.origin} onClick={onGitSync}>
              Git Sync
            </button>
          </div>
        </div>
      </div>
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

function ProjectManagementDashboard({ projectManagement, onOpen, onInitialize, isInitializing }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [backlogFilters, setBacklogFilters] = useState({ status: "all", priority: "all", type: "all" });
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    setActiveTab("Overview");
    setBacklogFilters({ status: "all", priority: "all", type: "all" });
    setCopiedPrompt(false);
  }, [projectManagement.dashboardPath]);

  const dashboard = projectManagement.dashboard || {};
  const canOpenFolder = Boolean(projectManagement.initialized);
  const promptContent = projectManagement.codexPrompt?.content || "";

  async function copyCodexPrompt() {
    if (!promptContent) return;
    await navigator.clipboard.writeText(promptContent);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1800);
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
            <button className="secondary-action primary-secondary" type="button" disabled={isInitializing} onClick={onInitialize}>
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
          {activeTab === "Backlog" ? <ProjectManagementBacklog dashboard={dashboard} filters={backlogFilters} onFiltersChange={setBacklogFilters} /> : null}
          {activeTab === "Bugs" ? <ProjectManagementBugs dashboard={dashboard} /> : null}
          {activeTab === "Governance" ? <ProjectManagementGovernance dashboard={dashboard} /> : null}
          {activeTab === "Codex Activity" ? <ProjectManagementCodexActivity dashboard={dashboard} /> : null}
        </>
      )}
      <ProjectManagementFileActions projectManagement={projectManagement} canOpenFolder={canOpenFolder} onOpen={onOpen} />
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

function ProjectManagementBacklog({ dashboard, filters, onFiltersChange }) {
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

function ProjectManagementBugs({ dashboard }) {
  const bugs = Array.isArray(dashboard.bugs) ? dashboard.bugs : null;
  const rows = bugs || [];
  const openCount = rows.filter((bug) => bugGroup(bug?.status) !== "Closed").length;
  const criticalCount = rows.filter((bug) => String(bug?.severity || "").toLowerCase() === "critical").length;
  const highCount = rows.filter((bug) => String(bug?.severity || "").toLowerCase() === "high").length;

  if (!bugs) return <ManualReviewPanel message="Bug data is missing or invalid." />;
  return (
    <div className="pm-panel">
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

function ProjectManagementGovernance({ dashboard }) {
  const governance = dashboard.governance && typeof dashboard.governance === "object" ? dashboard.governance : null;
  if (!governance) return <ManualReviewPanel message="Governance data is missing or invalid." />;
  const phases = Array.isArray(governance.phases) ? governance.phases : [];

  return (
    <div className="pm-panel">
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

function OperationsLibraryModal({ status, onRefresh, onClose }) {
  const validation = status?.validation || {};
  const templateAvailable = validation.templates?.filter((item) => item.exists).length || 0;
  const promptAvailable = validation.prompts?.filter((item) => item.exists).length || 0;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal operations-modal" role="dialog" aria-modal="true" aria-labelledby="operations-library-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Configuration</p>
            <h2 id="operations-library-title">Operations Library Status</h2>
          </div>
          <div className="modal-actions">
            <button className="secondary-action" onClick={onRefresh}>Refresh</button>
            <button className="icon-button" onClick={onClose} aria-label="Close operations library status">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="operations-status">
          <div className="pm-overview-grid compact">
            <Info label="Validation Status" value={validation.status || "Warning"} />
            <Info label="Templates Available" value={`${templateAvailable}/${validation.templates?.length || 0}`} />
            <Info label="Prompts Available" value={`${promptAvailable}/${validation.prompts?.length || 0}`} />
            <Info label="Dashboard Schemas" value={(validation.dashboardSchemaSupport || []).join(", ") || "Needs manual review"} />
          </div>
          <div className="resource-row operations-path-row">
            <div className="resource-meta">
              <FolderOpen size={16} />
              <span>
                <strong>Configured Path</strong>
                <small>{validation.configuredPath || "Needs manual review"}</small>
              </span>
            </div>
          </div>
          {validation.issues?.length ? <OperationsStatusList title="Issues" items={validation.issues} tone="warn" /> : null}
          {validation.warnings?.length ? <OperationsStatusList title="Warnings" items={validation.warnings} tone="warn" /> : null}
          <OperationsAvailability title="Required Folders" items={validation.requiredFolders || []} />
          <OperationsAvailability title="Required Files" items={validation.requiredFiles || []} />
          <OperationsAvailability title="Templates" items={validation.templates || []} />
          <OperationsAvailability title="Prompts" items={validation.prompts || []} />
        </div>
      </section>
    </div>
  );
}

function OperationsStatusList({ title, items, tone = "" }) {
  return (
    <div className={`operations-list ${tone}`}>
      <h3>{title}</h3>
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function OperationsAvailability({ title, items }) {
  return (
    <div className="operations-list">
      <h3>{title}</h3>
      {items.length ? items.map((item) => (
        <span key={`${item.key || item.relativePath}-${item.relativePath}`} className={item.exists ? "" : "warn"}>
          {item.name ? `${item.name}: ` : ""}{item.relativePath} - {item.exists ? "Available" : "Missing"}
        </span>
      )) : <span>Needs manual review</span>}
    </div>
  );
}

function PortTreeModal({ projects, onClose }) {
  const entries = projects
    .flatMap((project) =>
      project.services.map((service) => ({
        key: `${project.id}:${service.id}`,
        project,
        service,
        port: service.port,
      })),
    )
    .sort((left, right) => {
      if (!left.port && !right.port) return left.project.name.localeCompare(right.project.name);
      if (!left.port) return 1;
      if (!right.port) return -1;
      return left.port - right.port || left.project.name.localeCompare(right.project.name);
    });
  const portCounts = entries.reduce((counts, entry) => {
    if (!entry.port) return counts;
    counts.set(entry.port, (counts.get(entry.port) || 0) + 1);
    return counts;
  }, new Map());

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal port-modal" role="dialog" aria-modal="true" aria-labelledby="port-tree-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Port tree</p>
            <h2 id="port-tree-title">Project Port Map</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close port map">
            <X size={18} />
          </button>
        </div>
        <div className="port-tree">
          {entries.length ? (
            entries.map(({ key, project, service, port }) => {
              const conflict = port && portCounts.get(port) > 1;
              return (
                <div className={`port-node ${conflict ? "conflict" : ""}`} key={key}>
                  <div className="port-number">{port || "n/a"}</div>
                  <div className="port-copy">
                    <strong>{project.name}</strong>
                    <small>{service.label} · {project.audience} · {service.framework}</small>
                  </div>
                  {service.portConflict ? <span className="collision"><AlertTriangle size={13} />Conflict</span> : null}
                  <span className={`port-state ${service.managedRunning ? "running" : service.portStatus}`}>{service.managedRunning ? "managed" : service.portStatus}</span>
                </div>
              );
            })
          ) : (
            <div className="empty">No service ports discovered.</div>
          )}
        </div>
      </section>
    </div>
  );
}

const DEFAULT_PROJECT_FORM = {
  name: "",
  audience: "personal",
  port: "",
  applicationClassification: "Internal Business Application",
  technologyStack: "Vite + React + JavaScript",
  repositoryOwner: "treviscleary",
  repositoryVisibility: "Private",
  hostingStrategy: "Vercel",
  hostingPlatform: "",
  packageManager: "npm",
  createStandardDocumentation: true,
  createGovernanceAssets: true,
};

function RegisterProjectModal({ busy, onSubmit, onClose }) {
  const [form, setForm] = useState(DEFAULT_PROJECT_FORM);
  const [dirty, setDirty] = useState(false);
  const [suggestedPorts, setSuggestedPorts] = useState({});

  const fetchSuggestedPorts = () => {
    fetch("/api/ports/suggestions")
      .then((response) => response.json())
      .then((data) => {
        const nextPorts = {
          personal: String(data.personal || ""),
          ridgepath: String(data.ridgepath || ""),
          work: String(data.work || ""),
        };
        setSuggestedPorts(nextPorts);
        setForm((current) => ({ ...current, port: nextPorts[current.audience] || "" }));
      })
      .catch(() => {});
  };
  const setField = (field, value, markDirty = true) => {
    if (markDirty) setDirty(true);
    setForm((current) => ({ ...current, [field]: value }));
  };
  const setAudience = (value) => setForm((current) => ({
    ...current,
    audience: value,
    port: suggestedPorts[value] || "",
    repositoryOwner: value === "personal" ? "treviscleary" : value === "ridgepath" ? "Ridgepath-tech" : current.repositoryOwner,
  }));
  const setHostingStrategy = (value) => setForm((current) => ({
    ...current,
    hostingStrategy: value,
    hostingPlatform: value === "Other" ? current.hostingPlatform : "",
  }));
  const requestClose = () => {
    if (!dirty || window.confirm("Discard this project registration?")) {
      onClose();
    }
  };
  const isFormComplete = Boolean(
    form.name.trim()
    && Number(form.port) >= 1000
    && Number(form.port) <= 65535
    && form.applicationClassification
    && form.technologyStack
    && form.repositoryOwner
    && form.repositoryVisibility
    && form.hostingStrategy
    && (form.hostingStrategy !== "Other" || form.hostingPlatform.trim())
    && form.packageManager
  );

  useEffect(() => {
    fetchSuggestedPorts();
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onClick={requestClose}>
      <section className="modal register-modal" role="dialog" aria-modal="true" aria-labelledby="register-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Registration</p>
            <h2 id="register-title">Add Project</h2>
          </div>
          <button className="icon-button" type="button" onClick={requestClose} aria-label="Close registration">
            <X size={18} />
          </button>
        </div>
        <form
          className="register-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isFormComplete || busy) return;
            onSubmit({ ...form, port: Number(form.port) });
          }}
        >
          <div className="form-grid">
            <label>
              <span>Project name</span>
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
            </label>
            <div className="field-group">
              <span>Audience</span>
              <SegmentedControl
                value={form.audience}
                options={[
                  { value: "personal", label: "Personal" },
                  { value: "ridgepath", label: "RidgePath" },
                  { value: "work", label: "Work" },
                ]}
                onChange={(value) => {
                  setDirty(true);
                  setAudience(value);
                }}
              />
            </div>
            <label>
              <span>Assigned port</span>
              <input type="number" value={form.port} onChange={(event) => setField("port", event.target.value)} min="1000" max="65535" required />
            </label>
            <label>
              <span>Application classification</span>
              <select value={form.applicationClassification} onChange={(event) => setField("applicationClassification", event.target.value)}>
                <option>Internal Business Application</option>
                <option>Customer Portal / SaaS</option>
                <option>Public Website</option>
                <option>API Service</option>
                <option>Power Platform Solution</option>
                <option>Automation Project</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              <span>Technology stack</span>
              <select value={form.technologyStack} onChange={(event) => setField("technologyStack", event.target.value)}>
                <option>Vite + React + TypeScript</option>
                <option>Vite + React + JavaScript</option>
                <option>Next.js + TypeScript</option>
                <option>Power Platform</option>
                <option>Python</option>
                <option>C#</option>
                <option>Mixed / Other</option>
              </select>
            </label>
            <label>
              <span>Repository owner</span>
              <select value={form.repositoryOwner} onChange={(event) => setField("repositoryOwner", event.target.value)} required>
                <option value="treviscleary">treviscleary</option>
                <option value="InfinityHealthcareConsulting">InfinityHealthcareConsulting</option>
                <option value="Ridgepath-tech">Ridgepath-tech</option>
              </select>
            </label>
            <div className="field-group">
              <span>Repository visibility</span>
              <SegmentedControl
                value={form.repositoryVisibility}
                options={[
                  { value: "Private", label: "Private" },
                  { value: "Public", label: "Public" },
                ]}
                onChange={(value) => setField("repositoryVisibility", value)}
              />
            </div>
            <label>
              <span>Hosting strategy</span>
              <select value={form.hostingStrategy} onChange={(event) => {
                setDirty(true);
                setHostingStrategy(event.target.value);
              }}>
                <option>Vercel</option>
                <option>Other</option>
                <option>None yet</option>
              </select>
            </label>
            {form.hostingStrategy === "Other" ? (
              <label>
                <span>Hosting platform</span>
                <input value={form.hostingPlatform} onChange={(event) => setField("hostingPlatform", event.target.value)} placeholder="Name the platform" required />
              </label>
            ) : null}
            <label>
              <span>Package manager</span>
              <select value={form.packageManager} onChange={(event) => setField("packageManager", event.target.value)}>
                <option>npm</option>
                <option>pnpm</option>
                <option>yarn</option>
                <option>dotnet</option>
                <option>pip</option>
                <option>none</option>
              </select>
            </label>
          </div>
          <div className="toggle-grid">
            <label className="check-row">
              <input type="checkbox" checked={form.createStandardDocumentation} onChange={(event) => setField("createStandardDocumentation", event.target.checked)} />
              <span>Create standard folders</span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={form.createGovernanceAssets} onChange={(event) => setField("createGovernanceAssets", event.target.checked)} />
              <span>Create governance handoff</span>
            </label>
          </div>
          <p className="form-note">Registers the project, writes Bootstrap Wizard handoff details, and lets RidgePath Forge discover it. It will not start until you click Start.</p>
          <div className="form-actions">
            <button className="secondary-action" type="button" onClick={requestClose}>Cancel</button>
            <button className="secondary-action primary-secondary" type="submit" disabled={busy || !isFormComplete}>{busy ? "Adding..." : "Register Project"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="segmented-control" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "active" : ""}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
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

function projectManagementRow(source, fields) {
  return fields.map((field) => {
    const value = source?.[field];
    return Array.isArray(value) ? listValue(value) : fieldValue(value);
  });
}

function bugGroup(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "validating") return "Validating";
  if (normalized === "blocked") return "Blocked";
  if (["closed", "deferred", "duplicate", "out-of-scope"].includes(normalized)) return "Closed";
  return "Open";
}

function getProjectRuntimeState(project, busy = "") {
  const services = Array.isArray(project.services) ? project.services : [];
  const isBusy = busy.startsWith(`${project.id}:`);
  const isRunning = project.status === "running";
  const hasManagedRunning = project.managedRunning || services.some((service) => service.managedRunning);
  const canStart = !isBusy && !isRunning && services.some((service) => service.available);
  const canUseManagedActions = !isBusy && hasManagedRunning;
  const canTakeOver = !isBusy && isRunning && !hasManagedRunning && services.some((service) => service.available && service.portStatus === "open");
  const primary = services.find((service) => service.kind === "primary" && service.port) || services.find((service) => service.port);
  const canOpenPrimary = isRunning && primary?.port && (primary?.managedRunning || primary?.portStatus === "open");
  return {
    isBusy,
    isRunning,
    hasManagedRunning,
    canStart,
    canUseManagedActions,
    canTakeOver,
    primaryUrl: canOpenPrimary ? `http://localhost:${primary.port}` : "",
  };
}

function portsLabel(project) {
  const ports = project.services.map((service) => service.port).filter(Boolean);
  return ports.length ? ports.join(", ") : "n/a";
}

const rootElement = document.getElementById("root");
const appRoot = window.__LOCAL_PROJECT_LAUNCHER_ROOT__ || createRoot(rootElement);
window.__LOCAL_PROJECT_LAUNCHER_ROOT__ = appRoot;
appRoot.render(<App />);
