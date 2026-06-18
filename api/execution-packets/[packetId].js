import { updateExecutionPacket } from "../../server/domains/command-center/repository.js";
import { json, readJsonBody } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  const packetId = req.query?.packetId;
  if (req.method !== "PATCH") {
    return json(res, {
      error: `${req.method} is not supported for execution packet ${packetId}.`,
      allowed: ["PATCH"],
    }, 405);
  }
  if (!packetId) return json(res, { error: "Execution packet id is required." }, 400);

  try {
    return json(res, await updateExecutionPacket(packetId, readJsonBody(req)));
  } catch (error) {
    return json(res, { error: error.message || "Could not update execution packet." }, 400);
  }
}
