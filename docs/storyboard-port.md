# Storyboard workbench and field contract

The real workbench is `views/workshop.html`. The standalone prototype in source
is an interaction reference, never a production store. The public plugin ID and
existing persisted schema remain unchanged in 0.25.0.

## Field ownership

| Control / group | Stored source | Meaning |
| --- | --- | --- |
| Visual body | generationBrief; scene compatibility text | Structured authority. The complete editor synchronizes the plain display text on save. |
| Shot scale | scale | One of eight supported scales, or unset. It is not a productionPlan key. |
| Lighting | lighting; referenceFields.lighting | Lighting intent and explicit image bindings. |
| Camera motion | motion; referenceFields.motion | Video camera/movement direction. |
| Dialogue / narration | dialogue; referenceFields.dialogue | Spoken wording; an image request does not synthesize speech. |
| Effects | soundDesign.effects; referenceFields.effects | Reuse sound-design ownership and retain soundDesign.music. |
| Editorial duration | duration | Finite 0..600 seconds; images may use zero. Never infer source duration from this value. |
| Request preferences | generationSettings.operation/maxReferenceImages | Explicit operation and input count cap. Missing settings display their defaults. Not provider capability discovery. |
| Project configuration | production.ratio/style/fps/voice/music | Actual inherited values; video-only values are excluded from image input. Shot/project music can both apply. |
| Video strategy / planned frames | videoPlan and frame asset adoption | Planning intent. Does not override request settings or replace pinned @ image IDs. |
| Source length / handles | productionPlan | Explicit requested length, head/tail room, required events and retime policy. Distinct from measured output. |
| Material results | outputs, media, mediaInspections | Shot adoption, asset adoption, registration and reported measurements are separate states. |
| Narrative / continuity | productionPlan, continuityPlan, beat mapping | Source scene, required events and cross-shot state. |
| Quality reviews | reviews and current dependency status | Scope-specific evidence. Save/adoption success is not approval. |
| Episode assembly | editPlans keyed by episodeId | Clip trims/speed, independent audio tracks and cut notes. Separate from shot generation inputs. |

Structured fields are authoritative when present. Plain-field Agent updates must
explicitly reconcile or remove matching documents. referenceFields is a whole-object
replacement or null; omitted structured fields fall back to the plain value. Asset
renames resolve from stable IDs. Ordinary text never creates a reference.

## Shared implementation

`lib/shot-authoring.js` exports FilmShotAuthoring in Node and browsers:

- SCALES, FIELDS, fromShot, validateDraft, text, patch and compile.
- patch returns one detached atomic update, preserving music/plans/asset links.
- compile returns prompt, exact ordered image slots, applicable parameters and
  omittedFields. UI preview and backend preparation use this implementation.
- Image input includes body/scale/lighting and project ratio/style. Video input
  additionally includes applicable motion/speech/effects/audio direction, edit
  budget, explicit source length/handles and project FPS.
- Body/motion/dialogue are bounded to 2000 characters; lighting/effects to 8000.
  Validation rejects oversize authored data rather than silently truncating it.

## Persistence and delivery

- bone.generation.save accepts the full patch plus id, shotId and expectedShotRevision.
- bone.shot.update guards shot revision. Add/move/delete guard production revision;
  delete also guards shot revision. Adds require a real selected episode/beat.
- Moves use global document indexes; UI resolves the same-episode neighbor first.
- Registered image association is current asset.mediaId or explicit referenceMediaIds.
  Adoption keeps historical associations, so pinned references remain stable.
- The compatibility import-image channel accepts explicit PNG/JPEG <=2 MiB,
  validates canonical base64/signature/version/locks and preserves source provenance.
  The focused editor consumes existing registered images, with no import chooser.
- Saved input export checks the reviewed production/shot revision, verifies bytes,
  reads chunks under requestHash and re-prepares after the final read.
- Draft exports are marked saved:false, with inputHash and base revisions. They
  cannot masquerade as a saved backend request. Missing/stale media blocks delivery.
- External provider calls remain separately authorized Agent actions. No path
  guessing, implicit frame-role conversion or fabricated generated output.

Detailed reference limits and consumer sequencing: [reference-handoff.md](reference-handoff.md).

## Presentation

Use the neutral workbench shell and existing project/story/script/storyboard/config
navigation. The table has nine columns and sticky number/actions; card/table switch
precedes the custom episode dropdown. Field shortcuts and the operations menu open
one complete two-column editor. All five text fields support exact image references.

The mention menu anchors to the caret, or clicked chip for replacement. Character,
scene, prop/product and style tabs filter candidates and assign matching purpose;
auto/first/last tabs allow all eligible images. Typed names refine that set. Mouse
selection preserves the caret, keyboard navigation remains available, and choosing
a tab alone never changes a stored binding.

Card view is always visible: generation inputs and material results in responsive
columns; production constraints, narrative/continuity and shot review below.
Episode editing/reviews appear inline with an explicit episode heading. The toolbar
button focuses that section rather than opening a modal. No business accordions,
duplicate primary preview, repeated authored fields or duplicate production plan.
Switching shot/view/project disposes sequence playback and ignores late results.

The focused shot editor contains cancel/export/save and compact saved state.
Conflict reconciliation appears only when needed and preserves edited fields.
Mode/count/frame errors lead with Chinese guidance; technical details are collapsed.
Suggested mode changes require an explicit click and affect only the local draft.

## Acceptance

[0.25.0 acceptance](acceptance-0.25.0.md) records commands, results and boundaries.
The persistent browser suites use real main.js plus workshop.html with isolated
private storage. They cover fields, source bytes, mode semantics, imports/pinned
versions at the host boundary, CRUD, conflicts, cancellation, reload, custom menus,
responsive layout, scoped reviews, sequence cleanup and unchanged data on browse.
No real provider or user production is part of automated acceptance.
