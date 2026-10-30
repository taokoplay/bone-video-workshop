# bone-video-workshop — Bone 影视工厂

English | [简体中文](README.zh-CN.md)

An independent PI-Desktop plugin for Agent-driven visual productions
(comic / film / promo / image), with a read-only production workbench.

- Plugin ID: `bone.video.workshop`
- Version: `0.21.0`
- License: AGPL-3.0-only. This plugin stays separate from PI-Desktop's
  LGPL-3.0 repository and does not read DutyDeck production data.
- Canonical source: `/Users/xutaoyu/CodeSource/PI-Plugins/bone-video-workshop`.
  The former `CodeSource/BoneVideoWorkshop` location remains a compatibility
  symlink for the host's existing development entry; it is not another copy.
  Host installations, permissions and production data remain in their original
  host-managed locations. Historical validation commands retain their old paths.

## Agent creation workflow

The bundled `film-production` skill guides the Agent through persisted state:

1. Read `list_productions`, `get_production` and `get_workflow_status`.
2. Establish the work's brief, project bible and cross-episode `arc`; for a
   series, plan the causal progression and continuity across all episodes.
3. Write each complete shootable screenplay as `prose` (剧本), with scene
   headings, visible action and complete dialogue, then derive structured
   narrative `beats` (脚本). Match detail to duration, not a fixed word quota.
4. Register reusable assets and create shots mapped to their episode's beats.
   Every new shot needs a valid `beatId`; a beat may contain several shots.
5. Set video, sound, continuity and production plans. Keep edit budgets separate
   from generated source lengths and handles. Bind actual frame artwork.
6. Generate with an available tool or import real files under `bone-media/`;
   register and explicitly adopt outputs, or retain sources as candidates.
7. Report actual source measurements, save clip selections and independent audio
   tracks, review scoped evidence and preview contiguous segments. Read status
   again to identify stale dependencies and remaining unverified work.

A response in chat alone does not update a production. The Agent must call
these tools to save the result. Existing approved content is preserved when
continuing a work; no direct snapshot editing is needed.

Example request:

> 在 Bone 影视工厂继续《星尘旅人》。先检查已有内容，补齐第一集正文、脚本节拍、
> 资产和分镜计划，再制作首尾帧。实际素材登记并采用后，说明影片还缺什么。

### Professional stage prompts

The [production skill](skills/film-production/SKILL.md) loads ten focused
contracts on demand: project development, series planning, episode screenplay,
script breakdown, assets/storyboard, media production, evidence-based review,
source selection/editing, dramatic craft/manju and scoped revision workflow.
Each specifies inputs, deliverables and checks. The
[nine-repository research](docs/skills-research-2026-10-30.md) records pinned
sources, observed popularity, prompt structure and the methods adopted/rejected.
The guidance adapts DutyDeck's requirement traceability, story-rule/knowledge
constraints, timing budgets, action continuity and separation of text review
from real media review. It adds explicit upstream series development and full
screenplay requirements instead of equating a beat list with a finished script.

The Project page displays four project-wide sections: world background, world
rules, historical timeline and whole-series arc. The first three are stored in
`document.projectBible` (`background`, `rules`, `timeline`, up to 20,000
characters each); the arc reuses `document.arc` (4,000 characters).
`create_production` accepts initial sections and
`update_production` patches only supplied sections. Omission preserves content;
an empty string clears one section. Invalid types/keys or oversize sections are
rejected without partial saves. `get_production` and the panel read the same
snapshot; long text uses plain-text rendering, not HTML. Read-only section tabs
support pointer and keyboard navigation, an empty state and scoped Agent copy
instructions. The filled count is not a quality score.
Wheel/trackpad scrolling over short project-setting content scrolls the page.
Long content scrolls within the card, then chains to the page at its top/bottom.
Asset dialogs remain scroll-contained so their gestures do not move the background.

Older snapshots remain readable without migration or automatic writes. Their
existing arc appears in the Whole-series arc section; missing bible sections
show as pending. Creation/editing through the existing settings dialog leaves
bible sections unchanged. Core sections now live in plugin storage, while
expanded series plans and review/source maps may remain in Agent-managed
`bone-projects/<productionId>/` companion documents. Existing external bibles
are not auto-imported or deleted; reconcile and save them explicitly with the
Agent. Companion files are not automatically moved/deleted with a production.

### Asset introductions, dossiers and generation prompts

Asset cards show only the square preview, name and basic metadata. Clicking the
image or name opens a modal with the image/audio, introduction, character dossier
or detailed specification, and generation prompts. Desktop uses two columns;
narrow panels stack the content. The dialog supports Escape, backdrop/close
actions, keyboard focus containment/return, and stops audio on close. Changing
the view dismisses the dialog. Characters keep their dossiers beside their
artwork in this detail view, rather than in a project-wide tab.
All asset types support:

| Field | Purpose | Limit |
|---|---|---|
| `description` | Introduction and stable visual/use constraints | 2,000 characters (existing behavior) |
| `profile` | Character goals, motivations, secrets, relationships and arc; other assets' detailed background/use | 20,000 |
| `imagePrompt` | Executable image-generation prompt | 8,000 |
| `negativePrompt` | Avoidance and consistency constraints | 8,000 |

Write these through `add_assets` or `update_asset`. New fields are optional;
updates preserve omitted fields and explicitly empty strings clear only that
field. Invalid/oversize new values reject the entire mutation. Asset changes
retain the existing dependent-shot invalidation behavior. Copy controls provide
the saved prompt plus avoidance constraints or a scoped Agent editing request;
they do not start generation. Sound assets use a production-prompt label and
do not require image prompts. Search includes dossiers and both prompt fields.

Legacy `projectBible.characters` stays persisted. The asset library shows only
a compact "View unassigned character material" button, including when no assets
exist. The complete original text and assignment-copy action are in a modal,
with the same focus, closing and view-change cleanup behavior as asset details.
The copy action requests a merge proposal for actual character assets, preserving
existing profiles and locks. It does not apply the proposal or clear the legacy
field. Clearing requires authorized, verified assignment of all information.
Nothing is automatically split, reassigned or deleted.
Existing assets lacking new fields remain readable with honest empty states.

Review records distinguish supported, needs-revision and not-verified conclusions
and derive their freshness from semantic dependencies. Relevant canon, prose,
shot, asset, source observation or edit changes mark dependent plans/reviews
stale; unrelated asset changes do not stale unrelated shots. Older passes never
mask a newer failed/unverified conclusion. The existing workflow `complete`
flag remains a structural/output-link check, not artistic approval.

Media registration/adoption now accepts `null` for unused optional target fields
to support strict model callers. Exactly one adoption target is still required;
shot revision, provenance, asset locks and host permissions remain enforced.
Empty-string targets remain invalid. This does not alter host permission policy.

### Registered tools (24)

| Tool | Purpose |
|---|---|
| `list_productions` | List works and counts |
| `get_production` | Read settings, episodes, assets, shots, media metadata and workflow |
| `get_workflow_status` | Report real gaps, next action, frame readiness and output state |
| `create_production` | Create settings, brief, optional project bible and arc |
| `update_production` | Patch settings, project bible sections and story arc |
| `write_script` | Write or update one episode, including continuous `prose` |
| `write_episodes` | Write multiple episodes and structured `beats` |
| `add_assets` | Register characters, scenes, products, props, styles, brands or sounds |
| `update_asset` | Change asset settings or lock state; invalidate dependent shots |
| `delete_asset` | Delete an asset unless a shot plan still references it |
| `add_shots` | Create shots with beat mapping, assets and optional production plans |
| `update_shot` | Change a shot, plans or mapping, with optional revision guard |
| `move_shot` | Reorder a shot by zero-based index |
| `delete_shot` | Remove a shot and its mapping/state |
| `register_media` | Import a real workspace file into the private media library |
| `adopt_media` | Bind registered media to one asset or one shot output kind |
| `delete_production` | Permanently remove a work; requires explicit confirmation |
| `record_media_inspection` | Record SHA-bound Agent-reported source length and observed usable ranges |
| `save_edit_plan` | Save version-guarded video selections, rates, independent audio and cut notes |
| `record_review` | Append scoped evidence-based reviewer conclusions with derived freshness |
| `save_revision_plan` | Stage validated per-field before/after values without changing creative content |
| `get_revision_plan` | Read a proposal and its current application/restoration eligibility |
| `apply_revision_plan` | Atomically apply an explicitly authorized proposal against current versions |
| `restore_revision_plan` | Conditionally restore only the plan's fields while retaining history and monotonic revisions |

### Review-driven revision

First identify whether the user means plugin code or a particular production.
Review-only can save findings; it does not authorize a rewrite. A proposal lists
its intent (`wording`, `visual`, `pacing`, `story`), preservation commitments,
real target IDs, issues, exact replacement values, reasons and acceptance criteria.
The host captures before values. Saving increments the record revision but does
not change prose, shots, assets or output bindings.

Configuration shows the saved diff and affected/neighboring shots. Buttons only
copy review/proposal/application/restoration instructions; they do not execute
tools. Apply/restore require a current production revision, `confirm: true` and
an authorization explanation. Those fields are Agent assertions, not certified
user consent, and do not bypass host approval. Existing direct tools remain
compatible; this is not a sandbox against arbitrary authorized direct writes.

