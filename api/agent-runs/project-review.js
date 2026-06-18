import { json } from "../../server/hosted/http.js";

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
    error: "Hosted Ops cannot inspect local project repositories yet. Run project reviews from a paired local Forge runner.",
    hosted: true,
    localRunnerPaired: false,
  }, 409);
}
