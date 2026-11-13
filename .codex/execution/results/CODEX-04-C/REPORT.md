# CODEX-04-C service-and-hosts — attempt 2 of 2

2026-11-13 · Codex · Synthetic local only. Seven complete source outputs returned. No files were written, no checks/tests were run, and no installation, commit, API/external action, model/settings change, sending, spending, provisioning or deployment occurred. Controller owns saving, exact hashes and actual verification. Preserve attempt 1, its reported syntax failure, all three original unsuccessful calls, stage-1 evidence and persisted counters. No stage acceptance, feature-review pass or merge is claimed; whole-card review maximum remains three.

## Repair and source reading

The reported attempt-1 failure was an illegal awaited default parameter in the authored test helper. `book(supplied)` now performs the awaited save inside its body. Source review also added explicit selected-child binding before family same-key replay/reconciliation/acknowledgement, transaction-end founder revocation assertions, an actual withdrawal callback during journal append, and clarification/late-DRAFT assertions. Queue row comparisons normalize the trusted recorded_at column before comparing immutable rows. No test or probe was weakened.

Prior applicable full original reading remains attributable to attempt 1: inline authority/contracts, architecture, task, F06/O02, accepted 04-B handoff, actual schema/journal/kernel/auth/host/family/production source and protected queue probe; additional actual reads of adult access, consent, setup, capture, journal primitives, applicable migrations, accepted recovery tests and pinned current decision/acceptance records. Attempt 2 reread current request-queue, authored recovery tests and both hosts, including the relevant tail of queue source. It did not restart unrelated history. Truncated broad output is not claimed as full historical reading. Available authority is the pinned local snapshot; no live-main freshness, source hash recomputation or Git-cleanliness claim is made.

