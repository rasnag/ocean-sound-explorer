# CODEX-04-C — screens-and-complete-journey authored source

2026-11-13 · Codex · response-only staged drafting. Eight complete source files returned. No writes, checks, installation, commit, API/external action, model/settings change, sending, spending, provisioning or deployment was performed. Controller owns saving and actual verification. This is not intermediate acceptance, whole-card acceptance, a review pass or merge.

Preserve all three original unsuccessful calls, both service-stage attempts (including the first syntax failure and second repair), data/journal evidence, setup-review evidence and persisted counters. This report does not reset or consume controller review counters. Whole-card feature review remains maximum3; the supplied stage record initially recorded0 used. Exact current counters must remain controller-owned.

## Authority and reading

Inline originals were read as supplied: AGENTS/GOVERNANCE/SOURCE_OF_TRUTH, approvals/product/task, full engineeringv1.2/guide/review notes, F06/O02, accepted04-B handoff, actual stage1 SQL/journal, completed queue/service/host/family/production sources, actual recovery tests, prior client/capture/family sources and protected queue probe. They were not separately reread from disk.

Additional actual local reads: PROJECT_CONTEXT START HERE and applicable DECISION-027–034/open-question records; queue_staged_recovery.json and stage contract; applicable00-B production/readiness/recovery contracts; product decisions and WM04 module entry;04-A/03-C acceptance notes; actual01-C/04-B accepted status; LOOP-POLICY-001 and exact04-C execution entry; queue profile/scenario list; actual prior production React/HTTP test loader; package.json; current consent-service projection; previous service-stage REPORT. Broad reads with truncated output are not claimed as complete historical reads, fresh-main verification or digest verification. Available records are the supplied pinned local snapshot; no Git-cleanliness/current-main claim is made.

The React best-practices skill was consulted for authored hook/cleanup/accessibility review. It supplied no product authority, permission gate or execution result. No external documentation/API was accessed.

