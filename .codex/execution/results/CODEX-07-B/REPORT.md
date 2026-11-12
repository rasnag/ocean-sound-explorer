# CODEX-07-B correction draft and evidence report

Codex · 2026-11-11 · Read-only response transport. Not done or accepted. Controller writing, checks, native CUA and independent review remain outstanding.

## Scope and authority

This correction returns complete replacement contents for app/LoopSavedPlayer.tsx and this report only. Preserve the existing other CODEX-07-B deliverables and unrelated work. No filesystem writes, checks, commits, installation, API dispatch, messages, pushes, merge or deployment were performed by this drafting agent.

Authority is Rasna's current exact-card implementation grant, APPROVAL-003 approved-copy blob b9e8de5d222985e9f601bc2782b93533961b5806. The historical task's Authorized:no label is superseded only within that explicit grant. Approved specifications, source-of-truth records, authorization/status ledgers and .claude remain read-only.

Architecture: registered engineering v1.2, APPROVAL-004, SHA-256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79; source commit a676dd1fcab9c1a92d954c1805ffdfab2109736d. CODEX-00-B contracts1.1.1 and wire1.1.0 apply. WM-06 owns the accepted finite transitions. WM-07 StartPlay/CommitAction/ResumePlay/Replay retains command dedupe, sequence CAS, immutable revision pins and atomic event/checkpoint/result commits. Current WM-10 consent authorization applies to every read and retry. Journal confirmation precedes acknowledgement; pending candidates and historical duplicate receipts cannot replace current Resume. Replay creates a distinct play and preserves earlier incomplete trials. No independent module architecture is introduced.

The supplied verified authority, architecture, module guide, review notes, contracts, task and dependency acceptance records were consulted. Actual protected service/HTTP/journal, finite engines, player-shell and LoopPlayer sources were read. Controller checker and probe sources were inspected rather than executed. These are local snapshot inputs; no remote-main freshness or new acceptance claim is made.

## Supplied failure and correction

The supplied controller log reports failure at saved_player_dom_probe.mjs:64: assert(httpCalls>8). Inspection of that probe identifies eight fetch operations in the existing scripted path: initial open, configure, Test, remount open, two history opens, pending prediction, retry and final withdrawn remount include nine conceptually listed transitions only if entry into play itself reads the server; in the existing implementation entry was local-only. More precisely, the existing fetch-producing calls are initial open, configure, Test, remount open, two history opens, pending prediction, retry, and withdrawn remount; the supplied count assertion nevertheless failed. No exact runtime call count was printed, so this report does not assert an observed numeric count or diagnose the counter as the sole cause.

The concrete product seam is independently visible in source: Start investigating and Resume this play previously changed only local view state. A parent could leave an introduction or paused recap open while another tab changed the play or consent was withdrawn, then enter active controls using the earlier receipt.

Both controls now use enterPlay. It requires the client's current ready state, captures the selected opaque play ID, calls client.open(existing ID), and enters the playing view only after that same play returns ready. This follows actual /saved/open and service.resume rather than issuing Start, Replay, a new action UUID or a gameplay write. A failed/pending/denied read retains the client's existing failure semantics and cannot enable the playing view. The existing client prevents concurrent operations and clears private content on403. The UI explains this read at both entry points.

The extra HTTP operation has an explicit current-state/authorization purpose. There is no polling, artificial fetch, weakened controller assertion or modification to protected probes. No claim is made that the correction has passed the failing assertion; only a controller rerun can establish that.

The accepted service, journal, engines, SQL, dependencies, fixture content, main.tsx preview allowlist, existing routes and fixed-audio controller remain unchanged by this correction. Audio still starts muted without autoplay. Entry revalidation uses the same pinned adventure and single developer-server lifetime.

## Exact checks and observed outcomes

| Check | Properties asserted | Outcome |
| --- | --- | --- |
| Source inspection of LoopSavedPlayer and saved DOM probe | Determine which controls perform actual HTTP and where the supplied assertion fails | Observed local-only Start/Resume handlers and the final httpCalls>8 assertion; no runtime count observed |
| git status --short | Identify unrelated work before preparing replacements | Failed with Git dubious-ownership protection for the sandbox account; configuration unchanged; no clean-worktree or HEAD claim |
| npm.cmd test | Preserve existing47 tests and current saved-client HTTP/SQL/journal tests, including stable retries, exactly-once Test, pending/backfill, conflict/reload, replay/history and withdrawal | NOT YET RUN by this agent |
| npm.cmd run build | Compile actual Vite/React candidate and preserve build boundaries | NOT YET RUN by this agent |
| C:\Program Files\Python314\python.exe C:\Users\Arrgee\.codex\.chatgpt-projects\g-p-6aa20bbf0df48191a58549f304e705de\loop-adaptation\.codex\tools\check_application_card.py --card CODEX-07-B | Cumulative protected engine/database/service/ending probes, real saved React flow over HTTP,52 actual route identities and seeded private-configuration build scan | NOT YET RUN by this agent; prior supplied failure remains unresolved until rerun |
| Native root CUA /loop-preview/saved |320px layout, keyboard/focus, real save, pending/retry, refresh exact revision, bidirectional history/replay, closed access and help/audio without autoplay | NOT RUN; no browser observation claimed |
| Entry revalidation failure scenarios | Withdraw or advance the play while its introduction/recap is open; Start/Resume must read current state, show access closure on403, and create no new play/trial/action | Proposed controller/native verification; NOT RUN |
| Required actual review workflow | Review exact written candidate after checks and root CUA | NOT RUN; no independent pass or acceptance claimed |

The transport override prohibits executing checks or writing temporary/build artifacts. The controller must write the returned files, pin their exact revision, rerun authorized checks, and attach exit statuses and actual observations. Prior controller output belongs to the prior candidate and does not establish this replacement passes.

## Boundaries and remaining evidence

Confirmation remains single-host-process-recovery-only and production_ready:false. Registry/replay coordination lasts only for the same running developer fixture. Browser refresh is not server restart recovery. No independent production durability, host/power-loss recovery, encrypted journal, full database restore, parent authentication or admission is established.

Architecture review obligations for journal failure/backfill continue through accepted07-A and the existing client retry envelope; broader reconciliation, keys, independent recovery and processor dispatch remain with their owning modules. Provider, privacy/G-E03, offer, capacity, content/voice and release gates remain open. DECISION-033 remains limited to its recorded eligibility/expiry selection.

07-C retains grant renewal/expiry and full offline policy with08-A/10-B.09 retains durable attributed feedback and new-wonder intake;12/13 retain wider verification and release. No completion event, score, learning inference, content approval or family-data use is introduced. Native CUA and independent review are still required before any controller technical acceptance.
