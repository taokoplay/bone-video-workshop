"use strict";
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const tools = new Map();
let root, workspace, plugin;
// Valid 1x1 RGB PNGs with distinct red/blue pixels and matching PNG checksums.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
const OTHER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC", "base64");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const call = (name, args) => tools.get(name).execute(args);
const read = id => call("get_production", { id });
const text = text => ({ type: "text", text });
const ref = (assetId, mediaId, role = "identity") => ({ type: "reference", assetId, mediaId, role });
const doc = (...nodes) => ({ schemaVersion: 1, nodes });
const filename = id => path.join(root, "private", "productions", id, "snapshot.json");
before(async () => {
  root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), "bone-handoff-"));
  workspace = path.join(root, "workspace");
  await fs.mkdir(path.join(workspace, "bone-media"), { recursive: true });
  await fs.writeFile(path.join(workspace, "bone-media/first.png"), PNG);
  await fs.writeFile(path.join(workspace, "bone-media/last.png"), OTHER);
  globalThis.pi = {
    plugin: { getDataPath: async () => path.join(root, "private"), getManifest: async () => JSON.parse(await fs.readFile(path.join(__dirname, "../manifest.json"), "utf8")) },
    commands: { register: async () => {}, unregister: async () => {} }, ui: { revealView: async () => {} },
    agent: { registerTool: async tool => tools.set(tool.name, tool), unregisterTool: async name => tools.delete(name) },
    workspace: { get: async () => ({ path: workspace }) },
    fs: {
      stat: async relative => { const info = await fs.stat(path.join(workspace, relative)); return { size: info.size, mtimeMs: info.mtimeMs }; },
      readRange: async (relative, offset, length) => { const bytes = await fs.readFile(path.join(workspace, relative)); return { bytes: new Uint8Array(bytes.subarray(offset, offset + length)), totalSize: bytes.length }; },
    },
  };
  plugin = require("../main.js");
  await plugin.onLoad();
});
after(async () => { await plugin.onUnload(); delete globalThis.pi; await fs.rm(root, { recursive: true, force: true }); });
async function fixture(withBrief = true) {
  const { id } = await call("create_production", { title: "Reference handoff", kind: "film" });
  const { episodeId } = await call("write_script", { id, title: "Arrival", prose: "Mira arrives." });
  await call("write_episodes", { id, episodes: [{ episodeId, title: "Arrival", beats: [{ title: "Arrival" }] }] });
  const beatId = (await read(id)).production.episodes[0].script.beats[0].id;
  const { assets } = await call("add_assets", { id, assets: [{ name: "Mira", type: "角色" }, { name: "Station", type: "场景" }, { name: "Unrelated", type: "道具" }] });
  const a = await call("register_media", { id, path: "bone-media/first.png", kind: "image" });
  const b = await call("register_media", { id, path: "bone-media/last.png", kind: "image" });
  for (const [index, item] of [a, b].entries()) await call("adopt_media", { id, assetId: assets[index].id, mediaId: item.mediaId });
  const brief = doc(text("Follow "), ref(assets[0].id, a.mediaId), text(" past "), ref(assets[1].id, b.mediaId, "scene"));
  const { shots } = await call("add_shots", { id, episodeId, shots: [{ title: "Arrival", scene: "Narrative scene", beatId,
    assetIds: assets.map(asset => asset.id), ...(withBrief ? { generationBrief: brief } : {}) }] });
  const shotId = shots[0].id;
  return { id, episodeId, beatId, shotId, assets, a, b, brief,
    async args(operation = "image.reference") { return { id, shotId, expectedShotRevision: (await read(id)).shotStates[shotId].revision, operation }; },
    update: patch => call("update_shot", { id, shotId, ...patch }),
  };
}
async function assemble(args, prepared, adapter) {
  const images = [];
  for (const image of prepared.compiled.images) {
    const chunks = [];
    let offset = 0, eof = false;
    while (!eof) {
      const chunk = await call("read_generation_image", { ...args, requestHash: prepared.requestHash, slot: image.slot, offset, length: 17 });
      assert.equal(chunk.offset, offset);
      assert.equal(chunk.mediaId, image.mediaId);
      assert.equal(chunk.encoding, "base64");
      const bytes = Buffer.from(chunk.data, "base64");
      assert.equal(bytes.length, chunk.nextOffset - offset);
      chunks.push(bytes); offset = chunk.nextOffset; eof = chunk.eof;
    }
    const bytes = Buffer.concat(chunks);
    assert.equal(bytes.length, image.byteLength);
    assert.equal(sha(bytes), image.sha256);
    images.push(bytes);
  }
  assert.equal((await call("prepare_shot_generation", args)).requestHash, prepared.requestHash);
  return adapter({ prompt: prepared.compiled.prompt, images });
}

