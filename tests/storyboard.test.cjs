const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../views/storyboard.js");
const { selection, outputs } = globalThis.BoneStoryboard;
const document = {
  revision: 7,
  episodes: [{ id: "ep1", title: "One" }, { id: "ep2", title: "Two" }, { id: "ep3", title: "Empty" }],
  shots: [{ id: "s1", episodeId: "ep1" }, { id: "s2", episodeId: "ep1" }, { id: "s3", episodeId: "ep2" }],
};

test("episode selection isolates shots and preserves empty episodes", () => {
  assert.deepEqual(selection(document, "ep1", null).shots.map(s => s.id), ["s1", "s2"]);
  assert.equal(selection(document, "ep2", null).shot.id, "s3");
  const empty = selection(document, "ep3", null);
  assert.equal(empty.group.id, "ep3");
  assert.equal(empty.shot, null);
  assert.deepEqual(empty.shots, []);
});
test("a shot link resolves its owning episode; removed selection falls back safely", () => {
  assert.equal(selection(document, "ep1", "s3").group.id, "ep2");
  assert.equal(selection(document, "ep1", "deleted").shot.id, "s1");
  assert.equal(selection(document, "deleted", null).group.id, "ep1");
});
test("legacy unassigned shots remain browseable without mutating the document", () => {
  const legacy = structuredClone(document);
  legacy.shots.push({ id: "orphan" });
  const before = JSON.stringify(legacy);
  const result = selection(legacy, "ep1", "orphan");
  assert.equal(result.group.title, "未归属剧集");
  assert.equal(result.shot.id, "orphan");
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(selection({ episodes: [], shots: [] }).shot, null);
});
const media = [{ id: "i1", kind: "image" }, { id: "v1", kind: "video" }, { id: "v2", kind: "video" }];
const snapshot = { document, media, candidates: [] };
test("image and video adoption remain separate, including legacy mediaId", () => {
  const slots = outputs(snapshot, { id: "s1", mediaId: "i1" });
  assert.equal(slots.find(s => s.kind === "video").status, "未生成");
  assert.equal(slots.find(s => s.kind === "image").adopted.id, "i1");
  const legacyVideo = outputs(snapshot, { id: "s1", mediaId: "v1" });
  assert.equal(legacyVideo[0].adopted.id, "v1");
  assert.equal(legacyVideo[1].adopted, undefined);
  assert.equal(outputs(snapshot, { id: "s1", mediaId: "i1", outputs: { image: null } })[1].adopted, undefined);
});
test("missing or mismatched media is not marked adopted", () => {
  assert.equal(outputs(snapshot, { outputs: { video: "missing" } })[0].status, "素材记录缺失");
  assert.equal(outputs(snapshot, { outputs: { video: "i1" } })[0].adopted, undefined);
});
test("only current ready candidates that change this shot's slot are counted", () => {
  const candidate = (id, shotId, revision = 7, status = "ready", output = "v2") => ({
    id, baseRevision: revision, status, draft: { shots: [{ id: shotId, outputs: { video: output } }] },
  });
  const withCandidates = { ...snapshot, candidates: [
    candidate("valid", "s1"), candidate("other-shot", "s2"), candidate("stale", "s1", 6),
    candidate("failed", "s1", 7, "failed"), candidate("unchanged", "s1", 7, "ready", "v1"),
    candidate("wrong-kind", "s1", 7, "ready", "i1"),
  ] };
  const result = outputs(withCandidates, { id: "s1", outputs: { video: "v1" } });
  assert.deepEqual(result[0].candidates.map(c => c.id), ["valid"]);
  assert.equal(result[0].adopted.id, "v1");
  assert.equal(result[1].candidates.length, 0);
});

const { references } = globalThis.BoneStoryboard;
const frameSnapshot = {
  document: { ...document, assets: [{ id: "first", name: "Entry", mediaId: "i1" }, { id: "last", name: "Exit", mediaId: "i2" }, { id: "wrong", name: "Video", mediaId: "v1" }] },
  media: [...media, { id: "i2", kind: "image" }, { id: "i3", kind: "image" }],
};
test("first/last frame mode resolves two independent asset references", () => {
  const result = references(frameSnapshot, { videoPlan: { mode: "first-last-frame", firstFrameAssetId: "first", lastFrameAssetId: "last" } });
  assert.deepEqual(result.map(item => [item.role, item.media.id]), [["first", "i1"], ["last", "i2"]]);
});
test("missing and wrong-kind frames keep their named slots", () => {
  const result = references(frameSnapshot, { videoPlan: { mode: "first-last-frame", firstFrameAssetId: "wrong", lastFrameAssetId: "deleted" } });
  assert.deepEqual(result.map(item => item.media), [null, null]);
  assert.equal(result[1].title, "尾帧");
  assert.equal(result[1].source, "帧资产不可用");
});
test("current adopted image is reused without adding a duplicate ordinary card", () => {
  const shot = { outputs: { image: "i1" }, videoPlan: { mode: "first-last-frame", firstFrameAssetId: null, lastFrameAssetId: "last" } };
  assert.deepEqual(references(frameSnapshot, shot).map(item => item.role), ["first", "last"]);
  shot.outputs.image = "i3";
  shot.videoPlan.firstFrameAssetId = "first";
  assert.deepEqual(references(frameSnapshot, shot).map(item => item.role), ["first", "last", "image"]);
});
test("one image may fill two frame roles without losing the tail role", () => {
  const result = references(frameSnapshot, { outputs: { image: "i1" }, videoPlan: { mode: "first-last-frame" } });
  assert.deepEqual(result.map(item => [item.role, item.media.id]), [["first", "i1"], ["last", "i1"]]);
});
test("ordinary and image-driven modes remain supported", () => {
  assert.equal(references(frameSnapshot, {})[0].role, "image");
  assert.deepEqual(references(frameSnapshot, { videoPlan: { mode: "image-to-video", firstFrameAssetId: "first" } }).map(item => item.role), ["first"]);
  assert.equal(references(frameSnapshot, { outputs: { image: "i2" }, videoPlan: { mode: "text-to-video" } })[0].media.id, "i2");
});
