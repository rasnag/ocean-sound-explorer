-- COST-LOCAL-01 STAGE1: additive local synthetic storage only.
-- Architecture v1.2 / ADR-E03,E04,E06, SHA256
-- 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
-- Intents reserve versions; only independently durable ACKs may materialize facts.
-- Current consent/source fencing and primary/journal equality remain service duties.
-- No changes to accepted helpers, generation, review or other source tables.

CREATE TABLE cost_slice_namespace (
 singleton boolean PRIMARY KEY CHECK(singleton),
 namespace_verifier text UNIQUE CHECK(namespace_verifier ~ '^[0-9a-f]{64}$')
);
INSERT INTO cost_slice_namespace VALUES(true,NULL);
CREATE TRIGGER cost_slice_namespace_stable BEFORE UPDATE ON cost_slice_namespace
 FOR EACH ROW EXECUTE FUNCTION queue_namespace_guard();

CREATE TABLE cost_slice_commands (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL,
 request_id uuid NOT NULL,
 scope_version bigint NOT NULL CHECK(scope_version BETWEEN 1 AND 9007199254740990),
 child_id uuid NOT NULL,
 profile_version bigint NOT NULL CHECK(profile_version BETWEEN 1 AND 9007199254740990),
 actor_id uuid NOT NULL,
 consent_epoch bigint NOT NULL CHECK(consent_epoch BETWEEN 1 AND 9007199254740990),
 original_session_hash text NOT NULL CHECK(original_session_hash ~ '^[0-9a-f]{64}$'),
 aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740990),
 action text NOT NULL CHECK(action IN('CaptureAttempt','OpenComparison','RecordAttemptUsage','RecordScenarioCash','RecordStageTime')),
 record_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL,
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 namespace_verifier text NOT NULL REFERENCES cost_slice_namespace(namespace_verifier),
 recorded_at timestamptz NOT NULL,
 sealed_fact jsonb NOT NULL,
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,request_id,aggregate_version),
 UNIQUE(household_id,request_id,command_id),
 UNIQUE(household_id,command_id,record_id,primary_commit_id),
 UNIQUE(household_id,record_id,primary_commit_id),
 FOREIGN KEY(household_id,request_id,child_id)
  REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,child_id,profile_version)
  REFERENCES child_profile_versions(household_id,child_id,profile_version) ON DELETE CASCADE,
 CHECK(queue_valid_sealed(sealed_fact,'household',household_id,command_id,
  record_id,primary_commit_id,canonical_digest,namespace_verifier))
);
CREATE TRIGGER cost_slice_command_immutable BEFORE UPDATE ON cost_slice_commands
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE cost_slice_acknowledgements (
 household_id uuid NOT NULL,
 command_id uuid NOT NULL,
 record_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL,
 acknowledged_at timestamptz NOT NULL,
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,command_id,record_id,primary_commit_id)
  REFERENCES cost_slice_commands(household_id,command_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TRIGGER cost_slice_ack_immutable BEFORE UPDATE ON cost_slice_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE cost_slice_absences (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES founder_identities(identity_id),
 recorded_at timestamptz NOT NULL,
 resolution text NOT NULL CHECK(resolution IN('absent','fenced')),
 original_version bigint,
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,request_id)
  REFERENCES wonder_requests(household_id,request_id) ON DELETE CASCADE,
 CHECK((resolution='absent' AND original_version IS NULL) OR
       (resolution='fenced' AND original_version IS NOT NULL AND original_version BETWEEN 1 AND 9007199254740990))
);
CREATE TRIGGER cost_slice_absence_immutable BEFORE UPDATE ON cost_slice_absences
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Request locks serialize key retirement, insertion and ACK even for direct SQL.
-- They do not change source rows. The service takes its household/consent locks first.
CREATE FUNCTION cost_slice_key_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c cost_slice_commands%ROWTYPE; r uuid;
BEGIN
 IF TG_TABLE_NAME='cost_slice_acknowledgements' THEN
  SELECT * INTO c FROM cost_slice_commands
   WHERE household_id=NEW.household_id AND command_id=NEW.command_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cost command missing'; END IF;
  r:=c.request_id;
 ELSE
  r:=NEW.request_id;
 END IF;
 PERFORM 1 FROM wonder_requests
  WHERE household_id=NEW.household_id AND request_id=r FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cost request missing'; END IF;
 IF TG_TABLE_NAME='cost_slice_absences' THEN
  SELECT * INTO c FROM cost_slice_commands
   WHERE household_id=NEW.household_id AND command_id=NEW.command_id;
  IF NEW.resolution='absent' THEN
   IF FOUND THEN RAISE EXCEPTION 'cost intent exists'; END IF;
  ELSE
   IF NOT FOUND OR c.request_id<>NEW.request_id OR c.actor_id<>NEW.actor_id
      OR c.aggregate_version<>NEW.original_version THEN
    RAISE EXCEPTION 'cost fenced identity mismatch';
   END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM cost_slice_acknowledgements
    WHERE household_id=NEW.household_id AND command_id=NEW.command_id) THEN
   RAISE EXCEPTION 'cost acknowledged key cannot retire';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM cost_slice_absences
    WHERE household_id=NEW.household_id AND command_id=NEW.command_id) THEN
   RAISE EXCEPTION 'cost key retired';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_slice_command_key BEFORE INSERT ON cost_slice_commands
 FOR EACH ROW EXECUTE FUNCTION cost_slice_key_guard();