Engineering v1.2 / APPROVAL-004 SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`; WM-04, ADR-E01/E02/E05, household-first consent fencing, immutable receipt/source identities and independent committed evidence govern. DECISION-033 allows acceptance after trial expiry for a submission originally eligible; it does not extend the trial or create a charge.

## Actual SQL and encrypted payload bindings

No migration or prior journal is changed. All queue tables use the actual migration-012 names:

- queue_journal_namespace(singleton,namespace_verifier): set-once journal binding; never replace an established namespace.
- queue_requests(household_id,request_id,child_id,receipt_id,original_source_scope_version): original source/receipt anchor with composite cascading privacy references.
- queue_commands(household_id,command_id,request_id,actor_id,actor_kind,original_session_hash,consent_epoch,aggregate_version,recorded_at,canonical_digest,namespace_verifier,record_id,primary_commit_id,sealed_record): immutable household PRIMARY-COMMITTED outbox.
- queue_scopes(household_id,request_id,scope_version,previous_scope_version,kind,command_id,record_id,payload_ref): append-only original/correction/alternative lineage, starting at queue scope 1 independently of capture numbering.
- queue_history(household_id,request_id,aggregate_version,command_id,record_id,scope_version,agreement_version,state,breach_observed,payload_ref): one immutable state/history version per committed queue command.
- queue_acknowledgements(household_id,command_id,record_id,primary_commit_id,durability_ref,acknowledged_at): independent durable acknowledgement marker.
- queue_intake_lock(singleton): global serialization only.
- queue_operator_commands(command_id,actor_id,original_session_hash,aggregate_version,paused,recorded_at,record_id,primary_commit_id,canonical_digest,namespace_verifier,sealed_record): separate operator outbox.
- queue_operator_acknowledgements(command_id,record_id,primary_commit_id,durability_ref,acknowledged_at): separate operator durability marker.

Private command/result/snapshot/history/scopes/intake reason live only in the exact encrypted queue fact. `effect.snapshot` contains current private state, `effect.history` one attributed server event, and `effect.scopes[String(scope_version)]` introduced scope payloads. References are queue-fact:<record_id>. Original context remains an opaque bound capture payload reference; corrected context is encrypted queue content. History is assembled from immutable facts rather than accumulated into every fact. Aggregate version starts at 0 before the first mutation; first mutation atomically materializes anchor, command, original scope 1 and any successor, and matching history. SQL deferred/history/scoped FK/version guards remain intact.

## Interfaces for stage 3

Factory: createSyntheticRequestQueue({env,db,auth,access,capture,kernel,journal,keys,clock,policyVersion}). Queue receives exact keyForHousehold/keyForOperator methods; old strict-key capture/production consumers continue receiving household-only adapters. Separate operator material is never derived from family identity/token/source.

Founder APIs: founderRead(token,{filter}), founderCommand(token,command), readIntake(token), setIntake(token,{command_id,expected_version,paused,reason}). Filters: all, received, clarification, alternative_pending, accepted, overdue, terminal. Household recovery: founderStatus(token,{household_id}), founderReconcile(token,{household_id,command_id}). Operator recovery uses {scope:'operator'} and {scope:'operator',command_id}.

Family APIs: familyRead(token,{selection,request_id}), familyCommand(token,{selection,command}), familyStatus(token,{selection}), familyReconcile(token,{selection,command_id}). Selection remains exact view_context/child_id/profile_version. Status returns queue_status, writes_closed and actor/child-scoped safe pending command/request references. Existing action command and payload shapes are preserved.

AcceptRequest ACK is exact common production result 1.1.0, including original receipt/primary_commit_id/durability_ref and no internal-fact fields. Other action ACKs contain status, command_id, action, request_id, aggregate_version, primary_commit_id, durability_ref. Intake omits request_id. Primary-only results are retryable_unacknowledged and omit receipt and durability/primary references. Validation/conflict/denial throw typed 400/409/403 errors. Latest primary-only private state is not exposed as acknowledged; reads fail closed until recovery.

Trusted project(tx,{household_id,request_id,child_id,consent_epoch}) supports optional family-space integration. currentScope(tx,{household_id,request_id,child_id,consent_epoch,scope_version}) separates original question, current parent question, interpretation, queue scope and immutable capture source version. It rejects stale/unagreed/terminal scope and explicitly marks generation unimplemented. It is a reader, not generation authorization. Actual capture.question always receives its real original version/payload_ref. Queue scope is never fabricated as a capture source. Assignment/play text remains pinned.

Hosts preserve old factories/routes when queue is absent. New endpoints are /founder/queue/{read,command,status,reconcile,intake,intake-read} and /adult/queue/{read,command,status,reconcile}. Founder intake-read POST requires {}. New routes retain strict duplicate-rejecting JSON, origin/header/cookie checks, no-store, CSP and explicit127.0.0.1 listener. UI GET dynamically imports actual stage-3 queuePage/queueScript/queueCSS only when requested; no eager absent module or placeholder page exists.

## Transactions, recovery and invariants

Founder requireFounder result is a locator only. Actual enabled founder identity and exact supplied token_hash, expiry and revocation are checked under transaction locks and rechecked before return, including original-result replay. Family commands use actual access.withSession, current policy/epoch/profile/context and request-selected-child binding. Household lock precedes consent/profile/request/kernel/resource locks. Retry loops retain the original command identity for serialization/deadlock errors.

Migration-012 production uses actual issuer-table authentication with issuer -> global intake -> household -> account/session -> consent/domain ordering. SetIntake takes founder authentication then that global lock, with no household locks. Existing committed production retries precede pause, fresh CAS/period/capacity checks. Paused fresh eligibility is ineligible with intake_paused reason; fresh SubmitProduction is existing no_capacity without receipt. Pending operator durability closes fresh bookings; saved capture, existing acceptance and play remain separate.

Actual kernel.apply pending->reserved or pending/reserved->released shares the outer transaction with queue history/outbox/scopes and mapped booked-capacity release. Receipt/request/period/claim/booking/original-source identities and original +86400-second deadline never reset. Reaccepting a reviewed successor preserves its reserved claim. Consumed/completed/assigned paths fail closed; no invented refund or readiness/generation/publication/delivery is created. Parent exact-version agreement is distinct from acceptance; replacement/correction invalidates previous agreement/fit. Clarification answer is not substitution approval. Late support remains DRAFT/sent=false with canonical future estimate and original breach retained.

After primary commit, append the exact stored sealed committed fact independently, read/reopen and authenticate it, recheck current authority, then insert acknowledgement. Same-key recovery never reapplies domain effects. Unknown/missing authenticated coverage quarantines. In-memory serialization remains local-process support only.

## Verification status and carried limits

Authored tests cover actual PGlite, HTTP and encrypted-journal fixtures: after-expiry acceptance once; primary-only reopen/reconcile; exact common result keys; unchanged production replay; correction original/current lineage and capture/family-space integration; replaced agreement invalidation; sibling read/replay/reconcile denial; stale rollback; pending/reserved release; pause recovery; wrong operator key with byte preservation; HTTP origin/no-store; wrong exact session, disabled/role/revoked/expired founder; in-transaction founder revocation and consent withdrawal; withdrawal during independent append; clarification and late DRAFT/breach. These are authored assertions, not executed results.

Controller must run syntax/application tests and protected queue probe plus all11 old probes on these exact saved sources. Stage 3 must then complete actual screens, two full journeys, all app tests/build, cumulative12probes, unchanged27diagnostic comparison (NOT globaltscPASS),76route identities/private scans and eight actual source-bound browser scenarios BEFORE whole-card Claude review and exact-head merge. No intermediate acceptance is permitted. Missing evidence is not PASS.

Carry accepted 04-A/03-C/04-B findings: local PGlite/single-process serialization does not prove real PostgreSQL multiconnection bucket contention, hosted recovery or multihost deadlock freedom; generic precommit-outage wording, other-adult pending recovery closure, stale403/fresh409 recovery UX, advisory already-booked eligibility and historical report/typecheck limitations remain visible. Household ordering is corrected in the integrated paths, without claiming untested production contention proof.

Local journal ownership/ACL/fsync/Windows directory-entry limits, same-device failure domains, historical-prefix rollback detection, independent revocations/key destruction, deletion/restore and sustained-outage scheduler/operator alert remain owning-module gates. G-E01/02/03, provider/offer/continuation/privacy values, measured capacity/support, real content and public release/admission remain open; G-E04a is resolved only within DECISION-033. No real data, consent policy, messaging, AI spending, generation, publishing, provisioning or deployment is authorized by this result.
