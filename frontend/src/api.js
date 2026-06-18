/**
 * REST API calls to the Latch game server.
 * Mirrors the URL logic in socket.js so dev and prod both point correctly.
 */

const BASE_URL = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://latch-game-updated.onrender.com";

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/**
 * Look up a player by wallet address.
 * Returns { found: true, user: { wallet_address, username } }
 *      or { found: false }
 */
export async function getUser(walletAddress) {
  return request("GET", `/api/user/${walletAddress}`);
}

/**
 * Register a new player.
 * Returns { user: { wallet_address, username } }
 * Throws if wallet or username already taken (HTTP 409).
 */
export async function registerUser(walletAddress, username) {
  return request("POST", "/api/user", { wallet_address: walletAddress, username });
}
