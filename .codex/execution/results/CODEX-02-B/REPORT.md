> Controller acceptance record: the historical NOT YET RUN/Pending table, eeba25e check output and rerun-required/no-review notes below are superseded for the accepted synthetic slice. Reviewed source `606e8c5e20cc4412a67a56b178402d02e0bb4458` passed actual60/60tests, build and protected card checks (real HTTP/PGlite, DB/founder authentication,60routes and seeded production scan). Actual native CUA passed all8required scenarios on exact matching source blobs. [Attributed Claude review1 and embedded controller evidence](../../reviews/CODEX-02-B/5e687a35bcce49b382d2095b24eeb850-r1.json) passed. Application PR16 merged `ae78709b6879270b97ebcfc8ecb248e4d4167b1f`; planning PR55 merged `ace2ae46e393ded002bdc7446c6b2ff57a149f7a`. Local CUA file `606e8c5e20cc4412a67a56b178402d02e0bb4458.json` and trusted trace SHA256 `3e4332ae317884da0914422e529e11f8ad4708a146204963b491accf29c0b65c` remain with the root run records. The status ledger on the planning source of truth records delegated technical acceptance. This is not real verification, consent, sending or admission.
>
> Follow-up: a separate narrow correction removes passive logout of a newer shared-cookie session. Its actual React/HTTP regression, source, native check and independent review are recorded separately; the original accepted-source evidence above is not silently attributed to the follow-up. No original review record or decision is altered.

# CODEX-02-B correction and evidence report

Codex · November 11, 2026 · Draft correction; not done or accepted.

## Authority and architecture

This correction remains within the authorized local synthetic adult-access task, approved task blob `ee6381b2363d52f9de35cccf2376c66526e28fe9`, DECISION-039 / APPROVAL-006. Normal CODEX-01-B, CODEX-01-C and CODEX-00-C dependencies remain required. Supplied dependency records identify prior delegated acceptance; this drafting turn does not independently establish merge ancestry.

Shared engineering architecture v1.2, APPROVAL-004 / DECISION-031, registered SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`, source commit `a676dd1fcab9c1a92d954c1805ffdfab2109736d`, governs this result. Digest is cited from the registered record, not recomputed here. Reviewed the supplied verified source-of-truth, AGENTS, governance, PROJECT_CONTEXT v1.92, approvals, architecture README/design/module guide/review notes, task, prerequisite contracts/screens and synthetic exception. Opened the pinned controller checker, route probe, adult-access probe, database probe, founder-auth probe and player-dom dependency resource. Initially truncated combined output was followed by separate reads of the probe and dependency resources.

Applicable interfaces and invariants: WM-02 VerifyAdult and separately restricted adult identity; ADR-E01 transactional authority; ADR-E02 server-derived household isolation, generic recovery, cookie/CSRF and private cache boundaries; ADR-E05 atomic security transitions with mock delivery outside transactions. Join identity creation follows valid consumption; recovery preserves existing adult/household binding; token consumption, previous-session revocation and new-session issuance remain atomic. Persistent budgets, expiry, enabled/deleted identity checks and hash-only credentials remain required. Restricted identity grants no child content or withdrawn child authority. Consent-before-child-write remains separate. Independent journal reconciliation, keys and external dispatch findings remain owning-module obligations; no production recovery capability is claimed.

## Correction

Historical drafting correction preserved below; subsequent controller evidence governs acceptance.

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


## Controller re-verification after check-harness repair

2026-11-12T02:45:22.787567+00:00: the preceding blocker text records the earlier failed harness. The preserved source has now passed these actual protected checks on this tree. Independent review and task acceptance remain pending.

```text
["npm.cmd", "test"]: exit 0

