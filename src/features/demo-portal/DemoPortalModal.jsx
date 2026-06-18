import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Mail, RotateCw, Save, X } from "lucide-react";
import { apiJson } from "../../lib/api.js";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function defaultForm(project) {
  const clientSlug = slugify(project.id || project.folderName || project.name);
  const siteSlug = slugify(project.folderName || project.id || project.name);
  return {
    clientName: project.name || project.id,
    clientSlug,
    clientEmail: "",
    organizationName: "",
    siteTitle: project.name || project.id,
    siteSlug,
    projectStatus: project.productionUrl ? "Production demo linked" : "Needs production deployment URL",
    projectPhase: project.projectManagement?.dashboard?.summary?.currentPhase || "Needs review",
    progress: 50,
    updateMessage: project.projectManagement?.dashboard?.summary?.nextCodexAction || `${project.name} was linked to the RidgePath demo portal from Forge.`,
    active: true,
    publicDemoUrl: `https://ridgepath.io/demos/${clientSlug}`,
    deepLink: `https://ridgepath.io/demos/${clientSlug}?site=${encodeURIComponent(siteSlug)}`,
  };
}

function draftFromResultOrForm(result, form) {
  if (result?.emailDraft) return result.emailDraft;
  return {
    to: form.clientEmail,
    subject: "Your RidgePath demo workspace is ready",
    body: [
      form.clientName ? `Hi ${form.clientName},` : "Hi,",
      "",
      "Your RidgePath demo workspace is ready for review.",
      "",
      `Workspace link: ${form.deepLink || form.publicDemoUrl}`,
      "Use your RidgePath demo portal password. If you need a reset, reply to this email.",
      "",
      "Thank you,",
      "RidgePath Technologies",
    ].join("\n"),
  };
}

