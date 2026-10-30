"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createEditorialService } = require("../lib/editing-service.js");
const { editorialStatus } = require("../lib/editorial-status.js");
const clone = value => JSON.parse(JSON.stringify(value));
const sha = digit => digit.repeat(64);
function initial() {
  return { document: { id: "pr_test", revision: 1, schemaVersion: 1, kind: "film", brief: "A reunion", arc: "Reconcile",
    projectBible: { rules: "No magic" }, style: "Natural", episodes: [
      { id: "ep_one", title: "Arrival", script: { prose: "INT. HOUSE - DAY", targetDurationSeconds: 4, beats: [{ id: "bt_one", shotIds: ["sh_one", "sh_two"] }] } },
      { id: "ep_two", title: "Departure", script: { prose: "EXT. ROAD - DAY" } }],
    assets: [{ id: "as_one", description: "Blue coat" }, { id: "as_two", description: "Red coat" }],
    shots: [{ id: "sh_one", episodeId: "ep_one", duration: 1.5, scene: "Enter", assetIds: ["as_one"],
      productionPlan: { sourceScene: "INT. HOUSE", purpose: "Arrival", requiredEvents: ["Door opens"], generationDurationSeconds: 8,
        headHandleSeconds: 1, tailHandleSeconds: 1, retimePolicy: "allowed", editingNotes: "Keep the glance" } },
    { id: "sh_two", episodeId: "ep_one", duration: 2, scene: "Reply", assetIds: ["as_two"] },
    { id: "sh_other", episodeId: "ep_two", duration: 3, assetIds: [] }] },
    shotStates: { sh_one: { revision: 1 }, sh_two: { revision: 1 }, sh_other: { revision: 1 } },
    media: [
      { id: "md_one", kind: "video", sha256: sha("a"), shotId: "sh_one", shotRevision: 1, fileName: "private.mp4", title: "Take A" },
      { id: "md_two", kind: "video", sha256: sha("b"), shotId: "sh_two", shotRevision: 1, fileName: "private2.mp4" },
      { id: "md_audio", kind: "audio", sha256: sha("c"), fileName: "private.wav" },
      { id: "md_image", kind: "image", sha256: sha("d"), shotId: "sh_one", shotRevision: 1, fileName: "private.png" },
      { id: "md_free", kind: "video", sha256: sha("e"), fileName: "free.mp4" }],
  };
}
function fixture(seed = initial()) {
  let snapshot = clone(seed), tail = Promise.resolve(), sequence = (seed.reviews || []).length;
  const service = createEditorialService({ readSnapshot: async () => clone(snapshot),
    mutateProduction(id, mutate) {
      const next = tail.then(async () => {
        assert.equal(id, "pr_test");
        const draft = clone(snapshot);
        const result = await mutate(draft);
        draft.document.revision++;
        snapshot = clone(draft);
        return { ...result, revision: snapshot.document.revision };
      });
      tail = next.catch(() => {});
      return next;
    }, newId: prefix => `${prefix}_${++sequence}` });
  const call = (name, args) => service.tools.find(tool => tool.name === name).execute({ id: "pr_test", expectedProductionRevision: snapshot.document.revision, ...args });
  return { service, call, get snapshot() { return snapshot; }, status: () => editorialStatus(snapshot),
    inspect: (mediaId = "md_one", extra = {}) => call("record_media_inspection", { mediaId, sha256: snapshot.media.find(item => item.id === mediaId)?.sha256,
      durationSeconds: 8, method: "Agent decoder observation", findings: "Eight seconds reported", usableRanges: [{ inSeconds: 0, outSeconds: 8, note: "Observed" }], ...extra }),
    save: (extra = {}) => call("save_edit_plan", { episodeId: "ep_one", expectedEditRevision: snapshot.editPlans?.ep_one?.revision || 0,
      clips: [clip("c1", 1, 3), clip("c2", 4, 8, 2)], audioTracks: [], cutNotes: [{ fromClipId: "c1", toClipId: "c2", visual: "Match look", audio: "Hard cut" }], notes: "Two selections of one source", ...extra }),
    review: (extra = {}) => call("record_review", { scope: { kind: "shot", shotId: "sh_one" }, category: "visual", verdict: "supported",
      evidence: [{ mediaId: "md_one", startSeconds: 1, endSeconds: 8, note: "Entrance observed" }], findings: "The entrance is visible", nextAction: "", ...extra }),
  };
}
function clip(clipId, inSeconds, outSeconds, speed = 1, extra = {}) {
  return { clipId, shotId: "sh_one", mediaId: "md_one", inSeconds, outSeconds, speed, includeSourceAudio: false, note: "Keep action", ...extra };
}
const sequenceScope = { kind: "sequence", episodeId: "ep_one" };
const cutScope = { kind: "cut", episodeId: "ep_one", fromClipId: "c1", toClipId: "c2" };
async function rejectsUnchanged(f, action, code = "INVALID_ARGUMENT") {
  const before = structuredClone(f.snapshot);
  await assert.rejects(action, error => { assert.equal(error.code, code); return true; });
  assert.deepEqual(f.snapshot, before);
}

