# Ocean Sound Explorer Backlog

This file is the source of truth for implementation work.

## Working rules

1. Work on the highest-priority executable item with `Status: TODO`.
2. Before coding, inspect the relevant existing code and confirm the acceptance criteria against the current implementation.
3. Change the item to `IN_PROGRESS` before implementation.
4. Implement only that item unless a dependency is required.
5. Run the relevant tests/build and manually verify the changed flow when possible.
6. Mark an item `DONE` only after verification. Record the commit SHA and verification performed.
7. If blocked, mark it `BLOCKED`, record the blocker, and move to the next executable item.
8. Do not claim something is deployed unless the production deployment has also been checked.

Allowed states: `TODO` → `IN_PROGRESS` → `VERIFY` → `DONE`, or `BLOCKED`.

---

## TODO

### OSE-005 — Add “learn more sounds” after the game
Status: TODO
Priority: P1

Goal:
After completing the quiz, let the child explore additional animal sounds without another test.

Requirements:
- Add a clear “Learn more sounds” option on the mission-complete screen.
- Include Dolphin and Seal as learn-only animals.
- Each learn card should show the animal name, a simple visual/icon, and a button to hear its sound.
- This section should feel optional and celebratory, not like another quiz round.
- Preserve the existing “Play again” action.

Acceptance criteria:
- Mission-complete screen exposes “Learn more sounds”.
- Child can play Dolphin and Seal sounds independently.
- Playback does not interfere with narration or create overlapping audio.
- “Play again” still resets the quiz correctly.
- Existing quiz rounds remain unchanged.
- Build/tests pass.

---

## DONE

### OSE-001 — Change framing from mystery recording to identifying the animal
Status: DONE
Priority: P0

Verified in current main branch:
- Intro asks “Who made that sound?”
- Round prompts ask which animal made the sound.

### OSE-002 — Add two confidence-building practice rounds
Status: DONE
Priority: P0

Verified in current main branch:
- Owl practice round exists.
- Horse practice round exists.
- Practice rounds occur before ocean-animal rounds.

### OSE-003 — Add spoken directions for how to play
Status: DONE
Priority: P0

Verified in current main branch:
- Spoken welcome explains that easy rounds come first.
- Spoken instructions tell the child to tap Play sound and choose the animal.
- Round transitions include spoken guidance.

### OSE-004 — Use simple animal choices rather than prior-knowledge-heavy mystery framing
Status: DONE
Priority: P0

Verified in current main branch:
- Owl/Horse use two choices.
- Ocean rounds expose named animal choices.

---

## Template for new items

### OSE-XXX — Short title
Status: TODO
Priority: P1

Goal:
One sentence describing the outcome.

Requirements:
- Requirement 1
- Requirement 2

Acceptance criteria:
- Observable result 1
- Observable result 2
- Build/tests pass
