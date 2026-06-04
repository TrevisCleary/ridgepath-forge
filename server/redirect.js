import http from "node:http";

const REDIRECT_PORT = Number(process.env.LAUNCHER_REDIRECT_PORT || 80);
const TARGET_HOST = process.env.LAUNCHER_HOSTNAME || "dev-launcher";
const TARGET_PORT = Number(process.env.LAUNCHER_CLIENT_PORT || 3060);

const server = http.createServer((req, res) => {
  const target = new URL(req.url || "/", `http://${TARGET_HOST}:${TARGET_PORT}`);
  res.writeHead(302, {
    Location: target.toString(),
    "Cache-Control": "no-store",
  });
  res.end(`Redirecting to ${target.toString()}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.warn(`Port ${REDIRECT_PORT} is already in use; dev-launcher root redirect is disabled.`);
    return;
  }
  throw error;
});

server.listen(REDIRECT_PORT, "127.0.0.1", () => {
  console.log(`Local launcher redirect listening on http://${TARGET_HOST}/ -> http://${TARGET_HOST}:${TARGET_PORT}/`);
});
