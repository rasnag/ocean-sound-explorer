# Local opening and ending contract

CODEX-06-C drafting output, 2026-11-11. Synthetic, unreviewed, memory-only preview. Controller checks and browser observations are pending.

Architecture: APPROVAL-004 engineering v1.2, SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`. This implements the WM-06 finite-player presentation boundary, ADR-E04 safe structured content, and CODEX-00-C F07/F09 interactions. It preserves WM-07's ownership of StartPlay/CommitAction/ResumePlay/Replay durability and WM-09's ownership of attributed feedback and the next child-scoped request. These local methods are typed view/navigation intents, not wire commands or semantic event receipts.

## Construction and identity

`createPlayerShell(adventure, {newPlayId, consentEpoch})` requires the complete validated assisted engine2 adventure, contract1.1.0, fixture-1, draft status. Options have exactly two enumerable own data properties: a synchronous trusted callback and a positive safe integer epoch. Invalid data, unsupported fields and options throw.

Construction prepares three actual `createAssistedPlayer` instances for explicit authored developer paths fast/medium/slow. The callback receives exactly `{kind:'start'|'replay', path, from_play_id:null|string, revision_id}`. Replay uses each corresponding old path's actual ID. IDs follow the assisted engine's nonempty bounded safe-text validation and must be unique within the proposed group and across all retained plays. Promises are invalid. No clock supplies identity or ordering. This developer group does not represent three purchased games, admissions or allowance consumption.

All IDs and all engines are prepared before installing the new group. Callback throws, invalid IDs and duplicates leave existing shell metadata and engine state unchanged. A reentrant mutation during identity preparation is rejected. The trusted callback itself must not mutate engine adapters it independently holds; the shell cannot roll back actions performed by a hostile trusted caller.

`current()` returns a frozen `{session_id,path,players:{fast,medium,slow}}` adapter. Players are actual engines, with frozen method adapters and a frozen map. The stable group key is its unique medium play ID. It is local identity, never an admission or server receipt. Metadata remains private. Core actions dispatch directly through the selected engine, preserving finite trusted outcome computation and existing sequence/action-reference checks.

## Intents and snapshots

`start()` accepts opening and enters playing. `finish()` accepts opening, playing, ending or new-wonder and enters ending without committing an engine action. `resume()` accepts ending and enters playing with the exact same engine, inputs, references, sequence and trials. Zero-Test endings are allowed.

`choosePath(path)` accepts only fast/medium/slow and selects that group's retained instance. `replay()` accepts ending only, prepares a fresh group and enters opening at the selected path. Every older engine remains retained. `returnToPlay(playId)` accepts only a known actual ID, selects its group/path and enters ending. Unknown IDs reject without effects. API callers can navigate to every retained ID; UI earlier-play buttons offer only groups preceding the current group.

`feedback(choice)` accepts ending and fits/different/not_now only. It stores a per-path local value `{source:'parent',choice,status:'not_saved_or_sent'}`. It does not dispatch feedback_submitted or claim recording. The UI first requires an optional disclosure; there are no personal text, question or email inputs.

`newWonder()` accepts ending and enters new-wonder with `{from_play_id,revision_id,requires_child_confirmation:true,status:'unavailable',production_submitted:false}`. No child assignment, F05 intake, URL navigation, request, booking or generation is connected. A future owning WM-04/09 integration must obtain explicit real child confirmation and apply its authorized intake contracts. `finish()` returns to ending without clearing the play.

`snapshot()` is a detached copy with view, active_play_id, path, recap, plays, feedback and new_wonder. Recap is `{status:'paused',trials:[actual engine trials],untested_choices:boolean}`. Untested is true if either current input reference remains. Plays are insertion-ordered groups and authored path order, each `{play_id,path,state:actualEngineSnapshot}`. Snapshot mutation cannot alter engines or metadata. Recap never infers understanding, success, mastery, an aha or a child's statement.

## Presentation and media

Default LoopPlayer uses endingFixtureAdventure and an explicit Start gate. `showShell:false` is a trusted compatibility prop only, independent of adventure fields and URLs. It preserves legacy engine1 and accepted assisted engine2 controls. Default shell requires actual engine2 validation; unsupported input fails closed.

The shell owns engine lifetimes. PlayerSession receives trusted players/path, stays mounted but hidden during same-group navigation, and derives controls from the selected actual engine. A new session key remounts presentation for a different group. Finishing stops/destroys the media controller and fences stale promises; resume creates an idle controller without autoplay and reapplies the mounted session's mute preference. Core help, side thread, comparison and trials survive because their state remains in the engines. Moving between groups stops old media through unmount; mute preference across different groups is not promised.

Opening identifies the child as investigator and gives the parent one required job: read and ask for a prediction. Model limits are separately available. Optional developer controls remain collapsed outside the child pane. Ending shows actual guess/position/result fields, labels incomplete/untested play, uses the adventure's actual offscreen text, and exposes separate resume/replay/new-wonder actions. View headings receive focus after navigation; native buttons, wrapping layouts and visible focus support keyboard and narrow-phone use, pending actual browser verification.

The new fixture imports the complete assisted fixture unchanged except new draft revision, investigator opening and a bounded supervised flat-paper position activity. No duration, real wonder, factual science approval or human playtest is invented. Existing fixtures, engines and fixed tone remain read-only. Reserved fixedLines.test/compare remain reserved; only ready is wired to Listen, as in accepted06-B.

## Ownership and gates

No network, storage, cookies, server save, durable acknowledgement, restore or production submission is implemented. Local preview labels explicitly say nothing is saved or sent. WM-07 owns transactional authorization, dedupe/CAS, atomic event/checkpoint/results and independent journal durability; WM-09 owns durable feedback and observation provenance. Journal failure/reconciliation, key-management and committed dispatch records from architecture review notes remain the owning server modules' obligations.

G-E03 privacy, provider/model, offer, capacity, content/voice review and release/admission gates remain open in their recorded scopes. DECISION-033's eligibility resolution is unchanged. No tests imply human content approval, real-family evidence, scientific validation or release readiness.

Controller correction: parent navigation lists every retained other group, including newer groups when viewing an older one. Original group numbers remain stable. Returning/resuming in either direction keeps the actual engine choices and tries; it creates no play or server event. The optional reflection prompt distinguishes zero, one and multiple actual tests.
