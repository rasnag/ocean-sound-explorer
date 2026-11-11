# CODEX-02-A drafting evidence

Producing agent: Codex. Date: 2026-11-11. Status: source draft returned for controller writing, checks and independent review; not accepted or marked done.

## Authority and source boundary

Task approved-copy blob: dbdfe7f54823dd5cc0683e24800887851c75cca3, APPROVAL-003. Current explicit instruction authorizes only the local synthetic discovery slice and seven listed output paths. No files were written, checks run, dependencies installed, external services called, commits made or deployment performed by this agent.

Read the supplied verified shared records and the local context sources SOURCE_OF_TRUTH.md, PROJECT_CONTEXT.md, approved/APPROVALS.md and engineering README/design/module guide/review notes. The context directory lacks AGENTS.md; the shared AGENTS.md was instead read from the explicitly named authoritative planning checkout. Application main.tsx and LoopPreview.tsx were read directly. Controller checker source was read, not executed. No remote freshness claim is made; this work uses the supplied dated verified snapshot and local records.

Architecture: registered engineering v1.2, APPROVAL-004, source commit a676dd1fcab9c1a92d954c1805ffdfab2109736d, blob 78df8cf2857c0b32222a442329778cf43e8b05ee, SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79. Digest is cited from the register, not newly computed.

## Interfaces and invariants

WM-02 VerifyAdult/RecordConsent/CreateChild remain downstream interfaces: this slice neither verifies adults nor records consent or child data. Optional interest is separate, initially unchecked, and exists only in component memory. Adult recovery exposes only an unavailable-preview explanation.

WM-04 ReadProductionEligibility and WM-13 admission configuration are advisory/fail-closed boundaries. getDiscoveryView validates explicit synthetic configuration and fresh safe-integer timestamps; missing, extra, unselected, invalid or expired values return unknown/no offer/no joining. Full and paused suppress terms and Join. A Join click repeats evaluation using clock(), including equality at expiry. No receipt, booking, account, entitlement or production transaction occurs.

ADR-E02/E04 and deployment/trust boundaries preserve anonymous demos and exclude private content and credentials from this new slice. main.tsx retains the explicit three-field public preview allowlist, existing guard and original page/player routes. Discovery and its trailing slash are selected only behind that guard. No network, storage or form submission is introduced.

Original production receipt plus 24 hours remains the service explanation; demos, signup and later acceptance cannot start/reset it. AI output is described as draft requiring validation and mandatory human review/edit/playtest before exact-version approval. No generation or publication is implemented.

Architecture review findings about journals, keys, dispatch records, deletion and restore belong to their owning transaction modules; this disconnected public slice creates none of those paths and claims no verification of them. DECISION-033 governs the resolved submission-time eligibility interpretation; no historical acceptance-time alternative is introduced.

## Returned artifacts

- lib/loop/discovery.mjs: pure finite configuration projection with copied supplied offer terms.
- app/LoopDiscovery.tsx and app/loop-discovery.css: synthetic state controls outside the family section, anonymous demo anchors, independent service explanation, truthful local handoffs, optional unsent interest demonstration, semantic controls and responsive forest/paper styling.
- app/main.tsx and app/LoopPreview.tsx: guarded discovery route and shell link, retaining existing routes and controls.
- tests/loop-discovery.test.mjs: configuration and actual React/jsdom event assertions using installed packages and in-memory TypeScript transformation, without mocked components/hooks or filesystem fixture writes.

## Checks and observed outcomes

No checks were run under the read-only transport override. The following are pending, not passing results:

1. npm.cmd test. New model assertions cover all missing required fields, empty/invalid terms, unknown/extra fields, territory, finite safe-integer clock/config timestamps, expiry equality, full/paused suppression and offer-copy isolation. Actual React/jsdom assertions cover anonymous links, no identity forms, Join independent of interest, unchecked/disabled initial interest, explicit unsent result, recovery explanation, click-time expiry denial and fixture-change reset. Transport/storage traps assert zero attempted fetch, beacon, storage or form operations during these interactions.
2. npm.cmd run build. Pending compilation/bundling evidence; no successful build is claimed.
3. C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-02-A. Pending independent finite-model/React event probes, dependency/deployment preservation checks, seeded private-environment/public-output scan and 44 actual main.tsx module-identity route cases. Controller owns protected temporary fixtures and their checks.

The only observed tool outcomes were successful source reads; the missing context AGENTS.md was resolved by reading the planning checkout's file. There is no observed test count, exit status, artifact hash, browser screenshot, phone layout result, keyboard walkthrough or assistive-technology result. DOM assertions are not browser/phone layout verification. Independent review and exact written-artifact/build pins remain required.

## Acceptance mapping and gates

Anonymous demos: direct existing anchors, no signup or identity collection in discovery; actual checks pending. Full/paused: no offer/Join or private fields, explicit no-place/no-delivery copy; actual checks pending. Configured terms: supplied strings copied/displayed only for fresh valid open, clearly fictional examples rather than commercial selections; negative and mutation assertions authored, execution pending.

Offer, provider, privacy, capacity, real admission, signup CODEX-02-B, consent CODEX-10-A and release gates remain open. No production trial defaults, spending, real data, backend interest transport or notification permission is selected. Downstream handoff: CODEX-02-B/02-C, CODEX-10-A and WM-11/12/13 capacity/verification/release owners retain their own scope and prerequisites. This draft does not accept any task or waive a dependency.
