# CODEX-10-B — source-context verification and drafting blocker

2026-11-11 · Codex · Not implemented, done or accepted.

No application implementation is supplied by this response. No files were written, checks executed, commits created or external actions taken. This report must not unlock dependent work.

## Verified observations

The pinned PROJECT_CONTEXT.md was fully read in successive sections covering all 1,291 lines. Its raw length is 201,176 bytes and its computed SHA-256 is c395f4582db524d0938a609aae0063f529da47e4c5edccfd57edba90be17c54b, matching the required pin. The initial oversized read was truncated; subsequent smaller reads covered the complete file without truncation. Version 1.93 records DECISION-040 / APPROVAL-007 and retains real consent, privacy, provider, spending, provisioning, deployment and admission gates.

The pinned check_application_card.py and consent_probe.mjs were read in full. Computed raw hashes matched the supplied pins: respectively 1a1a3c85364626d2a81898371a9888852e20e5c3fc628a2c0bd55b570535cafb and fc853346853334ea38e75ef7d9976e58a2f581e85beb53d90f6cd2877dd1238b. The planning checkout checker has different raw line-ending bytes (SHA-256 fc717af8497001c6d3ebebe2842ebfcd62a93f46f49512091e490e394ad34a0c); an actual read comparison found its text identical to the pinned checker after CRLF-to-LF normalization. This is not a checker execution result.

Read the supplied shared SOURCE_OF_TRUTH, AGENTS, GOVERNANCE, approval register, product requirements, task, engineering design and contract material, plus the local pinned source-of-truth/agent/approval files and architecture README, module guide and review notes. Read the protected application migration, issuer, journal, player, fixture and founder-auth interfaces and the listed protected probe sources. Protected application resource hashes computed during inspection matched their supplied pins.

Observed application HEAD: 84bbac3857276daa65dd713e66d30dc9cf2ca49a. Initial git status failed the ownership guard. A subsequent command-local safe.directory exception allowed a read-only status inspection without changing Git configuration. It reported an untracked .codex/execution/results/CODEX-10-B/ directory; no implementation paths were reported changed. Git also warned that the sandbox could not access the user ignore file. Existing work was not modified.

## Blocking specification discrepancy

The handoff requires POST /adult/consent to accept a strict six-field record body, while its explicitly EXACT command enumerates only five fields: command_id, policy_version, required_service, optional_contact and optional_story. The protected probe also supplies those five fields. Adding a sixth field would violate the exact command shape and accepting both shapes would weaken its no-unknown-fields requirement. The exact field list appears intended to govern, but no implementation or runtime evidence is supplied here. Controller should explicitly reconcile the field-count wording against the five-field contract before continuing this drafting attempt.

This response is incomplete implementation work, not a successful task result. All eight application deliverables remain outstanding. No source-context absence is claimed.

## Applicable architecture and required implementation properties

Registered engineering v1.2, APPROVAL-004, SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79 governs. Relevant interfaces are WM-02 RecordConsent, WM-10 WithdrawConsent and restricted adult access, WM-07 StartPlay/CommitAction/ResumePlay, and WM-03 ActivateTrial/apply/readAllowance. ADR-E02/E05 require current server-derived authorization, household serialization, atomic receipt and permission changes, current epoch and exact policy checks, scoped command dedupe, and immediate post-withdrawal fencing. Trusted withSession callbacks must execute and roll back in the issuer transaction, retrying only actual serialization/deadlock failures within the three-attempt bound.

Inspection of migrations 001–006 found no child-content access-grant or notification/delivery queue tables. Future generation, readiness/delivery, child-write/setup, deletion, independently durable revocation/recovery, scheduler and key-management integrations must not be represented as implemented by consent source drafting. The existing play journal remains a local synthetic process-recovery mechanism, not independent durable withdrawal evidence.

Preserve G-E03, infrastructure/recovery, provider/model, offer, capacity/support, real-content and public-release gates. PROJECT_CONTEXT DECISION-033 resolves G-E04a only within its recorded submission-time eligibility scope; historical architecture wording must not reopen or expand that decision.

## Required checks and evidence status

- npm.cmd test — NOT YET RUN. Must exercise the delivered consent integration tests and preserve meaningful existing tests; no observed assertions or pass count.
- npm.cmd run build — NOT YET RUN. No observed production build outcome.
- Python314 check_application_card.py --card CODEX-10-B — NOT YET RUN. No observed protected consent, adult/founder, PostgreSQL, entitlement, play, router or secret-scan outcome.
- Native UI/browser verification — NOT RUN and not claimed; this card's drafting scope prohibits CUA.

Required future runtime evidence includes strict constructor/command rejection, current-session authorization, SQL-trigger rollback of permission and receipt, callback rollback, household and role isolation, immutable dedupe, optional-permission lifecycle, refusal/withdrawal/reconsent epoch fencing, both journal-boundary orderings, policy mismatch denial across play and entitlement reads/writes, durable global/household quotas including backward-clock rejection, HTTP origin/header/cookie/body protections, and captured-output non-disclosure. These are requirements, not observed results.

Downstream: CODEX-02-C must wait for actual implemented, checked and independently reviewed CODEX-10-B enforcement. Related WM-07/08/10 and verification/recovery consumers retain their own exact scopes and gates.
