import { createCommandRequest, listCommandEvents, listCommandRequests } from "../server/domains/command-center/repository.js";
import { json, methodNotAllowed, readJsonBody } from "../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method === "GET") {
    const runnerId = req.query?.runnerId || "";
    const [commands, events] = await Promise.all([
      listCommandRequests({ runnerId }),
      listCommandEvents(),
    ]);
    return json(res, { commands, events });
  }

  if (req.method === "POST") {
    try {
      const command = await createCommandRequest(readJsonBody(req));
      return json(res, command, 201);
    } catch (error) {
      return json(res, { error: error.message || "Could not create command request." }, 400);
    }
  }

  return methodNotAllowed(req, res, ["GET", "POST"]);
}
