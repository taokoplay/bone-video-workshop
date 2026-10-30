---
name: film-production
description: "Develop and review Bone 影视工厂 works: complete screenplays, manju, storyboards, edit handles and evidence reviews; stage scoped rewrite plans before authorized application. Use for 剧本、漫剧、分镜、评审、改写、剪辑 and 修订 in Bone."
---

# Bone film production

Create the requested deliverable, not merely a successful tool call. Write
creative content in the user's language. Use registered Bone tools to save
production content; a chat response alone does not update the workbench.
Discover the current tool names; the host may prefix them with the plugin ID.

## Task object and operation boundary

First distinguish plugin/software work from an actual production. A work used
as an example in a plugin discussion is not authorized for mutation. When the
user says improve the plugin, change code/skills and isolated fixtures only;
do not write or restore real works. Resolve ambiguous "optimize" from the full
conversation, not merely the last noun; ask only if material ambiguity remains.

Load revision-workflow.md for any review, optimization or rewrite. Review-only
may save record_review but never changes canon/prose/beats/assets/shots. Proposals
use save_revision_plan without applying. Explicitly authorized rewrites stage
and read their concrete diff, then apply_revision_plan with current revision and
truthful authorization. Existing permission persists; don't repeatedly ask.
Applying is not verification: reread changed fields and affected neighbors, then
record a fresh evidence-based conclusion. Never infer authorization from failure.

## Read state and select the stage

1. Use `list_productions`; create a work only when requested or clearly needed.
   Never invent production, episode, beat, asset, shot or media IDs.
2. Read `get_production` and `get_workflow_status` before continuing/editing.
   Read referenced project documents, existing prose and relevant approved
   content. Preserve locks, user decisions and unrelated work.
3. Identify the user's requested stage and finish that scope. A request for
   development, a screenplay or review does not authorize media generation.
4. Separate hard constraints, preferences, established facts, proposed choices
   and unknowns. Infer reversible details and label assumptions; ask only for
   material conflicts or missing decisions that change the authorized result.
5. Load the relevant stage prompt(s) below before drafting. Use their actual
   inputs, deliverables and review criteria, not just their role titles.

| Stage | Read this prompt | Output |
|---|---|---|
| Project development / world / character setup | [project-development.md](references/project-development.md) | Project bible, rules, history, characters, series premise |
| Multi-episode structure | [series-planning.md](references/series-planning.md) | Causal episode plan, knowledge/continuity and setup/payoff ledgers |
| Complete episode screenplay (剧本) | [episode-screenplay.md](references/episode-screenplay.md) | Full ordered scenes, actions and complete dialogue in `prose` |
| Script breakdown (脚本) | [script-breakdown.md](references/script-breakdown.md) | Source-mapped structured `beats` |
| Asset design / storyboard | [assets-storyboard.md](references/assets-storyboard.md) | Stable assets and executable shot plans |
| Frames / video / speech / sound | [media-production.md](references/media-production.md) | Capability-specific prompts and real inspected media |
| Stage review / revision / handoff | [review.md](references/review.md) | Evidence-based findings and smallest corrections |
| Source measurement / editing / cut review | [editing-review.md](references/editing-review.md) | Reported source observations, saved selections, stale-aware reviews and segment preview |
| Task scope / proposed repair / authorized rewrite / recovery | [revision-workflow.md](references/revision-workflow.md) | Separate review, proposal, application and conditional restore |
| Dramatic craft / dialogue / manju / blocking | [dramatic-craft.md](references/dramatic-craft.md) | Evidence-based scene and three-shot diagnosis without genre quotas |

For a new series, establish the bible and full series outline before expanding
episode one. For a standalone short use a proportionate local setup. Images and
promos use their communication goals and factual constraints; do not impose a
fictional world, suspense formula or episode cliffhanger on every kind of work.

A screenplay must be complete at its intended length. A one-line logline,
synopsis, list of beats or engineering fixture does not satisfy a request for
a shootable episode. Do not enforce an arbitrary word count or minimum number
of beats; validate observable action, full speech, causal change and timing.

Read dramatic-craft.md for episode creation or professional text review. Keep
prose as the complete screenplay, use source-mapped beats as production breakdown,
and verify required events against the actual scenes. Estimates must name their
assumptions; labels, field counts and artificial consensus cannot prove quality.

## Native project bible and companion documents

Persist the four project-wide sections directly in the production through
`create_production` or `update_production`. They are readable in `get_production`
and displayed on the Project page:

| Project section | Saved field | Limit |
|---|---|---|
| World background | `projectBible.background` | 20,000 characters |
| World rules and knowledge constraints | `projectBible.rules` | 20,000 |
| Historical timeline | `projectBible.timeline` | 20,000 |
| Whole-series story arc | `arc` | 4,000 |

`projectBible` is a section-level patch: send only changed sections; omission
preserves existing content and an explicit empty string clears that section.
Null, unknown keys, non-text values and oversize sections are rejected. Read
the saved production before and after editing. Never clear other sections by
passing blank placeholders. Save each character's dossier in its own character
asset `profile` using `add_assets`/`update_asset`, not `projectBible.characters`.
Each asset has `description` (introduction, 2,000 characters), `profile`
(dossier/detailed specification, 20,000), `imagePrompt` (generation prompt,
8,000), and `negativePrompt` (avoidance/consistency constraints, 8,000).
Omitted fields remain unchanged; empty strings explicitly clear a field.
For sound assets, imagePrompt may be empty or describe sound production;
never imply that sound assets require image generation. The assets UI exposes
these fields with copy actions. Keep prompt instructions separate from prose.

