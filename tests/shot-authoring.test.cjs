"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const authoring = require("../lib/shot-authoring.js");
const doc = text => ({ schemaVersion: 1, nodes: [{ type: "text", text }] });
const ref = (assetId, mediaId, role = "identity") => ({ type: "reference", assetId, mediaId, role });
const assets = [{ id: "a", name: "Mira", mediaId: "m" }, { id: "b", name: "Station", referenceMediaIds: ["n"] }];
const media = [{ id: "m", kind: "image", mimeType: "image/png", byteLength: 68, sha256: "a".repeat(64) },
  { id: "n", kind: "image", mimeType: "image/jpeg", byteLength: 80, sha256: "b".repeat(64) }];
function fixture() {
  const shot = { scene: "Legacy body", duration: 2.5, assetIds: ["unused"], soundDesign: { music: "Solo cello", effects: "Wind" },
    outputs: { video: "output" }, productionPlan: { generationDurationSeconds: 8, headHandleSeconds: 1, tailHandleSeconds: 2 } };
  const production = { kind: "film", ratio: "9:16", style: "Ink", fps: 30, music: "Theme", voice: "Quiet" };
  const draft = authoring.fromShot(shot, production);
  draft.body.nodes = [{ type: "text", text: "Follow " }, ref("a", "m")];
  draft.lighting = doc("Sunrise"); draft.motion.nodes = [ref("b", "n", "scene")];
  draft.dialogue = doc("Wait."); draft.effects = doc("Footsteps"); draft.scale = authoring.SCALES[2]; draft.operation = "video.reference";
  return { shot, production, draft };
}
test("drafts are detached, legacy fields never auto-bind names, patches preserve music/plans and union all assets", () => {
  const { shot, production, draft } = fixture(), before = structuredClone(shot);
  assert.deepEqual(authoring.FIELDS, ["body", "lighting", "motion", "dialogue", "effects"]);
  assert.equal(authoring.SCALES.length, 8);
  const patch = authoring.patch(draft, shot, assets);
  assert.equal(patch.scene, "Follow Mira");
  assert.equal(patch.motion, "Station");
  assert.deepEqual(patch.assetIds, ["unused", "a", "b"]);
  assert.deepEqual(patch.soundDesign, { music: "Solo cello", effects: "Footsteps" });
  assert.deepEqual(shot, before);
  patch.generationBrief.nodes[0].text = "Changed";
  assert.equal(draft.body.nodes[0].text, "Follow ");
  assert.equal(authoring.fromShot({ scene: "@Mira", duration: 0 }, production).body.nodes[0].type, "text");
  const legacy = authoring.fromShot({ generationBrief: doc("x".repeat(24000)), duration: 0 }, {});
  assert.equal(legacy.body.nodes[0].text.length, 24000);
  assert.throws(() => authoring.validateDraft(legacy), /body exceeds 2000/);
});
test("strict draft limits reject invalid documents, fields, numbers and resolved name overflow without truncation", () => {
  const { shot, draft } = fixture();
  for (const patch of [{ unknown: "x" }, { scale: "wide" }, { duration: NaN }, { duration: 601 }, { duration: -1 },
    { maxReferenceImages: 0 }, { maxReferenceImages: 1.5 }, { operation: "fake" }, { body: { ...doc("x"), extra: true } }]) {
    assert.throws(() => authoring.validateDraft({ ...draft, ...patch }), { code: "INVALID_ARGUMENT" });
  }
  for (const [field, limit] of [["body", 2000], ["lighting", 8000], ["motion", 2000], ["dialogue", 2000], ["effects", 8000]]) {
    assert.equal(authoring.validateDraft({ ...draft, [field]: doc("x".repeat(limit)) })[field].nodes[0].text.length, limit);
    assert.throws(() => authoring.validateDraft({ ...draft, [field]: doc("x".repeat(limit + 1)) }), /exceeds/);
  }
  draft.body.nodes = [{ type: "text", text: "x".repeat(2000) }, ref("a", "m")];
  assert.throws(() => authoring.patch(draft, shot, assets), /including reference names/);
});
test("image and video share compilation while excluding only inapplicable authored fields", () => {
  const f = fixture(), shot = { ...f.shot, ...authoring.patch(f.draft, f.shot, assets) };
  const image = authoring.compile({ shot, production: f.production, assets, media, operation: "image.reference", maxReferenceImages: 1 });
  assert.deepEqual(image.parameters, { ratio: "9:16", style: "Ink" });
  assert.deepEqual(image.images.map(image => image.mediaId), ["m"]);
  assert.match(image.prompt, /Scale: 中景\n\nLighting: Sunrise/);
  for (const word of ["Footsteps", "Station", "Wait.", "Solo cello", "Theme", "Quiet", "FPS", "duration"]) assert.ok(!image.prompt.includes(word));
  for (const field of ["motion", "dialogue", "effects", "soundDesign.music", "voice", "music", "duration", "fps", "productionPlan.generationDurationSeconds"]) assert.ok(image.omittedFields.includes(field));
  const video = authoring.compile({ shot, production: f.production, assets, media });
  assert.deepEqual(video.parameters, { ratio: "9:16", style: "Ink", editDurationSeconds: 2.5, requestedDurationSeconds: 8, headHandleSeconds: 1, tailHandleSeconds: 2, fps: 30 });
  assert.deepEqual(video.omittedFields, []);
  assert.deepEqual(video.images.map(image => image.mediaId), ["m", "n"]);
  for (const word of ["Footsteps", "Station", "Wait.", "Solo cello", "Theme", "Quiet"]) assert.ok(video.prompt.includes(word));
  assert.throws(() => authoring.compile({ shot, production: f.production, assets, media, maxReferenceImages: 1 }), { code: "LIMIT_EXCEEDED" });
  delete shot.productionPlan;
  assert.equal(authoring.compile({ shot, production: {}, assets, media }).parameters.requestedDurationSeconds, undefined);
  assert.throws(() => authoring.compile({ shot, production: {}, assets, media, operation: "video.image" }), { code: "UNSUPPORTED_REFERENCE_MODE" });
  assert.throws(() => authoring.compile({ shot, production: {}, assets: assets.map(asset => ({ ...asset, mediaId: undefined, referenceMediaIds: [] })), media }), { code: "CONFLICT" });
});
test("all valid field documents compile without an aggregate node/text truncation and UMD matches Node", () => {
  const { shot, production, draft } = fixture();
  for (const field of authoring.FIELDS) draft[field] = { schemaVersion: 1, nodes: Array.from({ length: 256 }, () => ({ type: "text", text: "x" })) };
  draft.body = doc("x".repeat(2000)); draft.lighting = doc("x".repeat(8000)); draft.effects = doc("x".repeat(8000));
  const input = { shot: { ...shot, ...authoring.patch(draft, shot, assets) }, production, assets, media, operation: "video.text" };
  const node = authoring.compile(input);
  assert.ok(node.prompt.length > 18000);
  const context = vm.createContext({});
  for (const name of ["reference-document", "shot-authoring"]) vm.runInContext(fs.readFileSync(require.resolve(`../lib/${name}.js`), "utf8"), context);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`FilmShotAuthoring.compile(${JSON.stringify(input)})`, context))), node);
});
test("legacy clip dependency hashes remain compatible until authored inputs change", () => {
  const { clipFingerprint } = require("../lib/editing-dependencies.js");
  const snapshot = { document: { shots: [{ id: "legacy", scene: "Original", duration: 4, assetIds: [], outputs: {} }], assets: [] },
    shotStates: { legacy: { revision: 3 } }, media: [] };
  const clip = { shotId: "legacy", mediaId: "old-source", inSeconds: 0, outSeconds: 4, speed: 1 };
  // Captured from HEAD's dependency implementation, before optional authoring fields.
  assert.equal(clipFingerprint(snapshot, clip), "411571a03067599363aa88bcffcb5f8a51d32ad834532c2f6f191bc16c289d66");
  snapshot.document.shots[0].lighting = "Sunrise";
  assert.notEqual(clipFingerprint(snapshot, clip), "411571a03067599363aa88bcffcb5f8a51d32ad834532c2f6f191bc16c289d66");
});
