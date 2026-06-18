import { json } from "../_lib/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, {
      error: `${req.method} is not supported in hosted RidgePath Ops for this endpoint.`,
      allowed: ["POST"],
    }, 405);
  }

  return json(res, {
    error: "Hosted Ops cannot open local Fabric paths. Use the local Forge runner on the active machine.",
    hosted: true,
    localRunnerPaired: false,
  }, 409);
}
