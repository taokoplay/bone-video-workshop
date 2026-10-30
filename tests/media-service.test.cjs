"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createMediaService } = require("../lib/media-service.js");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(12)]);
const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(20)]);
const errorCode = code => error => { assert.equal(error.code, code); return true; };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), "bone-media-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  const data = path.join(root, "private");
  await fs.mkdir(path.join(workspace, "bone-media"), { recursive: true });
  await fs.mkdir(data);
  let snapshot = { schemaVersion: 1, document: { id: "pr_test", revision: 1, kind: "film",
    assets: [{ id: "as_image", type: "角色", locked: false }, { id: "as_audio", type: "声音", locked: false }],
    shots: [{ id: "sh_one", assetIds: [], outputs: {} }, { id: "sh_two", assetIds: [], outputs: {} }] },
  media: [], shotStates: { sh_one: { revision: 1, outputVersion: 0, needsUpdate: true }, sh_two: { revision: 1, outputVersion: 0, needsUpdate: true } } };
  let sequence = 0;
  let tail = Promise.resolve();
  const hooks = {};
  const calls = { stat: [], range: [] };
  const hostFs = {
    async stat(relative) {
      assert.ok(relative.startsWith("bone-media/"), "host scope remains authoritative");
      calls.stat.push(relative);
      const info = await fs.stat(path.join(workspace, relative));
      return hooks.stat ? hooks.stat({ size: info.size, mtimeMs: info.mtimeMs }, calls.stat.length) : { size: info.size, mtimeMs: info.mtimeMs };
    },
    async readRange(relative, offset, length) {
      assert.ok(relative.startsWith("bone-media/"));
      assert.ok(length > 0 && length <= 1024 * 1024);
      calls.range.push({ relative, offset, length });
      const handle = await fs.open(path.join(workspace, relative));
      try {
        const info = await handle.stat();
        const bytes = Buffer.alloc(length);
        const result = await handle.read(bytes, 0, length, offset);
        const chunk = { bytes: new Uint8Array(bytes.subarray(0, result.bytesRead)), totalSize: info.size };
        return hooks.range ? hooks.range(chunk, calls.range.length) : chunk;
      } finally { await handle.close(); }
    },
  };
  const service = createMediaService({ getDataPath: () => data, readSnapshot: async () => structuredClone(snapshot),
    mutateProduction(id, mutate) {
      assert.equal(id, "pr_test");
      const next = tail.then(async () => {
        const draft = structuredClone(snapshot);
        const result = await mutate(draft);
        if (hooks.commit) await hooks.commit();
        draft.document.revision++;
        snapshot = draft;
        return result;
      });
      tail = next.catch(() => {});
      return next;
    },
    newId: prefix => `${prefix}_${++sequence}`,
    markShotDirty(state, id) { state.shotStates[id].revision++; state.shotStates[id].needsUpdate = true; },
    getHostFs: () => hostFs, getWorkspace: async () => hooks.workspace ? hooks.workspace() : { path: workspace },
  });
  return { root, workspace, data, calls, hooks, service, get snapshot() { return snapshot; },
    async source(bytes = PNG, name = "input.dat") {
      await fs.writeFile(path.join(workspace, "bone-media", name), bytes);
      return `bone-media/${name}`;
    },
    register: args => service.tools[0].execute({ id: "pr_test", path: "bone-media/input.dat", kind: "image", ...args }),
    adopt: args => service.tools[1].execute({ id: "pr_test", ...args }),
    read: mediaId => service.readMedia({ id: "pr_test", mediaId }),
    file(item) { return path.join(data, "productions", "pr_test", "media", item.fileName); },
  };
}

