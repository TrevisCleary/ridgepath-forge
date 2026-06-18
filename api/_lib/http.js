export function json(res, body, status = 200) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

export function methodNotAllowed(req, res, allowed = ["GET"]) {
  res.setHeader("Allow", allowed.join(", "));
  return json(res, {
    error: `${req.method} is not supported in hosted RidgePath Ops for this endpoint.`,
    allowed,
  }, 405);
}

export function readJsonBody(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}