test("complete inspection -> trimmed/retimed selection -> evidence reviews -> reload flow", async () => {
  const f = fixture();
  await f.inspect();
  await f.inspect("md_audio");
  const shotState = clone(f.snapshot.shotStates);
  const saved = await f.save({ audioTracks: [{ trackId: "t1", mediaId: "md_audio", role: "ambience", startSeconds: 0, inSeconds: 1, outSeconds: 5, gain: 0.5, note: "Room" }] });
  assert.equal(saved.durationSeconds, 4);
  assert.equal(saved.editPlan.revision, 1);
  await f.review({ scope: sequenceScope });
  await f.review({ scope: cutScope, category: "continuity" });
  await f.review({ scope: { kind: "episode", episodeId: "ep_one" }, category: "text", evidence: [] });
  await f.review({ scope: sequenceScope, category: "audio", evidence: [
    { mediaId: "md_one", startSeconds: 1, endSeconds: 8, note: "Silent video checked" },
    { mediaId: "md_audio", startSeconds: 1, endSeconds: 5, note: "Room tone listened" }] });
  const status = f.status(), episode = status.episodes[0];
  assert.equal(episode.budgetSeconds, 3.5);
  assert.equal(episode.targetSeconds, 4);
  assert.equal(episode.deltaSeconds, -0.5);
  assert.equal(episode.generationSeconds, 8);
  assert.deepEqual(episode.planningMissingShotIds, ["sh_two"]);
  assert.equal(episode.editPlan.stale, false);
  assert.equal(episode.editPlan.budgetDeltaSeconds, 0.5);
  assert.deepEqual(episode.editPlan.cuts, [{ fromClipId: "c1", toClipId: "c2", fromShotId: "sh_one", toShotId: "sh_one" }]);
  assert.equal(status.reviewCounts.supported, 4);
  assert.ok(status.reviews.every(review => review.current));
  assert.deepEqual(f.snapshot.shotStates, shotState);
  assert.equal(f.snapshot.document.shots[0].outputs, undefined);
  assert.ok(!JSON.stringify(status).includes("fileName"));
  assert.equal(status.shots[0].candidates.find(item => item.id === "md_one").inspection.reportedBy, "agent");
  const loaded = fixture(clone(f.snapshot));
  assert.deepEqual(loaded.status(), status);
  await loaded.review();
  assert.equal(loaded.status().reviewCounts.supported, 5);
  status.episodes[0].editPlan.clips[0].note = "Outside mutation";
  saved.editPlan.clips[0].note = "Outside mutation";
  assert.equal(f.snapshot.editPlans.ep_one.clips[0].note, "Keep action");
});

