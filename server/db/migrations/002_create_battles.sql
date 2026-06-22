-- Tracks on-chain battle state in the server DB so the lobby can list open matches
-- and the server can call settle_battle after a game ends.
--
-- id              UUID of the battle (matches the 16-byte battle_id on-chain)
-- scene           1 = DungeonScene, 2 = BridgeScene
-- player_a        Solana pubkey (base58) of the player who created the battle
-- player_b        Solana pubkey of the opponent (set when they join)
-- wager_lamports  Fixed at 100_000_000 (0.1 SOL) for now
-- status          waiting → ready → resolved | refunded
-- winner          Pubkey of the winner (set on resolution)
-- deadline_unix   Unix timestamp: if player_b never joins before this, A can claim_timeout

CREATE TABLE IF NOT EXISTS battles (
  id              UUID         PRIMARY KEY,
  scene           SMALLINT     NOT NULL,
  player_a        VARCHAR(44)  NOT NULL,
  player_b        VARCHAR(44),
  wager_lamports  BIGINT       NOT NULL DEFAULT 100000000,
  status          VARCHAR(20)  NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting','ready','resolved','refunded')),
  winner          VARCHAR(44),
  deadline_unix   BIGINT       NOT NULL,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS battles_scene_status
  ON battles (scene, status);
