# Changelog

## 0.21.0

- Research nine public screenplay, short-drama, manju, storyboard and video skills
  at recorded commits. Add genre-sensitive scene/dialogue/blocking diagnostics,
  explicit source authority and task-object boundaries; reject fixed commercial
  quotas, artificial reviewer consensus and automatic quality claims.
- Add staged revision plans, exact host-captured before/after values, scoped
  intent/field validation, current-review checks and affected/neighbor shot lists.
  Four new tools bring the total to 24. Existing direct tools remain compatible.
- Apply or conditionally restore authorized plans atomically with queued version
  and content guards. Preserve IDs, media and review history; shot revisions
  increase and old output validity is never restored. Later edits reject recovery.
- Add a read-only revision panel with literal diff rendering, responsive layout,
  stale-operation disabling and copy-only instructions. Legacy character archive
  instructions now request merged proposals before any application or clearing.
- Expand the production skill to ten stage references and document the limits
  of Agent authorization assertions, conservative restoration and record size.
  Validate with isolated registered-tool and browser fixtures; no real work is
  rewritten or restored by this plugin-development task.

## 0.20.0

- Preserve fractional shot edit budgets; add separate production plans for
  screenplay source, narrative purpose, required events, source generation
  duration, head/tail handles, retiming policy and editing constraints.
- Add SHA-bound Agent source inspections, version-guarded edit plans with
  reusable trimmed/retimed clips and independent sound tracks, and scoped
  append-only evidence reviews (20 Agent tools). Unsupported conclusions are
  rejected; current/stale/superseded status follows semantic dependencies.
- Distinguish saved prose, planning, adopted outputs, selected edit duration,
  source observations and reviewer conclusions. Report episode budget drift
  without treating generated source length as final duration.
- Add candidate browsing/measurement, adjacent-cut review and real local segment
  previews with hard cuts, constant rates, audio overlap, actual decode/bounds
  checks, pause/seek and stale/asynchronous lifecycle protection. No export or
  automatic artistic certification is introduced.
- Accept null unused media target and review scope fields for strict callers,
  retaining target exclusivity, provenance, locks and host permission checks.
- Update stage skills and delivery guidance. Validate the original 36-shot
  Yaoxiang submissions in isolated storage: 60-second budget preserved, old
  drafts remain unreviewed and no real production is rewritten.

## 0.19.3

- Fix wheel/trackpad gestures getting trapped over project-setting cards by
  allowing vertical scroll chaining to the page. Short content passes scrolling
  through; long content retains internal scrolling until its top/bottom boundary.
- Preserve modal scroll containment. Add real wheel-event browser regressions
  for both directions, inner/boundary scrolling, asset previews and dialogs at
  desktop and narrow widths. No persistence or Agent contract changes.

## 0.19.2

- Move legacy unassigned character text and its assignment-copy action into a
  modal. Keep only a compact entry button in the asset library, even for works
  without assets. Preserve the original text and storage unchanged.
- Share modal focus, backdrop closing and lifecycle handling with asset details;
  verify exact text, copying, long-content scrolling, responsive themes and cleanup.

## 0.19.1

- Keep asset cards compact: image, name and basic metadata only. Open a detail
  dialog on image/name click or keyboard activation instead of inline expansion.
- Show artwork/audio, full introduction, dossier, image prompt and constraints
  in a responsive dialog, preserving copy actions and legacy asset support.
- Support Escape, backdrop/close, focus containment/return and view-change
  cleanup. Move audio playback into the dialog and pause it on close.
- Verify dialog interaction, actual media decoding/playback, long text and
  responsive themes without changing asset storage or Agent tool contracts.

## 0.19.0

- Move character dossiers into individual role assets. Asset cards now show
  introductions and expandable full descriptions, profiles, generation prompts
  and avoidance/consistency constraints, with scoped copy actions.
- Add optional `profile`, `imagePrompt` and `negativePrompt` fields to asset
  creation/update tools, with atomic validation and existing dependent-shot
  invalidation. Preserve omitted fields and existing media/lock state.
