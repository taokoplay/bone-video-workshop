# Source selection, cut review and segment preview

Contents: [Time concepts](#keep-time-concepts-separate),
[Source observations](#report-measured-sources), [Edit plans](#save-a-reproducible-edit),
[Reviews and invalidation](#record-reviews-and-respect-invalidation).

Use for source measurement, trimming, retiming, cross-shot continuity review
or a local segment preview. Read current production, `workflow.editorial`,
`mediaInspections`, `editPlans`, `reviews` and affected shot production plans.
This stage does not grant permission to generate, export or overwrite media.

## Keep time concepts separate

- Shot `duration`: intended edit budget, fractional seconds preserved. Never
  replace it with the source length or silently stretch the episode target.
- `productionPlan.generationDurationSeconds`: planned source request length.
  `headHandleSeconds`/`tailHandleSeconds` are desired handles, not evidence.
- `record_media_inspection.durationSeconds`: Agent-reported measurement of
  actual registered bytes, with matching SHA and the measurement method.
- `usableRanges`: observations after inspecting real media. Empty when unknown;
  do not populate guessed action timestamps from a prompt.
- Clip `inSeconds`/`outSeconds`/`speed`: selected source interval and playback rate.
  Selected duration is `(out-in)/speed`. Parallel audio does not add to it.

A 6-second source may supply a 2-second edit. Missing action cannot be repaired
merely by generating a longer source or accelerating everything. Preserve full
contact/release, listening/reaction and stable entry/exit as appropriate. Do not
bake titles, black frames, music or forced cuts into a source meant for editing.

## Report measured sources

Call `record_media_inspection` with current `expectedProductionRevision`,
`mediaId`, matching `sha256`, measured `durationSeconds`, `method`, `findings`
and `usableRanges: [{inSeconds,outSeconds,note}]` (or []). This records a report,
not host decoder certification or proof that the whole clip was seen/heard.
Browser metadata can establish length; it cannot establish good performance or
intelligible speech. The panel independently checks actual lengths on preview.

Register each real candidate first. Multiple records may serve one shot; a
shared unbound source may serve several selections. Read shot provenance and
never relabel an obsolete shot-specific result with a new revision to force use.

## Save a reproducible edit

Use `save_edit_plan` with `id`, `episodeId`, current `expectedProductionRevision`
and `expectedEditRevision` (0 initially). Submit the complete clips/audioTracks/
cutNotes/notes, preserving retained entries and local IDs. Old schemes are not
silently merged. No file or shot output is replaced by this operation.

For each clip give stable `clipId`, real `shotId`/`mediaId`, in/out, `speed`,
explicit `includeSourceAudio` and `note`. Clips must belong to this episode and
reference registered video with a matching measured source length. One source
can supply several intervals. Do not invent camera angles by copying a file.
All clips are hard-cut in the current preview.

Speed is 0.25..4 and must obey the shot's `productionPlan.retimePolicy`:
`forbidden` rejects a non-1 speed; missing policy defaults to 1; `silent-only`
requires source audio off; `allowed` permits trying it, not claiming it looks
natural. Visible lip sync, gravity, rain and reflection motion still need review.
Slow motion is not automatically smooth just because playbackRate is reduced.

For each independent audio track give stable `trackId`, registered audio
`mediaId`, role (dialogue/ambience/effects/music), `startSeconds` on the edit
clock, source in/out, `gain` 0..1 and `note`. Track rate is1. Tracks can overlap
and cross cuts; their end must fit the plan. Avoid duplicate embedded video audio
when using a separate track. Louder-than-unity gain requires an actual prepared
mix, not clipping or invented preview support.

For each cut note give consecutive `fromClipId`/`toClipId`, `visual` and `audio`.
Describe phase, direction, eyeline, hand/prop/weight, light and audio continuity.
Notes do not automatically execute dissolves, speed ramps or effects. Use the
actual adopted outgoing/incoming intervals, not original file endpoints.

The workbench previews contiguous selections of1..8 clips, with at most192MiB
of distinct registered source bytes. Select a neighboring pair to diagnose a
cut. It decodes real video/audio and checks source ranges, applies constant
speed and explicit independent tracks. Loading may pause playback at a cut;
this is browser preview, not frame-exact offline rendering or final export.

## Record reviews and respect invalidation

Use `record_review` with current production revision, a scope, category,
verdict, evidence, findings and nextAction. Scope options:

- `{kind:'episode',episodeId}`: text review of full screenplay and breakdown.
- `{kind:'shot',shotId}`: relevant shot text or media; episode is derived.
- `{kind:'cut',episodeId,fromClipId,toClipId}`: saved adjacent selections.
- `{kind:'sequence',episodeId}`: saved complete edit plan.

Unused optional IDs/times may be omitted or null; never use empty placeholders.
Categories: text, technical, visual, audio, continuity. Verdicts: supported,
needs-revision, not-verified. Give specific findings and a next action for every
unverified/failed conclusion. Non-text supported requires actual related media;
video/audio evidence includes measured start/end plus observed notes. Image
review may omit time. Cut/sequence support must cover the selected video ranges;
audio conclusions also cover relevant independent tracks. For partial viewing,
review a shot/cut or explicitly say not-verified for the whole sequence.

Use actual examination evidence, not filenames or generated descriptions. A
review is an Agent's recorded judgment, not an automatic artistic certificate.
Current/latest per-category findings are displayed; a newer unverified or failed
record supersedes an earlier pass. Never erase adverse history to create a pass.

Semantic fingerprints include relevant project canon, screenplay/beats, shot
order/content, referenced assets, source identity/measurements and selections.
Changes mark related selections/reviews stale; unrelated asset edits do not
invalidate unrelated shots. Reread after a change, compare actual differences,
update selections if still valid and inspect again before recording a new
supported review. Do not simply copy the old finding to silence a stale warning.

A saved plan with stale dependencies cannot preview until reconciled. Missing
references remain visible for repair. Old snapshots remain readable and gain
these records only through explicit tools. The existing workflow `complete`
means structural/output links only; it is never a final delivery approval.