test("PNG import, immutable metadata, explicit adoption and trusted data URL roundtrip", async t => {
  const f = await fixture(t);
  await f.source(PNG, "misleading.html");
  const imported = await f.register({ path: path.join(f.workspace, "bone-media", "misleading.html"), title: "Frame" });
  assert.equal(imported.kind, "image");
  assert.equal(imported.mimeType, "image/png");
  assert.equal(imported.byteLength, PNG.length);
  assert.equal(imported.sha256, sha(PNG));
  assert.ok(!("dataUrl" in imported) && !("fileName" in imported));
  assert.deepEqual(f.snapshot.document.shots[0].outputs, {});
  const item = f.snapshot.media[0];
  assert.equal(item.fileName, `${sha(PNG)}.png`);
  assert.equal(item.title, "Frame");
  assert.equal(item.path, undefined);
  assert.deepEqual(await fs.readFile(f.file(item)), PNG);
  assert.deepEqual(await f.read(imported.mediaId), { kind: "image", mimeType: "image/png", dataUrl: `data:image/png;base64,${PNG.toString("base64")}` });
  const adopted = await f.adopt({ mediaId: imported.mediaId, shotId: "sh_one", expectedShotRevision: 1 });
  assert.equal(adopted.outputs.image, imported.mediaId);
  assert.equal(adopted.needsUpdate, true);
  assert.equal(f.snapshot.document.shots[0].mediaId, imported.mediaId);
  assert.deepEqual(f.snapshot.shotStates.sh_one.outputRevisions, { image: 1 });
  assert.deepEqual(f.calls.stat, ["bone-media/misleading.html", "bone-media/misleading.html"]);
  assert.equal(f.service.tools.every(tool => tool.risk === "medium"), true);
});

test("imports use bounded 1 MiB host ranges and deduplicate without adoption", async t => {
  const f = await fixture(t);
  const bytes = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
  await f.source(bytes);
  const [first, second] = await Promise.all([f.register({}), f.register({})]);
  assert.equal(first.mediaId, second.mediaId);
  assert.equal(second.deduplicated, true);
  assert.equal(f.snapshot.media.length, 1);
  assert.equal(f.calls.range.length, 6);
  assert.deepEqual(f.calls.range.slice(0, 3).map(call => call.length), [1024 * 1024, 1024 * 1024, PNG.length]);
  assert.deepEqual(f.snapshot.document.shots[0].outputs, {});
  assert.deepEqual(await fs.readdir(path.dirname(f.file(f.snapshot.media[0]))), [f.snapshot.media[0].fileName]);
});

test("rejects URLs, portable traversal, invalid IDs and external absolute paths before host access", async t => {
  const f = await fixture(t);
  for (const input of ["../secret.png", "bone-media/../secret.png", path.join(f.root, "outside.png")]) {
    await assert.rejects(f.register({ path: input }), errorCode("PERMISSION_DENIED"));
  }
  for (const input of ["https://example.com/a.png", "file:///tmp/a.png", "bone-media\\image.png", "//server/share", "bone-media/\0.png"]) {
    await assert.rejects(f.register({ path: input }), errorCode("INVALID_ARGUMENT"));
  }
  await assert.rejects(f.register({ id: "../escape" }), errorCode("INVALID_ARGUMENT"));
  assert.equal(f.calls.stat.length, 0);
});

test("read only accepts registered IDs and rejects traversal, MIME forgery and corrupt content", async t => {
  const f = await fixture(t);
  await f.source();
  const imported = await f.register({});
  await assert.rejects(f.read("md_unknown"), errorCode("NOT_FOUND"));
  await assert.rejects(f.read("../../secret"), errorCode("INVALID_ARGUMENT"));
  const item = f.snapshot.media[0];
  const file = f.file(item);
  const originalName = item.fileName;
  item.fileName = "../../snapshot.json";
  await assert.rejects(f.read(imported.mediaId), errorCode("INVALID_ARGUMENT"));
  item.fileName = originalName;
  item.mimeType = "text/html";
  await assert.rejects(f.read(imported.mediaId), errorCode("INVALID_ARGUMENT"));
  item.mimeType = "image/png";
  await fs.writeFile(file, Buffer.alloc(PNG.length));
  await assert.rejects(f.read(imported.mediaId), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, assetId: "as_image" }), errorCode("INVALID_ARGUMENT"));
});

test("rejects private directory and private file symlinks", async t => {
  const f = await fixture(t);
  await f.source();
  const outside = path.join(f.root, "outside");
  await fs.mkdir(outside);
  const productions = path.join(f.data, "productions");
  await fs.symlink(outside, productions, "dir");
  await assert.rejects(f.register({}), errorCode("PERMISSION_DENIED"));
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(productions);
  const imported = await f.register({});
  const file = f.file(f.snapshot.media[0]);
  await fs.unlink(file);
  await fs.writeFile(path.join(outside, "image.png"), PNG);
  await fs.symlink(path.join(outside, "image.png"), file);
  await assert.rejects(f.read(imported.mediaId), errorCode("PERMISSION_DENIED"));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, assetId: "as_image" }), errorCode("PERMISSION_DENIED"));
});

