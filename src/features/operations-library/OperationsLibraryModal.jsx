import React from "react";
import { FolderOpen, X } from "lucide-react";

export function OperationsLibraryModal({ status, onRefresh, onClose }) {
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
            <OperationsInfo label="Validation Status" value={validation.status || "Warning"} />
            <OperationsInfo label="Templates Available" value={`${templateAvailable}/${validation.templates?.length || 0}`} />
            <OperationsInfo label="Prompts Available" value={`${promptAvailable}/${validation.prompts?.length || 0}`} />
            <OperationsInfo label="Dashboard Schemas" value={(validation.dashboardSchemaSupport || []).join(", ") || "Needs manual review"} />
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

function OperationsInfo({ label, value, tone }) {
  return (
    <div className="info">
      <small>{label}</small>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
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
