import { activeLocalRunners, getRidgeFabricSnapshot } from "../server/domains/command-center/repository.js";
import { json, methodNotAllowed } from "../server/hosted/http.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(req, res);

  const [registry, activeRunners] = await Promise.all([
    getRidgeFabricSnapshot(),
    activeLocalRunners(),
  ]);
  const paired = activeRunners.length > 0;

  return json(res, {
    ...registry,
    hosted: true,
    editSession: {
      ...(registry.editSession || {}),
      mode: paired ? "runner-queued" : "read-only",
      currentHost: registry.editSession?.currentHost || activeRunners[0]?.machineId || "hosted",
      readOnly: !paired || Boolean(registry.editSession?.conflictCount),
    },
    message: registry.devices?.length
      ? "Hosted Fabric is reading the latest synced Ridge Fabric snapshot. Edits are queued through the paired local runner."
      : registry.message || "Hosted Fabric has not been synced yet. Run the local Fabric sync from a paired runner.",
  });
}
