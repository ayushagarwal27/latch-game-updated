-- Create the players table.
-- wallet_address: base-58 Solana public key (max 44 chars)
-- username:       3-20 alphanumeric/underscore characters, unique per player

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL       PRIMARY KEY,
  wallet_address VARCHAR(44)  UNIQUE NOT NULL,
  username       VARCHAR(20)  UNIQUE NOT NULL,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
