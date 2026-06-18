import { json, methodNotAllowed } from "./_lib/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  return json(res, {
    root: "Hosted RidgePath Ops",
    hosted: true,
    localRunnerPaired: false,
    projects: [],
    message: "Hosted Ops is online. Local project discovery requires a paired Forge runner on the active machine.",
  });
}