Engineeringv1.2 / APPROVAL-004 registered SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`; WM04, ADR-E01/E02/E05, current authorization, household-before-consent/domain locks, unchanged source/receipt/booking/claim/period identity and independent committed evidence govern. DECISION-033 explicitly permits original eligible submission acceptance after trial expiry. No trial extension or new charge is introduced.

## Returned source and design

- server/queue-page.mjs: real static founder HTML/CSS/authored script; actual service endpoints for selection/filter, clarify/propose/accept/decline, late support DRAFT, intake pause and exact-key recovery. Text nodes render untrusted private text. No sending, generation or publishing control.
- lib/loop/queue-client.mjs: RAM transport with descriptor-aware exact command validation, bounded recursive JSON response inspection, exact common AcceptRequest shape and receipt binding, status/reconcile/intake APIs and abort signal forwarding. Uses actual consent projection before parent read; never guesses consent epoch1.
- app/LoopRequestStatus.tsx: public typed re-export of the real component colocated in LoopFamilyHome. This preserves old accepted TSX test hooks, which transpile only existing family/capture sources. No placeholder UI or absent eager import is used.
- app/LoopFamilyHome.tsx: actual F06 component and preserved existing home/capture/continuation/introduction/saved-play/allowance UI. Original/current words, interpretation, exact-scope agreement, correction, cancellation, late draft/estimate/history and uncertain-command recovery are reachable. Selection/fence/abort/sequence checks suppress late private replies; no private persistent browser state.
- app/loop-family-home.css: existing rules retained with responsive request/detail/form/focus presentation.
- tests/loop-request-queue.test.mjs: two authored integrated local journeys plus malformed/accessor transport test using real React/HTTP/PGlite/accepted services and encrypted queue reopen. No checks were executed by the drafter.
- docs/loop/REQUEST_QUEUE_CONTRACT.md: service/client/result/SQL/recovery/clock/privacy/native-verification contract and explicit known integration seams.

The actual component is colocated to preserve the original accepted test adapter rather than editing old tests or adding loader dependencies. LoopRequestStatus.tsx exports that same implementation and props for downstream consumers. This is an explicit integration choice, not a claim of separate duplicate screen implementation.

## Exact existing SQL and encrypted bindings retained

No migration/service/journal is changed in this stage. Actual012 tables:

| Table | Exact columns |
| --- | --- |
| queue_journal_namespace | singleton, namespace_verifier |
| queue_requests | household_id, request_id, child_id, receipt_id, original_source_scope_version |
| queue_commands | household_id, command_id, request_id, actor_id, actor_kind, original_session_hash, consent_epoch, aggregate_version, recorded_at, canonical_digest, namespace_verifier, record_id, primary_commit_id, sealed_record |
| queue_scopes | household_id, request_id, scope_version, previous_scope_version, kind, command_id, record_id, payload_ref |
| queue_history | household_id, request_id, aggregate_version, command_id, record_id, scope_version, agreement_version, state, breach_observed, payload_ref |
| queue_acknowledgements | household_id, command_id, record_id, primary_commit_id, durability_ref, acknowledged_at |
| queue_intake_lock | singleton |
| queue_operator_commands | command_id, actor_id, original_session_hash, aggregate_version, paused, recorded_at, record_id, primary_commit_id, canonical_digest, namespace_verifier, sealed_record |
| queue_operator_acknowledgements | command_id, record_id, primary_commit_id, durability_ref, acknowledged_at |

All new tables have real primary keys. Composite request/receipt/source references cascade for household privacy removal. Immutable guards permit privacy deletes but prohibit history/source updates. Scope numbering starts at1 independently of capture source numbering; aggregate starts0 before the first queue mutation. Positive safe-integer/range/version and deferred command/history/reference constraints remain.

Private content lives in authenticated encrypted facts: effect.snapshot=current state; effect.history=one attributed server transition; effect.scopes[String(version)]=introduced lineage; effect.intake=operator state/reason. payload_ref is queue-fact:<record_id>. Original context remains bound to original capture payload_ref; corrected context is encrypted queue content. No question/answer/interpretation/history/result plaintext is added to SQL or physical journal metadata.

## Interfaces and transactional invariants

Original service APIs are retained exactly. Family uses selection={view_context,child_id,profile_version}; read/command/status/reconcile. Founder uses filter read, exact founder command, readIntake/setIntake, household or operator status/reconcile. HTTP uses existing cookie/origin/strict JSON/body/no-store/CSP/127.0.0.1 guards. Founder assets are dynamically imported only on actual authorized GET.

Actual founder session/role/expiry/revocation and family current epoch/profile/child/request checks remain backend authority. UI controls confer none. Duplicate replay is current-authorized before fresh CAS/time/pause checks. Exact original common receipt remains unchanged across corrections/clarification/alternative/accept/recovery/cancel.

Accept converts the actual pending hold once under outer transaction. Pre-ready terminal transitions release real unconsumed pending/reserved claim and mapped booked capacity once. Parent agreement alone is not acceptance. Replaced alternatives/corrections clear agreement and fit. Original capture.question remains bound to real capture source/payload; downstream currentScope explicitly separates original/current question/interpretation and marks generation unimplemented.

Journal append follows PRIMARY-COMMITTED fact, not intent. Independent fsync/reopen/authentication/current-authority recheck precede ACK. Missing evidence is pending/quarantined, never success. Separate operator material has no household fallback. No consumption/assignment/revision/publish/send is created here.

## Integration issues requiring disposition before acceptance

1. Completed production service paused eligibility includes `{status:'ineligible',reason:'intake_paused'}`; accepted production-client only accepts a one-field negative object. That older client is outside this stage's owned paths. It fails closed with generic eligibility-unavailable copy. Do not claim paused production UX passes, remove the reason silently or invent a result status. Controller must resolve this precise service/client seam in authorized scope before whole-card acceptance.
2. Founder listing fails closed if a household latest queue mutation is primary-only. After reload, service status requires an opaque household reference that listing may not return. The authored founder UI supports manual controller-supplied opaque UUID recovery, and RAM intents retain known household IDs. Automatic pending-scope discovery and another actor's pending recovery remain constrained by current API; no private metadata is disclosed to bypass it.
3. The authored tests and sources still require actual controller syntax/runtime verification. There is no test count, build result, compiler comparison, native scenario or review verdict in this drafting result. Missing verification is not PASS.

## Authored coverage and controller sequence

Journey1: actual family save→explicit production, real founder HTTP/client clarification, parent answer/correction, original/current lineage and receipt preservation, alternative1 agreement→replacement→old acceptance409, exact new agreement, acceptance after original expiry, late draft/estimate with original breach, reserved cancellation/release and zero assignment/consumption.

Journey2: first queue reply loss and independent append outage, primary-only state, actual encrypted journal close/reopen and React reload/status/reconcile with original key, pause and saved-only capture, pending cancellation, held actual private read after sibling switch and withdrawal denial. These are authored assertions only. The separate client test rejects malformed response keys and an accessor command without invoking its getter.

Controller must save source, record exact hashes/head and run all application tests/build, protected queue probe plus all11 previous probes, fixed compiler comparison against known27 diagnostics (NOT globaltscPASS),76 route identities and private source/build scans. Then execute actual source-bound eight native scenarios: phone-keyboard-queue; original-question-and-clock; clarification-and-correction; exact-alternative-agreement; decline-cancel-release; late-update-draft; intake-pause-existing-request; pending-retry-and-authority. Resolve actual failures without weakening probes or old tests. Only then whole-card Claude review within max3, exact-head protected merge and delegated technical acceptance may occur. No intermediate stage acceptance.

## Carried findings and open gates

Retain actual04-A/03-C/04-B findings: local serial promise/PGlite single-connection last-slot proof is not real PostgreSQL/multihost contention or deadlock proof; original late household-lock finding must not be hidden by current corrected-path claims; generic precommit-outage wording; other-adult pending closure gap; stale403/fresh409 recovery UX; already-booked advisory eligibility; historical status/report labels; unchanged27 diagnostics rather than global typecheck success; local journal initial-directory/fsync/Windows ACL and failure-domain limits.

Scheduler-owned gap reconciliation and sustained-outage alert, independent revocation/key destruction/restore, hosted durability and historical-prefix rollback detection remain owning-module gates. G-E01 infrastructure, G-E02 provider/model/context/bounds, G-E03 privacy/policy, G-E04 offer/continuation/post-ready policy, G-E05 measured cap/coverage/support and G-E06 real reviewed content remain unresolved. G-E04a is resolved only in DECISION-033's explicit scope. Sending a counsel packet is not clearance. No real data, consent wording, payment, spending, generation, publication, messaging, provisioning, deployment or public admission is authorized or claimed.
