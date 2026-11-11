-- Preserve the checksum and contents of 001_core.sql.
-- Validate relationship foreign keys immediately, and enforce one assignment
-- per request at transaction commit. No duplicate assignment may commit.
-- This constraint is not a foreign-key target and must not be used as an
-- ON CONFLICT column arbiter; fixture loading uses ON CONFLICT DO NOTHING.
ALTER TABLE assignments
  DROP CONSTRAINT assignments_household_id_request_id_key;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_household_id_request_id_key
  UNIQUE (household_id, request_id) DEFERRABLE INITIALLY DEFERRED;
