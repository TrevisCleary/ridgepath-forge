import { json, methodNotAllowed } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  return json(res, {
    hosted: true,
    root: "",
    validation: {
      status: "Hosted Read-only",
      issues: ["Operations Library validation requires a paired local Forge runner."],
      missingFields: [],
    },
    files: [],
    workflows: [],
    message: "Hosted Ops cannot inspect local Operations Library files until a local runner is paired.",
  });
}
