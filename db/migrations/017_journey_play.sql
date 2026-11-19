-- PLAYABLE-JOURNEY-LOCAL-01 / BUILD1. Local TEST data only.
-- Engineering 1.2 SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
-- The owning Start transaction inserts this binding, never an introduction/read.
CREATE TABLE journey_play_bindings (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 assignment_id uuid NOT NULL, child_id uuid NOT NULL, revision_id uuid NOT NULL,
 consent_epoch bigint NOT NULL, profile_version bigint NOT NULL,
 play_id uuid NOT NULL, start_command_id uuid NOT NULL,
 started_at timestamptz NOT NULL CHECK(isfinite(started_at)),
 PRIMARY KEY(household_id,assignment_id),
 UNIQUE(household_id,play_id), UNIQUE(household_id,start_command_id),
 FOREIGN KEY(household_id,assignment_id,child_id,revision_id)
  REFERENCES assignments(household_id,assignment_id,child_id,revision_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE,
 FOREIGN KEY(household_id,child_id,profile_version) REFERENCES child_profile_versions ON DELETE CASCADE,
 FOREIGN KEY(household_id,play_id) REFERENCES play_sessions ON DELETE CASCADE,
 FOREIGN KEY(household_id,start_command_id) REFERENCES play_start_commands(household_id,command_id)
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER journey_play_binding_immutable BEFORE UPDATE ON journey_play_bindings
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
-- Preserve once-only identity during ordinary play deletion, but allow household erasure.
CREATE TRIGGER journey_play_binding_no_direct_delete BEFORE DELETE ON journey_play_bindings
 FOR EACH ROW EXECUTE FUNCTION private_bridge_delete_guard();
CREATE FUNCTION journey_initial_play_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h uuid;
BEGIN
 h:=COALESCE(NEW.household_id,OLD.household_id);
 IF NOT EXISTS(SELECT 1 FROM households WHERE household_id=h) THEN RETURN NULL; END IF;
 IF EXISTS(
  SELECT 1 FROM journey_play_bindings b
  LEFT JOIN play_sessions p USING(household_id,play_id)
  LEFT JOIN play_start_commands s ON s.household_id=b.household_id AND s.command_id=b.start_command_id
  LEFT JOIN play_service_metadata m ON m.household_id=b.household_id AND m.play_id=b.play_id
  LEFT JOIN play_checkpoints k ON k.household_id=b.household_id AND k.play_id=b.play_id
  LEFT JOIN child_profile_versions v ON v.household_id=b.household_id AND v.child_id=b.child_id AND v.profile_version=b.profile_version
  WHERE b.household_id=h AND (
   p.play_id IS NULL OR s.play_id IS DISTINCT FROM b.play_id OR m.play_id IS NULL OR k.play_id IS NULL
   OR (p.assignment_id,p.child_id,p.revision_id) IS DISTINCT FROM (b.assignment_id,b.child_id,b.revision_id)
   OR v.consent_epoch IS DISTINCT FROM b.consent_epoch
   OR s.command->>'play_id' IS DISTINCT FROM b.play_id::text
   OR s.command->>'command_id' IS DISTINCT FROM b.start_command_id::text
   OR s.command->>'revision_id' IS DISTINCT FROM b.revision_id::text
   OR s.command->>'consent_epoch' IS DISTINCT FROM b.consent_epoch::text
   OR m.binding->>'assignment_id' IS DISTINCT FROM b.assignment_id::text
   OR m.binding->>'child_id' IS DISTINCT FROM b.child_id::text
   OR m.binding->>'revision_id' IS DISTINCT FROM b.revision_id::text
   OR m.binding->>'consent_epoch' IS DISTINCT FROM b.consent_epoch::text
  )
 ) OR EXISTS(
  SELECT 1 FROM play_sessions p JOIN assignments a USING(household_id,assignment_id)
  JOIN adventure_revisions r ON r.household_id=p.household_id AND r.revision_id=p.revision_id
  WHERE p.household_id=h AND (
   r.payload_ref LIKE 'private-bridge:%'
   OR EXISTS(SELECT 1 FROM private_bridge_bindings b WHERE b.household_id=h AND b.assignment_id=p.assignment_id)
   OR EXISTS(SELECT 1 FROM private_bridge_commands c WHERE c.household_id=h AND c.request_id=a.request_id)
  ) AND NOT EXISTS(SELECT 1 FROM journey_play_bindings b WHERE b.household_id=h AND b.play_id=p.play_id AND b.assignment_id=p.assignment_id)
 ) THEN RAISE EXCEPTION 'Incomplete initial TEST play binding' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['journey_play_bindings','play_sessions','play_start_commands','play_service_metadata','play_checkpoints'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journey_initial_play_guard()',tab||'_journey_complete',tab);
 END LOOP;
END $$;