test("accepts supported signatures and rejects HTML, SVG, mismatches and Ogg video", async t => {
  const f = await fixture(t);
  const ogg = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(22), Buffer.from([1, 8]), Buffer.from("OpusHead")]);
  const formats = [[PNG, "image", "image/png"], [Buffer.from([255, 216, 255, 224]), "image", "image/jpeg"],
    [Buffer.from("GIF89a"), "image", "image/gif"], [Buffer.from("RIFF0000WEBP"), "image", "image/webp"],
    [MP4, "video", "video/mp4"], [Buffer.from([26, 69, 223, 163, ...Buffer.from("webm")]), "video", "video/webm"],
    [WAV, "audio", "audio/wav"], [Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000"), "audio", "audio/mpeg"], [ogg, "audio", "audio/ogg"]];
  for (const [bytes, kind, mime] of formats) {
    await f.source(bytes);
    const result = await f.register({ kind });
    assert.equal(result.mimeType, mime);
  }
  for (const [bytes, kind] of [[Buffer.from("<svg></svg>"), "image"], [Buffer.from("<html>"), "image"], [PNG, "video"], [MP4, "audio"], [WAV, "image"],
    [Buffer.concat([ogg.subarray(0, 28), Buffer.from("theora")]), "audio"]]) {
    await f.source(bytes);
    await assert.rejects(f.register({ kind }), errorCode("INVALID_ARGUMENT"));
  }
});

test("rejects source stat, chunk size, chunk length and workspace changes", async t => {
  for (const variation of ["mtime", "size", "range", "short", "workspace"]) {
    await t.test(variation, async t => {
      const f = await fixture(t);
      await f.source();
      if (variation === "mtime" || variation === "size") f.hooks.stat = (info, count) => count === 2 ? { ...info, [variation === "mtime" ? "mtimeMs" : "size"]: 0 } : info;
      if (variation === "range") f.hooks.range = chunk => ({ ...chunk, totalSize: chunk.totalSize + 1 });
      if (variation === "short") f.hooks.range = chunk => ({ ...chunk, bytes: chunk.bytes.subarray(1) });
      let reads = 0;
      if (variation === "workspace") f.hooks.workspace = () => ({ path: ++reads === 1 ? f.workspace : f.root });
      await assert.rejects(f.register({}), errorCode("CONFLICT"));
      assert.equal(f.snapshot.media.length, 0);
    });
  }
});

test("enforces nonempty files, kind size caps and production media limit", async t => {
  const f = await fixture(t);
  await f.source(Buffer.alloc(0));
  await assert.rejects(f.register({}), errorCode("INVALID_ARGUMENT"));
  await f.source();
  for (const [kind, limit] of [["image", 32], ["video", 64], ["audio", 64]]) {
    f.hooks.stat = info => ({ ...info, size: limit * 1024 * 1024 + 1 });
    await assert.rejects(f.register({ kind }), errorCode("LIMIT_EXCEEDED"));
  }
  delete f.hooks.stat;
  assert.equal(f.calls.range.length, 0);
  const imported = await f.register({});
  while (f.snapshot.media.length < 1024) f.snapshot.media.push({ id: `unused_${f.snapshot.media.length}` });
  assert.equal((await f.register({})).mediaId, imported.mediaId);
  await f.source(Buffer.concat([PNG, Buffer.from([1])]));
  await assert.rejects(f.register({}), errorCode("LIMIT_EXCEEDED"));
});

test("shot import and adoption enforce exact revision and origin shot without silently adopting", async t => {
  const f = await fixture(t);
  await f.source();
  await assert.rejects(f.register({ shotId: "sh_one" }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.register({ shotId: "sh_one", expectedShotRevision: 0 }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.register({ shotId: "sh_one", expectedShotRevision: 2 }), errorCode("CONFLICT"));
  await assert.rejects(f.register({ shotId: "sh_unknown", expectedShotRevision: 1 }), errorCode("NOT_FOUND"));
  const imported = await f.register({ shotId: "sh_one", expectedShotRevision: 1 });
  assert.deepEqual(f.snapshot.document.shots[0].outputs, {});
  assert.equal(f.snapshot.media[0].shotRevision, 1);
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, shotId: "sh_one" }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, shotId: "sh_two", expectedShotRevision: 1 }), errorCode("CONFLICT"));
  f.snapshot.shotStates.sh_one.revision = 2;
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, shotId: "sh_one", expectedShotRevision: 1 }), errorCode("CONFLICT"));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, shotId: "sh_one", expectedShotRevision: 2 }), errorCode("CONFLICT"));
  assert.equal((await f.register({ shotId: "sh_one", expectedShotRevision: 2 })).mediaId, imported.mediaId);
  assert.equal(f.snapshot.media[0].shotRevision, 1, "dedup retains immutable provenance");
});

