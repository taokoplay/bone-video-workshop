# Reference document and generation handoff

This additive contract binds authored inline references to registered image bytes.
It prepares inputs for an external generation tool. It does not submit a paid
request, create a generation job, claim output success, or invent local paths.

## Shared compiler

`lib/reference-document.js` exports the same API through `module.exports` in Node
and `globalThis.FilmReferenceDocument` in a browser. It has no I/O dependencies.

```js
const document = {
  schemaVersion: 1,
  nodes: [
    { type: "text", text: "Follow " },
    { type: "reference", assetId: "as_mira", mediaId: "md_portrait", role: "identity" },
    { type: "text", text: " through the station." },
  ],
};
validateDocument(document); // normalized detached document
compile({ document, assets, media, operation: "image.reference", maxReferenceImages: 8 });
```

Assets and media are arrays. An asset supplies `id` and `name` (nonblank, at most
60 characters). A referenced media record must supply `id`, `kind: "image"`,
`mimeType` (`image/png`, `image/jpeg`, `image/gif`, `image/webp`), a lowercase
64-hex `sha256`, and integer `byteLength` in 1..33554432. The pure compiler checks
metadata; the backend additionally verifies private bytes and provenance.

Documents accept exactly `schemaVersion` and `nodes`; nodes accept only the
fields shown above. Roles are `identity`, `scene`, `prop`, `style`, `first-frame`,
`last-frame`. IDs match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. Limits are 256 nodes
and 24,000 total text UTF-16 code units. Validation preserves whitespace and
unresolved `@` text for drafts. Compilation rejects any text node containing `@`
with `UNRESOLVED_REFERENCE`. Plain names never bind automatically. Nodes are the
only source of references; there is no second persisted reference list.

Compilation returns:

```js
{
  schemaVersion: 1,
  operation: "image.reference",
  prompt: "Follow Mira〔图1〕 through the station.\n\nReference images:\n图1: Mira [identity]",
  images: [{ slot: 1, mediaId: "md_portrait", assetIds: ["as_mira"],
    roles: ["identity"], mimeType: "image/png", sha256: "<64 lowercase hex>", byteLength: 68 }],
  referenceCount: 1,
}
```

`referenceCount` counts reference-node occurrences; `images.length` counts unique
image inputs. Deduplication is by `mediaId`, preserving first appearance. Asset
IDs, roles and legend pairs retain first appearance and deduplicate independently.
Repeated mentions always use their image's slot. Names are read at compile time;
renaming cannot leave an old name in a compiled token. The stable legend lists
each slot with each explicit asset-name/role pair. Nothing infers a role from a
name, swaps an image, selects a camera, or supplies an aspect ratio.

| Operation | Accepted references |
| --- | --- |
| `image.generate`, `video.text` | Zero images |
| `image.reference`, `video.reference` | 1..maxReferenceImages images, retaining all explicit roles |
| `video.image` | Exactly one unique image; every mention has role `first-frame` |
| `video.first-last` | Exactly two distinct image IDs and hashes; one image has only `first-frame`, the other only `last-frame` |

For `video.first-last`, slot 1 is always the first frame and slot 2 the last
frame, regardless of mention order. An identity mention is never relabeled as a
frame. `maxReferenceImages` defaults to 8 and must be an integer in 1..8; it applies
to every mode. Unsupported combinations fail rather than dropping inputs.

Errors use `INVALID_ARGUMENT` for schema/metadata/operation errors, `NOT_FOUND`
for absent assets/media, `LIMIT_EXCEEDED` for document/image/count limits, and
`UNSUPPORTED_REFERENCE_MODE` for incompatible counts/roles. Backend freshness
and adoption failures use `CONFLICT`; filesystem denials use `PERMISSION_DENIED`.

## Persistence, precedence and revision behavior

`add_shots` and `update_shot` accept optional top-level `generationBrief` with the
exact document shape. Omission preserves it; null removes the field. Each
reference asset must exist in the production and already be included in the
shot's explicit `assetIds`. Removing a mention does not remove unrelated shot
assets. Removing an asset still used by a brief is rejected. Drafts may contain
unresolved text or media that is not yet ready; preparing always validates them.

