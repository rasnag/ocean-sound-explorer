-- Local synthetic issuer only. Production identity/session policy remains gated.
CREATE TABLE founder_identities (
  identity_id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 128),
  role text NOT NULL CHECK (role IN ('founder','family')),
  enabled boolean NOT NULL DEFAULT true,
  password_salt text NOT NULL CHECK (password_salt ~ '^[0-9a-f]{32}$'),
  password_hash text NOT NULL CHECK (password_hash ~ '^[0-9a-f]{128}$'),
  totp_secret text NOT NULL,
  last_totp_step bigint NOT NULL DEFAULT -1
);
CREATE TABLE founder_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  identity_id uuid NOT NULL REFERENCES founder_identities(identity_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
-- A single local issuer throttle deliberately avoids account-existence distinctions.
CREATE TABLE founder_auth_throttle (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  window_started_ms bigint NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0)
);
INSERT INTO founder_auth_throttle(singleton,window_started_ms,failures) VALUES(true,0,0);
