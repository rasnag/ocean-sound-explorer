-- CODEX-04-A local synthetic source/capture lineage; production remains unconfigured.
-- Exact UTF-16 code units are encoded in the private primary payload fields.
-- This avoids PostgreSQL text's NUL/unpaired-surrogate restrictions.
CREATE TABLE wonder_capture_commands (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL,
 adult_id uuid NOT NULL REFERENCES adult_accounts ON DELETE CASCADE,
 child_id uuid NOT NULL,
 consent_epoch bigint NOT NULL CHECK(consent_epoch BETWEEN 1 AND 9007199254740991),
 profile_version bigint NOT NULL CHECK(profile_version BETWEEN 1 AND 9007199254740991),
 operation text NOT NULL CHECK(operation IN ('create','correct')),
 request_id uuid NOT NULL,
 source_scope_version bigint NOT NULL CHECK(source_scope_version BETWEEN 1 AND 9007199254740991),
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 recovery_record jsonb NOT NULL CHECK(jsonb_typeof(recovery_record)='object'),
 result_ref text NOT NULL,
 acknowledged boolean NOT NULL DEFAULT false,
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,request_id,source_scope_version),
 UNIQUE(household_id,command_id,request_id,source_scope_version,consent_epoch),
 FOREIGN KEY(household_id,child_id) REFERENCES child_setup_profiles ON DELETE CASCADE,
 FOREIGN KEY(household_id,child_id,profile_version) REFERENCES child_profile_versions ON DELETE CASCADE,
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,child_id) REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,source_scope_version) REFERENCES request_source_scopes ON DELETE CASCADE,
 CHECK(recovery_record->>'household_id'=household_id::text),
 CHECK(recovery_record->>'command_id'=command_id::text),
 CHECK(recovery_record->>'canonical_digest'=canonical_digest),
 CHECK(result_ref='wonder-fsync:'||(recovery_record->>'record_id'))
);
CREATE TABLE wonder_source_payloads (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 request_id uuid NOT NULL,
 source_scope_version bigint NOT NULL CHECK(source_scope_version BETWEEN 1 AND 9007199254740991),
 capture_command_id uuid NOT NULL,
 consent_epoch bigint NOT NULL,
 payload_ref text NOT NULL,
 previous_source_scope_version bigint,
 question_utf16_base64 text NOT NULL,
 parent_context_utf16_base64 text,
 parent_context_source text NOT NULL CHECK(parent_context_source='parent'),
 PRIMARY KEY(household_id,request_id,source_scope_version),
 UNIQUE(household_id,capture_command_id),
 CHECK((source_scope_version=1 AND previous_source_scope_version IS NULL) OR
       (source_scope_version>1 AND previous_source_scope_version=source_scope_version-1)),
 CHECK(payload_ref='wonder-capture:'||capture_command_id::text),
 CHECK(length(question_utf16_base64) BETWEEN 4 AND 10668),
 CHECK(parent_context_utf16_base64 IS NULL OR length(parent_context_utf16_base64)<=5336),
 FOREIGN KEY(household_id,request_id,source_scope_version) REFERENCES request_source_scopes ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,previous_source_scope_version) REFERENCES wonder_source_payloads ON DELETE CASCADE,
 FOREIGN KEY(household_id,capture_command_id,request_id,source_scope_version,consent_epoch)
 REFERENCES wonder_capture_commands(household_id,command_id,request_id,source_scope_version,consent_epoch)
 ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER wonder_payload_immutable BEFORE UPDATE ON wonder_source_payloads
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE FUNCTION guard_wonder_capture_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.acknowledged THEN RAISE EXCEPTION 'Capture begins pending' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-'acknowledged') IS DISTINCT FROM (to_jsonb(OLD)-'acknowledged') OR OLD.acknowledged OR NOT NEW.acknowledged THEN
   RAISE EXCEPTION 'Immutable capture command' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wonder_capture_command_guard BEFORE INSERT OR UPDATE ON wonder_capture_commands
 FOR EACH ROW EXECUTE FUNCTION guard_wonder_capture_command();
CREATE FUNCTION check_wonder_capture_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM wonder_capture_commands c WHERE c.household_id=NEW.household_id AND c.command_id=NEW.command_id)
 AND NOT EXISTS(
  SELECT 1 FROM wonder_source_payloads p JOIN request_source_scopes s
   USING(household_id,request_id,source_scope_version)
  WHERE p.household_id=NEW.household_id AND p.capture_command_id=NEW.command_id
   AND p.request_id=NEW.request_id AND p.source_scope_version=NEW.source_scope_version
   AND p.consent_epoch=NEW.consent_epoch AND p.payload_ref=s.payload_ref
 ) THEN RAISE EXCEPTION 'Missing capture-owned source' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER wonder_capture_source_matches AFTER INSERT ON wonder_capture_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wonder_capture_source();
CREATE TABLE wonder_capture_throttle (
 household_id uuid PRIMARY KEY REFERENCES households ON DELETE CASCADE,
 window_started_ms bigint NOT NULL CHECK(window_started_ms BETWEEN 0 AND 8640000000000000),
 attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 30)
);
