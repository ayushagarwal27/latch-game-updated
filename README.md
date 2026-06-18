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
- **Smart contracts** — Solidity contracts on Shape network (kept for future on-chain features)

---

## Architecture

```
latch/
├── frontend/        Vite + Phaser 3 game client
├── server/          Express + Socket.io multiplayer server
└── smartContract/   Hardhat + Solidity 0.8.28 (future use)
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

### Smart Contracts (`/smartContract/`)

| Contract | Role |
|---|---|
| `Latch.sol` | ERC20 game currency |
| `Items.sol` | ERC721 in-game NFT items |
| `Bridge.sol` | Cross-chain NFT import/export |
| `Pvp.sol` / `Raid.sol` | Core gameplay mechanics |
| `TokenMarket.sol` | On-chain marketplace |
| `PvpVault`, `RaidVault`, `BridgeVault`, `TeamVault` | Prize and asset custody |

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

---

## Smart contracts

### Environment

Create `smartContract/.env`:

```env
KEY=<Alchemy RPC URL>
PK=<Deployer private key>
```

### Deploy

```bash
cd smartContract
npm install

# Testnet
npx hardhat ignition deploy ignition/modules/deploy.js --network shape_sepolia

# Mainnet
npx hardhat ignition deploy ignition/modules/deploy.js --network shape

# Local
npx hardhat node
npx hardhat ignition deploy ignition/modules/deploy.js --network localhost
```

### Test

```bash
npx hardhat test --network localhost
```

### Scripts

```bash
# Mint $LATCH and items
npx hardhat run scripts/1.mintLatchAndItems.js --network <network>

# Simulate PvP
npx hardhat run scripts/simulation/pvp.js --network localhost
```

### Deployment addresses

#### Shape Mainnet (Chain ID: 360)

| Contract | Address |
|---|---|
| `Latch` | 0x1c6d87af805849F930Cee5fEd41a74e8623A44E2 |
| `TokenMarket` | 0xb955c17583D5567A82AF76c96019ee0491Fe7721 |
| `Items` | 0x970519c725E72301f025A1d0aB9E91C547bFd91a |
| `Bridge` | 0xe59A36716dc801e605a343bBC0d901de828A7C5a |
| `BridgeVault` | 0x4B7d08A8aa0D09B2EE8ECE7EA00a2D2c6Fde2931 |
| `Pvp` | 0x386C282eA682e9df5B4A208fB63F2Ecc57F4c514 |
| `PvpVault` | 0x7d63B3933e42224355fD58f9967F9D183B92B2C7 |
| `Raid` | 0xfdd0d5efFCF2AA12921c834342F6F69bA2676230 |
| `RaidVault` | 0x35699227a87FAF0DBA1F1EaeF5BAdC0e61007e69 |
| `TeamVault` | 0xf491c42Ebe4B5183253E099521E54AaBdA2F1D39 |

#### Shape Sepolia (Chain ID: 11011)

| Contract | Address |
|---|---|
| `Latch` | 0xfD80e748d4493272E67E04FeEBf95D83D5A6F249 |
| `TokenMarket` | 0xc7cdbC917E70d73A50959aD16a54DD974890cb46 |
| `Items` | 0x47aCEcD958d5651e90d5F4DB7D6ae889BD6ca33b |
| `Bridge` | 0x1A7cfB1b9cDF5215490A932AEe404eC5effe805e |
| `BridgeVault` | 0x216E1595C13326a2879144D9E34398be912a09d1 |
| `Pvp` | 0x24e6638766BaA6Ec496E59A37A13B7422d8532a5 |
| `PvpVault` | 0xFb2ed7f7C515D2b3523E141BFb834f7b9b450231 |
| `Raid` | 0xe2E7d333aAeF8e236b3A146eAb9BA03f9aA9F232 |
| `RaidVault` | 0xe39C7ac86cdB49688B6AE5D9511e8a2693a7923D |
| `TeamVault` | 0x3F774146851E870458CcaeF92EB9A3638E37f681 |
