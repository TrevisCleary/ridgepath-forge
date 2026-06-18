import { json, methodNotAllowed } from "../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  return json(res, {
    hosted: true,
    root: "Hosted RidgePath Ops",
    devices: [],
    files: [],
    conflicts: [],
    editSession: {
      mode: "read-only",
      currentHost: "hosted",
      active: null,
      readOnly: true,
      conflictCount: 0,
    },
    counts: {
      devices: 0,
      confirmed: 0,
      unknown: 0,
      followUps: 0,
    },
    message: "Hosted Fabric editing requires a paired local Forge runner or a centralized Fabric store.",
  });
}
