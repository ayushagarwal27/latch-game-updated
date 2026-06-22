require("dotenv").config();
const express    = require("express");
const http       = require("http");
const cors       = require("cors");
const { Server } = require("socket.io");
const { Pool }   = require("pg");
const { migrate } = require("./db/migrate");
const {
  Connection, Keypair, PublicKey,
  Transaction, TransactionInstruction, SystemProgram,
} = require("@solana/web3.js");
const bs58 = require("bs58");

const app        = express();
const httpServer = http.createServer(app);

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allow the Vite dev server and the deployed client.
const corsOptions = { origin: true, credentials: true };
app.use(cors(corsOptions));
app.use(express.json());

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, { cors: corsOptions });

// ── PostgreSQL (NeonDB) ───────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for NeonDB
});

// Run all pending SQL migrations before the server starts accepting traffic.
migrate(pool).catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1); // don't boot a server with a broken schema
});

// ── User API ──────────────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Lookup a player by wallet address.
// 200 { found: true,  user: { wallet_address, username } }
// 200 { found: false }
app.get("/api/user/:wallet", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT wallet_address, username FROM users WHERE wallet_address = $1",
      [req.params.wallet]
    );
    if (rows.length) {
      res.json({ found: true, user: rows[0] });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Register a new player.
// Body: { wallet_address, username }
// 201 { user: { wallet_address, username } }
// 409 if wallet or username already taken
app.post("/api/user", async (req, res) => {
  const { wallet_address, username } = req.body ?? {};

  if (!wallet_address || !username) {
    return res.status(400).json({ error: "wallet_address and username are required" });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: "Username must be 3-20 characters: letters, numbers, or underscores only",
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (wallet_address, username)
       VALUES ($1, $2)
       RETURNING wallet_address, username`,
      [wallet_address, username.toLowerCase()]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation — figure out which field
      const field = err.constraint?.includes("username") ? "username" : "wallet";
      return res.status(409).json({ error: `That ${field} is already taken` });
    }
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Health check
app.get("/", (req, res) => res.send("Latch game server is running."));

// ── Solana settlement ─────────────────────────────────────────────────────────

const SOLANA_RPC  = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const PROGRAM_ID  = new PublicKey("EjhoLdwKGbvpp3ydY8nSFq89r4aJBswUeaXWZXX5tW8b");
const SETTLE_DISC = Buffer.from([4, 146, 32, 157, 82, 216, 214, 28]);

// Load admin keypair from ADMIN_PRIVATE_KEY env var.
// Accepts either:
//   - Base58 string (exported directly from Phantom)
//   - JSON byte array: [0,1,2,...]
let adminKeypair = null;
try {
  const raw = process.env.ADMIN_PRIVATE_KEY;
  if (raw) {
    let secretKey;
    if (raw.trim().startsWith("[")) {
      secretKey = Uint8Array.from(JSON.parse(raw));
    } else {
      secretKey = bs58.decode(raw.trim());
    }
    adminKeypair = Keypair.fromSecretKey(secretKey);
    console.log("Admin keypair loaded:", adminKeypair.publicKey.toBase58());
  } else {
    console.warn("ADMIN_PRIVATE_KEY not set — on-chain settlement disabled");
  }
} catch (e) {
  console.error("Failed to load admin keypair:", e.message);
}

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}

function getBattlePDA(battleIdBytes) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("battle_state"), battleIdBytes],
    PROGRAM_ID
  )[0];
}

function getVaultPDA(battleIdBytes) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), battleIdBytes],
    PROGRAM_ID
  )[0];
}

async function settleBattleOnChain(battleId, winnerPubkey) {
  if (!adminKeypair) {
    console.warn("settleBattle skipped: no admin keypair");
    return null;
  }
  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");
    const battleIdBytes = uuidToBytes(battleId);

    // Instruction data: 8-byte discriminator + 16-byte battle_id
    const data = Buffer.alloc(24);
    SETTLE_DISC.copy(data, 0);
    battleIdBytes.copy(data, 8);

    const configPDA = process.env.CONFIG_PDA
      ? new PublicKey(process.env.CONFIG_PDA)
      : null;

    if (!configPDA) {
      console.warn("settleBattle skipped: CONFIG_PDA not set");
      return null;
    }

    const battleStatePDA = getBattlePDA(battleIdBytes);
    const vaultPDA       = getVaultPDA(battleIdBytes);
    const winner         = new PublicKey(winnerPubkey);

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: configPDA,             isSigner: false, isWritable: false },
        { pubkey: adminKeypair.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: battleStatePDA,        isSigner: false, isWritable: true  },
        { pubkey: winner,                isSigner: false, isWritable: true  },
        { pubkey: vaultPDA,              isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: adminKeypair.publicKey })
      .add(instruction);
    tx.sign(adminKeypair);

    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`settleBattle ok: ${battleId} winner=${winnerPubkey} sig=${sig}`);
    return sig;
  } catch (err) {
    console.error("settleBattle failed:", err.message);
    return null;
  }
}

// ── Battle API ────────────────────────────────────────────────────────────────

// List open (waiting) battles for a scene. scene: 1=Dungeon, 2=Bridge
app.get("/api/battles/:scene", async (req, res) => {
  try {
    const scene = parseInt(req.params.scene, 10);
    const { rows } = await pool.query(
      `SELECT b.id, b.scene, b.player_a, b.wager_lamports, b.deadline_unix, b.created_at,
              u.username AS player_a_username
       FROM battles b
       LEFT JOIN users u ON u.wallet_address = b.player_a
       WHERE b.scene = $1 AND b.status = 'waiting'
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [scene]
    );
    res.json({ battles: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Create a battle record after the on-chain tx succeeds.
// Body: { id, scene, player_a, deadline_unix }
app.post("/api/battle", async (req, res) => {
  const { id, scene, player_a, deadline_unix } = req.body ?? {};
  if (!id || !scene || !player_a || !deadline_unix) {
    return res.status(400).json({ error: "id, scene, player_a, deadline_unix required" });
  }
  try {
    await pool.query(
      `INSERT INTO battles (id, scene, player_a, deadline_unix)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, scene, player_a, deadline_unix]
    );
    // Broadcast to players in the lobby room for this scene
    io.to(`lobby:${scene}`).emit("lobbyUpdate");
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Player B joins a battle (after on-chain join_battle succeeds).
// Body: { player_b }
app.post("/api/battle/:id/join", async (req, res) => {
  const { player_b } = req.body ?? {};
  const { id } = req.params;
  if (!player_b) return res.status(400).json({ error: "player_b required" });
  try {
    const { rows } = await pool.query(
      `UPDATE battles SET player_b = $1, status = 'ready'
       WHERE id = $2 AND status = 'waiting'
       RETURNING *`,
      [player_b, id]
    );
    if (!rows.length) return res.status(409).json({ error: "Battle not available" });
    const battle = rows[0];
    // Notify both players the battle is ready
    io.to(`lobby:${battle.scene}`).emit("battleReady", { battleId: id });
    io.to(`lobby:${battle.scene}`).emit("lobbyUpdate");
    res.json({ ok: true, battle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Cancel a battle after the creator reclaims on-chain (claim_timeout).
// Marks it 'refunded' and notifies everyone in the lobby room.
app.post("/api/battle/:id/cancel", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE battles SET status = 'refunded'
       WHERE id = $1 AND status = 'waiting'
       RETURNING scene`,
      [id]
    );
    if (!rows.length) return res.status(409).json({ error: "Battle not cancellable" });
    io.to(`lobby:${rows[0].scene}`).emit("lobbyUpdate");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// ── Socket.io game logic ──────────────────────────────────────────────────────

const players = {};

function playersInScene(scene, exceptId) {
  const result = {};
  for (const [id, p] of Object.entries(players)) {
    if (p.scene === scene && id !== exceptId) result[id] = p;
  }
  return result;
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  players[socket.id] = {
    playerId:     socket.id,
    scene:        null,
    sprite:       "Spearman",
    username:     null,
    walletAddress: null,
    battleId:     null,
    x: 400, y: 300,
    life: 100, attack: 10, weapon: "sword",
    animation: "Spearman_idleDown",
    flipX: false,
  };

  // Player opens the lobby overlay for a scene (before the game starts)
  socket.on("joinLobby", (sceneNum) => {
    socket.join(`lobby:${sceneNum}`);
  });
  socket.on("leaveLobby", (sceneNum) => {
    socket.leave(`lobby:${sceneNum}`);
  });

  socket.on("joinScene", (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const nextScene = data.scene || "CommonScene";

    if (p.scene && p.scene !== nextScene) {
      socket.leave(p.scene);
      socket.to(p.scene).emit("playerDisconnected", socket.id);
    }

    p.scene    = nextScene;
    if (data.sprite)        p.sprite        = data.sprite;
    if (data.username)      p.username      = data.username;
    if (data.walletAddress) p.walletAddress = data.walletAddress;
    if (data.battleId)      p.battleId      = data.battleId;
    if (typeof data.x === "number") p.x = data.x;
    if (typeof data.y === "number") p.y = data.y;
    if (data.animation) p.animation = data.animation;
    p.flipX = !!data.flipX;
    p.life  = 100;

    socket.join(nextScene);
    socket.emit("currentPlayers", playersInScene(nextScene, socket.id));
    socket.to(nextScene).emit("newPlayer", p);
    console.log(`${p.username ?? socket.id} joined ${nextScene}`);
  });

  socket.on("movePlayer", (data) => {
    const p = players[socket.id];
    if (!p || !p.scene) return;
    p.x = data.x; p.y = data.y;
    p.animation = data.animation;
    p.flipX     = data.flipX;
    socket.to(p.scene).emit("playerMoved", p);
  });

  socket.on("attackPlayer", (targetId) => {
    const attacker = players[socket.id];
    const target   = players[targetId];
    if (!attacker || !target) return;
    if (attacker.scene == null || attacker.scene !== target.scene) return;

    target.life -= attacker.attack;
    if (target.life <= 0) {
      target.life = 0;
      io.to(attacker.scene).emit("playerDefeated", targetId);

      // On-chain settlement: pay winner if both players were in a wager battle.
      const battleId     = attacker.battleId || target.battleId;
      const winnerWallet = attacker.walletAddress;
      const rewardLamports = battleId ? 200_000_000 : 0; // 2 × 0.1 SOL

      // Notify both players with the battle result for the post-match popup.
      io.to(attacker.scene).emit("battleResult", {
        winnerId:       socket.id,
        winnerUsername: attacker.username || "Unknown",
        loserUsername:  target.username   || "Unknown",
        rewardLamports,
        battleId: battleId || null,
      });

      if (battleId && winnerWallet) {
        pool.query(
          `UPDATE battles SET status = 'resolved', winner = $1
           WHERE id = $2 AND status = 'ready'`,
          [winnerWallet, battleId]
        ).then(() => settleBattleOnChain(battleId, winnerWallet))
          .catch(err => console.error("settle DB/chain error:", err.message));
      }
    } else {
      io.to(attacker.scene).emit("playerAttacked", {
        attacker: socket.id,
        target:   targetId,
        life:     target.life,
      });
    }
  });

  socket.on("chatMessage", (data) => {
    const p = players[socket.id];
    if (!p || !p.scene || typeof data.message !== "string") return;
    const message = data.message.trim().slice(0, 80);
    if (!message) return;
    io.to(p.scene).emit("chatMessage", { playerId: socket.id, message });
  });

  socket.on("disconnect", () => {
    const p = players[socket.id];
    if (p?.scene) socket.to(p.scene).emit("playerDisconnected", socket.id);
    delete players[socket.id];
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
