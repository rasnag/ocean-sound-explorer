# REVIEW-LOCAL-01 stage3 source-bundle report

Codex · 2026-11-14 · response-only candidate, not accepted.

Returned exactly three complete proposed files: `tests/loop-review-ui.test.mjs`, `docs/loop/REVIEW_LOCAL_SLICE.md` and this report. No filesystem writes, tests, build, install, browser session, commit, push, permission change, runtime edit, old-test change, protected-check change or status/approval update occurred. Root-owned `tests/loop-review-service.test.mjs` was read and reused unchanged.

DECISION-043 / APPROVAL-010 authorizes only the partial local review lifecycle. Full CODEX-05-A, CODEX-05-B and CODEX-05-G stay OPEN and no dependency unlock follows. Architecture engineering v1.2 SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79` governs, especially ADR-E03/04/05/06 and the exact household consent, lock, immutable revision and independent journal invariants. The available approved design's SHA-256 was recomputed and matched; full textual reading is a separate obligation.

## Source attribution

Planning authority is the supplied local checkout at `C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation`. Live planning main freshness was not independently verified. The approved review proposal source is commit `57aa37a2eb778c7f4848919161f569b5778eb8bc`, blob `de979426353a32b0bcceefc69ddde16e24d737d4`; APPROVAL-010 governs its copied historical proposal labels. Architecture provenance names source commit `a676dd1fcab9c1a92d954c1805ffdfab2109736d`, blob `78df8cf2857c0b32222a442329778cf43e8b05ee`, and shared pinned reference commit `ac8a063b1d0d382c3108d2dc50572a0c4eb707b2` is supplied by application AGENTS. Application generation baseline is `d62051ff46e665b0e42a4e2c6b05c80bbb7e4e41`; prior reviewed generation source `5662b3c0a267ad76e2df100cc0bb86b787637661` remains prior evidence only.

Read-only `git hash-object` returned these current file-content blobs, in path order:

| Path | Blob |
| --- | --- |
| server/review-service.mjs | 024dcc5f914261898e3ccb10c18c4ea5b33ff254 |
| server/review-journal.mjs | 0fe859248cbc131093234965f3bb79c1d5b8bc0c |
| server/review-page.mjs | b8ced77d3cae3c00ce4210f5ec7bf525d3793d1c |
| lib/loop/review-client.mjs | c03f10744a6277c732c5b6e41adf55d84d54eb1b |
| server/loop-auth.mjs | 9c4e1b57a6a889948c9ca449a5d2c3df695981ad |
| tests/loop-review-service.test.mjs | d76e3d73077a4c12b4d157e8291b7d02b3867106 |

These are source pins, not tested-runtime pins. `git rev-parse HEAD` was refused by dubious-ownership protection. No safe-directory configuration was changed. A direct `.git/HEAD` read names `agent/review-local-01`; exact current commit/clean worktree/merge ancestry is not claimed. The three response-only files have not been written or assigned verified Git blobs.

## Authored tests and boundaries

The UI suite uses the actual root `reviewFixture`, its actual generation fixture, real database/auth/accepted queue/generation/review services and independent journals. A separately owned `createSyntheticAuthServer` receives actual services through forwarding methods so journal/service reopen reaches the new instance. Login is performed over real HTTP with the fixture's real issuer credentials/TOTP and the returned HttpOnly SameSite=Strict cookie. No client-supplied authority flag or fake service creates permission.

Node `http.request` sends same-Origin loopback requests with `Connection: close`, no pooled disposable socket reuse and no generic network retry. JSDOM executes the actual served review script. Response JSON is parsed in its own window realm, with native AbortController/TextEncoder supplied. Storage access throws. Transport fault controls lose an actual completed response or hold the real host's response after service execution; they do not manufacture review/auth results.

Authored assertions cover optional host-route absence; strict Host/auth/duplicate JSON/duplicate headers/Origin/identity/encoding/body-size/no-store/CSP/no-publication routes; partial false checklists with exact missing keys and an all-true positive control; malformed evidence; pinned immutable release, original-key replay and distinct-key duplicate rejection; actual generation edit/regeneration invalidation; correction and append-only withdrawal; unsent choices/focus over multiple completed polls; lost independently acknowledged reply and primary-only journal outage with reopen/original-key explicit reconciliation; pending privacy and dependent-write refusal; actual append-time consent withdrawal; a held actual HTTP response after withdrawal; household/request/scope/profile/founder authority boundaries; hidden/pagehide clearing and stopped timers/requests; host closure and owned temporary-directory removal.

Review-only intervals compare complete canonical rows of every public non-`review_slice_*` table, including generation/content/publication/assignment/entitlement/capacity tables. Explicit generation edits/profile/auth changes get baselines outside those intervals. This complements the independent root probe; it does not establish whole-run protection against every hypothetical deferred write. Condition-based bounded waits fail with named conditions, without retrying a new command under a replacement identity. Teardown dispatches pagehide then unload and checks the polling timer/request shutdown; unload-only behavior is not independently proved.

The runtime API boundary is list/read/command/reconcile, with exact household/request/scope and command/revision/digest identities. Household-first transactions recheck real consent, founder/session, accepted request/profile and locked generation head/job/revision. Actual validated generation output is pinned against authoritative rows, not a copied private HMAC algorithm. Generation reads and independent journal append are outside transactions; authority and exact source are rechecked after append. Pending hides private projection, blocks dependent writes and retains original command identity. Separate encrypted review-domain journal/directory/authenticated namespace and fresh-namespace guard prevent adoption of wrong-key/replacement/empty-primary stores. Current application source owns these invariants; authored tests are not execution proof.

Snapshots/checklists/withdrawals stay in separate additive isolated TEST tables. No actual publication, assignment, delivery/player, capacity, entitlement/reservation or consumption transition is introduced. No real AI, real family data, actual scientific/human/content approval, spending, billing, provisioning, deployment or public access claim is made.

## Actual evidence versus required execution

Controller-provided prior evidence: independent root probe PASS at backend `fe767a5`, using actual PG/auth/queue/generation/journal and validating immutable lifecycle, original-key recovery and complete protected-row hashes. Earlier root service tests were 11/12 PASS; the remaining fixture nickname exceeded 24 characters, was corrected without a service change, and the focused two cases then passed. This author did not run those commands and does not relabel them as whole-candidate proof.

The local actual Claude setup-r2 record reports PASS at planning `36e35079f2b6a468e6bc24c5abb2dc3edaa156e5`, eight controller checks and full mandatory reading by that reviewer. Its r1/r2 history is preserved; no review was invoked here. This is setup evidence, not a feature PASS.

Not run at drafting time: this new UI suite, exact-source complete service/UI suite, npm test/build, cumulative 04-C checks, original generation probe, new review probe on this bundle, native CUA and feature reviews. All are CONTROLLER-REQUIRED. No test count, green result, build, visual verification or feature-review verdict is fabricated.

Required unchanged cumulative boundary: 12 protected probes; known 27 TypeScript diagnostics/32 lines, not a clean global typecheck; 76 route identities and private-output scans. Native CUA must exercise phone-keyboard, blocked-checklist, pinned-release, edited-invalidation, immutable-correction-withdrawal, pending-recovery, scope-boundaries and authority-withdrawal. Bind actual candidate commit/runtime blobs; carry-forward only for demonstrated identical runtime with explicit limitations, actual candidate smoke and independent reviewer judgment.

## Reading coverage and gaps

Complete reads claimed for this author: application AGENTS; planning AGENTS, GOVERNANCE and APPROVALS; engineering README/MODULE_GUIDE/provenance; approved 05-B card; approved review slice; review grant and supplied exact review spec; root-owned review-service test original; existing generation UI test; review page, strict client and founder host source, with follow-up sections for initially missing ranges. Review service/journal/migration and the actual generation fixture/helper section were directly inspected, including locked source binding, history, ACK/reconcile and cleanup mechanics. No full-file read of the entire generation implementation/provider stack is claimed.

Important incomplete/truncated coverage: PROJECT_CONTEXT through EOF; approved PRODUCT_V1 and PRODUCT_DECISIONS through EOF; full engineering design and REVIEW_NOTES; complete SOURCE_OF_TRUTH; full 00-B CONTRACTS and 00-C SCREEN_CONTRACT_MAP; complete generation contract/report/machine result; every original controller/checker file. Combined output truncation means requesting a raw file was not treated as successful full reading. Relevant portions, provenance and final acceptance notes were seen, but not every mandatory original line. The available engineering digest was verified without pretending that hashing supplies textual coverage.

Setup-r2 attributes its own full original reading. This author does not inherit that coverage or assign it to a future reviewer. Complete mandatory reading must be finished against current originals before feature PASS. If needed, use a small incremental final review within the permitted three feature rounds; do not hide a fourth round. This report is a source candidate with disclosed reading gaps, not a PASS recommendation.

## Reviewer-assigned cases and carried findings

Setup reviewer-assigned app cases remain to be executed and independently assessed: exact false readiness.missing plus all-true success; distinct-key duplicate release; blocked dependent writes; real consent withdrawal inside append; wrong-key/cross-domain/replacement/empty-primary fail-closed behavior; and source inspection for timers/unawaited/deferred non-review writes. The unchanged service-test original contains the storage/append/source/accessor cases; the new UI file adds transport and journey assertions. The basic independent lifecycle probe alone cannot prove these properties.

The setup-history Git guard is new to REVIEW-LOCAL-01 only; setup-r2 cites `test_setup_history_modification_and_deletion_refused`. This session did not execute it or inspect its full implementation. It does not retroactively repair the generation setup-history finding.

Carried generation findings stay OPEN: independent max_elapsed_ms ceiling is not enforced; reconciled StartMock lacks explicit never-started UI wording; failed validation remains generic; client character cap differs from server byte cap, with status-less client oversize error; journal domain label retains literal backslash-plus-zero compatibility; weaker invalid-limit error predicates/positive control; and historical setup-history/report limitations. Neither generation runtime nor existing tests were changed or silently credited with fixes.

After exact checks, complete reading, actual native CUA and actual independent feature PASS, the controller alone may invoke the existing guarded GitHub merge_result against exact branch/head/base, verify main merge ancestry and record a separate planning partial receipt. Preserve all original logs and consecutive feature r1..r3 records. No whole-card acceptance, status/authorization/graph/policy-exclusion change or closure of provider, offer, privacy, capacity or eligibility/expiry gates occurs here.

## Root actual verification checkpoint

All12committed service tests passed in36.842s, covering partially false keys, duplicate releases, exact source edits/regeneration, primary-only recovery/dependent-write blocking, append-time withdrawal and source races, malformed/proxy evidence, real founder revocation/expiry, wrong keys/cross-domain/replacement/empty-primary, and household/profile boundaries.

First HTTP/DOM run found new test-fixture defects: inherited f.fetcher routes /founder (without trailing slash) to the adult host, and UI request values are documented JSON arrays, not objects. Corrected the new test's default-home host lookup and option-id parsing. The first complete UI journey then passed. Missing-cookie responses use the existing founder verifier401, not403; corrected those new assertions without changing auth/runtime behavior. Original failure logs remain review-local/integrated-review-first.log and http-boundary-diagnostic.log. Full corrected UI/checks/CUA/feature review still required. No full card completed.

The corrected HTTP/DOM run passed the main exact-checklist/lifecycle/recovery/withdrawal journeys. Remaining failures were: existing disabled/expired founder verification returns401 (role demotion403), now reflected in the NEW tests; and one combined-run wait for refreshed source. The isolated unchanged-runtime unsent/source test passed with richer bounded failure diagnostics. The combined failure is preserved at ui-corrected-full.log and is not called fixed merely because isolation passed. A full corrected integration run remains required.

## Root candidate checkpoint —2026-11-14

The complete corrected new integration set passed28/28 tests in64.752s (integrated-review-corrected.log), including the previously timed-out source-refresh/unsent case. No runtime change was used to obtain this result; the new test fixture/HTTP expectations and diagnostics were corrected as recorded above. First failures remain preserved. Root read complete new migration/journal/service/client/page files in bounded sections and the host diff, plus full new test originals; full historical authority reading remains attributed to actual setupClaude r2 and must be independently established by feature review.

Controller will bind whole checks, actual native CUA and attributed feature review to the committed candidate; the final planning slice receipt is the authoritative technical result when those gates finish. This checkpoint claims focused real-service/HTTP/DOM evidence, not public/provider/content readiness or full-card completion.

Whole candidate check1 reached the unchanged cumulative04-C checker after successful test/build commands, then its consent_probe Node process exited3221226505 without an assertion report. The original full failure is retained at review-local/whole-candidate-checks-1.log. Running that identical protected consent probe directly on the same source passed (consent-probe-diagnostic.log). No old probe, checker, library, timeout, environment fence or production code was modified. This is an observed nonreproducing native-process failure, NOT a diagnosed/fixed product defect. A complete fresh unmodified gate run is still mandatory.

Actual CUA on2f41fa7 reproduced the earlier intermittent source-refresh loss: during generation EditRevision's primary-only/journal-pending interval, review.list omitted the still-authorized request, and the UI treated disappearance as authority revocation and cleared selection. Root stopped CUA at the broken boundary; no CUA PASS is claimed for that source. Fixed list to retain an accepted/authorized scope during generation journal_unavailable, while private read/commands remain fail-closed503. Added a deterministic real generation-journal-outage HTTP/DOM regression: selected scope stays, private state hides, original generation key reconciles, new source rereads automatically with no inherited checklist/eligibility. This is the actual fix for the earlier source-refresh timeout, not a timeout increase or an unexplained green rerun. Actual authority withdrawal remains separately denied/removed. New focused/whole/CUA evidence is required.
