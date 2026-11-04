# v0.25.0 acceptance scope

This release adds the unified storyboard workbench and exact image-reference
handoff. The plugin ID remains `bone.video.workshop`; the visible Chinese name
is `影视工厂`. No permission or storage-directory change is required.

## Compatibility

- Schema version 1 remains readable. New authoring fields and image associations
  are additive; reading legacy productions does not rewrite their snapshots.
- A legacy shot without generationBrief can be viewed/edited. Preparing a saved
  generation request requires explicitly saving the brief first.
- Full editor saves reconcile structured references and compatibility text while
  preserving music, other plans, existing asset associations and output history.
- Existing Agent tools remain. Two read-only tools bring the registered total to
  26: prepare_shot_generation and read_generation_image.
- Back up the full plugin private data directory before upgrading; do not uninstall
  or clear data. Downgrading after writing new fields is not a supported migration.

## Executed acceptance

The release candidate was validated in an isolated task checkout with temporary
production storage. It reused installed Node 22, Chrome/Python Playwright and
FFmpeg. No user production or external generator was used.

- `node --test tests/*.test.cjs`: 137 passed, zero failed/skipped.
- `generation-panel.browser.py`: actual main.js/workbench save/read/export, exact
  image bytes, conflict recovery, cancel, clear/reload, CRUD and episode export.
- `storyboard-port.browser.py`: matched table/editor geometry, sticky columns,
  stale-source rejection and final draft-export revision guard.
- `editorial.browser.py` / `storyboard-organization.browser.py`: real two-second
  video/audio fixtures, saved clip/audio/cut plans, scoped reviews, playback
  cleanup, responsive layout and unchanged stored state after browsing.
- `generation-guidance.browser.py`: actionable Chinese feedback, explicit mode
  switches, episode navigation and empty/viewport states.
- `generation-export.browser.py`: project changes block stale export; explicit
  reread restores equality with the preview.
- `generation-select.browser.py`: custom dropdown keyboard/mouse/cancel/reload.
- `reference-picker.browser.py`: caret/chip placement, category/name filtering,
  frame purposes, exact saved bindings and narrow viewport behavior.
- `reference-prototype.browser.py` and `reference-fields.browser.py`: shared-editor
  regression, clipboard, exact exported bytes, replacement/deletion and all fields.
- Isolated Electron 43.6.0: sandbox/contextIsolation, nodeIntegration:false; real
  Blob download with saved prompt and exact reference-image SHA-256 match.
- Manifest/tool and prototype source synchronization, JavaScript syntax, local
  documentation links, diff whitespace and release-input checks passed.

All nine browser entry points above passed. Artifact hashes and final integration
revision are recorded in the GitHub release notes.

## Packaging and remaining limits

The package is staged from main.js, manifest, lib/, views/ (excluding the standalone
prototype), skills/, docs/, license and user documentation. Test scripts, generated
fixture media, design sources, caches, credentials and private production snapshots
are excluded. Use PI-Desktop PluginPack to create the uncompressed `.piplug`;
verify its SHA-256 against the release's `SHA256SUMS`.

Fresh installation permission UX and a full restart of a user's existing host
profile were not exercised. Browser previews and isolated Electron download tests
are distinct from those checks. Real provider capability, paid generation, artistic
quality, final-film mastering/export and professional audio mixing remain outside
this release's acceptance. The plugin prepares inputs and manages creative state;
it does not implement a media generator or claim that saved/adopted output passed
artistic review.
