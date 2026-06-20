import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Mail, RotateCw, Save, UserMinus, UserPlus, X } from "lucide-react";
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
    approvedEmails: "",
    siteTitle: project.name || project.id,
    siteSlug,
    demoSiteUrl: project.productionUrl || "",
    presentationMode: "iframe",
    provisioningStatus: "pending_vercel_domain",
    tokenTtlHours: 72,
    projectStatus: project.productionUrl ? "Production demo linked" : "Needs production deployment URL",
    projectPhase: project.projectManagement?.dashboard?.summary?.currentPhase || "Needs review",
    progress: 50,
    updateMessage: project.projectManagement?.dashboard?.summary?.nextCodexAction || `${project.name} was linked to the RidgePath demo portal from Forge.`,
    active: true,
    publicDemoUrl: `https://ridgepath.io/demos/${clientSlug}`,
    deepLink: `https://ridgepath.io/demos/${clientSlug}/sites/${encodeURIComponent(siteSlug)}`,
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
      "Use the private expiring link sent to your approved email address. If it expires, request a fresh link from the demo access page.",
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
  const [recipientEmail, setRecipientEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      setLoading(true);
      setError("");
      try {
        const data = await apiJson(`/api/projects/${project.id}/demo-portal-config`);
        if (cancelled) return;
        const loadedConfig = { ...(data.config || {}) };
        loadedConfig.approvedEmails = Array.isArray(loadedConfig.approvedEmails)
          ? loadedConfig.approvedEmails.join("\n")
          : loadedConfig.approvedEmailsText || loadedConfig.approvedEmails || "";
        setForm({ ...defaultForm(project), ...loadedConfig });
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
  const productionUrl = form.demoSiteUrl || project.productionUrl || "";
  const localUrl = project.liveUrl && project.liveUrl !== productionUrl ? project.liveUrl : "";
  const provisioningStatus = result?.provisioningStatus || form.provisioningStatus || "pending_vercel_domain";
  const readyToShare = result?.readyToShare ?? provisioningStatus === "ready";
  const shareLink = readyToShare ? (result?.deepLink || form.deepLink || form.publicDemoUrl) : "";
  const approvedRecipients = result?.approvedEmails || form.approvedEmails || "";
  const approvedRecipientText = Array.isArray(approvedRecipients)
    ? approvedRecipients.map((entry) => typeof entry === "string" ? entry : `${entry.email}${entry.status && entry.status !== "active" ? ` (${entry.status})` : ""}`).join("\n")
    : approvedRecipients;

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "clientSlug" || field === "siteSlug") {
        const clientSlug = field === "clientSlug" ? slugify(value) : current.clientSlug;
        const siteSlug = field === "siteSlug" ? slugify(value) : current.siteSlug;
        next[field] = field === "clientSlug" ? clientSlug : siteSlug;
        next.publicDemoUrl = `https://ridgepath.io/demos/${clientSlug}`;
        next.deepLink = `${next.publicDemoUrl}/sites/${encodeURIComponent(siteSlug)}`;
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

  async function submit(endpoint, action, extra = {}) {
    setBusy(action);
    setError("");
    try {
      const data = await apiJson(`/api/projects/${project.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...extra }),
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

  async function recipientAction(endpoint, action) {
    const data = await submit(endpoint, action, { recipientEmail });
    if (data?.approvedEmails) {
      const nextEmails = data.approvedEmails
        .filter((entry) => typeof entry === "string" || (entry?.status || "active") === "active")
        .map((entry) => typeof entry === "string" ? entry : entry.email)
        .filter(Boolean)
        .join("\n");
      setForm((current) => ({ ...current, approvedEmails: nextEmails }));
    }
  }

  async function copyDraft() {
    await copyText(`To: ${emailDraft.to || ""}\nSubject: ${emailDraft.subject}\n\n${emailDraft.body}`);
    setCopied("email");
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function copyDeepLink() {
    if (!shareLink) return;
    await copyText(shareLink);
    setCopied("link");
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
              body={`${result.storage === "neon" ? "Stored in Neon" : "Stored in local fallback JSON"}. Provisioning is ${result.provisioningStatus || "pending"}.`}
            />
          ) : null}
          {result?.email ? (
            <StatusPanel
              tone={result.email.sent ? "success" : "warn"}
              icon={result.email.sent ? <Check size={20} /> : <AlertTriangle size={20} />}
              title={result.email.sent ? "Access link sent" : "Access link not sent"}
              body={result.email.message || (result.email.sent ? "The private link was generated and emailed server-side." : "Review email configuration and provisioning status.")}
            />
          ) : null}
          {result?.cloudflareProvisioning?.id ? (
            <StatusPanel
              tone="success"
              icon={<Check size={20} />}
              title="Cloudflare provisioning queued"
              body={`Command Center proposal ${result.cloudflareProvisioning.id} is ready for a Codex runner on Waypoint or this computer.`}
            />
          ) : null}
          {result?.cloudflareProvisioning?.queued === false ? (
            <StatusPanel
              tone="warn"
              icon={<AlertTriangle size={20} />}
              title="Cloudflare provisioning was not queued"
              body={result.cloudflareProvisioning.error || "Create the Cloudflare Access app manually or retry after Command Center storage is available."}
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
            <PreviewRow label="Provisioning" value={provisioningStatus} warn={!readyToShare} />
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
                <label className="demo-wide-field">
                  Approved recipient emails
                  <textarea value={form.approvedEmails} onChange={(event) => updateField("approvedEmails", event.target.value)} placeholder="one@example.com, two@example.com" rows={3} />
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
                <label className="demo-wide-field">
                  Demo site URL
                  <input value={form.demoSiteUrl} onChange={(event) => updateField("demoSiteUrl", event.target.value)} placeholder="https://client-site.vercel.app" />
                </label>
                <label>
                  Presentation mode
                  <select value={form.presentationMode} onChange={(event) => updateField("presentationMode", event.target.value)}>
                    <option value="iframe">RidgePath frame</option>
                    <option value="external">External link</option>
                    <option value="proxy">Proxy later</option>
                    <option value="hosted">Hosted later</option>
                  </select>
                </label>
                <label>
                  Provisioning status
                  <select value={form.provisioningStatus} onChange={(event) => updateField("provisioningStatus", event.target.value)}>
                    <option value="pending_vercel_domain">Pending Vercel domain</option>
                    <option value="pending_dns_validation">Pending DNS validation</option>
                    <option value="waiting_for_vercel_ssl">Waiting for Vercel SSL</option>
                    <option value="pending_cloudflare_gate">Pending Cloudflare gate</option>
                    <option value="ready">Ready</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
                <label>
                  Access link hours
                  <input type="number" min="1" max="720" value={form.tokenTtlHours} onChange={(event) => updateField("tokenTtlHours", event.target.value)} />
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
                <PreviewRow label="Workspace link" value={readyToShare ? form.publicDemoUrl : "Hidden until provisioning is ready"} href={readyToShare ? form.publicDemoUrl : ""} warn={!readyToShare} />
                <PreviewRow label="Deep link" value={readyToShare ? form.deepLink : "Hidden until provisioning is ready"} href={readyToShare ? form.deepLink : ""} warn={!readyToShare} />
                <label className="demo-wide-field">
                  Recipient action email
                  <input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder={form.clientEmail || "approved@example.com"} />
                </label>
                <label className="demo-wide-field">
                  Approved recipients
                  <textarea readOnly value={approvedRecipientText} rows={4} />
                </label>
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
                <button className="secondary-action" type="button" onClick={copyDeepLink} disabled={Boolean(busy) || !readyToShare}>
                  <Copy size={15} />
                  {copied === "link" ? "Copied" : "Copy Link"}
                </button>
                <button className="secondary-action" type="button" onClick={copyDraft} disabled={Boolean(busy)}>
                  <Copy size={15} />
                  {copied === "email" ? "Copied" : "Copy Email"}
                </button>
                <button className="secondary-action" type="button" onClick={() => recipientAction("demo-portal-approved-emails", "add-recipient")} disabled={Boolean(busy) || !recipientEmail}>
                  <UserPlus size={15} />
                  {busy === "add-recipient" ? "Adding..." : "Add Recipient"}
                </button>
                <button className="secondary-action" type="button" onClick={() => recipientAction("demo-portal-revoke-email", "revoke-recipient")} disabled={Boolean(busy) || !recipientEmail}>
                  <UserMinus size={15} />
                  {busy === "revoke-recipient" ? "Revoking..." : "Revoke Recipient"}
                </button>
                <button className="secondary-action" type="button" onClick={() => submit("demo-portal-reset-access", "reset", { recipientEmail })} disabled={Boolean(busy)}>
                  <RotateCw size={15} />
                  {busy === "reset" ? "Resetting..." : "Reset Access"}
                </button>
                <button className="secondary-action" type="button" onClick={() => submit("demo-portal-send-link", "send", { recipientEmail })} disabled={Boolean(busy) || !readyToShare}>
                  <Mail size={15} />
                  {busy === "send" ? "Sending..." : emailConfigured ? "Send Access Link" : "Email Not Configured"}
                </button>
                <button className="secondary-action primary-secondary" type="submit" disabled={Boolean(busy)}>
                  <Save size={15} />
                  {busy === "save" ? "Saving..." : "Save Access"}
                </button>
                {shareLink ? (
                  <a className="secondary-action primary-secondary" href={shareLink} target="_blank" rel="noreferrer">
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
