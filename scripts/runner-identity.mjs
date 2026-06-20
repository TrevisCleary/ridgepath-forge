import os from "node:os";

export function lanAddresses() {
  const interfaces = os.networkInterfaces();
  return Object.values(interfaces)
    .flat()
    .filter((entry) =>
      entry &&
      entry.family === "IPv4" &&
      !entry.internal &&
      !entry.address.startsWith("169.254.")
    )
    .map((entry) => entry.address);
}

export function runnerMetadata(extra = {}) {
  const addresses = lanAddresses();
  return {
    nodeVersion: process.version,
    homedir: os.homedir(),
    lanAddresses: addresses,
    primaryLanAddress: addresses[0] || "",
    projectRoot: process.env.PROJECTS_ROOT || "C:\\Development\\Projects",
    ridgeFabricRoot: process.env.RIDGE_FABRIC_ROOT || "C:\\Development\\Shared\\ridge-fabric-registry",
    ...extra,
  };
}
