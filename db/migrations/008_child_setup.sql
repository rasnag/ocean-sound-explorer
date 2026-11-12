-- Invented local profiles only; real consent, retention and release stay gated.
CREATE FUNCTION valid_setup_profile(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_typeof(p)='object'
 AND (p-'nickname'-'age'-'calibration'-'starting_path'-'provenance'-'reason')='{}'::jsonb
 AND p ?& ARRAY['nickname','age','calibration','starting_path','provenance','reason']
 AND jsonb_typeof(p->'nickname')='string' AND (p->>'nickname') ~ '^[A-Za-z]([A-Za-z ''-]*[A-Za-z])?$' AND length(p->>'nickname') BETWEEN 1 AND 24
 AND jsonb_typeof(p->'age')='number' AND (p->>'age')::numeric BETWEEN 5 AND 8 AND trunc((p->>'age')::numeric)=(p->>'age')::numeric
 AND jsonb_typeof(p->'calibration')='object' AND ((p->'calibration')-'reads'-'counts_to_20'-'challenge')='{}'::jsonb
 AND (p->'calibration') ?& ARRAY['reads','counts_to_20','challenge']
 AND p->'calibration'->>'reads' IN ('independent','with-help','not-yet','not-sure')
 AND p->'calibration'->'counts_to_20' IN ('true'::jsonb,'false'::jsonb,'"not-sure"'::jsonb)
 AND p->'calibration'->>'challenge' IN ('gentle','some','bigger','not-sure')
 AND p->>'starting_path' IN ('slow','medium','fast')
 AND p->>'provenance'='parent-calibration-v1'
 AND p->>'reason'='Starting point chosen from parent test answers, not a score or assessment.'
$$;
CREATE TABLE child_setup_profiles (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 child_id uuid NOT NULL, consent_epoch bigint NOT NULL,
 created_by uuid NOT NULL REFERENCES adult_accounts ON DELETE CASCADE,
 is_initial boolean NOT NULL, current_version bigint NOT NULL CHECK(current_version BETWEEN 1 AND 9007199254740991),
 profile jsonb NOT NULL CHECK(valid_setup_profile(profile) IS TRUE),
 PRIMARY KEY(household_id,child_id),
 FOREIGN KEY(household_id,child_id) REFERENCES children ON DELETE CASCADE,
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE
);
CREATE UNIQUE INDEX child_setup_initial_slot ON child_setup_profiles(household_id) WHERE is_initial;
CREATE TABLE child_profile_versions (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 child_id uuid NOT NULL, profile_version bigint NOT NULL CHECK(profile_version BETWEEN 1 AND 9007199254740991),
 consent_epoch bigint NOT NULL, changed_by uuid NOT NULL REFERENCES adult_accounts ON DELETE CASCADE,
 profile jsonb NOT NULL CHECK(valid_setup_profile(profile) IS TRUE),
 PRIMARY KEY(household_id,child_id,profile_version),
 FOREIGN KEY(household_id,child_id) REFERENCES child_setup_profiles ON DELETE CASCADE,
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE
);
CREATE TABLE child_setup_commands (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL, child_id uuid NOT NULL, adult_id uuid NOT NULL REFERENCES adult_accounts ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('create','correct')),
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,child_id) REFERENCES child_setup_profiles ON DELETE CASCADE
);
CREATE TABLE child_setup_throttle (
 household_id uuid PRIMARY KEY REFERENCES households ON DELETE CASCADE,
 window_started_ms bigint NOT NULL CHECK(window_started_ms BETWEEN 0 AND 8640000000000000),
 attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 30)
);
CREATE FUNCTION guard_child_setup_history() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Immutable synthetic profile history' USING ERRCODE='55000'; END $$;
CREATE TRIGGER child_profile_history_immutable BEFORE UPDATE ON child_profile_versions FOR EACH ROW EXECUTE FUNCTION guard_child_setup_history();
CREATE TRIGGER child_setup_receipt_immutable BEFORE UPDATE ON child_setup_commands FOR EACH ROW EXECUTE FUNCTION guard_child_setup_history();
CREATE FUNCTION guard_child_setup_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF NEW.household_id<>OLD.household_id OR NEW.child_id<>OLD.child_id OR NEW.is_initial<>OLD.is_initial OR NEW.created_by<>OLD.created_by OR NEW.consent_epoch<>OLD.consent_epoch OR NEW.current_version<>OLD.current_version+1 THEN
 RAISE EXCEPTION 'Invalid synthetic profile transition' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER child_setup_identity_stable BEFORE UPDATE ON child_setup_profiles FOR EACH ROW EXECUTE FUNCTION guard_child_setup_identity();
-- Check at commit, after the service appends the matching immutable version.
CREATE FUNCTION check_child_setup_version() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF EXISTS(SELECT 1 FROM child_setup_profiles p WHERE p.household_id=NEW.household_id AND p.child_id=NEW.child_id)
 AND NOT EXISTS(SELECT 1 FROM child_profile_versions v WHERE v.household_id=NEW.household_id AND v.child_id=NEW.child_id AND v.profile_version=NEW.current_version AND v.consent_epoch=NEW.consent_epoch AND v.profile=NEW.profile) THEN
 RAISE EXCEPTION 'Missing matching synthetic profile version' USING ERRCODE='23514'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER child_setup_version_matches AFTER INSERT OR UPDATE ON child_setup_profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_child_setup_version();
