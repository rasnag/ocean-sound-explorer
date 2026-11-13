# Proposed synthetic continuation contract

Version 0.2, 2026-11-12. Response-only source proposal. Not installed, executed, reviewed, accepted or activated.

Authority: shared engineering architecture v1.2, registered SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79; ADR-E02/E05, WM-03, common00B command/durability contract, DECISION-033 submission-time eligibility and DECISION-041 synthetic-only exception. Native engineering handoff is reference, not architecture authority. The owner's corrected committed-fact protocol supersedes its intent-first recommendation.

## Three boundaries

1. Primary transaction authenticates the current actual founder token under explicit identity then exact-session locks; takes adult issuer singleton, household, latest TEST-v1 consent, current profiles, continuation and resource locks; inserts the new entitlement, immutable period, immutable encrypted command/provenance and one aggregate version increment. acknowledged=false. There is no grant acknowledgement marker. All effects roll back together.
2. After that transaction successfully commits, the service independently appends the exact encrypted COMMITTED period/command fact. It fsyncs the file and reopens/verifies the complete authenticated sequence. No journal I/O occurs inside an actor transaction.
3. A final fresh-authority transaction rechecks the currently supplied founder identity/session/role/enabled/expiry, current household consent epoch and current profiles, revalidates the same primary fact and inserts an immutable durability acknowledgement marker plus the command acknowledgement flag. This marker attests verified journal evidence; it is not another source grant or aggregate increment.

A primary-only period is NON-USABLE. Family projection excludes recognized TEST-CONTINUATION-v1 rows without a matching same-household/period/entitlement/policy/current-consent marker and acknowledged owning command. Kernel lockPeriod denies those rows before readAllowance or apply, including direct raw-period attempts. Those consumers perform no journal I/O: their trusted marker attests previously verified evidence, following the existing command/durability boundary.

If journal append fails, return retryable_unacknowledged/confirmation_pending only after reauthorization. No grant or usable allowance is returned. New commands are closed while the journal is unhealthy or a household command remains pending. Founder context exposes this closure. Reconciliation is explicit and uses the original key, period, entitlement, actor, epoch, source snapshot, recorded timestamp and original session verifier. It does not recreate periods, claims, production receipts, bookings, assignments, consumption or messages.

A currently valid fresh founder session may reconcile an already PRIMARY-COMMITTED fact for the SAME original founder identity and unchanged active consent epoch. The original session need not remain valid forever; its verifier and provenance remain immutable. Different identity, demotion/disable, invalid current session, withdrawal or old-epoch setup denies reconciliation. Unknown commit outcome requires exact-key lookup, never automatic replacement UUID generation.

## Authentication and locking

requireFounder is an initial locator, not mutation authority. Each committing founder transaction explicitly locks identity, then the exact supplied token-hash session. Both initial and immediately pre-commit expiry checks apply. It then locks adult_access_throttle, household, latest consent and current profiles in child-ID order. Continuation namespace/account/commands precede entitlement rows in entitlement-ID order and period rows in period-ID order.

No continuation path acquires founder_auth_throttle. Existing login retains throttle → identity → newly inserted session; logout locks only the session it updates. No founder authentication code is modified. Adult status uses actual access.withSession and the existing family view-context derivation with child/current-profile checks. No actor transaction nests another actor transaction or journal I/O.

The local PGlite adapter serializes its connection. Ordered boundary tests can establish before/after state and that journal pauses release the connection. They cannot establish multi-connection PostgreSQL lock races, deadlock behavior or production isolation equivalence. Concurrent server-row-lock evidence remains a future gate.

## Synthetic data and policy

Exact command version test-continuation-1, policy TEST-CONTINUATION-v1, synthetic_only=true, provenance invented-payment-record. Explicit canonical UTC millisecond timestamps and safe positive allowance are required. New recording requires start <= server time < end. No future scheduling, implicit duration, trial activation misuse, overlap, allocation migration, mixed allocation or carryover is allowed. Adjacent intervals are permitted. Existing recognizable synthetic trial policy shape fixes allocation mode; unknown/mixed shape fails closed.

