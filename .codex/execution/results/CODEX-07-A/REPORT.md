# CODEX-07-A correction evidence

Codex · 2026-11-11 · Response-only drafting revision. Not done or accepted. Controller writing, checks and independent review remain pending.

## Authority and scope

Engineering architecture v1.2, APPROVAL-004, SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`; CODEX-00-B contracts v1.1.1, wire v1.1.0; authorized task blob `c40becc33e8f92a2418adf7e662c24b42ea79fd1`. The supplied verified source-of-truth, governance, project context, approvals, architecture README/design/module guide/review notes and contracts govern. Local controller resources and current HTTP/test sources were read. Remote-main freshness was not established; no network request was made.

Applicable interfaces: WM-06 deterministic player transitions and WM-07 StartPlay, CommitAction and ResumePlay. Relevant invariants: household/current-consent authorization before duplicate disclosure; household → request → revision → assignment → play lock order; action dedupe before sequence CAS; atomic command/event/checkpoint/sequence/pending-journal intent; filesystem confirmation outside the primary transaction; acknowledgement only after verified journal evidence and scoped confirmation. Pending resume must expose neither candidate nor older checkpoint/events. This correction changes only HTTP header classification and does not introduce another architecture.

## Correction

The existing identity-header expression matches `user-agent` through its `user` prefix followed by a hyphen. Consequently a normal Fetch HTTP request can receive403 before service.resume is called. This is a source-level explanation consistent with the supplied failure at tests/loop-play-service.test.mjs:107; it has not been reproduced by executing a request in this turn.

The complete replacement server/play-http.mjs exempts exactly the lowercase normalized standard `user-agent` header from that identity expression. User-Agent is never used to derive scope. Other matching identity headers, including X-User-Agent, remain rejected. Bearer capability lookup, strict server scope copying, Host/Origin restrictions, forwarded-header rejection, body bounds, status mapping and security headers are retained.

The existing tests/loop-play-service.test.mjs already sends actual Fetch requests during Configure and Test journal outages and asserts HTTP503 plus recursive absence of checkpoint/events. Its final acknowledged resume asserts200 and response security headers. No expectation was weakened to accept403. Existing service, journal, migration005, tests and PLAY_SERVICE_CONTRACT.md are retained; this response supplies only the changed HTTP file and this report, preserving other work.

## Checks and observed outcomes

| Check | Properties asserted | Outcome |
| --- | --- | --- |
| Source inspection of server/play-http.mjs | Whether ordinary User-Agent matches the identity-header guard | Observed expression includes `user` followed by `(?:-|$)`, with no standard-header exception in the current source. Proposed replacement adds only that exception. |
| Supplied previous `npm.cmd test` output | Real PG transitions/retries, rollback, HTTP pending recovery, journal reopen/crash/corruption and existing application regressions | User-provided prior result:40 passed,1 failed of41. Pending HTTP resume expected503 and observed403. This is prior supplied evidence, not a run by this agent or evidence for this replacement. |
| `npm.cmd test` | Pending Configure/Test service and HTTP responses reveal no checkpoint/events; backfill preserves primary ID and applies once; existing suite remains passing | NOT YET RUN by this agent, per transport override. |
| `npm.cmd run build` | Application production build remains valid | NOT YET RUN by this agent. |
| `C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-07-A` | Actual protected PostgreSQL/HTTP/journal probes, prior engine/database probes, deployment fences, dependency pins, seeded production secret/fixture scan and44 route identities | NOT YET RUN by this agent. Controller must attach actual exit status and output against the written artifacts. |

No files were written and no checks, installations, commits, pushes, merges, provisioning, external messages or deployments were performed in this drafting turn. No browser/UI observations are claimed. The controller must pin the written revision and run the authorized checks before treating the correction as verified.

## Remaining limitations and handoff

The local journal acknowledgement scope remains `single-host-process-recovery-only`, mode local-synthetic, production_ready:false. File sync and process reopen do not prove independent production failure domains, host-loss/power-loss recovery, encryption, revocation restore or deletion. No production Saved claim is authorized. The child UI remains memory-only;07-B owns browser acknowledgement/save/resume integration, and07-C/13 own broader restore verification.

Provider/infrastructure capability, privacy, offer, capacity/support, content approval and production/release gates remain open in their recorded scopes. DECISION-033 resolves eligibility/expiry only within its explicit scope. This correction selects no policy or provider and approves no synthetic content. Downstream handoff: CODEX-07-B, CODEX-07-C, WM-09 acknowledged timeline projections, CODEX-00-F and WM-10/13 production recovery/privacy integration. No task or acceptance ledger is changed.
