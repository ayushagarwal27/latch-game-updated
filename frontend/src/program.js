/**
 * Solana program interactions for the Latch wager contract.
 *
 * Program ID: EjhoLdwKGbvpp3ydY8nSFq89r4aJBswUeaXWZXX5tW8b
 *
 * Instructions handled here (client-side only):
 *   createBattle  — Player A deposits wager and opens a battle
 *   joinBattle    — Player B matches the wager
 *   claimTimeout  — Player A reclaims funds if no opponent joins before deadline
 *
 * settle_battle is called server-side (admin keypair required).
 *
 * Instructions are encoded manually using the discriminators from the IDL —
 * no Anchor runtime needed in the browser.
 */

import {
  Connection, PublicKey,
  Transaction, TransactionInstruction, SystemProgram,
} from "@solana/web3.js";
import { walletProvider, walletPubkey } from "./wallet.js";

const DEVNET_RPC  = "https://api.devnet.solana.com";
const PROGRAM_ID  = new PublicKey("EjhoLdwKGbvpp3ydY8nSFq89r4aJBswUeaXWZXX5tW8b");

export const WAGER_LAMPORTS = 100_000_000; // 0.1 SOL
export const BATTLE_DEADLINE_SECS = 10 * 60; // 10 minutes

// Anchor instruction discriminators (from abi/contract.json)
const DISC = {
  createBattle: Buffer.from([2,   249, 54,  216, 42,  99,  187, 102]),
  joinBattle:   Buffer.from([126, 0,   69,  130, 127, 145, 54,  100]),
  claimTimeout: Buffer.from([130, 234, 45,  53,  120, 90,  86,  178]),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UUID string to a 16-byte Buffer. */
export function uuidToBytes(uuid) {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/** Generate a new random UUID (v4) for use as battle_id. */
export function generateBattleId() {
  return crypto.randomUUID();
}

export function getBattlePDA(battleIdBytes) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("battle_state"), battleIdBytes],
    PROGRAM_ID
  )[0];
}

export function getVaultPDA(battleIdBytes) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), battleIdBytes],
    PROGRAM_ID
  )[0];
}

/**
 * Sign and send a transaction using the connected wallet.
 * Supports both the legacy provider interface (Phantom, Backpack) and
 * the Wallet Standard `solana:signTransaction` feature.
 */
async function sendTransaction(instruction) {
  const provider = walletProvider;
  if (!provider || !walletPubkey) throw new Error("No wallet connected");

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const feePayer = new PublicKey(walletPubkey);
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer }).add(instruction);

  let signed;
  if (typeof provider.signTransaction === "function") {
    // Legacy interface: Phantom, Backpack, Solflare (window.* injection)
    signed = await provider.signTransaction(tx);
  } else if (provider.features?.["solana:signTransaction"]) {
    // Wallet Standard interface
    const feat = provider.features["solana:signTransaction"];
    const result = await feat.signTransaction({
      transaction: tx,
      chain: "solana:devnet",
    });
    signed = result.signedTransaction;
  } else {
    throw new Error("Connected wallet does not support transaction signing");
  }

  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// ── Instructions ──────────────────────────────────────────────────────────────

/**
 * Create a new wager battle on-chain.
 * @param {string} battleId  UUID string (used as the 16-byte battle_id)
 * @param {number} sceneNum  1 = Dungeon, 2 = Bridge
 * @returns {Promise<string>} transaction signature
 */
export async function createBattle(battleId, sceneNum) {
  const battleIdBytes = uuidToBytes(battleId);
  const deadline      = BigInt(Math.floor(Date.now() / 1000) + BATTLE_DEADLINE_SECS);

  // Layout: [disc 8] [battle_id 16] [scene 1] [wager_lamports 8 LE] [deadline_unix 8 LE]
  const data = Buffer.alloc(41);
  DISC.createBattle.copy(data, 0);
  battleIdBytes.copy(data, 8);
  data.writeUInt8(sceneNum, 24);
  data.writeBigUInt64LE(BigInt(WAGER_LAMPORTS), 25);
  data.writeBigInt64LE(deadline, 33);

  const playerPubkey   = new PublicKey(walletPubkey);
  const battleStatePDA = getBattlePDA(battleIdBytes);
  const vaultPDA       = getVaultPDA(battleIdBytes);

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: playerPubkey,            isSigner: true,  isWritable: true  },
      { pubkey: battleStatePDA,          isSigner: false, isWritable: true  },
      { pubkey: vaultPDA,                isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return sendTransaction(instruction);
}

/**
 * Join an existing battle as Player B.
 * @param {string} battleId  UUID string matching the open battle
 * @returns {Promise<string>} transaction signature
 */
export async function joinBattle(battleId) {
  const battleIdBytes = uuidToBytes(battleId);

  // Layout: [disc 8] [battle_id 16]
  const data = Buffer.alloc(24);
  DISC.joinBattle.copy(data, 0);
  battleIdBytes.copy(data, 8);

  const playerPubkey   = new PublicKey(walletPubkey);
  const battleStatePDA = getBattlePDA(battleIdBytes);
  const vaultPDA       = getVaultPDA(battleIdBytes);

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: playerPubkey,            isSigner: true,  isWritable: true  },
      { pubkey: battleStatePDA,          isSigner: false, isWritable: true  },
      { pubkey: vaultPDA,                isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return sendTransaction(instruction);
}

/**
 * Reclaim your wager if no opponent joined before the deadline.
 * @param {string}      battleId       UUID string
 * @param {string|null} playerBPubkey  Player B's pubkey if they joined, or null
 * @returns {Promise<string>} transaction signature
 */
export async function claimTimeout(battleId, playerBPubkey = null) {
  const battleIdBytes = uuidToBytes(battleId);

  const data = Buffer.alloc(24);
  DISC.claimTimeout.copy(data, 0);
  battleIdBytes.copy(data, 8);

  const playerPubkey   = new PublicKey(walletPubkey);
  const battleStatePDA = getBattlePDA(battleIdBytes);
  const vaultPDA       = getVaultPDA(battleIdBytes);

  // player_b is optional — use PROGRAM_ID as placeholder when null
  const playerBKey = playerBPubkey ? new PublicKey(playerBPubkey) : PROGRAM_ID;

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: playerPubkey,            isSigner: true,  isWritable: true  },
      { pubkey: battleStatePDA,          isSigner: false, isWritable: true  },
      { pubkey: playerBKey,              isSigner: false, isWritable: true  },
      { pubkey: vaultPDA,                isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return sendTransaction(instruction);
}
