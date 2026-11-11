-- CODEX-03-B: local-synthetic caller-owned transaction kernel.
-- No offer, retention, capacity, receipt or production policy is selected here.
ALTER TABLE wonder_requests ADD COLUMN original_received_at timestamptz;
ALTER TABLE wonder_requests ADD CONSTRAINT original_received_at_finite
  CHECK (original_received_at IS NULL OR isfinite(original_received_at));
CREATE FUNCTION loop_original_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.original_received_at IS NOT NULL AND NEW.original_received_at IS DISTINCT FROM OLD.original_received_at THEN
    RAISE EXCEPTION 'Original receipt is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER original_receipt_immutable BEFORE UPDATE ON wonder_requests
  FOR EACH ROW EXECUTE FUNCTION loop_original_receipt_immutable();

CREATE TABLE entitlement_periods (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  period_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  allowance bigint NOT NULL CHECK (allowance BETWEEN 1 AND 9007199254740991),
  allocation_scope text NOT NULL CHECK (allocation_scope IN ('household','child')),
  child_id uuid,
  trial_start timestamptz NOT NULL CHECK (isfinite(trial_start)),
  trial_end timestamptz NOT NULL CHECK (isfinite(trial_end)),
  policy_json jsonb NOT NULL CHECK (jsonb_typeof(policy_json)='object'),
  PRIMARY KEY (household_id,period_id),
  UNIQUE (household_id,entitlement_id),
  CHECK (trial_end > trial_start),
  CHECK ((allocation_scope='household' AND child_id IS NULL) OR
         (allocation_scope='child' AND child_id IS NOT NULL)),
  FOREIGN KEY (household_id,entitlement_id) REFERENCES entitlements ON DELETE CASCADE,
  FOREIGN KEY (household_id,child_id) REFERENCES children ON DELETE CASCADE
);
CREATE TRIGGER entitlement_period_immutable BEFORE UPDATE ON entitlement_periods
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE entitlement_claims (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  request_id uuid NOT NULL,
  period_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','reserved','consumed','released')),
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (household_id,request_id),
  UNIQUE (household_id,request_id,period_id),
  FOREIGN KEY (household_id,request_id) REFERENCES wonder_requests ON DELETE CASCADE,
  FOREIGN KEY (household_id,period_id) REFERENCES entitlement_periods ON DELETE CASCADE
);
CREATE FUNCTION loop_entitlement_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.household_id,NEW.request_id,NEW.period_id) IS DISTINCT FROM
     (OLD.household_id,OLD.request_id,OLD.period_id) THEN
    RAISE EXCEPTION 'Claim identity is immutable' USING ERRCODE='55000';
  END IF;
  IF OLD.state IN ('consumed','released') OR NEW.version <> OLD.version+1 OR NOT
    ((OLD.state='pending' AND NEW.state IN ('reserved','released')) OR
     (OLD.state='reserved' AND NEW.state IN ('consumed','released'))) THEN
    RAISE EXCEPTION 'Invalid claim transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entitlement_claim_guard BEFORE UPDATE ON entitlement_claims
  FOR EACH ROW EXECUTE FUNCTION loop_entitlement_claim_guard();

CREATE TABLE entitlement_commands (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  command_id text NOT NULL CHECK (length(btrim(command_id)) > 0),
  command_kind text NOT NULL CHECK (command_kind IN ('activate','transition')),
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[0-9a-f]{64}$'),
  period_id uuid NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object' AND result->'uncommitted'='true'::jsonb),
  PRIMARY KEY (household_id,command_id),
  FOREIGN KEY (household_id,period_id) REFERENCES entitlement_periods ON DELETE CASCADE
);
CREATE TRIGGER entitlement_command_immutable BEFORE UPDATE ON entitlement_commands
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();

CREATE TABLE entitlement_transitions (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  transition_id text NOT NULL CHECK (length(btrim(transition_id)) > 0),
  request_id uuid NOT NULL,
  period_id uuid NOT NULL,
  contract_version text NOT NULL CHECK (contract_version='1.1.0'),
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  expected_version bigint NOT NULL CHECK (expected_version BETWEEN 0 AND 9007199254740990),
  consent_epoch bigint NOT NULL CHECK (consent_epoch BETWEEN 1 AND 9007199254740991),
  quantity integer NOT NULL CHECK (quantity=1),
  kind text NOT NULL,
  "from" text NOT NULL,
  "to" text NOT NULL,
  cause text NOT NULL,
  cause_id text NOT NULL CHECK (length(btrim(cause_id)) > 0),
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding)='object'),
  PRIMARY KEY (household_id,transition_id),
  UNIQUE (household_id,cause,cause_id),
  FOREIGN KEY (household_id,request_id,period_id)
    REFERENCES entitlement_claims(household_id,request_id,period_id) ON DELETE CASCADE,
  FOREIGN KEY (household_id,transition_id)
    REFERENCES entitlement_commands(household_id,command_id) ON DELETE CASCADE,
  CHECK (
    (kind='hold' AND "from"='none' AND "to"='pending' AND cause='SubmitProduction' AND expected_version=0) OR
    (kind='reserve' AND "from"='pending' AND "to"='reserved' AND cause='AcceptRequest' AND expected_version>=1) OR
    (kind='consume' AND "from"='reserved' AND "to"='consumed' AND cause='MakeAssignmentReady' AND expected_version>=1) OR
    (kind='release' AND "from" IN ('pending','reserved') AND "to"='released' AND cause IN ('DeclineRequest','CancelRequest') AND expected_version>=1)
  )
);
CREATE TRIGGER entitlement_transition_immutable BEFORE UPDATE ON entitlement_transitions
  FOR EACH ROW EXECUTE FUNCTION loop_source_immutable();
