import { BadgeCheck, Play, Rocket, RotateCw, Square } from "lucide-react";
import { getProjectRuntimeState, portsLabel } from "./runtime.js";

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}


export function ProjectTable({
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