`generationBrief` is authoritative visual wording. `scene` is its compatibility
text in the complete UI editor and is not appended a second time. An Agent may
keep a separate narrative scene only by explicitly reconciling the brief in the
same update. The other structured fields are authoritative over `lighting`,
`motion`, `dialogue` and `soundDesign.effects`; direct plain-field edits must
explicitly reconcile or remove their documents. Old snapshots are read without
writes and require an explicit brief save before prepared handoff.

Direct updates mark the shot dirty and advance its existing shot revision.
Editing/review dependency fingerprints include the brief and its referenced
assets. Revision proposals accept whole `generationBrief` values or null for
`visual` and `story` intents, using the same validators. Scene-changing proposals
must include explicit brief reconciliation in the same proposal. Apply/restore
preserve history and advance revisions; restored wording does not revive old
requests, media provenance or reviews. This extends the shot-field contract in
[the revision workflow](review-revision-workflow.md).

## Agent tools and panel bridge

The read-only tools share their implementations with panel channels:

| Agent tool | Panel channel |
| --- | --- |
| `prepare_shot_generation` | `bone.generation.prepare` |
| `read_generation_image` | `bone.generation.read-image` |

The editor writes through `bone.generation.save({id,shotId,expectedShotRevision,
...FilmShotAuthoring.patch(draft,shot,assets)})`. The atomic patch synchronizes all
five documents, compatibility text, scale, duration and generation settings while
preserving music, unrelated plans and asset links. The channel rejects unknown
fields and stale revisions. Conflicts keep the local draft; explicit reconciliation
preserves edited fields and adopts fresh values for untouched fields.

```js
prepare_shot_generation({ id, shotId, expectedShotRevision, operation, maxReferenceImages });
// -> { compiled, productionRevision, shotRevision, requestHash }

read_generation_image({ id, shotId, expectedShotRevision, operation,
  maxReferenceImages, requestHash, slot, offset, length });
// -> { slot, mediaId, sha256, mimeType, byteLength, offset, nextOffset, eof,
//      encoding: "base64", data }
```

Only `maxReferenceImages` is optional. `slot` is 1-based. `offset` is an integer in
0..byteLength, `length` an integer in 1..65536 decoded bytes. The final chunk may
be short. Reading exactly at EOF returns empty data and `eof: true`. Out-of-range
values, unknown fields and unknown slots reject.

Preparing requires the current shot revision, a saved compilable brief and an
explicit image association: current `asset.mediaId` or `asset.referenceMediaIds`.
Changing adoption retains prior images as associations, so pinned references never
silently change versions. If either source `shotId` or `shotRevision` is present,
both must exist and match a live source shot and its current revision.
Audio assets cannot provide image references. Preparing verifies every private
image using the existing symlink, regular-file, size, SHA and signature checks.

The deterministic SHA-256 request hash includes the normalized document, compiled
request, image limit, production and shot identity/revisions, shot/asset basis
and source provenance. Including production revision is deliberately conservative:
even unrelated successful writes require preparing again. Inputs are detached
before awaits; fresh snapshots and hashes are checked after private file reads.
There is no in-memory ticket state, so an unchanged request survives restart.
Each range re-verifies the complete image (at most 32 MiB); this trades repeated
bounded I/O for hash verification without a long-lived cache or file handle.

Neither tool writes snapshots, logs generation payloads, reads credentials,
accesses the network, adds `fs.write` permission, or exposes private file paths.

## External consumer sequence and acceptance

1. Save/reconcile the brief and read the current shot revision.
2. Prepare with the exact supported operation and image limit.
3. For each ordered slot, read chunks under that request hash. Decode each base64
   chunk separately, concatenate bytes, check total length and SHA-256. Do not
   concatenate padded base64 strings as if they were one encoding.
4. Reprepare and require the same hash immediately before external handoff.
5. Pass the exact compiled prompt and ordered verified images as files or data
   URLs to the actual authorized generator. Report submission/output only from
   that generator's real response; later register/adopt real output separately.

A failed validation/read must abort before invoking the adapter. A read-only
handoff cannot lock a work during an external paid call; consumers must retain
request revisions and handle changes during generation before adopting outputs.
Signature checks do not certify decoding, image dimensions or artistic quality.

