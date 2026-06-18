import { activeLocalRunners, listCommandCenterProjects } from "../server/domains/command-center/repository.js";
import { json, methodNotAllowed } from "../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  const [projects, activeRunners] = await Promise.all([
    listCommandCenterProjects(),
    activeLocalRunners(),
  ]);

  return json(res, {
    root: projects[0]?.metadata?.sourceRoot || "Hosted RidgePath Ops",
    hosted: true,
    localRunnerPaired: activeRunners.length > 0,
    projects,
    projectCount: projects.length,
    message: projects.length
      ? "Hosted Ops is reading the Neon project catalog. Local actions still require a paired Forge runner."
      : "Hosted Ops is online. Run the local project sync from a paired Forge runner to populate the hosted catalog.",
  });
}
