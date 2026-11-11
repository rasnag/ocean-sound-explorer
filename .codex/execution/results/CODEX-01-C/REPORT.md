# CODEX-01-C — local synthetic founder authentication draft

Date: 2026-11-11. Producing implementation owner: Codex. Status: source draft for controller writing, checks and independent review; not done or accepted.

## Authority and source evidence

Current chat explicitly authorizes only CODEX-01-C and the five returned paths. Transport is response-only: no files were written, checks run, packages installed, external services called, commits created or deployment actions taken.

Read the supplied verified SOURCE_OF_TRUTH.md, PROJECT_CONTEXT.md v1.91, approved/APPROVALS.md (APPROVAL-003/004/005), complete engineering README/design/module guide/review notes, product/task, contracts v1.1.1, screen contract, synthetic foundation exception and prerequisite acceptance records. Also read actual application AGENTS.md and planning-repository AGENTS.md using Get-Content. The context directory listing lacks AGENTS.md; the actual planning repository supplied that instruction file instead. Initial relative reads of the context AGENTS and controller checker failed; no claim of successful filesystem reads for those paths is made. The controller checker and complete founder_auth_probe.mjs were read from their supplied verified contents in this request. Main freshness, dependency ancestry and artifact digests were not independently verified.

Task approved-copy blob: e195e7b670a6dc2a6d55ed79ce733e777df39003. Architecture v1.2, APPROVAL-004, source commit a676dd1fcab9c1a92d954c1805ffdfab2109736d, registered SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79. Digest is registered evidence, not recomputed here.

## Interfaces and invariants

WM-01 session/persistence foundation and ADR-E01/E02 apply. createFounderAuth exposes server-only synthetic provisioning, login, requireFounder and logout. createSyntheticAuthServer exposes a real Node HTTP server without import/listen side effects. Migration 003 adds identities, hashed sessions and a database-backed local issuer throttle without modifying applied migrations.

Server authority comes from current identity/session rows, never browser role/subject/expiry fields. Each protected read checks enabled state, current role, revocation and server-clock expiry. Opaque sessions use 256 random bits; only SHA-256 verifiers enter the session table. Password verifiers use independent random salts, fixed bounded scrypt and timing-safe comparison. OTPAuth validates real SHA1/6-digit/30-second TOTP with zero neighboring-step tolerance. A database transaction locks the global local throttle then the identity, validates credentials, consumes the TOTP step and inserts its session together. Concurrent replay cannot commit a second issuance. Failure counters commit before generic authentication errors are raised. The conservative global throttle intentionally avoids account-existence-dependent lockouts; correct credentials remain blocked until its window expires.

HTTP enforces explicit 127.0.0.1 binding, actual-port Host and exact same-origin POSTs, no-store responses, strict cookies, JSON mutations, a 4096-byte body ceiling and safe fixed logging. The labelled form uses a same-origin static script and keeps tokens in an HttpOnly SameSite=Strict cookie. No application routes, client helpers, dependency files or deployment fences are changed.

Architecture review findings concerning independent journals, key management, provider dispatch and restore remain owning-module obligations. This disposable issuer makes no independent recovery, production durability, parental verification, Supabase Auth/TOTP or WM-08 access claim. TTL and rate settings are visibly provisional local settings. Current DECISION-033 controls its resolved eligibility scope; no historical architecture wording reopens it. Privacy/provider/offer/capacity and production session policy remain gated.

## Check evidence

No implementation check has been run by this agent under the transport override. There are no observed passing tests, builds, HTTP outcomes or browser/UI checks. The controller must write the exact returned files, identify their hashes/revision and attach actual results before review.

Prepared test: tests/loop-auth.test.mjs, real disposable PostgreSQL plus real loopback HTTP, no mock auth. Assertions cover:

- Exact environment rejection, bounded TTL/rate configuration, duplicate provisioning and unsafe listen overload rejection.
- Unknown-user/wrong-password identical status/body, malformed and incorrect OTP rejection, valid issuance, family denial despite injected privileges and concurrent OTP replay serialization.
- Session rotation, SHA-256 session storage, server logout with retained-cookie denial, cleared logout cookie and server expiry at its boundary.
- Live role demotion and disabled-identity rejection.
- Invalid Host/Origin/content type, malformed JSON, 4097-byte chunked body and duplicate/malformed cookie refusal; denied logout preserves access.
- Active lockout blocks correct credentials and lifts after the controlled window.
- Captured logger/response/console/stderr absence of generated credentials, MFA secrets and recorded session tokens; plaintext passwords absent from identity rows and plaintext secrets absent from session rows.

Observed outcome for every prepared assertion: NOT YET RUN. The protected controller probe remains separately required and does not replace independent review of the additional assertions above. Test code captures console/stderr only during the actual local flow and restores original methods in finally; it does not claim a browser observation.

Required controller commands, not executed here:

1. npm.cmd test — execute common and card-specific tests; inspect actual counts/failures.
2. npm.cmd run build — verify integrated production build.
3. C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-01-C — pinned dependency/deployment checks, real database and founder-auth probes, seeded secret/build scan and actual main.tsx route identity probe.

Controller must report exact command, written revision/hash, exit status and stdout/stderr. Missing evidence is not a pass. No installed dependency availability or syntax/test success is asserted by this source draft.

## Remaining boundaries and handoff

No real identity or family data is used. Caller provisioning is developer-only and requires invented credentials; there is no provisioning HTTP endpoint. Production Supabase identity, session policy, hosted persistence/recovery and family access stay closed. Existing public demos and the explicit three-field import.meta.env allowlist remain untouched.

Independent application review and actual controller execution are outstanding. Downstream authorization consumers include founder-only intake/review/publication/timeline/cost/support modules; each retains its exact card scope and prerequisites. WM-08 family access and WM-10 privacy/recovery are not implemented here. No task ledger or approved record is changed and no self-acceptance is requested.