test("legacy snapshots are read-only, missing measurements are never guessed, fractional budgets remain exact", async () => {
  const legacy = initial();
  legacy.document.shots = Array.from({ length: 36 }, (_, index) => ({ id: `sh_${index}`, episodeId: "ep_one", duration: index < 24 ? 1.5 : 2 }));
  const before = clone(legacy), status = editorialStatus(legacy);
  assert.equal(status.episodes[0].budgetSeconds, 60);
  assert.equal(status.episodes[0].generationSeconds, 0);
  assert.equal(status.episodes[0].editPlan, null);
  assert.equal(status.reviewCounts.supported, 0);
  assert.equal(status.reviewCounts.unreviewedShots, 36);
  assert.equal(status.episodes[1].deltaSeconds, null);
  assert.deepEqual(legacy, before);
  const f = fixture();
  await rejectsUnchanged(f, () => f.save());
});

test("all guards execute inside a serialized queue and failures do not wedge it", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.inspect(), f.inspect()]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "CONFLICT");
  assert.equal(f.snapshot.document.revision, 2);
  await f.save();
  await rejectsUnchanged(f, () => f.save({ expectedEditRevision: 0 }), "CONFLICT");
  await rejectsUnchanged(f, () => f.review({ expectedProductionRevision: 1 }), "CONFLICT");
  await rejectsUnchanged(f, () => f.inspect("md_one", { expectedProductionRevision: 1 }), "CONFLICT");
  await rejectsUnchanged(f, () => f.save({ expectedProductionRevision: 1 }), "CONFLICT");
  await f.save();
  assert.equal(f.snapshot.editPlans.ep_one.revision, 2);
});

test("inspection rejects wrong hashes, kinds, non-finite lengths and out-of-range observations atomically", async () => {
  const f = fixture();
  for (const changes of [{ sha256: sha("b") }, { durationSeconds: 0 }, { durationSeconds: NaN }, { durationSeconds: Infinity },
    { durationSeconds: 86401 }, { method: " " }, { findings: "" }, { usableRanges: [{ inSeconds: 2, outSeconds: 1, note: "Bad" }] },
    { usableRanges: [{ inSeconds: -1, outSeconds: 8, note: "Bad" }] }, { usableRanges: [{ inSeconds: 0, outSeconds: 9, note: "Bad" }] }]) {
    await rejectsUnchanged(f, () => f.inspect("md_one", changes));
  }
  await rejectsUnchanged(f, () => f.inspect("md_image"));
  await f.inspect();
});

test("edit selection validates ranges, kinds, IDs, cut adjacency, tracks, and provenance", async () => {
  const f = fixture();
  await f.inspect(); await f.inspect("md_audio"); await f.inspect("md_two");
  const changes = [
    { clips: [] }, { clips: [clip("same", 1, 2), clip("same", 2, 3)] }, { clips: [clip("c1", 3, 3)] },
    { clips: [clip("c1", -1, 3)] }, { clips: [clip("c1", 0, 9)] }, { clips: [clip("c1", 0, 1, 0)] },
    { clips: [clip("c1", 0, 1, 5)] }, { clips: [clip("c1", 0, 1, 1, { includeSourceAudio: "no" })] },
    { clips: [clip("c1", 0, 1, 1, { mediaId: "md_audio" })] }, { clips: [clip("c1", 0, 1, 1, { shotId: "sh_other" })] },
    { cutNotes: [{ fromClipId: "c2", toClipId: "c1", visual: "", audio: "" }] },
    { cutNotes: Array(2).fill({ fromClipId: "c1", toClipId: "c2", visual: "", audio: "" }) },
    { audioTracks: [{ trackId: "t1", mediaId: "md_one", role: "music", startSeconds: 0, inSeconds: 0, outSeconds: 1, gain: 1, note: "" }] },
  ];
  const track = { trackId: "t1", mediaId: "md_audio", role: "music", startSeconds: 0, inSeconds: 0, outSeconds: 1, gain: 1, note: "" };
  for (const extra of [{ startSeconds: -1 }, { startSeconds: 4 }, { gain: 1.1 }, { role: "unknown" }, { outSeconds: 9 }, { speed: 2 }]) changes.push({ audioTracks: [{ ...track, ...extra }] });
  changes.push({ audioTracks: [track, track] });
  for (const change of changes) await rejectsUnchanged(f, () => f.save(change));
  await rejectsUnchanged(f, () => f.save({ clips: [clip("c1", 0, 1, 1, { mediaId: "md_two" })], cutNotes: [] }), "CONFLICT");
  f.snapshot.shotStates.sh_one.revision++;
  await rejectsUnchanged(f, () => f.save(), "CONFLICT");
  const candidate = f.status().shots[0].candidates.find(item => item.id === "md_one");
  assert.equal(candidate.provenanceCurrent, false);
  assert.equal(candidate.stale, true);
});

