# Synthetic production submission contract

CODEX-04-B · stage family · authored 2026-11-13. This is a source-drafting record. Authored verification statements describe intended checks before execution; exact controller REPORT entries and independent review evidence govern subsequent actual outcomes. No feature acceptance or public readiness is claimed here.

## Authority and compatibility

Approved task CODEX-04-B, supplied approved-copy blob `14e79c18f53e81f2832564214576a0762f21bbe2`, ordinary accepted 04-A/03-B/01-B dependencies, and the current owner-approved staged response transport bound this work. Shared engineering v1.2 SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79` supplies ADR-E02/E05, WM-04 receipt and capacity boundaries, household-first consent fencing and independent durability. DECISION-033 resolves provisional submission holds and submission-time trial eligibility. It does not select a public offer, cap or provider. The supplied stage-1 schema/journal and stage-2 service/HTTP/client/recovery tests remain unchanged.

The current source reads the accepted access.withSession, capture.question and real entitlement kernel; UI disabling is not authorization or accounting. Public demos, routes, package configuration, accepted migrations and protected tests are outside this stage's edits. Production-bound correction, cancellation, clarification and alternatives remain 04-C; the saved-only correction controls remain capture-owned. No human publication or readiness feature is introduced.

## Exact transport

All four POST paths are under `/adult/production/`: eligibility, submit, status and reconcile. Same-origin cookie, Host/Origin/identity guards, strict JSON and the existing 4096-byte production body bound apply. Wonder capture retains 65536 bytes. Responses use no-store and no-referrer. No fixtures, configuration, seeds or raw question endpoint are added.

Production selection is exactly `{view_context,child_id,profile_version}`. Legacy family.read remains exactly `{view_context,child_id}`; callers must not add profile_version to it.

Eligibility body is `{selection,wonder_id,wonder_version}`. Eligible projection is exactly `{status:'eligible',offer_version,consent_epoch,scope_version}`. Other recognized advisory statuses are ineligible, quota_full, no_capacity and configuration_missing, with only status. This is not a booking.

Submit body is `{selection,command}`. Command is exactly `{contract_version:'1.1.0',record_type:'submit',command:'SubmitProduction',idempotency_key,child_id,wonder_id,wonder_version,consent_epoch,offer_version,scope_version}`. It carries no question/context, timestamps, units, bucket, period or capacity. Own data snapshots are taken before awaits by the supplied client/service. Receipt timestamps cannot be supplied by a browser.

Status body is the production selection itself. Response is `{status:'production_status',pending:[{idempotency_key,wonder_id,wonder_version}],writes_closed}`. Pending references are restricted to the current authorized actor/child/epoch, with original provenance preserved. Reload recovery uses this server-returned key, not client command reconstruction.

Reconcile body is `{selection,idempotency_key}`. It recovers an existing fact and never applies a new production command. Current session, consent and child/profile checks still apply. Same actor and unchanged epoch may recover an older recorded profile under a current profile selection; another adult or reconsent cannot adopt the command.

Acknowledged common result has only contract_version, record_type, command, command_id, idempotency_key, status, aggregate_version, receipt, primary_commit_id and durability_ref. command_id is a server identity and may differ from idempotency_key. Receipt has only receipt_id, request_id, booking_id, claim_id, period_id, original_received_at, original_due_at and deadline_interval_seconds. No capture-specific state, synthetic_only, production_ready or acknowledgement_scope fields are added to the common result. The local banner and trusted environment/configuration carry the synthetic boundary.

Unacknowledged and benign failure results have only the seven common non-receipt fields. They contain neither receipt nor durability fields. Auth/malformed errors remain generic HTTP errors. Changed-payload conflict does not create another booking.

## Transaction and clock

Current verified issuer/session/household, latest active TEST-v1 consent and exact child/profile/source precede command disclosure. The saved source must be latest, capture-owned and acknowledged. It stays the same logical request; no request clone or raw auto-save is created.

Lock order is household/consent, child/source/request, entitlement/period/claim, then global configured bucket. Current-authorized same-key duplicates precede fresh eligibility/time/quota/capacity tests. Fresh submission serializes actual allowance and global capacity, sets original_received_at once, applies one real pending kernel hold, inserts one core capacity_reservations row and mapping, immutable receipt and encrypted primary-committed command fact in one transaction. Any new failure rolls back all production effects and retains the existing acknowledged saved-only source.

Capacity registry configuration is trusted, immutable, TEST-CAPACITY-v1 and synthetic_only. A missing or changed configuration fails closed. The mapping binds receipt.booking_id to actual capacity_reservations.reservation_id. Global admission counts mapped core rows whose state is booked OR completed under the bucket lock. Released frees live capacity; completed remains historical calendar usage and does not create a new slot. This is distinct from pending allowance, accepted reservation and consumed allowance. claim_id permanently references the actual composite household/request/period claim through the immutable receipt's foreign key.

After locks, sample actualNow. Canonical receipt is floor(actualNow/1000)*1000. BOTH actualNow and canonical receipt must be within the selected period and bucket half-open intervals; coverage must include canonical receipt plus 86400000 milliseconds. Fractional opening without a representable valid whole second is explicitly ineligible, with no automatic deferred request. Recheck actual time before transaction completion. Times are exact four-digit-year UTC `YYYY-MM-DDTHH:MM:SSZ`; due is precisely 86400 seconds after receipt. Legacy family projection retains `.000Z` formatting for the same instant. No equality rule between those wire strings is imposed.

Clarification, acceptance, retries, later lifecycle state and a different current configured bucket cannot rewrite original receipt/command/period/claim/booking. DECISION-033 preserves a valid pending submission's eligibility through expiry; fresh expired work is rejected. An authorized duplicate or reconcile bypasses fresh time/offer/capacity predicates while validating the original fact.

## Durability and recovery

Primary commit alone is not Received. After its transaction ends, the dedicated branded production journal appends the exact encrypted COMMITTED fact, fsyncs and authenticates a reopened read. Then fresh authorization persists the matching acknowledgement marker. No journal IO occurs inside the actor transaction. Family saved-only/request/ready projections suppress primary-only production rows.

The journal uses production-journal.log with a namespace manifest, framed sequence/MAC chain and household-key encryption. Opening validates all frames immediately, including a corrupt tail. It exposes records(household_id), fact(sealedRecord), append/reconcile and close. fact authenticates/decrypts the original common command, exact receipt, trusted adult and immutable provenance. Plain raw question/context/receipt times must not appear in the physical log. Wrong/missing keys, namespace change, corruption and missing acknowledged coverage quarantine rather than truncate or mint a replacement identity. Existing primary command facts and acknowledgement markers are immutable.

Post-primary append failure returns retryable_unacknowledged without receipt. Same-key retry or explicit reconcile backfills once, without another hold/booking or clock reset. A dropped first reply is unknown, even when no pending response reached the browser. After close/reopen, 25-hour expiry, renewed actual adult session and a different current bucket, status plus reconcile must return that original receipt and project overdue. Current authorization still applies. Later reserve/consume/completed state does not invalidate the original immutable fact.

This is local single-process filesystem recovery, not multi-host locking, an independently hosted failure domain, approved deletion/key destruction or disaster recovery. WM-01/WM-13 scheduler reconciliation and sustained-outage operator alert remain unresolved integration gates. Key-management/privacy/restore obligations from the architecture review remain with their authorized modules.

## Family interaction

The acknowledged capture list supplies separate Review production request controls. Review repeats the selected child's exact words and separate parent context and performs an advisory eligibility read. Confirm production request is the only new production action. It snapshots one command/key in RAM before awaiting anything. No question text is sent to production.

No capacity/quota/ineligibility creates a hidden queue. The parent can explicitly Keep saved-only wonder. A successful acknowledgement clears obsolete capture saved-only messaging before refreshing actual family content, so Received is not accompanied by a false claim that nothing was requested. Receipt and due time display in local time with timezone and seconds. Original overdue status stays visible; no revised estimate is invented.

Unknown submission outcomes retain the first intent and expose Retry original production request. Temporary family access hiding removes private DOM while retaining scoped RAM. Reload discovers pending keys through authenticated status and offers Reconcile pending production. Neither path asks the parent to reconstruct a command or creates a replacement key. Confirmed sibling/profile/context/consent changes reset intent and fence late responses. Generic session denial clears child content and requires explicit selection after renewed access. Offline controls pause without claiming confirmation. No URL, localStorage, sessionStorage or other persistent browser state stores private input.

Saved-only create/correct, existing exact introduction, saved plays, previous tries, continuation and allowance views remain. Production and capture writes are mutually paused while an uncertain operation needs recovery. No new child component import, start-play action, payment, sending or automatic production occurs.

## Authored verification and remaining evidence

The authored integrated tests exercise actual React sources through real HTTP, accepted adult/consent/setup/capture, migrated PGlite and real journals. They cover save/submit separation, first-reply intent retention, exact retry, pending reload/reopen/status/reconcile, no-capacity saved-only recovery and late sibling/withdrawal responses. The supplied recovery suite exercises different-household last-slot and different-sibling last-unit concurrency, child-specific periods, fractional clock boundaries, authorization/session loss, rollback faults and real released/completed core-state capacity behavior. The extra stage-family source-shape assertion is structural and is not substituted for those real lifecycle tests.

Controller verification must run all existing protected probes, new production probe, app tests/build, route/private scans and the compiler-version/digest-bound baseline comparison. A preserved 27-diagnostic baseline is not a whole-project typecheck pass. Real independent review and all eight source-bound native scenarios remain required: phone/keyboard confirmation; save/submit separation; no-capacity saved-only; original clock/duplicate; pending reload/reconcile; expiry/allowance; sibling/withdrawal/late replies; existing capture/progress. DOM tests do not establish narrow-phone layout, accessibility compliance or native behavior. See exact appended controller REPORT/review evidence for actual outcomes rather than treating this authored list as execution evidence.

Real provider, public offer, privacy/retention, measured capacity/support, deployment, sending, spending and family-admission gates remain closed. No synthetic test establishes learning or throughput.
