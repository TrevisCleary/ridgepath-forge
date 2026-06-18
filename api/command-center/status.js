import { commandCenterStatus } from "../../server/domains/command-center/repository.js";
import { json, methodNotAllowed } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  const status = await commandCenterStatus();
  return json(res, {
    ...status,
    hosted: true,
    localRunnerPaired: false,
  });
}