test("retime policy defaults, forbidden and silent-only are enforced", async () => {
  const f = fixture(); await f.inspect();
  for (const policy of [undefined, "forbidden", "silent-only"]) {
    f.snapshot.document.shots[0].productionPlan.retimePolicy = policy;
    await rejectsUnchanged(f, () => f.save({ clips: [clip("c1", 1, 3, 2, { includeSourceAudio: true })], cutNotes: [] }));
  }
  await f.save();
  delete f.snapshot.document.shots[0].productionPlan;
  await rejectsUnchanged(f, () => f.save());
  await f.save({ clips: [clip("c1", 0, 4)], cutNotes: [] });
});

test("supported evidence must be real, related, bounded, and cover all selected intervals", async () => {
  const f = fixture(); await f.inspect(); await f.inspect("md_two"); await f.inspect("md_audio"); await f.save();
  for (const extra of [
    { evidence: [] }, { evidence: [{ mediaId: "md_two", note: "Wrong shot" }] },
    { evidence: [{ mediaId: "md_one", startSeconds: 1, note: "Missing end" }] },
    { evidence: [{ mediaId: "md_one", startSeconds: 1, endSeconds: 9, note: "Too long" }] },
    { evidence: [{ mediaId: "md_one", note: " " }] }, { category: "audio" },
    { scope: sequenceScope, evidence: [{ mediaId: "md_one", note: "No intervals" }] },
    { scope: cutScope, evidence: [{ mediaId: "md_one", startSeconds: 1, endSeconds: 3, note: "Only first" }] },
    { scope: { ...cutScope, fromClipId: "c2", toClipId: "c1" } },
    { scope: { kind: "shot", shotId: "sh_one", episodeId: "ep_two" } },
    { scope: { kind: "episode", episodeId: "ep_one" } }, { verdict: "not-verified", nextAction: "" },
  ]) await rejectsUnchanged(f, () => f.review(extra));
  await rejectsUnchanged(f, () => f.review({ evidence: [{ mediaId: "md_missing", note: "Absent" }] }), "NOT_FOUND");
  await f.review({ scope: sequenceScope, evidence: [
    { mediaId: "md_one", startSeconds: 1, endSeconds: 3, note: "First" },
    { mediaId: "md_one", startSeconds: 4, endSeconds: 6, note: "Second start" },
    { mediaId: "md_one", startSeconds: 6, endSeconds: 8, note: "Second end" }] });
  await f.save({ clips: [clip("c1", 0, 4, 1, { includeSourceAudio: true })], cutNotes: [] });
  await f.review({ category: "audio" });
  assert.equal(f.status().reviewCounts.supported, 1);
});

test("latest failed or unverified review supersedes a pass even when latest later becomes stale", async () => {
  const f = fixture(); await f.inspect(); await f.review();
  await f.review({ verdict: "needs-revision", findings: "Action missing", nextAction: "Regenerate" });
  let status = f.status();
  assert.equal(status.reviews[0].current, true);
  assert.equal(status.reviews[0].superseded, true);
  assert.equal(status.reviewCounts.supported, 0);
  assert.equal(status.reviewCounts.needsRevision, 1);
  await f.review({ verdict: "not-verified", evidence: [], nextAction: "Watch again" });
  status = f.status();
  assert.equal(status.reviewCounts.notVerified, 1);
  f.snapshot.document.brief = "New canon";
  status = f.status();
  assert.equal(status.reviewCounts.stale, 1);
  assert.equal(status.reviewCounts.supported, 0);
  assert.equal(status.shots[0].reviews.length, 1);
  assert.equal(status.shots[0].reviews[0].verdict, "not-verified");
});