async function copyText(content) {
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function DemoPortalModal({ project, onClose, onSaved }) {
  const [form, setForm] = useState(() => defaultForm(project));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [storage, setStorage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      setLoading(true);
      setError("");
      try {
        const data = await apiJson(`/api/projects/${project.id}/demo-portal-config`);
        if (cancelled) return;
        setForm({ ...defaultForm(project), ...(data.config || {}) });
        setEmailConfigured(Boolean(data.emailConfigured));
        setStorage(data.storage || "");
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load demo portal configuration.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const emailDraft = useMemo(() => draftFromResultOrForm(result, form), [result, form]);
  const productionUrl = project.productionUrl || "";
  const localUrl = project.liveUrl && project.liveUrl !== productionUrl ? project.liveUrl : "";

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "clientSlug" || field === "siteSlug") {
        const clientSlug = field === "clientSlug" ? slugify(value) : current.clientSlug;
        const siteSlug = field === "siteSlug" ? slugify(value) : current.siteSlug;
        next[field] = field === "clientSlug" ? clientSlug : siteSlug;
        next.publicDemoUrl = `https://ridgepath.io/demos/${clientSlug}`;
        next.deepLink = `${next.publicDemoUrl}?site=${encodeURIComponent(siteSlug)}`;
      }
      if (field === "clientName" && !current.clientSlug) {
        next.clientSlug = slugify(value);
      }
      if (field === "siteTitle" && !current.siteSlug) {
        next.siteSlug = slugify(value);
      }
      return next;
    });
  }

  async function submit(endpoint, action) {
    setBusy(action);
    setError("");
    try {
      const data = await apiJson(`/api/projects/${project.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(data);
      setStorage(data.storage || storage);
      if (onSaved) await onSaved(data);
      return data;
    } catch (submitError) {
      setError(submitError.message || "Demo portal action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function copyDraft() {
    await copyText(`To: ${emailDraft.to || ""}\nSubject: ${emailDraft.subject}\n\n${emailDraft.body}`);
    setCopied("email");
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function copyDeepLink() {
    await copyText(result?.deepLink || form.deepLink || form.publicDemoUrl);
    setCopied("link");
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function copyCredential() {
    if (!result?.generatedPassword) return;
    await copyText(result.generatedPassword);
    setCopied("credential");
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <section className="modal demo-portal-modal" role="dialog" aria-modal="true" aria-labelledby="demo-portal-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">RidgePath Demo Portal</p>
            <h2 id="demo-portal-title">Configure client demo access</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close demo portal modal" disabled={Boolean(busy)}>
            <X size={18} />
          </button>
        </div>

        <div className="demo-portal-body">
          {error ? (
            <StatusPanel tone="warn" icon={<AlertTriangle size={20} />} title="Demo portal action failed" body={error} />
          ) : null}
          {result ? (
            <StatusPanel
              tone="success"
              icon={<Check size={20} />}
              title={`${result.created ? "Created" : "Updated"} ${result.clientName}`}
              body={`${result.storage === "neon" ? "Stored in Neon" : "Stored in local fallback JSON"} at ${result.deepLink || result.publicDemoUrl}.`}
            />
          ) : null}
          {!productionUrl ? (
            <StatusPanel
              tone="warn"
              icon={<AlertTriangle size={20} />}
              title="Production deployment URL missing"
              body="Forge can create the client workspace now, but the demo site itself still needs a production URL before it is ready to share."
            />
          ) : null}

          <div className="demo-context-grid">
            <PreviewRow label="Project" value={project.name} />
            <PreviewRow label="Local path" value={project.path} muted />
            <PreviewRow label="Production URL" value={productionUrl || "Not configured"} href={productionUrl} warn={!productionUrl} />
            <PreviewRow label="Local URL" value={localUrl || "Not selected"} muted />
            <PreviewRow label="Storage" value={storage || "Checking"} />
          </div>

          {loading ? (
            <div className="empty compact-empty">Loading demo portal configuration...</div>
          ) : (
            <form className="demo-config-form" onSubmit={(event) => { event.preventDefault(); submit("demo-portal-config", "save"); }}>
              <fieldset>
                <legend>Client Workspace</legend>
                <label>
                  Client display name
                  <input value={form.clientName} onChange={(event) => updateField("clientName", event.target.value)} required />
                </label>
                <label>
                  Client slug
                  <input value={form.clientSlug} onChange={(event) => updateField("clientSlug", event.target.value)} required />
                </label>
                <label>
                  Contact email
                  <input type="email" value={form.clientEmail} onChange={(event) => updateField("clientEmail", event.target.value)} placeholder="client@example.com" />
                </label>
                <label>
                  Organization
                  <input value={form.organizationName} onChange={(event) => updateField("organizationName", event.target.value)} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Demo Site</legend>
                <label>
                  Site display name
                  <input value={form.siteTitle} onChange={(event) => updateField("siteTitle", event.target.value)} required />
                </label>
                <label>
                  Site slug
                  <input value={form.siteSlug} onChange={(event) => updateField("siteSlug", event.target.value)} required />
                </label>
                <label>
                  Project status
                  <input value={form.projectStatus} onChange={(event) => updateField("projectStatus", event.target.value)} />
                </label>
                <label>
                  Progress
                  <input type="number" min="0" max="100" value={form.progress} onChange={(event) => updateField("progress", event.target.value)} />
                </label>
                <label className="demo-wide-field">
                  Client-facing update
                  <textarea value={form.updateMessage} onChange={(event) => updateField("updateMessage", event.target.value)} rows={3} />
                </label>
                <label className="demo-check-field">
                  <input type="checkbox" checked={form.active} onChange={(event) => updateField("active", event.target.checked)} />
                  Active and visible to client
                </label>
              </fieldset>

              <fieldset>
                <legend>Connection Details</legend>
                <PreviewRow label="Workspace link" value={form.publicDemoUrl} href={form.publicDemoUrl} />
                <PreviewRow label="Deep link" value={form.deepLink} href={form.deepLink} />
                {result?.generatedPassword ? (
                  <div className="demo-credential">
                    <span>Temporary credential</span>
                    <code>{result.generatedPassword}</code>
                    <button className="secondary-action" type="button" onClick={copyCredential}>
                      <Copy size={15} />
                      {copied === "credential" ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <div className="demo-credential muted">
                    <span>Credential</span>
                    <strong>Existing password is preserved unless you reset access.</strong>
                  </div>
                )}
                <label className="demo-wide-field">
                  Email preview
                  <textarea readOnly value={`To: ${emailDraft.to || ""}\nSubject: ${emailDraft.subject}\n\n${emailDraft.body}`} rows={8} />
                </label>
                {!emailConfigured ? <small className="demo-help">Email sending is not configured, so Forge will prepare a copyable draft.</small> : null}
              </fieldset>

              <div className="modal-actions demo-modal-actions">
                <button className="secondary-action" type="button" onClick={onClose} disabled={Boolean(busy)}>
                  Cancel
                </button>
                <button className="secondary-action" type="button" onClick={copyDeepLink} disabled={Boolean(busy)}>
                  <Copy size={15} />
                  {copied === "link" ? "Copied" : "Copy Link"}
                </button>
                <button className="secondary-action" type="button" onClick={copyDraft} disabled={Boolean(busy)}>
                  <Copy size={15} />
                  {copied === "email" ? "Copied" : "Copy Email"}
                </button>
                <button className="secondary-action" type="button" onClick={() => submit("demo-portal-reset-access", "reset")} disabled={Boolean(busy)}>
                  <RotateCw size={15} />
                  {busy === "reset" ? "Resetting..." : "Reset Access"}
                </button>
                <button className="secondary-action" type="button" onClick={() => submit("demo-portal-send-link", "send")} disabled={Boolean(busy)}>
                  <Mail size={15} />
                  {busy === "send" ? "Sending..." : emailConfigured ? "Send Link" : "Prepare Link"}
                </button>
                <button className="secondary-action primary-secondary" type="submit" disabled={Boolean(busy)}>
                  <Save size={15} />
                  {busy === "save" ? "Saving..." : "Save Access"}
                </button>
                {(result?.deepLink || form.deepLink) ? (
                  <a className="secondary-action primary-secondary" href={result?.deepLink || form.deepLink} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Open
                  </a>
                ) : null}
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusPanel({ tone = "", icon, title, body }) {
  return (
    <div className={`demo-result ${tone}`}>
      <div className="demo-result-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function PreviewRow({ label, value, href = "", muted = false, warn = false }) {
  const className = ["demo-preview-row", muted ? "muted" : "", warn ? "warn" : ""].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">{value}</a>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}
