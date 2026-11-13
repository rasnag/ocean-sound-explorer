# Synthetic production submission contract

CODEX-04-B · stage family · revision 2 · authored 2026-11-13. Authored verification statements are pre-execution expectations. The supplied controller output for revision 1 reported 99/101 tests passing with two family-stage UI failures. This revision proposes fixes; it has not been run by the drafting agent. Exact controller REPORT/review evidence governs actual subsequent outcomes. No feature acceptance or public readiness is claimed.

## Authority and compatibility

Approved task CODEX-04-B, supplied approved-copy blob `14e79c18f53e81f2832564214576a0762f21bbe2`, accepted ordinary 04-A/03-B/01-B dependencies and owner-approved staged transport bound this work. Engineering v1.2 SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79` supplies ADR-E02/E05, WM-04 receipt/capacity boundaries, household-first consent fencing and independent durability. DECISION-033 resolves provisional holds and submission-time trial eligibility without selecting a public offer, cap or provider. Stage-1 schema/journal and stage-2 service/HTTP/client/recovery tests are unchanged.

The accepted access.withSession, capture.question and entitlement kernel remain authoritative. UI controls do not enforce accounting or authorization. Public demos, route/package/configuration files and earlier-stage sources are outside this bundle. Production correction, cancellation, clarification and alternatives remain 04-C; saved-only correction stays capture-owned. No publication, assignment readiness or sending feature is introduced.

## Exact transport

Four POST paths are `/adult/production/eligibility`, `/submit`, `/status` and `/reconcile`. Existing same-origin cookie, Host/Origin/identity guards, strict JSON and 4096-byte production body bound apply. Capture retains 65536 bytes. Responses are no-store/no-referrer. No browser configuration, fixture, seed or raw-question endpoint exists.

Production selection is exactly `{view_context,child_id,profile_version}`. Legacy family.read stays exactly `{view_context,child_id}`.

Eligibility body is `{selection,wonder_id,wonder_version}`. Eligible response is exactly `{status:'eligible',offer_version,consent_epoch,scope_version}`. Recognized negative advisory responses have only status: ineligible, quota_full, no_capacity or configuration_missing. Eligibility never books production.

Submit body is `{selection,command}`. Command is exactly `{contract_version:'1.1.0',record_type:'submit',command:'SubmitProduction',idempotency_key,child_id,wonder_id,wonder_version,consent_epoch,offer_version,scope_version}`. No raw question/context, receipt/due, units, period, bucket or capacity is accepted. The supplied client/service snapshot own data before awaiting.

Status takes production selection directly and returns `{status:'production_status',pending:[{idempotency_key,wonder_id,wonder_version}],writes_closed}`. Pending references belong to the current authorized actor/child/epoch. Reconcile takes `{selection,idempotency_key}`; reload uses the server-returned key without rebuilding a command. Current session/consent/child/profile authorization remains required. Recovery under a newer current profile preserves the same actor and unchanged original epoch/provenance; another adult or reconsent cannot adopt the fact.

Acknowledged common result has only contract_version, record_type, command, command_id, idempotency_key, status, aggregate_version, receipt, primary_commit_id and durability_ref. command_id can differ from idempotency_key. Receipt has only receipt_id, request_id, booking_id, claim_id, period_id, original_received_at, original_due_at and deadline_interval_seconds. No capture state, synthetic_only, production_ready or acknowledgement_scope is added. Local banner/environment/consent/configuration preserve the synthetic boundary.

Unacknowledged and benign mutation failures have only the seven non-receipt common fields, with neither receipt nor durability fields. Malformed/authentication errors remain generic HTTP errors. Changed-payload conflict never creates a second booking.

## Transaction and clock

Current verified session/issuer/household, active latest TEST-v1 consent and exact child/profile/source precede disclosure. Source is latest, capture-owned and acknowledged. Production reuses its logical request rather than cloning or silently saving browser text.

Lock order is household/consent, child/source/request, entitlement/period/claim, global bucket. Current-authorized same-key duplicates precede fresh time/eligibility/quota/capacity. Fresh transaction sets original_received_at once, applies one real kernel pending hold, inserts a core capacity reservation plus mapping, immutable receipt and encrypted committed fact. Failed new attempts roll back production effects while preserving the existing saved-only source.

Trusted capacity configuration is immutable TEST-CAPACITY-v1/synthetic_only. Missing/changed configuration fails closed. receipt.booking_id is the actual core reservation_id. Admission counts mapped core rows in booked OR completed state under the global bucket lock. Released frees live capacity; completed remains calendar usage. claim_id is bound through the immutable receipt to the actual composite household/request/period claim. Pending claim, accepted reservation and consumed allowance are distinct.

After locks sample actualNow; canonical receipt is floor(actualNow/1000)*1000. Both actualNow and canonical receipt must lie in the period and bucket half-open intervals; actual coverage must include canonical receipt plus86400000 milliseconds. Fractional opening without a representable valid second returns explicit ineligible, without automatic deferral. Recheck actual current time before transaction completion. Wire times are four-digit-year UTC `YYYY-MM-DDTHH:MM:SSZ`, due exactly86400 seconds later. Legacy family `.000Z` timestamps represent the same instant and are not reformatted for string equality.

Later acceptance/clarification/retry/lifecycle changes and a different current bucket cannot rewrite original command/receipt/period/claim/booking. DECISION-033 preserves an eligible pending submission across trial expiry. Authorized duplicate/reconcile validates the original fact without fresh time or capacity admission.

## Durability and recovery

Primary commit alone is not Received. Outside its actor transaction the branded production journal appends the exact encrypted COMMITTED fact, fsyncs and verifies reopened authenticated bytes; fresh authorization then persists the matching acknowledgement marker. Family saved/request/ready projections suppress primary-only production rows. No journal IO is performed inside the actor transaction.

production-journal.log has a namespace manifest, framed sequence/MAC chain and household encryption. Opening validates all frames immediately, including corrupt tails. records(household), fact(sealedRecord), append/reconcile and close expose trusted recovery operations. Decrypted fact contains original common command, exact receipt, adult and immutable provenance. Raw question/context/receipt times must not appear in physical log bytes. Wrong/missing keys, namespace loss/change, corruption or missing acknowledged coverage quarantine without truncation or replacement identity.

Post-primary append failure is retryable_unacknowledged without a receipt. Same-key retry/reconcile backfills once without another hold/booking or clock reset. First-reply loss remains unknown even if no pending response reached the browser. Recovery after journal reopen,25-hour delay, renewed actual adult session and different current bucket must retain original receipt and show overdue. Later reserve/consume/completed state does not invalidate the original fact.

This is local single-process filesystem recovery, not multi-host locking, hosted independent durability, approved journal erasure/key destruction or disaster recovery. WM-01/13 scheduler reconciliation and sustained-outage alert remain unresolved. Architecture key-management/privacy/restore findings remain with owning modules.

## Family interaction and revision-2 corrections

Acknowledged capture sources have a separate Review production request action. Review repeats exact selected child/words and separate parent context, then reads advisory eligibility. Confirm production request alone starts a new production mutation. One exact intent/key is assigned in RAM before awaiting the first reply; raw text is never submitted to production.

Acknowledged save/correction now closes the completed capture editor. It no longer leaves an empty open editor disabling production review. This preserves the existing enabled-review assertion rather than weakening the test. Capture and production clients, plus family and continuation clients, resolve current global fetch per call so remounted sessions do not retain an obsolete fixture transport. This changes no endpoint, authorization rule or persistence behavior.

No capacity/quota/ineligibility creates a hidden waitlist. Keep saved-only wonder is explicit. Starting production removes obsolete capture saved-only success messaging; acknowledgement refreshes actual projections. Receipt/deadline are local absolute timestamps including timezone/seconds. Overdue preserves the original clock and invents no revised estimate.

Unknown first replies retain intent with Retry original production request. Pending status supplies reload reconciliation keys. A status refresh preserves the more specific message for an existing in-memory uncertain intent; it still updates the authoritative pending list and writes_closed state. Temporary access hiding removes private DOM while keeping scoped RAM. Confirmed sibling/profile/context/consent changes clear it and fence late replies. Session denial clears selection. Offline pauses confirmation. No private state enters URLs or persistent browser storage.

Existing saved-only create/correct, exact introductions, saved plays, previous tries, continuation and allowances remain. Uncertain operations pause conflicting capture/production writes. No new TSX child import, start-play, payment, messaging or automatic generation is added.

## Verification evidence and remaining work

Historical supplied revision-1 controller log:101 tests,99 pass,2 fail. The first family UI test timed out because acknowledged capture left opened=true and production review disabled. The second reused cached module clients holding the preceding fixture transport; source inspection identifies that mechanism, and this revision uses late-bound transport. These diagnoses and proposed repairs are not revision-2 execution results.

Integrated tests use real React sources, HTTP, accepted adult/consent/setup/capture, migrated PGlite and journals. They retain first-reply loss, exact retry, pending suppression, reopen/reload/status/reconcile, no-clone and no-capacity assertions. Save helper additionally asserts editor closure. Held-reply test waits for the actual server result to be held and verifies a real acknowledgement before switching siblings, so it tests late delivery rather than just request initiation.

The previous structural capacity assertion is replaced by a real service/kernel/SQL lifecycle test: book the only slot, deny a second request, release the real pending claim/core booking, accept the second, mark its real core booking completed as a trusted capacity-only fixture, then deny a third eligible source and preserve original duplicate receipts. It asserts physical mapped states and absence of third production effects. Setting completed alone does not claim assignment readiness, publication or human approval. The unchanged stage-2 recovery suite additionally covers distinct-household last-slot and sibling last-unit races, child-specific periods, fractional boundaries, rollback and session/privacy fences.

Controller must rerun exact candidate tests/build, protected probes, production probe, route/private scans and compiler-version/digest-bound baseline comparison. Retaining27 existing diagnostics is not whole-project typecheck PASS. Independent Claude review and eight native source-bound scenarios remain: phone/keyboard confirmation; save/submit separation; no-capacity saved-only; original-clock/duplicate; pending reload/reconcile; expiry/allowance; sibling/withdrawal/late replies; existing capture/progress. React DOM tests do not establish native layout, accessibility compliance, learning, capacity or release readiness. Consult exact controller REPORT/review evidence for outcomes appended after this authored revision.

Real provider, public offer, privacy/retention, measured capacity/support, spending, sending, provisioning, deployment and admission gates remain closed.
