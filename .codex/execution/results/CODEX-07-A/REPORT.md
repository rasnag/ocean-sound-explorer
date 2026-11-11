# CODEX-07-A implementation and correction evidence

Producing implementation/correction agent: Codex. Execution authorized by Rasna. Date: 2026-11-11. Response-only drafting revision for controller application and review; not done or accepted. No files were written or checks run by this agent in this turn.

## Authority, source and interfaces

Approved task copy blob `c40becc33e8f92a2418adf7e662c24b42ea79fd1`, APPROVAL-003, with the explicit current implementation grant. Engineering architecture v1.2, APPROVAL-004, source commit `a676dd1fcab9c1a92d954c1805ffdfab2109736d`, registered SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`; CODEX-00-B contracts v1.1.1 / wire1.1.0 govern. The supplied verified source records and local pinned controller resources were consulted. Live-main freshness was not established. Git status/HEAD reads failed with dubious-ownership protection; no Git configuration was changed.

WM-06 actual finite player engines and WM-07 StartPlay, CommitAction, ResumePlay and server-only reconciliation are implemented. Relevant invariants are current household/consent authorization before duplicate disclosure; household → request → revision → assignment → play locks; action dedupe before sequence CAS; atomic command/event/checkpoint/session sequence/pending journal intent; fsync outside SQL; verified journal plus scoped acknowledgement marker before exposure; immutable original-epoch replay; distinct action/event cursors; no older checkpoint on pending resume. Architecture review note2's primary-only failure/backfill/visible-health obligation is addressed within the explicitly limited local synthetic boundary. Production encryption/key-management and independent recovery remain owning-module gates.

## Artifacts and revision identity

All seven authorized artifacts are supplied as complete file contents:

| Artifact | Responsibility / current revision |
| --- | --- |
| server/play-service.mjs | Transactional service, chain verification, corrected quarantine classification and original duplicate receipts during pending |
| server/play-http.mjs | Existing loopback capability transport, retained including prior User-Agent correction |
| server/play-journal.mjs | Existing branded canonical framed/checksummed fsync adapter, retained |
| db/migrations/005_play_actions.sql | Existing scoped relations, immutable commands/events and pending/ack marker, retained;001–004 untouched |
| tests/loop-play-service.test.mjs | Existing real PG/HTTP/journal assertions plus quarantine, transient-read, comparison and pending historical-receipt regressions |
| docs/loop/PLAY_SERVICE_CONTRACT.md | Draft1.1, documents exact contracts and corrected failure boundaries |
| .codex/execution/results/CODEX-07-A/REPORT.md | This attributed evidence record |

The supplied review identifies prior reviewed application commit `1dacd13` (abbreviation as supplied). Its full commit ID, Git blobs and controller run receipt/exit logs were not supplied and could not be established from local Git in this sandbox. They are not invented. This response is a new uncommitted drafting revision; the controller must record its exact written commit/blobs or file hashes with fresh check output. Observed pre-correction file SHA256 values from source reads were service `7bac3ec1fced72b07e42534cd04ae6335fcfee2b785c5a62074ff033a4a72330`, tests `2c2faa4334f96458b3d17b2b143b0a6ef97ba0d25c385d1b04e20a970163f1ca`, HTTP `ed115bbabc94aea5734fb216fbb95a77f1c9c8c4a68a27617c64816fdfc6a9a8`, journal `2a67a6ae88dc9b1d3b55f58c55a22520eb3ba3890ba7f61a375636fc4bbe4be8`, migration005 `9e5f19f8f36e649f954a1e205764a934c2788901643c696378175e20779e21b5`, contract `5138a0da7fee3dc111e07d530cf3973e6781bc6d49df396fab5ff62784c42e53`. These identify inspected baseline bytes, not the new response or a successful build.

## Corrections to supplied review findings

The former chain catch quarantined every non-denied failure, including a never-started play and SQL read exceptions. All chain SQL reads now occur before pure consistency validation. Completely absent history rejects denied without writing/quarantining. Present but incomplete/inconsistent history remains recovery_required and may quarantine. Transient SQL failure maps to a generic recovery error without poisoning later calls on the same service instance.

Exact old acknowledged action retries no longer reject solely because a newer action is pending. Their own stored journal body/reference and current authorization/full history still verify. They return the original receipt, do not clear outage health, expose no newer candidate, and add no rows. Current resume and new actions remain closed while the latest action is pending.

Added real-PG assertions cover Resume-before-Start and Commit-before-Start independently, empty unchanged tables on rejection, acknowledged subsequent Start and exact resume. A real wrapped transaction throws only at an actual chain-read boundary, then successful reads/writes remain real PG; the same service instance must recover. A separate corrupt-checkpoint fixture must still reject repeatedly without changes. Both engines now run two actual trials and compare through the service, asserting comparison_viewed SQL batch, action7/event9 cursors and exact resumed engine state. Engine1 help still rejects rather than inventing support. Existing Configure/Test HTTP outage checks additionally retrieve old acknowledged Predict receipts, assert unchanged SQL and persistent outage health, then backfill once.

## Checks and observed outcomes

| Exact check / evidence | Properties | Observed outcome / exit status |
| --- | --- | --- |
| Supplied prior independent review of `1dacd13` | Prior suite, build, protected actual PG/HTTP/journal checks and44 routing cases | Reviewer reports41/41 tests, build and probes passed, including lost responses, old duplicates, two writers, four rollback boundaries, Configure/Test outage/backfill, both withdrawal orders, corruption, journal reopen/crash/checksum/truncation. Prior evidence only; raw command exit statuses were not supplied, so unavailable here. Review verdict changes_requested for the quarantine defect. |
| Source inspection in this turn | Missing history and SQL failures entered broad quarantine catch; old duplicate guard rejected during newer pending | Observed in current source. Replacement separates operational reads/absent history from stored inconsistencies and removes only that duplicate guard. No runtime pass inferred. |
| `npm.cmd test` | All existing application regressions and real migration/service/HTTP/journal tests, including the new failure/classification and comparison assertions above | NOT YET RUN by this agent; exit status unavailable under read-only transport override. Controller must record actual totals and failures, not reuse41/41 for this revision. |
| `npm.cmd run build` | Production application remains buildable; server modules remain outside client integration | NOT YET RUN by this agent; exit status unavailable. |
| `C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-07-A` | Real protected DB/engine/assistance/play HTTP/journal probes; environment fences; pinned dependencies; seeded private-secret/fixture production scan;44 actual main.tsx route identities | NOT YET RUN by this agent; exit status unavailable. Complete checker/resources were read; no controller resource was edited. |

There are no new observed UI/browser, runtime, build or test results in this drafting turn. The controller must attach exact new artifact identity, commands, stdout and exits before considering these corrections verified. No tests, build, installation, paid call, write, commit, push, merge, provisioning, deployment or message occurred here. Source hashes and source/Git reads are not application verification.

## Limitations and handoff

Acknowledgements remain mode local-synthetic, acknowledgement_scope single-host-process-recovery-only and production_ready:false. Real local fsync/reopen evidence does not prove independent production failure domains, host-loss/power-loss recovery, encryption, deletion/revocation replay or full DB restore. A journal candidate contains synthetic gameplay data; it is not content-free. No real family data or synthetic content approval is claimed.

Provider/infrastructure, public privacy, offer, capacity/support, exact human content review and release/admission gates remain open in their recorded scopes. DECISION-033 resolves eligibility/expiry only within its stated selection. No approved specification, authorization/status ledger, source-of-truth record, UI, engine, old migration, fixture, dependency or auth source is changed.

Downstream: CODEX-07-B browser save/resume must distinguish historical duplicate receipts from current resume and honor local acknowledgement_scope; CODEX-07-C and WM-13 broader restore verification; WM-09 projections must join acknowledged command markers; CODEX-00-F and WM-10/13 own production durability/key/privacy/revocation/deletion integration. Existing child UI remains memory-only without Saved integration. Controller writing, fresh checks and independent review remain outstanding; no acceptance or completion status is asserted.
