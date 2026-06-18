import React, { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, ExternalLink, Globe2, Rocket, Search } from "lucide-react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Production Ready" },
  { key: "gaps", label: "Needs URL" },
  { key: "local", label: "Local Only" },
];

export function PublishingWorkspace({
  projects = [],
  busy = "",
  localControlsEnabled = false,
  onOpenProject,
  onLinkDemoPortal,
  onCreatePortfolioDraft,
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const stats = useMemo(() => publishingStats(projects), [projects]);
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects
      .filter((project) => matchesFilter(project, filter))
      .filter((project) => !needle || [project.name, project.folderName, project.description, project.productionUrl, project.liveUrl].filter(Boolean).some((value) => value.toLowerCase().includes(needle)))
      .sort((left, right) => readinessRank(left) - readinessRank(right) || left.name.localeCompare(right.name));
  }, [projects, filter, query]);

  return (
    <section className="publishing-workspace" aria-labelledby="publishing-workspace-title">
      <div className="overview-hero publishing-hero">
        <div>
          <p className="eyebrow">External Surfaces</p>
          <h2 id="publishing-workspace-title">Publishing</h2>
          <p>Review production URLs, local preview gaps, RidgePath demo portal readiness, and portfolio draft actions across the project catalog.</p>
        </div>
        <div className="publishing-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search publishing surfaces" />
        </div>
      </div>

      <div className="overview-metrics publishing-metrics">
        <PublishingMetric label="Projects" value={projects.length} detail="Catalog records" />
        <PublishingMetric label="Production URLs" value={stats.productionReady} detail="Shareable public surfaces" tone="success" />
        <PublishingMetric label="Needs Production URL" value={stats.needsProductionUrl} detail="Local/demo gap" tone={stats.needsProductionUrl ? "warning" : "success"} />
        <PublishingMetric label="Local Preview Only" value={stats.localOnly} detail="Not client-shareable" tone={stats.localOnly ? "warning" : "success"} />
      </div>

      <div className="publishing-filterbar" role="tablist" aria-label="Publishing filters">
        {FILTERS.map((item) => (
          <button key={item.key} type="button" className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="publishing-list">
        {visibleProjects.length ? visibleProjects.map((project) => (
          <PublishingProjectCard
            key={project.id}
            project={project}
            busy={busy}
            localControlsEnabled={localControlsEnabled}
            onOpenProject={onOpenProject}
            onLinkDemoPortal={onLinkDemoPortal}
            onCreatePortfolioDraft={onCreatePortfolioDraft}
          />
        )) : (
          <div className="empty compact-empty">No projects match the current publishing filter.</div>
        )}
      </div>
    </section>
  );
}

function PublishingProjectCard({ project, busy, localControlsEnabled, onOpenProject, onLinkDemoPortal, onCreatePortfolioDraft }) {
  const productionUrl = productionSurface(project);
  const localUrl = localSurface(project);
  const localOnly = !productionUrl && Boolean(localUrl);
  const missingUrl = !productionUrl;
  const isPortfolioBusy = busy === `${project.id}:create-portfolio-draft`;
  const isDemoBusy = busy === `${project.id}:link-demo-portal`;

  return (
    <article className={`publishing-card ${missingUrl ? "needs-url" : "ready"}`}>
      <div className="publishing-card-main">
        <div className="publishing-title">
          {missingUrl ? <AlertTriangle size={17} /> : <Globe2 size={17} />}
          <span>
            <strong>{project.name}</strong>
            <small>{project.folderName || project.id}</small>
          </span>
        </div>
        <p>{project.description || "No project description recorded."}</p>
        <div className="publishing-badges">
          <span className={productionUrl ? "good" : "warn"}>{productionUrl ? "Production URL" : "Needs production URL"}</span>
          {localOnly ? <span className="warn">Local preview only</span> : null}
          <span>{project.audience || "unknown"}</span>
          <span>{project.framework || "Unknown"}</span>
          {project.projectManagement?.status ? <span>{project.projectManagement.status}</span> : null}
        </div>
        <div className="publishing-url-list">
          <PublishingUrl label="Production" value={productionUrl || "Not configured"} href={productionUrl} warn={!productionUrl} />
          <PublishingUrl label="Local Preview" value={localUrl || "Not running or not configured"} href={localUrl} warn={localOnly} />
        </div>
      </div>
      <div className="publishing-actions">
        <button className="secondary-action" type="button" onClick={() => onOpenProject(project.id)}>
          Open Project
        </button>
        {productionUrl ? (
          <a className="secondary-action" href={productionUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            Open URL
          </a>
        ) : null}
        <button className="secondary-action primary-secondary" type="button" disabled={isDemoBusy} onClick={() => onLinkDemoPortal(project.id)}>
          <Rocket size={15} />
          {isDemoBusy ? "Opening..." : "Demo Portal"}
        </button>
        <button className="secondary-action" type="button" disabled={!localControlsEnabled || isPortfolioBusy} onClick={() => onCreatePortfolioDraft(project.id)} title={localControlsEnabled ? "Create or update portfolio draft" : "Requires a paired local runner"}>
          <BookOpen size={15} />
          {isPortfolioBusy ? "Creating..." : "Portfolio Draft"}
        </button>
      </div>
    </article>
  );
}

function PublishingUrl({ label, value, href, warn = false }) {
  return (
    <div className={`publishing-url ${warn ? "warn" : ""}`}>
      <span>{label}</span>
      {href ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : <strong>{value}</strong>}
    </div>
  );
}

function publishingStats(projects) {
  return projects.reduce((stats, project) => {
    const production = productionSurface(project);
    const local = localSurface(project);
    if (production) stats.productionReady += 1;
    if (!production) stats.needsProductionUrl += 1;
    if (!production && local) stats.localOnly += 1;
    return stats;
  }, { productionReady: 0, needsProductionUrl: 0, localOnly: 0 });
}

function matchesFilter(project, filter) {
  const production = productionSurface(project);
  const local = localSurface(project);
  if (filter === "ready") return Boolean(production);
  if (filter === "gaps") return !production;
  if (filter === "local") return !production && Boolean(local);
  return true;
}

function readinessRank(project) {
  if (!productionSurface(project) && localSurface(project)) return 0;
  if (!productionSurface(project)) return 1;
  return 2;
}

function productionSurface(project) {
  return isProductionHttpUrl(project.productionUrl) ? project.productionUrl : "";
}

function localSurface(project) {
  return project.liveUrl || project.externalUrl || "";
}

function isProductionHttpUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) && !/localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./i.test(url);
}

function PublishingMetric({ label, value, detail, tone = "" }) {
  return (
    <div className={`overview-metric publishing-metric ${tone}`}>
      {tone === "warning" ? <AlertTriangle size={18} /> : <Globe2 size={18} />}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
      <em>{detail}</em>
    </div>
  );
}
