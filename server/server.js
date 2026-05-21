const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const httpServer = http.createServer(app);

// Reflect the request origin and allow credentials so the Vite dev server
// (http://localhost:8080) and the deployed client can both connect during
// local development. Tighten this for production.
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// socketId -> player record. `scene` is the room the player is currently in
// ("CommonScene" | "BridgeScene" | "DungeonScene"), or null before they join.
const players = {};

// Return every player currently in `scene`, optionally excluding one id.
function playersInScene(scene, exceptId) {
  const result = {};
  for (const [id, p] of Object.entries(players)) {
    if (p.scene === scene && id !== exceptId) result[id] = p;
  }
  return result;
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Create the record but don't place them in any scene yet — the client
  // tells us which scene it's in via `joinScene` from each scene's create().
  players[socket.id] = {
    playerId: socket.id,
    scene: null,
    sprite: "Spearman",
    x: 400,
    y: 300,
    life: 100,
    attack: 10,
    weapon: "sword",
    animation: "Spearman_idleDown",
    flipX: false,
  };

  // Player entered a scene (initial load, or switched scenes via the portal
  // dialog). Move them between Socket.io rooms so they only ever see and
  // fight players in the same scene.
  socket.on("joinScene", (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const nextScene = data.scene || "CommonScene";

    // Leave the previous room and let those players drop our sprite.
    if (p.scene && p.scene !== nextScene) {
      socket.leave(p.scene);
      socket.to(p.scene).emit("playerDisconnected", socket.id);
    }

    p.scene = nextScene;
    if (data.sprite) p.sprite = data.sprite;
    if (typeof data.x === "number") p.x = data.x;
    if (typeof data.y === "number") p.y = data.y;
    if (data.animation) p.animation = data.animation;
    p.flipX = !!data.flipX;
    p.life = 100; // fresh health whenever you enter a scene

    socket.join(nextScene);

    // Tell the newcomer who is already here, and tell everyone here about them.
    socket.emit("currentPlayers", playersInScene(nextScene, socket.id));
    socket.to(nextScene).emit("newPlayer", p);

    console.log(`${socket.id} joined ${nextScene}`);
  });

  // Movement is broadcast only to the player's current room.
  socket.on("movePlayer", (movementData) => {
    const p = players[socket.id];
    if (!p || !p.scene) return;
    p.x = movementData.x;
    p.y = movementData.y;
    p.animation = movementData.animation;
    p.flipX = movementData.flipX;
    socket.to(p.scene).emit("playerMoved", p);
  });

  // Attacks only land on players in the same scene.
  socket.on("attackPlayer", (targetId) => {
    const attacker = players[socket.id];
    const target = players[targetId];
    if (!attacker || !target) return;
    if (attacker.scene == null || attacker.scene !== target.scene) return;

    target.life -= attacker.attack;
    console.log(`attack ${attacker.playerId} -> ${target.playerId} (life ${target.life})`);

    if (target.life <= 0) {
      target.life = 0;
      // Announce the KO to everyone in the room; the defeated client returns
      // to the common area and the rest drop the sprite.
      io.to(attacker.scene).emit("playerDefeated", targetId);
    } else {
      io.to(attacker.scene).emit("playerAttacked", {
        attacker: socket.id,
        target: targetId,
        life: target.life,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    const p = players[socket.id];
    if (p && p.scene) {
      socket.to(p.scene).emit("playerDisconnected", socket.id);
    }
    delete players[socket.id];
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
