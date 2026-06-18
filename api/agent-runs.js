import { listAgentRuns } from "../server/domains/command-center/repository.js";
import { json, methodNotAllowed } from "../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  return json(res, {
    runs: await listAgentRuns(),
  });
}
