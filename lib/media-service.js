"use strict";

const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const CHUNK = 1024 * 1024;
const KINDS = ["image", "video", "audio"];
const maximum = kind => (kind === "image" ? 32 : 64) * CHUNK;
function fail(code, message) { return Object.assign(new Error(message), { code }); }
function requireValue(ok, code, message) { if (!ok) throw fail(code, message); }
function identifier(value, name) {
  requireValue(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value), "INVALID_ARGUMENT", `${name} is invalid`);
  return value;
}
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function inspect(bytes) {
  const starts = value => bytes.subarray(0, value.length).equals(Buffer.from(value));
  const text = (start, end) => bytes.toString("ascii", start, end);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return ["image", "image/png", "png"];
  if (starts([255, 216, 255])) return ["image", "image/jpeg", "jpg"];
  if (["GIF87a", "GIF89a"].includes(text(0, 6))) return ["image", "image/gif", "gif"];
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return ["image", "image/webp", "webp"];
  if (text(0, 4) === "RIFF" && text(8, 12) === "WAVE") return ["audio", "audio/wav", "wav"];
  if (bytes.length >= 16 && text(4, 8) === "ftyp" &&
      /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash)$/.test(text(8, 12))) return ["video", "video/mp4", "mp4"];
  if (starts([26, 69, 223, 163]) && bytes.subarray(4, 4096).includes(Buffer.from("webm"))) return ["video", "video/webm", "webm"];
  if (text(0, 3) === "ID3" || (bytes.length >= 4 && bytes[0] === 255 &&
      (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x18) !== 8 && (bytes[1] & 6) !== 0 &&
      (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0xf0) !== 0 && (bytes[2] & 12) !== 12)) return ["audio", "audio/mpeg", "mp3"];
  if (text(0, 4) === "OggS" && bytes[4] === 0 && bytes.length > 27) {
    const packet = bytes.subarray(27 + bytes[26]);
    if ([Buffer.from("OpusHead"), Buffer.from([1, ...Buffer.from("vorbis")]), Buffer.from("Speex   "), Buffer.from([127, ...Buffer.from("FLAC")])]
      .some(signature => packet.subarray(0, signature.length).equals(signature))) return ["audio", "audio/ogg", "ogg"];
  }
  throw fail("INVALID_ARGUMENT", "Unsupported media signature");
}
function describe(item) {
  return { mediaId: item.id, kind: item.kind, mimeType: item.mimeType, byteLength: item.byteLength, sha256: item.sha256 };
}
function checkShot(snapshot, shotId, expected) {
  identifier(shotId, "shotId");
  requireValue(Number.isSafeInteger(expected) && expected > 0, "INVALID_ARGUMENT", "expectedShotRevision must be a positive integer");
  const shot = snapshot.document.shots.find(item => item.id === shotId);
  requireValue(shot, "NOT_FOUND", "Shot not found");
  requireValue(snapshot.shotStates?.[shotId]?.revision === expected, "CONFLICT", "Shot revision changed");
  return shot;
}
function metadata(item) {
  requireValue(item && KINDS.includes(item.kind) && /^[a-f0-9]{64}$/.test(item.sha256) &&
    Number.isSafeInteger(item.byteLength) && item.byteLength > 0 && item.byteLength <= maximum(item.kind) &&
    typeof item.fileName === "string" && new RegExp(`^${item.sha256}\\.(png|jpg|webp|gif|mp4|webm|wav|mp3|ogg)$`).test(item.fileName),
  "INVALID_ARGUMENT", "Invalid registered media metadata");
}
function wrap(action) {
  const optionalTargets = ["assetId", "shotId", "expectedShotRevision"];
  return async args => {
    if (args && typeof args === "object") args = Object.fromEntries(Object.entries(args).filter(([key, value]) => !(optionalTargets.includes(key) && value === null)));
    try { return await action(args); }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) throw fail("NOT_FOUND", "Media file or directory not found");
      if (["EACCES", "EPERM", "ELOOP"].includes(error.code)) throw fail("PERMISSION_DENIED", "Media filesystem access denied");
      throw error;
    }
  };
}

