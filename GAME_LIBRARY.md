# Public game library — November 5, 2026

The homepage exposes all ten existing games. Angelfish Adventure and Octopus
Escape lead the list so viewers of the MIT Solve pitch can find both demos.
This change is based on production main, not the separate homepage redesign.

Six newly hosted pages come from the de-identified public copies in
rasnag/Curiosity-Loop at d2380a42ab9c257ba98ab822f368aa933f824efd:

| Source in games/public | Website route |
| --- | --- |
| angelfish-adventure.html | /angelfish/ |
| feed-the-white-tiger.html | /white-tiger/ |
| giant-squid-dive.html | /giant-squid-dive/ |
| poohsticks-night.html | /poohsticks/ |
| z-hunt.html | /z-hunt/ |
| zoo-kitchen.html | /zoo-kitchen/ |

Angelfish and Squid also receive a visible example-name note on their opening
screens. Existing public Shark Night, Octopus Escape, Ocean Sound Explorer and
Make the Moon are preserved. The library contains eight pilot prototypes plus
the two earlier experiments; this is not a new claim about pilot participation.

Verification: all five automated tests and the Vite production build pass.
Every game opens in the built-site browser preview; Angelfish feeding was
played through to its explanation and plate log. The library has ten links
and fits a 390-pixel phone viewport without horizontal overflow. This is a
hosting and entry-flow check, not a complete play-through of every game or
review of every external video. Vite development mode does not serve public
directory indexes as game routes; use npm run build then npm run preview.

Keep lib/games.mjs and the prepared public game files together when adding
games. The catalogue test catches missing pages and invalid inline scripts.
