"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateDocument, compile } = require("../lib/reference-document.js");
const text = text => ({ type: "text", text });
const ref = (assetId = "a", mediaId = "m", role = "identity") => ({ type: "reference", assetId, mediaId, role });
const doc = (...nodes) => ({ schemaVersion: 1, nodes });
const assets = [{ id: "a", name: "Mira" }, { id: "b", name: "Station" }];
const media = [{ id: "m", kind: "image", mimeType: "image/png", sha256: "a".repeat(64), byteLength: 68 },
  { id: "n", kind: "image", mimeType: "image/jpeg", sha256: "b".repeat(64), byteLength: 88 }];
const run = (document, extra = {}) => compile({ document, assets, media, operation: "image.reference", ...extra });

test("inline replacement and legend use one ordered byte slot for repeated media", () => {
  const result = run(doc(text("Follow "), ref(), text(" past "), ref("b", "m", "scene"), text(" then "), ref()));
  assert.equal(result.prompt, "Follow Mira〔图1〕 past Station〔图1〕 then Mira〔图1〕\n\nReference images:\n图1: Mira [identity]; Station [scene]");
  assert.deepEqual(result.images, [{ slot: 1, mediaId: "m", assetIds: ["a", "b"], roles: ["identity", "scene"], mimeType: "image/png", sha256: media[0].sha256, byteLength: 68 }]);
  assert.equal(result.referenceCount, 3);
});

test("deleting mentions, renaming assets and replacing images recomputes slots", () => {
  assert.equal(run(doc(ref(), ref())).images.length, 1);
  assert.equal(run(doc(ref())).images.length, 1);
  assert.equal(run(doc(text("Mira")), { operation: "image.generate" }).images.length, 0);
  assert.throws(() => run(doc(text("Mira"))), { code: "UNSUPPORTED_REFERENCE_MODE" });
  const replaced = run(doc(ref("a", "n")), { assets: [{ id: "a", name: "Renamed" }] });
  assert.match(replaced.prompt, /^Renamed〔图1〕/);
  assert.equal(replaced.images[0].sha256, media[1].sha256);
});

test("text never binds names and unresolved @ drafts cannot compile", () => {
  const draft = doc(text("@Mira"));
  assert.deepEqual(validateDocument(draft), draft);
  assert.throws(() => run(draft), { code: "UNRESOLVED_REFERENCE" });
  assert.equal(run(doc(text("Mira walks")), { operation: "video.text" }).prompt, "Mira walks");
});

test("first-last frame slots are semantic even when mentions are reversed", () => {
  const result = run(doc(ref("b", "n", "last-frame"), text(" after "), ref("a", "m", "first-frame")), { operation: "video.first-last" });
  assert.deepEqual(result.images.map(image => image.mediaId), ["m", "n"]);
  assert.match(result.prompt, /^Station〔图2〕 after Mira〔图1〕/);
  assert.equal(run(doc(ref("a", "m", "first-frame")), { operation: "video.image" }).images.length, 1);
  for (const operation of ["image.generate", "video.text", "video.image", "video.first-last"]) {
    assert.throws(() => run(doc(ref()), { operation }), { code: "UNSUPPORTED_REFERENCE_MODE" });
  }
  assert.throws(() => run(doc(ref("a", "m", "first-frame"), ref("b", "m", "last-frame")), { operation: "video.first-last" }), { code: "UNSUPPORTED_REFERENCE_MODE" });
  assert.throws(() => run(doc(ref()), { operation: "invented" }), { code: "INVALID_ARGUMENT" });
});

test("metadata and reference identity are checked without inventing a path", () => {
  for (const document of [doc(ref("missing")), doc(ref("a", "missing"))]) assert.throws(() => run(document), { code: "NOT_FOUND" });
  for (const patch of [{ kind: "video" }, { mimeType: "image/svg+xml" }, { sha256: "fake" }, { byteLength: 0 }, { sha256: undefined }]) {
    assert.throws(() => run(doc(ref()), { media: [{ ...media[0], ...patch }] }), { code: "INVALID_ARGUMENT" });
  }
  assert.throws(() => run(doc(ref()), { media: [{ ...media[0], byteLength: 32 * 1024 * 1024 + 1 }] }), { code: "LIMIT_EXCEEDED" });
  assert.equal(JSON.stringify(run(doc(ref()))).includes("fileName"), false);
});

test("strict detached bounded documents reject unknown keys, bad roles and ids", () => {
  const input = doc(text(" hello "), ref());
  const normalized = validateDocument(input);
  normalized.nodes[0].text = "changed";
  assert.equal(input.nodes[0].text, " hello ");
  for (const bad of [{ ...input, refs: [] }, doc({ ...ref(), role: "camera" }), doc({ ...ref(), path: "fake.png" }), doc(ref("../a")), doc({ type: "text", text: 1 }), { schemaVersion: 2, nodes: [] }]) {
    assert.throws(() => validateDocument(bad), { code: "INVALID_ARGUMENT" });
  }
  for (const bad of [doc(...Array.from({ length: 257 }, () => text(""))), doc(text("x".repeat(24001)))]) {
    assert.throws(() => validateDocument(bad), { code: "LIMIT_EXCEEDED" });
  }
  assert.equal(validateDocument(doc(text("x".repeat(24000)))).nodes[0].text.length, 24000);
  for (const maxReferenceImages of [0, 9, 1.5, null]) assert.throws(() => run(doc(ref()), { maxReferenceImages }), { code: "INVALID_ARGUMENT" });
  assert.throws(() => run(doc(ref(), ref("b", "n")), { maxReferenceImages: 1 }), { code: "LIMIT_EXCEEDED" });
});

test("browser UMD and Node produce identical compiled requests", () => {
  const vm = require("node:vm"), fs = require("node:fs");
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve("../lib/reference-document.js"), "utf8"), context);
  const input = { document: doc(ref(), text(" with "), ref("b", "n", "style")), assets, media, operation: "video.reference" };
  const output = vm.runInContext(`FilmReferenceDocument.compile(${JSON.stringify(input)})`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(output)), compile(input));
});

test("eight images are allowed, ninth fails, and duplicate mentions never renumber later slots", () => {
  const manyAssets = Array.from({ length: 9 }, (_, index) => ({ id: `a${index}`, name: `Asset ${index}` }));
  const manyMedia = manyAssets.map((asset, index) => ({ ...media[0], id: `m${index}`, sha256: String(index).repeat(64) }));
  const nodes = manyAssets.map((asset, index) => ref(asset.id, `m${index}`));
  const extra = { assets: manyAssets, media: manyMedia, operation: "video.reference" };
  assert.equal(run(doc(...nodes.slice(0, 8)), extra).images.length, 8);
  assert.throws(() => run(doc(...nodes), extra), { code: "LIMIT_EXCEEDED" });
  const result = run(doc(ref(), ref(), ref("b", "n", "prop")));
  assert.deepEqual(result.images.map(image => image.mediaId), ["m", "n"]);
  assert.match(result.prompt, /^Mira〔图1〕Mira〔图1〕Station〔图2〕/);
  assert.throws(() => compile(), { code: "INVALID_ARGUMENT" });
});
