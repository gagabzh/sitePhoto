-- V10: Persistent sessions via connect-pg-simple
-- Replaces in-memory express-session store with PostgreSQL.
-- Table structure matches connect-pg-simple defaults.
CREATE TABLE IF NOT EXISTS session (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);
