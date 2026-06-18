/**
 * Solana wallet connection — auto-detects installed extensions.
 * Supports the Wallet Standard and the legacy window.* injection pattern.
 * Devnet-only: verifies connectivity against the Solana devnet JSON-RPC.
 */

const DEVNET_RPC = "https://api.devnet.solana.com";

export let walletPubkey   = null;
export let walletProvider = null;

// ---------------------------------------------------------------------------
// Devnet verification
// ---------------------------------------------------------------------------
async function verifyDevnet(pubkey) {
  const res = await fetch(DEVNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [pubkey, { commitment: "confirmed" }],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error("Devnet RPC error: " + json.error.message);
  return json.result.value;
}

// ---------------------------------------------------------------------------
// Core connect (shared)
// ---------------------------------------------------------------------------
async function _connect(provider) {
  const resp = await provider.connect();
  const pubkey = resp.publicKey.toString();
  await verifyDevnet(pubkey);
  walletPubkey   = pubkey;
  walletProvider = provider;
  return pubkey;
}

// ---------------------------------------------------------------------------
// Auto-detect installed wallets
//
// Extensions inject themselves into window.* shortly after page load.
// We wait for DOMContentLoaded + a short tick so they're all registered.
// Each entry: { id, name, icon, connect }
// ---------------------------------------------------------------------------

/** Known legacy window.* providers and how to reach them. */
const LEGACY_PROVIDERS = [
  {
    id:   "phantom",
    name: "Phantom",
    icon: "👻",
    get:  () => window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null),
  },
  {
    id:   "backpack",
    name: "Backpack",
    icon: "🎒",
    get:  () => window.backpack ?? null,
  },
  {
    id:   "solflare",
    name: "Solflare",
    icon: "🔥",
    get:  () => window.solflare?.isSolflare ? window.solflare : null,
  },
  {
    id:   "glow",
    name: "Glow",
    icon: "✨",
    get:  () => window.glowSolana ?? null,
  },
];

/**
 * Returns an array of detected wallet objects.
 * Call after a short delay so extensions have time to inject.
 * @returns {{ id: string, name: string, icon: string, connect: () => Promise<string> }[]}
 */
export function detectWallets() {
  const found = [];

  // 1. Check Wallet Standard registry (modern wallets self-register here)
  const walletStandard = window.navigator?.wallets;
  if (walletStandard) {
    for (const w of walletStandard.get()) {
      // Only Solana wallets that support "standard:connect"
      const isSolana =
        w.chains?.some((c) => c.startsWith("solana:")) &&
        w.features?.["standard:connect"];
      if (!isSolana) continue;

      // Avoid duplicates with legacy providers (match by name prefix)
      const alreadyAdded = found.some((f) =>
        f.name.toLowerCase() === w.name.toLowerCase()
      );
      if (alreadyAdded) continue;

      const provider = w; // Wallet Standard shape
      found.push({
        id:   w.name.toLowerCase().replace(/\s+/g, "-"),
        name: w.name,
        icon: w.icon ?? "🔑", // wallets can supply a data-URI icon
        connect: async () => {
          const feature = w.features["standard:connect"];
          const { accounts } = await feature.connect();
          if (!accounts.length) throw new Error("No accounts returned");
          const pubkey = accounts[0].address;
          await verifyDevnet(pubkey);
          walletPubkey   = pubkey;
          walletProvider = provider;
          return pubkey;
        },
      });
    }
  }

  // 2. Legacy window.* injection (Phantom, Backpack, Solflare, etc.)
  for (const def of LEGACY_PROVIDERS) {
    const provider = def.get();
    if (!provider) continue;

    // Skip if Wallet Standard already picked this one up
    const dupe = found.some(
      (f) => f.name.toLowerCase() === def.name.toLowerCase()
    );
    if (dupe) continue;

    found.push({
      id:      def.id,
      name:    def.name,
      icon:    def.icon,
      connect: () => _connect(provider),
    });
  }

  return found;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function disconnect() {
  walletProvider?.disconnect?.();
  walletPubkey   = null;
  walletProvider = null;
}

export function shortKey(pubkey) {
  if (!pubkey) return "";
  return pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
}