CREATE TRIGGER cost_slice_absence_key BEFORE INSERT ON cost_slice_absences
 FOR EACH ROW EXECUTE FUNCTION cost_slice_key_guard();
CREATE TRIGGER cost_slice_ack_key BEFORE INSERT ON cost_slice_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION cost_slice_key_guard();

CREATE TABLE cost_slice_attempts (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 attempt_id uuid NOT NULL,
 command_id uuid NOT NULL,
 PRIMARY KEY(household_id,request_id,attempt_id),
 UNIQUE(household_id,command_id),
 FOREIGN KEY(household_id,request_id,command_id)
  REFERENCES cost_slice_commands(household_id,request_id,command_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,command_id)
  REFERENCES cost_slice_acknowledgements(household_id,command_id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER cost_slice_attempt_immutable BEFORE UPDATE ON cost_slice_attempts
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE cost_slice_comparisons (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 command_id uuid NOT NULL,
 PRIMARY KEY(household_id,request_id),
 UNIQUE(household_id,command_id),
 FOREIGN KEY(household_id,request_id,command_id)
  REFERENCES cost_slice_commands(household_id,request_id,command_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,command_id)
  REFERENCES cost_slice_acknowledgements(household_id,command_id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER cost_slice_comparison_immutable BEFORE UPDATE ON cost_slice_comparisons
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE cost_slice_entries (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 entry_id uuid NOT NULL,
 command_id uuid NOT NULL,
 source_identity text NOT NULL CHECK(length(source_identity) BETWEEN 1 AND 128),
 kind text NOT NULL CHECK(kind IN('usage','cash','time')),
 owner text NOT NULL CHECK(owner IN('direct','G1','G2','G3','I1')),
 supersedes_entry_id uuid,
 PRIMARY KEY(household_id,entry_id),
 UNIQUE(household_id,command_id),
 UNIQUE(household_id,supersedes_entry_id),
 UNIQUE(household_id,request_id,entry_id,source_identity,kind,owner),
 FOREIGN KEY(household_id,request_id,command_id)
  REFERENCES cost_slice_commands(household_id,request_id,command_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,command_id)
  REFERENCES cost_slice_acknowledgements(household_id,command_id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(household_id,request_id,supersedes_entry_id,source_identity,kind,owner)
  REFERENCES cost_slice_entries(household_id,request_id,entry_id,source_identity,kind,owner),
 CHECK(supersedes_entry_id IS NULL OR supersedes_entry_id<>entry_id),
 CHECK(
  (kind='usage' AND owner='direct' AND source_identity ~ '^usage/[0-9a-f-]{36}$') OR
  (kind='cash' AND ((owner='G1' AND source_identity IN('comparison-v1/cash/C1','comparison-v1/cash/C2')) OR
   (owner='G2' AND source_identity='comparison-v1/cash/C3') OR
   (owner='G3' AND source_identity='comparison-v1/cash/C4') OR
   (owner='I1' AND source_identity='comparison-v1/cash/C5'))) OR
  (kind='time' AND source_identity ~ ('^time/'||owner||'/(intake|generation_supervision|adaptation|grounding|assets|safety_review|playtest_fast|playtest_medium|playtest_slow|correction|support|incident|rules_design|player_engineering|outcome_modelling|pattern_testing|stabilization)/[1-4]$'))
 )
);
CREATE UNIQUE INDEX cost_slice_entry_root ON cost_slice_entries(household_id,request_id,source_identity)
 WHERE supersedes_entry_id IS NULL;
CREATE TRIGGER cost_slice_entry_immutable BEFORE UPDATE ON cost_slice_entries
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE FUNCTION cost_slice_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c cost_slice_commands%ROWTYPE; p cost_slice_commands%ROWTYPE;
BEGIN
 SELECT * INTO c FROM cost_slice_commands
  WHERE household_id=NEW.household_id AND command_id=NEW.command_id FOR UPDATE;
 IF NOT FOUND OR c.request_id<>NEW.request_id THEN RAISE EXCEPTION 'cost entry command mismatch'; END IF;
 IF (NEW.kind='usage' AND c.action NOT IN('CaptureAttempt','RecordAttemptUsage')) OR
    (NEW.kind='cash' AND c.action<>'RecordScenarioCash') OR
    (NEW.kind='time' AND c.action<>'RecordStageTime') THEN
  RAISE EXCEPTION 'cost entry action mismatch';
 END IF;
 IF c.action='CaptureAttempt' AND (NEW.entry_id<>NEW.command_id OR NEW.supersedes_entry_id IS NOT NULL) THEN
  RAISE EXCEPTION 'cost capture base mismatch';
 END IF;
 IF c.action='RecordAttemptUsage' AND NEW.supersedes_entry_id IS NULL THEN
  RAISE EXCEPTION 'cost usage requires captured predecessor';
 END IF;
 IF NEW.supersedes_entry_id IS NOT NULL THEN
  SELECT cmd.* INTO p FROM cost_slice_entries e
   JOIN cost_slice_commands cmd ON cmd.household_id=e.household_id AND cmd.command_id=e.command_id
   JOIN cost_slice_acknowledgements a ON a.household_id=e.household_id AND a.command_id=e.command_id
   WHERE e.household_id=NEW.household_id AND e.entry_id=NEW.supersedes_entry_id FOR UPDATE OF e;
  IF NOT FOUND OR p.request_id<>NEW.request_id OR p.aggregate_version>=c.aggregate_version THEN
   RAISE EXCEPTION 'cost predecessor must be earlier acknowledged history';
  END IF;
  IF EXISTS(SELECT 1 FROM cost_slice_entries WHERE household_id=NEW.household_id
    AND supersedes_entry_id=NEW.supersedes_entry_id) THEN RAISE EXCEPTION 'cost predecessor is not current'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_slice_entry_insert BEFORE INSERT ON cost_slice_entries
 FOR EACH ROW EXECUTE FUNCTION cost_slice_entry_guard();

-- Deferred checks permit effects followed by ACK in the same transaction, but
-- reject committed effects without ACK and ACKs without their exact fact shape.
CREATE FUNCTION cost_slice_effect_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c cost_slice_commands%ROWTYPE; ne bigint; na bigint; nc bigint;
BEGIN
 SELECT * INTO c FROM cost_slice_commands WHERE household_id=NEW.household_id AND command_id=NEW.command_id;
 IF NOT FOUND THEN RETURN NEW; END IF; -- privacy cascade removed the aggregate
 IF EXISTS(SELECT 1 FROM cost_slice_absences WHERE household_id=c.household_id AND command_id=c.command_id) THEN
  RAISE EXCEPTION 'cost retired command has effects';
 END IF;
 SELECT count(*) INTO ne FROM cost_slice_entries WHERE household_id=c.household_id AND command_id=c.command_id;
 SELECT count(*) INTO na FROM cost_slice_attempts WHERE household_id=c.household_id AND command_id=c.command_id;
 SELECT count(*) INTO nc FROM cost_slice_comparisons WHERE household_id=c.household_id AND command_id=c.command_id;
 IF (c.action='CaptureAttempt' AND (ne<>1 OR na<>1 OR nc<>0)) OR
    (c.action='OpenComparison' AND (ne<>0 OR na<>0 OR nc<>1)) OR
    (c.action IN('RecordAttemptUsage','RecordScenarioCash','RecordStageTime') AND (ne<>1 OR na<>0 OR nc<>0)) THEN
  RAISE EXCEPTION 'cost materialization mismatch';
 END IF;
 IF EXISTS(SELECT 1 FROM cost_slice_entries e WHERE e.household_id=c.household_id AND e.command_id=c.command_id
  AND e.kind='usage' AND NOT EXISTS(SELECT 1 FROM cost_slice_attempts t
   WHERE t.household_id=e.household_id AND t.request_id=e.request_id
    AND e.source_identity='usage/'||t.attempt_id::text)) THEN
  RAISE EXCEPTION 'cost usage has no captured attempt';
 END IF;
 IF EXISTS(SELECT 1 FROM cost_slice_entries e WHERE e.household_id=c.household_id AND e.command_id=c.command_id
  AND e.owner<>'direct' AND NOT EXISTS(SELECT 1 FROM cost_slice_comparisons x
   JOIN cost_slice_commands cmd ON cmd.household_id=x.household_id AND cmd.command_id=x.command_id
   JOIN cost_slice_acknowledgements a ON a.household_id=x.household_id AND a.command_id=x.command_id
   WHERE x.household_id=e.household_id AND x.request_id=e.request_id AND cmd.aggregate_version<c.aggregate_version)) THEN
  RAISE EXCEPTION 'cost comparison unavailable';
 END IF;
 IF c.action='CaptureAttempt' AND NOT EXISTS(SELECT 1 FROM cost_slice_attempts t
  JOIN cost_slice_entries e ON e.household_id=t.household_id AND e.command_id=t.command_id
  WHERE t.household_id=c.household_id AND t.command_id=c.command_id
   AND e.source_identity='usage/'||t.attempt_id::text) THEN
  RAISE EXCEPTION 'cost capture identity mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER cost_slice_ack_effect AFTER INSERT ON cost_slice_acknowledgements
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cost_slice_effect_guard();
CREATE CONSTRAINT TRIGGER cost_slice_attempt_effect AFTER INSERT ON cost_slice_attempts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cost_slice_effect_guard();
CREATE CONSTRAINT TRIGGER cost_slice_comparison_effect AFTER INSERT ON cost_slice_comparisons
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cost_slice_effect_guard();
CREATE CONSTRAINT TRIGGER cost_slice_entry_effect AFTER INSERT ON cost_slice_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cost_slice_effect_guard();