Automated acceptance: `tests/reference-document.test.cjs` checks browser/Node
parity, token/slot alignment, deletion/repetition/rename/replacement, unresolved
text, metadata, modes, frames and bounds. `tests/generation-handoff.test.cjs`
loads real `main.js` registrations with isolated private storage, registers fixture
PNGs, saves briefs, prepares/assembles exact bytes into an adapter stub, and
covers invalidation, legacy reads, restart, unsafe files, provenance and revision
races. The adapter is a test stub; no real provider generation is verified.

## Workbench and standalone review

Open **操作 → 编辑镜头** in either storyboard view. Field shortcuts open the same
complete editor, with the selected field focused. All five text fields support
atomic references to an explicit asset ID, exact media ID and purpose.
The actual shot editor uses custom HTML comboboxes for scale, operation and image
limit, with no native select elements. The styled popover keeps
selection and keyboard focus on the trigger: arrows/Home/End navigate, Enter or
Space confirms, and Escape cancels without closing the editor. Tab, outside click,
resize and editor disposal dismiss it. Opening another dropdown closes the first.
Options remain within the viewport; selection updates only the local draft until
the normal atomic save.
The picker opens six pixels below the current mention caret, or above it when
space is limited; replacement anchors to the clicked reference chip. It clamps
to the viewport and follows scrolling while the anchor is visible, dismissing
when the anchor leaves its scroll container.

Compact tabs select both a purpose and matching candidates: character, scene,
prop (including product assets), and style filter by asset type. Name search
combines with that filter, and typing within the same mention retains it. The
automatic tab shows all assets and derives the selected asset's purpose, including
style. First/last-frame tabs allow any available image and assign the explicit
frame purpose. Empty results do not silently fall back to unrelated assets.
Mouse selection preserves the text caret. Tab enters the selector; Left/Right
and Home/End switch tabs. Escape closes it and returns focus to the editor.
Selecting a tab never changes a stored reference until an image is chosen;
reopening a reference selects its saved purpose and corresponding filter.
Inline chips show only a compact `@name`, without thumbnails or version text.
Hovering or focusing a chip previews its exact bound image, version and role;
clicking still opens the replacement picker. Escape dismisses the preview, and
editing, scrolling or closing the editor clears it without changing the binding.
Plain text never creates a reference. Replacing a chip changes the media input;
deleting its last occurrence removes that image from the compiled input list.
The panel displays the current compiled draft with ordered thumbnails. The footer
offers cancel, input export and save, plus a compact saved/unsaved status. It has
no image-import chooser, manual prepare/copy section or routine revision display.
Export automatically verifies the current inputs. Only conflicts or missing
revision state reveal reread/reconciliation controls, preserving edited drafts.

Input feedback leads with a Chinese explanation and a concrete correction for
no-image/reference mode mismatches, missing references, first/last-frame purpose
requirements and image-count limits. Technical codes/messages remain available
in collapsed details. A suggested mode switch requires an explicit click, keeps
all image bindings and changes only the draft; normal save/cancel semantics apply.
Validation and frame-role requirements are never bypassed or silently rewritten.

Structured copy/cut/paste preserves each exact asset/media/role binding, including
two assets associated with the same registered image. Unavailable associations
fall back to unbound plain text and require explicit selection before preparation.
External Agent handoff still requires a fresh prepare after all chunks have been
read and immediately before submission; a changed hash or error stops the handoff.

The picker initially loads 24 unique images, prioritizing referenced versions;
**加载更多参考图片** loads another batch. Three image reads run concurrently, through
the validated media bridge with byte/hash/decoding checks. Failed reads are shown
and excluded from choices. Closing or switching views disposes pending UI work.

The real workbench uses `FilmShotAuthoring` for preview and backend preparation.
See [storyboard-port.md](storyboard-port.md) for every field's ownership and
image/video applicability. Current-input export includes unsaved edits as a
`saved:false` package with `inputHash` and base revisions; it verifies associations,
source-shot revisions, image bytes and unchanged production revision. It does not
pretend to have a backend requestHash. Saved current/episode exports use prepared
request hashes and recheck after chunk reads; episode export is all-or-nothing.
Draft export never writes shot fields. Registered current/historical image versions
remain selectable; material registration belongs outside the shot editor.

