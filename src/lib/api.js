export async function apiJson(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const retryable = method === "GET";
  const maxAttempts = retryable ? 3 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await apiJsonOnce(url, options, retryable && attempt < maxAttempts);
    } catch (error) {
      lastError = error;
      if (!retryable || !error.retryable || attempt >= maxAttempts) break;
      await wait(350 * attempt);
    }
  }
  throw lastError;
}

async function apiJsonOnce(url, options = {}, canRetry = false) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
    });
  } catch (error) {
    throw retryableError(`Forge API is not reachable. ${error.message || "Check that the API server is running on port 3059."}`, canRetry);
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      const authHint = response.status === 401 || response.status === 403
        ? "Authentication is required or the current session is not authorized."
        : `HTTP ${response.status}`;
      throw retryableError(`Forge API request failed for ${url}. ${authHint}`, canRetry && isRetryableStatus(response.status));
    }
    const responseType = contentType ? ` (${contentType})` : "";
    throw new Error(`Forge API returned a non-JSON response for ${url}${responseType}.`);
  }

  if (!response.ok) {
    throw retryableError(data.error || `Forge API request failed with HTTP ${response.status}.`, canRetry && isRetryableStatus(response.status));
  }

  return data;
}

function isRetryableStatus(status) {
  return [502, 503, 504].includes(Number(status));
}

function retryableError(message, retryable = false) {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
