"use strict";
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const tools = new Map();
let root, workspace, plugin;
const call = (name, args) => tools.get(name).execute(args);
const read = id => call("get_production", { id });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const video = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from("ftypisom"), Buffer.alloc(12)]);

before(async () => {
  root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), "bone-chain-"));
  workspace = path.join(root, "workspace");
  await fs.mkdir(path.join(workspace, "bone-media"), { recursive: true });
  await fs.writeFile(path.join(workspace, "bone-media/frame.png"), png);
  await fs.writeFile(path.join(workspace, "bone-media/film.mp4"), video);
  globalThis.pi = {
    plugin: { getDataPath: async () => path.join(root, "private"), getManifest: async () => JSON.parse(await fs.readFile(path.join(__dirname, "../manifest.json"), "utf8")) },
    commands: { register: async () => {}, unregister: async () => {} },
    ui: { revealView: async () => {} },
    agent: { registerTool: async tool => tools.set(tool.name, tool), unregisterTool: async name => tools.delete(name) },
    workspace: { get: async () => ({ path: workspace }) },
    fs: {
      stat: async relative => { const stat = await fs.stat(path.join(workspace, relative)); return { size: stat.size, mtimeMs: stat.mtimeMs }; },
      readRange: async (relative, offset, length) => { const bytes = await fs.readFile(path.join(workspace, relative)); return { bytes: new Uint8Array(bytes.subarray(offset, offset + length)), totalSize: bytes.length }; },
    },
  };
  plugin = require("../main.js");
  await plugin.onLoad();
});
after(async () => { await plugin.onUnload(); await fs.rm(root, { recursive: true, force: true }); delete globalThis.pi; });

async function setup() {
  const { id } = await call("create_production", { title: "Chain test", kind: "film", brief: "An arrival and discovery", style: "ink" });
  const { episodeId } = await call("write_script", { id, title: "Arrival", prose: "The traveler arrives at the station and finds a ticket.", logline: "A ticket changes the journey." });
  await call("write_episodes", { id, episodes: [{ episodeId, title: "Arrival", beats: [{ title: "Discovery", purpose: "hook", visualAction: "Find the ticket" }] }] });
  let work = await read(id);
  const beatId = work.production.episodes[0].script.beats[0].id;
  const { assets } = await call("add_assets", { id, assets: [{ name: "Entry frame", type: "场景" }, { name: "Exit frame", type: "场景" }] });
  const { shots } = await call("add_shots", { id, episodeId, shots: [{ title: "Arrival", scene: "Station at night", beatId, assetIds: assets.map(a => a.id) }] });
  return { id, episodeId, beatId, shotId: shots[0].id, assets };
}
const plans = assets => ({
  videoPlan: { mode: "first-last-frame", firstFrameAssetId: assets[0].id, lastFrameAssetId: assets[1].id, transitionIn: "hard-cut", rationale: "Hold the same station while the ticket enters view" },
  soundDesign: { effects: "Wind", music: "None" },
  continuityPlan: { entryState: "Traveler on platform", exitState: "Ticket in hand", audioTransition: "carry-over", rationale: "Continue the station ambience", anchors: [] },
});