`views/shot-table-prototype.html` is a standalone review artifact built from
`design/reference-prototype.template.html`, `design/reference-prototype.js`, and
the actual shared compiler/editor. It uses isolated local storage and explicitly
labeled generated fixture PNGs, not user works. Its download contains the exact
compiled prompt and ordered base64 image bytes; hashes and byte lengths are
checked before download. The prototype supports imported PNG/JPEG files up to
2 MiB for handoff inspection. Reimporting identical bytes for the same asset reuses
one candidate ID; importing them for another asset keeps a distinct association.
Real plugin media limits remain as specified above.

In the prototype table and card views, open a shot's **操作 → 编辑镜头** menu to
edit its prompt, references and shot parameters. There is no separate generation
input column or inline edit-text action. The same menu retains move/delete actions
and supports keyboard navigation, Escape dismissal and focus return.

The prototype prompt dialog also edits shot scale, lighting, camera motion,
duration, dialogue/narration and sound effects. These controls are local drafts: each edit updates
the compiled preview and exported input, while cancel leaves the saved shot
unchanged. Saving validates all fields before updating the brief and shot settings
together, advances the shot revision once, and refreshes the table. Duration must
be finite and greater than zero, up to 600 seconds; invalid values block saving
and export and clear stale preview.

Body, lighting, motion, dialogue and sound effects use the same reference editor.
Typing `@` opens all eligible asset/image candidates; typing a name filters them. Only an
explicit choice creates a binding. Pending mentions show a neutral selection hint
and block export. Selection, replacement and deletion immediately recompile all
fields together, with deduplication and slot numbering shared across fields.

The prototype stores optional `referenceFields.light`, `.motion`, `.dialogue` and
`.sfx` documents in its local draft. Each uses the shared reference-document schema;
the corresponding plain strings are display copies written on save. Documents
are authoritative when present. Older plain-string drafts remain readable without
automatic binding or storage writes. Table shortcuts open this same editor so
they cannot silently discard structured references. Switching or closing dialogs
disposes every editor and its menus/listeners.
Clicking a sound-effect cell in either view opens the complete prompt/reference
dialog with the sound-effect editor focused and its saved content prefilled.
Sound edits update the prompt/export; save synchronizes the table, while cancel
leaves the saved shot unchanged. Clearing the field omits sound effects from input.

Text and line breaks are retained. Clearing a field removes its references from
the input unless another field still uses them. Browser acceptance covers immediate
@ menus, exact export bytes, image replacement, cross-field deduplication, existing
and new shots, invalid duration recovery, cancellation, and persistence after reload.

```bash
node scripts/build-reference-prototype.cjs
node scripts/build-reference-prototype.cjs --check
node scripts/sync-manifest.cjs --check
node --test tests/*.test.cjs
python3 tests/reference-prototype.browser.py
python3 tests/reference-fields.browser.py
python3 tests/generation-panel.browser.py
python3 tests/storyboard-port.browser.py
python3 tests/generation-export.browser.py
python3 tests/reference-picker.browser.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/generation-select.browser.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/generation-guidance.browser.py
```

The prototype browser test decodes downloaded files and compares their hashes
and slots with the visible preview after editing, replacing, deleting, renaming,
reloading and changing input modes. It also checks shared-image clipboard
round-trips, invalid clipboard bindings, and repeated/cross-asset imports.
The workbench browser test runs real main.js and renderer files with a loopback
fixture host; it checks verified export without a manual preparation step, exact
image-byte alignment, draft retention, reload and conditional conflict recovery.
Both use isolated state. Neither invokes a real provider or modifies an installed
plugin. External generator acceptance must be verified against its actual
supported schema and authorized call separately.

Storyboard organization acceptance (requires local FFmpeg for isolated synthetic
video/audio fixtures):

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tests/storyboard-organization.browser.py
```

This flow verifies always-visible input/result/constraint/review fields, correct
scope and meanings for defaults, planned durations and measured media, retained
frame/audio assets, and inline episode editing. It checks responsive layout,
sequence cleanup on shot/view changes and unchanged stored data after browsing.
