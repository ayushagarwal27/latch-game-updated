/**
 * Lobby management for wager battles.
 *
 * showLobby(sceneNum, socket, onStart) — renders the lobby overlay for a scene,
 * lets the player create or join a battle, then calls onStart(battleId) when
 * the match is ready and both players have deposited.
 *
 * hideLobby() — removes the overlay and leaves the socket lobby room.
 */

import { walletPubkey } from "./wallet.js";
import {
  createBattle, joinBattle, claimTimeout,
  generateBattleId, WAGER_LAMPORTS, BATTLE_DEADLINE_SECS,
} from "./program.js";
import { playerConfig } from "./config.js";

const BASE_URL = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://latch-game-updated.onrender.com";

const SCENE_NAMES = { 1: "Dungeon", 2: "Bridge" };
const SOL = (lamports) => (lamports / 1e9).toFixed(2);

let activeSceneNum  = null;
let activeBattleId  = null;   // battle we created (waiting for opponent)
let readyListener   = null;   // the socket "battleReady" handler
let updateListener  = null;   // the socket "lobbyUpdate" handler
let activeSocket    = null;
let onCancelCb      = null;   // called when player cancels the lobby

// ── HTML overlay (injected once) ─────────────────────────────────────────────

function getLobbyEl() {
  return document.getElementById("lobby-overlay");
}

function setLobbyHTML(html) {
  const el = getLobbyEl();
  if (el) el.innerHTML = html;
}

// ── Server helpers ────────────────────────────────────────────────────────────

async function fetchBattles(sceneNum) {
  const res = await fetch(`${BASE_URL}/api/battles/${sceneNum}`);
  if (!res.ok) throw new Error("Failed to fetch battles");
  return (await res.json()).battles;
}

async function postCreateBattle(id, sceneNum, deadlineUnix) {
  await fetch(`${BASE_URL}/api/battle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      scene: sceneNum,
      player_a: walletPubkey,
      deadline_unix: deadlineUnix,
    }),
  });
}

async function postCancelBattle(id) {
  await fetch(`${BASE_URL}/api/battle/${id}/cancel`, { method: "POST" });
}

async function postJoinBattle(id) {
  const res = await fetch(`${BASE_URL}/api/battle/${id}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_b: walletPubkey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to join battle");
  }
  return res.json();
}

// ── Render states ─────────────────────────────────────────────────────────────

function renderBattleList(battles, sceneNum, onStart) {
  const sceneName = SCENE_NAMES[sceneNum] || "Battle";
  const rows = battles.length
    ? battles.map((b) => `
        <div class="lobby-battle-row" data-id="${b.id}">
          <span class="lobby-player">${b.player_a_username ?? shortPubkey(b.player_a)}</span>
          <span class="lobby-wager">◎ ${SOL(b.wager_lamports)} SOL</span>
          <button class="lobby-join-btn" data-id="${b.id}" data-scene="${sceneNum}">Join</button>
        </div>`).join("")
    : `<p class="lobby-empty">No open battles — be the first!</p>`;

  setLobbyHTML(`
    <div class="lobby-box">
      <h3>${sceneName} Lobby</h3>
      <p class="lobby-wager-info">Wager: <strong>◎ ${SOL(WAGER_LAMPORTS)} SOL</strong></p>
      <div class="lobby-list">${rows}</div>
      <div class="lobby-actions">
        <button id="lobby-create-btn">⚔️ Create Battle</button>
        <button id="lobby-close-btn">✕ Cancel</button>
      </div>
      <p id="lobby-status" class="lobby-status"></p>
    </div>
  `);

  document.getElementById("lobby-create-btn")?.addEventListener("click", () =>
    handleCreate(sceneNum, onStart)
  );
  document.getElementById("lobby-close-btn")?.addEventListener("click", () => {
    hideLobby();
    if (onCancelCb) onCancelCb();
  });

  document.querySelectorAll(".lobby-join-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleJoin(btn.dataset.id, parseInt(btn.dataset.scene), onStart)
    );
  });
}