test("registered Agent tools complete the prose → beats → assets → plans → frames → film chain", async () => {
  const { id, episodeId, shotId, assets } = await setup();
  let work = await read(id);
  assert.equal(work.production.episodes[0].script.prose.includes("traveler"), true);
  assert.ok(work.workflow.issues.some(issue => issue.stage === "plans"));
  await call("update_shot", { id, shotId, expectedShotRevision: 1, ...plans(assets) });
  const registered = await call("register_media", { id, path: "bone-media/frame.png", kind: "image" });
  for (const asset of assets) await call("adopt_media", { id, mediaId: registered.mediaId, assetId: asset.id });
  work = await read(id);
  assert.ok(work.workflow.shots[0].frames.every(frame => frame.ready));
  const revision = work.shotStates[shotId].revision;
  const film = await call("register_media", { id, path: "bone-media/film.mp4", kind: "video", shotId, expectedShotRevision: revision });
  await call("adopt_media", { id, shotId, mediaId: film.mediaId, expectedShotRevision: revision });
  const status = await call("get_workflow_status", { id });
  assert.equal(status.complete, true);
  assert.equal(status.shots[0].episodeId, episodeId);
  assert.deepEqual(status.issues, []);
  const panel = await plugin.onPanelInvoke("bone.get", { id });
  assert.equal(panel.snapshot.document.shots[0].outputs.video, film.mediaId);
  const media = await plugin.onPanelInvoke("bone.media", { id, mediaId: registered.mediaId });
  assert.equal(media.dataUrl, `data:image/png;base64,${png.toString("base64")}`);
  assert.equal((await plugin.onPanelInvoke("bone.workflow", { id })).complete, true);
  work = await read(id);
  assert.ok(work.media.every(item => !Object.hasOwn(item, "fileName")));
  await call("update_shot", { id, shotId, dialogue: "Changed dialogue", expectedShotRevision: revision });
  const changed = await read(id);
  assert.equal(changed.workflow.complete, false);
  assert.ok(changed.workflow.issues.some(issue => issue.stage === "outputs"));
  await assert.rejects(call("adopt_media", { id, shotId, mediaId: film.mediaId, expectedShotRevision: changed.shotStates[shotId].revision }), { code: "CONFLICT" });
});

