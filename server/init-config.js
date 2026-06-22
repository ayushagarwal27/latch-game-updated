/**
 * One-time script: call initialize() on the deployed Solana program.
 *
 * The admin keypair (from ADMIN_PRIVATE_KEY in .env) acts as both the
 * "deployer" signer and the stored "admin" pubkey in the config account.
 * After running, add the logged CONFIG_PDA address to server/.env.
 *
 * Usage:
 *   cd server && node init-config.js
 */

require("dotenv").config();
const {
  Connection, Keypair, PublicKey,
  Transaction, TransactionInstruction, SystemProgram,
} = require("@solana/web3.js");
const bs58 = require("bs58");

const PROGRAM_ID   = new PublicKey("EjhoLdwKGbvpp3ydY8nSFq89r4aJBswUeaXWZXX5tW8b");
const INIT_DISC    = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
const SOLANA_RPC   = process.env.SOLANA_RPC || "https://api.devnet.solana.com";

// ── Load admin keypair ────────────────────────────────────────────────────────

const raw = process.env.ADMIN_PRIVATE_KEY;
if (!raw) {
  console.error("ADMIN_PRIVATE_KEY not set in .env");
  process.exit(1);
}

let adminKeypair;
try {
  const secretKey = raw.trim().startsWith("[")
    ? Uint8Array.from(JSON.parse(raw))
    : bs58.decode(raw.trim());
  adminKeypair = Keypair.fromSecretKey(secretKey);
} catch (e) {
  console.error("Failed to load keypair:", e.message);
  process.exit(1);
}

const deployer = adminKeypair.publicKey;
console.log("Deployer / admin pubkey:", deployer.toBase58());

// ── Derive config PDA (seeds: "config" + deployer pubkey) ────────────────────

const [configPDA, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), deployer.toBuffer()],
  PROGRAM_ID
);
console.log("CONFIG_PDA:", configPDA.toBase58(), `(bump ${bump})`);

// ── Build instruction ─────────────────────────────────────────────────────────
// Layout: 8 bytes discriminator + 32 bytes admin pubkey = 40 bytes total

const data = Buffer.alloc(40);
INIT_DISC.copy(data, 0);
deployer.toBuffer().copy(data, 8); // admin = same as deployer

const instruction = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: configPDA,             isSigner: false, isWritable: true  },
    { pubkey: deployer,              isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
});

// ── Send transaction ──────────────────────────────────────────────────────────

(async () => {
  const connection = new Connection(SOLANA_RPC, "confirmed");

  // Check if config already exists
  const existing = await connection.getAccountInfo(configPDA);
  if (existing) {
    console.log("Config already initialized! Add this to server/.env:");
    console.log(`CONFIG_PDA=${configPDA.toBase58()}`);
    return;
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: deployer })
    .add(instruction);
  tx.sign(adminKeypair);

  console.log("Sending initialize transaction…");
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");

  console.log("✓ Initialized! Signature:", sig);
  console.log("\nAdd this to server/.env:");
  console.log(`CONFIG_PDA=${configPDA.toBase58()}`);
})().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
