require("dotenv").config();
const express    = require("express");
const http       = require("http");
const cors       = require("cors");
const { Server } = require("socket.io");
const { Pool }   = require("pg");
const { migrate } = require("./db/migrate");

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
    playerId:  socket.id,
    scene:     null,
    sprite:    "Spearman",
    username:  null,
    x: 400, y: 300,
    life: 100, attack: 10, weapon: "sword",
    animation: "Spearman_idleDown",
    flipX: false,
  };

  socket.on("joinScene", (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const nextScene = data.scene || "CommonScene";

    if (p.scene && p.scene !== nextScene) {
      socket.leave(p.scene);
      socket.to(p.scene).emit("playerDisconnected", socket.id);
    }

    p.scene    = nextScene;
    if (data.sprite)   p.sprite   = data.sprite;
    if (data.username) p.username = data.username;
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
