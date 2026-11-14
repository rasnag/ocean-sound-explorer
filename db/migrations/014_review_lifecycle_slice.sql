-- REVIEW-LOCAL-01 / DECISION-043 / APPROVAL-010: TEST ONLY.
-- Architecture 1.2, SHA256
-- 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
-- ADR-E03/04/05/06: household-first fencing, exact immutable source pins,
-- encrypted committed facts and independent durability before acknowledgement.
-- No production publication, assignment, entitlement or capacity transitions.

CREATE TABLE review_slice_namespace (
 singleton boolean PRIMARY KEY CHECK(singleton),
 namespace_verifier text CHECK(namespace_verifier ~ '^[0-9a-f]{64}$')
);
INSERT INTO review_slice_namespace VALUES(true,NULL);
CREATE TRIGGER review_slice_namespace_stable BEFORE UPDATE ON review_slice_namespace
 FOR EACH ROW EXECUTE FUNCTION queue_namespace_guard();

-- Private question, draft, checklist, notes and reasons exist only in sealed_fact.
-- The command is the primary-committed outbox fact, not an acknowledgement.
CREATE TABLE review_slice_commands (
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
 action text NOT NULL CHECK(action IN('RecordTestReview','ReleaseTestSnapshot','WithdrawTestSnapshot')),
 generation_job_id uuid NOT NULL,
 generation_version bigint NOT NULL CHECK(generation_version>0),
 generation_fence bigint NOT NULL CHECK(generation_fence>=0),
 revision_id uuid NOT NULL,
 output_digest text NOT NULL CHECK(output_digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL,
 record_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL,
 canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
 namespace_verifier text NOT NULL CHECK(namespace_verifier ~ '^[0-9a-f]{64}$'),
 sealed_fact jsonb NOT NULL,
 PRIMARY KEY(household_id,command_id),
 UNIQUE(household_id,request_id,aggregate_version),
 UNIQUE(household_id,request_id,command_id),
 UNIQUE(household_id,record_id,primary_commit_id),
 FOREIGN KEY(household_id,request_id,child_id)
  REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,child_id,profile_version)
  REFERENCES child_profile_versions(household_id,child_id,profile_version) ON DELETE CASCADE,
 FOREIGN KEY(household_id,generation_job_id)
  REFERENCES generation_slice_jobs(household_id,job_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,revision_id)
  REFERENCES generation_slice_revisions(household_id,revision_id) ON DELETE CASCADE,
 CHECK(queue_valid_sealed(sealed_fact,'household',household_id,command_id,
  record_id,primary_commit_id,canonical_digest,namespace_verifier))
);
CREATE TRIGGER review_slice_command_immutable BEFORE UPDATE ON review_slice_commands
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE review_slice_acknowledgements (
 household_id uuid NOT NULL,
 command_id uuid NOT NULL,
 record_id uuid NOT NULL,
 primary_commit_id uuid NOT NULL,
 acknowledged_at timestamptz NOT NULL,
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,command_id)
  REFERENCES review_slice_commands ON DELETE CASCADE,
 FOREIGN KEY(household_id,record_id,primary_commit_id)
  REFERENCES review_slice_commands(household_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TRIGGER review_slice_ack_immutable BEFORE UPDATE ON review_slice_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE review_slice_reviews (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 command_id uuid NOT NULL,
 revision_id uuid NOT NULL,
 output_digest text NOT NULL CHECK(output_digest ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,request_id,command_id)
  REFERENCES review_slice_commands(household_id,request_id,command_id) ON DELETE CASCADE
);
CREATE TRIGGER review_slice_review_immutable BEFORE UPDATE ON review_slice_reviews
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Snapshot payload is inside its command's encrypted fact. Uniqueness survives
-- withdrawal: a distinct command cannot release the same revision again.
CREATE TABLE review_slice_snapshots (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 snapshot_id uuid NOT NULL,
 command_id uuid NOT NULL,
 revision_id uuid NOT NULL,
 output_digest text NOT NULL CHECK(output_digest ~ '^[0-9a-f]{64}$'),
 predecessor_snapshot_id uuid,
 PRIMARY KEY(household_id,snapshot_id),
 UNIQUE(household_id,request_id,snapshot_id),
 UNIQUE(household_id,command_id),
 UNIQUE(household_id,request_id,revision_id),
 FOREIGN KEY(household_id,request_id,command_id)
  REFERENCES review_slice_commands(household_id,request_id,command_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,predecessor_snapshot_id)
  REFERENCES review_slice_snapshots(household_id,request_id,snapshot_id),
 CHECK(predecessor_snapshot_id IS NULL OR predecessor_snapshot_id<>snapshot_id)
);
CREATE TRIGGER review_slice_snapshot_immutable BEFORE UPDATE ON review_slice_snapshots
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Withdrawal appends a separate fact; it never rewrites snapshot rules/history.
CREATE TABLE review_slice_withdrawals (
 household_id uuid NOT NULL,
 request_id uuid NOT NULL,
 snapshot_id uuid NOT NULL,
 command_id uuid NOT NULL,
 PRIMARY KEY(household_id,snapshot_id),
 UNIQUE(household_id,command_id),
 FOREIGN KEY(household_id,request_id,command_id)
  REFERENCES review_slice_commands(household_id,request_id,command_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,snapshot_id)
  REFERENCES review_slice_snapshots(household_id,request_id,snapshot_id) ON DELETE CASCADE
);
CREATE TRIGGER review_slice_withdrawal_immutable BEFORE UPDATE ON review_slice_withdrawals
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Internal, bounded key retirement. This is no ACK or review evidence.
CREATE TABLE review_slice_absences (
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 command_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES founder_identities(identity_id),
 recorded_at timestamptz NOT NULL,
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,request_id) REFERENCES wonder_requests(household_id,request_id) ON DELETE CASCADE
);
CREATE TRIGGER review_slice_absence_immutable BEFORE UPDATE ON review_slice_absences
 FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
