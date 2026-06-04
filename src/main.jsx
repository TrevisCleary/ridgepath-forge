import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Code2,
  ExternalLink,
  FolderOpen,
  GitPullRequestArrow,
  Network,
  Pencil,
  Play,
  RefreshCw,
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
  const [filters, setFilters] = useState({ work: true, personal: true });
  const [showPortTree, setShowPortTree] = useState(false);

  async function loadProjects() {
    const response = await fetch("/api/projects");
    const data = await response.json();
    setRoot(data.root);
    setProjects(data.projects || []);
    setSelectedId((current) => current || data.projects?.[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
    const timer = window.setInterval(loadProjects, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  async function runAction(projectId, action) {
    setBusy(`${projectId}:${action}`);
    try {
      const response = await fetch(`/api/projects/${projectId}/${action}`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Action failed.");
      }
      await loadProjects();
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      const audienceVisible =
        (filters.work && project.audience === "work") ||
        (filters.personal && project.audience === "personal") ||
        (filters.work && filters.personal && project.audience === "unknown");
      if (!audienceVisible) return false;
      if (!needle) return true;
      return [project.name, project.folderName, project.framework, project.description, project.owner]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [projects, query, filters]);

  const selected = projects.find((project) => project.id === selectedId) || filtered[0];
  const runningCount = projects.filter((project) => project.status === "running").length;
  const serviceCount = projects.reduce((count, project) => count + project.services.length, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/assets/local-launcher-logo.png" alt="" />
          <div className="brand-copy">
            <p className="eyebrow">Localhost launcher</p>
            <h1>Development Projects</h1>
            <div className="root-line">{root || "C:\\Development\\Projects"}</div>
          </div>
        </div>
        <div className="top-actions">
          <Metric label="Projects" value={projects.length} icon={<Code2 size={18} />} />
          <Metric label="Services" value={serviceCount} icon={<Server size={18} />} />
          <Metric label="Running" value={runningCount} icon={<Activity size={18} />} />
          <button className="metric metric-button" onClick={() => setShowPortTree(true)}>
            <Network size={18} />
            <span>
              <strong>Ports</strong>
              <small>Map</small>
            </span>
          </button>
          <button className="icon-button" onClick={loadProjects} aria-label="Refresh projects">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="project-list">
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter projects"
          />
          <div className="filter-row">
            <Toggle label="Work" checked={filters.work} onChange={() => setFilters((current) => ({ ...current, work: !current.work }))} />
            <Toggle label="Personal" checked={filters.personal} onChange={() => setFilters((current) => ({ ...current, personal: !current.personal }))} />
          </div>
          <div className="list-scroll">
            {loading ? (
              <div className="empty">Loading projects...</div>
            ) : (
              filtered.map((project) => (
                <button
                  key={project.id}
                  className={`project-row ${selected?.id === project.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(project.id)}
                >
                  <span className={`status-dot ${project.status}`} />
                  <span className="row-text">
                    <strong>{project.name}</strong>
                    <small>{project.audience} · {project.framework}</small>
                  </span>
                  <span className="port-mini">{portsLabel(project)}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {selected ? (
          <ProjectDetail
            project={selected}
            busy={busy}
            onStart={() => runAction(selected.id, "start")}
            onStop={() => runAction(selected.id, "stop")}
            onRestart={() => runAction(selected.id, "restart")}
            onGitSync={() => runAction(selected.id, "git-sync")}
            onSaveDescription={(description) => saveDescription(selected.id, description)}
            onOpenFolder={() => openFolder(selected.id)}
          />
        ) : (
          <section className="detail empty">No project selected.</section>
        )}
      </section>
      {showPortTree ? <PortTreeModal projects={projects} onClose={() => setShowPortTree(false)} /> : null}
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

function ProjectDetail({ project, busy, onStart, onStop, onRestart, onGitSync, onSaveDescription, onOpenFolder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description);
  const isBusy = busy.startsWith(`${project.id}:`);
  const isRunning = project.status === "running";
  const canStart = !isBusy && !isRunning && project.services.some((service) => service.available);
  const canUseRunningActions = !isBusy && isRunning;
  const primary = project.services.find((service) => service.kind === "primary" && service.port);
  const canOpenPrimary = canUseRunningActions && primary?.managedRunning && primary?.portStatus === "open";
  const primaryUrl = canOpenPrimary ? `http://localhost:${primary.port}` : "";

  useEffect(() => {
    setDraft(project.description);
    setEditing(false);
  }, [project.id, project.description]);

  return (
    <section className="detail">
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
          <button className="git-sync" disabled={isBusy || !project.origin} onClick={onGitSync}>
            <GitPullRequestArrow size={16} />
            Git Sync
          </button>
          {isRunning ? (
            <>
              <button className="restart" disabled={!canUseRunningActions} onClick={onRestart}>
                <RotateCw size={16} />
                Restart
              </button>
              <button className="stop" disabled={!canUseRunningActions} onClick={onStop}>
                <Square size={15} />
                Stop
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="description-row">
        {editing ? (
          <>
            <textarea className="description-input" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button className="icon-button" onClick={() => onSaveDescription(draft)} aria-label="Save description">
              <Save size={17} />
            </button>
            <button className="icon-button" onClick={() => { setDraft(project.description); setEditing(false); }} aria-label="Cancel edit">
              <X size={17} />
            </button>
          </>
        ) : (
          <>
            <p className="description">{project.description}</p>
            <button className="icon-button" onClick={() => setEditing(true)} aria-label="Edit description">
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

      <button className="path-line" onClick={onOpenFolder}>
        <FolderOpen size={15} />
        <span>{project.path}</span>
      </button>

      <div className="detail-scroll">
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

        <div className="section-title">
          <Terminal size={17} />
          <h3>Recent output</h3>
        </div>
        <pre className="logs">{project.logs?.length ? project.logs.join("\n") : "No launcher output yet."}</pre>
      </div>
    </section>
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

function Info({ label, value, tone }) {
  return (
    <div className="info">
      <small>{label}</small>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function ServiceRow({ service }) {
  const url = service.port && service.managedRunning && service.portStatus === "open" ? `http://localhost:${service.port}` : "";
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

function portsLabel(project) {
  const ports = project.services.map((service) => service.port).filter(Boolean);
  return ports.length ? ports.join(", ") : "n/a";
}

createRoot(document.getElementById("root")).render(<App />);