test("registered tools persist brief, prepare and assemble exact ordered images into an adapter stub", async () => {
  const f = await fixture();
  const brief = doc(ref(f.assets[1].id, f.b.mediaId, "last-frame"), text(" after "), ref(f.assets[0].id, f.a.mediaId, "first-frame"));
  await f.update({ generationBrief: brief });
  const args = await f.args("video.first-last"), disk = await fs.readFile(filename(f.id));
  const prepared = await call("prepare_shot_generation", args);
  assert.deepEqual(await plugin.onPanelInvoke("bone.generation.prepare", args), prepared);
  assert.equal(prepared.productionRevision, (await read(f.id)).production.revision);
  assert.equal(prepared.shotRevision, args.expectedShotRevision);
  let calls = 0;
  await assemble(args, prepared, payload => {
    calls++;
    assert.match(payload.prompt, /^Station〔图2〕 after Mira〔图1〕/);
    assert.deepEqual(payload.images, [PNG, OTHER]);
  });
  assert.equal(calls, 1);
  const chunkArgs = { ...args, requestHash: prepared.requestHash, slot: 1, offset: 0, length: 65536 };
  assert.deepEqual(await plugin.onPanelInvoke("bone.generation.read-image", chunkArgs), await call("read_generation_image", chunkArgs));
  assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  assert.equal(JSON.stringify(prepared).includes("fileName"), false);
  await plugin.onUnload(); delete require.cache[require.resolve("../main.js")];
  plugin = require("../main.js"); await plugin.onLoad();
  assert.equal((await call("prepare_shot_generation", args)).requestHash, prepared.requestHash);
  assert.equal((await call("read_generation_image", chunkArgs)).data, PNG.toString("base64"));
});

