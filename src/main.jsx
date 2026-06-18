import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Check,
  Code2,
  ClipboardList,
  Gauge,
  Globe2,
  Home,
  Network,
  Plus,
  RefreshCw,
  Settings,
  Workflow,
  X,
} from "lucide-react";
import { AgentRuns } from "./features/command-center/AgentRuns.jsx";
import { ApprovalQueue } from "./features/command-center/ApprovalQueue.jsx";
import { CommandQueue } from "./features/command-center/CommandQueue.jsx";
import { DemoPortalModal } from "./features/demo-portal/DemoPortalModal.jsx";
import { OperationsLibraryModal } from "./features/operations-library/OperationsLibraryModal.jsx";
import { CommandCenterOverview } from "./features/overview/CommandCenterOverview.jsx";
import { ProjectDetail } from "./features/projects/ProjectDetail.jsx";
import { PortTreeModal } from "./features/projects/PortTreeModal.jsx";
import { ProjectTable } from "./features/projects/ProjectTable.jsx";
import { RegisterProjectModal } from "./features/project-registration/RegisterProjectModal.jsx";
import { RidgeFabricWorkspace } from "./features/ridge-fabric/RidgeFabricWorkspace.jsx";
import { apiJson } from "./lib/api.js";
import "./styles.css";

