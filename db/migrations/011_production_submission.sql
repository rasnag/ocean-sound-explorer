-- CODEX-04-B stage 1. Local synthetic implementation only.
-- Capacity is global across households; its immutable configuration is trusted input.
CREATE TABLE production_capacity_buckets (
  bucket_id uuid PRIMARY KEY,
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) BETWEEN 1 AND 200),
  offer_version uuid NOT NULL,
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  ends_at timestamptz NOT NULL CHECK (isfinite(ends_at)),
  coverage_end timestamptz NOT NULL CHECK (isfinite(coverage_end)),
  "limit" bigint NOT NULL CHECK ("limit" BETWEEN 1 AND 9007199254740991),
  synthetic_only boolean NOT NULL CHECK (synthetic_only),
  CHECK (ends_at > starts_at),
  CHECK (coverage_end >= ends_at)
);
CREATE TRIGGER production_bucket_immutable BEFORE UPDATE ON production_capacity_buckets
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Bind the external booking identity to the actual core reservation and request.
-- Existing core fixtures need no bucket and are deliberately left unchanged.
ALTER TABLE capacity_reservations ADD CONSTRAINT capacity_reservation_request_identity
  UNIQUE (household_id,reservation_id,request_id);
CREATE TABLE production_capacity_bookings (
  household_id uuid NOT NULL,
  request_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  bucket_id uuid NOT NULL REFERENCES production_capacity_buckets,
  PRIMARY KEY (household_id,request_id),
  UNIQUE (household_id,booking_id),
  UNIQUE (household_id,request_id,booking_id),
  FOREIGN KEY (household_id,booking_id,request_id)
    REFERENCES capacity_reservations(household_id,reservation_id,request_id) ON DELETE CASCADE
);
CREATE INDEX production_bookings_bucket ON production_capacity_bookings(bucket_id);
CREATE TRIGGER production_booking_immutable BEFORE UPDATE ON production_capacity_bookings
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
-- Admission counts mapped core rows with state IN ('booked','completed') under
-- the global bucket FOR UPDATE lock. Released rows free capacity. Completed rows
-- remain calendar usage. This mapping intentionally has no duplicate state flag.

-- External claim_id names one permanent mapping to the actual composite claim.
-- It does not replace or alter the accepted entitlement kernel identity.
CREATE TABLE production_receipts (
  household_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  request_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  period_id uuid NOT NULL,
  original_received_at timestamptz NOT NULL CHECK (isfinite(original_received_at)),
  original_due_at timestamptz NOT NULL CHECK (isfinite(original_due_at)),
  deadline_interval_seconds integer NOT NULL CHECK (deadline_interval_seconds=86400),
  PRIMARY KEY (household_id,receipt_id),
  UNIQUE (household_id,request_id),
  UNIQUE (household_id,claim_id),
  UNIQUE (household_id,receipt_id,request_id),
  CHECK (original_received_at=date_trunc('second',original_received_at)),
  CHECK (original_due_at=original_received_at + interval '86400 seconds'),
  CHECK (original_received_at >= timestamptz '0001-01-01 00:00:00+00'
    AND original_due_at < timestamptz '10000-01-01 00:00:00+00'),
  FOREIGN KEY (household_id,request_id,booking_id)
    REFERENCES production_capacity_bookings(household_id,request_id,booking_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id,request_id,period_id)
    REFERENCES entitlement_claims(household_id,request_id,period_id) ON DELETE CASCADE
);
CREATE FUNCTION loop_production_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE received timestamptz;
BEGIN
  SELECT original_received_at INTO received FROM wonder_requests
    WHERE household_id=NEW.household_id AND request_id=NEW.request_id;
  IF received IS NULL OR received IS DISTINCT FROM NEW.original_received_at THEN
    RAISE EXCEPTION 'Production receipt must match original request receipt' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER production_receipt_guard BEFORE INSERT ON production_receipts
  FOR EACH ROW EXECUTE FUNCTION loop_production_receipt_guard();
CREATE TRIGGER production_receipt_immutable BEFORE UPDATE ON production_receipts
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Immutable original command provenance and encrypted PRIMARY-COMMITTED fact.
-- No acknowledgement may be inferred from presence of this row alone.
CREATE TABLE production_commands (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  command_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  adult_id uuid NOT NULL,
  child_id uuid NOT NULL,
  profile_version bigint NOT NULL CHECK (profile_version BETWEEN 1 AND 9007199254740991),
  consent_epoch bigint NOT NULL CHECK (consent_epoch BETWEEN 1 AND 9007199254740991),
  request_id uuid NOT NULL,
  wonder_version bigint NOT NULL CHECK (wonder_version BETWEEN 1 AND 9007199254740991),
  scope_version bigint NOT NULL CHECK (scope_version BETWEEN 1 AND 9007199254740991),
  receipt_id uuid NOT NULL,
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[0-9a-f]{64}$'),
  namespace_verifier text NOT NULL CHECK (namespace_verifier ~ '^[0-9a-f]{64}$'),
  primary_commit_id uuid NOT NULL,
  record_id uuid NOT NULL,
  sealed_record jsonb NOT NULL CHECK (jsonb_typeof(sealed_record)='object'),
  PRIMARY KEY (household_id,command_id),
  UNIQUE (household_id,idempotency_key),
  UNIQUE (household_id,request_id),
  UNIQUE (household_id,record_id),
  UNIQUE (household_id,primary_commit_id),
  UNIQUE (household_id,command_id,record_id,primary_commit_id),
  FOREIGN KEY (household_id,request_id,child_id)
    REFERENCES wonder_requests(household_id,request_id,child_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id,request_id,scope_version)
    REFERENCES request_source_scopes(household_id,request_id,source_scope_version) ON DELETE CASCADE,
  FOREIGN KEY (household_id,receipt_id,request_id)
    REFERENCES production_receipts(household_id,receipt_id,request_id) ON DELETE CASCADE
);
CREATE INDEX production_commands_actor_child ON production_commands(household_id,adult_id,child_id,consent_epoch);
CREATE TRIGGER production_command_immutable BEFORE UPDATE ON production_commands
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

-- Insert only after journal append/fsync/reopen proof and fresh authorization.
-- Kept separate so the primary fact never needs an in-place provenance rewrite.
CREATE TABLE production_acknowledgements (
  household_id uuid NOT NULL,
  command_id uuid NOT NULL,
  record_id uuid NOT NULL,
  primary_commit_id uuid NOT NULL,
  durability_ref text NOT NULL,
  PRIMARY KEY (household_id,command_id),
  UNIQUE (household_id,record_id),
  CHECK (durability_ref='production-fsync:' || record_id::text),
  FOREIGN KEY (household_id,command_id,record_id,primary_commit_id)
    REFERENCES production_commands(household_id,command_id,record_id,primary_commit_id) ON DELETE CASCADE
);
CREATE TRIGGER production_acknowledgement_immutable BEFORE UPDATE ON production_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
