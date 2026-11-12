# CODEX-02-B correction and evidence report

Codex · November 11, 2026 · Draft correction; not done or accepted.

## Authority and architecture

This correction remains within the authorized local synthetic adult-access task, approved task blob `ee6381b2363d52f9de35cccf2376c66526e28fe9`, DECISION-039 / APPROVAL-006. Normal CODEX-01-B, CODEX-01-C and CODEX-00-C dependencies remain required. Supplied dependency records identify prior delegated acceptance; this drafting turn does not independently establish merge ancestry.

Shared engineering architecture v1.2, APPROVAL-004 / DECISION-031, registered SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`, source commit `a676dd1fcab9c1a92d954c1805ffdfab2109736d`, governs this result. Digest is cited from the registered record, not recomputed here. Reviewed the supplied verified source-of-truth, AGENTS, governance, PROJECT_CONTEXT v1.92, approvals, architecture README/design/module guide/review notes, task, prerequisite contracts/screens and synthetic exception. Opened the pinned controller checker, route probe, adult-access probe, database probe, founder-auth probe and player-dom dependency resource. Initially truncated combined output was followed by separate reads of the probe and dependency resources.

Applicable interfaces and invariants: WM-02 VerifyAdult and separately restricted adult identity; ADR-E01 transactional authority; ADR-E02 server-derived household isolation, generic recovery, cookie/CSRF and private cache boundaries; ADR-E05 atomic security transitions with mock delivery outside transactions. Join identity creation follows valid consumption; recovery preserves existing adult/household binding; token consumption, previous-session revocation and new-session issuance remain atomic. Persistent budgets, expiry, enabled/deleted identity checks and hash-only credentials remain required. Restricted identity grants no child content or withdrawn child authority. Consent-before-child-write remains separate. Independent journal reconciliation, keys and external dispatch findings remain owning-module obligations; no production recovery capability is claimed.

## Correction

Return complete replacement contents for server/adult-http.mjs and this report. Preserve all other existing authorized deliverables, tests, migrations and unrelated work. No approved specification, status/authorization ledger, controller probe, package or deployment configuration is changed.

Source inspection identifies the concrete cause of ordinary HTTP requests being rejected: the identity-header expression matches the `user` segment in the standard `user-agent` header. Node fetch and browsers can supply this header on ordinary requests. The denial is evaluated before route dispatch, so a valid session read can return403 even with the correct Host.

The correction exempts only the exact lowercased header name `user-agent` from that identity-name expression. Its value is never interpreted as authority. `user`, `x-user-id`, adult/household/identity/role/session/bearer names, Authorization, forwarded headers and URL rewrite headers retain their existing rejection. Host, Origin, cookie, body, URL, loopback binding and response guards remain intact.

The earlier report's fetch-pool explanation was a hypothesis. The supplied latest failure persists after the hostile Host test was moved to a dedicated native connection. This correction addresses the directly visible User-Agent collision instead of changing expected HTTP statuses or removing tests.

The existing adult HTTP test already asserts that a normal fetch of /adult/session returns exactly signed_out after the rejected Host request; later assertions exercise valid fetch-based request/verify/session/logout traffic and hostile headers. Preserve those assertions. Their corrected-candidate outcomes remain pending.

## Observed evidence and pending validation

Prior controller evidence supplied in this prompt: `npm.cmd test` exited1;60 tests ran,59 passed and1 failed. Three adult service tests passed. The adult HTTP test failed at tests/loop-adult-access.test.mjs:154: expected signed_out after hostile Host traffic, observed the generic Request denied response. These are prior supplied controller observations, not checks run by this agent and not corrected-candidate evidence.

Read-only source inspection succeeded. A git status read encountered dubious-ownership protection; no configuration change, refreshed-main, clean-worktree or exact HEAD claim is made. No source files were written and no checks were run under the transport override. The controller must pin the exact written candidate revision/digests before validation.

| Exact required check | Properties asserted | Corrected-candidate outcome |
| --- | --- | --- |
| `npm.cmd test` | Existing56 tests and4 adult tests. Actual service/Postgres delayed identity creation, unknown recovery with no new account/household/challenge, single-use interleavings, expiry/replacement, recovery rotation/isolation, hash-only storage, persistent budgets/reset, delivery failure and constructor/input guards. Actual HTTP ordinary fetch usability, hostile Host, Origin/CSRF, identity/forwarded/bearer headers, cookies, body limits/schema, rotation, local assets and generic routes. | NOT YET RUN BY THIS AGENT. Controller exit status, counts and output pending. |
| `npm.cmd run build` | Production compilation of the integrated source. | NOT YET RUN BY THIS AGENT. |
| `C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-02-B` | Protected real database/founder/adult HTTP probes; dependency/deployment fences; fail-closed environment checks; seeded private-value production scan; actual main.tsx leaf identity across60 route cases. | NOT YET RUN BY THIS AGENT. |
| Controller native CUA on `/loop-preview/join` | Exact-source phone layout, keyboard/focus/status, join/verification, invalid/expired/replayed codes, resend limits, recovery rotation, restricted identity and no secret persistence. | Not observed by this agent; pending controller. |
| Independent Claude review | Exact final candidate with actual automated and native CUA evidence. | Pending; no verdict claimed. |

Concurrent interleaving tests run on single-connection PGlite: real multi-connection PostgreSQL lock behavior remains unverified. Required atomic transactions and locking remain in place; this adapter limitation does not establish production concurrency. Missing evidence is not a pass.

## Gates and handoff

Provider/adult-identity-policy inputs are deferred only for this invented local slice. No real age, parental authority, COPPA/consent, trial, booking or public-admission claim is made. Production/preview remain unconfigured/fail-closed. Privacy, provider, offer, capacity/support, retention, production recovery, release, sending and admission gates remain in force. No real addresses, child/family records, vendor credentials, external API calls, spending, provisioning, messages, installation, push, merge or deployment occurred.

CODEX-10-A/00-F/05-G remain incomplete. CODEX-02-C still requires10-B, and10-B still requires10-A. WM-08 consumers must retain the restricted identity boundary. The controller must attach exact corrected-candidate check results and actual native CUA observations before independent review and any delegated technical acceptance. No task is marked done or accepted by this report.
