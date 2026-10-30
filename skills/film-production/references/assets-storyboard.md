# Asset and storyboard prompts

Contents: [Assets](#a-asset-direction), [Storyboard](#b-storyboard-direction),
[Generation plans](#choosing-generation-plans), [Review](#review-and-handoff).

Read the relevant screenplay, beat/source map, bible, existing assets and
current shot revisions. Build from the source, not from the brief alone.
Use the user's language for creative content.

Read dramatic-craft.md for manju presentation modes and blocking. Establish
scene entry presence, world-relative position, facing, posture, prop custody
and light state before camera instructions; later entrances are not extras
already present at the opening. Prompt-based geometry is a proposal until
actual accepted artwork/footage supports it. For local revision check the
previous-current-next window and preserve established facts; use the staged
revision workflow when improving existing content from review findings.

## A. Asset direction

Save each asset through `add_assets`/`update_asset`: `description` contains
its introduction and stable identity; `profile` contains the full character
dossier or detailed scene/prop background; `imagePrompt` contains the focused
generation prompt; `negativePrompt` contains avoidance/consistency constraints.
Limits are 2,000 / 20,000 / 8,000 / 8,000 characters respectively. Do not hide
character motivation, relationships or secrets in a project-wide character
blob. Reuse each character's actual asset ID. Legacy centralized text remains
visible in the asset library until explicitly reconciled and safely archived.

Act as the production designer establishing reusable, identifiable references.
Separate immutable identity from changing scene state.

For each needed character, location, product or prop, specify:

- Narrative purpose and editorial label; reuse the existing real asset ID.
- Stable silhouette, proportions, distinctive details, palette and materials.
- Costume/appearance variants with a reason and a clear scope of use.
- Location layout, entrances, landmarks, light sources and screen directions.
- Prop scale, handling, ownership and state changes where relevant.
- Style constraints shared across the project and references actually inspected.
- What must remain unchanged; what is still proposed rather than approved.

Register a supported asset type: character, scene, product, prop, style, brand
or sound (use the tool's established Chinese category values). Do not invent
new asset categories for administrative documents. Put stable specifications
in asset `description` and transient states in shot plans. Keep descriptions
within 2,000 characters; link expanded specifications from companion documents.

For artwork requests, construct a focused prompt from subject identity, view,
pose, clothing/materials, background, lighting, style and observable constraints.
Choose the reference views needed for the actual shots. A contact sheet is
useful only if its views are consistent and readable; do not demand unnecessary
turnarounds. Label ungenerated references as pending. Do not unlock an approved
asset silently or use an existing frame as proof of unseen character features.

## B. Storyboard direction

Act as the director and cinematographer. Translate each beat into the fewest
clear shots that preserve its information, performance and pacing. Do not add
empty shots just to reach a count. Do not compress multiple incompatible camera
positions or complex contact actions into one unachievable generation.

For each shot establish:

1. Source scene and beat, dramatic purpose, what the audience must perceive.
2. Subject, location, time, shot size, viewpoint, composition, screen positions,
   axis/eyelines, relevant light and visible state (`scene`).
3. Initial state -> ordered action -> necessary intermediate contact/pose ->
   final state; camera movement separately from subject movement (`motion`).
4. Exact speaker/line, voiceover versus in-frame speech, and timing (`dialogue`).
5. Duration budget: action, speech, pause, reaction and transition; note overlaps.
6. Reusable references and planned frame assets (`assetIds`).
7. Generation mode, transition and why it serves the shot (`videoPlan`).
8. Effects/music and sound responsibilities (`soundDesign`).
9. Entry/exit state, necessary anchors and audio transition (`continuityPlan`).

Persist sourceScene, purpose, requiredEvents and editingNotes in productionPlan.
Keep duration as the fractional edit budget; set generationDurationSeconds and
headHandleSeconds/tailHandleSeconds separately to cover the full action and
usable handles. Set retimePolicy explicitly (allowed/silent-only/forbidden).
Do not require a two-second generated source merely because the edit uses two
seconds. Match the outgoing and incoming selected intervals after inspection;
raw file endpoints need not be the final cut. Follow editing-review.md for the
actual source measurements, clip ranges and review records.

Use the existing schema rather than inventing fields for every filmmaking term.
Put detailed timing/coverage tables in the episode companion document. Bind a
real episode and beat ID on creation. Preserve one beat mapping per shot and
allow multiple shots per beat.

## Choosing generation plans

- Use `text-to-video` where the actual available workflow can meet the shot
  without frame conditioning; bind no first/last-frame assets in this mode.
- Use `image-to-video` when a stable starting composition/identity is essential.
- Use `first-last-frame` when distinct endpoints are useful and the generator
  actually supports them. An explicit tail asset is required; the same asset
  cannot occupy both explicit endpoint slots. A null first asset uses the
  adopted shot image.

Register frame assets first and include them in `assetIds`. Endpoint images
constrain visible states but do not prove motion, contact, POV or causality.
For handoffs, impacts, reflections, crowd interaction or moving cameras, decide
whether intermediate anchors, simpler staging, split shots or verified editing
can solve the problem. Do not promise an unavailable model capability.

## Review and handoff

Check predecessor exit -> current entry -> current exit -> successor entry.
Track costume, handedness, prop ownership, body orientation, gaze, light and
elapsed time. Intentional discontinuity needs a reason and a readable cue.

Sum shot durations and compare with the episode target and any opening time
window. Distinguish generated clip duration, selected source interval and final
edit duration; planning those intervals does not mean a timeline exists.

Save through `add_shots`/`update_shot`. Send complete nested plan objects when
replacing them and use current revisions. Reread mappings and plans. Handoff
only the current shot's stable anchors, required action, timing and acceptance
criteria to media generation, not the entire series bible.
