const REALM = "RidgePath Ops";

export const config = {
  matcher: ["/(.*)"],
};

export default function middleware(request) {
  const username = process.env.OPS_AUTH_USERNAME;
  const password = process.env.OPS_AUTH_PASSWORD;

  if (!username || !password) {
    return new Response("RidgePath Ops authentication is not configured.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const authorization = request.headers.get("authorization") || "";
  if (!isAuthorized(authorization, username, password)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      },
    });
  }

  return undefined;
}

function isAuthorized(header, expectedUsername, expectedPassword) {
  if (!header.toLowerCase().startsWith("basic ")) return false;

  const encoded = header.slice(6).trim();
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return false;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return timingSafeEqual(username, expectedUsername) && timingSafeEqual(password, expectedPassword);
}

function timingSafeEqual(left, right) {
  const leftValue = String(left);
  const rightValue = String(right);
  let mismatch = leftValue.length === rightValue.length ? 0 : 1;
  const length = Math.max(leftValue.length, rightValue.length);

  for (let index = 0; index < length; index += 1) {
    const leftCode = leftValue.charCodeAt(index) || 0;
    const rightCode = rightValue.charCodeAt(index) || 0;
    mismatch |= leftCode ^ rightCode;
  }

  return mismatch === 0;
}
