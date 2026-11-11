-- CODEX-07-A, synthetic-only primary/journal handoff. Preserve migrations001-004.
CREATE TABLE play_service_metadata (
  household_id uuid NOT NULL,
  play_id uuid NOT NULL,
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding)='object'),
  PRIMARY KEY (household_id,play_id),
  FOREIGN KEY (household_id,play_id) REFERENCES play_sessions ON DELETE CASCADE
);
CREATE TRIGGER play_metadata_immutable BEFORE UPDATE ON play_service_metadata
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE play_start_commands (
  household_id uuid NOT NULL,
  play_id uuid NOT NULL,
  command_id uuid NOT NULL,
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[0-9a-f]{64}$'),
  command jsonb NOT NULL CHECK (jsonb_typeof(command)='object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  journal_record jsonb NOT NULL CHECK (jsonb_typeof(journal_record)='object'),
  ack_state text NOT NULL DEFAULT 'pending' CHECK (ack_state IN ('pending','acknowledged')),
  PRIMARY KEY (household_id,command_id),
  UNIQUE (household_id,play_id),
  FOREIGN KEY (household_id,play_id) REFERENCES play_service_metadata ON DELETE CASCADE
);
CREATE TABLE play_action_commands (
  household_id uuid NOT NULL,
  play_id uuid NOT NULL,
  action_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[0-9a-f]{64}$'),
  command jsonb NOT NULL CHECK (jsonb_typeof(command)='object'),
  server_at text NOT NULL CHECK (server_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  journal_record jsonb NOT NULL CHECK (jsonb_typeof(journal_record)='object'),
  ack_state text NOT NULL DEFAULT 'pending' CHECK (ack_state IN ('pending','acknowledged')),
  PRIMARY KEY (household_id,play_id,action_id),
  UNIQUE (household_id,play_id,sequence),
  FOREIGN KEY (household_id,play_id) REFERENCES play_service_metadata ON DELETE CASCADE,
  FOREIGN KEY (household_id,play_id,action_id)
    REFERENCES play_events(household_id,play_id,action_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE play_checkpoints (
  household_id uuid NOT NULL,
  play_id uuid NOT NULL,
  checkpoint jsonb NOT NULL CHECK (jsonb_typeof(checkpoint)='object'),
  PRIMARY KEY (household_id,play_id),
  FOREIGN KEY (household_id,play_id) REFERENCES play_service_metadata ON DELETE CASCADE
);
CREATE FUNCTION loop_play_command_ack_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'ack_state') IS DISTINCT FROM (to_jsonb(OLD)-'ack_state') OR
     NOT (OLD.ack_state='pending' AND NEW.ack_state='acknowledged') THEN
    RAISE EXCEPTION 'Immutable play command' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER play_start_ack_guard BEFORE UPDATE ON play_start_commands
  FOR EACH ROW EXECUTE FUNCTION loop_play_command_ack_guard();
CREATE TRIGGER play_action_ack_guard BEFORE UPDATE ON play_action_commands
  FOR EACH ROW EXECUTE FUNCTION loop_play_command_ack_guard();
CREATE TRIGGER play_event_append_only BEFORE UPDATE ON play_events
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Candidates deliberately include progress_saved only as PENDING DURABILITY.
-- Future projections MUST join their owning command's acknowledged marker.
-- There is no automatic production publication, restore, revocation or deletion ledger here.