Applications reject stale content, changed shot versions, stale source reviews,
locked assets and invalid fields. No objects are created, deleted or reordered.
Each affected shot is dirtied once. After application, reread the changes and
recheck their criteria and neighbors; application does not close findings.
Restoration requires the post-apply content baseline to match. It preserves
media, reviews and output history, advances shot revisions and does not revive
old media. Later edits block restoration instead of being overwritten.

Limits: 40 plans per work, 100 changes per plan, 220,000 characters per encoded
replacement and 2 MiB per complete record, including lifecycle metadata. History
is never silently pruned. See the [revision contract](docs/review-revision-workflow.md).

### Plans and revision safety

Shot `duration` is the edit budget, preserving fractional seconds. Old snapshots
are never rewritten or guessed back from rounded durations. `productionPlan`
records sourceScene, purpose, requiredEvents, planned generation duration,
head/tail handles, retimePolicy and editingNotes. Handles must leave time for the
action. Actual source length and selected clip duration are separate values.

### Source selection, review and preview

Storyboard now shows production plans, registered candidates, source measurements,
shot reviews, saved edit clips, adjacent-cut notes/reviews and segment preview.
Copy controls prepare scoped Agent operations; only Agent tools persist changes.
Configuration distinguishes saved prose, planning, adoption, editing and reviews,
and reports budget/target differences. Full details: [editing contract](docs/production-editing.md).

`record_media_inspection` requires the current production revision and matching
media SHA. Duration/method/findings and usable ranges are Agent-reported evidence,
not host decoder certification or proof of artistic quality. Browser preview
independently decodes the actual file and rejects out-of-range selections.

`save_edit_plan` requires the current production and edit revision (0 initially).
It saves a whole plan: ordered `clips` with source in/out, constant speed and
explicit embedded-audio use; independent `audioTracks` with role, source range,
timeline start and gain0..1; consecutive-pair `cutNotes`; notes. One source may
be selected repeatedly. No source file or shot output is overwritten. Clips
must reference this episode's shots and current registered source provenance.
Every selected timed source must have a matching reported duration. Retiming
obeys `productionPlan.retimePolicy`; absent policy permits speed1 only.

`record_review` scopes conclusions to episode text, shot, actual saved cut pair,
or saved sequence. Non-text support requires related actual media evidence;
timed evidence must include inspected intervals. Cut/sequence support covers
all selected video ranges, plus relevant independent tracks for audio review.
Records are append-only (2,000 maximum). Newer scope/category results supersede
earlier ones without deleting them; a stale plan blocks preview and current
supported sequence/cut review until reconciled. A record is an Agent judgment,
not an automatic quality certificate or final-delivery gate.

The panel previews contiguous groups of1..8 clips (at most192MiB of distinct
registered source bytes), applies trims/constant rates and plays overlapping
independent sound tracks. Hard cuts only: prose about dissolves or speed ramps
does not execute effects. Browser playback may pause for media readiness; it
is not a frame-exact offline render, mastering mixer or export. Close, seek,
view switches and failed loading stop obsolete players and ignore late results.
Source length, generation plan, edit budget and selected duration are labeled
separately. No actual generated media or review is fabricated for legacy works.

### Updating plans and source revisions

`add_shots` and `update_shot` accept `productionPlan`, `videoPlan`, `soundDesign`
and `continuityPlan`. Each nested object is replaced as a whole; omission retains
it and null clears it. Video modes are `text-to-video`, `image-to-video` and
`first-last-frame`. Frame asset references must belong to the work and to the
shot's `assetIds`. First/last-frame mode needs an explicit distinct tail asset;
a null first-frame asset uses the shot's adopted image.

When editing beats, include retained beats and their `beatId`: the beats array
is replaced as a whole. Moving a shot to another episode must provide that
episode's target `beatId` in the same update.

Read `shotStates[shotId].revision` before generation. Pass it as
`expectedShotRevision` when registering shot-specific output and when adopting.
Changed shots reject obsolete output provenance. Binding frame assets can
invalidate dependent shots; reread state before generating their video.
Locked assets cannot have their media replaced without an intentional unlock.

### Real media, registration and adoption

1. Place the source at `bone-media/<productionId>/<filename>` in the active
   workspace. Only this declared scope is used for external file imports.
2. Call `register_media({ id, path, kind, ... })`. Source bytes are read through
   host file APIs, checked, and stored in a private content-addressed library.
3. Call `adopt_media({ id, mediaId, assetId })` for artwork or a frame asset;
   call it with `shotId` and `expectedShotRevision` for a shot output.
4. Refresh the workbench. Images, video and audio remain independent slots.
   Adopting an image does not clear a stale video's update requirement.