test("freshness follows semantic scoped dependencies, never global revision or unrelated assets", async () => {
  const f = fixture(); await f.inspect(); await f.save(); await f.review();
  const original = clone(f.snapshot);
  for (const change of [
    snapshot => { snapshot.document.revision += 50; snapshot.document.updatedAt = 999; },
    snapshot => { snapshot.document.assets[1].description = "Unrelated asset changed"; snapshot.shotStates.sh_two.revision++; },
    snapshot => { snapshot.document.episodes[1].script.prose = "Other episode changed"; },
    snapshot => { snapshot.media.push({ id: "md_new", kind: "video", sha256: sha("f") }); },
  ]) {
    const candidate = clone(original); change(candidate);
    assert.equal(editorialStatus(candidate).reviews[0].current, true);
    assert.equal(editorialStatus(candidate).episodes[0].editPlan.stale, false);
  }
  for (const change of [
    snapshot => { snapshot.document.brief += " changed"; }, snapshot => { snapshot.document.arc += " changed"; },
    snapshot => { snapshot.document.projectBible.rules += " changed"; }, snapshot => { snapshot.document.style += " changed"; },
    snapshot => { snapshot.document.episodes[0].script.prose += " changed"; },
    snapshot => { snapshot.document.episodes[0].script.beats[0].title = "New beat"; },
    snapshot => { snapshot.document.assets[0].description += " changed"; },
    snapshot => { snapshot.document.shots[0].scene += " changed"; }, snapshot => { snapshot.shotStates.sh_one.revision++; },
    snapshot => { snapshot.media[0].sha256 = sha("f"); },
    snapshot => { snapshot.mediaInspections.md_one.findings += " changed"; },
    snapshot => { snapshot.editPlans.ep_one.clips[0].inSeconds = 1.5; },
    snapshot => { snapshot.document.shots.reverse(); },
  ]) {
    const candidate = clone(original); change(candidate);
    const status = editorialStatus(candidate);
    assert.equal(status.reviews[0].current, false);
    assert.equal(status.episodes[0].editPlan.stale, true);
  }
  await f.review({ category: "technical" });
  assert.equal(f.status().reviews[0].current, true);
  await f.inspect("md_one", { findings: "New observation" });
  assert.equal(f.status().reviews[0].current, false);
  assert.equal(f.status().episodes[0].editPlan.stale, true);
});

test("missing or moved references retain readable plans and stale findings", async () => {
  const f = fixture(); await f.inspect(); await f.save(); await f.review({ scope: cutScope });
  const original = clone(f.snapshot);
  for (const change of [
    snapshot => { snapshot.document.episodes.shift(); }, snapshot => { snapshot.document.shots.shift(); },
    snapshot => { snapshot.document.shots[0].episodeId = "ep_two"; }, snapshot => { snapshot.media.shift(); },
    snapshot => { delete snapshot.mediaInspections.md_one; }, snapshot => { snapshot.editPlans.ep_one.clips.reverse(); },
  ]) {
    const candidate = clone(original); change(candidate);
    const status = editorialStatus(candidate);
    assert.equal(status.episodes.find(episode => episode.episodeId === "ep_one").editPlan.stale, true);
    assert.equal(status.reviews[0].current, false);
  }
  f.snapshot.document.brief += " changed";
  await rejectsUnchanged(f, () => f.review({ scope: cutScope }), "CONFLICT");
  await f.review({ scope: cutScope, verdict: "needs-revision", evidence: [], nextAction: "Refresh selections" });
  assert.equal(f.status().reviews.at(-1).current, false);
  assert.equal(f.status().reviews[0].superseded, true);
  await f.save();
  await f.review({ scope: cutScope });
  assert.equal(f.status().reviews.at(-1).current, true);
});