test("adoption preserves independent outputs, migrates legacy by kind and tracks primary freshness", async t => {
  const f = await fixture(t);
  await f.source(MP4);
  const video = await f.register({ kind: "video" });
  await f.source(WAV);
  const audio = await f.register({ kind: "audio" });
  await f.source(PNG);
  const image = await f.register({});
  const shot = f.snapshot.document.shots[0];
  delete shot.outputs;
  shot.mediaId = video.mediaId;
  f.snapshot.shotStates.sh_one.outputRevisions = { video: 1 };
  await f.adopt({ mediaId: audio.mediaId, shotId: "sh_one", expectedShotRevision: 1 });
  let result = await f.adopt({ mediaId: image.mediaId, shotId: "sh_one", expectedShotRevision: 1 });
  assert.deepEqual(result.outputs, { video: video.mediaId, audio: audio.mediaId, image: image.mediaId });
  assert.equal(result.needsUpdate, false);
  assert.equal(f.snapshot.document.shots[0].mediaId, image.mediaId);
  f.snapshot.shotStates.sh_one.revision = 2;
  result = await f.adopt({ mediaId: audio.mediaId, shotId: "sh_one", expectedShotRevision: 2 });
  assert.equal(result.needsUpdate, true);
  result = await f.adopt({ mediaId: image.mediaId, shotId: "sh_one", expectedShotRevision: 2 });
  assert.equal(result.needsUpdate, true);
  result = await f.adopt({ mediaId: video.mediaId, shotId: "sh_one", expectedShotRevision: 2 });
  assert.equal(result.needsUpdate, false);
  assert.equal(result.outputVersion, 5);
  assert.equal(f.snapshot.document.shots[0].mediaId, image.mediaId);
});

test("implicit image first frame dirties the shot before recording output and leaves video stale", async t => {
  const f = await fixture(t);
  await f.source(MP4);
  const video = await f.register({ kind: "video" });
  await f.adopt({ mediaId: video.mediaId, shotId: "sh_one", expectedShotRevision: 1 });
  f.snapshot.document.shots[0].videoPlan = { mode: "image-to-video", firstFrameAssetId: null };
  await f.source();
  const image = await f.register({ shotId: "sh_one", expectedShotRevision: 1 });
  const adopted = await f.adopt({ mediaId: image.mediaId, shotId: "sh_one", expectedShotRevision: 1 });
  assert.equal(adopted.shotRevision, 2);
  assert.equal(adopted.needsUpdate, true);
  assert.deepEqual(f.snapshot.shotStates.sh_one.outputRevisions, { video: 1, image: 2 });
  f.snapshot.document.kind = "image";
  await f.source(Buffer.concat([PNG, Buffer.from([42])]));
  const next = await f.register({});
  assert.equal((await f.adopt({ mediaId: next.mediaId, shotId: "sh_one", expectedShotRevision: 2 })).needsUpdate, false);
});