function renderWaiting(battleId, sceneNum) {
  const sceneName = SCENE_NAMES[sceneNum] || "Battle";
  setLobbyHTML(`
    <div class="lobby-box">
      <h3>${sceneName} Battle Created</h3>
      <p class="lobby-wager-info">Wager: <strong>◎ ${SOL(WAGER_LAMPORTS)} SOL</strong></p>
      <p class="lobby-waiting">⏳ Waiting for an opponent…</p>
      <p class="lobby-hint" style="font-size:11px;color:#888;">Battle ID: ${battleId.slice(0,8)}…</p>
      <div class="lobby-actions">
        <button id="lobby-timeout-btn">↩ Cancel & Reclaim</button>
      </div>
      <p id="lobby-status" class="lobby-status"></p>
    </div>
  `);

  document.getElementById("lobby-timeout-btn")?.addEventListener("click", () =>
    handleTimeout(battleId)
  );
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("lobby-status");
  if (el) {
    el.textContent = msg;
    el.style.color = isError ? "#ff6b6b" : "#aab2c0";
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleCreate(sceneNum, onStart) {
  setStatus("Confirm the transaction in your wallet…");
  document.getElementById("lobby-create-btn").disabled = true;

  try {
    const battleId     = generateBattleId();
    const deadlineUnix = Math.floor(Date.now() / 1000) + BATTLE_DEADLINE_SECS;

    await createBattle(battleId, sceneNum);

    // Mark this player as the creator so DungeonScene/BridgeScene can spawn
    // them on the correct side of the arena.
    playerConfig.isCreator = true;

    // Set activeBattleId BEFORE postCreateBattle so that the lobbyUpdate
    // event the server emits doesn't overwrite the waiting screen.
    activeBattleId = battleId;

    // Listen for opponent joining BEFORE postCreateBattle so we can't miss
    // the battleReady event if the server fires it very quickly.
    bindBattleReady(battleId, onStart);

    await postCreateBattle(battleId, sceneNum, deadlineUnix);

    renderWaiting(battleId, sceneNum);
  } catch (err) {
    activeBattleId = null;
    setStatus(err.message || "Transaction failed", true);
    document.getElementById("lobby-create-btn").disabled = false;
  }
}

async function handleJoin(battleId, sceneNum, onStart) {
  const btn = document.querySelector(`.lobby-join-btn[data-id="${battleId}"]`);
  if (btn) btn.disabled = true;
  setStatus("Confirm the transaction in your wallet…");

  try {
    await joinBattle(battleId);
    await postJoinBattle(battleId);
    // Mark as joiner so the scene spawns on the opposite side from the creator.
    playerConfig.isCreator = false;
    // Player B transitions immediately — don't wait for battleReady which
    // may already have fired by the time we register a listener.
    hideLobby();
    onStart(battleId);
  } catch (err) {
    setStatus(err.message || "Failed to join", true);
    if (btn) btn.disabled = false;
  }
}

async function handleTimeout(battleId) {
  setStatus("Reclaiming…");
  try {
    await claimTimeout(battleId, null);
    // Mark refunded on server — this emits lobbyUpdate to all lobby players
    // so they stop seeing this battle in their list.
    await postCancelBattle(battleId);
    activeBattleId = null;
    // Close the lobby and return the player to CommonScene.
    hideLobby();
    if (onCancelCb) onCancelCb();
  } catch (err) {
    setStatus(err.message || "Claim failed", true);
  }
}

// ── Socket helpers ────────────────────────────────────────────────────────────

function bindBattleReady(battleId, onStart) {
  if (!activeSocket) return;

  // Remove previous listener if any
  if (readyListener) activeSocket.off("battleReady", readyListener);

  readyListener = ({ battleId: rid }) => {
    if (rid === battleId) {
      hideLobby();
      onStart(battleId);
    }
  };
  activeSocket.on("battleReady", readyListener);
}

async function refreshLobby(sceneNum, socket, onStart) {
  try {
    const battles = await fetchBattles(sceneNum);
    renderBattleList(battles, sceneNum, onStart);
  } catch (err) {
    setStatus("Failed to load battles", true);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Show the lobby overlay for a scene.
 * @param {number}   sceneNum  1=Dungeon, 2=Bridge
 * @param {object}   socket    Socket.io client instance
 * @param {function} onStart   Called with (battleId) when the match is ready
 * @param {function} [onCancel] Called when player dismisses the lobby
 */
export async function showLobby(sceneNum, socket, onStart, onCancel) {
  activeSceneNum = sceneNum;
  activeSocket   = socket;
  activeBattleId = null;
  onCancelCb     = onCancel ?? null;

  const overlay = getLobbyEl();
  if (!overlay) return;
  overlay.style.display = "flex";

  // Join the socket lobby room so we get live updates
  socket.emit("joinLobby", sceneNum);

  // Listen for lobby updates (new battles, joins).
  // If we're already waiting for an opponent (activeBattleId set), skip the
  // refresh — we don't want to overwrite the waiting screen.
  if (updateListener) socket.off("lobbyUpdate", updateListener);
  updateListener = () => {
    if (activeBattleId) return;
    refreshLobby(sceneNum, socket, onStart);
  };
  socket.on("lobbyUpdate", updateListener);

  setLobbyHTML(`<div class="lobby-box"><p style="color:#aab2c0;">Loading…</p></div>`);

  await refreshLobby(sceneNum, socket, onStart);
}

/**
 * Hide the lobby overlay and clean up socket listeners.
 */
export function hideLobby() {
  const overlay = getLobbyEl();
  if (overlay) overlay.style.display = "none";

  if (activeSocket) {
    if (activeSceneNum) activeSocket.emit("leaveLobby", activeSceneNum);
    if (updateListener) activeSocket.off("lobbyUpdate", updateListener);
    if (readyListener)  activeSocket.off("battleReady", readyListener);
  }

  activeSceneNum = null;
  activeSocket   = null;
  updateListener = null;
  readyListener  = null;
  onCancelCb     = null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shortPubkey(pubkey) {
  return pubkey ? pubkey.slice(0, 4) + "…" + pubkey.slice(-4) : "?";
}
