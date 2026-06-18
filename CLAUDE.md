# CLAUDE.md

This file provides guidance to Claude when working with code in this repository.

## What is Latch?

Latch is a multiplayer browser game built with Phaser 3 and Socket.io. Players explore scenes, fight each other in real time, and chat via speech bubbles. The repo has three independently deployable components: a Vite + Phaser 3 frontend, a Socket.io multiplayer server, and Solidity smart contracts (kept for future use).

## Commands

### Frontend (`/frontend/`)
```bash
npm run dev       # Vite dev server
npm run build     # Vite production build
```

### Server (`/server/`)
```bash
node server.js    # Express + Socket.io server on port 3001
```

### Smart Contracts (`/smartContract/`)
```bash
npx hardhat test --network localhost                                              # Run tests
npx hardhat node                                                                  # Local node
npx hardhat ignition deploy ignition/modules/deploy.js --network shape_sepolia   # Deploy testnet
npx hardhat ignition deploy ignition/modules/deploy.js --network shape           # Deploy mainnet
npx hardhat run scripts/1.mintLatchAndItems.js --network localhost               # Mint tokens
npx hardhat run scripts/simulation/pvp.js --network localhost                    # Simulate PvP
```

## Environment Setup

**`/smartContract/.env`** (see `.env.example`)
```
KEY=<Alchemy RPC URL>
PK=<Deployer Private Key>
```

## Architecture

### Three Components

**`/frontend/`** — Vite + Phaser 3 game client
- Scenes: `CommonScene`, `DungeonScene`, `BridgeScene` in `/src/`.
- Connects to the Socket.io server for real-time multiplayer (movement, attacks, chat).
- Player controls: arrow keys to move, Space to attack, T to open chat.

**`/server/server.js`** — Express + Socket.io multiplayer backend
- Manages real-time player position, combat, chat messages, and scene rooms.
- Players are isolated by scene — only players in the same scene interact.
- Single file; deployable to any Node host.

**`/smartContract/`** — Hardhat + Solidity 0.8.28 smart contracts (future use)
- Configured for Shape Mainnet, Shape Sepolia, and local Hardhat node.
- Uses OpenZeppelin 5.x and Hardhat Ignition for deployments.

### Smart Contract System

Contracts are organized by domain under `/smartContract/contracts/`:

| Contract | Role |
|---|---|
| `Latch.sol` | ERC20 game currency |
| `Items.sol` | ERC721 in-game NFT items |
| `Bridge.sol` | Cross-chain NFT import/export |
| `Pvp.sol` / `Raid.sol` | Core gameplay mechanics |
| `TokenMarket.sol` | On-chain marketplace |
| `PvpVault`, `RaidVault`, `BridgeVault`, `TeamVault` | Prize and asset custody |

### Networks

| Network | Chain ID | Usage |
|---|---|---|
| Shape Mainnet | 360 | Production |
| Shape Sepolia | 11011 | Testnet |
| Localhost | 31337 | Development |
