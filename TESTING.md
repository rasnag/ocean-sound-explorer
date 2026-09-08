# Validation — 8 September 2026

Passed: production Vite static build; 100 randomized expeditions; target integrity; balanced answers; overlapping layers and timing bounds; synchronous user-gesture audio scheduling including future starts.

Playwright with real Microsoft Edge, mobile viewport/touch emulation and user-gesture autoplay policy passed all five rounds with actual NOAA MP3 decoding/playback, stopped-mix answer gating, feedback, duplicate-answer protection, scoring and restart. Answering Yes on all five rounds produced exactly 3/5. Layouts at 320, 390 and 1280 pixels had no horizontal overflow. Phone-size screenshots were visually reviewed.

WebMCP action registration, invalid input and accepted answers passed using a registry test double sharing the application state. Native WebMCP was not available to verify.

Playwright WebKit 26.5 for Windows exposes neither AudioContext nor webkitAudioContext. It showed the supported unavailable-audio error; this environment cannot test real WebKit audio. No physical iPhone test was performed. A hardware smoke test should cover both play buttons, lock/unlock, app switching, replay, volume and spoken help. Desktop emulation cannot certify every iOS version or hardware audio setting.

The initial generated Vinext build crashed at shutdown on Windows. The finished app uses a simple Vite static build, which exits successfully.

## Mobile playback correction

After a report of silent mobile audio, native HTMLAudioElement playback became the primary output. Real recordings are decoded and collaged into short WAV blobs before the play buttons are enabled; `play()` is invoked directly in the user tap, never after a timer or async preparation. iOS AudioSession is set to playback when supported. The media element clock and ended event control progress and answer unlocking. The original synchronous Web Audio scheduler remains a fallback.
