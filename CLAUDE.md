# CLAUDE.md

This file provides guidance to Claude when working with code in this repository.

## What is Latch?

Latch is a real-time multiplayer browser game built with Phaser 3 and Socket.io. Players authenticate with a Solana wallet (devnet), pick a username, choose a character, and explore shared scenes — chatting via speech bubbles, fighting each other, and moving between areas. User accounts (wallet address + username) are stored in a PostgreSQL database (NeonDB).

The repo has two actively developed components: a Vite + Phaser 3 frontend and an Express + Socket.io server.

## Commands

### Frontend (`/frontend/`)
```bash
npm run dev       # Vite dev server (http://localhost:8080)
npm run build     # Production build
```

### Server (`/server/`)
```bash
node server.js    # Express + Socket.io + NeonDB on port 3001
```

## Environment Setup

**`/server/.env`** (see `.env.example`)
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=3001
```

The server runs SQL migrations automatically on boot — no manual schema setup needed.

## Architecture

### Two Active Components

**`/frontend/`** — Vite + Phaser 3 game client

Key source files in `/frontend/src/`:

| File | Role |
|---|---|
| `main.js` | Auth flow: wallet detect → DB lookup → username registration → char select → game |
| `wallet.js` | Solana wallet detection (Wallet Standard + legacy `window.*`), connect, devnet verify |
| `api.js` | REST client: `getUser(wallet)`, `registerUser(wallet, username)` |
| `config.js` | Shared `playerConfig` object (sprite, username, etc.) |
| `socket.js` | Socket.io client singleton |
| `net.js` | Shared multiplayer layer: `setupMultiplayer()`, `emitMove()`, `performAttack()`, name tags, health bars, particles |
| `CommonScene.js` | Main overworld scene — includes chat bubble system (T key) |
| `DungeonScene.js` | Dungeon scene |
| `BridgeScene.js` | Bridge scene |

Controls: arrow keys to move · Space to attack · T to chat

**`/server/`** — Express + Socket.io multiplayer backend

| Path | Role |
|---|---|
| `server.js` | Main server: CORS, REST API, Socket.io game logic |
| `db/migrate.js` | SQL migration runner — applies pending `*.sql` files on startup |
| `db/migrations/001_create_users.sql` | Creates `users` table (wallet_address, username) |

REST endpoints:
- `GET  /api/user/:wallet` — look up player by wallet address
- `POST /api/user` — register new player `{ wallet_address, username }`

### Key Design Decisions

**Wallet auth (frontend-only):** Solana wallet detection uses the Wallet Standard API (`window.navigator.wallets`) plus legacy `window.phantom?.solana`, `window.backpack`, `window.solflare`, `window.glowSolana`. Devnet verification uses a raw `fetch` to `api.devnet.solana.com` — no `@solana/web3.js` dependency.

**Database:** NeonDB PostgreSQL via `pg` with `ssl: { rejectUnauthorized: false }`. Username regex: `/^[a-zA-Z0-9_]{3,20}$/` validated on both client and server.

**Multiplayer rooms:** Players are isolated by scene — socket rooms named `"CommonScene"`, `"DungeonScene"`, `"BridgeScene"`. Combat is server-authoritative (server applies damage and decides defeats).

**Name tags:** Rendered as Phaser text objects (`fontSize: "7px"`, stroke, `depth: 55`), positioned `TAG_YOFF = -34` px above sprite centre. Updated every frame in `emitMove()` (local player) and `playerMoved` socket handler (other players).

**Chat bubbles:** `showChatBubble(sprite, message)` creates a Phaser text object with white background, anchored above the sprite, auto-fades after 2.5 s. Triggered by pressing T, submitting the HTML `#chat-input-container` form, and receiving a `chatMessage` socket event.

**Migrations:** `db/migrate.js` tracks applied files in a `schema_migrations` table. Each migration runs in a `BEGIN/COMMIT` transaction — failures roll back and crash the server, preventing a broken schema from being used. New migrations go in `db/migrations/` with zero-padded numeric prefix (e.g. `002_add_avatar.sql`).

### Auth / Game Flow

```
Wallet screen (index.html #wallet-screen)
  └─ auto-detect installed Solana extensions
       └─ user clicks wallet → connect + devnet verify
            ├─ returning player → "Welcome back, {username}" → Enter Game
            └─ new player → pick username (#register-form) → Enter Game
                 └─ Character select (#char-select)
                      └─ Phaser game starts (CommonScene)
```
