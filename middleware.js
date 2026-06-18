const REALM = "RidgePath Ops";

export const config = {
  matcher: ["/(.*)"],
};

export default function middleware(request) {
  const username = process.env.OPS_AUTH_USERNAME;
  const password = process.env.OPS_AUTH_PASSWORD;
  const isApiRequest = request.nextUrl?.pathname?.startsWith("/api/") || request.url.includes("/api/");

  if (!username || !password) {
    return protectedResponse(isApiRequest, "RidgePath Ops authentication is not configured.", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!isAuthorized(authorization, username, password)) {
    return protectedResponse(isApiRequest, "Authentication required.", 401, {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    });
  }

  return undefined;
}

function protectedResponse(isApiRequest, message, status, extraHeaders = {}) {
  if (isApiRequest) {
    return new Response(JSON.stringify({ error: message, protected: true }), {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders,
      },
    });
  }

  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
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
