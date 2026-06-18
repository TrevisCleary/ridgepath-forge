import { updateCommandRequest } from "../../server/domains/command-center/repository.js";
import { json, readJsonBody } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  const commandId = req.query?.commandId;
  if (req.method !== "PATCH") {
    return json(res, {
      error: `${req.method} is not supported for command request ${commandId}.`,
      allowed: ["PATCH"],
    }, 405);
  }
  if (!commandId) return json(res, { error: "Command request id is required." }, 400);

  try {
    return json(res, await updateCommandRequest(commandId, readJsonBody(req)));
  } catch (error) {
    return json(res, { error: error.message || "Could not update command request." }, 400);
  }
}