Only TEST-CONTINUATION-[32 lowercase hex] is accepted as the invented reference. No free text, amount, currency, bank/card data, contact, URL, renewal or actor fields are accepted. Complete own-data snapshots precede awaits. Accessors and proxies are rejected without executing their traps. New HTTP routes reject decoded duplicate JSON keys, invalid UTF-8, compressed/oversized bodies, forwarded identity headers and unsafe origins/hosts/cookies.

Same actor/household/key exact retry follows current authorization but precedes fresh CAS, overlap, time or new-write closure checks. Changed payload conflicts. A stable global injected fixture HMAC key deduplicates references across households and actors. Its immutable namespace verifier prevents a surviving primary from silently accepting a new key namespace. Per-household injected keys encrypt the complete recovery fact and key command digests. Keys never enter HTTP, browser bundles, repository source, logs or the primary database.

Original 03-A/03-B policies, public function signatures, trial intervals, claim identities and submission-time eligibility remain unchanged. Existing assignment/open/resume logic is preserved. Continuation grants no capacity, review, production-submission or delivery authority.

## UI and routes

Optional founder mounting uses the existing createSyntheticAuthServer continuation option. Password/TOTP/login/logout, loop_session cookie and explicit loopback listen behavior remain. Protected GET /founder/continuation and .js provide a deliberate invented-only form. POST context, record, status and reconcile routes use exact bodies and current real founder authentication. No seed/token/fixture-authority HTTP route exists. After reload the founder deliberately supplies the original key or reads their pending keys through context.

Optional adult POST /adult/continuation/status uses loop_adult_session and returns only a scoped status envelope: none, confirmation_pending, recorded_active, recorded_expired or unavailable. It returns no receipt, founder, session verifier or journal material. The original /adult/family wire contract remains; its existing policy_version is represented in the UI type. Recognized confirmed rows receive truthful test-continuation labels. Unconfigured status does not block accepted family data or claim payment. Late child/session/context responses are fenced. Existing capture component remains in the same family component; no additional child TSX import or main routing change is proposed. Private browser storage and identity-bearing URLs are absent.

## Recovery and limits

This is a dedicated continuation journal, never capture or gameplay financial authority. Its authenticated sequence detects changed records, middle corruption, sequence gaps, truncated tails and same-key changed records. Reopen checks file identity and encrypted payload authenticity. A matching immutable primary record is required before appending; prepared/rolled-back intent is never appended as a success.

The journal supports bounded single-process/single-host recovery evidence only. A separately supplied directory on one host does not establish independent hardware failure domains, hosted replication, RPO/RTO, multi-process writer safety or production disaster recovery. Directory ownership/ACL setup and key lifecycle are prerequisites. Key destruction and independent current revocation/deletion replay remain privacy/infrastructure obligations; this proposal does not claim to implement those systems.

Missing primary/journal coverage quarantines the scope rather than replaying a guessed source grant. No automatic full-loss restoration endpoint is supplied. A future isolated restore must apply independently current revocations/deletions/key destruction before exposure and restore authenticated committed facts with original identities; it must never rerun consumption. That release capability remains gated.

## Verification status

All proposed new tests, migration/checksum checks, existing 77 prototype tests, build/type/scope/privacy scans, native browser checks, multi-connection race tests and Claude review are NOT YET RUN. Tests are source proposals, not observed evidence. Actual original progress/open regressions remain covered by the unchanged existing suites and must be run on the future exact materialized candidate. No pass, acceptance, deployment or readiness is claimed.

Open gates include human privacy/policy review, provider/infrastructure capability, real payment/offer/renewal arrangements, capacity/support, final feature/setup gates, exact execution profile, actual checks/native verification/Claude review and public admission. No real data, spending, sending, provisioning or public access is authorized by this bundle.

## Explicit command authentication status contract
Founder continuation POST context/record/status/reconcile use generic403 for absent, malformed, expired or non-founder loop_session, including an adult-cookie-only request. This domain-command denial does not change the actual founder verifier: GET founder pages/assets retain401 for absent/invalid sessions and403 for authenticated non-founder roles. Required operator and adult status routes are supplied; injection of the optional service into legacy hosts is a compatibility option, not omission of this card’s required controls.
