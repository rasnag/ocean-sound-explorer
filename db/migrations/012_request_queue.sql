-- CODEX-04-C data-and-journal. Local synthetic only; preserve 001..011.
-- Private content lives inside authenticated encrypted committed facts.
-- References below identify paths inside those facts, never plaintext content.
-- Current queue version is MAX(aggregate_version), under the household/request
-- locks. Its presence alone is NOT an acknowledgement.

CREATE FUNCTION queue_valid_sealed(r jsonb, s text, h uuid, c uuid,
  rid uuid, pid uuid, digest text, ns text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(
  jsonb_typeof(r)='object'
  AND r ?& ARRAY['version','scope','household_id','command_id','record_id',
    'primary_commit_id','canonical_digest','namespace_verifier','nonce','ciphertext','tag']
  AND (r-'version'-'scope'-'household_id'-'command_id'-'record_id'
    -'primary_commit_id'-'canonical_digest'-'namespace_verifier'-'nonce'-'ciphertext'-'tag')='{}'::jsonb
  AND r->'version'='1'::jsonb
  AND r->>'scope'=s
  AND ((h IS NULL AND r->'household_id'='null'::jsonb)
    OR (h IS NOT NULL AND r->>'household_id'=h::text))
  AND r->>'command_id'=c::text AND r->>'record_id'=rid::text
  AND r->>'primary_commit_id'=pid::text
  AND r->>'canonical_digest'=digest AND r->>'namespace_verifier'=ns
  AND jsonb_typeof(r->'nonce')='string'
  AND length(r->>'nonce')=16 AND (r->>'nonce') ~ '^[A-Za-z0-9+/]{16}$'
  AND jsonb_typeof(r->'tag')='string'
  AND length(r->>'tag')=24 AND (r->>'tag') ~ '^[A-Za-z0-9+/]{22}==$'
  AND jsonb_typeof(r->'ciphertext')='string'
  AND length(r->>'ciphertext') BETWEEN 4 AND 100000
  AND (r->>'ciphertext') ~ '^[A-Za-z0-9+/]+={0,2}$', false)
$$;

-- Bind once to an existing independent journal. NULL is unconfigured, not a
-- permission to discard primary history or initialize a replacement journal.
CREATE TABLE queue_journal_namespace (
 singleton boolean PRIMARY KEY CHECK(singleton),
 namespace_verifier text CHECK(namespace_verifier ~ '^[0-9a-f]{64}$')
);
INSERT INTO queue_journal_namespace VALUES(true,NULL);
CREATE FUNCTION queue_namespace_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.namespace_verifier IS NOT NULL OR NEW.singleton IS DISTINCT FROM OLD.singleton
   OR NEW.namespace_verifier IS NULL THEN
  RAISE EXCEPTION 'Queue namespace is immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER queue_namespace_stable BEFORE UPDATE ON queue_journal_namespace
 FOR EACH ROW EXECUTE FUNCTION queue_namespace_guard();

-- Immutable anchor to the ORIGINAL production source and receipt. A correction
-- uses queue_scopes; it never rewrites request_source_scopes or a booking.
CREATE TABLE queue_requests (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 child_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 original_source_scope_version bigint NOT NULL
  CHECK(original_source_scope_version BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(household_id,request_id),
 UNIQUE(household_id,request_id,child_id),
 FOREIGN KEY(household_id,request_id,child_id)
  REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,receipt_id,request_id)
  REFERENCES production_receipts(household_id,receipt_id,request_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,original_source_scope_version)
  REFERENCES wonder_source_payloads(household_id,request_id,source_scope_version) ON DELETE CASCADE
);
CREATE TRIGGER queue_request_immutable BEFORE UPDATE ON queue_requests
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- PRIMARY-COMMITTED outbox: inserted in the SAME transaction as the domain
-- transition, kernel.apply, scope/history rows, and capacity release if any.
-- command/result/effect, provenance and exact snapshots are encrypted together.
CREATE TABLE queue_commands (
 household_id uuid NOT NULL,
 command_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 actor_kind text NOT NULL CHECK(actor_kind IN ('founder','parent')),
 original_session_hash text NOT NULL CHECK(original_session_hash ~ '^[0-9a-f]{64}$'),
 consent_epoch bigint NOT NULL CHECK(consent_epoch BETWEEN 1 AND 9007199254740991),
 aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)
  AND recorded_at >= timestamptz '0001-01-01 00:00:00+00'
  AND recorded_at < timestamptz '10000-01-01 00:00:00+00'
  AND recorded_at=date_trunc('milliseconds',recorded_at)),
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 namespace_verifier text NOT NULL CHECK(namespace_verifier ~ '^[0-9a-f]{64}$'),
 record_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL,
 sealed_record jsonb NOT NULL,
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,record_id),
 UNIQUE(household_id,primary_commit_id),
 UNIQUE(household_id,request_id,aggregate_version),
 UNIQUE(household_id,command_id,request_id,aggregate_version),
 UNIQUE(household_id,command_id,record_id,primary_commit_id),
 FOREIGN KEY(household_id,request_id) REFERENCES queue_requests ON DELETE CASCADE,
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE,
 CHECK(queue_valid_sealed(sealed_record,'household',household_id,command_id,
  record_id,primary_commit_id,canonical_digest,namespace_verifier))
);
CREATE INDEX queue_commands_actor ON queue_commands(household_id,actor_kind,actor_id,consent_epoch);
CREATE TRIGGER queue_command_immutable BEFORE UPDATE ON queue_commands
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Queue scope numbering starts at 1, independently of the immutable capture
-- source_scope_version. Payload is fact.effect.scopes[scope_version].
CREATE TABLE queue_scopes (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 scope_version bigint NOT NULL CHECK(scope_version BETWEEN 1 AND 9007199254740991),
 previous_scope_version bigint,
 kind text NOT NULL CHECK(kind IN ('original','correction','alternative')),
 command_id uuid NOT NULL,
 record_id uuid NOT NULL,
 payload_ref text NOT NULL,
 PRIMARY KEY(household_id,request_id,scope_version),
 CHECK((scope_version=1 AND previous_scope_version IS NULL AND kind='original') OR
  (scope_version>1 AND previous_scope_version=scope_version-1 AND kind IN ('correction','alternative'))),
 CHECK(payload_ref='queue-fact:'||record_id::text),
 FOREIGN KEY(household_id,request_id) REFERENCES queue_requests ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,previous_scope_version)
  REFERENCES queue_scopes(household_id,request_id,scope_version) ON DELETE CASCADE,
 FOREIGN KEY(household_id,command_id) REFERENCES queue_commands ON DELETE CASCADE,
 FOREIGN KEY(household_id,record_id) REFERENCES queue_commands(household_id,record_id) ON DELETE CASCADE
);