test("brief omission preserves, null clears, scene changes require explicit reconciliation", async () => {
  const f = await fixture();
  await f.update({ motion: "Pan" });
  assert.deepEqual((await read(f.id)).production.shots[0].generationBrief, f.brief);
  const before = await fs.readFile(filename(f.id));
  await assert.rejects(f.update({ scene: "Changed" }), { code: "CONFLICT" });
  await assert.rejects(f.update({ assetIds: [f.assets[0].id] }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(call("delete_asset", { id: f.id, assetId: f.assets[1].id }), { code: "CONFLICT" });
  await assert.rejects(f.update({ generationBrief: doc(ref("missing", f.a.mediaId)) }), { code: "NOT_FOUND" });
  await assert.rejects(f.update({ generationBrief: { ...f.brief, refs: [] } }), { code: "INVALID_ARGUMENT" });
  assert.deepEqual(await fs.readFile(filename(f.id)), before);
  await f.update({ scene: "Changed", generationBrief: f.brief });
  await f.update({ generationBrief: doc(text("Only words")) });
  assert.deepEqual((await read(f.id)).production.shots[0].assetIds, f.assets.map(asset => asset.id));
  assert.equal((await call("prepare_shot_generation", await f.args("image.generate"))).compiled.prompt, "Only words\n\nRatio: 16:9");
  await f.update({ scene: "New narrative", generationBrief: null });
  assert.equal((await read(f.id)).production.shots[0].generationBrief, undefined);
  await assert.rejects(call("prepare_shot_generation", await f.args("image.generate")), { code: "INVALID_ARGUMENT" });
});

test("text edits, renamed assets, replaced bytes and deletion invalidate old requests before the adapter", async () => {
  const f = await fixture();
  let args = await f.args(), prepared = await call("prepare_shot_generation", args), adapterCalls = 0;
  const adapter = () => adapterCalls++;
  await f.update({ generationBrief: doc(text("Revised "), ...f.brief.nodes) });
  await assert.rejects(assemble(args, prepared, adapter), { code: "CONFLICT" });
  args = await f.args(); prepared = await call("prepare_shot_generation", args);
  await call("update_asset", { id: f.id, assetId: f.assets[0].id, name: "Renamed" });
  await assert.rejects(assemble(args, prepared, adapter), { code: "CONFLICT" });
  args = await f.args(); prepared = await call("prepare_shot_generation", args);
  assert.match(prepared.compiled.prompt, /Renamed〔图1〕/);
  await call("adopt_media", { id: f.id, assetId: f.assets[0].id, mediaId: f.b.mediaId });
  await assert.rejects(assemble(args, prepared, adapter), { code: "CONFLICT" });
  const pinned = await call("prepare_shot_generation", await f.args());
  assert.equal(pinned.compiled.images[0].mediaId, f.a.mediaId);
  assert.equal(pinned.compiled.images[0].sha256, sha(PNG));
  assert.deepEqual((await read(f.id)).production.assets[0].referenceMediaIds, [f.a.mediaId, f.b.mediaId]);
  await f.update({ generationBrief: doc(ref(f.assets[0].id, f.b.mediaId), ref(f.assets[1].id, f.b.mediaId, "scene")) });
  args = await f.args(); prepared = await call("prepare_shot_generation", args);
  assert.equal(prepared.compiled.images.length, 1);
  await f.update({ generationBrief: doc(text("No references")) });
  await assert.rejects(assemble(args, prepared, adapter), { code: "CONFLICT" });
  await assert.rejects(call("prepare_shot_generation", await f.args()), { code: "UNSUPPORTED_REFERENCE_MODE" });
  assert.equal(adapterCalls, 0);
});

test("legacy read does not rewrite snapshots and draft @ text never auto-binds", async () => {
  const f = await fixture(false), disk = await fs.readFile(filename(f.id));
  await read(f.id);
  await assert.rejects(call("prepare_shot_generation", await f.args()), { code: "INVALID_ARGUMENT" });
  assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  await f.update({ generationBrief: doc(text("@Mira")) });
  await assert.rejects(call("prepare_shot_generation", await f.args()), { code: "UNRESOLVED_REFERENCE" });
  await f.update({ generationBrief: doc(text("Mira")) });
  assert.equal((await call("prepare_shot_generation", await f.args("video.text"))).compiled.images.length, 0);
});

test("bounded range and request validation reject altered hashes, operations, slots and offsets", async () => {
  const f = await fixture(), args = await f.args(), prepared = await call("prepare_shot_generation", args);
  const request = { ...args, requestHash: prepared.requestHash, slot: 1, offset: 0, length: 65536 };
  for (const patch of [{ slot: 0 }, { slot: 3 }, { offset: -1 }, { offset: PNG.length + 1 }, { offset: 0.5 }, { length: 0 }, { length: 65537 }, { length: 1.5 }, { fileName: "secret" }]) {
    await assert.rejects(call("read_generation_image", { ...request, ...patch }), { code: "INVALID_ARGUMENT" });
  }
  await assert.rejects(call("read_generation_image", { ...request, requestHash: "a".repeat(64) }), { code: "CONFLICT" });
  await assert.rejects(call("read_generation_image", { ...request, operation: "video.reference" }), { code: "CONFLICT" });
  await assert.rejects(call("read_generation_image", { ...request, maxReferenceImages: 3 }), { code: "CONFLICT" });
  const end = await call("read_generation_image", { ...request, offset: PNG.length });
  assert.equal(end.data, ""); assert.equal(end.eof, true); assert.equal(end.nextOffset, PNG.length);
});

test("missing, corrupt and symlinked private files cannot prepare or reach an adapter", async () => {
  const f = await fixture(), args = await f.args(), prepared = await call("prepare_shot_generation", args);
  const file = path.join(root, "private", "productions", f.id, "media", `${f.a.sha256}.png`);
  let adapterCalls = 0;
  await fs.writeFile(file, Buffer.alloc(PNG.length));
  await assert.rejects(call("prepare_shot_generation", args), { code: "INVALID_ARGUMENT" });
  await assert.rejects(assemble(args, prepared, () => adapterCalls++), { code: "INVALID_ARGUMENT" });
  await fs.unlink(file);
  await assert.rejects(call("prepare_shot_generation", args), { code: "NOT_FOUND" });
  await fs.symlink(path.join(workspace, "bone-media/first.png"), file);
  await assert.rejects(call("prepare_shot_generation", args), { code: "PERMISSION_DENIED" });
  assert.equal(adapterCalls, 0);
});

async function pausePrivateOpen(action, during) {
  const original = fs.open;
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let paused = false;
  fs.open = async (...args) => {
    if (!paused && String(args[0]).includes(`${path.sep}media${path.sep}`)) {
      paused = true; entered(); await gate;
    }
    return original(...args);
  };
  const pending = action();
  try { await ready; await during(); release(); return await pending; }
  finally { release(); fs.open = original; }
}
test("revision races during private reads reject prepare and read; caller inputs are detached", async () => {
  const f = await fixture();
  let args = await f.args();
  await assert.rejects(pausePrivateOpen(() => call("prepare_shot_generation", args), () => f.update({ motion: "Changed while preparing" })), { code: "CONFLICT" });
  args = await f.args();
  const prepared = await call("prepare_shot_generation", args);
  const request = { ...args, requestHash: prepared.requestHash, slot: 1, offset: 0, length: 17 };
  await assert.rejects(pausePrivateOpen(() => call("read_generation_image", request), () => f.update({ dialogue: "Changed while reading" })), { code: "CONFLICT" });
  args = await f.args();
  const pending = call("prepare_shot_generation", args);
  args.shotId = "missing"; args.operation = "video.text";
  assert.equal((await pending).compiled.operation, "image.reference");
  const input = { id: f.id, shotId: f.shotId, generationBrief: doc(text("Frozen wording")) };
  const update = call("update_shot", input);
  input.generationBrief.nodes[0].text = "Mutated after enqueue";
  await update;
  assert.equal((await read(f.id)).production.shots[0].generationBrief.nodes[0].text, "Frozen wording");
});

test("origin-shot media requires current paired provenance, including after restart", async () => {
  const f = await fixture();
  const { shots } = await call("add_shots", { id: f.id, episodeId: f.episodeId, shots: [{ title: "Origin", scene: "Source", beatId: f.beatId }] });
  const sourceId = shots[0].id;
  // A distinct source file avoids the existing media library's hash deduplication.
  await fs.writeFile(path.join(workspace, "bone-media/source.png"), Buffer.concat([PNG, Buffer.from("origin")]));
  const item = await call("register_media", { id: f.id, path: "bone-media/source.png", kind: "image", shotId: sourceId, expectedShotRevision: 1 });
  await call("adopt_media", { id: f.id, assetId: f.assets[0].id, mediaId: item.mediaId });
  await f.update({ generationBrief: doc(ref(f.assets[0].id, item.mediaId)) });
  const args = await f.args();
  await call("prepare_shot_generation", args);
  await call("update_shot", { id: f.id, shotId: sourceId, scene: "Source changed" });
  await assert.rejects(call("prepare_shot_generation", args), { code: "CONFLICT" });
  const snapshot = JSON.parse(await fs.readFile(filename(f.id), "utf8"));
  delete snapshot.media.find(media => media.id === item.mediaId).shotRevision;
  await fs.writeFile(filename(f.id), JSON.stringify(snapshot));
  await assert.rejects(call("prepare_shot_generation", args), { code: "CONFLICT" });
});

test("staged visual revision uses common brief validation, dirties media/reviews and can restore", async () => {
  const f = await fixture();
  const review = await call("record_review", { id: f.id, expectedProductionRevision: (await read(f.id)).production.revision,
    scope: { kind: "shot", shotId: f.shotId }, category: "text", verdict: "supported", evidence: [], findings: "Read the saved wording", nextAction: "" });
  const change = (field, value) => ({ targetType: "shot", targetId: f.shotId, field, replacementJson: JSON.stringify(value),
    sourceIssue: "Wording", reason: "Explicitly align the prompt", acceptanceCriteria: "Review changed wording" });
  const proposal = async changes => call("save_revision_plan", { id: f.id, expectedProductionRevision: (await read(f.id)).production.revision,
    title: "Brief revision", intent: "visual", instruction: "Revise wording", preserve: ["Asset identity"], reviewIds: [], changes });
  await assert.rejects(proposal([change("scene", "New scene")]), { code: "CONFLICT" });
  const plan = await proposal([change("scene", "New scene"), change("generationBrief", doc(text("New wording "), ...f.brief.nodes))]);
  const args = await f.args(), prepared = await call("prepare_shot_generation", args);
  await call("apply_revision_plan", { id: f.id, planId: plan.planId, expectedProductionRevision: (await read(f.id)).production.revision, confirm: true, authorization: "Fixture authorizes this revision" });
  const changed = await read(f.id);
  assert.equal(changed.shotStates[f.shotId].revision, args.expectedShotRevision + 1);
  assert.equal(changed.shotStates[f.shotId].needsUpdate, true);
  const { snapshot } = await plugin.onPanelInvoke("bone.get", { id: f.id });
  assert.ok(require("../lib/editing-dependencies.js").reviewIssues(snapshot, snapshot.reviews.find(item => item.id === review.review.id)).length);
  await assert.rejects(call("read_generation_image", { ...args, requestHash: prepared.requestHash, slot: 1, offset: 0, length: 17 }), { code: "CONFLICT" });
  await call("restore_revision_plan", { id: f.id, planId: plan.planId, expectedProductionRevision: changed.production.revision, confirm: true, authorization: "Fixture authorizes restoration" });
  assert.deepEqual((await read(f.id)).production.shots[0].generationBrief, f.brief);
});

test("panel saves share the versioned brief path and reject stale or unscoped writes", async () => {
  const f = await fixture(false);
  const before = await read(f.id);
  const args = { id: f.id, shotId: f.shotId, expectedShotRevision: before.shotStates[f.shotId].revision,
    generationBrief: f.brief, assetIds: f.assets.map(asset => asset.id) };
  const { expectedShotRevision, ...withoutRevision } = args;
  await assert.rejects(plugin.onPanelInvoke("bone.generation.save", withoutRevision), { code: "INVALID_ARGUMENT" });
  await assert.rejects(plugin.onPanelInvoke("bone.generation.save", { ...args, scene: "Not allowed here" }), { code: "INVALID_ARGUMENT" });
  assert.deepEqual((await read(f.id)).production, before.production);
  const result = await plugin.onPanelInvoke("bone.generation.save", args);
  assert.equal(result.shotRevision, expectedShotRevision + 1);
  const saved = await read(f.id);
  assert.deepEqual(saved.production.shots[0].generationBrief, f.brief);
  assert.equal(saved.production.shots[0].scene, "Narrative scene");
  await assert.rejects(plugin.onPanelInvoke("bone.generation.save", args), { code: "CONFLICT" });
  const prepared = await plugin.onPanelInvoke("bone.generation.prepare", await f.args());
  assert.match(prepared.compiled.prompt, /Mira〔图1〕/);
  await assemble(await f.args(), prepared, payload => assert.deepEqual(payload.images, [PNG, OTHER]));
});

const authoring = require("../lib/shot-authoring.js");
async function fullDraft(f) {
  const saved = await read(f.id), shot = saved.production.shots.find(shot => shot.id === f.shotId);
  const draft = authoring.fromShot(shot, saved.production);
  return { saved, shot, draft, args: () => ({ ...authoring.patch(draft, shot, saved.production.assets), id: f.id, shotId: f.shotId,
    expectedShotRevision: saved.shotStates[f.shotId].revision }) };
}
test("full editor save reloads every field, preserves history/plans/music and exactly matches prepared inputs", async () => {
  const f = await fixture();
  await f.update({ soundDesign: { effects: "Wind", music: "Saved cello" },
    productionPlan: { sourceScene: "Arrival", purpose: "Arrive", requiredEvents: ["Walk"], generationDurationSeconds: 8,
      headHandleSeconds: 1, tailHandleSeconds: 2, retimePolicy: "forbidden", editingNotes: "Keep action" },
    videoPlan: { mode: "text-to-video", rationale: "Authored plan" },
    continuityPlan: { entryState: "Left", exitState: "Right", rationale: "Travel" } });
  await call("update_production", { id: f.id, voice: "Whisper", music: "Project theme", style: "Ink", fps: 30, ratio: "9:16" });
  await call("adopt_media", { id: f.id, shotId: f.shotId, mediaId: f.a.mediaId, expectedShotRevision: (await f.args()).expectedShotRevision });
  const before = await fullDraft(f);
  before.draft.body = doc(text("  Follow "), ref(f.assets[0].id, f.a.mediaId), text("  "));
  before.draft.lighting = doc(text("Sunrise "), ref(f.assets[0].id, f.a.mediaId, "style"));
  before.draft.motion = doc(text("Pan through "), ref(f.assets[1].id, f.b.mediaId, "scene"));
  before.draft.dialogue = doc(text(" Wait here. "));
  before.draft.effects = doc(text("  Footsteps  "));
  before.draft.scale = authoring.SCALES[6]; before.draft.duration = 2.75;
  before.draft.operation = "video.reference"; before.draft.maxReferenceImages = 2;
  const args = before.args();
  const result = await plugin.onPanelInvoke("bone.generation.save", args);
  assert.equal(result.shotRevision, args.expectedShotRevision + 1);
  const after = await fullDraft(f);
  assert.deepEqual(after.draft, before.draft);
  assert.equal(after.shot.scene, "  Follow Mira  ");
  assert.equal(after.shot.soundDesign.music, "Saved cello");
  for (const key of ["productionPlan", "videoPlan", "continuityPlan", "outputs", "assetIds"]) assert.deepEqual(after.shot[key], before.shot[key]);
  assert.equal(after.saved.shotStates[f.shotId].outputVersion, before.saved.shotStates[f.shotId].outputVersion);
  const { snapshot } = await plugin.onPanelInvoke("bone.get", { id: f.id });
  for (const operation of ["image.reference", "video.reference"]) {
    const request = { ...await f.args(operation), maxReferenceImages: operation === "image.reference" ? 1 : 2 };
    const prepared = await plugin.onPanelInvoke("bone.generation.prepare", request);
    assert.deepEqual(prepared.compiled, authoring.compile({ shot: after.shot, production: after.saved.production,
      assets: after.saved.production.assets, media: snapshot.media, operation, maxReferenceImages: request.maxReferenceImages }));
    await assemble(request, prepared, payload => assert.deepEqual(payload.images, operation === "image.reference" ? [PNG] : [PNG, OTHER]));
    if (operation.startsWith("video")) assert.deepEqual(prepared.compiled.parameters,
      { ratio: "9:16", style: "Ink", editDurationSeconds: 2.75, requestedDurationSeconds: 8, headHandleSeconds: 1, tailHandleSeconds: 2, fps: 30 });
    else assert.ok(prepared.compiled.omittedFields.includes("soundDesign.music"));
  }
});
test("atomic saves reject mismatched fields, oversize and unknown inputs without partial writes; competing saves conflict", async () => {
  const f = await fixture(), before = await fullDraft(f), args = before.args();
  const disk = await fs.readFile(filename(f.id));
  for (const patch of [{ scene: "Wrong" }, { lighting: "Wrong" }, { motion: "Wrong" }, { dialogue: "Wrong" },
    { soundDesign: { music: "Changed music", effects: "" } }, { soundDesign: { music: "", effects: "Wrong" } },
    { assetIds: [] }, { scale: "invented" }, { duration: 601 }, { lighting: "x".repeat(8001) }, { extra: true },
    { referenceFields: { ...args.referenceFields, typo: doc(text("x")) } }, { generationSettings: { operation: "video.text", maxReferenceImages: 9 } }]) {
    await assert.rejects(plugin.onPanelInvoke("bone.generation.save", { ...args, ...patch }));
    assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  }
  const pending = plugin.onPanelInvoke("bone.generation.save", args);
  args.generationBrief.nodes[0].text = "Caller mutation";
  const results = await Promise.allSettled([pending, plugin.onPanelInvoke("bone.generation.save", before.args())]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "CONFLICT");
  assert.deepEqual((await fullDraft(f)).draft, before.draft);
});
test("plain edits and revision proposals reconcile every structured field and all refs constrain assets", async () => {
  const f = await fixture(), before = await fullDraft(f);
  before.draft.motion = doc(text("Around "), ref(f.assets[1].id, f.b.mediaId, "scene"));
  await plugin.onPanelInvoke("bone.generation.save", before.args());
  const disk = await fs.readFile(filename(f.id));
  for (const patch of [{ lighting: "Changed" }, { motion: "Changed" }, { dialogue: "Changed" }, { soundDesign: { music: "", effects: "Changed" } },
    { motion: "Mismatch", referenceFields: { motion: before.draft.motion } }]) await assert.rejects(f.update(patch), { code: "CONFLICT" });
  await assert.rejects(f.update({ assetIds: [f.assets[0].id] }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(call("delete_asset", { id: f.id, assetId: f.assets[1].id }), { code: "CONFLICT" });
  assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  const change = (field, value) => ({ targetType: "shot", targetId: f.shotId, field, replacementJson: JSON.stringify(value), sourceIssue: "Intent", reason: "Reconcile", acceptanceCriteria: "Saved values match" });
  const propose = async changes => call("save_revision_plan", { id: f.id, expectedProductionRevision: (await read(f.id)).production.revision,
    title: "Structured fields", intent: "visual", instruction: "Reconcile", preserve: ["Music"], reviewIds: [], changes });
  await assert.rejects(propose([change("motion", "New motion")]), { code: "CONFLICT" });
  await assert.rejects(propose([change("referenceFields", { motion: doc(text("Mismatch")) })]), { code: "CONFLICT" });
  const plan = await propose([change("motion", "New motion"), change("referenceFields", { motion: doc(text("New motion")) }),
    change("scale", authoring.SCALES[0]), change("generationSettings", { operation: "video.reference", maxReferenceImages: 4 })]);
  await call("apply_revision_plan", { id: f.id, planId: plan.planId, expectedProductionRevision: (await read(f.id)).production.revision, confirm: true, authorization: "Test authorizes this exact plan" });
  assert.equal((await fullDraft(f)).shot.motion, "New motion");
  await call("restore_revision_plan", { id: f.id, planId: plan.planId, expectedProductionRevision: (await read(f.id)).production.revision, confirm: true, authorization: "Test authorizes restoring this plan" });
  assert.deepEqual((await fullDraft(f)).draft.motion, before.draft.motion);
  await f.update({ motion: "Plain again", referenceFields: null });
  assert.equal((await fullDraft(f)).shot.referenceFields, undefined);
});
test("chooser imports preserve real bytes, deduplicate and pin versions without changing adoption or shots", async () => {
  const f = await fixture(), bytes = Buffer.concat([OTHER, Buffer.from("imported candidate")]), before = await read(f.id);
  const input = { id: f.id, assetId: f.assets[0].id, expectedProductionRevision: before.production.revision,
    title: "User-selected image", mimeType: "image/png", data: bytes.toString("base64") };
  const imported = await plugin.onPanelInvoke("bone.generation.import-image", input);
  assert.deepEqual(Object.keys(imported).sort(), ["assetId", "id", "mediaId", "revision"]);
  let saved = await read(f.id);
  assert.equal(saved.production.assets[0].mediaId, f.a.mediaId);
  assert.deepEqual(saved.production.assets[0].referenceMediaIds, [f.a.mediaId, imported.mediaId]);
  assert.deepEqual(saved.production.shots, before.production.shots);
  assert.deepEqual(saved.shotStates, before.shotStates);
  assert.equal((await plugin.onPanelInvoke("bone.media", { id: f.id, mediaId: imported.mediaId })).dataUrl, `data:image/png;base64,${bytes.toString("base64")}`);
  const duplicate = await plugin.onPanelInvoke("bone.generation.import-image", { ...input, expectedProductionRevision: imported.revision });
  assert.equal(duplicate.mediaId, imported.mediaId);
  const draft = await fullDraft(f);
  draft.draft.body = doc(ref(f.assets[0].id, imported.mediaId));
  await plugin.onPanelInvoke("bone.generation.save", draft.args());
  await call("adopt_media", { id: f.id, assetId: f.assets[0].id, mediaId: f.b.mediaId });
  const args = await f.args(), prepared = await call("prepare_shot_generation", args);
  assert.equal(prepared.compiled.images[0].sha256, sha(bytes));
  await assemble(args, prepared, payload => assert.deepEqual(payload.images, [bytes]));
  await f.update({ generationBrief: doc(ref(f.assets[1].id, imported.mediaId)) });
  await assert.rejects(call("prepare_shot_generation", await f.args()), { code: "CONFLICT" });
  await f.update({ generationBrief: doc(ref(f.assets[0].id, "missing")) });
  await assert.rejects(call("prepare_shot_generation", await f.args()));
});
test("imports reject invalid base64/signatures, oversize, stale revisions and locked assets atomically", async () => {
  const f = await fixture(), revision = (await read(f.id)).production.revision;
  const input = { id: f.id, assetId: f.assets[2].id, expectedProductionRevision: revision, title: "Import", mimeType: "image/png", data: PNG.toString("base64") };
  const disk = await fs.readFile(filename(f.id));
  for (const patch of [{ data: "!!!!" }, { data: input.data + "\n" }, { data: "data:image/png;base64," + input.data },
    { data: "AB==" }, { data: "AAAA" }, { data: "" }, { data: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64") },
    { mimeType: "image/jpeg" }, { mimeType: "image/gif" }, { expectedProductionRevision: revision - 1 }, { path: "/tmp/file" }, { title: "x".repeat(301) }]) {
    await assert.rejects(plugin.onPanelInvoke("bone.generation.import-image", { ...input, ...patch }));
    assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  }
  const concurrent = await Promise.allSettled([plugin.onPanelInvoke("bone.generation.import-image", input), plugin.onPanelInvoke("bone.generation.import-image", input)]);
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.find(result => result.status === "rejected").reason.code, "CONFLICT");
  await call("update_asset", { id: f.id, assetId: f.assets[2].id, locked: true });
  const lockedDisk = await fs.readFile(filename(f.id));
  await assert.rejects(plugin.onPanelInvoke("bone.generation.import-image", { ...input, expectedProductionRevision: (await read(f.id)).production.revision }), { code: "CONFLICT" });
  assert.deepEqual(await fs.readFile(filename(f.id)), lockedDisk);
});
test("guarded panel CRUD uses real beats, absolute cross-episode indexes and queued revision checks", async () => {
  const f = await fixture(false);
  const { episodeId } = await call("write_script", { id: f.id, title: "Second", prose: "Second scene" });
  await call("write_episodes", { id: f.id, episodes: [{ episodeId, title: "Second", beats: [{ title: "Second beat" }] }] });
  const beatId = (await read(f.id)).production.episodes.find(episode => episode.id === episodeId).script.beats[0].id;
  const revision = async () => (await read(f.id)).production.revision;
  const panel = (action, args) => plugin.onPanelInvoke(`bone.shot.${action}`, { id: f.id, ...args });
  await assert.rejects(panel("add", { episodeId, shots: [{ title: "X", scene: "X", beatId }] }), { code: "INVALID_ARGUMENT" });
  for (const shot of [{ title: "", scene: "X", beatId }, { title: "X", scene: " ", beatId }, { title: "X", scene: "X", beatId: f.beatId },
    { title: "X", scene: "x".repeat(2001), beatId }, { title: "X", scene: "X", beatId, shotScale: "fake" }]) {
    await assert.rejects(panel("add", { episodeId, expectedProductionRevision: await revision(), shots: [shot] }));
  }
  const second = await panel("add", { episodeId, expectedProductionRevision: await revision(), shots: [{ title: "Second", scene: "Actual scene", beatId, scale: authoring.SCALES[1], lighting: "Day" }] });
  const third = await panel("add", { episodeId: f.episodeId, expectedProductionRevision: await revision(), shots: [{ title: "Third", scene: "Actual scene", beatId: f.beatId }] });
  const move = { shotId: third.shots[0].id, toIndex: 0, expectedProductionRevision: await revision() };
  const moved = await panel("move", move);
  assert.deepEqual(moved.order, [third.shots[0].id, f.shotId, second.shots[0].id]);
  assert.equal((await read(f.id)).production.shots[2].episodeId, episodeId);
  await assert.rejects(panel("move", move), { code: "CONFLICT" });
  await assert.rejects(panel("update", { shotId: f.shotId, scale: authoring.SCALES[2] }), { code: "INVALID_ARGUMENT" });
  const quick = { shotId: f.shotId, expectedShotRevision: 1, scale: authoring.SCALES[3] };
  await panel("update", quick);
  await assert.rejects(panel("update", quick), { code: "CONFLICT" });
  await assert.rejects(panel("update", { shotId: f.shotId, expectedShotRevision: 2, episodeId }), { code: "INVALID_ARGUMENT" });
  await panel("update", { shotId: f.shotId, expectedShotRevision: 2, episodeId, beatId });
  let saved = await read(f.id);
  assert.ok(saved.production.episodes[1].script.beats[0].shotIds.includes(f.shotId));
  assert.ok(!saved.production.episodes[0].script.beats[0].shotIds.includes(f.shotId));
  await assert.rejects(panel("delete", { shotId: f.shotId, expectedProductionRevision: await revision() }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(panel("delete", { shotId: f.shotId, expectedProductionRevision: await revision(), expectedShotRevision: 2 }), { code: "CONFLICT" });
  await panel("delete", { shotId: f.shotId, expectedProductionRevision: await revision(), expectedShotRevision: 3 });
  saved = await read(f.id);
  assert.ok(!saved.production.shots.some(shot => shot.id === f.shotId));
  assert.equal(saved.shotStates[f.shotId], undefined);
  assert.ok(saved.production.episodes.every(episode => episode.script.beats.every(beat => !beat.shotIds.includes(f.shotId))));
});
test("import limits preserve candidates and old adoption; exact 2 MiB inputs remain intact", async () => {
  const f = await fixture(), assetId = f.assets[0].id;
  const input = async bytes => ({ id: f.id, assetId, expectedProductionRevision: (await read(f.id)).production.revision,
    title: "Candidate", mimeType: "image/png", data: bytes.toString("base64") });
  const bytes = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 - PNG.length)]);
  const maximum = await plugin.onPanelInvoke("bone.generation.import-image", await input(bytes));
  assert.equal((await plugin.onPanelInvoke("bone.media", { id: f.id, mediaId: maximum.mediaId })).dataUrl, `data:image/png;base64,${bytes.toString("base64")}`);
  for (let index = 0; index < 126; index++) await plugin.onPanelInvoke("bone.generation.import-image", await input(Buffer.concat([PNG, Buffer.from(`version-${index}`)])));
  const saved = await read(f.id), disk = await fs.readFile(filename(f.id));
  assert.equal(saved.production.assets[0].referenceMediaIds.length, 128);
  assert.equal(saved.production.assets[0].mediaId, f.a.mediaId);
  await assert.rejects(plugin.onPanelInvoke("bone.generation.import-image", await input(Buffer.concat([PNG, Buffer.from("overflow")]))), { code: "LIMIT_EXCEEDED" });
  await assert.rejects(call("adopt_media", { id: f.id, assetId, mediaId: f.b.mediaId }), { code: "LIMIT_EXCEEDED" });
  assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  const duplicate = await plugin.onPanelInvoke("bone.generation.import-image", await input(bytes));
  assert.equal(duplicate.mediaId, maximum.mediaId);
});
test("imports retain deduplicated provenance and omitted-field sources invalidate handoff when stale", async () => {
  const f = await fixture(), bytes = Buffer.concat([PNG, Buffer.from("provenance-source")]);
  const source = await call("add_shots", { id: f.id, episodeId: f.episodeId, shots: [{ title: "Source", scene: "Origin", beatId: f.beatId }] });
  const sourceId = source.shots[0].id;
  await fs.writeFile(path.join(workspace, "bone-media/provenance.png"), bytes);
  const media = await call("register_media", { id: f.id, path: "bone-media/provenance.png", kind: "image", shotId: sourceId, expectedShotRevision: 1 });
  const input = async () => ({ id: f.id, assetId: f.assets[2].id, expectedProductionRevision: (await read(f.id)).production.revision,
    title: "Same bytes", mimeType: "image/png", data: bytes.toString("base64") });
  assert.equal((await plugin.onPanelInvoke("bone.generation.import-image", await input())).mediaId, media.mediaId);
  const draft = await fullDraft(f);
  draft.draft.body = doc(ref(f.assets[0].id, f.a.mediaId));
  draft.draft.dialogue = doc(text("Voice for "), ref(f.assets[2].id, media.mediaId));
  draft.draft.operation = "image.reference";
  await plugin.onPanelInvoke("bone.generation.save", draft.args());
  const args = await f.args(), prepared = await call("prepare_shot_generation", args);
  assert.deepEqual(prepared.compiled.images.map(image => image.mediaId), [f.a.mediaId]);
  assert.ok(prepared.compiled.omittedFields.includes("dialogue"));
  await call("update_shot", { id: f.id, shotId: sourceId, scene: "Changed source" });
  assert.equal((await f.args()).expectedShotRevision, args.expectedShotRevision);
  await assert.rejects(call("prepare_shot_generation", args), { code: "CONFLICT" });
  await assert.rejects(call("read_generation_image", { ...args, requestHash: prepared.requestHash, slot: 1, offset: 0, length: 17 }), { code: "CONFLICT" });
  const disk = await fs.readFile(filename(f.id));
  await assert.rejects(plugin.onPanelInvoke("bone.generation.import-image", await input()), { code: "CONFLICT" });
  assert.deepEqual(await fs.readFile(filename(f.id)), disk);
  const snapshot = JSON.parse(disk);
  assert.equal(snapshot.media.find(item => item.id === media.mediaId).shotRevision, 1);
});
test("panel and direct tool boundaries reject hidden, sparse and unknown fields", async () => {
  const f = await fixture(), current = await fullDraft(f), disk = await fs.readFile(filename(f.id));
  const args = current.args();
  const sparse = new Array(1); sparse.extra = f.assets[0].id;
  await assert.rejects(plugin.onPanelInvoke("bone.generation.save", { ...args, assetIds: sparse }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(f.update({ scale: authoring.SCALES[0], shotScale: "unknown" }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(f.update({ generationSettings: { operation: "video.text", maxReferenceImages: 2, seed: 123 } }), { code: "INVALID_ARGUMENT" });
  const importInput = { id: f.id, assetId: f.assets[0].id, expectedProductionRevision: current.saved.production.revision,
    title: "X", mimeType: "image/png", data: PNG.toString("base64") };
  await assert.rejects(plugin.onPanelInvoke("bone.generation.import-image", { ...importInput, expectedShotRevision: null }), { code: "INVALID_ARGUMENT" });
  Object.defineProperty(importInput, "data", { enumerable: true, get() { throw new Error("Getter must not run"); } });
  await assert.rejects(plugin.onPanelInvoke("bone.generation.import-image", importInput), { code: "INVALID_ARGUMENT" });
  await assert.rejects(plugin.onPanelInvoke("bone.shot.add", { id: f.id, episodeId: "", expectedProductionRevision: current.saved.production.revision,
    shots: [{ title: "X", scene: "X", beatId: f.beatId }] }), { code: "INVALID_ARGUMENT" });
  assert.deepEqual(await fs.readFile(filename(f.id)), disk);
});
test("wording revisions can reconcile dialogue references without changing other visual fields", async () => {
  const f = await fixture(), current = await fullDraft(f);
  current.draft.dialogue = doc(text("Old words"));
  await plugin.onPanelInvoke("bone.generation.save", current.args());
  const change = (field, value) => ({ targetType: "shot", targetId: f.shotId, field, replacementJson: JSON.stringify(value),
    sourceIssue: "Dialogue wording", reason: "Update spoken words", acceptanceCriteria: "Read exact new words" });
  const proposal = async changes => call("save_revision_plan", { id: f.id, expectedProductionRevision: (await read(f.id)).production.revision,
    title: "Dialogue", intent: "wording", instruction: "Revise only dialogue", preserve: ["Visual fields"], reviewIds: [], changes });
  const fields = (await fullDraft(f)).shot.referenceFields;
  const plan = await proposal([change("dialogue", "New words"), change("referenceFields", { ...fields, dialogue: doc(text("New words")) })]);
  await call("apply_revision_plan", { id: f.id, planId: plan.planId, expectedProductionRevision: (await read(f.id)).production.revision,
    confirm: true, authorization: "Fixture authorizes the dialogue wording" });
  assert.equal((await fullDraft(f)).shot.dialogue, "New words");
  await assert.rejects(proposal([change("referenceFields", { ...fields, motion: doc(text("Changed motion")) })]), { code: "INVALID_ARGUMENT" });
});
