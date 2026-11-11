# CODEX-06-A drafting evidence

Producing agent: Codex. Date: 2026-11-11. Status: source draft returned for controller writing, checks and independent review; not done or accepted. No files were written or checks executed by this drafter, under the explicit read-only transport override.

## Authority and source evidence

Used the verified read-only sources supplied in this turn: SOURCE_OF_TRUTH.md, application AGENTS.md, shared governance, PROJECT_CONTEXT v1.91, approved/APPROVALS.md, product v0.4.1, exact CODEX-06-A card, registered engineering README/design/module guide/review notes, CODEX-00-B CONTRACTS v1.1.1 (wire 1.1.0), CODEX-00-C screen map and prerequisite status evidence. These are supplied snapshots, not a newly refreshed remote-main verification. Supplied execution grant pins task blob 35cf6bfb03a2049dd1a85bc53bd4723e2344d2eb under APPROVAL-003; the current explicit instruction authorizes bounded implementation despite the historical specification's execution-not-authorized label.

Architecture: engineering v1.2, APPROVAL-004, source commit a676dd1fcab9c1a92d954c1805ffdfab2109736d, blob 78df8cf2857c0b32222a442329778cf43e8b05ee, registered SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79. This digest is cited from the verified register, not recomputed here.

Read the controller checker and engine/DOM/router probe sources supplied in the prompt. Additional actual read-only shell inspection obtained app/loop-preview.css, lib/loop/client-mode.mjs and app/globals.css; command exited 0. Observed existing public color tokens, 44px preview link styling, and the exact DEV=true / MODE=development / VITE_LOOP_PREVIEW=1 predicate. No secrets, environment values, family outputs or unrelated files were read.

## Interfaces, invariants and bounded implementation

WM-06 consumes the exact finite adventure 1.1.0 fixture-1 / fixture-engine-1 contract through validateAdventure and createPlayer. ADR-E04 and the WM-06 responsibility map require finite data, safe text rendering and no runtime AI/generated code. The player implements prediction/configuration before Test; no choice alone creates a trial. Test resolves the pinned balanced->stable / offset->tips toy map, retains predecessor action IDs and appends history. It clears both committed inputs after Test. New input clears current result while retaining history. Compare requires two distinct retained trial IDs.

The local full play_action envelope checks exact keys, versions, play/revision/pattern/epoch bindings, sequence CAS, unique accepted action IDs and supported action shapes before mutation. Every rejection throws before changing state. Input rules are cloned and frozen; snapshots are defensive clones. Only predict/configure/test/compare are implemented. Help, ending and off-screen actions reject without effects.

WM-07 owns server authorization, durable deduplication, atomic event/checkpoint/result transactions, acknowledged saving, journals and replay/recovery. Local CAS/ref checks confer none of those guarantees. This draft emits no server observation/save events and makes no Saved claim. Architecture review obligations concerning journal gaps, key management and committed provider dispatch remain with their owning modules and are not exercised here.

The React UI uses actual engine snapshots/dispatch; outcome mapping exists only in the engine. Native labelled buttons provide pressed states and button-only operation. The valid-session component has unconditional hooks; validation failure renders a generic alert. Validation is repeated on prop render, and changed valid specs remount the session. Adventure text is rendered as React text. All retained tries remain visible; no scoring or child ability label is present. Opening and model limits remain visible without printing the predetermined map before Test.

The new player route and trailing slash use the existing exact preview predicate. main.tsx passes only its three public flags. Old selectors and About fallback remain intact. No deployment/environment guard, dependency, manifest, approved artifact or ledger is returned or changed.

## Checks and observed outcomes

All implementation checks below are NOT YET RUN BY THIS DRAFTER. There are no observed test pass counts, build results, UI/browser observations or output artifact hashes to report. The sole executed operation was the read-only source inspection above.

| Exact check | Properties asserted | Observed outcome |
| --- | --- | --- |
| npm.cmd test | New tests exercise complete finite spec validation, two committed tries, outcome gating, retained predecessor provenance, stale/foreign/extra/unsupported rejection without state change, comparison and defensive rules/snapshots; existing tests remain included by the unchanged script | Not run |
| npm.cmd run build | Actual integrated Vite client graph and TSX bundling | Not run |
| C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-06-A | Pinned dev-only jsdom graph; independent exact-contract engine probe; real TSX transpilation and React/jsdom event interactions; environment/deployment fences; seeded production build/source scan; actual main.tsx module-identity routing across 36 cases | Not run; controller-owned check includes writes and is reserved for controller |

The controller's maintained DOM probe uses actual React handlers and engine, without hook/component mocks, to assert two button-only tries, disabled Test until inputs, pre-Test current-result gating, visible retained fields and safe invalid-prop handling. This is planned controller verification, not a claimed observation. Node built-ins are confined to tests/controller tooling; the drafted client modules import no Node built-ins.

Independent review must verify every acceptance criterion, hooks, keyboard/native control semantics, text safety, model/content disclaimers and absence of approval/science/save claims. Browser layout, narrow phone, zoom, contrast and assistive-technology QA have not been observed; jsdom cannot establish these properties. Controller must pin exact written artifact/build revisions and attach actual command output, exit status and findings before any technical acceptance. No model or prompt was used to generate runtime content and no provider evaluation is claimed.

## Gates and handoff

The invented fixture remains unreviewed synthetic development content, not a real boat/safety/science model, personalized game or reviewed production loading. No family inputs, live service, persistence, assets fetched, audio, help/difficulty implementation, reflection or ending is included. Open provider, privacy, offer and capacity/release gates remain preserved. DECISION-033 resolves G-E04a only within its recorded scope; this module neither changes that policy nor uses it to admit families.

Downstream boundaries: CODEX-06-B owns help/difficulty and related player extensions, CODEX-06-C owns ending/reflection, CODEX-07-A owns persistence/acknowledgement integration, and CODEX-05-C owns integrated reviewed content. CODEX-12 verification and CODEX-13 release retain their independent evidence and authorization gates. No push, merge, deployment, spending, provisioning or messaging occurred. Required next evidence is controller execution plus independent review, followed by any authorized corrections. No acceptance or completion status is asserted.