const POLL_MS = 5000;
const COMMAND_CENTER_POLL_MS = 10000;
const HOSTED_ACTION_COMMANDS = {
  start: "start-project",
  stop: "stop-project",
  restart: "restart-project",
  "take-over": "take-over-project",
  "git-sync": "git-sync",
  "initialize-project-management": "initialize-project-management",
  "create-portfolio-draft": "create-portfolio-draft",
};

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
  const [activeView, setActiveView] = useState("overview");
  const [operationsLibrary, setOperationsLibrary] = useState(null);
  const [ridgeFabric, setRidgeFabric] = useState(null);
  const [commandCenterStatus, setCommandCenterStatus] = useState(null);
  const [agentRuns, setAgentRuns] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [approvalEvents, setApprovalEvents] = useState([]);
  const [executionPackets, setExecutionPackets] = useState([]);
  const [executionPacketEvents, setExecutionPacketEvents] = useState([]);
  const [localRunners, setLocalRunners] = useState([]);
  const [commandRequests, setCommandRequests] = useState([]);
  const [commandEvents, setCommandEvents] = useState([]);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [demoPortalProjectId, setDemoPortalProjectId] = useState("");

  async function loadProjects() {
    try {
      const data = await apiJson("/api/projects");
      setRoot(data.root);
      setProjects(data.projects || []);
      setSelectedId((current) => (data.projects || []).some((project) => project.id === current) ? current : "");
    } catch (error) {
      setActionError(error.message || "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOperationsLibraryStatus() {
    setOperationsLibrary(await apiJson("/api/operations-library/status"));
  }

  async function loadRidgeFabricRegistry() {
    const data = await apiJson("/api/ridge-fabric");
    setRidgeFabric(data);
    return data;
  }

  async function loadCommandCenterState() {
    const status = await apiJson("/api/command-center/status");
    const sharedCommandCenter = Boolean(status?.hosted || status?.databaseConfigured);
    const [runData, proposalData, packetData, runnerData, commandData] = await Promise.all([
      apiJson("/api/agent-runs"),
      apiJson("/api/proposals"),
      sharedCommandCenter ? apiJson("/api/execution-packets") : Promise.resolve({ packets: [] }),
      sharedCommandCenter ? apiJson("/api/runners") : Promise.resolve({ runners: [] }),
      sharedCommandCenter ? apiJson("/api/commands") : Promise.resolve({ commands: [], events: [] }),
    ]);
    setCommandCenterStatus(status);
    setAgentRuns(runData.runs || []);
    setProposals(proposalData.proposals || []);
    setApprovalEvents(proposalData.approvalEvents || []);
    setExecutionPackets(packetData.packets || []);
    setExecutionPacketEvents(packetData.events || []);
    setLocalRunners(runnerData.runners || []);
    setCommandRequests(commandData.commands || []);
    setCommandEvents(commandData.events || []);
    return { status, runData, proposalData, runnerData, commandData };
  }

  useEffect(() => {
    loadProjects();
    loadOperationsLibraryStatus();
    loadRidgeFabricRegistry().catch((error) => setActionError(error.message));
    loadCommandCenterState().catch((error) => setActionError(error.message));
    const projectTimer = window.setInterval(loadProjects, POLL_MS);
    const commandCenterTimer = window.setInterval(() => {
      loadCommandCenterState().catch((error) => setActionError(error.message));
    }, COMMAND_CENTER_POLL_MS);
    return () => {
      window.clearInterval(projectTimer);
      window.clearInterval(commandCenterTimer);
    };
  }, []);

  useEffect(() => {
    if (activeView === "fabric" && !ridgeFabric) {
      loadRidgeFabricRegistry().catch((error) => setActionError(error.message));
    }
    if (activeView === "operations" && !operationsLibrary) {
      loadOperationsLibraryStatus().catch((error) => setActionError(error.message));
    }
    if ((activeView === "approval" || activeView === "agent-runs") && !commandCenterStatus) {
      loadCommandCenterState().catch((error) => setActionError(error.message));
    }
  }, [activeView, ridgeFabric, operationsLibrary]);

  async function runAction(projectId, action) {
    if (hostedMode) {
      const project = projects.find((candidate) => candidate.id === projectId);
      return queueHostedCommand({
        commandType: HOSTED_ACTION_COMMANDS[action] || action,
        projectId,
        target: project?.path || project?.name || projectId,
        reason: `Owner requested ${action} for ${project?.name || projectId} from hosted Ops.`,
      });
    }
    setBusy(`${projectId}:${action}`);
    setActionError("");
    setActionNotice("");
    try {
      const result = await apiJson(`/api/projects/${projectId}/${action}`, { method: "POST" });
      await loadProjects();
      return result;
    } catch (error) {
      setActionError(error.message || "Action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function saveDescription(projectId, description) {
    if (hostedMode) {
      const project = projects.find((candidate) => candidate.id === projectId);
      return queueHostedCommand({
        commandType: "update-project-description",
        projectId,
        target: project?.path || project?.name || projectId,
        reason: `Owner requested project description update for ${project?.name || projectId} from hosted Ops.`,
        payload: { description },
      });
    }
    setBusy(`${projectId}:save`);
    try {
      await apiJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      await loadProjects();
    } finally {
      setBusy("");
    }
  }

  async function openFolder(projectId) {
    if (hostedMode) {
      const project = projects.find((candidate) => candidate.id === projectId);
      await queueHostedCommand({
        commandType: "open-path",
        projectId,
        target: project?.path || projectId,
        reason: `Owner requested opening the local folder for ${project?.name || projectId} from hosted Ops.`,
      });
      return;
    }
    await fetch(`/api/projects/${projectId}/open-folder`, { method: "POST" });
  }

  async function openProjectManagementFolder(projectId, fileKey = "") {
    if (hostedMode) {
      const project = projects.find((candidate) => candidate.id === projectId);
      await queueHostedCommand({
        commandType: "open-path",
        projectId,
        target: fileKey ? `${project?.path || projectId}\\docs\\project-management\\${fileKey}` : `${project?.path || projectId}\\docs\\project-management`,
        reason: `Owner requested opening project-management ${fileKey ? "file" : "folder"} for ${project?.name || projectId} from hosted Ops.`,
      });
      return;
    }
    const path = fileKey ? `open-project-management-file/${fileKey}` : "open-project-management-folder";
    await fetch(`/api/projects/${projectId}/${path}`, { method: "POST" });
  }

  async function initializeProjectManagement(projectId) {
    await runAction(projectId, "initialize-project-management");
  }

  async function createPortfolioDraft(projectId) {
    const result = await runAction(projectId, "create-portfolio-draft");
    if (!result) return;
    if (hostedMode) return;
    const projectLabel = result.createdProjectIdea ? "Created" : "Updated";
    const blogLabel = result.createdBlogPost ? "created" : "updated";
    const screenshotLabel = result.screenshotStatus === "captured"
      ? ` Captured ${result.screenshotCount} screenshot${result.screenshotCount === 1 ? "" : "s"}.`
      : result.screenshotStatus
        ? ` Screenshot capture ${result.screenshotStatus}.`
        : "";
    const aiLabel = result.aiStatus === "generated"
      ? " OpenAI draft copy generated."
      : result.aiStatus
        ? ` OpenAI ${result.aiStatus}.`
        : "";
    setActionNotice(`${projectLabel} portfolio draft and ${blogLabel} blog draft in trevis-portfolio.${screenshotLabel}${aiLabel}`);
  }

  async function registerProject(values) {
    if (hostedMode) {
      await queueHostedCommand({
        commandType: "register-project",
        target: values.folderName || values.projectName || "new-project",
        reason: `Owner requested new project registration for ${values.projectName || values.folderName || "new project"} from hosted Ops.`,
        payload: values,
      });
      setShowRegister(false);
      return null;
    }
    setBusy("register");
    try {
      const project = await apiJson("/api/projects/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      await loadProjects();
      setSelectedId(project.id);
      setShowRegister(false);
    } finally {
      setBusy("");
    }
  }

  async function saveRidgeFabricDevice(stableIdentifier, values) {
    if (hostedMode) {
      return queueHostedCommand({
        commandType: "fabric-device-update",
        target: stableIdentifier,
        reason: `Owner requested Ridge Fabric device update for ${stableIdentifier} from hosted Ops.`,
        payload: values,
      });
    }
    setBusy(`ridge-fabric:${stableIdentifier}`);
    setActionError("");
    setActionNotice("");
    try {
      const data = await apiJson(`/api/ridge-fabric/devices/${encodeURIComponent(stableIdentifier)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      await loadRidgeFabricRegistry();
      setActionNotice(`Updated Ridge Fabric device ${stableIdentifier}.`);
      return data;
    } catch (error) {
      setActionError(error.message || "Could not save device.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function deleteRidgeFabricDevice(stableIdentifier) {
    if (hostedMode) {
      return queueHostedCommand({
        commandType: "fabric-device-remove",
        target: stableIdentifier,
        reason: `Owner requested removing ${stableIdentifier} from Ridge Fabric from hosted Ops.`,
      });
    }
    setBusy(`ridge-fabric-delete:${stableIdentifier}`);
    setActionError("");
    setActionNotice("");
    try {
      const data = await apiJson(`/api/ridge-fabric/devices/${encodeURIComponent(stableIdentifier)}`, {
        method: "DELETE",
      });
      await loadRidgeFabricRegistry();
      setActionNotice(`Removed ${stableIdentifier} from the Ridge Fabric registry.`);
      return data;
    } catch (error) {
      setActionError(error.message || "Could not remove device.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function openRidgeFabricPath(relativePath = "") {
    setActionError("");
    if (hostedMode) {
      await queueHostedCommand({
        commandType: "open-path",
        target: relativePath || "C:\\Development\\Shared\\ridge-fabric-registry",
        reason: `Owner requested opening Ridge Fabric ${relativePath || "registry root"} from hosted Ops.`,
      });
      return;
    }
    try {
      await apiJson("/api/ridge-fabric/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath }),
      });
    } catch (error) {
      setActionError(error.message || "Could not open registry path.");
    }
  }

  async function runProjectReview(projectId) {
    if (hostedMode) {
      const project = projects.find((candidate) => candidate.id === projectId);
      return queueHostedCommand({
        commandType: "project-review",
        projectId,
        target: project?.path || project?.name || projectId,
        reason: `Owner requested read-only project review for ${project?.name || projectId} from hosted Ops.`,
      });
    }
    setBusy("project-review");
    setActionError("");
    setActionNotice("");
    try {
      const result = await apiJson("/api/agent-runs/project-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      await loadCommandCenterState();
      setActionNotice(`Created ${result.proposals?.length || 0} proposal${result.proposals?.length === 1 ? "" : "s"} from read-only project review.`);
      return result;
    } catch (error) {
      setActionError(error.message || "Project review failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function updateCommandProposal(proposalId, patch) {
    setBusy(proposalId);
    setActionError("");
    setActionNotice("");
    try {
      const proposal = await apiJson(`/api/proposals/${encodeURIComponent(proposalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadCommandCenterState();
      setActionNotice(`Updated proposal: ${proposal.title}.`);
      return proposal;
    } catch (error) {
      setActionError(error.message || "Could not update proposal.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function createLocalCommandRequest(values) {
    setBusy("command-create");
    setActionError("");
    setActionNotice("");
    try {
      const command = await apiJson("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      await loadCommandCenterState();
      setActionNotice(`Queued command request: ${command.commandType}. Approve it in Runtime for the paired runner to execute.`);
      return command;
    } catch (error) {
      setActionError(error.message || "Could not queue command request.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function updateLocalCommandRequest(commandId, patch) {
    setBusy(commandId);
    setActionError("");
    setActionNotice("");
    try {
      const command = await apiJson(`/api/commands/${encodeURIComponent(commandId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadCommandCenterState();
      setActionNotice(`Updated command request: ${command.commandType}.`);
      return command;
    } catch (error) {
      setActionError(error.message || "Could not update command request.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function queueHostedCommand(values) {
    const runner = activeLocalRunners[0] || localRunners[0];
    return createLocalCommandRequest({
      runnerId: runner?.id || "",
      ...values,
      requestedBy: "owner",
    });
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
  const demoPortalProject = projects.find((project) => project.id === demoPortalProjectId);
  const runningCount = projects.filter((project) => project.status === "running").length;
  const serviceCount = projects.reduce((count, project) => count + project.services.length, 0);
  const commandCenterLoaded = Boolean(commandCenterStatus);
  const hostedMode = Boolean(commandCenterStatus?.hosted);
  const activeLocalRunners = localRunners.filter((runner) => runner.paired);
  const localRunnerPaired = Boolean(commandCenterStatus?.localRunnerPaired || activeLocalRunners.length);
  const localControlsEnabled = commandCenterLoaded && (!hostedMode || localRunnerPaired);
  const openCommandCount = commandRequests.filter((command) => ["pending", "approved"].includes(command.approvalStatus) && !["succeeded", "failed", "cancelled"].includes(command.executionStatus)).length;
  const openExecutionPacketCount = executionPackets.filter((packet) => !["complete", "failed", "cancelled"].includes(packet.status)).length;
  const activeMachine = ridgeFabric?.editSession?.currentHost || ridgeFabric?.editSession?.active?.host || "Local";
  const navigationItems = [
    { key: "overview", label: "Overview", icon: <Home size={18} /> },
    { key: "projects", label: "Projects", icon: <Code2 size={18} />, badge: projects.length },
    { key: "approval", label: "Approval Queue", icon: <ClipboardList size={18} />, badge: proposals.filter((proposal) => ["proposed", "needs-evidence", "deferred"].includes(proposal.status)).length },
    { key: "agent-runs", label: "Agent Runs", icon: <Activity size={18} />, badge: agentRuns.length },
    { key: "runtime", label: "Runtime", icon: <Gauge size={18} />, badge: openCommandCount + openExecutionPacketCount || runningCount },
    { key: "fabric", label: "Fabric", icon: <Network size={18} />, badge: ridgeFabric?.counts?.devices || "" },
    { key: "automation", label: "Automation", icon: <Workflow size={18} /> },
    { key: "publishing", label: "Publishing", icon: <Globe2 size={18} /> },
    { key: "operations", label: "Ops Library", icon: <ClipboardList size={18} /> },
    { key: "settings", label: "Settings", icon: <Settings size={18} /> },
  ];
  const openView = (view) => {
    setActiveView(view);
    setSelectedId("");
    if (view === "fabric") loadRidgeFabricRegistry().catch((error) => setActionError(error.message));
    if (view === "operations") loadOperationsLibraryStatus().catch((error) => setActionError(error.message));
  };

  return (
    <main className="command-shell">
      <aside className="command-sidebar">
        <div className="command-brand">
          <img className="brand-logo" src="/assets/ridgepath-forge-horizontal-logo-transparent.png" alt="RidgePath Forge" />
        </div>
        <nav className="command-nav" aria-label="Forge command center">
          {navigationItems.map((item) => (
            <button key={item.key} className={activeView === item.key ? "active" : ""} type="button" onClick={() => openView(item.key)}>
              {item.icon}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== "" ? <strong>{item.badge}</strong> : null}
            </button>
          ))}
        </nav>
        <div className="agent-card">
          <small>Active Machine</small>
          <strong>{hostedMode && !localRunnerPaired ? "Hosted Ops" : activeMachine}</strong>
          <span>{hostedMode ? (localRunnerPaired ? "Local runner paired" : "Local runner not paired") : `${runningCount} running · ${serviceCount} services`}</span>
        </div>
      </aside>
      <section className="command-main">
        <header className="command-topbar">
          <div>
            <p className="eyebrow">Forge Mode</p>
            <h1>{viewTitle(activeView, selected)}</h1>
          </div>
          <div className="command-search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
          </div>
          <div className="command-actions">
            <button className="secondary-action" type="button" onClick={() => setShowPortTree(true)} disabled={!localControlsEnabled}>
              <Network size={16} />
              Ports
            </button>
            <button className="secondary-action" type="button" onClick={loadProjects}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="secondary-action primary-secondary" type="button" onClick={() => setShowRegister(true)} disabled={!localControlsEnabled}>
              <Plus size={16} />
              Add Project
            </button>
          </div>
        </header>
      {hostedMode ? (
        <div className={`hosted-mode-banner ${localRunnerPaired ? "paired" : "unpaired"}`} role="status">
          <AlertTriangle size={16} />
          <span>
            {localRunnerPaired
              ? "Hosted Ops is online and a local runner is paired. Local controls use the paired runner capability contract."
              : "Hosted Ops is online. Local runner not paired. Local project, Fabric path, and machine-control actions are disabled."}
          </span>
        </div>
      ) : null}
      {actionError ? (
        <div className="action-error" role="alert">
          <AlertTriangle size={16} />
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError("")} aria-label="Dismiss action error">
            <X size={14} />
          </button>
        </div>
      ) : null}
      {actionNotice ? (
        <div className="action-notice" role="status">
          <Check size={16} />
          <span>{actionNotice}</span>
          <button type="button" onClick={() => setActionNotice("")} aria-label="Dismiss action notice">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="command-content">
      {activeView === "overview" ? (
        <CommandCenterOverview
          projects={projects}
          operationsLibrary={operationsLibrary}
          ridgeFabric={ridgeFabric}
          root={root}
          hostedMode={hostedMode}
          localRunnerPaired={localRunnerPaired}
          localRunners={localRunners}
          onOpenProjects={() => openView("projects")}
          onOpenFabric={() => openView("fabric")}
          onOpenPorts={() => setShowPortTree(true)}
          onOpenOperations={() => openView("operations")}
        />
      ) : activeView === "approval" ? (
        <ApprovalQueue
          proposals={proposals}
          executionPackets={executionPackets}
          executionPacketEvents={executionPacketEvents}
          approvalEvents={approvalEvents}
          projects={projects}
          storageStatus={commandCenterStatus}
          busy={busy}
          localRunnerPaired={localControlsEnabled}
          onUpdateProposal={updateCommandProposal}
          onRunProjectReview={runProjectReview}
        />
      ) : activeView === "agent-runs" ? (
        <AgentRuns
          runs={agentRuns}
          proposals={proposals}
          storageStatus={commandCenterStatus}
        />
      ) : activeView === "fabric" ? (
        <RidgeFabricWorkspace
          registry={ridgeFabric}
          busy={busy}
          localControlsEnabled={localControlsEnabled}
          onRefresh={loadRidgeFabricRegistry}
          onSaveDevice={saveRidgeFabricDevice}
          onDeleteDevice={deleteRidgeFabricDevice}
          onOpenPath={openRidgeFabricPath}
          onBack={() => openView("projects")}
        />
      ) : selected ? (
        <ProjectDetail
          project={selected}
          busy={busy}
          localControlsEnabled={localControlsEnabled}
          onBack={() => setSelectedId("")}
          onStart={() => runAction(selected.id, "start")}
          onStop={() => runAction(selected.id, "stop")}
          onRestart={() => runAction(selected.id, "restart")}
          onTakeOver={() => runAction(selected.id, "take-over")}
          onGitSync={() => runAction(selected.id, "git-sync")}
          onInitializeProjectManagement={() => initializeProjectManagement(selected.id)}
          onCreatePortfolioDraft={() => createPortfolioDraft(selected.id)}
          onLinkDemoPortal={() => {
            setDemoPortalProjectId(selected.id);
          }}
          onSaveDescription={(description) => saveDescription(selected.id, description)}
          onOpenFolder={() => openFolder(selected.id)}
          onOpenProjectManagementFolder={(fileKey) => openProjectManagementFolder(selected.id, fileKey)}
        />
      ) : activeView === "projects" ? (
        <ProjectTable
          busy={busy}
          loading={loading}
          projects={filtered}
          catalogProjects={projects}
          totalProjects={projects.length}
          root={root}
          hostedMode={hostedMode}
          localRunnerPaired={localRunnerPaired}
          query={query}
          filters={filters}
          onQueryChange={setQuery}
          onFiltersChange={setFilters}
          onOpenProject={(projectId) => setSelectedId(projectId)}
          onStartProject={(projectId) => runAction(projectId, "start")}
          onStopProject={(projectId) => runAction(projectId, "stop")}
          onRestartProject={(projectId) => runAction(projectId, "restart")}
          onTakeOverProject={(projectId) => runAction(projectId, "take-over")}
          localControlsEnabled={localControlsEnabled}
        />
      ) : activeView === "runtime" ? (
        <CommandQueue
          commands={commandRequests}
          events={commandEvents}
          executionPackets={executionPackets}
          executionPacketEvents={executionPacketEvents}
          runners={localRunners}
          projects={projects}
          busy={busy}
          onCreateCommand={createLocalCommandRequest}
          onUpdateCommand={updateLocalCommandRequest}
        />
      ) : activeView === "automation" ? (
        <CommandPlaceholder
          title="Automation Workloads"
          icon={<Workflow size={20} />}
          detail="Scheduled tasks, services, runners, browser automation, and device workload links will become first-class records here."
          rows={[
            ["Known projects", projects.length],
            ["Fabric devices", ridgeFabric?.counts?.devices || "Load Fabric"],
            ["Registry model", "Syncthing JSON"],
          ]}
        />
      ) : activeView === "publishing" ? (
        <CommandPlaceholder
          title="Publishing"
          icon={<Globe2 size={20} />}
          detail="Demo portal readiness, production URLs, portfolio drafts, screenshots, and public surfaces will be managed here."
          rows={[
            ["Projects with production URLs", projects.filter((project) => project.productionUrl).length],
            ["Portfolio action", "Available in project detail"],
            ["Demo portal action", "Available in project detail"],
          ]}
        />
      ) : activeView === "operations" ? (
        <CommandPlaceholder
          title="Operations Library"
          icon={<ClipboardList size={20} />}
          detail="This page will replace the modal with validation, prompts, standards, templates, and bootstrap workflow status."
          rows={[
            ["Validation", operationsLibrary?.validation?.status || "Not checked"],
            ["Required folders", operationsLibrary?.requiredFolders?.length || 0],
            ["Required files", operationsLibrary?.requiredFiles?.length || 0],
          ]}
          actionLabel="Open Current Modal"
          onAction={() => setShowOperationsLibrary(true)}
        />
      ) : activeView === "settings" ? (
        <CommandPlaceholder
          title="Settings"
          icon={<Settings size={20} />}
          detail="Project roots, registry roots, local agent pairing, hosted mode, and startup health settings will be managed here."
          rows={[
            ["Project root", root || "Not loaded"],
            ["Registry root", "C:\\Development\\Shared\\ridge-fabric-registry"],
            ["Mode", hostedMode ? "Hosted Ops" : "Local command center"],
            ["Local runner", localRunnerPaired ? "Paired" : "Not paired"],
          ]}
        />
      ) : null}
      </div>
      {showPortTree ? <PortTreeModal projects={projects} onClose={() => setShowPortTree(false)} /> : null}
      {showRegister ? <RegisterProjectModal busy={busy === "register"} onSubmit={registerProject} onClose={() => setShowRegister(false)} /> : null}
      {showOperationsLibrary ? <OperationsLibraryModal status={operationsLibrary} onRefresh={loadOperationsLibraryStatus} onClose={() => setShowOperationsLibrary(false)} /> : null}
      {demoPortalProject ? (
        <DemoPortalModal
          project={demoPortalProject}
          onSaved={async (result) => {
            await loadProjects();
            const storageLabel = result.storage === "neon" ? "Stored in Neon" : "Stored in local fallback JSON";
            setActionNotice(`${storageLabel}: ${result.clientName} demo portal access is ready at ${result.deepLink || result.publicDemoUrl}.`);
          }}
          onClose={() => {
            setDemoPortalProjectId("");
          }}
        />
      ) : null}
      </section>
    </main>
  );
}

function CommandPlaceholder({ title, icon, detail, rows, actionLabel = "", onAction }) {
  return (
    <section className="command-placeholder">
      <div className="section-title">
      {icon}
        <h2>{title}</h2>
      </div>
      <p>{detail}</p>
      <div className="runtime-summary">
        {rows.map(([label, value]) => (
          <div className="status-line" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {actionLabel ? (
        <button className="secondary-action primary-secondary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function viewTitle(activeView, selected) {
  if (selected) return selected.name;
  const titles = {
    overview: "Command Center",
    projects: "Projects",
    approval: "Approval Queue",
    "agent-runs": "Agent Runs",
    runtime: "Local Runtime",
    fabric: "Ridge Fabric",
    automation: "Automation",
    publishing: "Publishing",
    operations: "Operations Library",
    settings: "Settings",
  };
  return titles[activeView] || "RidgePath Forge";
}

const rootElement = document.getElementById("root");
const appRoot = window.__LOCAL_PROJECT_LAUNCHER_ROOT__ || createRoot(rootElement);
window.__LOCAL_PROJECT_LAUNCHER_ROOT__ = appRoot;
appRoot.render(<App />);
