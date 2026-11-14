-- GENERATION-LOCAL-01: invented data only, no publication or whole-card completion.
CREATE TABLE generation_slice_namespace(singleton boolean PRIMARY KEY CHECK(singleton),namespace_verifier text CHECK(namespace_verifier ~ '^[0-9a-f]{64}$'));
INSERT INTO generation_slice_namespace VALUES(true,NULL);
CREATE TRIGGER generation_namespace_stable BEFORE UPDATE ON generation_slice_namespace FOR EACH ROW EXECUTE FUNCTION queue_namespace_guard();
CREATE TABLE generation_slice_jobs(
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
 job_id uuid NOT NULL,request_id uuid NOT NULL,child_id uuid NOT NULL,
 consent_epoch bigint NOT NULL CHECK(consent_epoch>0),request_scope_version bigint NOT NULL CHECK(request_scope_version>0),
 original_scope_version bigint NOT NULL CHECK(original_scope_version>0),
 profile_version bigint NOT NULL CHECK(profile_version>0),
 actor_id uuid NOT NULL,version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
 state text NOT NULL CHECK(state IN('queued','running','draft_ready','failed','unsupported','cancelled','uncertain')),
 mock_case text NOT NULL CHECK(mock_case IN('valid','invalid','unsupported','timeout','delayed')),
 field text NOT NULL CHECK(field IN('all','opening','help','offscreen')),
 parent_revision_id uuid,current_revision_id uuid,fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0),
 created_at timestamptz NOT NULL,PRIMARY KEY(household_id,job_id),
 FOREIGN KEY(household_id,request_id,child_id) REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
 FOREIGN KEY(household_id,child_id,profile_version) REFERENCES child_profile_versions(household_id,child_id,profile_version) ON DELETE CASCADE,
 FOREIGN KEY(household_id,request_id,original_scope_version) REFERENCES wonder_source_payloads(household_id,request_id,source_scope_version) ON DELETE CASCADE
);
CREATE TABLE generation_slice_commands(
 household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,command_id uuid NOT NULL,
 job_id uuid NOT NULL,actor_id uuid NOT NULL,consent_epoch bigint NOT NULL CHECK(consent_epoch>0),
 original_session_hash text NOT NULL CHECK(original_session_hash ~ '^[0-9a-f]{64}$'),
 aggregate_version bigint NOT NULL CHECK(aggregate_version>0),recorded_at timestamptz NOT NULL,
 record_id uuid NOT NULL,primary_commit_id uuid NOT NULL,canonical_digest text NOT NULL,
 namespace_verifier text NOT NULL,sealed_fact jsonb NOT NULL,
 PRIMARY KEY(household_id,command_id),UNIQUE(household_id,record_id,primary_commit_id),
 UNIQUE(household_id,job_id,aggregate_version),
 FOREIGN KEY(household_id,job_id) REFERENCES generation_slice_jobs ON DELETE CASCADE,
 CHECK(queue_valid_sealed(sealed_fact,'household',household_id,command_id,record_id,primary_commit_id,canonical_digest,namespace_verifier))
);
CREATE TRIGGER generation_command_immutable BEFORE UPDATE ON generation_slice_commands FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE TABLE generation_slice_acknowledgements(
 household_id uuid NOT NULL,command_id uuid NOT NULL,record_id uuid NOT NULL,primary_commit_id uuid NOT NULL,acknowledged_at timestamptz NOT NULL,
 PRIMARY KEY(household_id,command_id),
 FOREIGN KEY(household_id,command_id) REFERENCES generation_slice_commands ON DELETE CASCADE,
 FOREIGN KEY(household_id,record_id,primary_commit_id) REFERENCES generation_slice_commands(household_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TRIGGER generation_ack_immutable BEFORE UPDATE ON generation_slice_acknowledgements FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE TABLE generation_slice_revisions(
 household_id uuid NOT NULL,revision_id uuid NOT NULL,job_id uuid NOT NULL,command_id uuid NOT NULL,parent_revision_id uuid,
 output_digest text NOT NULL CHECK(output_digest ~ '^[0-9a-f]{64}$'),created_at timestamptz NOT NULL,
 PRIMARY KEY(household_id,revision_id),
 FOREIGN KEY(household_id,job_id) REFERENCES generation_slice_jobs ON DELETE CASCADE,
 FOREIGN KEY(household_id,command_id) REFERENCES generation_slice_commands ON DELETE CASCADE
);
CREATE TRIGGER generation_revision_immutable BEFORE UPDATE ON generation_slice_revisions FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE TABLE generation_slice_request_heads(
 household_id uuid NOT NULL,request_id uuid NOT NULL,job_id uuid NOT NULL,
 PRIMARY KEY(household_id,request_id),
 FOREIGN KEY(household_id,job_id) REFERENCES generation_slice_jobs ON DELETE CASCADE
);
CREATE TABLE generation_slice_attempts(
 household_id uuid NOT NULL,job_id uuid NOT NULL,attempt_id uuid NOT NULL,completion_id uuid NOT NULL,
 fence bigint NOT NULL CHECK(fence>0),lease_until timestamptz NOT NULL,started_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN('authorized','draft_ready','failed','unsupported','cancelled','uncertain')),
 PRIMARY KEY(household_id,job_id),UNIQUE(household_id,attempt_id),UNIQUE(household_id,completion_id),
 FOREIGN KEY(household_id,job_id) REFERENCES generation_slice_jobs ON DELETE CASCADE
);

-- Job identity and source lineage are immutable; only lifecycle/CAS fields move.
CREATE FUNCTION generation_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.household_id,NEW.job_id,NEW.request_id,NEW.child_id,NEW.consent_epoch,NEW.request_scope_version,NEW.original_scope_version,NEW.profile_version,NEW.actor_id,NEW.mock_case,NEW.field,NEW.parent_revision_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.household_id,OLD.job_id,OLD.request_id,OLD.child_id,OLD.consent_epoch,OLD.request_scope_version,OLD.original_scope_version,OLD.profile_version,OLD.actor_id,OLD.mock_case,OLD.field,OLD.parent_revision_id,OLD.created_at)
 OR NEW.version <> OLD.version+1 OR NEW.fence < OLD.fence THEN
  RAISE EXCEPTION 'Generation identity/CAS is immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generation_job_identity BEFORE UPDATE ON generation_slice_jobs FOR EACH ROW EXECUTE FUNCTION generation_job_guard();

CREATE FUNCTION generation_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.household_id,NEW.job_id,NEW.attempt_id,NEW.completion_id,NEW.fence,NEW.lease_until,NEW.started_at)
 IS DISTINCT FROM ROW(OLD.household_id,OLD.job_id,OLD.attempt_id,OLD.completion_id,OLD.fence,OLD.lease_until,OLD.started_at) THEN
  RAISE EXCEPTION 'Mock attempt lease/fence is immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generation_attempt_identity BEFORE UPDATE ON generation_slice_attempts FOR EACH ROW EXECUTE FUNCTION generation_attempt_guard();
