import { activeLocalRunners, commandCenterStatus, listLocalRunners } from "../../server/domains/command-center/repository.js";
import { json, methodNotAllowed } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  const [status, runners, activeRunners] = await Promise.all([
    commandCenterStatus(),
    listLocalRunners(),
    activeLocalRunners(),
  ]);
  return json(res, {
    ...status,
    hosted: true,
    localRunnerPaired: activeRunners.length > 0,
    runnerCount: runners.length,
    activeRunnerCount: activeRunners.length,
    runners: activeRunners.slice(0, 3),
  });
}
