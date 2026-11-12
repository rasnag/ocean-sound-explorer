# CODEX-07-B local saved-player contract

Draft v0.1 · Codex · 2026-11-11. Response-only source drafting; checks and browser observations have not been run by this agent. This document is not technical acceptance.

Authority: APPROVAL-003 CODEX-07-B approved-copy blob b9e8de5d222985e9f601bc2782b93533961b5806 and the current explicit execution instruction. Shared engineering architecture v1.2, APPROVAL-004, SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`; CODEX-00-B contracts1.1.1/wire1.1.0. WM-06 owns the existing deterministic finite engines; WM-07 owns StartPlay/CommitAction/ResumePlay/Replay, dedupe/CAS and acknowledgement; WM-10 owns the consent fence. ADR-E01/E02/E04/E05 and the household-first lock order, atomic event/checkpoint/result transaction, journal-before-acknowledgement and known-loss invariants apply. This adapter introduces no independent domain architecture.

## Developer server

`createSyntheticSavedServer({db,journal,env,scope,adventure,clock=Date.now,serve,testHooks})` constructs an actual node:http Server without listening or import effects. Exact local-synthetic configuration, a branded filesystem journal, actual transaction/query support, a validated trusted07-A scope and matching complete finite adventure are required. It constructs the accepted service with a fixed catalogue and a human-selected medium path with an explicit synthetic reason. Callers supply migrated disposable PGlite and invented relational rows. Published fixture rows are not content approval.

Only explicit numeric port plus127.0.0.1 binding is allowed. Actual Host and absent-or-exact Origin checks precede routing. Authorization, cookies, forwarded and supplied-identity headers are prohibited; User-Agent is allowed. JSON requests and headers are bounded to8KiB; timeouts are10seconds. Saved API responses use no-store, nosniff, no-referrer, restrictive CSP and no CORS. Errors are generic400/403/409/503; no progress is exposed on503. Unknown routes are404. An explicit trusted `serve(req,res)` callback may serve non-saved local UI assets; the entire `/saved` prefix is excluded from delegation, including malformed/query routes. No admin, SQL, token, identity-minting, remote or control endpoint exists.

POST bodies are exact:

- `/saved/open`: `{play_id:null|canonicalLowercaseUUID}`.
- `/saved/action`: `{play_id,command}`, with the original exact07-A action envelope.
- `/saved/replay`: `{play_id,command_id}`.

The initial registry includes only the trusted preallocated play. Open(null) uses one stable server-owned Start command and retries it if confirmation was lost or pending. Acknowledged subsequent opens use current service.resume. Open(existing) always resumes; unknown IDs deny without creating scope or play. No browser-supplied household, child, assignment, consent or token participates in authority.

Successful open/replay is exactly `{mode:'local-synthetic',production_ready:false,adventure,result,history}`. Adventure is the validated pinned server-owned spec; result is the actual current acknowledged07-A receipt. History entries are exactly `{play_id,trial_count,incomplete:true}`. Each count comes from a currently authorized acknowledged Resume; pending entries have null count. Any denial aborts the entire read. No completion event is invented. The selected play is resumed again after history collection. Action returns only its actual acknowledged receipt; an old duplicate is a historical command receipt and is never substituted for current Resume.

Replay verifies current source authorization, retains an immutable command/from/new-play/Start intent before Start, and allocates a fresh UUID within the same fixed assignment. Same command/from retries the same play and Start. Changed source under the same command conflicts. Source commands, trials and incomplete status are preserved. Ordinary open/reload creates no replay. Full replay responses resume current state, so an old Start receipt cannot rewind a newer checkpoint.

Optional trusted hooks are exactly `{beforeRespond:async({route,body,result})=>void}`. Arguments are defensive clones after the real operation. Returns are ignored. A throw can simulate a lost acknowledgement after an actual commit and yields generic503; it cannot replace identity, service results or journal confirmation. HTTP cannot configure hooks. Journal fault hooks belong to the actual journal supplied by the developer.

This is one intentionally developer-launched invented-household fixture, not parent authentication or production admission. Registry and replay intents live only for this server instance. Stopping it loses this coordination; arbitrary restart/reconstruction is not supported. Service/journal acknowledgements remain `acknowledgement_scope:'single-host-process-recovery-only'`, `production_ready:false`. No independent production durability, full database restore, host/power-loss safety, encryption or production durable replay claim follows.

## Client

`createSavedPlayerClient({request,newActionId})` returns snapshot, subscribe, open, dispatch, retry, reload and replay. request is an async transport returning actual `{status,body}`; default IDs use crypto.randomUUID. Construction/action extra fields reject. One in-flight operation and one bounded pending envelope are retained in memory. Snapshots are defensive recursively frozen copies. Listener failures cannot change receipts.

State is `{phase,play_id,confirmed,adventure,history,pending_action_id,error}`. Phases: idle/loading/ready/pending/failed/conflict/denied. confirmed is the actual acknowledged receipt. No optimistic engine transition is installed. During pending/failure the old confirmed state may remain, explicitly labelled last-confirmed. Network exceptions, timeouts and503 retain the serialized original envelope and UUID. Retry parses that same stored serialization; it never allocates another identity. Concurrent/dependent writes reject.409 requires explicit reload and never silently merges.403 clears all private state, pending operation and pin memory.

Receipts validate mode, acknowledgement scope, durability reference, exact field sets, pins, action/event cursors, finite state/trial outcomes, current references, help/comparison state and typed events. Trial validation invokes the accepted finite engines. Own action responses must equal the expected single transition from the confirmed state and match the exact play/action. Previously observed per-play spec/epoch/cursors cannot change or rewind. Full responses validate their complete adventure using accepted validators. Unsupported acknowledgement clears content and exposes failure. No response executes generated code.

Supported actions are predict/configure/test/compare and, for engine2 only, help/close_help/side_thread. Test references must equal the confirmed current prediction/configuration. The command carries wire1.1.0, pinned revision/pattern/epoch and confirmed sequence. A lifecycle/operation binding prevents unrelated responses from becoming selected state. Opening another play while an operation is pending rejects. Replay retains its own stable intent on uncertainty and switches only after acknowledgement.

`reload()` is an explicit caller-confirmed discard operation. UI first explains that the pending command may already have committed and offers Keep this page versus Discard page intent and reload. Reload then reads the same selected play. There is no silent merge or cancellation claim. A fresh client resumes the URL's non-authorizing play UUID. Browser payload persistence, localStorage/sessionStorage/IndexedDB/cache/service workers and bearer URLs are not used. Closing/refresh may lose unconfirmed memory intent; committed state can be resumed only against the same running fixture.

## UI and integration

Only `/loop-preview/saved` is added, behind the existing DEV/development/VITE_LOOP_PREVIEW allowlist. The complete import.meta.env object is never forwarded. Existing routes, memory-only player, discovery, finite engines, services, journal, migrations, fixed audio and dependencies stay unchanged. The preview shell appends a labelled local-fixture link.

The component uses real same-origin fetch POST JSON without credentials. The controller attaches Vite middleware through the trusted server callback on that same127.0.0.1:port; no cross-port Origin relaxation is needed. No launcher or Vite/dependency change is shipped by this card.

The UI shows initial/opening/error/status states, actual confirmed choices/tries, one-change position illustration, comparison, engine2 clues/side thread, pause/recap/off-screen content and distinct replay. All other retained plays are reachable in either direction without creating replays. It labels incomplete plays and unavailable/not-sent feedback/new-wonder intake. Content comes from the server-selected validated existing fixture; no generation or external audio occurs. Fixed audio uses the accepted controller and text fallback, starts muted, never autoplays, and stops on pause/unmount/play navigation. The existing fixture limits include memory-only wording from their original preview; surrounding saved-route copy explicitly states this route's narrower local-server confirmation semantics without editing the pinned spec.

Always-visible saved-status carries actual client phase; saved-root carries selected opaque play and confirmed revision; saved-trial marks actual confirmed tries; saved-test/retry/replay/start and data-saved-play hooks identify actual controls. Native controls, heading focus, wrapping layout, minimum46px buttons and320px styling are supplied. These are authored properties, not observed native-browser/accessibility results.

## Verification and handoff

The new Node tests exercise real HTTP → migrated disposable PGlite → actual07-A service → branded fsync journal → client, for both finite engines. Assertions cover lost-response same-envelope Test retry and SQL count, journal failure without candidate display, blocked dependent writes, same-key backfill, replay dedupe, old/new fresh-client navigation, stale-tab409/reload, wrong revision without added SQL command, unknown/extra/foreign-Origin/cookie denial, engine2 assistance and withdrawal clearing. A separate negative case rejects malformed acknowledgements.

NOT RUN BY THIS DRAFTING AGENT: npm.cmd test; npm.cmd run build; controller check_application_card.py --card CODEX-07-B. The controller's cumulative probes also include real React/jsdom over actual HTTP and52 main.tsx route identities, protected07-A behavior and seeded production secret/private-fixture scans. These probes were read, not executed. Their results must be recorded against the written artifact/build revision. Native CUA320px/keyboard/save/pending/refresh/replay/history/closed-access/help/audio remains independently required before Claude review. No UI or audible playback result is claimed here.

07-C with08-A/10-B retains grant renewal/expiry and full offline-policy ownership.00-F/10/13 retain independent recovery/privacy/release gates. Provider, offer, capacity, content/voice approval and G-E03 remain open; DECISION-033 resolves eligibility only within its explicit recorded scope. Downstream07-C/09 and verification12/13 must consume actual acknowledged facts rather than draft documents or primary-only candidates. No spending, provisioning, family data, messages, push, merge, deployment or admission occurs in this drafting output.

## Controller browser correction — November 11

The real browser sent an incidental localhost cookie with the document GET. Only GET/HEAD outside the saved API namespace may reach the trusted development asset handler; those cookie fields are stripped and confer no authority. All saved API cookies, forwarded/identity/authorization headers, foreign origins and unknown writes remain denied. A real HTTP regression proves both asset loading and unchanged API denial. No parent session or production access policy is introduced.

## Confirmed replay navigation

Generic Retry compares the confirmed returned play ID with the prior selected play. A confirmed new ID opens its introduction; action retries on the same play preserve the current view. An uncertain replay never switches early or allocates a second intent. The real React/HTTP regression waits for the post-commit503, retries, verifies two total sessions and retained old history, and requires the fresh introduction. Saving/server-stop limits remain visible in plain language; detailed test boundaries stay in the grown-up disclosure.
