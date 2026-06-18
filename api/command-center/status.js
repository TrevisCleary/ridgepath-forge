import { activeLocalRunners, commandCenterStatus, getRidgeFabricSnapshot, listCommandCenterProjects, listCommandRequests, listLocalRunners } from "../../server/domains/command-center/repository.js";
import { json, methodNotAllowed } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  const [status, runners, activeRunners, commands, projects, fabric] = await Promise.all([
    commandCenterStatus(),
    listLocalRunners(),
    activeLocalRunners(),
    listCommandRequests(),
    listCommandCenterProjects(),
    getRidgeFabricSnapshot(),
  ]);
  const openCommands = commands.filter((command) => ["pending", "approved"].includes(command.approvalStatus) && !["succeeded", "failed", "cancelled"].includes(command.executionStatus));
  return json(res, {
    ...status,
    hosted: true,
    localRunnerPaired: activeRunners.length > 0,
    runnerCount: runners.length,
    activeRunnerCount: activeRunners.length,
    projectCount: projects.length,
    fabricDeviceCount: fabric.devices.length,
    commandRequestCount: commands.length,
    openCommandRequestCount: openCommands.length,
    runners: activeRunners.slice(0, 3),
  });
}
