-- PRIVATE-READINESS-LOCAL-01. Additive TEST-only readiness.
-- Engineering v1.2: 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
CREATE TABLE private_bridge_namespace (
 singleton boolean PRIMARY KEY CHECK(singleton),
 namespace_verifier text CHECK(namespace_verifier ~ '^[0-9a-f]{64}$')
);
INSERT INTO private_bridge_namespace VALUES(true,NULL);
CREATE TRIGGER private_bridge_namespace_stable BEFORE UPDATE ON private_bridge_namespace FOR EACH ROW EXECUTE FUNCTION queue_namespace_guard();
CREATE TABLE private_bridge_commands (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL, request_id uuid NOT NULL, child_id uuid NOT NULL,
 scope_version bigint NOT NULL CHECK(scope_version BETWEEN 1 AND 9007199254740990),
 profile_version bigint NOT NULL CHECK(profile_version BETWEEN 1 AND 9007199254740990),
 consent_epoch bigint NOT NULL CHECK(consent_epoch BETWEEN 1 AND 9007199254740990),
 actor_id uuid NOT NULL, original_session_hash text NOT NULL CHECK(original_session_hash ~ '^[0-9a-f]{64}$'),
 version integer NOT NULL CHECK(version=1), recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 record_id uuid NOT NULL UNIQUE, primary_commit_id uuid NOT NULL UNIQUE,
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 namespace_verifier text NOT NULL CHECK(namespace_verifier ~ '^[0-9a-f]{64}$'), sealed_fact jsonb NOT NULL,
 PRIMARY KEY(household_id,command_id), UNIQUE(household_id,request_id),
 UNIQUE(household_id,command_id,request_id), UNIQUE(household_id,command_id,record_id,primary_commit_id),
 FOREIGN KEY(household_id,request_id,child_id) REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,child_id,profile_version) REFERENCES child_profile_versions ON DELETE CASCADE,
 FOREIGN KEY(household_id,consent_epoch) REFERENCES service_consents ON DELETE CASCADE,
 CHECK(queue_valid_sealed(sealed_fact,'household',household_id,command_id,record_id,primary_commit_id,canonical_digest,namespace_verifier))
);
CREATE TABLE private_bridge_bindings (
 household_id uuid NOT NULL, command_id uuid NOT NULL, request_id uuid NOT NULL, child_id uuid NOT NULL,
 source_scope_version bigint NOT NULL, queue_scope_version bigint NOT NULL,
 snapshot_id uuid NOT NULL, revision_id uuid NOT NULL, assignment_id uuid NOT NULL,
 receipt_id uuid NOT NULL, booking_id uuid NOT NULL, claim_id uuid NOT NULL, period_id uuid NOT NULL,
 transition_id text NOT NULL,
 PRIMARY KEY(household_id,command_id), UNIQUE(household_id,request_id), UNIQUE(household_id,assignment_id),
 FOREIGN KEY(household_id,command_id,request_id) REFERENCES private_bridge_commands(household_id,command_id,request_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,child_id) REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,source_scope_version) REFERENCES request_source_scopes ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,queue_scope_version) REFERENCES queue_scopes ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,snapshot_id) REFERENCES review_slice_snapshots(household_id,request_id,snapshot_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,receipt_id,request_id) REFERENCES production_receipts(household_id,receipt_id,request_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,booking_id) REFERENCES production_capacity_bookings(household_id,request_id,booking_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,assignment_id,child_id,revision_id) REFERENCES assignments(household_id,assignment_id,child_id,revision_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,transition_id) REFERENCES entitlement_transitions ON DELETE CASCADE,
 CHECK(transition_id=command_id::text)
);
CREATE TABLE private_bridge_ready_events (
 household_id uuid NOT NULL, command_id uuid NOT NULL, request_id uuid NOT NULL,
 event_id uuid NOT NULL UNIQUE, capacity_event_id uuid NOT NULL UNIQUE,
 assignment_id uuid NOT NULL, revision_id uuid NOT NULL, transition_id text NOT NULL,
 bucket_id uuid NOT NULL REFERENCES production_capacity_buckets,
 booking_id uuid NOT NULL, before_state text NOT NULL CHECK(before_state='booked'),
 after_state text NOT NULL CHECK(after_state='completed'), ready_at timestamptz NOT NULL CHECK(isfinite(ready_at)),
 PRIMARY KEY(household_id,command_id), UNIQUE(household_id,request_id),
 FOREIGN KEY(household_id,command_id,request_id) REFERENCES private_bridge_commands(household_id,command_id,request_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,assignment_id) REFERENCES assignments ON DELETE CASCADE,
 FOREIGN KEY(household_id,revision_id) REFERENCES published_revisions ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,booking_id) REFERENCES production_capacity_bookings(household_id,request_id,booking_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,transition_id) REFERENCES entitlement_transitions ON DELETE CASCADE
);
CREATE TABLE private_bridge_delivery_work (
 household_id uuid NOT NULL, command_id uuid NOT NULL, assignment_id uuid NOT NULL,
 synthetic_only boolean NOT NULL CHECK(synthetic_only), state text NOT NULL CHECK(state='not_attempted'),
 PRIMARY KEY(household_id,command_id), UNIQUE(household_id,assignment_id),
 FOREIGN KEY(household_id,command_id) REFERENCES private_bridge_commands ON DELETE CASCADE,
 FOREIGN KEY(household_id,assignment_id) REFERENCES assignments ON DELETE CASCADE
);
CREATE TABLE private_bridge_acks (
 household_id uuid NOT NULL, command_id uuid NOT NULL, record_id uuid NOT NULL, primary_commit_id uuid NOT NULL,
 durability_ref text NOT NULL CHECK(durability_ref='queue-fsync:'||record_id::text),
 acknowledged_at timestamptz NOT NULL CHECK(isfinite(acknowledged_at)),
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,command_id,record_id,primary_commit_id) REFERENCES private_bridge_commands(household_id,command_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TABLE private_bridge_absences (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE, request_id uuid NOT NULL, command_id uuid NOT NULL,
 actor_id uuid NOT NULL, recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,request_id) REFERENCES wonder_requests ON DELETE CASCADE
);
-- Pure relational completeness. Independent storage authentication belongs to the service.
CREATE FUNCTION private_bridge_complete(h uuid,k uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
 SELECT 1 FROM private_bridge_commands c
 JOIN private_bridge_bindings b USING(household_id,command_id,request_id)
 JOIN private_bridge_ready_events e USING(household_id,command_id,request_id)
 JOIN private_bridge_delivery_work d USING(household_id,command_id)
 JOIN wonder_requests w ON w.household_id=c.household_id AND w.request_id=c.request_id AND w.child_id=c.child_id
 JOIN child_profile_versions v ON v.household_id=c.household_id AND v.child_id=c.child_id AND v.profile_version=c.profile_version AND v.consent_epoch=c.consent_epoch
 JOIN production_commands p ON p.household_id=c.household_id AND p.request_id=c.request_id AND p.child_id=c.child_id AND p.consent_epoch=c.consent_epoch AND p.wonder_version=b.source_scope_version
 JOIN production_acknowledgements pa ON pa.household_id=p.household_id AND pa.command_id=p.command_id AND pa.record_id=p.record_id AND pa.primary_commit_id=p.primary_commit_id AND pa.durability_ref='production-fsync:'||p.record_id::text
 JOIN production_receipts r ON r.household_id=b.household_id AND r.receipt_id=b.receipt_id AND r.request_id=b.request_id AND r.booking_id=b.booking_id AND r.claim_id=b.claim_id AND r.period_id=b.period_id AND r.original_received_at=w.original_received_at
 JOIN production_capacity_bookings m ON m.household_id=b.household_id AND m.request_id=b.request_id AND m.booking_id=b.booking_id AND m.bucket_id=e.bucket_id
 JOIN capacity_reservations cap ON cap.household_id=b.household_id AND cap.reservation_id=b.booking_id AND cap.request_id=b.request_id AND cap.source_scope_version=b.source_scope_version AND cap.state='completed'
 JOIN entitlement_claims cl ON cl.household_id=b.household_id AND cl.request_id=b.request_id AND cl.period_id=b.period_id AND cl.state='consumed'
 JOIN entitlement_transitions t ON t.household_id=b.household_id AND t.transition_id=b.transition_id AND t.request_id=b.request_id AND t.period_id=b.period_id AND t.kind='consume' AND t."from"='reserved' AND t."to"='consumed' AND t.cause='MakeAssignmentReady' AND t.cause_id=c.command_id::text AND t.expected_version+1=cl.version AND t.consent_epoch=c.consent_epoch AND t.binding=jsonb_build_object('assignment_id',b.assignment_id)
 JOIN assignments a ON a.household_id=b.household_id AND a.assignment_id=b.assignment_id AND a.request_id=b.request_id AND a.child_id=b.child_id AND a.revision_id=b.revision_id
 JOIN adventure_revisions ar ON ar.household_id=b.household_id AND ar.revision_id=b.revision_id AND ar.request_id=b.request_id AND ar.source_scope_version=b.source_scope_version AND ar.status='published' AND ar.pattern_version='fixture-1' AND ar.engine_version='fixture-engine-1' AND ar.payload_ref='private-bridge:'||c.record_id::text
 JOIN published_revisions pr ON pr.household_id=ar.household_id AND pr.revision_id=ar.revision_id
 JOIN review_slice_snapshots s ON s.household_id=b.household_id AND s.request_id=b.request_id AND s.snapshot_id=b.snapshot_id AND s.revision_id=b.revision_id
 JOIN review_slice_acknowledgements sa ON sa.household_id=s.household_id AND sa.command_id=s.command_id
 WHERE c.household_id=h AND c.command_id=k AND b.child_id=c.child_id AND b.queue_scope_version=c.scope_version
 AND e.assignment_id=b.assignment_id AND e.revision_id=b.revision_id AND e.transition_id=b.transition_id AND e.booking_id=b.booking_id AND e.ready_at=c.recorded_at
 AND d.assignment_id=b.assignment_id AND NOT EXISTS(SELECT 1 FROM private_bridge_absences z WHERE z.household_id=h AND z.command_id=k)
 )
