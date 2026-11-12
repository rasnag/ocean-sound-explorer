-- CODEX-02-B: disposable local synthetic identities only; no consent/admission.
-- Preserve migrations 001-005. All secret verifiers are SHA-256 hashes.
CREATE TABLE adult_accounts (
  adult_id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  email text NOT NULL UNIQUE CHECK (
    length(email) BETWEEN 17 AND 80 AND
    email ~ '^[a-z0-9][a-z0-9._+-]{0,63}@example[.]invalid$'
  ),
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (adult_id,household_id,email)
);
CREATE FUNCTION loop_adult_mapping_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.adult_id,NEW.household_id,NEW.email) IS DISTINCT FROM
     (OLD.adult_id,OLD.household_id,OLD.email) THEN
    RAISE EXCEPTION 'Adult mapping is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER adult_mapping_immutable BEFORE UPDATE ON adult_accounts
  FOR EACH ROW EXECUTE FUNCTION loop_adult_mapping_immutable();

CREATE TABLE adult_challenges (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email text NOT NULL CHECK (
    length(email) BETWEEN 17 AND 80 AND
    email ~ '^[a-z0-9][a-z0-9._+-]{0,63}@example[.]invalid$'
  ),
  purpose text NOT NULL CHECK (purpose IN ('join','recover')),
  adult_id uuid,
  household_id uuid,
  issued_at timestamptz NOT NULL CHECK (isfinite(issued_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  delivered_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK ((adult_id IS NULL AND household_id IS NULL AND purpose='join') OR
         (adult_id IS NOT NULL AND household_id IS NOT NULL)),
  CHECK (delivered_at IS NULL OR (isfinite(delivered_at) AND delivered_at >= issued_at)),
  CHECK (consumed_at IS NULL OR (delivered_at IS NOT NULL AND isfinite(consumed_at) AND consumed_at >= issued_at AND consumed_at < expires_at)),
  CHECK (revoked_at IS NULL OR isfinite(revoked_at)),
  FOREIGN KEY (adult_id,household_id,email)
    REFERENCES adult_accounts(adult_id,household_id,email) ON DELETE CASCADE
);
CREATE INDEX adult_challenge_address ON adult_challenges(email,purpose);
CREATE UNIQUE INDEX adult_one_live_challenge ON adult_challenges(email,purpose)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE adult_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  adult_id uuid NOT NULL REFERENCES adult_accounts ON DELETE CASCADE,
  issued_at timestamptz NOT NULL CHECK (isfinite(issued_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR isfinite(revoked_at))
);
CREATE UNIQUE INDEX adult_one_live_session ON adult_sessions(adult_id)
  WHERE revoked_at IS NULL;

-- These singleton locks deliberately serialize this small local issuer.
-- Request and verification budgets have independent bounded windows.
CREATE TABLE adult_access_throttle (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  request_started_ms bigint NOT NULL CHECK (request_started_ms >= 0),
  request_count bigint NOT NULL CHECK (request_count BETWEEN 0 AND 9007199254740991),
  verify_started_ms bigint NOT NULL CHECK (verify_started_ms >= 0),
  verify_count bigint NOT NULL CHECK (verify_count BETWEEN 0 AND 9007199254740991)
);
INSERT INTO adult_access_throttle VALUES(true,0,0,0,0);
CREATE TABLE adult_address_throttle (
  address_hash text PRIMARY KEY CHECK (address_hash ~ '^[0-9a-f]{64}$'),
  last_issued_ms bigint NOT NULL CHECK (last_issued_ms >= 0)
);