test("unbound registered sources become scoped evidence only after selection", async () => {
  const f = fixture(); await f.inspect("md_free");
  const evidence = [{ mediaId: "md_free", startSeconds: 0, endSeconds: 4, note: "Selected action" }];
  await rejectsUnchanged(f, () => f.review({ evidence }));
  await f.save({ clips: [clip("c1", 0, 4, 1, { mediaId: "md_free", includeSourceAudio: true })], cutNotes: [] });
  await f.review({ evidence, category: "audio" });
  assert.equal(f.status().reviews[0].current, true);
  await f.save({ clips: [clip("c1", 1, 4, 1, { mediaId: "md_free", includeSourceAudio: true })], cutNotes: [] });
  assert.equal(f.status().reviews[0].current, false);
});

test("bounded history rejects overflow without discarding records; all public tools expose strict Chinese schemas", async () => {
  const f = fixture(); await f.inspect(); await f.review();
  const record = f.snapshot.reviews[0];
  f.snapshot.reviews = Array.from({ length: 2000 }, (_, index) => ({ ...record, id: `rv_${index}` }));
  await rejectsUnchanged(f, () => f.review(), "LIMIT_EXCEEDED");
  for (const tool of f.service.tools) {
    assert.equal(tool.risk, "medium");
    assert.match(tool.description, /[\u4e00-\u9fff]/);
    assert.ok(tool.schema.required.includes("expectedProductionRevision"));
    assert.equal(tool.schema.additionalProperties, false);
  }
  await rejectsUnchanged(f, () => f.inspect("md_one", { unexpected: true }));
  await rejectsUnchanged(f, () => f.inspect("md_one", { expectedProductionRevision: undefined }));
  await rejectsUnchanged(f, () => f.save({ clips: Array(201).fill(clip("c", 0, 1)) }));
  await rejectsUnchanged(f, () => f.review({ evidence: Array(513).fill({ mediaId: "md_one", note: "Observed" }) }));
});

test("multi-source and independent-audio reviews require complete relevant evidence", async () => {
  const f = fixture(); await f.inspect(); await f.inspect("md_two"); await f.inspect("md_audio");
  await f.save({ clips: [clip("c1", 1, 3), clip("c2", 2, 4, 1, { shotId: "sh_two", mediaId: "md_two" })],
    audioTracks: [{ trackId: "t1", mediaId: "md_audio", role: "dialogue", startSeconds: 0, inSeconds: 0, outSeconds: 4, gain: 1, note: "Dialogue" }] });
  await rejectsUnchanged(f, () => f.review({ scope: sequenceScope }));
  const videoEvidence = [
    { mediaId: "md_one", startSeconds: 1, endSeconds: 3, note: "First source watched" },
    { mediaId: "md_two", startSeconds: 2, endSeconds: 4, note: "Second source watched" }];
  await f.review({ scope: sequenceScope, evidence: videoEvidence });
  await rejectsUnchanged(f, () => f.review({ scope: cutScope, category: "audio", evidence: videoEvidence }));
  await rejectsUnchanged(f, () => f.review({ scope: cutScope, category: "audio", evidence: [...videoEvidence,
    { mediaId: "md_audio", startSeconds: 0, endSeconds: 2, note: "Partial audio" }] }));
  await f.review({ scope: cutScope, category: "audio", evidence: [...videoEvidence,
    { mediaId: "md_audio", startSeconds: 0, endSeconds: 4, note: "Whole audio listened" }] });
  assert.equal(f.status().reviewCounts.supported, 2);
  f.snapshot.media.find(media => media.id === "md_audio").shotId = "sh_other";
  await rejectsUnchanged(f, () => f.save({ audioTracks: [{ trackId: "t1", mediaId: "md_audio", role: "music", startSeconds: 0, inSeconds: 0, outSeconds: 1, gain: 1, note: "" }] }));
});

