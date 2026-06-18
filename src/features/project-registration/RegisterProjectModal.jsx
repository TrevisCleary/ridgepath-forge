import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiJson } from "../../lib/api.js";

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
  projectContext: "",
  keyFeatures: "",
  createStandardDocumentation: true,
  createGovernanceAssets: true,
};

export function RegisterProjectModal({ busy, onSubmit, onClose }) {
  const [form, setForm] = useState(DEFAULT_PROJECT_FORM);
  const [dirty, setDirty] = useState(false);
  const [suggestedPorts, setSuggestedPorts] = useState({});

  const fetchSuggestedPorts = () => {
    apiJson("/api/ports/suggestions")
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
            <label className="full-span">
              <span>Overall context</span>
              <textarea
                value={form.projectContext}
                onChange={(event) => setField("projectContext", event.target.value)}
                placeholder="Business purpose, audience, constraints, integrations, and what success looks like."
              />
            </label>
            <label className="full-span">
              <span>Key features</span>
              <textarea
                value={form.keyFeatures}
                onChange={(event) => setField("keyFeatures", event.target.value)}
                placeholder="One feature per line, or a concise paragraph of expected capabilities."
              />
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
