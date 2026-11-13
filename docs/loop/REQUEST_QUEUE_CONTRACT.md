# Request queue — local synthetic contract

CODEX-04-C, screens-and-complete-journey authored candidate, 2026-11-13. Controller execution, native browser evidence and whole-card independent review remain required. This document does not report a test pass or technical acceptance.

## Authority and scope

Approved CODEX-04-C exact execution specification blob `1ea2e0beef82994870e0d880aa8fba4bd826b4a8`, DECISION-032/034, LOOP-POLICY-001 and the bounded staged-recovery grant govern. Ordinary 04-B and 01-C acceptance is recorded in the supplied pinned records. Engineering v1.2 / APPROVAL-004 SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`: WM-04, ADR-E01/E02/E05, household-before-consent/domain locks, immutable production identity, privacy-compatible immutable history and independent committed evidence apply. DECISION-033 supersedes acceptance-time expiry: an originally eligible submission may be accepted after its original trial ends, without extending that trial or charging again.

No generation, consumption, assignment, publication, delivery or sending is implemented here. Founder support updates are DRAFT/sent=false. No provider, public offer, real capacity/coverage, privacy value, price, renewal term or real-family policy is selected.

## Service construction and domains

`createSyntheticRequestQueue({env,db,auth,access,capture,kernel,journal,keys,clock,policyVersion})` uses actual accepted access/capture/kernel adapters and migration 012. Queue keys are exactly trusted `keyForHousehold(h)` and `keyForOperator()` methods returning separate stable 32-byte material. Existing strict consumers receive only household keys. The operator key is never derived from household identity, session material or source text.

`createSyntheticQueueJournal({env,directory,keys,testHooks?})` exposes `seal`, `append`, `records`, `fact`, `close` and stable `namespace_verifier`. `records` accepts a household UUID or literal `operator`. Exact module fact fields are format, scope, household_id, consent_epoch, record_id, command_id, primary_commit_id, actor_id, actor_kind, original_session_hash, recorded_at, aggregate_version, canonical_digest, namespace_verifier, command, result, effect. Format is queue-committed-fact-v1; operator has null household/epoch 0/founder actor. Private recursive JSON is bounded and encrypted; outer envelopes contain only binding IDs and cryptographic metadata.

`append` confirms `queue-fsync:<record_id>` only after encrypted committed bytes are fsynced, reopened, authenticated and compared. Identical authenticated facts deduplicate; changed same identity conflicts. Failed beforeAppend appends nothing. Wrong key/corrupt tail quarantines without truncating or replacing evidence. Local ownership/path/link checks and exclusive-process directory ownership apply. Windows ACL setup, local directory-entry fsync limitations and same-device failure domains preclude hosted/independent disaster-recovery claims.

## SQL and private payload bindings

All new tables have primary keys. No old migration is changed.

| Table | Binding |
| --- | --- |
| queue_journal_namespace | singleton; set-once namespace_verifier |
| queue_requests | household_id/request_id PK; child_id, receipt_id, original_source_scope_version anchor immutable original production/capture records through composite cascading FKs |
| queue_commands | household_id/command_id PK; request_id, actor_id/kind, original_session_hash, consent_epoch, aggregate_version, recorded_at, canonical_digest, namespace_verifier, record_id, primary_commit_id, sealed_record; transactional PRIMARY-COMMITTED outbox |
| queue_scopes | household_id/request_id/scope_version PK; previous_scope_version, kind, command_id, record_id, payload_ref; scope 1 original, successors correction/alternative |
| queue_history | household_id/request_id/aggregate_version PK; command_id, record_id, scope_version, agreement_version, state, breach_observed, payload_ref |
| queue_acknowledgements | household_id/command_id PK; record_id, primary_commit_id, durability_ref, acknowledged_at |
| queue_intake_lock | singleton global lock; no family payload |
| queue_operator_commands | command_id PK; actor_id, original_session_hash, aggregate_version, paused, recorded_at, record_id, primary_commit_id, canonical_digest, namespace_verifier, sealed_record |
| queue_operator_acknowledgements | command_id PK; record_id, primary_commit_id, durability_ref, acknowledged_at |

References are `queue-fact:<record_id>`. `fact.effect.snapshot` is the current private request snapshot; `effect.history` is the single attributed server transition; `effect.scopes[String(scope_version)]` is introduced scope content. Operator `effect.intake` contains version, paused and encrypted reason. Questions/context/interpretations/answers/proposals/correction/history payloads and results never become plaintext SQL/journal metadata. Deferred constraints require corresponding committed history and real scoped references. Privacy deletion cascades are compatible with immutable updates being prohibited.

## Exact service and HTTP interfaces

Family selection is exactly `{view_context,child_id,profile_version}`. It is non-authorizing; actual session/household/active TEST-v1 consent/epoch/profile/child/request binding is checked server-side.

- `familyRead(token,{selection,request_id})` → `{status:'request_status',request}`.
- `familyCommand(token,{selection,command})`.
- `familyStatus(token,{selection})` → `{status:'queue_status',pending:[{command_id,request_id}],writes_closed}`.
- `familyReconcile(token,{selection,command_id})`.

Family command fields are command_id, request_id, expected_version, consent_epoch, action and payload. Actions: AnswerClarification `{answer}`; CorrectRequest `{question,parent_context}`; AgreeAlternative `{scope_version}`; CancelRequest `{reason}`. Parent context can be null or bounded text. Unknown fields, unsafe objects/accessors and changed same-key data fail.

Founder command adds household_id. Actions: RequestClarification `{message}`; ProposeAlternative `{interpretation}`; AcceptRequest `{scope_version,agreement_version}`; DeclineRequest `{reason}`; PrepareLateUpdate `{message,revised_estimate}`. Revised estimate must be canonical Date.toISOString UTC and strictly future at authoritative server validation.

- `founderRead(token,{filter})` → `{status:'queue',requests,intake:{version,paused,reason}}`. Filters all/received/clarification/alternative_pending/accepted/overdue/terminal.
- `founderCommand(token,command)`.
- `readIntake(token)` and `setIntake(token,{command_id,expected_version,paused,reason})`.
- Household recovery uses founderStatus `{household_id}` / founderReconcile `{household_id,command_id}`.
- Operator recovery uses founderStatus `{scope:'operator'}` / founderReconcile `{scope:'operator',command_id}`.

`requireFounder` is a locator only. Actual enabled founder role, exact supplied token_hash, expiry and revocation are checked in the transaction and again before result return. Current authorization precedes duplicate replay. Parent sibling/wrong-household/stale-epoch and withdrawn access cannot read or replay private facts.

HTTP endpoints: `/adult/queue/{read,command,status,reconcile}` and `/founder/queue/{read,command,status,reconcile,intake,intake-read}`. Intake-read POST accepts `{}`. Optional queue factory arguments preserve old routes/factories when absent. Strict origin/header/cookie/body guards, duplicate-key rejecting JSON, no-store/no-referrer/CSP and explicit 127.0.0.1 listeners remain. Founder assets `/founder/queue`, `.js`, `.css` are imported only on an actual authorized GET. Static assets contain authored UI, never private fixture data.

## Results, recovery and clocks

AcceptRequest ACK remains exact common 1.1.0: contract_version, record_type, command, command_id, idempotency_key, status, aggregate_version, receipt, primary_commit_id, durability_ref. It is not the internal encrypted fact. Receipt retains receipt_id/request_id/booking_id/claim_id/period_id/original_received_at/original_due_at/deadline_interval_seconds=86400. No new booking, source identity, period or clock is minted.

Other action ACK fields: status, command_id, action, request_id, aggregate_version, primary_commit_id, durability_ref. Intake omits request_id. Primary-only response is retryable_unacknowledged without receipt/primary_commit_id/durability_ref. Validation/conflict/denial throw mapped HTTP400/409/403. Reads suppress primary-only state. Same-key reconciliation appends the stored committed fact, reauthenticates it and rechecks current authority before acknowledgement; it never reapplies domain work.

Accept uses the actual pending→reserved kernel transition in the same outer transaction as queue state/history/outbox. Pre-ready decline/cancel releases pending or reserved unconsumed allowance and the actual mapped booked capacity once. Already consumed/completed/assigned paths fail closed pending their owning policy. Parent agreement alone neither accepts nor consumes. Replacing a proposal or correcting scope invalidates agreement and fit. Original capture source/payload/production replay remain immutable.

`question` is always original child words. `current_question`, `interpretation`, scope_kind/version, agreement and attributed history remain separate. Trusted `project(tx,{household_id,request_id,child_id,consent_epoch})` integrates family projection. `currentScope` additionally takes scope_version and exposes explicit original/current question, interpretation, source scope, agreement and fit; stale/unagreed/terminal scope fails. It explicitly says generation_implemented=false. Capture.question receives only its real original payload_ref/version, never a fabricated queue scope.

Overdue/breach is measured against ORIGINAL due time; revised_estimate and support DRAFT remain alongside it. Terminal cancellation does not erase a previously observed breach. No clarification, decline, agreement, acceptance or draft is called delivered.

Persisted intake pause blocks fresh bookings only: eligibility is ineligible with reason intake_paused; fresh SubmitProduction is existing common no_capacity without receipt. Already committed original retries precede pause, quota and expiry checks. Saved capture and existing acceptance remain separate.

## Browser behavior

`createQueueClient` snapshots strict command bodies before awaiting, validates bounded own-data results and checks command/result/receipt bindings. It reads the existing `/adult/consent` projection for a real active epoch before familyRead; the queue read then validates the selection's current context server-side. The client-added consent_epoch is a UI transport projection, not an extra service wire field.

The actual React status component is colocated in LoopFamilyHome to preserve existing accepted Node TSX loaders, and re-exported by LoopRequestStatus.tsx. It renders original/current words separately, history, clarification, exact-version alternative agreement, correction, cancellation and late DRAFT/estimate. Family-home old capture, introduction, saved-play, allowance and continuation flows remain. Queue mutation hides other child details until a fresh check. Unknown replies retain one exact command in RAM. Reload recovery uses actor/child-scoped pending references. Abort plus generation/sequence/selection guards reject late sibling/withdrawal responses. No private browser persistence, URLs, telemetry or logs are introduced.

Founder UI uses native labelled controls, textContent rendering, positional row choices, keyboard focus, responsive stacking, 44px controls and visible status/alert text. It can pause/resume persisted local intake, select booked requests, clarify/propose/accept/decline and prepare late drafts. Saved-only capture is clearly separate. Unknown replies preserve exact RAM intent. Household recovery references are opaque manual controller input when the queue listing cannot be disclosed because durability is pending. No recovery reference enters URLs or persistence.

These authored layouts are not native accessibility or responsive verification evidence.

## Known integration seams and required controller disposition

1. The completed production service returns paused eligibility `{status:'ineligible',reason:'intake_paused'}` while the accepted production-client strict negative validator accepts only `{status}`. That older file is outside this stage's owned paths. It currently fails closed with generic eligibility-unavailable copy; do not call paused production UX verified or silently relax the contract. Controller must resolve this exact client/service seam within authorized scope before whole-card acceptance. No new result enum is proposed.
2. founderRead can fail closed on a household primary-only fact before returning household recovery references. The founder page supports an explicitly supplied opaque recovery reference, and the same-page intent retains its known household. Automatic recovery discovery after reload remains constrained by the service API; another actor's pending commands must not be exposed.
3. Real multiconnection PostgreSQL contention, multi-host locking, hosted independent recovery, historical-prefix rollback detection, key destruction/deletion/restore and sustained-outage scheduler/operator alert are not established by PGlite or local fsync.

Carry accepted 04-A/03-C/04-B findings: generic precommit-outage wording; other-adult pending closure/reconciliation gap; historical headers and 27 existing type diagnostics; stale403/fresh409 recovery nits; already-booked advisory eligibility; local single-connection/serial promise proof limits. Corrected household-first integrated paths do not establish production deadlock freedom.

## Verification handoff

Authored full journeys use real React sources, real HTTP/auth/consent/setup/capture/production/queue, migrated PGlite, actual kernel accounting and encrypted journal reopen. They cover save versus submit, clarification/correction, original/current separation, alternative replacement/agreement invalidation, acceptance after original expiry, late DRAFT/breach, reserved and pending cancellation, first reply loss/reload/reconcile, pause/saved-only behavior and held sibling/withdrawal responses. They do not generate or publish a game or establish the later full product release journey.

Controller must save exact source, run all app tests/build, protected queue plus all11 prior probes, compare the unchanged27 diagnostic baseline with the fixed compiler (NOT global tsc PASS), and verify76 public route identities/private source/build scans. Then execute actual source-bound scenarios: phone-keyboard-queue; original-question-and-clock; clarification-and-correction; exact-alternative-agreement; decline-cancel-release; late-update-draft; intake-pause-existing-request; pending-retry-and-authority. Attach exact source/head, commands, exit status and observed outcomes before whole-card Claude review (maximum3) and exact-head merge. No intermediate acceptance is authorized. Missing evidence is not PASS.

Real data/consent, providers/models/spending, offers/payment/renewal, measured cap/support, generation/content review/publication, sending, provisioning, deployment and admission remain gated. G-E04a is resolved only in DECISION-033's scope.
