# REVIEW-JOURNAL-01 — synthetic journal adoption hardening

Source candidate, 2026-11-14. Actual controller checkpoints and platform limits are below; this document is not feature acceptance.

This narrow follow-up uses shared architecture v1.2, SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`, especially ADR-E04/E05: independent authenticated history, refusal of unverifiable recovery, immutable evidence and consent fencing. Planning authority remains `rasnag/Curiosity-Loop`; this document does not replace its architecture.

The exact application base is `a18d82e3f4802871102e2979286e81c6406d20e4` (cost PR27). The supplied planning setup source is `cd78f2ba3558b975288fbc1744a977a2b2d0151a`, independently reviewed in setup-r3, followed by setup PR87 merge `98cecf82e8af80b166cf53bddc92ba30d03ad81d`. The local branch reference was read as `agent/review-journal-01` at the application base. These are filesystem-inspected snapshot records; this author did not run git validation or refresh remote main.

## Persisted boundary

`review-namespace.json` contains exactly `format`, `namespace_verifier`, `directory_path`, `directory_identity`, `log_identity`, `marker_identity` and `mac`. Format is `review-journal-v2`. The MAC covers the canonical body excluding `mac`; canonical JSON plus one newline is required. Each identity is a decimal `dev:ino` string from bigint filesystem metadata. The resolved absolute directory path is also authenticated so renaming an otherwise untouched directory does not silently make a portable restore.

Marker and log descriptors are opened without following links where the platform supplies O_NOFOLLOW. Bigint fstat identities are compared with bigint pathname identities before use and again after inspection. Directory ancestors, realpath, final directory identity, exact directory entries, regular-file type, single-link count, bounded sizes and POSIX ownership/mode boundaries are checked. Windows ACL ownership and exclusive single-process storage remain prerequisites; this code does not provision or certify ACLs. File IDs never pass through Number. Conversion of a validated size to Number is solely for a bounded read buffer.

Fresh creation first obtains the accepted delegate's namespace and log identity. Marker creation is exclusive. Its own fstat identity is obtained BEFORE MAC computation or writing. The complete marker is fsynced; descriptor/path identities and the authenticated marker are checked before returning. On supported non-Windows platforms the directory is also fsynced. Failed or incomplete creation is preserved as evidence, not automatically erased or retried as a fresh namespace.

Existing stores are authenticated before opening the queue delegate. Malformed JSON, duplicate/extra fields, noncanonical encoding, truncated marker, wrong MAC/key, unbound format, missing files and substituted identities quarantine without rewriting evidence. Ordinary filesystem errors are retryable `journal_unavailable`; observed missing/retyped paths and authenticated-state failures are integrity failures. Delegate errors retain the accepted public vocabulary.

Every data operation verifies the boundary and causes the unchanged delegate to authenticate its entire hash chain and encrypted facts. The wrapper serializes its own operations and drains them before close. Known integrity failure is sticky for that instance, including after the original pathname is restored. A NEW instance may reopen the legitimately restored original. Close releases resources and zeros tracked derived buffers even after compromise; integrity-only failure does not make fixture teardown reject. Close is not an adoption or recovery operation.

The one-use fresh-namespace capability cannot reset an existing journal. A duplicate logical claim still returns `recovery_quarantined`, but that denial occurs outside the integrity latch and leaves an otherwise healthy journal usable. No cost command grammar is added. The accepted `review-local-01` derivation and its actual NUL separators are unchanged, as are the queue's AEAD, fact validation, hash-chain, fsync and append idempotency.

## V1 compatibility boundary

V1 was the previously accepted disposable synthetic prototype. Its acceptance and history remain intact. Existing v1 bytes quarantine unchanged under v2: no migration, reset, relabelling, deletion, fresh namespace or live v1 adoption path exists. The pinned old reader means ONLY `server/review-journal.mjs` in git at baseline `a18d82e3f4802871102e2979286e81c6406d20e4`. The new test constructs the genuine old marker MAC using the actual review derivation inside the test. Fresh disposable fixtures create v2 stores.

This is an explicit local compatibility boundary, not a loss-free migration, production restore, portable backup, external key adapter or key-management capability. Filesystem identity is not a substitute for independent durable storage capabilities or protection against arbitrary privileged concurrent mutation.

## Interfaces and invariants retained

`createSyntheticReviewJournal({env,directory,keys,testHooks?})`, branding, `namespace_verifier`, `claimFreshNamespace`, `seal`, `fact`, `append`, `records` and `close` retain their existing roles. No service, public API, route, domain command, encryption algorithm, migration, browser client or page changes are proposed.

The unchanged review service owns primary command transactions, current household/consent/founder/request/profile/generation authority and ACK/materialization. Independent append occurs outside its transactions. Primary-only intent remains retryable and unacknowledged; original-key recovery must backfill exactly once. A sealed fact's intended result is not an ACK. Current authority and matching independent durability remain necessary before private projection or materialization. Real TEST consent withdrawal must prevent ACK and subsequent private reads/recovery.

## Evidence boundary and carried limits

The committed bigint root probe is recorded RED on the baseline: identical marker bytes on a different inode were adopted and its quarantine assertion failed. Its pinned probe blob is `8576e1fb873baa9af3e855fde06f517a3f6cc2b5`, LF SHA-256 `76be74c4756a98195f86cc83c975b4c3e9dfa97cd31daced0193ee0061828d15`. Raw evidence remains in planning `.agent-loop/review-marker/committed-probe-bigint-baseline-red.log` and `.json`. This is attributed existing controller evidence, not an execution by this author. Candidate GREEN is pending.

The new tests author empty/populated marker/log/directory copy refusal; intact-directory relocation refusal; original restoration; sticky in-process compromise; real wrong-key facts; genuine v1 MAC; malformed/extra/noncanonical/truncated inputs; missing/unexpected entries; supported symlink/hardlink cases with explicit capability skips; full cost/non-cost table hashes and disk preservation; unchanged service reopen, immutable TEST history, original-key replay, append outage, append/close interleaving and real TEST withdrawal. They use the existing review fixture and its actual PG/auth/generation/review/journal services. No browser automation or manufactured service-success flags are introduced.

Root still owns exact clean-base/path validation, complete mandatory reading, source-bound checks/proof, independent probes, actual feature review and native browser evidence. Native scenarios are `legitimate-write`, `original-recovery`, `fresh-authorized-history` and `withdrawal`, bound to journal/service/page/client/auth runtime blobs. Screenshot and owned runtime cleanup belong to that later run. No literal zoom or prior-runtime browser result is claimed here.

Full 05-A/05-B/05-G remain OPEN. Same-household post-reconsent recovery remains unproven behind accepted child-profile epoch adoption. At 64 absence markers a new unknown UI intent cannot be dismissed in-page and requires reload; existing healthy operations remain available. All upstream generation limits/findings, provider/offer/privacy/capacity gates, factual/human/scientific sign-offs, production restore/key capabilities and release restrictions remain unchanged. Known 27 global type diagnostics are not a global typecheck pass. No real data, provider calls, spending, actual publication, assignment, delivery, provisioning, deployment or public exposure is authorized by this candidate.

## Controller checkpoint — implementation attempt2, before full exact-source checks

The drafting labels above describe the original read-only bundle. The controller actually ran39 new cases:35 passed,2 failed,2 skipped. Both failures were test-harness issues: genuine-v1 expected key ordering, and Windows EPERM before an active-directory move could occur. Attempt2 corrected the expected field ordering and added the independently setup-r4-reviewed Windows capability boundary. A focused rerun of those2 cases had1 pass (genuine-v1 rejection) and1 explicitly SKIPPED active-directory case; no failure. Runtime code was unchanged by attempt2. Coding attempts1/2 remain counted; no reset.

Windows app-side in-process directory-identity mismatch is NOT EXERCISED. The actual rename was denied by Windows; the test then proved unchanged directory identity, disk bytes/full primary rows and a real successful original read before reporting SKIPPED. The2 symlink cases also reported SKIPPED for EPERM. These are not passed capability tests. Actual empty/populated closed-store directory substitution/relocation and live marker/log replacement passed in the39-case run; hardlink cases passed. The later exact-source full run must verify all remaining cases again and disclose its pass/skip/fail counts.

Controller code inspection (not an executed Windows directory-trigger test): verify calls readMarker, whose paths/inspectLog invoke checkDirectory before and after inspection; checked invokes verify before/after each data operation and latches recovery_quarantined into broken. No restoration path clears broken. The independent feature reviewer must confirm this through EOF and retain the platform limitation.

Root setup-r4 reviewed source3532ec70 (full source in its attributed JSON), PR88 merge18b67d357751ea0f0164c96c36ca5ec730f6bdee, passed this explicit bounded evidence choice. Earlier setup1–3 and native coding1/controller coding2 evidence remains preserved. No full-card acceptance, actual human/privacy/science approval or production restore is supplied.

Final exact-source full-suite counts and raw command results are attached externally and verbatim in the actual feature review's controller_checks and the planning partial-result receipt. This source checkpoint records only the executions already observed above and does not pre-claim a future full run, native result or feature PASS. The source-bound external evidence is the completion record; historical drafting statements are not that record.
