-- Local invented-family permissions only. TEST-v1 is not approved legal text.
-- Defaults preserve existing developer-owned relational fixtures.
ALTER TABLE service_consents
  ADD COLUMN policy_version text NOT NULL DEFAULT 'TEST-v1',
  ADD COLUMN optional_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN optional_story boolean NOT NULL DEFAULT false,
  ADD COLUMN record_receipt_id uuid;
CREATE TABLE consent_commands (
  household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
  command_id uuid NOT NULL,
  adult_id uuid NOT NULL REFERENCES adult_accounts ON DELETE CASCADE,
  command_kind text NOT NULL CHECK(command_kind IN ('record','withdraw')),
  canonical_digest text NOT NULL CHECK(canonical_digest ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  PRIMARY KEY(household_id,command_id)
);
CREATE TABLE consent_global_throttle (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  window_started_ms bigint NOT NULL CHECK(window_started_ms>=0),
  attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 120)
);
INSERT INTO consent_global_throttle VALUES(true,0,0);
CREATE TABLE consent_household_throttle (
  household_id uuid PRIMARY KEY REFERENCES households ON DELETE CASCADE,
  window_started_ms bigint NOT NULL CHECK(window_started_ms>=0),
  attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 30)
);
