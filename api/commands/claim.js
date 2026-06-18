import { claimNextCommandForRunner } from "../../server/domains/command-center/repository.js";
import { json, methodNotAllowed, readJsonBody } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(req, res, ["POST"]);

  const body = readJsonBody(req);
  try {
    const command = await claimNextCommandForRunner(body.runnerId);
    return json(res, {
      command,
      execution: "disabled",
    });
  } catch (error) {
    return json(res, { error: error.message || "Could not claim command request." }, 400);
  }
}