-- One immutable state/history version per committed queue command. Actual
-- history text, interpretation, clarification/answer, alternative, fit evidence,
-- late DRAFT, original/current words and result live in its encrypted fact.
CREATE TABLE queue_history (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
 command_id uuid NOT NULL,
 record_id uuid NOT NULL,
 scope_version bigint NOT NULL CHECK(scope_version BETWEEN 1 AND 9007199254740991),
 agreement_version bigint NOT NULL CHECK(agreement_version BETWEEN 0 AND 9007199254740991),
 state text NOT NULL CHECK(state IN ('submitted','awaiting-clarification','fit-review',
  'alternative-proposed','agreed-scope','accepted','declined','cancelled')),
 breach_observed boolean NOT NULL,
 payload_ref text NOT NULL,
 PRIMARY KEY(household_id,request_id,aggregate_version),
 UNIQUE(household_id,command_id),
 CHECK(agreement_version=0 OR agreement_version=scope_version),
 CHECK(state<>'agreed-scope' OR agreement_version=scope_version),
 CHECK(payload_ref='queue-fact:'||record_id::text),
 FOREIGN KEY(household_id,command_id,request_id,aggregate_version)
  REFERENCES queue_commands(household_id,command_id,request_id,aggregate_version) ON DELETE CASCADE,
 FOREIGN KEY(household_id,record_id) REFERENCES queue_commands(household_id,record_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,scope_version)
  REFERENCES queue_scopes ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

-- Strengthen record/request binding for both private-reference tables.
CREATE FUNCTION queue_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM queue_commands c WHERE c.household_id=NEW.household_id
   AND c.command_id=NEW.command_id AND c.request_id=NEW.request_id AND c.record_id=NEW.record_id) THEN
  RAISE EXCEPTION 'Invalid queue fact reference' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER queue_scope_reference BEFORE INSERT ON queue_scopes
 FOR EACH ROW EXECUTE FUNCTION queue_reference_guard();
CREATE TRIGGER queue_history_reference BEFORE INSERT ON queue_history
 FOR EACH ROW EXECUTE FUNCTION queue_reference_guard();
