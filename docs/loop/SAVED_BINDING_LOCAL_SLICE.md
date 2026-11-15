# Saved-player existing-play binding — local partial candidate

November15,2026 · Codex recovery worker · isolated candidate, NOT technical acceptance or full07-C completion.

## Authority and boundaries

Rasna directed isolated parallel workers, then one complete tryable journey. DECISION045/APPROVAL012 permits bounded invented local work with explicit producer/consumer seams;046/013 supplies the counted review ceiling. November15 user explicitly permitted relevant source/setup disclosure to Claude. Shared architecturev1.2 SHA25602adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79 governs current-authorized Resume/CommitAction, exact lineage and journal-before-ACK. Setup3 actual Claude PASS read contextv1.104 and required originals;014–016 are separate private-readiness exceptions, not this lane's allowance.

This candidate changes only LoopSavedPlayer.tsx, an exported transport boundary in saved-player.mjs, a dedicated new binding test and this document. Existing ACK/receipt validators and network catch behavior stay unchanged. Integrator owns actual authenticated transport, server scope resolution, bridge acknowledgement, Start, routes/auth/schema and whole-journey evidence. No main mutation, push, merge, provider calls, real data, spending, provisioning, deployment, public access or content/privacy approval.

## Caller contract

Old `<LoopSavedPlayer />` remains the strict developer saved preview, with credentials omitted and its existing play-only query behavior.

Optional trusted caller prop:

```tsx
<LoopSavedPlayer integration={{
  mode: 'authenticated-existing-play',
  playId: acknowledgedPlayId,
  bindingKey: opaqueMountIdentity,
  request: stableAuthenticatedRequest,
}} />
```

Integration object must be plain/null-prototype with exactly four enumerable DATA properties; reject getters, extra fields, invalid UUID, blank/over256-character bindingKey or nonfunction request without fallback. An OWN integration key means attempted binding even if undefined/null/false. Mode chosen at outer mount is sticky: attempting to add integration to an existing preview or remove/malform it from an integrated component permanently shows generic unavailable until the host remounts that outer component. Never fall back to raw developer Start.

Inside valid integrated mode, bindingKey+playId keys the inner session. A fresh object with same fields/function works; a changed request function under the same key immediately latches the inner session closed. Reverting the old function does not restore it. The render-time latch moves only toward closed, including conservatively closed abandoned renders; do not move it into an effect and expose one stale frame. New bindingKey/play remounts a fresh inner session, provided outer mode remains valid. Host must change bindingKey for actor/session/household/child/assignment/revision/view-context changes and remove old mounts when access changes. Hidden authority changes inside an unchanged function are outside this component's detection.

bindingKey is ONLY a React identity: no DOM, log, request-body or authority use. Integrated mode does not parse, reject or rewrite the current pathname/search/hash, hides developer replay/other-play navigation and omits its preview-shell link. Host owns surrounding family navigation.

## Actual transport seam

createSavedPlayerClient retains existing `{request,newActionId?}` and methods snapshot/subscribe/open/dispatch/retry/reload/replay. The optional helper `bindExistingPlayRequest({playId,request})` admits only existing logical `/saved/open` `{play_id:boundUUID}` and `/saved/action` `{play_id:boundUUID,command:existingWireEnvelopeWithSamePlay}`. Null/other-play/replay/mismatched command/extra fields reject locally before callback; no fake HTTP denial is synthesized. Callback Promise returns actual `{status,body}` unchanged to existing validators. Local rejected Open clears content through the existing Open path. A direct helper action rejection supplies no new ACK; generic client catch preserves last-confirmed state, never a fabricated server denial. Source mutation additionally hides the entire old UI immediately and mutes its subscription/transport.

The host mapper must derive current server-side authorized scope and may translate logical paths onto its actual protected routes. Cookie/bridge checks remain server-owned. This candidate has no endpoint or real-grant implementation. Mount only after the actual ACK-aware Start returns a valid existing play. Component entry, Resume and reload call Open(existingPlayId), never null. The trusted server returns exact existing07-B full envelope `{mode:'local-synthetic',production_ready:false,adventure,result,history}` or actual action receipt; same-key retry, CAS409,403 and malformed ACK behavior remain accepted-client behavior.

## Actual checks on candidate runtime

Targeted command: `node --test tests/loop-saved-binding.test.mjs tests/loop-saved-player.test.mjs` completed exit0:12pass,0fail,0skip,19325.1978ms on the corrected runtime. The three new cases cover helper negative boundaries; actual React→HTTP→migrated PGlite→play service→fsync journal injected save/Test/lost-response exact retry/fresh mount resume/current TEST withdrawal; StrictMode no spurious open error; malformed/removed/swapped bindings, preview→integration closure, URL preservation, bindingKey minimization, held old responses after either a play/key change or same-key transport latch, malformed ACK and unchanged default preview. Existing07-B tests ran unmodified, including fresh-client pending Test recovery for both engines. Original candidate's19255.439ms pass remains historical, not substituted as this corrected-source run.

`npm.cmd run build` exit0, Vite723ms; `git diff --check` exit0. Offline locked dependency install completed in isolated worktree, no tracked dependency inputs changed.

Important: tests seed a developer07-B producer to prove component/wire compatibility, NOT the combined same-question private bridge or real parent authentication. JSDOM is actual DOM evidence, not native browser evidence. Full suite, combined source build/checks, actual combined native browser journey and independent combined feature review remain pending with sole integrator. No new whole-card acceptance or consumer permission follows from these checks.

## Preserved review history

Broad expiry setup CLI interrupted by priority change, no verdict; conservatively counted. Earlier elevated invocation rejected before process start over private-source disclosure; no verdict/count, no workaround. Owner subsequently explicitly approved relevant Claude disclosure. Narrow setup1 actual changes_requested/incomplete setup read; setup2 actual changes_requested; setup3 actual PASS. Conservative setup count4of5. Feature code review is separate and explicitly preliminary; combined native/feature acceptance not yet claimed. All original records remain in root codex-outputs, not silently reset.

## Integration checklist

1. Sole integrator adopts exact reviewed blobs, not hand-edited conflicts; paths otherwise remain exclusive. Supply a module-level/memoized stable request callback (for example useCallback), not a new inline closure on each host render. Re-render the host at least once in combined verification without latching.
2. Map authenticated request callback with current actor/consent/bridge lineage and protected exact response shapes. Do not reuse the developer server's fixed scope or raw Start.
3. Mount from the same acknowledged request/assignment/play and preserve its URL. Root validates same-question Test→reload/fresh-tab confirmed resume, no extra Start/consumption, then withdrawal clearing.
4. Refresh main and run combined checks/build/native/independent review before serialized merge. Keep07-C open for missing real-grant expiry/revocation scope and preserve07-A/B accepted state.

## Preliminary code review correction

Code1 preliminary review passed exact-source adoption only on first candidate5ab0249, with disclosed incomplete authority reading. It did not establish guarded feature acceptance. Its minor StrictMode double-open alert and integrated developer-copy findings are corrected here: one initial Open per bound client across strict effect replay; integrated copy describes current local synthetic demo store and no NEW intake from this player, with no invented shutdown/persistence guarantee. Preview copy remains unchanged. Missing preview→integration and same-key held-response tests now actually pass. Code2 must read the remaining required originals through EOF; combined native/final review remains separately pending.