Supported signatures: PNG/JPEG/GIF/WebP images (up to 32 MiB), MP4/WebM video
and WAV/MP3/Ogg audio (up to 64 MiB). Up to 1,024 media records per work are
accepted. Signature checks identify formats; they do not guarantee browser
codec support. Playback/decode failures are shown explicitly.

Imports are deduplicated by content and retain the original provenance. A
shot-specific file from an older revision cannot be forced onto a changed
shot by supplying a newer revision. Register reusable source assets without
shot provenance. Failed snapshot commits may leave reusable immutable blobs.

The plugin does **not** generate images, audio or video itself. The Agent may
use an available generation tool under that tool's authorization rules, then
register its actual output. If no video generator is available, import an
existing video. The plugin never labels a still image as a completed film.

## Workbench

The Project, Story, Script, Storyboard and Production configuration tabs use
the original workbench design language with light/dark themes. Story displays
continuous prose; Script displays beats. Episode selection is shared across
Story, Script and Storyboard.

The storyboard has a shot sequence, large film preview, separate first/last
frame cards, sound playback, shot settings and referenced assets. Images can
be enlarged. Media loads when visible; leaving a view stops playback and
ignores stale reads. Below 760px the sequence becomes a horizontal strip.
Production configuration shows workflow gaps and a scoped continuation prompt.

Copy buttons prepare instructions for the Agent; they do not send chat
messages or run generation. Browsing never changes production content. The
existing create/edit production dialogs and delete action retain their
explicit host-bridge operations. Refresh loads newly saved Agent results.

Workflow `complete` means recorded links and required outputs are present and
current. It is not a quality verdict, rendered episode export or proof that
all codecs will decode. Human review of the result is still required.

## Storage and compatibility

```text
<plugin data path>/productions/<productionId>/snapshot.json
<plugin data path>/productions/<productionId>/media/<content hash>.<extension>
```

Snapshots retain `document / media / assetVersions / shotStates / candidates /
jobs`. Writes are serialized per production and committed by atomic rename
with monotonic document revisions. New plan fields and output revision metadata
are additive. Older no-plan snapshots and legacy `mediaId` remain readable;
workflow status reports missing planning steps without rewriting old works.

## Permissions and installation

| Permission | Purpose |
|---|---|
| `ui.view` | Show the workbench |
| `agent.tool.register` | Register 24 production tools |
| `agent.prompt.inject` | Discover and load the production skill on demand |
| `fs.read` | Import workspace sources scoped to `bone-media/**` |
| `clipboard.write` | Copy IDs and scoped Agent instructions |

The private library does not need arbitrary workspace file access. Only the
source import uses the host file API; no broad filesystem or network grant
is requested. New skill/file-read permissions require host review on reload.
Do not manually edit the host's permission registry to bypass that review.

1. Load this folder as a development plugin, or install the `.piplug` archive.
2. For an existing development installation, use Plugins → More → Reload and
   review the newly declared permissions.
3. Open **Bone 影视工厂** from the work panel menu or global command search.
4. Ask the Agent to create or continue a work; refresh the panel to browse it.

## Validation and packaging

From this plugin directory:

```bash
node scripts/sync-manifest.cjs --check
node --test tests/*.test.cjs
```

Use `node scripts/sync-manifest.cjs --write` after changing runtime tool
schemas/descriptions or the version. It synchronizes manifest declarations
and the HTML build stamp without using a running host or user data.

For Project-page acceptance, use an isolated workshop bridge fixture containing
a saved production with all five bible sections and an exposed `window.__fixture`
snapshot, with clipboard writes captured as `window.__lastCopy`. The fixture must
allow refreshing mutated data through `bone.get`; do not attach it to user data.
With Python Playwright and Chrome available, run:

```bash
python3 tests/project-bible.browser.py /path/to/isolated-harness.html
python3 tests/project-scroll.browser.py /path/to/isolated-harness.html
```

This checks real section switching/copy actions, keyboard access, refreshed
content, legacy empty states, safe long-text rendering and four widths in both
themes. Refresh always rereads the selected work after Agent updates.

From the PI-Desktop repository root:

```bash
pnpm pi-plugin check /Users/xutaoyu/CodeSource/PI-Plugins/bone-video-workshop
pnpm pi-plugin pack /Users/xutaoyu/CodeSource/PI-Plugins/bone-video-workshop
```

The archive ships plain JS/HTML/CSS, service modules and the production skill;
no frontend build is needed. Tests cover the registered tool chain, revision
conflicts, plan validation, source-file checks, adoption isolation and legacy
storyboard selection. Browser acceptance additionally checks decoded media,
play/seek/stop behavior, frame zoom, async failures and both themes at
1440/900/600/390px. Use isolated fixtures, not real user productions or paid
providers. Advanced transitions, speed ramps, mastering and final export remain future work.
