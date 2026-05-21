# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Latch?

Latch is a blockchain-based Web3 gaming platform on the Shape network (Chain ID: 360). Players can engage in PvP and raid mechanics using NFT items bridged cross-chain. The platform has three independently deployable components: a Next.js website, a Socket.io multiplayer server, and Solidity smart contracts.

## Commands

### Client — Website (`/client/website/`)
```bash
npm run dev     # Next.js dev server on localhost:3000
npm run build   # Production build
npm run lint    # ESLint
```

### Client — Dungeon Map (`/client/dungeonmap/`)
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

**`/client/website/.env.local`**
```
NEXT_PUBLIC_CHAIN_ID=360
NEXT_PUBLIC_PROJECT_ID=<Reown Project ID>
NEXT_PUBLIC_ALCHEMY_API_KEY=<Alchemy API Key>
```

**`/smartContract/.env`** (see `.env.example`)
```
KEY=<Alchemy RPC URL>
PK=<Deployer Private Key>
```

## Architecture

### Three Independent Components

**`/client/website/`** — Next.js 15 + React 19 main app  
- Uses the App Router. Game runs embedded via Phaser 3 in `/src/game/scenes/`.
- Wallet connection via Reown (`/src/utils/reown/`), blockchain calls via Alchemy SDK + ethers.js.
- Contract ABIs live in `/src/abis/` and are consumed directly in components and utils.
- State shared across the app via React Context in `/src/utils/contextAPI/`.

**`/client/dungeonmap/`** — Standalone Vite + Phaser 3 dungeon game  
- Separate from the website; has its own build pipeline. Intended to be embedded or linked.

**`/server/server.js`** — Express + Socket.io multiplayer backend  
- Manages real-time player position, attacks, and disconnection events.
- Single file; deployed to Vercel (see `vercel.json`).

**`/smartContract/`** — Hardhat + Solidity 0.8.28 smart contracts  
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

Deployment modules are in `/smartContract/ignition/modules/`. Interaction scripts in `/smartContract/scripts/` follow a numbered flow: mint → import → export.

### Key Data Flow

Frontend wallet → Reown (wagmi/viem under the hood) → Alchemy RPC → Shape network contracts. Real-time game state (player positions, combat) flows through the Socket.io server independently of on-chain state.

## Networks

| Network | Chain ID | Usage |
|---|---|---|
| Shape Mainnet | 360 | Production |
| Shape Sepolia | 11011 | Testnet |
| Localhost | 31337 | Development |

Hardhat RPC endpoints are configured via the `KEY` env var (Alchemy URL) in `hardhat.config.js`.
