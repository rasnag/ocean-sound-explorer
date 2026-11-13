# CODEX-04-B service stage — attempt 2/2

Producing agent: Codex. Event/recorded date: 2026-11-13. Status: response-only source candidate, awaiting controller execution and review. No feature acceptance, passing test, build, typecheck, native verification, review verdict or merge is claimed.

All six assigned paths are returned with complete contents. Stage-1 migration 011 and production journal are preserved. UI, integrated React verification and the final contract remain stage-3 responsibilities.

## Observed prior failure and bounded diagnosis

Controller-provided actual result, also reread from service/a1-failure.txt: `node exited 1: Independent production probe FAILED: {"stage":"setup","code":"validation_failed"}`. No stack was supplied. This agent did not rerun the probe.

Static inspection identifies a deterministic setup defect before production service construction. The pinned controller probe calls family('production-alpha') and supplies child nickname `Invented production-alpha` (25 characters), while the accepted server/child-setup.mjs derive function rejects nicknames longer than 24. Its sibling nickname is longer still. This is a source-based diagnosis, not an observed stack trace. The first family setup therefore cannot reach createSyntheticProductionSubmission with that input. The existing child validator and protected controller probe are outside this stage's outputs and remain untouched. The controller must use valid invented fixture nicknames while retaining all protected assertions; weakening the accepted nickname contract is not a service-stage fix. The prior probe result remains failed, not excused or converted to a pass.

## Changes in this attempt

Reread the five actual current source outputs. Expanded the authored recovery test from a partial expired-session denial into the full first-primary lost-reply journey: real HTTP commit, missing acknowledgement and hidden family promise, physical journal close/reopen, 25-hour clock advance, denial of old session, actual adult challenge recovery, different immutable current bucket, authenticated status returning the original key, key-only reconcile, identical original receipt/actor/command, and overdue family projection. Added two-household last-slot, fractional opening/end and logout/token-loss tests. Retained sibling allowance, child-period isolation, released/completed capacity, corrupt-tail, same-key conflict and rollback tests. Added wrong-key opening/unchanged-bytes assertions. Fixed the authored stale-profile test to pass its actual newly selected profile when creating a fresh envelope.

Production HTTP and family source retain their first-attempt implementation. The client additionally rejects an eligible response whose source scope does not match the requested saved version. The receipt formatter now explicitly bounds its date range before formatting. None of these edits claims to repair the protected probe's pre-service invalid nickname.

## Authority and reading coverage

Architecture v1.2 / APPROVAL-004, registered SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`. Digest is cited from the authoritative supplied record, not recomputed. Applicable interfaces: WM04 SubmitProduction/ReadProductionEligibility; WM03 pending holds; WM01 authenticated transactions, command dedupe and independent commit evidence; WM10 consent fencing. Relevant invariants: common household→request→entitlement→global-capacity ordering, immutable original receipt/+86400 seconds, once-only claim/booking, independently durable acknowledgement, current authorization on retry, and privacy-safe recovery quarantine.

The first attempt read the full originals supplied in the original prompt: shared authority/governance/approvals/product, architecture and review notes, 00B contracts, approved task, technical handoff and supplied application interfaces including stage 1. Additional section reads covered PROJECT_CONTEXT v1.96 START HERE/current direction, DECISION-033 and open questions; 00C F04–F06 and recovery rows; relevant adult/consent/setup/continuation interfaces. Some combined first-attempt output was truncated; whole-file reading of PROJECT_CONTEXT, 00C or the four referenced application services was never established. This attempt reread the actual five outputs, the relevant production-journal/continuation-journal helper interfaces, the probe's setup section and accepted child validator, and prior failure/report text. It did not restart unrelated source reading. No whole-file coverage is inferred from hashes or snippets and no live-main freshness is asserted.

DECISION-033 governs submission-time eligibility and pending holds, superseding the architecture's historical accepted-before-expiry default. The ordinary prerequisite acceptance is supplied handoff evidence, not independently re-awarded here. G-E03 privacy, provider/runtime capabilities, public offer values, measured capacity/support, actual content approval and public admission remain gated.

## Service behavior and transaction boundaries

The service uses actual adult withSession and its issuer/household serialization, latest active TEST-v1 consent, current profile/selection and an acknowledged immutable capture source. It never clones the saved request or accepts raw question/receipt/time/quota authority from the browser. Exact own-data envelopes are copied before awaits.

Fresh submission acquires request, entitlement and global bucket resources, then commits real kernel pending eligibility hold, core reservation, bucket mapping, composite-claim-bound immutable receipt, original command and encrypted COMMITTED recovery fact together. Actual and floored whole-second receipt times must both lie inside half-open trial/bucket intervals, with actual coverage through the original +24-hour due time. A final clock recheck rolls back a new submission that crosses expiry during SQL. Failed new submissions leave the existing saved-only source unchanged.

The bucket count joins actual capacity_reservations state. Both booked and completed consume that calendar bucket; released frees capacity. Distinct instances use persisted state and physical constraints, not counters. Local module serialization is not multi-host proof. Kernel resource rows reacquired after the bucket are already held by the outer transaction; no new earlier-level grant/period is selected there.

After primary commit, append/fsync/reopen verification occurs outside actor transactions. Fresh current authorization precedes the immutable acknowledgement marker. Primary-only common results omit receipt/durability; family Received/ready/open paths suppress the corresponding promise. Status and reconcile remain authenticated separate recovery routes. Original actor/profile/source/epoch facts are never adopted into a new actor or consent epoch. Recovery and authorized duplicates bypass fresh expiry/allowance/current bucket checks, validate original identities, and tolerate legitimate later claim/capacity transitions. command_id and idempotency_key remain distinct.

All four production POST routes are bound when injected. Production strict JSON/body limits remain 4096 bytes; capture remains 65536. Generic denial, origin/cookie/header checks and no-store responses remain. Legacy family read still requires exactly {view_context,child_id}; profile_version belongs only to the production wrapper. Browser transport remains RAM-only; stage 3 must retain first uncertain intent and fence late responses on selection/session changes.

## Evidence status and remaining gates

Authored tests are unexecuted. They use actual synthetic PostgreSQL/PGlite, migrations, access, consent, setup, capture, entitlement kernel, production journal/service, HTTP and client. Capacity completion in the released/completed test is explicitly a capacity-only relational fixture, not WM08 readiness/publication acceptance. No actual checks, writes, installs, commits, external calls, contacts, spending, provisioning or deployment were performed by this agent; only read commands were issued.

Controller obligations remain: exact hashes, actual commands/stdout/exit statuses, protected independent probes, meaningful tests, baseline-bound typing comparison, build/private/route scans, native UI scenarios and required independent review. The 27-diagnostic protected baseline is not a whole-project typecheck pass. The invalid protected setup fixture currently prevents its service assertions from running; this report does not claim coverage from those unexecuted assertions.

Architecture review note 2 is implemented locally through retryable primary-only results and idempotent backfill. Scheduler reconciliation, sustained-outage thresholds/operator alerts, hosted independent durability, multihost locking, disaster recovery and deletion/key-management capability evidence remain WM01/10/13 integration gates. No platform-wide outage breaker or operator alert is claimed. Generation dispatch review note 4 belongs to its owning module. Restore must replay recorded facts idempotently, never re-execute consumption.

Downstream: stage 3 UI/integrated tests/contract; CODEX-04-C lifecycle; WM08 readiness/delivery; WM10 privacy/deletion; WM01/13 recovery/scheduler capabilities; WM11 measured capacity; WM12 actual acceptance evidence. No other task is marked complete.