test("invalid plans and stale revisions do not persist partial updates", async () => {
  const { id, shotId, assets } = await setup();
  const initial = await read(id);
  await assert.rejects(call("update_shot", { id, shotId, title: "Should not persist", videoPlan: { mode: "first-last-frame", rationale: "Missing tail" } }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(call("update_shot", { id, shotId, ...plans(assets), assetIds: [] }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(call("update_shot", { id, shotId, motion: "Slow pan", expectedShotRevision: 50 }), { code: "CONFLICT" });
  const after = await read(id);
  assert.deepEqual(after.production, initial.production);
  await call("update_shot", { id, shotId, ...plans(assets) });
  await assert.rejects(call("delete_asset", { id, assetId: assets[1].id }), { code: "CONFLICT" });
  await call("update_shot", { id, shotId, videoPlan: null });
  await call("delete_asset", { id, assetId: assets[1].id });
  assert.equal((await read(id)).production.shots[0].videoPlan, undefined);
});

test("changing episode requires a valid target beat and leaves exactly one mapping", async () => {
  const { id, shotId, episodeId, beatId } = await setup();
  const second = await call("write_script", { id, title: "Return", prose: "The traveler returns." });
  await call("write_episodes", { id, episodes: [{ episodeId: second.episodeId, title: "Return", beats: [{ title: "Return beat" }] }] });
  const target = (await read(id)).production.episodes[1].script.beats[0].id;
  await assert.rejects(call("update_shot", { id, shotId, episodeId: second.episodeId }), { code: "INVALID_ARGUMENT" });
  await assert.rejects(call("update_shot", { id, shotId, episodeId: second.episodeId, beatId }), { code: "NOT_FOUND" });
  await call("update_shot", { id, shotId, episodeId: second.episodeId, beatId: target });
  await call("update_shot", { id, shotId, beatId: target });
  const work = await read(id);
  assert.equal(work.production.shots[0].episodeId, second.episodeId);
  assert.deepEqual(work.production.episodes.find(ep => ep.id === episodeId).script.beats[0].shotIds, []);
  assert.deepEqual(work.production.episodes[1].script.beats[0].shotIds, [shotId]);
});

test("new plans can be supplied at creation and old no-plan snapshots remain readable", async () => {
  const { id, episodeId, beatId, assets } = await setup();
  assert.equal((await read(id)).production.shots[0].videoPlan, undefined);
  const created = await call("add_shots", { id, episodeId, shots: [{ title: "Planned", scene: "Ticket", beatId, assetIds: assets.map(a => a.id), ...plans(assets) }] });
  assert.equal(created.shots[0].shotRevision, 1);
  assert.equal((await read(id)).production.shots[1].videoPlan.lastFrameAssetId, assets[1].id);
});

test("manifest advertises all runtime schemas, scoped file reads and the production skill", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(__dirname, "../manifest.json"), "utf8"));
  assert.equal(tools.size, 24);
  for (const descriptor of manifest.contributes.agentTools) {
    const tool = tools.get(descriptor.name);
    assert.deepEqual(tool.schema, descriptor.schema);
    assert.equal(tool.description, descriptor.description);
  }
  assert.deepEqual(manifest.fs.read.scope, ["bone-media/**"]);
  assert.ok(manifest.permissions.includes("agent.prompt.inject"));
  assert.ok(manifest.permissions.includes("fs.read"));
  const skillPath = manifest.contributes.skills[0];
  const skill = await fs.readFile(path.join(__dirname, "..", skillPath), "utf8");
  assert.match(skill, /register_media/);
  assert.match(skill, /adopt_media/);
  assert.match(skill, /get_workflow_status/);
});

test("switching to image production detects an older image even after current video adoption", async () => {
  const { id, shotId } = await setup();
  const image = await call("register_media", { id, path: "bone-media/frame.png", kind: "image" });
  await call("adopt_media", { id, shotId, mediaId: image.mediaId, expectedShotRevision: 1 });
  await call("update_shot", { id, shotId, scene: "A revised station", expectedShotRevision: 1 });
  const film = await call("register_media", { id, path: "bone-media/film.mp4", kind: "video", shotId, expectedShotRevision: 2 });
  await call("adopt_media", { id, shotId, mediaId: film.mediaId, expectedShotRevision: 2 });
  await call("update_production", { id, kind: "image" });
  const stale = await call("get_workflow_status", { id });
  assert.equal(stale.complete, false);
  assert.equal(stale.shots[0].needsUpdate, true);
  assert.ok(stale.issues.some(issue => issue.stage === "outputs"));

  // Legacy snapshots lack per-kind revisions; preserve their persisted flag.
  const { snapshot } = await plugin.onPanelInvoke("bone.get", { id });
  delete snapshot.shotStates[shotId].outputRevisions;
  assert.equal(require("../lib/workflow.js").workflowStatus(snapshot).complete, true);

  await call("adopt_media", { id, shotId, mediaId: image.mediaId, expectedShotRevision: 2 });
  assert.equal((await call("get_workflow_status", { id })).complete, true);
});

test("project bible survives creation, partial Agent updates and panel reads", async () => {
  const projectBible = { background: "A station outside time.\nTwo moons.", rules: "Tickets cost a memory.", timeline: "Year 1: station opens.", characters: "Mira wants to recover her name." };
  const { id } = await call("create_production", { title: "Bible test", kind: "comic", arc: "Arrival leads to a costly return.", projectBible });
  assert.deepEqual((await read(id)).production.projectBible, projectBible);
  const { episodeId } = await call("write_script", { id, title: "Arrival", prose: "Mira arrives." });
  await call("update_production", { id, projectBible: { rules: "Tickets cost one memory; no refunds." } });
  await plugin.onPanelInvoke("bone.update", { id, title: "Revised title", arc: "Arrival, discovery, return." });
  const panel = await plugin.onPanelInvoke("bone.get", { id });
  assert.deepEqual(panel.snapshot.document.projectBible, { ...projectBible, rules: "Tickets cost one memory; no refunds." });
  assert.equal(panel.snapshot.document.arc, "Arrival, discovery, return.");
  assert.equal(panel.snapshot.document.episodes[0].id, episodeId);
  assert.equal(panel.snapshot.document.episodes[0].script.prose, "Mira arrives.");
  const disk = JSON.parse(await fs.readFile(path.join(root, "private", "productions", id, "snapshot.json"), "utf8"));
  assert.deepEqual(disk.document.projectBible, panel.snapshot.document.projectBible);
  await call("update_production", { id, projectBible: { timeline: "" } });
  assert.equal((await read(id)).production.projectBible.timeline, "");
  assert.equal((await read(id)).production.projectBible.background, projectBible.background);
});

test("invalid project bible rejects atomically and concurrent section updates preserve each other", async () => {
  const { id } = await call("create_production", { title: "Bible validation" });
  const before = (await read(id)).production;
  for (const projectBible of [null, [], "text", { unknown: "x" }, { rules: 9 }, { characters: "x".repeat(20001) }]) {
    await assert.rejects(call("update_production", { id, title: "Must not persist", projectBible }), { code: "INVALID_ARGUMENT" });
    assert.deepEqual((await read(id)).production, before);
  }
  await assert.rejects(call("create_production", { title: "Invalid bible", projectBible: { rules: false } }), { code: "INVALID_ARGUMENT" });
  await Promise.all([
    call("update_production", { id, projectBible: { background: "Background" } }),
    call("update_production", { id, projectBible: { characters: "Characters" } }),
  ]);
  assert.deepEqual((await read(id)).production.projectBible, { background: "Background", characters: "Characters" });
});

test("old snapshots remain readable and gain bible sections only on an explicit update", async () => {
  const { id } = await call("create_production", { title: "Legacy bible", arc: "Original arc" });
  const filename = path.join(root, "private", "productions", id, "snapshot.json");
  const legacy = JSON.parse(await fs.readFile(filename, "utf8"));
  delete legacy.document.projectBible;
  await fs.writeFile(filename, JSON.stringify(legacy));
  const bytes = await fs.readFile(filename, "utf8");
  assert.equal((await read(id)).production.projectBible, undefined);
  assert.equal(await fs.readFile(filename, "utf8"), bytes);
  await call("update_production", { id, projectBible: { timeline: "Before episode one" } });
  const updated = (await read(id)).production;
  assert.equal(updated.arc, "Original arc");
  assert.deepEqual(updated.projectBible, { timeline: "Before episode one" });
});

test("asset dossiers and image prompts persist, patch independently and invalidate dependent shots", async () => {
  const { id, shotId, assets } = await setup();
  const fields = { profile: "Goal: find her name.\nSecret: former station keeper.", imagePrompt: "Full body, blue coat, neutral backdrop.", negativePrompt: "No lettering; no extra props." };
  const added = await call("add_assets", { id, assets: [{ name: "Mira", type: "角色", description: "A traveler", ...fields }] });
  let work = await read(id);
  const character = work.production.assets.find(a => a.id === added.assets[0].id);
  for (const [key, value] of Object.entries(fields)) assert.equal(character[key], value);
  await call("update_asset", { id, assetId: assets[0].id, ...fields });
  assert.equal((await read(id)).shotStates[shotId].needsUpdate, true);
  await call("update_asset", { id, assetId: character.id, imagePrompt: "Updated composition" });
  const panel = await plugin.onPanelInvoke("bone.get", { id });
  const saved = panel.snapshot.document.assets.find(a => a.id === character.id);
  assert.equal(saved.profile, fields.profile);
  assert.equal(saved.negativePrompt, fields.negativePrompt);
  assert.equal(saved.imagePrompt, "Updated composition");
  for (const invalid of [{ profile: null }, { imagePrompt: 1 }, { negativePrompt: [] }, { profile: "x".repeat(20001) }, { imagePrompt: "x".repeat(8001) }]) {
    await assert.rejects(call("update_asset", { id, assetId: character.id, description: "Must not persist", ...invalid }), { code: "INVALID_ARGUMENT" });
  }
  assert.deepEqual((await read(id)).production.assets.find(a => a.id === character.id), saved);
  const count = (await read(id)).production.assets.length;
  await assert.rejects(call("add_assets", { id, assets: [{ name: "Good", type: "道具" }, { name: "Bad", type: "道具", imagePrompt: false }] }), { code: "INVALID_ARGUMENT" });
  assert.equal((await read(id)).production.assets.length, count);
  await call("update_asset", { id, assetId: character.id, negativePrompt: "" });
  assert.equal((await read(id)).production.assets.find(a => a.id === character.id).negativePrompt, "");
});

test("fractional edit budgets survive 36-shot creation and update without counting generation duration", async () => {
  const { id, episodeId, beatId, shotId } = await setup();
  await call("delete_shot", { id, shotId });
  const productionPlan = { sourceScene: "EP01-S01", purpose: "Show the signal arriving", requiredEvents: ["Contact", "Result"], generationDurationSeconds: 8, headHandleSeconds: 1, tailHandleSeconds: 1, retimePolicy: "silent-only", editingNotes: "Keep contact visible; select the clearest interval." };
  const { shots } = await call("add_shots", { id, episodeId, shots: Array.from({ length: 36 }, (_, index) => ({ title: `Shot ${index + 1}`, scene: "Station", beatId, duration: index < 24 ? 1.5 : 2, productionPlan })) });
  let work = await read(id);
  assert.equal(work.production.shots.reduce((sum, shot) => sum + shot.duration, 0), 60);
  assert.deepEqual(work.production.shots[0].productionPlan, productionPlan);
  await call("update_shot", { id, shotId: shots[0].id, duration: 1.25 });
  const panel = await plugin.onPanelInvoke("bone.get", { id });
  assert.equal(panel.snapshot.document.shots[0].duration, 1.25);
  assert.deepEqual(panel.snapshot.document.shots[0].productionPlan, productionPlan);
  const before = (await read(id)).production;
  for (const invalid of [{ ...productionPlan, headHandleSeconds: 4, tailHandleSeconds: 4 }, { ...productionPlan, generationDurationSeconds: 0 }, { ...productionPlan, requiredEvents: [] }, { ...productionPlan, retimePolicy: "magic" }]) {
    await assert.rejects(call("update_shot", { id, shotId: shots[0].id, title: "Must not persist", productionPlan: invalid }), { code: "INVALID_ARGUMENT" });
    assert.deepEqual((await read(id)).production, before);
  }
  await call("update_shot", { id, shotId: shots[0].id, productionPlan: null });
  assert.equal((await read(id)).production.shots[0].productionPlan, undefined);
});

test("registered tools persist an edit candidate and derive stale reviews after a relevant asset change", async () => {
  const { id, episodeId, shotId, assets } = await setup();
  await call("update_shot", { id, shotId, duration: 1.5, productionPlan: { sourceScene: "S01", purpose: "Contact", requiredEvents: ["Contact visible"], generationDurationSeconds: 8, headHandleSeconds: 1, tailHandleSeconds: 1, retimePolicy: "silent-only", editingNotes: "Keep the moment" } });
  const source = await call("register_media", { id, path: "bone-media/film.mp4", kind: "video", shotId: null, expectedShotRevision: null });
  let work = await read(id);
  await call("record_media_inspection", { id, expectedProductionRevision: work.production.revision, mediaId: source.mediaId, sha256: source.sha256, durationSeconds: 8, method: "Fixture report, not decoded", findings: "Protocol test only", usableRanges: [] });
  work = await read(id);
  const edit = { id, episodeId, expectedProductionRevision: work.production.revision, expectedEditRevision: 0,
    clips: [{ clipId: "a", shotId, mediaId: source.mediaId, inSeconds: 0.5, outSeconds: 2.5, speed: 2, includeSourceAudio: false, note: "First" },
      { clipId: "b", shotId, mediaId: source.mediaId, inSeconds: 3, outSeconds: 5, speed: 1, includeSourceAudio: false, note: "Second" }],
    audioTracks: [], cutNotes: [{ fromClipId: "a", toClipId: "b", visual: "Match contact", audio: "Silent" }], notes: "Two trims, no export" };
  const saved = await call("save_edit_plan", edit);
  assert.equal(saved.durationSeconds, 3);
  work = await read(id);
  assert.equal(work.workflow.editorial.episodes[0].generationSeconds, 8);
  assert.equal(work.workflow.editorial.episodes[0].budgetSeconds, 1.5);
  await assert.rejects(call("save_edit_plan", edit), { code: "CONFLICT" });
  await call("record_review", { id, expectedProductionRevision: work.production.revision, scope: { kind: "cut", episodeId, shotId: null, fromClipId: "a", toClipId: "b" }, category: "continuity", verdict: "not-verified", evidence: [], findings: "No real media review in this test", nextAction: "Inspect the actual selected intervals" });
  let panel = await plugin.onPanelInvoke("bone.get", { id });
  assert.equal(panel.workflow.editorial.episodes[0].editPlan.stale, false);
  assert.equal(panel.workflow.editorial.reviews[0].current, true);
  assert.equal(panel.workflow.readiness.review.notVerified, 1);
  assert.equal(panel.snapshot.document.shots[0].outputs.video, null);
  await call("update_asset", { id, assetId: assets[0].id, description: "New location" });
  panel = await plugin.onPanelInvoke("bone.get", { id });
  assert.equal(panel.workflow.editorial.episodes[0].editPlan.stale, true);
  assert.equal(panel.workflow.editorial.reviews[0].current, false);
  assert.equal(panel.workflow.readiness.review.stale, 1);
  const disk = JSON.parse(await fs.readFile(path.join(root, "private", "productions", id, "snapshot.json"), "utf8"));
  assert.equal(disk.editPlans[episodeId].revision, 1);
  assert.equal(disk.reviews.length, 1);
});

test("registered revision tools stage, apply, reread and restore without reviving output", async () => {
  const { id, episodeId, beatId, shotId } = await setup();
  const film = await call("register_media", { id, path: "bone-media/film.mp4", kind: "video", shotId, expectedShotRevision: 1 });
  await call("adopt_media", { id, shotId, mediaId: film.mediaId, expectedShotRevision: 1 });
  const baseline = await read(id);
  const saved = await call("save_revision_plan", { id, expectedProductionRevision: baseline.production.revision,
    title: "Clarify the greeting", intent: "wording", instruction: "Clarify without changing the arrival", preserve: ["Keep scene, IDs and media"], reviewIds: [],
    changes: [{ targetType: "shot", targetId: shotId, field: "dialogue", replacementJson: JSON.stringify("You came back."), sourceIssue: "Greeting missing", reason: "Show recognition", acceptanceCriteria: "Recognizable speaker and unchanged action" }] });
  let work = await read(id);
  assert.deepEqual(work.production.shots, baseline.production.shots);
  assert.deepEqual(work.shotStates, baseline.shotStates);
  assert.equal(work.revisionPlans[0].canApply, true);
  assert.equal(work.workflow.revisions.counts.proposed, 1);
  const plan = await call("get_revision_plan", { id, planId: saved.planId });
  assert.equal(plan.changes[0].before, baseline.production.shots[0].dialogue);
  assert.equal(plan.changes[0].after, "You came back.");
  const filename = path.join(root, "private", "productions", id, "snapshot.json");
  const disk = await fs.readFile(filename, "utf8");
  await call("get_revision_plan", { id, planId: saved.planId });
  assert.equal(await fs.readFile(filename, "utf8"), disk);
  const apply = { id, planId: saved.planId, expectedProductionRevision: work.production.revision, confirm: true, authorization: "Apply the fixture proposal" };
  await assert.rejects(call("apply_revision_plan", { ...apply, confirm: false }), { code: "INVALID_ARGUMENT" });
  assert.equal(await fs.readFile(filename, "utf8"), disk);
  await call("apply_revision_plan", apply);
  work = await read(id);
  assert.equal(work.production.shots[0].dialogue, "You came back.");
  assert.equal(work.shotStates[shotId].revision, 2);
  assert.equal(work.workflow.shots[0].needsUpdate, true);
  assert.equal(work.revisionPlans[0].canRestore, true);
  assert.deepEqual(work.production.episodes[0].script.beats[0].shotIds, [shotId]);
  assert.equal(work.production.episodes[0].id, episodeId);
  assert.equal(work.production.episodes[0].script.beats[0].id, beatId);
  await call("restore_revision_plan", { ...apply, expectedProductionRevision: work.production.revision, authorization: "Restore the fixture proposal" });
  const panel = await plugin.onPanelInvoke("bone.get", { id });
  assert.deepEqual(panel.snapshot.document.shots, baseline.production.shots);
  assert.equal(panel.snapshot.shotStates[shotId].revision, 3);
  assert.equal(panel.workflow.shots[0].needsUpdate, true);
  assert.equal(panel.workflow.revisions.counts.restored, 1);
  assert.equal(panel.snapshot.revisionPlans[0].status, "restored");
  assert.equal(JSON.parse(await fs.readFile(filename, "utf8")).revisionPlans[0].status, "restored");
  await assert.rejects(call("adopt_media", { id, shotId, mediaId: film.mediaId, expectedShotRevision: 3 }), { code: "CONFLICT" });
});

test("registered revision operations preserve later edits and serialize competing applies", async () => {
  const { id, shotId } = await setup();
  const baseline = await read(id);
  const saved = await call("save_revision_plan", { id, expectedProductionRevision: baseline.production.revision,
    title: "Timing", intent: "pacing", instruction: "Adjust duration", preserve: ["Keep story"], reviewIds: [],
    changes: [{ targetType: "shot", targetId: shotId, field: "duration", replacementJson: "1.5", sourceIssue: "Budget", reason: "Match action", acceptanceCriteria: "Fraction retained" }] });
  const action = { id, planId: saved.planId, expectedProductionRevision: saved.revision, confirm: true, authorization: "Apply timing fixture" };
  const results = await Promise.allSettled([call("apply_revision_plan", action), call("apply_revision_plan", action)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "CONFLICT");
  await call("update_shot", { id, shotId, dialogue: "A later edit" });
  const before = await read(id);
  await assert.rejects(call("restore_revision_plan", { ...action, expectedProductionRevision: before.production.revision }), { code: "CONFLICT" });
  assert.deepEqual((await read(id)).production, before.production);
  assert.equal(before.workflow.revisions.counts.stale, 1);
  assert.equal(before.revisionPlans[0].canRestore, false);
});

test("restoring prose without shots never revives old reviews and preserves unrelated evidence", async () => {
  const { id } = await call("create_production", { title: "Review restoration" });
  const first = await call("write_script", { id, title: "First", prose: "A traveler waits." });
  const second = await call("write_script", { id, title: "Second", prose: "A guard listens." });
  const review = async episodeId => call("record_review", { id, expectedProductionRevision: (await read(id)).production.revision,
    scope: { kind: "episode", episodeId, shotId: null, fromClipId: null, toClipId: null }, category: "text", verdict: "supported",
    evidence: [], findings: "Fixture text checked", nextAction: "" });
  await review(first.episodeId);
  await review(second.episodeId);
  const before = await read(id);
  const saved = await call("save_revision_plan", { id, expectedProductionRevision: before.production.revision,
    title: "Wording", intent: "wording", instruction: "Clarify waiting", preserve: ["Keep the traveler"], reviewIds: [],
    changes: [{ targetType: "episode", targetId: first.episodeId, field: "prose", replacementJson: JSON.stringify("A traveler waits by the gate."), sourceIssue: "Place unclear", reason: "Clarify location", acceptanceCriteria: "Keep action unchanged" }] });
  const action = { id, planId: saved.planId, expectedProductionRevision: saved.revision, confirm: true, authorization: "Apply the isolated text revision" };
  await call("apply_revision_plan", action);
  assert.equal((await read(id)).workflow.editorial.reviews[0].current, false);
  await call("restore_revision_plan", { ...action, expectedProductionRevision: (await read(id)).production.revision, authorization: "Restore the isolated text revision" });
  const restored = await read(id);
  assert.equal(restored.production.episodes[0].script.prose, before.production.episodes[0].script.prose);
  assert.equal(restored.workflow.editorial.reviews[0].current, false);
  assert.equal(restored.workflow.editorial.reviews[1].current, true);
  assert.equal(restored.workflow.readiness.text.supportedEpisodes, 1);
  assert.deepEqual(restored.reviews, before.reviews);
  const filename = path.join(root, "private", "productions", id, "snapshot.json");
  const disk = JSON.parse(await fs.readFile(filename, "utf8"));
  assert.ok(disk.reviewInvalidations[before.reviews[0].id]);
  await review(first.episodeId);
  const checked = await read(id);
  assert.equal(checked.workflow.readiness.text.supportedEpisodes, 2);
  assert.equal(checked.workflow.editorial.reviews[0].current, false);
  assert.equal(checked.workflow.editorial.reviews[2].current, true);
});
