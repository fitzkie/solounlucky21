-- SoloUnlucky21 reward-service schema
-- Idempotent: safe to run multiple times (IF NOT EXISTS throughout).
-- Run via: psql -d <db> -f schema.sql
-- Also embedded in the Go binary via //go:embed.

-- -------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rounds (
  id          BIGSERIAL    PRIMARY KEY,
  started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,           -- NULL = current active round
  block_id    BIGINT                 -- FK to blocks; added below after blocks table exists
);

CREATE TABLE IF NOT EXISTS blocks (
  id               BIGSERIAL    PRIMARY KEY,
  round_id         BIGINT       NOT NULL,  -- FK to rounds
  height           INTEGER      NOT NULL,
  hash             VARCHAR(64)  NOT NULL UNIQUE,
  found_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finder_address   VARCHAR(90)  NOT NULL,
  coinbase_txid    VARCHAR(64),
  top_21_snapshot  JSONB        NOT NULL,
  block_fees_sats  BIGINT       NOT NULL DEFAULT 0
);

-- share_difficulty uses NUMERIC(78,0) to cover the full 256-bit Bitcoin
-- difficulty range without overflow. Do NOT change to BIGINT or FLOAT.
CREATE TABLE IF NOT EXISTS shares (
  id                BIGSERIAL     PRIMARY KEY,
  round_id          BIGINT        NOT NULL,  -- FK to rounds
  btc_address       VARCHAR(90)   NOT NULL,
  worker_name       VARCHAR(64)   NOT NULL DEFAULT '',
  share_difficulty  NUMERIC(78,0) NOT NULL,
  submitted_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  is_stale          BOOLEAN       NOT NULL DEFAULT FALSE
);

-- VARCHAR(90) covers bech32, bech32m (Taproot), and legacy address formats.
CREATE TABLE IF NOT EXISTS workers (
  btc_address  VARCHAR(90)   NOT NULL,
  worker_name  VARCHAR(64)   NOT NULL DEFAULT '',
  last_seen    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  hashrate_th  NUMERIC(10,2),
  PRIMARY KEY (btc_address, worker_name)
);

-- -------------------------------------------------------------------------
-- Foreign keys (added after all tables exist to avoid forward-reference issues)
-- -------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_blocks_round') THEN
    ALTER TABLE blocks ADD CONSTRAINT fk_blocks_round FOREIGN KEY (round_id) REFERENCES rounds(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rounds_block') THEN
    ALTER TABLE rounds ADD CONSTRAINT fk_rounds_block FOREIGN KEY (block_id) REFERENCES blocks(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_shares_round') THEN
    ALTER TABLE shares ADD CONSTRAINT fk_shares_round FOREIGN KEY (round_id) REFERENCES rounds(id);
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_shares_address_time
  ON shares (btc_address, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_shares_round
  ON shares (round_id);

-- Partial index on non-stale shares speeds up the rolling leaderboard query.
CREATE INDEX IF NOT EXISTS idx_shares_ranking
  ON shares (round_id, submitted_at DESC, share_difficulty DESC)
  WHERE is_stale = false;

-- -------------------------------------------------------------------------
-- Bootstrap: insert the first active round if none exists
-- -------------------------------------------------------------------------

INSERT INTO rounds (started_at)
SELECT NOW()
WHERE NOT EXISTS (SELECT 1 FROM rounds WHERE ended_at IS NULL);
