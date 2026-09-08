# Ocean Sound Explorer

A mobile-first static browser game for young ocean explorers. Five real NOAA animal calls, solo listening, randomized overlapping mystery soundscapes, yes/no answers, on-screen facts and a five-round replay loop.

## Run

Node 22.13+ is required.

    npm ci
    npm run dev
    npm test
    npm run build
    npm run preview

Build output: `dist/client`. Serve it from any static host. All asset paths are relative, including GitHub Pages subpaths. No backend, environment secrets, microphone access or user accounts.

## GitHub Pages

The included workflow tests, builds and deploys to Pages on every push to `main`, or through Actions → Deploy game → Run workflow. If Pages is not enabled, a repository administrator must choose Settings → Pages → Build and deployment → Source → GitHub Actions. Then rerun the workflow.

Expected Pages URL after successful deployment: https://rasnag.github.io/ocean-sound-explorer/

## Mobile audio architecture

- Start is a real button wired when React renders; no inert server-rendered start button.
- AudioContext creation/resume and a silent one-sample buffer happen directly in the tap handler.
- All five local MP3 files are fetched, decoded and normalized before play buttons appear. A loading failure offers retry; it never substitutes synthesized calls.
- Every source is scheduled synchronously from the play tap with `AudioBufferSourceNode.start(audioClockTime, offset, duration)`. No timer initiates animal audio. Promise callbacks never start playback.
- A pre-scheduled silent end marker tracks completion; requestAnimationFrame only updates visuals. Answers stay disabled until the mystery finishes.
- Stop, new round and page hiding cancel every layer. Hiding also discards the audio context; a subsequent tap recreates it, retaining decoded recordings. A stalled clock offers a tap-to-retry error.
- Replaying preserves the mystery and correct answer. New expeditions produce distinct plans with three present/two absent rounds. Duplicate answers cannot add points.

## Sources

See `public/credits.html`, `public/audio/sources.json` and `public/animals/sources.json`. NOAA calls are preserved as downloaded; the game uses excerpts and gain/panning only. The collages are not claims that all species were recorded together. No NOAA endorsement is implied.

## Tests

`npm test` exercises 100 randomized expeditions, presence/absence integrity, temporal overlap, bounds and synchronous user-gesture scheduling with a strict AudioContext test double. Browser QA is documented in `TESTING.md`. Real iPhone hardware testing remains useful: desktop mobile emulation cannot certify every iOS release or hardware audio setting.
