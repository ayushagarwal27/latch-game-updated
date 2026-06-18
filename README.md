# Latch

A real-time multiplayer browser game built with Phaser 3 and Socket.io. Players connect with their Solana wallet, pick a character, and explore shared scenes — chatting via speech bubbles, fighting each other, and moving between areas.

---

## Features

- **Solana wallet login** — Phantom, Backpack, or any Wallet Standard extension; devnet only
- **User accounts** — unique username stored in PostgreSQL (NeonDB); returning players are recognized automatically
- **Real-time multiplayer** — movement, combat, and chat synced across all players via Socket.io
- **Multiple scenes** — Common area, Dungeon, and Bridge, each as an isolated room
- **Chat bubbles** — press `T` to type; message floats above your character and fades after 3 seconds
- **Usernames above players** — every player's name is visible in-world
- **Two playable characters** — Spearman and Orc, each with a full animation set

---

## Architecture

```
latch/
├── frontend/   Vite + Phaser 3 game client
└── server/     Express + Socket.io multiplayer server
```

### Frontend (`/frontend/`)

- Phaser 3 game with three scenes: `CommonScene`, `DungeonScene`, `BridgeScene`
- Wallet detection via Wallet Standard + legacy `window.*` injection
- REST calls to the server for user lookup / registration
- Controls: arrow keys to move · Space to attack · T to chat

### Server (`/server/`)

- Express + Socket.io for real-time game state
- PostgreSQL via `pg` (NeonDB) for user accounts
- SQL migrations in `db/migrations/` — applied automatically on boot
- REST endpoints:
  - `GET  /api/user/:wallet` — look up player by wallet address
  - `POST /api/user`         — register new player with username

---

## Running locally

### Prerequisites

- Node.js 18+
- A Solana wallet browser extension (Phantom or Backpack) set to **Devnet**
- A PostgreSQL database — [NeonDB free tier](https://neon.tech) works well

### 1. Server

```bash
cd server
npm install
```

Create `server/.env` (copy from `.env.example`):

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=3001
```

```bash
node server.js
# → migrate: applied 001_create_users.sql
# → Server running on port 3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:8080
```

Open a second browser tab at the same URL to test multiplayer.

---

## Game flow

```
Wallet screen
  └─ connect Phantom / Backpack (devnet)
       ├─ returning player → "Welcome back, {username}" → Enter Game
       └─ new player → pick username → Enter Game
            └─ Character select (Spearman / Orc)
                 └─ Game
```