$$;
CREATE FUNCTION private_bridge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h uuid;
BEGIN
 h:=COALESCE(NEW.household_id,OLD.household_id);
 IF NOT EXISTS(SELECT 1 FROM households WHERE household_id=h) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM private_bridge_commands c WHERE c.household_id=h AND NOT private_bridge_complete(h,c.command_id))
 OR EXISTS(SELECT 1 FROM private_bridge_absences z JOIN private_bridge_commands c USING(household_id,command_id) WHERE z.household_id=h)
 OR (SELECT count(*) FROM private_bridge_absences WHERE household_id=h)>64
 OR EXISTS(SELECT 1 FROM adventure_revisions r WHERE r.household_id=h AND r.payload_ref LIKE 'private-bridge:%' AND NOT EXISTS(SELECT 1 FROM private_bridge_commands c JOIN private_bridge_bindings b USING(household_id,command_id,request_id) WHERE c.household_id=r.household_id AND b.revision_id=r.revision_id AND r.payload_ref='private-bridge:'||c.record_id::text))
 THEN RAISE EXCEPTION 'Incomplete private TEST readiness' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
-- An appended-but-not-yet-ACKed fact is a legitimate recovery gap. Preserve
-- ACK/retirement evidence by preventing deletion, rather than guessing from a log.
CREATE FUNCTION private_bridge_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM households WHERE household_id=OLD.household_id) THEN
  RAISE EXCEPTION 'Private TEST history cannot be deleted directly' USING ERRCODE='55000';
 END IF;
 RETURN OLD;
END $$;
CREATE FUNCTION private_bridge_namespace_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Private TEST namespace cannot be deleted' USING ERRCODE='55000'; END $$;
CREATE TRIGGER private_bridge_namespace_no_delete BEFORE DELETE ON private_bridge_namespace FOR EACH ROW EXECUTE FUNCTION private_bridge_namespace_delete_guard();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['private_bridge_commands','private_bridge_bindings','private_bridge_ready_events','private_bridge_delivery_work','private_bridge_acks','private_bridge_absences'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION loop_source_immutable()',tab||'_immutable',tab);
 EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION private_bridge_delete_guard()',tab||'_no_delete',tab);
 EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private_bridge_guard()',tab||'_complete',tab);
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['adventure_revisions','published_revisions','assignments','entitlement_claims','entitlement_transitions','capacity_reservations','production_receipts','production_capacity_bookings'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private_bridge_guard()',tab||'_bridge_complete',tab);
 END LOOP;
END $$;
