# Local mock generation/editor slice

GENERATION-LOCAL-01 · Codex · November13,2026 · implementation candidate, not accepted

## Authority and honest scope

DECISION-042 / APPROVAL-009 permits only invented questions and deterministic mock responses. Full CODEX-05-A and CODEX-05-G remain OPEN. No real provider call, credential reader, spending, science/pattern approval, publication, assignment or delivery exists here. This is the engineering workflow, not evidence that AI can produce a valid investigation. The shared engineering reference is v1.2, approved SHA25602adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79, especially ADR-E02–06 and WM-05.

The fixture retains the existing00-B adventure fields and fixture-1/fixture-engine-1 semantics: balanced=>stable,offset=>tips. They are invented rules, not a settled physical simulation. The full production generation_request/output envelopes, source/fit validation, real provider/prompt/pattern release and review/publication lifecycle are not established by this slice.

## What to try

Using an actual local synthetic founder session, open /founder/generation (linked only when the service is explicitly configured). Select a currently accepted invented request. Original wording, corrected wording/agreed interpretation and ORIGINAL receipt/deadline stay separate. Save a mock request, then explicitly run its fixed test response. No automatic retry or repair occurs.

Valid fixture output becomes an unreviewed draft. Preview it, edit opening/help/off-screen placeholder, and confirm a successor. Previous revisions remain immutable; differences reference the actual predecessor. Selective regeneration creates a new explicit mock job and changes only the selected part after validation. Every successor has empty review evidence and publish_authority=false. Factual and human review remain pending. There is no Approve,Publish,Deliver or MakeAssignmentReady endpoint/button.

Invalid and unsupported responses remain failed/unsupported. Timeout and expired lease remain uncertain. Cancel stops preventable local work and fences late results. Changed request scope, child-profile revision, consent or current founder authority prevents stale work from being revealed/committed. Only current heads can be edited. Fixed mock scenarios exercise valid,invalid,unsupported,timeout and delayed handling.

## Interfaces, storage and recovery

createSyntheticGenerationService({env,db,auth,queue,journal,keys,clock,limits,provider}) uses actual local PostgreSQL, founder auth and the accepted queue's project interface. Mock provider objects must be branded by createSyntheticMockProvider; arbitrary adapters and remote modes are rejected. The worker files have no network client or credential loading. There is no provider fallback. The root probe's network trap covers specific APIs only; feature review must also inspect source imports/capabilities.

Selected local-mock-v1 limits: one attempt per explicit job,1000ms timeout,5000ms lease,10000ms elapsed bound,8192 input bytes,65536 output bytes and global concurrency1. These are test bounds, not selected G-E02 settings or production capacity. Revisions are bounded to63 per job and the client is bounded to64 including a comparison predecessor. Household facts are bounded; oversized/unsupported state fails closed.

Jobs and primary-committed command facts form the local outbox. Start commits an attempt/fence before mock work; no transaction stays open during provider await. Completion rechecks current household/consent/request/profile/founder and lease/fence. Explicit regeneration creates a new logical job; it does not reset an unknown attempt under a new key. UI recovery retries the original command or reconciles its recorded reference. It does not store private state in browser storage.

Migration013 stores opaque job/revision/command references and sealed facts, not raw question/draft text. The generation journal wraps accepted queue-journal encryption/hash-chain/fsync primitives in a separate directory with generation-domain-derived household/operator keys and a branded wrapper. A fresh namespace is a one-use capability, consumed before any append. A replacement journal or empty replacement primary cannot silently adopt old history. Wrong keys/corruption refuse access and preserve bytes. Every acknowledged primary fact must also exist in independently re-opened journal history. An append failure leaves retryable_unacknowledged, blocks new dependent work and permits original-key reconciliation. Late withdrawal suppresses ACK/private response even if primary work committed.

A held browser response gets a fresh accepted-request check before private rendering; selection/sequence guards reject old responses. Hidden/unloaded pages clear reachable private UI. Already viewed data cannot be remotely erased. Changed-scope pending evidence or another actor's pending command can require local controller recovery; there is no invented cross-scope erasure/restore claim.

This is one-process disposable local storage, not hosted/multi-host durability, a production restore implementation, privacy clearance or deletion SLA. Independent keys are supplied by the trusted fixture outside the content database; real key management remains gated.

## Traceability and cost

Each revision retains source/request/profile versions through its job; immutable parent revision, attempt, provider=deterministic-local-mock,model=mock-fixture-1,config/prompt/engine/validator versions and household-keyed input/output digests. Original question is preserved as untrusted data; only the original and an explicit separate current/agreed interpretation enter the mock input. Names, calibration, contact and raw history do not.

pattern_digest is explicitly an UNRELEASED fixture-rule-descriptor hash; asset_digest covers fixture allowlist labels, not an asset or engine release proof. They are not promoted to settled-pattern compatibility evidence. Real provider usage, estimated cash and billed cash stay null/unknown. A mock run is not a zero-cost produced game, measured throughput, founder-time saving or billing reconciliation.

## Verification state

The new actual service/HTTP/DOM suites exercise original-key replay, immutable edits, selective regeneration, invalid/unsupported/timeout output, cancellation/lease expiry, source/profile changes, cross-household key reuse/cancellation, founder demotion/disabling/expiry, withdrawal during journal append/held read, wrong keys and replacement-store refusal. At the initial recovery checkpoint18checks passed; subsequent UI clarification is being rechecked. Prior failing logs are preserved, not relabelled.

Before any partial merge: whole npm test/build, all unchanged04-C cumulative probes/type baseline/routes/private-output scans, independent fixture probe, actual current-source native CUA and actual Claude feature PASS (maximum3rounds). Setup actual Claude round2 PASS at planning7117fda, with original r1 retained. No full card closes or dependency unlocks from a partial result. See the exact source pins/limits in the approved partial setup specification and its actual review notes.
