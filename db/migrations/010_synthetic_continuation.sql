-- Proposed CODEX-03-C local synthetic continuation. Preserve migrations 001-009.
-- A committed period is NON-USABLE until its separate grant acknowledgement exists.
CREATE TABLE continuation_namespace (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 key_verifier text CHECK(key_verifier ~ '^[0-9a-f]{64}$')
);
INSERT INTO continuation_namespace VALUES(true,NULL);
CREATE FUNCTION guard_continuation_namespace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.key_verifier IS NOT NULL OR NEW.singleton IS DISTINCT FROM OLD.singleton OR NEW.key_verifier IS NULL THEN
  RAISE EXCEPTION 'Immutable continuation namespace' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER continuation_namespace_stable BEFORE UPDATE ON continuation_namespace
 FOR EACH ROW EXECUTE FUNCTION guard_continuation_namespace();

CREATE TABLE continuation_accounts (
 household_id uuid PRIMARY KEY REFERENCES households ON DELETE CASCADE,
 version bigint NOT NULL CHECK(version BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE continuation_commands (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES founder_identities(identity_id),
 original_session_hash text NOT NULL CHECK(original_session_hash ~ '^[0-9a-f]{64}$'),
 consent_epoch bigint NOT NULL CHECK(consent_epoch BETWEEN 1 AND 9007199254740991),
 policy_version text NOT NULL CHECK(policy_version='TEST-CONTINUATION-v1'),
 provenance_kind text NOT NULL CHECK(provenance_kind='invented-payment-record'),
 entitlement_id uuid NOT NULL,
 period_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL UNIQUE,
 record_id uuid NOT NULL UNIQUE,
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 receipt_hmac text NOT NULL UNIQUE CHECK(receipt_hmac ~ '^[0-9a-f]{64}$'),
 namespace_verifier text NOT NULL CHECK(namespace_verifier ~ '^[0-9a-f]{64}$'),
 aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 recovery_record jsonb NOT NULL CHECK(jsonb_typeof(recovery_record)='object'),
 result_ref text NOT NULL,
 acknowledged boolean NOT NULL DEFAULT false,
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,period_id),
 UNIQUE(household_id,entitlement_id),
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE,
 FOREIGN KEY(household_id,period_id) REFERENCES entitlement_periods ON DELETE CASCADE,
 FOREIGN KEY(household_id,entitlement_id) REFERENCES entitlements ON DELETE CASCADE,
 CHECK(result_ref='continuation-result:'||primary_commit_id::text),
 CHECK(recovery_record->>'household_id'=household_id::text),
 CHECK(recovery_record->>'command_id'=command_id::text),
 CHECK(recovery_record->>'record_id'=record_id::text),
 CHECK(recovery_record->>'primary_commit_id'=primary_commit_id::text),
 CHECK(recovery_record->>'canonical_digest'=canonical_digest),
 CHECK(recovery_record->>'namespace_verifier'=namespace_verifier)
);
CREATE TABLE continuation_grants (
 household_id uuid NOT NULL,
 command_id uuid NOT NULL,
 period_id uuid NOT NULL,
 entitlement_id uuid NOT NULL,
 consent_epoch bigint NOT NULL,
 policy_version text NOT NULL CHECK(policy_version='TEST-CONTINUATION-v1'),
 actor_id uuid NOT NULL REFERENCES founder_identities(identity_id),
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 primary_commit_id uuid NOT NULL,
 result_ref text NOT NULL,
 durability_ref text NOT NULL,
 acknowledged_at timestamptz NOT NULL CHECK(isfinite(acknowledged_at)),
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,period_id),
 FOREIGN KEY(household_id,command_id) REFERENCES continuation_commands ON DELETE CASCADE,
 FOREIGN KEY(household_id,period_id) REFERENCES entitlement_periods ON DELETE CASCADE,
 FOREIGN KEY(household_id,entitlement_id) REFERENCES entitlements ON DELETE CASCADE
);
CREATE FUNCTION guard_continuation_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.acknowledged THEN RAISE EXCEPTION 'Continuation begins pending' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-'acknowledged') IS DISTINCT FROM (to_jsonb(OLD)-'acknowledged') OR OLD.acknowledged OR NOT NEW.acknowledged THEN
   RAISE EXCEPTION 'Immutable continuation command' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER continuation_command_guard BEFORE INSERT OR UPDATE ON continuation_commands
 FOR EACH ROW EXECUTE FUNCTION guard_continuation_command();
CREATE TRIGGER continuation_grant_immutable BEFORE UPDATE ON continuation_grants
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE FUNCTION check_continuation_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c continuation_commands; p entitlement_periods; g continuation_grants;
BEGIN
 SELECT * INTO c FROM continuation_commands WHERE household_id=NEW.household_id AND command_id=NEW.command_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM entitlement_periods WHERE household_id=c.household_id AND period_id=c.period_id;
 IF NOT FOUND OR p.entitlement_id<>c.entitlement_id OR p.policy_version<>c.policy_version OR
  p.policy_json->>'provenance_kind'<>'invented-payment-record' OR p.policy_json->'synthetic'<>'true'::jsonb THEN
  RAISE EXCEPTION 'Invalid continuation period binding' USING ERRCODE='23514';
 END IF;
 SELECT * INTO g FROM continuation_grants WHERE household_id=c.household_id AND command_id=c.command_id;
 IF c.acknowledged IS DISTINCT FROM FOUND THEN
  RAISE EXCEPTION 'Missing continuation acknowledgement' USING ERRCODE='23514';
 END IF;
 IF FOUND AND ((g.period_id,g.entitlement_id,g.consent_epoch,g.policy_version,g.actor_id,g.canonical_digest,g.primary_commit_id,g.result_ref)
  IS DISTINCT FROM (c.period_id,c.entitlement_id,c.consent_epoch,c.policy_version,c.actor_id,c.canonical_digest,c.primary_commit_id,c.result_ref)
  OR g.durability_ref<>'continuation-fsync:'||c.record_id::text) THEN
  RAISE EXCEPTION 'Mismatched continuation acknowledgement' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER continuation_command_binding AFTER INSERT OR UPDATE ON continuation_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_continuation_binding();
CREATE CONSTRAINT TRIGGER continuation_grant_binding AFTER INSERT ON continuation_grants
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_continuation_binding();
-- The service checks the actual encrypted committed fact outside transactions.
-- These immutable markers attest that verification; they are not a new source grant.
