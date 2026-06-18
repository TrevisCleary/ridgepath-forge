export async function apiJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
    });
  } catch (error) {
    throw new Error(`Forge API is not reachable. ${error.message || "Check that the API server is running on port 3059."}`);
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
      throw new Error(`Forge API request failed for ${url}. ${authHint}`);
    }
    const responseType = contentType ? ` (${contentType})` : "";
    throw new Error(`Forge API returned a non-JSON response for ${url}${responseType}.`);
  }

  if (!response.ok) {
    throw new Error(data.error || `Forge API request failed with HTTP ${response.status}.`);
  }

  return data;
}
