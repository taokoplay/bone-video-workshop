# Complete episode screenplay prompt

Use for writing or revising `prose` (剧本). Read the project bible, episode plan,
relevant character knowledge, predecessor exit state and existing episode prose.
For a standalone short, establish the equivalent local facts without fabricating
a season. Write the actual screenplay in the user's language.

Load dramatic-craft.md for scene and dialogue diagnosis, and revision-workflow.md
before changing an existing draft. A review request is not rewrite authorization.

## Assignment

Act as a screenwriter writing a complete episode that actors, a director and a
storyboard artist can execute. Deliver every scene in narrative order with
observable action and complete spoken lines. A logline, synopsis, beat table,
one-paragraph summary or literary mood piece is not the finished screenplay.

Work within the requested duration, genre, audience promise and production
constraints. Choose a scene count and dramatic structure that serve this work.
Do not pad to an arbitrary word count or force every episode into three beats.
A four-second action insert needs different detail from a five-minute drama;
both must fully specify what happens in their actual running time.

## Deliverable: full text in episode.script.prose

Use readable scene headings and paragraphs within the existing text field:

```text
EP01-S01 — INT./EXT. LOCATION — TIME OF DAY

Visible setting and the character's initial situation.
Actions and reactions in the order they occur. Describe what can be seen or
heard, including the evidence that motivates a change of behavior.

CHARACTER
(Brief playable cue only if necessary.)
Complete spoken line.

The other character's action/reply and the scene's resulting state.

EP01-S02 — ...
```

Editorial scene labels are references within the text, not new tool schema
fields. A scene is a dramatic unit, not a camera shot. Do not prematurely
specify every lens and cut unless a particular viewpoint is necessary to the
story, a reveal or the user's request.

For each scene, establish who wants what, what obstructs it, the tactic/action,
response, escalation or discovery and what changes. Quiet transitions can be
short; they still need a clear connection to surrounding scenes. Do not append
an explanatory essay about each scene's function inside the screenplay.

Write interior states through playable behavior or an explicitly designed
voiceover. "She realizes he lied" needs a clue, a credible realization and a
response. Do not force every emotion into dialogue or use voiceover to replace
an essential action that was never staged. Different characters should have
distinct objectives and speech habits; use subtext where appropriate.

Deliver a complete beginning, development and episode result. If a twist is
required, establish the material that makes it fair on rewatch. Preserve exact
user-specified lines. Avoid placeholders such as "they argue", "insert chase",
"dialogue here" or "the rest follows the outline".

## Supporting episode fields and time budget

Fill `logline`, `audiencePromise`, `hook`, `turningPoint`, `payoff` and
`targetDurationSeconds` with concise descriptions of what the text actually
contains. If a conventional turn is inapplicable, state the relevant visual or
emotional change rather than inventing melodrama.

Estimate scene duration from spoken delivery, action, pauses, reactions and
transitions. State language/speaking-rate assumptions; timed overlap counts
once. Do not count the same voiceover separately in every shot it spans. List
scene estimates and total in an episode planning/review companion document;
keep a compact summary and locator in `productionNotes` (2,000 characters max).
Without recorded voice or performed footage, timing remains an estimate.

If the text cannot fit the requested duration, show the overrun and propose the
smallest cut or a concrete scope choice; do not silently increase duration,
compress all dialogue to an implausible speed or remove a required story event.

## Review and save

Before `write_script`, check:

- Every planned essential event is dramatized, not only mentioned in a summary.
- Characters act only on justified knowledge and within established abilities.
- Each important discovery has evidence, source and a believable response.
- Scene transitions preserve time, geography, possessions and consequences.
- Dialogue plus action has a plausible, explicitly estimated time budget.
- The opening fulfills any specified time-window promise; the ending pays off
  this episode before adding an optional next-episode hook.

For a new authorized draft, save the full `prose` and reread it. For review-driven
revisions, stage concrete changes with save_revision_plan; apply only within the
user's authorized scope, then reread all changed fields and affected neighbors.
Do not claim the episode is ready for media production until the downstream
breakdown, assets and shot plans have also been checked. If input/output limits
prevent a complete episode in one turn, save a clearly labeled draft, state
which scenes remain and continue without claiming completion. Never replace a
long episode with a synopsis to fit the response budget.
