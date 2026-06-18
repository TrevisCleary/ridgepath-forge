import { updateProposal } from "../../server/domains/command-center/repository.js";
import { json, readJsonBody } from "../../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  const proposalId = req.query?.proposalId;
  if (req.method !== "PATCH") {
    return json(res, {
      error: `${req.method} is not supported for proposal ${proposalId}.`,
      allowed: ["PATCH"],
    }, 405);
  }
  if (!proposalId) return json(res, { error: "Proposal id is required." }, 400);

  try {
    return json(res, await updateProposal(proposalId, readJsonBody(req)));
  } catch (error) {
    return json(res, { error: error.message || "Could not update proposal." }, 400);
  }
}
