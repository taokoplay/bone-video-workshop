# Production planning, editing and review contract

Version: 0.20.0. Additive to schemaVersion 1; no existing user snapshot is
rewritten on read. `duration` continues to mean the shot's intended edit budget,
now preserving fractional seconds (finite 0..600, no integer rounding). Historical
integer budgets are never guessed back into fractional values.

## Shot productionPlan

Optional whole-replacement object on add_shots/update_shot; null clears:
- sourceScene: nonempty screenplay scene reference (editorial label, not an ID).
- purpose: nonempty narrative purpose.
- requiredEvents: 1..12 nonempty strings describing indispensable observable events.
- generationDurationSeconds: finite >0..600; planned source duration, not measured.
- headHandleSeconds / tailHandleSeconds: finite >=0, sum strictly less than generation duration.
- retimePolicy: `allowed`, `silent-only`, or `forbidden`.
- editingNotes: text explaining omissions, coverage, dialogue and selection constraints.
A plan does not prove model support or usable footage. Refer to actual source
observations and playback before marking production checks supported.

## Persisted editorial state and tools

New top-level snapshot fields: `mediaInspections` (map keyed by media ID),
`editPlans` (map keyed by episode ID), `reviews` (append-only bounded list).
Only tools mutate; panels browse/copy scoped prompts and locally preview.
All new write tools require `expectedProductionRevision` and compare it inside
mutateProduction's queue. Failed writes are atomic. These mutations change
production revision, not shot revision. No direct private snapshot modification.

1. `record_media_inspection`: {id, expectedProductionRevision, mediaId,
sha256, durationSeconds, method, findings, usableRanges:[{inSeconds,outSeconds,note}]}.
Registered video/audio only; SHA must match, duration >0..86400, ranges finite
and within duration. These are explicitly Agent-reported measurements, not
host decoder certification or proof of viewing/listening. No full file path or
base64 in results. Same bytes retain identity; observation updates invalidate
reviews or selections that depended on their old observation.

2. `save_edit_plan`: {id, expectedProductionRevision, episodeId,
expectedEditRevision, clips:[{clipId,shotId,mediaId,inSeconds,outSeconds,speed,
includeSourceAudio,note}], audioTracks:[{trackId,mediaId,role,startSeconds,
inSeconds,outSeconds,gain,note}], cutNotes:[{fromClipId,toClipId,visual,audio}],
notes}. Whole plan replacement, <=200 clips, <=32 tracks, <=199 cutNotes.
expectedEditRevision is 0 for a new plan. Nonempty clips. Stable unique local
clipId/trackId strings; not fake media/shot IDs. A source can be selected more
than once; all shot references must belong to this episode. Video clips require
registered video; sound tracks registered audio. Every selected source requires
a matching mediaInspection and within-reported-length in/out. Compare source
shot provenance when present. Require current shot revision at save via dependency
capture, not by blindly accepting stale provenance. IncludeSourceAudio boolean
required; speed finite 0.25..4. If speed !=1, require a productionPlan with
retimePolicy allowed or silent-only + source audio disabled. forbidden rejects.
No policy/legacy shot defaults to speed1. Audio track speed is always1, gain0..1,
start >=0 and end <= edit duration (small numeric tolerance). Roles: dialogue,
ambience,effects,music. Cut notes only for consecutive clip IDs, no duplicate pair.
Hard-cut preview only. Audio overlap is explicit on independent tracks; cut-note
prose is planning information, not automatically executed transitions.
Clip output duration=(out-in)/speed. Sum clip durations is the cut-only plan's
actual selected duration; tracks overlap it, not add to it. Preserve original
files and outputs; saving a plan does not adopt a shot output or claim final export.
Store revision, dependency fingerprint per clip and per episode plan. On source,
shot, relevant asset, episode prose/beats or project canon changes, derived status
becomes stale. Retain the plan for comparison but block preview until refreshed.
Detect deleted/moved shots/media, reorder and missing episode references as stale.

