export function getProjectRuntimeState(project, busy = "") {
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

export function portsLabel(project) {
  const services = Array.isArray(project.services) ? project.services : [];
  const ports = services.map((service) => service.port).filter(Boolean);
  return ports.length ? ports.join(", ") : "n/a";
}