> ocean-sound-explorer@0.1.0 test
> node --test tests/*.test.mjs

✔ native media starts synchronously in a tap and stop cannot award completion (1.796ms)
✔ the expedition has two confidence rounds followed by three ocean rounds (1.0701ms)
✔ Web Audio playback schedules every source during the initiating gesture (1.8152ms)
✔ every public game has a distinct playable route and valid scripts (18.8814ms)
✔ every game animal uses a bundled same-origin MP3 (6.6948ms)
✔ adult service: delayed identity creation, one-use races, bound recovery, expiry and hash-only storage (5181.1244ms)
✔ adult service: persistent cooldown, contending resends, global budgets, reset and delivery failure (2010.1812ms)
✔ adult service: constructor/input guards and account binding cannot be supplied by callers (1663.8865ms)
✔ adult HTTP: actual loopback, CSRF/header/cookie/body guards, rotation and assets on same server (1617.2455ms)
✔ interleaved assistance preserves actual trials: fast (8.3041ms)
✔ interleaved assistance preserves actual trials: medium (2.636ms)
✔ interleaved assistance preserves actual trials: slow (1.786ms)
✔ finite profile and explicit construction reject unsupported content (0.821ms)
✔ media gestures, error fallback and stale promises remain independent (6.8551ms)
✔ real local PostgreSQL and HTTP enforce synthetic founder boundaries (6246.3236ms)
✔ local factory preserves guard failures and returns an empty real PostgreSQL engine (4358.5095ms)
✔ two fresh databases reproduce scoped fixtures, constraints and household deletion (4002.9444ms)
✔ assignment scope failures remain immediate while duplicate request assignments cannot commit (1507.1458ms)
✔ migration checksums and actual SQL/registry failures preserve atomicity (1309.1189ms)
✔ discovery validates every required field, exact keys, territory and safe clock boundary (4.6399ms)
✔ real React controls keep local actions truthful, optional and closed after expiry (4769.3863ms)
✔ ending fixture retains the complete accepted finite profile without editing its source (5.5251ms)
✔ strict construction, paths and intents fail without state changes (5.6183ms)
✔ ending preserves zero tests, pending input references, actual trials and optional handoffs (4.7926ms)
✔ replay requests path-scoped identities atomically and retains engines across navigation (5.7576ms)
✔ actual React navigation retains pending older and played newer groups in both directions (5216.7838ms)
✔ explicit activation, terminal release and last-unit serialization use actual PostgreSQL (5015.147ms)
✔ outer rollback and actual SQL failure preserve caller transaction work (1886.0441ms)
✔ stored receipt boundaries, immutable interval and current consent are enforced (1702.2512ms)
✔ exact local mode returns disconnected adapters and does not mutate input (4.0467ms)
✔ missing, unknown, preview and production environments fail closed (0.884ms)
✔ connections, private browser variables and enabled adapters are refused (2.5682ms)
✔ configuration rejection never includes the rejected value (2.898ms)
✔ preview requires every exact flag and remains off in production (0.4773ms)
✔ real primary transitions and original retry receipts fixture-engine-1 (5316.266ms)
✔ real primary transitions and original retry receipts fixture-engine-2 (2123.6067ms)
✔ unstarted resume rejects without quarantining later Start (1669.7917ms)
✔ unstarted commit rejects without quarantining later Start (1545.5161ms)
✔ transient SQL chain read failure does not quarantine present valid history (1445.8349ms)
✔ present inconsistent checkpoint remains fail-closed after quarantine correction (1372.121ms)
✔ real service comparison of two committed trials fixture-engine-1 (1601.1347ms)
✔ real service comparison of two committed trials fixture-engine-2 (1617.1842ms)
✔ real SQL rollback at each gameplay write boundary (1380.9408ms)
✔ pending Configure and Test hide all progress over actual HTTP; backfill applies once (1768.0738ms)
✔ independent process reopen, killed writer, checksum and truncation fail closed (1558.8502ms)
✔ withdrawal-first denies duplicates and original epoch cannot be rewritten (1328.2552ms)
✔ complete finite adventure contract rejects missing, extra, version, range and constant defects (4.6037ms)
✔ two fresh button-shaped tries retain immutable provenance and trusted results (3.7485ms)
✔ full envelope and unsupported-operation failures have no effects (3.4428ms)
✔ caller mutation cannot replace pinned rules or committed input (0.6781ms)
Not implemented: HTMLMediaElement's pause() method
✔ actual React drawing shows chosen setup, reveals motion only on Test and retains visual tries (4961.1542ms)
✔ actual React retries an uncertain Replay into the new introduction, retaining the old play (8275.0062ms)
✔ ordinary browser cookies are stripped only for read-only trusted assets; saved APIs stay strict (1596.1865ms)
✔ fresh client reconciles stored pending Test without the lost browser queue, engine1 (1827.0913ms)
✔ fresh client reconciles stored pending Test without the lost browser queue, engine2 (1714.016ms)
✔ Replay Start failure before primary commit never poisons original reads or duplicates the intent (1880.8717ms)
✔ unsupported acknowledgement retains the selected replay and its revision pin for explicit reload (1674.6388ms)
✔ real saved HTTP/PG/journal engine1: pending, retry, conflict, history and withdrawal (2134.0673ms)
✔ real saved HTTP/PG/journal engine2: pending, retry, conflict, history and withdrawal (2137.445ms)
✔ construction and malformed acknowledgement fail closed (0.7693ms)
ℹ tests 60
ℹ suites 0
ℹ pass 60
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 23176.9023


["npm.cmd", "run", "build"]: exit 0

> ocean-sound-explorer@0.1.0 build
> vite build

vite v8.0.13 building client environment for production...
[2K
transforming...✓ 1859 modules transformed.
rendering chunks...
computing gzip size...
dist/client/index.html                   0.73 kB │ gzip:   0.45 kB
dist/client/assets/index-BX_5XDnY.css  170.84 kB │ gzip:  30.20 kB
dist/client/assets/index-DV-qgZcx.js   339.57 kB │ gzip: 104.76 kB

✓ built in 678ms


["C:\\Program Files\\Python314\\python.exe", "C:\\Users\\Arrgee\\.codex\\.chatgpt-projects\\g-p-6aa20bbf0df48191a58549f304e705de\\loop-adaptation\\.codex\\tools\\check_application_card.py", "--card", "CODEX-02-B"]: exit 0
Real disposable Postgres passed reproducible migrations/fixtures, scoped references, immutable source lineage, publication binding, action/sequence uniqueness, range constraints, transaction rollback and scoped deletion. No production/RLS/backup proof is inferred.
Actual local HTTP/Postgres authentication probe passed: password/TOTP, server roles, expiry, logout, concurrent replay, rate limiting, CSRF, cache and secret checks.
Adult access controller PASS: real PG atomic one-use, recovery rotation/household isolation, persistent resend/global budgets, expiry, hash-only secrets, real HTTP cookie/CSRF/schema/no-cache and no child authority.
Controller assertions passed: exact local mode, external adapters off, credential/config rejection, production preview disabled.

> ocean-sound-explorer@0.1.0 build
> vite build

vite v8.0.13 building client environment for production...
[2K
transforming...✓ 1859 modules transformed.
rendering chunks...
computing gzip size...
dist/client/index.html                   0.73 kB │ gzip:   0.45 kB
dist/client/assets/index-BX_5XDnY.css  170.84 kB │ gzip:  30.20 kB
dist/client/assets/index-C2nPvTzJ.js   339.57 kB │ gzip: 104.76 kB

✓ built in 553ms
Actual main.tsx router passed60 module-identity cases including trailing slashes: original pages preserved; synthetic routes dev-only.
Seeded production build/source scan passed: server-only env secret, private VITE_ value, private local fixture; forced preview flag.


```

## Controller browser entry correction

Actual native CUA on eeba25e5 showed403before the entry screen. Sec-Fetch-User was incorrectly classified as identity; actual HTTP regression was RED403vs200. A second actual HTTP regression was RED400vs200when a valid adult session included an unrelated well-formed cookie. Exact standard browser metadata is now recognized and unrelated cookies grant no identity while coexisting with the named adult session. Existing identity/Host/Origin/CSRF, malformed/duplicate-cookie and current-session checks remain. Focused HTTP check and subsequent protected checks are recorded by the controller; all eight native scenarios must be rerun on the corrected source before any review. No Claude card review has occurred yet.
