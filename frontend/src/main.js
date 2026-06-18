import Phaser from "phaser";
import DungeonScene from "./DungeonScene.js";
import CommonScene  from "./CommonScene.js";
import BridgeScene  from "./BridgeScene.js";
import socket       from "./socket.js";
import { playerConfig } from "./config.js";
import { detectWallets, shortKey } from "./wallet.js";
import { getUser, registerUser } from "./api.js";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const walletScreen   = document.getElementById("wallet-screen");
const charSelect     = document.getElementById("char-select");
const walletList     = document.getElementById("wallet-list");
const statusEl       = document.getElementById("wallet-status");
const connectedBar   = document.getElementById("wallet-connected-bar");
const pubkeyDisplay  = document.getElementById("wallet-pubkey-display");
const enterBtn       = document.getElementById("enter-btn");
const registerForm   = document.getElementById("register-form");
const usernameInput  = document.getElementById("username-input");
const registerBtn    = document.getElementById("register-btn");
const registerStatus = document.getElementById("register-status");

// Stored after wallet connects + DB lookup
let connectedPubkey = null;
let confirmedUser   = null; // { wallet_address, username }

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type; // "error" | "ok" | ""
}

function showConnectedBar(label) {
  connectedBar.style.display = "flex";
  pubkeyDisplay.textContent  = label;
  registerForm.style.display = "none";
}

function showRegisterForm() {
  registerForm.style.display = "flex";
  connectedBar.style.display = "none";
  usernameInput.focus();
}

// ── Wallet detection & button rendering ─────────────────────────────────────
function buildWalletButtons(wallets) {
  walletList.innerHTML = "";

  if (!wallets.length) {
    walletList.innerHTML = `
      <p style="color:#aab2c0;font-size:13px;text-align:center;">
        No Solana wallet detected.<br>
        Install <a href="https://phantom.app" target="_blank" style="color:#4d96ff">Phantom</a>
        or <a href="https://backpack.app" target="_blank" style="color:#4d96ff">Backpack</a>
        and refresh.
      </p>`;
    return;
  }

  for (const wallet of wallets) {
    const btn = document.createElement("button");
    btn.className = "wallet-btn";
    const iconHtml = wallet.icon.startsWith("data:")
      ? `<img src="${wallet.icon}" style="width:36px;height:36px;border-radius:8px;" />`
      : `<span class="icon">${wallet.icon}</span>`;
    btn.innerHTML = `${iconHtml}<span>${wallet.name}</span>`;

    btn.addEventListener("click", () => handleConnect(wallet));
    walletList.appendChild(btn);
  }
}

function setWalletListDisabled(disabled) {
  walletList.querySelectorAll("button").forEach((b) => (b.disabled = disabled));
}

// ── Connect flow ──────────────────────────────────────────────────────────────
async function handleConnect(wallet) {
  setWalletListDisabled(true);
  setStatus("Connecting…");
  connectedBar.style.display = "none";
  registerForm.style.display = "none";

  try {
    const pubkey = await wallet.connect();
    connectedPubkey = pubkey;
    setStatus("Checking account…");

    const result = await getUser(pubkey);

    if (result.found) {
      // Returning player
      confirmedUser = result.user;
      setStatus(`Welcome back, ${result.user.username}!`, "ok");
      showConnectedBar(`${result.user.username} · ${shortKey(pubkey)}`);
    } else {
      // New player — need a username
      setStatus("Wallet connected ✓ — create your username", "ok");
      showRegisterForm();
    }
  } catch (err) {
    setStatus(err.message || "Connection failed", "error");
    connectedPubkey = null;
  } finally {
    setWalletListDisabled(false);
  }
}

// ── Username registration ─────────────────────────────────────────────────────
registerBtn.addEventListener("click", submitUsername);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitUsername();
});

async function submitUsername() {
  const username = usernameInput.value.trim();
  registerStatus.textContent = "";

  if (!USERNAME_RE.test(username)) {
    registerStatus.textContent =
      "3-20 characters: letters, numbers, underscores only";
    return;
  }

  registerBtn.disabled = true;
  registerStatus.textContent = "Saving…";
  registerStatus.style.color = "#aab2c0";

  try {
    const { user } = await registerUser(connectedPubkey, username);
    confirmedUser = user;
    setStatus(`Welcome, ${user.username}!`, "ok");
    showConnectedBar(`${user.username} · ${shortKey(connectedPubkey)}`);
  } catch (err) {
    registerStatus.textContent = err.message || "Registration failed";
    registerStatus.style.color = "#ff6b6b";
  } finally {
    registerBtn.disabled = false;
  }
}

// ── Enter game ────────────────────────────────────────────────────────────────
enterBtn.addEventListener("click", () => {
  walletScreen.style.display = "none";
  charSelect.style.display   = "flex";
});

// ── Character select → game ───────────────────────────────────────────────────
document.querySelectorAll("#char-select .char-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    playerConfig.sprite   = btn.getAttribute("data-sprite") || "Spearman";
    playerConfig.username = confirmedUser?.username ?? null;
    charSelect.style.display = "none";
    startGame();
  });
});

// ── Game boot ─────────────────────────────────────────────────────────────────
function startGame() {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
      default: "arcade",
      arcade: { gravity: { y: 0 }, debug: false },
    },
    scene: [CommonScene, DungeonScene, BridgeScene],
    scale: { zoom: 3 },
    callbacks: {
      postBoot: () => { window.socket = socket; },
    },
  });
}

// ── Boot wallet detection ─────────────────────────────────────────────────────
function scanWallets() {
  const wallets = detectWallets();
  buildWalletButtons(wallets);
  if (!wallets.length) {
    setTimeout(() => {
      const late = detectWallets();
      if (late.length) buildWalletButtons(late);
    }, 1000);
  }
}

window.addEventListener("DOMContentLoaded", scanWallets);