test("save and review races reject one writer and input is detached before awaiting the queue", async () => {
  const f = fixture(); await f.inspect();
  const clips = [clip("c1", 1, 3)];
  const pending = f.save({ clips, cutNotes: [] });
  clips[0].outSeconds = 1000;
  await pending;
  assert.equal(f.snapshot.editPlans.ep_one.clips[0].outSeconds, 3);
  const saves = await Promise.allSettled([f.save(), f.save()]);
  assert.equal(saves.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(saves.find(result => result.status === "rejected").reason.code, "CONFLICT");
  const reviews = await Promise.allSettled([f.review(), f.review()]);
  assert.equal(reviews.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(reviews.find(result => result.status === "rejected").reason.code, "CONFLICT");
  assert.equal(f.snapshot.reviews.length, 1);
});

test("canonical key ordering, identical content saves and unchanged observations preserve freshness", async () => {
  const f = fixture(); await f.inspect(); await f.save(); await f.review({ scope: sequenceScope });
  f.snapshot.document.projectBible = Object.fromEntries(Object.entries(f.snapshot.document.projectBible).reverse());
  f.snapshot.document.shots[0] = Object.fromEntries(Object.entries(f.snapshot.document.shots[0]).reverse());
  assert.equal(f.status().reviews[0].current, true);
  await f.save();
  await f.inspect();
  assert.equal(f.status().reviews[0].current, true);
  assert.equal(f.status().episodes[0].editPlan.stale, false);
});

test("overlapping audio tracks support shot audio findings but cannot alone support visual findings", async () => {
  const f = fixture(); await f.inspect(); await f.inspect("md_audio");
  await f.save({ audioTracks: [{ trackId: "t1", mediaId: "md_audio", role: "effects", startSeconds: 1, inSeconds: 0, outSeconds: 2, gain: 1, note: "Door" }] });
  const evidence = [{ mediaId: "md_audio", startSeconds: 0, endSeconds: 2, note: "Door heard" }];
  await rejectsUnchanged(f, () => f.review({ evidence }));
  await f.review({ category: "audio", evidence });
  assert.equal(f.status().reviews[0].current, true);
  await f.inspect("md_audio", { findings: "New sound observation" });
  assert.equal(f.status().reviews[0].current, false);
});

test("strict callers can supply null unused scope fields, but timed approval still requires ranges", async () => {
  const f = fixture(); await f.inspect();
  await f.review({ scope: { kind: "shot", episodeId: null, shotId: "sh_one", fromClipId: null, toClipId: null } });
  assert.equal(f.status().reviews[0].scope.episodeId, "ep_one");
  await rejectsUnchanged(f, () => f.review({ evidence: [{ mediaId: "md_one", startSeconds: null, endSeconds: null, note: "No observed interval" }] }));
  await f.review({ evidence: [{ mediaId: "md_image", startSeconds: null, endSeconds: null, note: "Static frame inspected" }] });
  assert.equal(f.status().reviewCounts.supported, 1);
});

test("shot audio review accepts a current same-episode source carried across a neighboring shot", async () => {
  const seed = initial();
  Object.assign(seed.media.find(m => m.id === "md_audio"), { shotId: "sh_two", shotRevision: 1 });
  const f = fixture(seed); await f.inspect(); await f.inspect("md_audio");
  await f.save({ audioTracks: [{ trackId: "carry", mediaId: "md_audio", role: "dialogue", startSeconds: 0, inSeconds: 0, outSeconds: 4, gain: 0.5, note: "Prelap from next shot" }] });
  await f.review({ category: "audio", evidence: [{ mediaId: "md_audio", startSeconds: 0, endSeconds: 4, note: "Carried dialogue listened" }] });
  assert.equal(f.status().reviewCounts.supported, 1);
  f.snapshot.shotStates.sh_two.revision++;
  assert.equal(f.status().reviews[0].current, false);
  await rejectsUnchanged(f, () => f.review({ category: "audio", evidence: [{ mediaId: "md_audio", startSeconds: 0, endSeconds: 4, note: "Obsolete source" }] }), "CONFLICT");
});
