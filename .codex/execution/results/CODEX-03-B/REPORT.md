# CODEX-03-B drafting evidence

Owner of this draft: Codex. Date: 2026-11-11. Status: source draft for controller application, checks and independent review; not done or accepted. No files were written or checks executed by this agent under the read-only transport override.

## Authority and sources

Used the complete verified source context supplied in this turn: SOURCE_OF_TRUTH.md, application AGENTS.md, PROJECT_CONTEXT.md v1.91, approved/APPROVALS.md, approved product/task scope, engineering README/design/module guide/review notes, CODEX-00-B CONTRACTS.md v1.1.1 (wire 1.1.0), prerequisite status records, current application sources and protected controller/checker/probe sources. No live-main freshness or local Git revision was independently established. No secrets, family outputs or unrelated files were read.

Architecture: APPROVAL-004, engineering v1.2; source commit a676dd1fcab9c1a92d954c1805ffdfab2109736d, blob 78df8cf2857c0b32222a442329778cf43e8b05ee, registered SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79. Digest cited from registered evidence, not recomputed. Task approved-copy blob: 5ce8ebd808ad5bf172403b72e6bb7171cb15565a. Current explicit execution scope supersedes the historical card's unauthorized label only within this bounded synthetic task. Supplied prerequisite evidence records CODEX-01-B and CODEX-00-B acceptance; no ledger was changed.

## Draft artifacts and interfaces

Only db/migrations/004_entitlements.sql, lib/loop/entitlements.mjs, tests/loop-entitlements.test.mjs and this report are returned. No dependency, prior migration, guard, engine, route, manifest, approved specification or status record is changed.

WM03 exports createEntitlementKernel({env,clock}), with activateTrial(tx,trustedScope,command,policy), apply(tx,trustedScope,transition,binding) and readAllowance(tx,trustedScope,{period_id}). The exact existing environment guard runs synchronously. Scope is an internal trusted-owner input, not authentication evidence or a public role flag.

ADR-E01/E05 and the common lock hierarchy govern: household FOR UPDATE, latest service consent FOR UPDATE, request when applicable, grant, period and claim, then publication/revision and assignment for consumption. Household serialization precedes writes and duplicate-result returns. Resource locks remain owned by the outer transaction. Each operation establishes a unique savepoint, releases it on success, and rolls back only its own savepoint on failure. Raw autocommit reaches PostgreSQL SAVEPOINT enforcement. No operation opens or commits an outer transaction. Unexpected SQLSTATE is preserved internally. Concurrent calls on the same transaction object conflict; callers must also avoid aliases that disguise the same transaction.

Explicit activation fixes one immutable interval per existing grant. Successful commands store canonical full-input digests and uncommitted results, including new command IDs returning an existing activation. Changed policy/payload conflicts. Apply accepts only exact entitlement_transition 1.1.0 variants; binding is separately required only for consumption and included in dedupe. Claims have once-only request identity and terminal consumed/released states. Pending, reserved and consumed count against allowance under the period lock. Scoped foreign keys and transition/cause uniqueness support isolation. No grant issuance occurs.

DECISION-033 governs submission-time eligibility: trial_start <= stored original_received_at < trial_end, with a missing/future receipt rejected. The receipt column has no default and becomes immutable once nonnull. Reserve/consume do not recheck nominal expiry after a valid hold. Source-scope successors do not create a new claim. Pre-ready release frees unconsumed allowance; consumed/released claims cannot reopen.

Consume checks actual scoped assignments joined to published/adventure revisions and the same request/child. This is relational fixture evidence only. WM08 must independently verify the exact current reviewed revision/approval and atomically own readiness, capacity completion and consumption. WM04 must own original server receipt, capacity booking and hold atomically. Neither complete command is implemented here.

## Checks and evidence status

All checks below are NOT YET RUN BY THIS AGENT. There is no observed pass, test count, build digest, UI observation, secret-scan outcome or controller outcome to report. Controller must attach exact written artifact hashes, application revision, commands, exit codes and actual output before technical review.

| Check | Properties asserted | Observed outcome |
| --- | --- | --- |
| npm.cmd test | New real-PGlite tests assert nonactivation, raw-autocommit 25P01, unchanged activation on retry/new command, last-unit serialization, payload conflicts, release/terminal identity, outer rollback, savepoint recovery after actual trigger SQLSTATE 23514, caller marker preservation, interval/receipt immutability, receipt boundaries and consent withdrawal. Existing tests remain included. | Not run |
| npm.cmd run build | Existing integrated application builds with the added server/tooling module and tests. | Not run |
| C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-03-B | Protected database and entitlement probes exercise actual PostgreSQL migrations/scoped references, real locks/order, explicit activation, changed commands/policy, sibling last unit, epoch/scope denial, late reserve/consume, publication binding, release/correction identity, child allocation, actual SQL failure recovery and outer rollback. Checker additionally owns dependency integrity, seeded build/secret scan, deployment fence and actual routing identity probes. | Not run |

The included test file supplements the protected entitlement probe; it does not duplicate every protected scenario. Required consume-binding, child-allocation and broader migration checks rely on actual execution of that protected probe, not this narrative. Missing execution evidence is not a pass. No installation or API invocation was performed.

## Limits, gates and handoff

Every returned service value is uncommitted:true. No Saved, booked receipt, acknowledged status, ready assertion or invented durability flag is returned. Journals, independent durability, primary/journal partial-commit reconciliation, physical recovery, RLS, backups, multi-host races, production identity and parental verification are outside this kernel. PGlite is real PostgreSQL SQL at a single-engine serialized boundary; successful tests would not prove those properties. Architecture review notes concerning independent journals/key management/dispatch remain with their owning modules. Restore must replay recorded consumption facts idempotently, never execute consumption again.

G-E03 privacy, G-E04 offer/allocation/continuation/post-ready cancellation, provider, measured capacity/support and release gates remain open. DECISION-033 resolves only its recorded eligibility/expiry interpretation. Invented test allowance and duration select no production terms. No payment, automatic charge, production receipt, source-question handling, provisioning, spending, messages, deployment, push, merge or admission is included.

Downstream handoff: CODEX-04-A/WM04 must integrate receipt+capacity+hold; CODEX-08-A/WM08 must integrate exact reviewed publication/readiness+capacity completion+consumption; CODEX-12-B/WM12 must retain actual scenario evidence; CODEX-10 and CODEX-13 retain privacy/recovery/release responsibilities. Independent review and controller checks remain outstanding. Do not mark this card done or accepted from this draft.