- Keep four project-wide tabs. Preserve legacy centralized character text in
  the asset library as unassigned material; provide explicit Agent reconciliation
  instructions instead of automatically guessing ownership or deleting content.
- Search includes profiles and prompts. Sound assets use production-prompt
  wording. Update creative guidance and browser/API regressions accordingly.

## 0.18.0

- Display world background, rules, historical timeline, character dossiers and
  whole-series arc directly on the Project page, between the brief and assets.
  Add accessible section tabs, bounded long-text reading, empty states, filled
  counts and scoped Agent copy instructions. Reuse the existing arc field.
- Persist four optional `projectBible` text sections through create/update
  production tools. Patch supplied sections only, preserve omitted sections,
  and reject invalid/oversize inputs atomically (20,000 characters per section).
- Keep old snapshots readable without migration or automatic writes; settings
  dialog edits preserve bible content. Existing companion documents remain.
- Make Refresh reread the selected production instead of reusing its cached
  snapshot, while retaining stale-request guards across selection changes.
- Update the production skill to save core settings natively; external files
  remain optional planning/review appendices. No new permissions or automatic
  artistic approval/dependency invalidation are introduced.

## 0.17.1

- Expand the production skill into seven on-demand stage contracts, informed
  by DutyDeck's creative guidance and quality contract: project development,
  series planning, complete screenplay, script breakdown, assets/storyboard,
  frame/video/sound production and review.
- Require full shootable scene/action/dialogue text rather than a synopsis or
  beat list; adapt detail and beat count to actual duration and genre.
- Add world/history/character/knowledge and setup/payoff planning conventions,
  durable workspace companion documents, source maps and explicit field limits.
- Distinguish structural readiness, editorial review, technical decoding,
  actual viewing/listening and final export. Do not fabricate approval states.
- Align screenplay tool descriptions and document the unresolved optional-target
  signature mismatch found in live media adoption. No runtime permission,
  persistence schema or adoption behavior changes are included.

## 0.17.0

- Connect the Agent workflow from episode prose and narrative beats through
  assets, shots, video/sound/continuity plans, frame references and adopted
  media. Add the bundled `film-production` skill and factual workflow checks.
- Add `get_workflow_status`, `register_media` and `adopt_media` (17 tools total).
  Import scoped workspace files through host APIs into immutable private
  storage; keep registration separate from adoption and output kinds separate.
- Validate shot plans, referenced assets, beat mapping and revision guards.
  Reject stale shot-specific outputs and changes to locked asset artwork.
- Render adopted images, video and audio with image zoom and playback controls.
  Stop players on view changes, ignore stale reads and expose decode failures.
  Add workflow gaps and continuation instructions to Production configuration.
- Declare `agent.prompt.inject` and `fs.read` scoped to `bone-media/**`.
  Existing installations need host permission review on reload. No built-in
  video generator or final episode export is introduced.
- Add service/integration regression tests and a portable manifest sync check.

## 0.16.2

- Remove the extra border and padding around frame cards while preserving
  separate first/last-frame labels and image regions.

## 0.16.1

- Display separate first/last frame reference cards from existing shot video
  plans. Preserve missing slots and show their asset sources independently.
- Reuse the adopted image when a frame asset is omitted, matching the source
  workbench. Avoid an extra ordinary image card when a frame already uses it.
- Keep ordinary image references and single-first-frame plans supported.
- This is read-only presentation; video-plan authoring tools, media preview
  and generation are not added by this release.

## 0.16.0

- Replace the horizontal storyboard strip/detail card with the original
  workbench's two-column composition: episode picker, full-height shot
  sequence, large film stage, image reference, sound design and shot settings.
- Add previous/next navigation, empty-episode states, links back to mapped
  script beats, referenced-asset navigation and scoped Agent copy actions.
- Keep episode selection shared across Story, Script and Storyboard, while
  direct shot links resolve the owning episode.
- Distinguish video, image and audio output records and current candidates.
  Missing media is never shown as adopted. Media playback and generation
  remain unconnected; this release provides layout and read-only browsing.
- Preserve snapshot formats, permissions and all existing Agent tool contracts.
