-- CODEX-01-B: PostgreSQL >=15 relational foundation, synthetic use only.
CREATE TABLE households (
  household_id uuid PRIMARY KEY
);
CREATE TABLE service_consents (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  consent_epoch bigint NOT NULL CHECK (consent_epoch > 0),
  state text NOT NULL CHECK (state IN ('active','withdrawn')),
  PRIMARY KEY (household_id, consent_epoch)
);
CREATE TABLE children (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  child_id uuid NOT NULL,
  payload_ref text,
  PRIMARY KEY (household_id, child_id)
);
CREATE TABLE wonder_requests (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  request_id uuid NOT NULL,
  child_id uuid NOT NULL,
  payload_ref text,
  PRIMARY KEY (household_id, request_id),
  UNIQUE (household_id, request_id, child_id),
  FOREIGN KEY (household_id, child_id) REFERENCES children ON DELETE CASCADE
);
CREATE TABLE request_source_scopes (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  request_id uuid NOT NULL,
  source_scope_version bigint NOT NULL CHECK (source_scope_version > 0),
  payload_ref text,
  PRIMARY KEY (household_id, request_id, source_scope_version),
  FOREIGN KEY (household_id, request_id) REFERENCES wonder_requests ON DELETE CASCADE
);
CREATE TABLE capacity_reservations (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  request_id uuid NOT NULL,
  source_scope_version bigint NOT NULL CHECK (source_scope_version > 0),
  units integer NOT NULL CHECK (units > 0),
  idempotency_key uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('booked','completed','released')),
  PRIMARY KEY (household_id, reservation_id),
  UNIQUE (household_id, request_id),
  UNIQUE (household_id, idempotency_key),
  FOREIGN KEY (household_id, request_id, source_scope_version)
    REFERENCES request_source_scopes ON DELETE CASCADE
);
CREATE TABLE entitlements (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  entitlement_id uuid NOT NULL,
  PRIMARY KEY (household_id, entitlement_id)
);
CREATE TABLE adventure_revisions (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  request_id uuid NOT NULL,
  source_scope_version bigint NOT NULL CHECK (source_scope_version > 0),
  pattern_version text NOT NULL,
  engine_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','published')),
  payload_ref text,
  PRIMARY KEY (household_id, revision_id),
  UNIQUE (household_id, revision_id, request_id),
  UNIQUE (household_id, revision_id, status),
  FOREIGN KEY (household_id, request_id, source_scope_version)
    REFERENCES request_source_scopes ON DELETE CASCADE
);
CREATE TABLE published_revisions (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status = 'published'),
  PRIMARY KEY (household_id, revision_id),
  FOREIGN KEY (household_id, revision_id, status)
    REFERENCES adventure_revisions(household_id, revision_id, status) ON DELETE CASCADE
);
CREATE TABLE assignments (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  request_id uuid NOT NULL,
  child_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  PRIMARY KEY (household_id, assignment_id),
  UNIQUE (household_id, request_id),
  UNIQUE (household_id, assignment_id, child_id, revision_id),
  FOREIGN KEY (household_id, request_id, child_id)
    REFERENCES wonder_requests(household_id, request_id, child_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, revision_id, request_id)
    REFERENCES adventure_revisions(household_id, revision_id, request_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, revision_id) REFERENCES published_revisions ON DELETE CASCADE
);
CREATE TABLE play_sessions (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  play_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  child_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  PRIMARY KEY (household_id, play_id),
  FOREIGN KEY (household_id, assignment_id, child_id, revision_id)
    REFERENCES assignments(household_id, assignment_id, child_id, revision_id) ON DELETE CASCADE
);
CREATE TABLE play_events (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  play_id uuid NOT NULL,
  action_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  payload jsonb NOT NULL,
  CONSTRAINT play_events_action_unique UNIQUE (household_id, play_id, action_id),
  CONSTRAINT play_events_sequence_unique UNIQUE (household_id, play_id, sequence),
  FOREIGN KEY (household_id, play_id) REFERENCES play_sessions ON DELETE CASCADE
);

-- Immutability prevents rewriting identity/content, while DELETE remains available
-- for privacy erasure. These triggers do not implement publication approval.
CREATE FUNCTION loop_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Source versions are immutable; insert a successor' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_scope_immutable BEFORE UPDATE ON request_source_scopes
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
CREATE FUNCTION loop_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published revision is immutable; insert a successor' USING ERRCODE='55000';
  END IF;
  IF (NEW.household_id,NEW.revision_id,NEW.request_id,NEW.source_scope_version)
    IS DISTINCT FROM (OLD.household_id,OLD.revision_id,OLD.request_id,OLD.source_scope_version) THEN
    RAISE EXCEPTION 'Revision lineage is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revision_immutable BEFORE UPDATE ON adventure_revisions
  FOR EACH ROW EXECUTE FUNCTION loop_revision_immutable();
CREATE TRIGGER publication_immutable BEFORE UPDATE ON published_revisions
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