function createMediaService({ getDataPath, readSnapshot, mutateProduction, newId, markShotDirty, getHostFs, getWorkspace }) {
  // Only private storage uses Node fs. Every external byte comes through hostFs.
  async function directory(id, create = false) {
    const base = path.resolve(getDataPath());
    if (create) await fs.mkdir(base, { recursive: true });
    const root = await fs.realpath(base);
    let current = root;
    for (const part of ["productions", id, "media"]) {
      current = path.join(current, part);
      if (create) {
        try { await fs.mkdir(current); } catch (error) { if (error.code !== "EEXIST") throw error; }
      }
      const info = await fs.lstat(current);
      requireValue(info.isDirectory() && !info.isSymbolicLink(), "PERMISSION_DENIED", "Private media parent must be a real directory");
      requireValue(within(root, await fs.realpath(current)), "PERMISSION_DENIED", "Private media directory escapes storage");
    }
    return current;
  }
  async function privateBytes(id, item) {
    metadata(item);
    const folder = await directory(id);
    const file = path.join(folder, item.fileName);
    const info = await fs.lstat(file);
    requireValue(info.isFile() && !info.isSymbolicLink(), "PERMISSION_DENIED", "Media must be a private regular file");
    requireValue(within(folder, await fs.realpath(file)), "PERMISSION_DENIED", "Media escapes private storage");
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      requireValue(before.isFile() && before.size === item.byteLength, "INVALID_ARGUMENT", "Media size does not match registration");
      const bytes = Buffer.alloc(before.size);
      for (let offset = 0; offset < bytes.length;) {
        const { bytesRead } = await handle.read(bytes, offset, Math.min(CHUNK, bytes.length - offset), offset);
        requireValue(bytesRead > 0, "CONFLICT", "Private media changed while reading");
        offset += bytesRead;
      }
      const after = await handle.stat();
      requireValue(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, "CONFLICT", "Private media changed while reading");
      requireValue(digest(bytes) === item.sha256, "INVALID_ARGUMENT", "Media checksum does not match registration");
      const [kind, mime, ext] = inspect(bytes);
      requireValue(kind === item.kind && mime === item.mimeType && item.fileName === `${item.sha256}.${ext}`, "INVALID_ARGUMENT", "Media format does not match registration");
      return bytes;
    } finally { await handle.close(); }
  }
  async function sourceBytes(input, kind) {
    requireValue(typeof input === "string" && input.length > 0 && input.length <= 4096 &&
      !/[\\\x00-\x1f\x7f]/.test(input) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(input) && !input.startsWith("//"),
    "INVALID_ARGUMENT", "path must be a portable workspace path");
    const workspace = await getWorkspace();
    requireValue(workspace && typeof workspace.path === "string" && path.isAbsolute(workspace.path), "PERMISSION_DENIED", "No active workspace");
    const root = path.resolve(workspace.path);
    requireValue(!input.split("/").includes(".."), "PERMISSION_DENIED", "Parent traversal is not allowed");
    const absolute = path.resolve(root, input);
    requireValue(within(root, absolute) && absolute !== root, "PERMISSION_DENIED", "Media path escapes workspace");
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const hostFs = getHostFs();
    const before = await hostFs.stat(relative);
    requireValue(Number.isSafeInteger(before.size) && before.size > 0 && Number.isFinite(before.mtimeMs), "INVALID_ARGUMENT", "Media file must be nonempty with valid size and modification time");
    requireValue(before.size <= maximum(kind), "LIMIT_EXCEEDED", "Media file exceeds size limit");
    const bytes = Buffer.alloc(before.size);
    for (let offset = 0; offset < before.size; offset += CHUNK) {
      const length = Math.min(CHUNK, before.size - offset);
      const chunk = await hostFs.readRange(relative, offset, length);
      requireValue(chunk.totalSize === before.size && chunk.bytes instanceof Uint8Array && chunk.bytes.byteLength === length,
        "CONFLICT", "Source media changed while reading");
      bytes.set(chunk.bytes, offset);
    }
    const after = await hostFs.stat(relative);
    const active = await getWorkspace();
    requireValue(active?.path === workspace.path && before.size === after.size && before.mtimeMs === after.mtimeMs,
      "CONFLICT", "Source media or workspace changed while reading");
    return bytes;
  }
  async function persist(id, item, bytes) {
    const folder = await directory(id, true);
    const destination = path.join(folder, item.fileName);
    try {
      await fs.lstat(destination);
      await privateBytes(id, item);
      return;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const temporary = path.join(folder, `.import-${randomUUID()}.tmp`);
    let owned = false;
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      owned = true;
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      requireValue(await directory(id) === folder, "PERMISSION_DENIED", "Private storage changed during import");
      // mutateProduction serializes publication and snapshot commit for this production.
      await fs.rename(temporary, destination);
      owned = false;
      // A failed snapshot commit may leave this immutable, content-addressed blob.
    } finally { if (owned) await fs.unlink(temporary); }
  }
  const register = wrap(async args => {
    const id = identifier(args?.id, "id");
    requireValue(KINDS.includes(args.kind), "INVALID_ARGUMENT", "kind must be image, video or audio");
    requireValue(args.title === undefined || (typeof args.title === "string" && args.title.length <= 300), "INVALID_ARGUMENT", "title must be text of at most 300 characters");
    requireValue(args.shotId !== undefined || args.expectedShotRevision === undefined, "INVALID_ARGUMENT", "expectedShotRevision requires shotId");
    return mutateProduction(id, async snapshot => {
      if (args.shotId !== undefined) checkShot(snapshot, args.shotId, args.expectedShotRevision);
      const bytes = await sourceBytes(args.path, args.kind);
      const [kind, mimeType, ext] = inspect(bytes);
      requireValue(kind === args.kind, "INVALID_ARGUMENT", "Media signature does not match requested kind");
      const sha256 = digest(bytes);
      const existing = (snapshot.media || []).find(item => item.sha256 === sha256);
      if (existing) { await privateBytes(id, existing); return { id, ...describe(existing), deduplicated: true }; }
      requireValue((snapshot.media || []).length < 1024, "LIMIT_EXCEEDED", "Production media limit reached");
      const item = { id: newId("md"), kind, mimeType, byteLength: bytes.length, sha256,
        fileName: `${sha256}.${ext}`, title: args.title?.trim() || "", createdAt: new Date().toISOString(),
        ...(args.shotId !== undefined ? { shotId: args.shotId, shotRevision: args.expectedShotRevision } : {}) };
      await persist(id, item, bytes);
      (snapshot.media ||= []).push(item);
      return { id, ...describe(item), deduplicated: false };
    });
  });
  const adopt = wrap(async args => {
    const id = identifier(args?.id, "id");
    const mediaId = identifier(args.mediaId, "mediaId");
    requireValue((args.assetId !== undefined) !== (args.shotId !== undefined), "INVALID_ARGUMENT", "Supply exactly one assetId or shotId");
    requireValue(args.shotId !== undefined || args.expectedShotRevision === undefined, "INVALID_ARGUMENT", "expectedShotRevision requires shotId");
    return mutateProduction(id, async snapshot => {
      const item = (snapshot.media || []).find(record => record.id === mediaId);
      requireValue(item, "NOT_FOUND", "Registered media not found");
      await privateBytes(id, item);
      if (args.assetId !== undefined) {
        identifier(args.assetId, "assetId");
        const asset = snapshot.document.assets.find(record => record.id === args.assetId);
        requireValue(asset, "NOT_FOUND", "Asset not found");
        requireValue(item.kind === (asset.type === "声音" ? "audio" : "image"), "INVALID_ARGUMENT", "Media kind is incompatible with asset type");
        requireValue(!asset.locked || asset.mediaId === mediaId, "CONFLICT", "Unlock asset before changing its media");
        const dirtyShotIds = [];
        if (asset.mediaId !== mediaId) {
          asset.mediaId = mediaId;
          for (const shot of snapshot.document.shots) {
            if ((shot.assetIds || []).includes(asset.id) || [shot.videoPlan?.firstFrameAssetId, shot.videoPlan?.lastFrameAssetId].includes(asset.id) ||
                (shot.continuityPlan?.anchors || []).some(anchor => anchor.assetId === asset.id)) {
              markShotDirty(snapshot, shot.id);
              dirtyShotIds.push(shot.id);
            }
          }
        }
        return { id, ...describe(item), assetId: asset.id, dirtyShotIds };
      }
      const shot = checkShot(snapshot, args.shotId, args.expectedShotRevision);
      requireValue((item.shotId === undefined || item.shotId === shot.id) &&
        (item.shotRevision === undefined || item.shotRevision === args.expectedShotRevision), "CONFLICT", "Media was registered for a different shot or revision");
      if (!shot.outputs) {
        shot.outputs = {};
        const legacy = (snapshot.media || []).find(record => record.id === shot.mediaId);
        if (legacy && KINDS.includes(legacy.kind)) shot.outputs[legacy.kind] = legacy.id;
      }
      if (item.kind === "image" && shot.outputs.image !== mediaId &&
          ["image-to-video", "first-last-frame"].includes(shot.videoPlan?.mode) && !shot.videoPlan.firstFrameAssetId) {
        markShotDirty(snapshot, shot.id);
      }
      const state = snapshot.shotStates[shot.id];
      shot.outputs[item.kind] = mediaId;
      if (item.kind === "image") shot.mediaId = mediaId;
      (state.outputRevisions ||= {})[item.kind] = state.revision;
      state.outputVersion = (state.outputVersion || 0) + 1;
      const primary = snapshot.document.kind === "image" ? "image" : "video";
      state.needsUpdate = !shot.outputs[primary] || state.outputRevisions[primary] !== state.revision;
      return { id, ...describe(item), shotId: shot.id, shotRevision: state.revision,
        outputVersion: state.outputVersion, needsUpdate: state.needsUpdate, outputs: { ...shot.outputs } };
    });
  });
  const readMedia = wrap(async args => {
    const id = identifier(args?.id, "id");
    const mediaId = identifier(args.mediaId, "mediaId");
    const snapshot = await readSnapshot(id);
    const item = (snapshot.media || []).find(record => record.id === mediaId);
    requireValue(item, "NOT_FOUND", "Registered media not found");
    const bytes = await privateBytes(id, item);
    return { kind: item.kind, mimeType: item.mimeType, dataUrl: `data:${item.mimeType};base64,${bytes.toString("base64")}` };
  });
  const string = { type: "string" };
  const target = { type: ["string", "null"], description: "不适用的目标请省略或传 null，不能用空字符串占位" };
  const revision = { type: ["integer", "null"], minimum: 1, description: "镜头目标必须填当前修订号；资产目标省略或 null" };
  return { readMedia, tools: [
    { name: "register_media", risk: "medium", description: "Import a workspace media file through host permissions into private storage. Registers only; call adopt_media to bind it. Shot imports require the current shot revision.",
      schema: { type: "object", properties: { id: string, path: string, kind: { type: "string", enum: KINDS }, title: { type: "string", maxLength: 300 }, shotId: target, expectedShotRevision: revision }, required: ["id", "path", "kind"], additionalProperties: false }, execute: register },
    { name: "adopt_media", risk: "medium", description: "Explicitly bind registered media to exactly one asset or shot. Shot adoption requires the current shot revision; locked assets must be unlocked before rebinding.",
      schema: { type: "object", properties: { id: string, mediaId: string, assetId: target, shotId: target, expectedShotRevision: revision }, required: ["id", "mediaId"], additionalProperties: false }, execute: adopt },
  ] };
}

module.exports = { createMediaService };
