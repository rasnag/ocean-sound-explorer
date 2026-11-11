# CODEX-01-A — Verification blocker

Producing agent: Codex. Date: 2026-11-10. Status: blocked on controller route-probe execution; not done or accepted. Read-only drafting turn: no files written, checks run, commits, network calls or external actions performed.

## Sources and scope

Read the supplied verified SOURCE_OF_TRUTH.md, PROJECT_CONTEXT.md v1.91, approval register, architecture README/design/module guide/review notes, task specification, synthetic-foundation exception and prerequisite handoffs. Read the actual application AGENTS.md, seven authorized implementation files, controller checker and application_route_probe.mjs. The context directory's AGENTS.md is absent; the supplied and actual application AGENTS.md provide the available agent instructions. Main freshness and exact current application commit were not independently verified.

Architecture: engineering v1.2, APPROVAL-004, registered SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79. Digest cited from registered evidence, not recomputed. Task approved-copy blob: d5014b5e46b8f4d14f4a5367886562c2c91f2f70. DECISION-038/APPROVAL-005 permits only the local synthetic foundation exception to CODEX-00-F.

Applicable interfaces/invariants: WM-01 configuration and shell coexistence; ADR-E02 public/private and secret boundaries; ADR-E04 isolated synthetic development with no production credentials or generated-code execution; deployment/trust boundaries separating local, preview and production. This shell implements no transactional service. Household authorization, consent fencing, atomic receipts/event-checkpoint commits, independent journal/revocation recovery, separate worker identities and scheduler capabilities remain downstream requirements, not demonstrated capabilities. Review-note journal, key-management and dispatch obligations remain with their owning modules.

## Existing implementation observed by source inspection

The existing main.tsx explicitly passes only DEV, MODE and VITE_LOOP_PREVIEW to isSyntheticPreviewEnabled. The helper requires exact true/development/1 values. Existing MakeMoon, Home and About selections remain present, with trailing-slash normalization. The synthetic route displays a labelled foundation shell without onboarding, personal forms or a pretend investigation.

resolveLoopConfig requires exact local-synthetic mode, returns all four external adapters disabled, and rejects populated connection/private configuration and enabled AI/SMTP settings without echoing rejected values. Existing tests cover refusal cases and exact preview flags. vercel.json retains the existing routing/build/alias configuration and disables Git deployments. These are source observations, not runtime passes.

## Concrete blocker

The supplied failed controller run reaches React DOM's real createRoot implementation and throws 'Target container is not a DOM element'. The probe supplies a plain object as the root container because it intends to substitute createRoot with its rendering stub. Its Vite server configuration does not disable SSR dependency externalization. The observed stack demonstrates that the rendering substitution did not take effect.

This points to a controller harness resolution problem rather than evidence of a routing regression. The controller owner must ensure react-dom/client is processed by the probe plugin instead of externalized, for example through an appropriate SSR noExternal setting, and verify that substitution actually occurs. This proposed harness correction has not been executed or validated here. The controller files are outside the authorized output paths, so no harness patch is supplied.

Do not change application mounting to recognize probe globals, skip rendering, fabricate component markers or accept a non-DOM object merely to satisfy this harness. Such changes would undermine the requested actual-routing evidence. The current application source is preserved; this response supplies only the blocker report.

## Checks and evidence

All checks below are NOT YET RUN BY THIS AGENT in this turn.

- npm.cmd test: intended to assert exact local configuration, adapter refusal, safe errors and strict development-only preview predicates, alongside existing public-demo tests. No new observed outcome.
- npm.cmd run build: intended to verify compilation of the actual integrated application. No new observed outcome.
- C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-01-A: intended to verify deployment fencing, configuration refusals, seeded private-value exclusion from production output/source and 28 actual main.tsx route-identity cases. No new observed outcome.

Prior controller output supplied by the user reports configuration assertions passing, production build succeeding and the seeded production/source scan passing, followed by route-probe failure and overall exit 1. Those results belong to the prior run; its exact application revision is not established here. They are not claimed as fresh verification or task acceptance.

No browser/UI checks were performed. Static demo assets and the manual Pages workflow were not modified. Full demo playthrough, private-service security, persistence, provider capabilities and release readiness are not established.

## Gates and handoff

Provider/account controls, privacy G-E03, offer, capacity/support and content/release gates remain unresolved within their recorded scopes. DECISION-033 resolves eligibility holds and submission-time trial eligibility only; it does not configure other policies. No spending, provisioning, messages, deployment, admission, push or merge is authorized by this report.

Next action: controller owner repairs and verifies the route-probe dependency substitution, then runs the authorized checks against an exact pinned application artifact and attaches actual output. CODEX-01-B and CODEX-01-C retain their dependency order and cannot treat this blocked report as acceptance of CODEX-01-A.


## Controller re-verification after check-harness repair

2026-11-11T03:31:16.718297+00:00: the preceding blocker text records the earlier failed harness. The preserved source has now passed these actual protected checks on this tree. Independent review and task acceptance remain pending.

```text
["npm.cmd", "test"]: exit 0

> ocean-sound-explorer@0.1.0 test
> node --test tests/*.test.mjs

✔ native media starts synchronously in a tap and stop cannot award completion (1.4269ms)
✔ the expedition has two confidence rounds followed by three ocean rounds (0.9624ms)
✔ Web Audio playback schedules every source during the initiating gesture (1.5177ms)
✔ every public game has a distinct playable route and valid scripts (14.935ms)
✔ every game animal uses a bundled same-origin MP3 (5.8998ms)
✔ exact local mode returns disconnected adapters and does not mutate input (1.8091ms)
✔ missing, unknown, preview and production environments fail closed (0.4304ms)
✔ connections, private browser variables and enabled adapters are refused (1.6302ms)
✔ configuration rejection never includes the rejected value (0.4168ms)
✔ preview requires every exact flag and remains off in production (0.2331ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 149.7957


["npm.cmd", "run", "build"]: exit 0

> ocean-sound-explorer@0.1.0 build
> vite build

vite v8.0.13 building client environment for production...
[2K
transforming...✓ 1842 modules transformed.
rendering chunks...
computing gzip size...
dist/client/index.html                   0.73 kB │ gzip:  0.45 kB
dist/client/assets/index-DXQb-_Bt.css  160.59 kB │ gzip: 28.17 kB
dist/client/assets/index-B8JFZPtD.js   253.99 kB │ gzip: 81.49 kB

✓ built in 565ms


["C:\\Program Files\\Python314\\python.exe", "C:\\Users\\Arrgee\\.codex\\.chatgpt-projects\\g-p-6aa20bbf0df48191a58549f304e705de\\loop-adaptation\\.codex\\tools\\check_application_card.py", "--card", "CODEX-01-A"]: exit 0
Controller assertions passed: exact local mode, external adapters off, credential/config rejection, production preview disabled.

> ocean-sound-explorer@0.1.0 build
> vite build

vite v8.0.13 building client environment for production...
[2K
transforming...✓ 1842 modules transformed.
rendering chunks...
computing gzip size...
dist/client/index.html                   0.73 kB │ gzip:  0.45 kB
dist/client/assets/index-DXQb-_Bt.css  160.59 kB │ gzip: 28.17 kB
dist/client/assets/index-8YijOCEd.js   253.99 kB │ gzip: 81.49 kB

✓ built in 545ms
Actual main.tsx router passed28 module-identity cases including trailing slashes: original pages preserved; synthetic route dev-only.
Seeded production build/source scan passed: server-only env secret, private VITE_ value, private local fixture; forced preview flag.


```
