export async function apiJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Forge API is not reachable. ${error.message || "Check that the API server is running on port 3059."}`);
  }

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Forge API returned an invalid response for ${url}. Check that the API server is running on port 3059.`);
  }

  if (!response.ok) {
    throw new Error(data.error || `Forge API request failed with HTTP ${response.status}.`);
  }

  return data;
}