CREATE TRIGGER queue_scope_immutable BEFORE UPDATE ON queue_scopes
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE TRIGGER queue_history_immutable BEFORE UPDATE ON queue_history
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- A command must have exactly its corresponding history row at commit; no
-- intent-only outbox can masquerade as a state transition. Deletes are allowed.
CREATE FUNCTION queue_command_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM queue_commands WHERE household_id=NEW.household_id AND command_id=NEW.command_id)
 AND NOT EXISTS(SELECT 1 FROM queue_history WHERE household_id=NEW.household_id
   AND command_id=NEW.command_id AND request_id=NEW.request_id AND aggregate_version=NEW.aggregate_version) THEN
  RAISE EXCEPTION 'Missing queue committed history' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER queue_command_has_history AFTER INSERT ON queue_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION queue_command_history_guard();

CREATE TABLE queue_acknowledgements (
 household_id uuid NOT NULL,
 command_id uuid NOT NULL,
 record_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL,
 durability_ref text NOT NULL,
 acknowledged_at timestamptz NOT NULL CHECK(isfinite(acknowledged_at)),
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,record_id),
 CHECK(durability_ref='queue-fsync:'||record_id::text),
 FOREIGN KEY(household_id,command_id,record_id,primary_commit_id)
  REFERENCES queue_commands(household_id,command_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TRIGGER queue_ack_immutable BEFORE UPDATE ON queue_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Global operator state is deliberately outside the household deletion graph.
-- This singleton is a lock, not an intake policy or an acknowledged state.
-- Authentication locks precede this lock; fresh submission takes it consistently
-- before household/domain locks. Never acquire it late in a queue transaction.
CREATE TABLE queue_intake_lock (
 singleton boolean PRIMARY KEY CHECK(singleton)
);
INSERT INTO queue_intake_lock VALUES(true);
CREATE TABLE queue_operator_commands (
 command_id uuid PRIMARY KEY,
 actor_id uuid NOT NULL,
 original_session_hash text NOT NULL CHECK(original_session_hash ~ '^[0-9a-f]{64}$'),
 aggregate_version bigint NOT NULL UNIQUE CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
 paused boolean NOT NULL,
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)
  AND recorded_at >= timestamptz '0001-01-01 00:00:00+00'
  AND recorded_at < timestamptz '10000-01-01 00:00:00+00'
  AND recorded_at=date_trunc('milliseconds',recorded_at)),
 record_id uuid NOT NULL UNIQUE,
 primary_commit_id uuid NOT NULL UNIQUE,
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 namespace_verifier text NOT NULL CHECK(namespace_verifier ~ '^[0-9a-f]{64}$'),
 sealed_record jsonb NOT NULL,
 UNIQUE(command_id,record_id,primary_commit_id),
 CHECK(queue_valid_sealed(sealed_record,'operator',NULL,command_id,
  record_id,primary_commit_id,canonical_digest,namespace_verifier))
);
CREATE TRIGGER queue_operator_command_immutable BEFORE UPDATE ON queue_operator_commands
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE TABLE queue_operator_acknowledgements (
 command_id uuid PRIMARY KEY,
 record_id uuid NOT NULL UNIQUE,
 primary_commit_id uuid NOT NULL,
 durability_ref text NOT NULL,
 acknowledged_at timestamptz NOT NULL CHECK(isfinite(acknowledged_at)),
 CHECK(durability_ref='queue-fsync:'||record_id::text),
 FOREIGN KEY(command_id,record_id,primary_commit_id)
  REFERENCES queue_operator_commands(command_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TRIGGER queue_operator_ack_immutable BEFORE UPDATE ON queue_operator_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Append cursors must be consecutive; serialization is still a service duty.
CREATE FUNCTION queue_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous bigint;
BEGIN
 IF TG_TABLE_NAME='queue_operator_commands' THEN
  SELECT COALESCE(MAX(aggregate_version),0) INTO previous FROM queue_operator_commands;
 ELSE
  SELECT COALESCE(MAX(aggregate_version),0) INTO previous FROM queue_commands
   WHERE household_id=NEW.household_id AND request_id=NEW.request_id;
 END IF;
 IF NEW.aggregate_version<>previous+1 THEN
  RAISE EXCEPTION 'Invalid queue aggregate version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER queue_command_version BEFORE INSERT ON queue_commands
 FOR EACH ROW EXECUTE FUNCTION queue_version_guard();
CREATE TRIGGER queue_operator_version BEFORE INSERT ON queue_operator_commands
 FOR EACH ROW EXECUTE FUNCTION queue_version_guard();