Legacy `projectBible.characters` remains readable as unassigned character
material in the asset library. Match identities to actual assets, preserve
locks and other fields, save and reread each profile, and clear the legacy
text only after all information has been safely assigned. Do not guess names,
duplicate characters or remove unresolved information to hide the notice.

Do not save these core sections solely in external documents or paste them
into `brief`/episode prose. Existing companion bibles are not automatically
imported: read them, reconcile with current saved facts and explicitly write
the intended sections. Preserve the original files and any valid old locators.
Do not invent approval status from the Project page's filled-section count.

Keep expanded series plans, source maps and review evidence in authorized
Agent-managed workspace files when needed:

```text
bone-projects/<actual-production-id>/series-plan.md
bone-projects/<actual-production-id>/episodes/<actual-episode-id>-planning.md
bone-projects/<actual-production-id>/episodes/<actual-episode-id>-review.md
```

Reuse existing user paths; check before writing. Read companion files with
Agent file tools, not the media importer. Retain short plan/review locators
in episode `productionNotes`; a short series-plan locator may accompany the
causal summary in `arc`. Files are not embedded or automatically moved/deleted
with a production. Core project settings do not require a workspace file tool.

Other field limits: `brief` 2,000 characters; episode `prose` 200,000;
`productionNotes` and other short episode fields 2,000; asset `description`
2,000. Keep full scenes/action/dialogue in `prose`, not beats. Do not silently
truncate content. If a detailed appendix exceeds a native section limit,
retain the substantive core in the project and identify the external appendix.
Editorial labels are document references, not invented Bone IDs or revisions.

## Tool contracts and production sequence

Write the complete screenplay with `write_script`. Use `write_episodes` with
the existing episode ID for beats. Its beats array replaces the entire list;
retain other beats with their existing `beatId` and preserve episode prose and
metadata. Create shots only after their source screenplay and beats exist.

Register reusable roles/scenes/props/styles and frame assets with `add_assets`.
Each `add_shots` entry needs a real `beatId` and owning episode. A beat can have
several shots; each shot maps to one beat. Moving a shot to another episode
requires the target episode's `beatId` in the same update.

Use `add_shots` or `update_shot` for `productionPlan`, `videoPlan`, `soundDesign`
and `continuityPlan`. Each nested value is a whole replacement; omit to retain,
null to clear. Pass current `expectedShotRevision` when updating a shot.
Frame and continuity-anchor assets must belong to the production and appear
in `assetIds`. First/last-frame mode requires a distinct explicit tail asset;
a null first-frame asset uses the adopted shot image. Text-to-video binds no
frame assets. Use useful action anchors, not a compulsory seven-phase template.
Exact speech belongs in `dialogue`; effects/music belong in `soundDesign`.

Keep `duration` as the fractional edit budget. `productionPlan` separately
records sourceScene, purpose, requiredEvents, generationDurationSeconds,
headHandleSeconds, tailHandleSeconds, retimePolicy and editingNotes. Handles
must leave time for the action; do not impose final edit timing on the full
generated performance. Reread exact budgets and compare with episode targets.
Never guess historical rounded values back into fractions without source evidence.

The plugin does not generate media itself. Use actually available authorized
generation tools or user-supplied files. Do not substitute static imagery or
procedural test footage for creative video unless explicitly requested.

1. Save real media under active-workspace `bone-media/<productionId>/`.
   Copy a generator's specific scratch result using an authorized file tool.
2. Call `register_media` with `id`, `path`, `kind`. For shot-specific output,
   also pass `shotId` and the revision captured before generation. Register
   reusable frame/asset artwork without shot provenance where supported.
3. Adopt artwork using `adopt_media` with `assetId` only. Do not silently unlock
   an approved asset. Asset adoption may invalidate dependent shot revisions.
4. Reread state before generating/adopting the shot video. For a shot output,
   adopt with `shotId`, `mediaId` and current `expectedShotRevision`; preserve
   other output kinds. Reject obsolete provenance rather than force it forward.
5. Omit unused optional targets or use null; empty strings are not omission.
   `register_media`/`adopt_media` support null unused target/revision fields;
   exactly one adoption target and current shot revision are still required.
   On a real schema conflict, report it once; do not repeat unchanged requests,
   alter permission grants or edit private snapshots directly.
6. After a conflict, reread and reconcile affected content. Read workflow status
   and apply the review prompt at the end of the requested stage.
7. When editing/review is requested, follow editing-review.md: measure actual
   sources with record_media_inspection, save reproducible ranges/speeds/audio
   using save_edit_plan, and persist scoped evidence through record_review.
   All three require current expectedProductionRevision; save_edit_plan also
   requires expectedEditRevision. Saving does not itself adopt media or export.

## Quality and delivery boundary

Maintain a requirement -> source scene/beat -> shot -> verification map in
companion planning/review documents. Keep actual chronology, character knowledge
and audience disclosure separate. Estimate dialogue/action time with assumptions;
measure real media where available. Scope revision to affected dependencies.

Report saved IDs/documents, current review evidence and remaining gaps separately.
`get_workflow_status.complete` retains structural/output-link meaning. Its
readiness, timingWarnings and editorial sections distinguish text saved, plans,
adoption, current edit selections and current/stale reviewer conclusions. No
field presence or supported record certifies artistic quality automatically.
Preview selected segments in the workbench; there is no offline render/export,
automatic story-quality scoring, speed-ramp editor or professional mastering
mixer. Explain unsupported steps honestly and preserve the next actionable step.
