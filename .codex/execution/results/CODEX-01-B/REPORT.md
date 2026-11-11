# CODEX-01-B — corrective source draft

Owner of this drafting output: Codex. Date: 2026-11-10. Status: returned for controller application and verification; not marked done or accepted.

## Authority and inspected evidence

Scope is CODEX-01-B only, APPROVAL-003, approved-copy task blob f07cc359aa637ae78b02a68868102d0567d7c582, under the current explicit execution instruction and synthetic-only limitation. Read the supplied verified SOURCE_OF_TRUTH.md, PROJECT_CONTEXT.md v1.91, approved/APPROVALS.md, product/task specifications, complete engineering reference, module guide, review notes and CODEX-00-B CONTRACTS.md v1.1.1. These are dated verified snapshots; fresh remote-main status is not claimed. The bounded context AGENTS.md is absent; actual planning AGENTS.md was read at ../../AGENTS.md, alongside the supplied application AGENTS.md. No required architecture or contract evidence is missing for this correction.

Architecture: engineering v1.2, APPROVAL-004, source commit a676dd1fcab9c1a92d954c1805ffdfab2109736d, source blob 78df8cf2857c0b32222a442329778cf43e8b05ee, registered SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79. Digest is cited from the register, not recomputed.

Read actual db/migrate.mjs, db/migrations/001_core.sql, db/migrations/002_assignment_constraint_order.sql, db/synthetic-fixtures.mjs, lib/loop/local-db.mjs, lib/loop/environment.mjs, tests/loop-database.test.mjs and the existing report. Read the actual controller check_application_card.py and the protected database_probe.mjs supplied in the prompt. No secrets, environment credential values or family outputs were read.

## Correction and preserved invariants

The supplied prior npm.cmd test result exited 1: 12 of 14 tests passed and two failed with SQLSTATE 55000 because the assignments fixture used untargeted ON CONFLICT DO NOTHING against a table containing a deferrable unique constraint. This is prior controller evidence, not a check executed by this agent.

The returned fixture loader changes that insert to ON CONFLICT (household_id,assignment_id) DO NOTHING. This selects the immediate primary-key index rather than asking PostgreSQL to consider the deferrable UNIQUE(household_id,request_id) as an arbiter. Request uniqueness still applies at commit. Immediate request-child, revision-request and published-revision foreign keys remain unchanged, preserving meaningful relationship failures before deferred duplicate-request checks.

Applicable interfaces/invariants: WM-01 migrate(db), seedSynthetic(db), createSyntheticDatabase(env) and relational integrity under ADR-E01/05; WM-05/08 published revision and assignment lineage under ADR-E04; WM-07 independently unique scoped action IDs and event sequences; WM-10 deletable household-scoped records. The fixture transaction retains its exclusive households lock and atomic complete-chain insertion. Repeated loading uses canonical UUID identities. Exactly two invented household chains, fixture-1/fixture-engine-1 and opaque encrypted-payload placeholders remain. Published markers represent synthetic relational fixtures, never human-approved content.

Only db/synthetic-fixtures.mjs and this report are returned. Retain all existing migrations, runner, local driver and independent tests unchanged. In particular, do not rewrite applied migration content or checksums. Existing tests already exercise first and repeated seeding on two fresh real databases and the deferred assignment constraint; they provide the regression coverage for this correction once executed.

## Required checks and evidence status

The transport override prohibits writes and checks. No checks were run by this agent on this revision, and no passing outcome or browser observation is claimed.

| Exact check | Properties asserted | Observed outcome on returned revision |
| --- | --- | --- |
| npm.cmd test | Empty real PostgreSQL 18 factory and exact guard failures; two fresh databases; repeated migrations and fixtures; complete scoped chains; actual action/sequence unique index columns; range failures; source/published immutability; transaction rollback; household cascade isolation; immediate wrong-child/revision/draft assignment rejection; deferred request uniqueness and commit rollback; valid additional canonical chain; migration checksum mismatch and SQL/registry failure atomicity | Not yet run by this agent |
| npm.cmd run build | Existing production app builds with unchanged routing/configuration | Not yet run by this agent |
| C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-01-B | Pinned dev-only PGlite dependency; protected real PostgreSQL scope, uniqueness, range, cascade and migration fault probes; guard rejection; seeded production secret/fixture scan; actual main.tsx leaf-identity routing checks | Not yet run by this agent |

Observed source finding: assignments has an immediate composite primary key and a separate deferred request unique constraint; the existing seed insert has no conflict target. The supplied error identifies that deferred constraint as the unsupported arbiter. The proposed correction addresses that exact failure. Runtime confirmation remains required. Controller must record the exact written artifact revision, command outputs and exit statuses before technical acceptance.

## Limits and downstream handoff

No files were written, checks executed, dependencies installed, messages sent, resources provisioned, paid calls made, commits created, pushes/merges performed or deployments launched. Approved records, ledgers, .claude/, environment guard, app routing, public assets and controller-owned package files remain untouched. The existing explicit three-public-flag client allowlist remains unchanged.

This correction does not establish consent-command enforcement, authentication, entitlement accounting, content review/publication approval, CommitAction/CAS, journal durability, key management, dispatch records, Supabase/RLS/pooling, backup/restore or live deletion. Architecture review obligations concerning journals, keys and dispatch remain with their owning modules. Household cascade is not completion of CODEX-10-C/10-D.

DECISION-033 resolves pending eligibility holds and submission-time trial eligibility only within its recorded scope. Privacy G-E03, provider capability/terms, offer values, capacity/support and real content approval remain gated. No retention period, price, allowance or production capacity default is introduced.

Downstream interface consumers include WM-02 child/consent, WM-03 entitlement, WM-04 request/source/capacity, WM-05 revision lineage, WM-07 play/events, WM-08 assignments and WM-10 deletion. CODEX-01-C, CODEX-07-A and CODEX-10-C/10-D retain their own prerequisites, scope and evidence requirements. Exact index successor enumeration is not claimed from an unavailable bounded task index. Controller application, authorized checks and independent review remain outstanding.
