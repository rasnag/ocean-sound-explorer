# Request queue — local synthetic contract

CODEX-04-C screens-and-complete-journey, authored revision2, 2026-11-13. Supplied controller revision1 output:111 tests,109 pass,2 fail before either journey ran, because its founder fixture requested an unsupported48-hour session. This revision uses the actual one-hour maximum and real fresh login after the late-time advance. No revision2 execution or technical acceptance is claimed.

## Authority and boundaries

Exact task execution blob `1ea2e0beef82994870e0d880aa8fba4bd826b4a8`, DECISION-032/034, LOOP-POLICY-001 and the bounded staged-recovery grant apply.04-B/01-C accepted prerequisite records remain authoritative. Engineeringv1.2 / APPROVAL-004 SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`: WM04, ADR-E01/E02/E05, household-before-consent/domain locks, immutable source/receipt identity and independently durable committed evidence govern. DECISION-033 permits acceptance after trial expiry for an originally eligible submission; it creates no extension or charge.

No generation, consumption, assignment, revision, publication or sending occurs here. Late updates are DRAFT/sent=false. No live policy, price, allowance, renewal term, provider, cap or coverage is selected.

## Actual data and journal bindings

No earlier migration, journal or completed service is changed by this stage. Every new table has a primary key. Composite original request/receipt/source references cascade for privacy removal; immutable-update guards still permit deletion.

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

`effect.snapshot` contains current private state; `effect.history` one attributed transition; `effect.scopes[String(scope_version)]` introduced lineage; operator `effect.intake` contains version/paused/reason. References are queue-fact:<record_id>. Original context remains an opaque bound capture reference; corrected context lives encrypted in queue facts. No question/context/interpretation/answer/proposal/correction/history/result plaintext is added to SQL or physical journal metadata.

Factory: `createSyntheticQueueJournal({env,directory,keys,testHooks?})`; exact keys are trusted stable32byte keyForHousehold(h) and distinct keyForOperator(), with no household fallback. Methods: seal/append/records/fact/close; namespace_verifier is stable hex64. records accepts UUID household or literal operator.

Exact committed fact fields: format, scope, household_id, consent_epoch, record_id, command_id, primary_commit_id, actor_id, actor_kind, original_session_hash, recorded_at, aggregate_version, canonical_digest, namespace_verifier, command, result, effect. Format queue-committed-fact-v1; operator has null household/epoch0/founder actor. Bounded private recursive JSON is authenticated and encrypted. Outer envelopes expose binding IDs and cryptographic metadata only.

append returns queue-fsync:<record_id> after actual durable committed bytes, fsync/reopen/authentication. Identical facts deduplicate; changed identity conflicts. beforeAppend failure appends nothing. Wrong key/corrupt tail quarantines without truncation or replacement. Exclusive-process directory ownership, path/link checks and Windows ACL setup apply. Local fsync is not hosted independent disaster recovery, key-destruction verification or multihost locking.

## Service and transport

Factory: `createSyntheticRequestQueue({env,db,auth,access,capture,kernel,journal,keys,clock,policyVersion})`. Old strict consumers retain household-only adapters; queue alone receives the separate operator key.

Family selection is exactly `{view_context,child_id,profile_version}`. APIs:

- familyRead(token,{selection,request_id}) → {status:'request_status',request}.
- familyCommand(token,{selection,command}).
- familyStatus(token,{selection}) → {status:'queue_status',pending:[{command_id,request_id}],writes_closed}.
- familyReconcile(token,{selection,command_id}).

Family command fields: command_id,request_id,expected_version,consent_epoch,action,payload. Actions: AnswerClarification{answer}; CorrectRequest{question,parent_context}; AgreeAlternative{scope_version}; CancelRequest{reason}. parent_context is null or bounded text.

Founder command additionally has household_id. Actions: RequestClarification{message}; ProposeAlternative{interpretation}; AcceptRequest{scope_version,agreement_version}; DeclineRequest{reason}; PrepareLateUpdate{message,revised_estimate}. Estimate is canonical Date.toISOString UTC and strictly future at the server.

Founder APIs:

- founderRead(token,{filter}) → {status:'queue',requests,intake:{version,paused,reason}}; filters all/received/clarification/alternative_pending/accepted/overdue/terminal.
- founderCommand(token,command); readIntake(token); setIntake(token,{command_id,expected_version,paused,reason}).
- founderStatus(token,{household_id}); founderReconcile(token,{household_id,command_id}).
- Operator recovery uses {scope:'operator'} and {scope:'operator',command_id}.

HTTP paths remain `/adult/queue/{read,command,status,reconcile}` and `/founder/queue/{read,command,status,reconcile,intake,intake-read}`. Intake-read POST accepts {}. Existing cookie/origin/header/strict duplicate-rejecting JSON/body/no-store/no-referrer/CSP/127.0.0.1 guards apply. Founder assets `/founder/queue`, `.js`, `.css` dynamically import only on actual authorized GET. No private data is embedded in static assets. Old factories/routes remain when queue is absent.

Actual founder enabled role, exact supplied session token_hash, expiry and revocation are checked inside transactions and before return; requireFounder is only a locator. Family actual withSession/current TEST-v1 consent/epoch/context/profile/child/request binding governs. Current authorization precedes duplicate replay. Client IDs and UI controls confer no authority.

## Results, lineage and recovery

AcceptRequest ACK is exact common1.1.0: contract_version,record_type,command,command_id,idempotency_key,status,aggregate_version,receipt,primary_commit_id,durability_ref. Receipt contains receipt_id,request_id,booking_id,claim_id,period_id,original_received_at,original_due_at,deadline_interval_seconds=86400. No internal-fact fields are substituted.

Other action ACKs: status,command_id,action,request_id,aggregate_version,primary_commit_id,durability_ref. Intake omits request_id. Primary-only returns retryable_unacknowledged with no receipt/primary_commit_id/durability_ref. Validation/conflict/denial throw HTTP400/409/403. Unknown or malformed replies are never success. Client validation now requires the common result whenever AcceptRequest was requested, and parentheses explicitly separate operator versus household pending-reference validation.

Accept converts the existing actual pending claim to reserved once in the same outer transaction as history/scope/outbox. Pre-ready decline/cancel releases pending/reserved unconsumed allowance and actual mapped booked capacity once. Consumed/completed/assigned paths fail closed pending owning policy; no refund is invented. Parent agreement is distinct from acceptance. Replacing a proposal/correcting scope invalidates agreement/fit. Original capture/production/receipt/claim/booking/period identities never change.

`question` is exact original child words; current_question and founder interpretation remain separate with immutable versioned history/provenance. Trusted project(tx,{household_id,request_id,child_id,consent_epoch}) supports family projection. currentScope adds scope_version and exposes explicit original/current/source/agreement/fit bindings with generation_implemented=false. It rejects stale/unagreed/terminal scope. capture.question receives its actual original bound payload_ref/version, never a queue scope fabricated as capture input.

Primary commit is insufficient for ACK. Service independently appends the stored encrypted committed fact, reopens/authenticates evidence, rechecks current authority and records ACK. Same-key recovery does not reapply domain work. Missing evidence is pending or quarantined.

Persisted intake pause blocks fresh production only: advisory eligibility is ineligible with reason intake_paused; fresh SubmitProduction is existing no_capacity without receipt. Committed retries precede pause/expiry/quota checks. Saved capture and original submitted acceptance remain separate.

Overdue uses the ORIGINAL deadline; late DRAFT and revised estimate remain additional records. Cancellation does not erase a previously observed breach. Clarification/agreement/acceptance/decline are never labelled delivered.

## Browser behavior and revision2 repairs

createQueueClient snapshots exact bodies before awaiting; validates bounded own-data response trees, receipt/key/result bindings and actor-scoped pending references. It reads real `/adult/consent` before familyRead; the subsequent queue read authorizes the current selection context. Its consent_epoch addition is an internal UI projection, not a change to the service wire.

The actual F06 component is colocated in LoopFamilyHome and re-exported by LoopRequestStatus.tsx to preserve accepted existing Node TSX loaders without editing old tests/dependencies. It renders original/current words, interpretation, clarification, exact-version agreement, correction, cancel, history, original deadline/breach and separate estimate/DRAFT. Existing capture/continuation/allowance/introduction/saved-play flows remain.

RAM intent is fixed before awaiting. First-reply loss keeps the exact command; reload uses actual status/reconcile references. Status rechecks preserve a specific unknown-reply message instead of overwriting it. Read and status cursors are distinct, polling is sequential, editing is not erased on successful same-context polling, and hidden/offline/scope changes fence old responses. Abort is supplemented by generation/selection guards. No private persistence/URL/log/telemetry is introduced.

Founder UI uses labelled native controls, textContent, positional row choices, visible status/alerts, 44px targets, responsive stacking and keyboard focus. Forbidden acceptance states stay disabled after general control updates. A conflicted intent can be discarded only after actual checked scopes have no pending writes. Pagehide clears private DOM/RAM, and pageshow resumes current authorization checks. Unknown reply never becomes accepted/delivered.

Revision2 authored journeys use supported one-hour founder sessions, actual fresh login after the24-hour clock advance, and allow recovery mounting without falsely waiting for hidden acknowledged home content. Teardown unmounts React/clears founder timers before closing hosts/database. Physical journal scans replace the previous meaningless missing-path assertion. Founder actions are exercised through actual served page/script DOM controls and real HTTP, in addition to client assertions. These are authored improvements, not executed outcomes or native accessibility evidence.

## Integration limits requiring controller disposition

1. Completed production-service paused eligibility returns `{status:'ineligible',reason:'intake_paused'}`. Accepted production-client permits only `{status}` for negative eligibility. That file is outside this stage. It fails closed with generic unavailable copy. Do not claim paused production UX passes, invent a result enum or silently relax a contract; controller must resolve this seam in authorized scope before whole-card acceptance.
2. Founder listing can fail closed on a household primary-only fact before exposing its recovery reference. Same-page intents retain the known household; the UI also accepts an explicitly supplied opaque controller UUID after reload. Automatic discovery and another actor's pending-command recovery remain constrained by the service API. No private metadata bypass is added.
3. PGlite/serial promises prove neither real PostgreSQL multiconnection contention nor hosted recovery/multihost deadlock freedom. Historical-prefix rollback detection, independent revocations/key destruction/restore and sustained-outage scheduler/operator alert remain owning-module gates.

Carry04-A/03-C/04-B findings: generic precommit-outage copy; other-adult pending closure; stale403/fresh409 recovery UX; already-booked advisory eligibility; historical headers; unchanged27 diagnostics rather than global tsc PASS; local initial-directory/fsync/Windows ownership limits. Corrected integrated household-first locking does not establish untested production contention proof.

## Required actual verification

Supplied revision1 result is111 tests/109 pass/2 fixture failures. Revision2 has not run. Controller must save all exact source and run all app tests/build, protected queue plus all11 old probes, fixed compiler comparison against known27 diagnostics (NOT global tsc PASS),76 public route identities and private source/build scans. Then run actual source-bound scenarios: phone-keyboard-queue; original-question-and-clock; clarification-and-correction; exact-alternative-agreement; decline-cancel-release; late-update-draft; intake-pause-existing-request; pending-retry-and-authority. Attach exact head/source/commands/exit status/observations before whole-card Claude review(max3) and exact-head merge. No intermediate acceptance; missing evidence is not PASS.

G-E01/02/03, offer/continuation/post-ready policy, measured cap/coverage/support, real reviewed content, providers/spending/sending/provisioning/deployment/admission remain gated. G-E04a is resolved only in DECISION-033's exact scope. No counsel packet is clearance and no synthetic fixture is real-family evidence.