3. `record_review`: {id, expectedProductionRevision, scope:{kind,episodeId,
shotId,fromClipId,toClipId}, category, verdict, evidence:[{mediaId,startSeconds,
endSeconds,note}], findings, nextAction}. Optional scope IDs omitted when unused.
Scope kinds: episode (text), shot (text/media), cut (consecutive actual edit clips),
sequence (saved edit plan). Categories: text,technical,visual,audio,continuity.
Verdicts: supported,needs-revision,not-verified. findings nonempty; nextAction
required text (may be empty for supported). Evidence notes required; media IDs
must be registered and related to scope; time bounds require matching inspection.
Supported non-text reviews require actual media evidence; supported cut/sequence
must cover every relevant selected video source and selected interval; audio review
must reference audio or video with intended source audio. A record is the reviewer's
statement, never host-certified quality. Each record stores dependency fingerprint
and derived freshness. New findings supersede earlier same scope/category without
erasing history. Any required newer failed/unverified or stale review cannot be
masked by an older supported review. Do not conflate unreviewed with supported.

`get_production`, `bone.get`, and workflow expose editorial overview (derived),
including plans with selected length/budget/delta, stale dependencies, candidates,
cut adjacency and latest effective reviews. Review status is derived, never a
mutable global approval flag. Existing workflow `complete` keeps structural/output
meaning for compatibility and must be labeled that way. Add budget warnings and
separate text/planning/media/review/edit stages. Do not call unreviewed output final.

## UI and preview

Keep current project/story/script/storyboard/config tabs and dark visual language.
Storyboard exposes planning, registered source candidates, reviews, edit selection,
cut review and segment preview. Agent performs persistence; panel buttons copy
precise target IDs and current revision. Show planned generation length, edit
budget, Agent-reported source measurements, selected duration and review status
separately. Legacy fields absent -> not yet planned/reviewed, never auto-upgrade.

Preview uses only validated `bone.media` responses. Decode metadata and reject
ranges beyond the actual browser duration (reported measurements may be wrong).
Preview local clips at their in/out and constant playbackRate, plus explicit
independent audioTracks mapped onto the preview timeline. Select contiguous
clip subsets, especially adjacent pairs. Pause/seek/next loading must stop previous
media and discard stale promises across rerenders/work changes. Background source
loading pauses the preview clock; visible error states replace unsupported-media
claims. No export promise, no invented mixing or frame-accurate render guarantee.

## Acceptance


Preview resource bounds: contiguous groups of1..8 clips, at most192MiB distinct
registered source bytes per group. This is local browser playback, not a sample-
accurate offline render or a final export. Await source seeks before starting;
never await unresolved audio play promises inside video out-point monitoring.
Unused review scope/evidence-time and media target/revision fields accept null
as omission for strict callers; exclusive target/provenance guards still apply.
Timed non-text supported evidence requires bounded observations; metadata alone
must never be described by the Agent as visual/listening proof.
- 24*1.5 + 12*2 remains60 after registered add/update and panel readback.
- Planned generation/source sums never count as episode edit budget.
- Save/reload a two-clip sequence using a registered source twice, trimmed and
  retimed; actual preview duration follows source ranges/speeds.
- Reject invalid/out-of-bounds ranges, wrong media kind, stale production/edit
  revisions, forbidden retiming and cross-episode/obsolete shot provenance.
- A rule/prose/relevant-asset/shot/source observation or selection change makes
  related reviews stale; unrelated asset edits do not invalidate unrelated shots.
- Supported review requires scoped evidence and does not survive dependency drift.
- Missing refs and legacy snapshots remain readable; never guess source duration.
- Browser actual decoded video/audio, seek, pause, pair previews, end boundaries,
  load errors and late results; responsive both themes.
- No real production changes or paid generation for acceptance.