test("asset locks, media compatibility and direct/frame/continuity dirty references", async t => {
  const f = await fixture(t);
  await f.source();
  const image = await f.register({});
  f.snapshot.document.assets[0].locked = true;
  await assert.rejects(f.adopt({ mediaId: image.mediaId, assetId: "as_image" }), errorCode("CONFLICT"));
  f.snapshot.document.assets[0].locked = false;
  f.snapshot.document.shots[0].assetIds = ["as_image"];
  f.snapshot.document.shots[1].videoPlan = { firstFrameAssetId: "as_image" };
  f.snapshot.document.shots.push({ id: "sh_anchor", assetIds: [], continuityPlan: { anchors: [{ assetId: "as_image" }] } });
  f.snapshot.shotStates.sh_anchor = { revision: 1, outputVersion: 0 };
  const result = await f.adopt({ mediaId: image.mediaId, assetId: "as_image" });
  assert.deepEqual(result.dirtyShotIds, ["sh_one", "sh_two", "sh_anchor"]);
  for (const id of result.dirtyShotIds) assert.equal(f.snapshot.shotStates[id].revision, 2);
  f.snapshot.document.assets[0].locked = true;
  assert.deepEqual((await f.adopt({ mediaId: image.mediaId, assetId: "as_image" })).dirtyShotIds, []);
  await assert.rejects(f.adopt({ mediaId: image.mediaId, assetId: "as_audio" }), errorCode("INVALID_ARGUMENT"));
  await f.source(WAV);
  const audio = await f.register({ kind: "audio" });
  await f.adopt({ mediaId: audio.mediaId, assetId: "as_audio" });
  await assert.rejects(f.adopt({ mediaId: audio.mediaId, assetId: "as_image" }), errorCode("INVALID_ARGUMENT"));
  await f.source(MP4);
  const video = await f.register({ kind: "video" });
  await assert.rejects(f.adopt({ mediaId: video.mediaId, assetId: "as_image" }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.adopt({ mediaId: image.mediaId }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.adopt({ mediaId: image.mediaId, assetId: "as_image", shotId: "sh_one", expectedShotRevision: 2 }), errorCode("INVALID_ARGUMENT"));
});

test("missing files block adoption and failed snapshot commit leaves only a reusable immutable blob", async t => {
  const f = await fixture(t);
  await f.source();
  f.hooks.commit = () => { throw new Error("commit failed"); };
  await assert.rejects(f.register({}), /commit failed/);
  assert.equal(f.snapshot.media.length, 0);
  const folder = path.join(f.data, "productions", "pr_test", "media");
  assert.deepEqual(await fs.readdir(folder), [`${sha(PNG)}.png`]);
  delete f.hooks.commit;
  const imported = await f.register({});
  await fs.unlink(f.file(f.snapshot.media[0]));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, assetId: "as_image" }), errorCode("NOT_FOUND"));
  assert.equal(f.snapshot.document.assets[0].mediaId, undefined);
});

test("existing unrelated blob is never overwritten and write failures remain observable", async t => {
  const f = await fixture(t);
  await f.source();
  const folder = path.join(f.data, "productions", "pr_test", "media");
  await fs.mkdir(folder, { recursive: true });
  const destination = path.join(folder, `${sha(PNG)}.png`);
  await fs.writeFile(destination, "unrelated");
  await assert.rejects(f.register({}), errorCode("INVALID_ARGUMENT"));
  assert.equal(await fs.readFile(destination, "utf8"), "unrelated");
  assert.deepEqual(await fs.readdir(folder), [`${sha(PNG)}.png`]);
});

test("publication failures are reported and clean only the import's own temporary file", async t => {
  const f = await fixture(t);
  await f.source();
  const folder = path.join(f.data, "productions", "pr_test", "media");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, ".other-import.tmp"), "another owner's data");
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (from.startsWith(folder + path.sep)) throw Object.assign(new Error("publication failed"), { code: "EIO" });
    return rename(from, to);
  };
  try { await assert.rejects(f.register({}), errorCode("EIO")); }
  finally { fs.rename = rename; }
  assert.deepEqual(await fs.readdir(folder), [".other-import.tmp"]);
  assert.equal(f.snapshot.media.length, 0);
});

test("host permission denial has no direct filesystem fallback", async t => {
  const f = await fixture(t);
  await f.source();
  f.hooks.stat = () => { throw Object.assign(new Error("Host scope denied"), { code: "PERMISSION_DENIED" }); };
  await assert.rejects(f.register({}), errorCode("PERMISSION_DENIED"));
  assert.equal(f.calls.range.length, 0);
  assert.equal(f.snapshot.media.length, 0);
});

test("nullable optional targets support strict tool callers without bypassing exclusive adoption", async t => {
  const f = await fixture(t); await f.source();
  const imported = await f.register({ shotId: null, expectedShotRevision: null });
  await f.adopt({ mediaId: imported.mediaId, assetId: "as_image", shotId: null, expectedShotRevision: null });
  assert.equal(f.snapshot.document.assets[0].mediaId, imported.mediaId);
  await f.adopt({ mediaId: imported.mediaId, assetId: null, shotId: "sh_one", expectedShotRevision: 1 });
  assert.equal(f.snapshot.document.shots[0].outputs.image, imported.mediaId);
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, assetId: null, shotId: null, expectedShotRevision: null }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, assetId: "as_image", shotId: "sh_one", expectedShotRevision: 1 }), errorCode("INVALID_ARGUMENT"));
  await assert.rejects(f.adopt({ mediaId: imported.mediaId, assetId: null, shotId: "sh_one", expectedShotRevision: null }), errorCode("INVALID_ARGUMENT"));
});
