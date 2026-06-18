import { AlertTriangle, X } from "lucide-react";

export function PortTreeModal({ projects, onClose }) {
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

