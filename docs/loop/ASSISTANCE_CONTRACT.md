# Synthetic assistance contract

CODEX-06-B drafting output, 2026-11-11. Unreviewed synthetic development content only.

Architecture: registered engineering v1.2, APPROVAL-004, SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`. WM-06 finite transitions and ADR-E04 apply; WM-07 CommitAction supplies the envelope and sequence/reference invariants. This memory-only preview supplies no server authorization, durable transaction, save acknowledgment or production content approval.

## Finite adventure profile

Engine `fixture-engine-2` retains the complete adventure 1.1.0 field set from CODEX-00-B: contract_version, revision_id, pattern_version, engine_version, status, opening, limits, configurations, outcomes, assets, help, difficulty, side_thread and offscreen. Pattern is fixture-1, status draft, configurations exactly balanced/offset, outcomes exactly balanced=stable and offset=tips. Assets are empty or fixture-balance. Help contains exactly three nonempty plain-text strings; difficulty is exactly fast/medium/slow. Text is bounded to 2000 Unicode code points and rejects markup/executable syntax. Unknown fields and accessor properties fail. This engine version does not change the legacy engine1 profile.

## Player types

Construction options are exactly `{playId:string, consentEpoch:positiveSafeInteger, startingPath:'fast'|'medium'|'slow', startingReason:string}`. IDs/reason must contain non-whitespace text. Starting path and reason are explicit synthetic developer inputs, never inferred child characteristics.

`createAssistedPlayer(adventure, options)` returns `{snapshot(), dispatch(envelope)}`. Snapshots are detached mutable copies of internally frozen state: caller edits cannot affect the player.

The envelope is exactly `{contract_version:'1.1.0', play_id, action_id, expected_sequence:nonnegativeSafeInteger, consent_epoch, revision_id, pattern_version:'fixture-1', action}`. All core and assistance actions share one action-ID registry and one authoritative sequence. Scope mismatch, stale sequence, duplicate ID, unknown fields and invalid transitions throw before mutation. As in the legacy local preview, duplicate IDs reject; this is not the downstream server's idempotent retry receipt implementation.

Core actions retain their exact shapes: `{kind:'predict',prediction:'stable'|'tips'|'not_sure'}`, `{kind:'configure',configuration:'balanced'|'offset'}`, `{kind:'test',prediction_action_id,configuration_action_id}`, `{kind:'compare',trial_ids:[string,string]}`. Test requires both current committed references, derives its finite outcome and consumes those references. Each trial preserves prediction/configuration/test action IDs, resulting action sequence and play/revision/pattern scope.

Assistance actions are exactly `{kind:'help',level:1|2|3}`, `{kind:'close_help'}`, and `{kind:'side_thread',open:boolean}`. Additional snapshot fields are `starting_path`, `starting_reason`, `help_level:null|1|2|3`, `help_open:boolean`, `help_history:Array<{level:1|2|3,action_id:string,sequence:positiveSafeInteger}>`, and `side_thread_open:boolean`. A help visit appends its actual accepted action ID/resulting sequence. Closing or selecting a smaller level retains history. Assistance never changes prediction/configuration references, result, comparison or trials. These are local state additions; no unrestricted progress-event variant is emitted.

## Presentation

Help is voluntary and reversible. Level3 is a separately labelled authored demonstration, never a child trial/result. Optional side text is safely rendered and closable. Three separate in-memory player instances retain script histories. Developer A/B/C controls sit in initially collapsed adult details outside assisted-family. Default is explicitly authored medium. Path text changes explanation granularity without changing outcomes or classifying children. Help2/3 always supply the toy rule. No score, ending, persistence or Saved claim is added.

## Fixed audio

`fixedLines` has only ready/test/compare, each `{text:string,src:fixtureAudio.source}`. This controller-owned offline tone is not an approved voice recording. Lines are fixed encouragement, not adventure narration.

`createFixedAudio({audio,onState})` returns `play(id), replay(), mute(boolean), destroy(), snapshot()`. Snapshot is `{muted:boolean,status:'idle'|'playing'|'muted'|'unavailable'|'ended',line_id:null|'ready'|'test'|'compare'}`. Unknown IDs reject without media/state changes. Play calls the native-compatible element synchronously in the gesture; prior audio stops. Promise generations fence stale completions after replacement, mute, error, end or destroy. Errors retain text fallback. Mute pauses immediately; replay while muted and unmute never autoplay. Destroy detaches listeners and stops media. Audio never dispatches a game action.

The adult error fixture dispatches an error event on the actual audio element; it simulates an event, not a failed download. DOM media mocks can establish control behavior only. Native decoding/play/ended, audible output, keyboard operation and 320px layout require observed browser evidence before merge.

## Gates

Provider, privacy, offer, capacity, real content and actual stock-voice sample approval remain separately gated. DECISION-033 resolves historical G-E04a only within its recorded submission-time eligibility scope; this player changes no eligibility policy. Architecture review notes concerning journals, key management and dispatch records belong to downstream server modules and are not claimed implemented here.
