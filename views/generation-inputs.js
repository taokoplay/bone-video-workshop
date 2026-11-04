/* Verified media catalog and portable input packages; no provider execution. */
(() => {
  "use strict";
  const list = value => Array.isArray(value) ? value : [];
  const failure = (code, message) => Object.assign(new Error(message), { code });
  function checked(result) {
    if (result?.status === "blocked" || result?.ready === false || result?.ok === false || result?.error) {
      const detail = result.error || list(result.errors)[0] || result;
      throw failure(detail.code || result.code || "BLOCKED", detail.message || result.message || "请求被阻止");
    }
    return result;
  }
  function decode(data) {
    if (typeof data !== "string" || !data.length || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw failure("INVALID_MEDIA", "Invalid base64 image bytes");
    return Uint8Array.from(atob(data), char => char.charCodeAt(0));
  }
  function encode(bytes) {
    let value = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) value += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(value);
  }
  async function hash(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  async function image(record, loadMedia, productionId) {
    const result = checked(await loadMedia({ id: productionId, mediaId: record.id }));
    const prefix = `data:${record.mimeType};base64,`;
    if (result?.kind !== "image" || result.mimeType !== record.mimeType || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(record.mimeType) || !result.dataUrl?.startsWith(prefix)) throw failure("INVALID_MEDIA", "Invalid registered image response");
    if (result.dataUrl.length > 45 * 1024 * 1024) throw failure("LIMIT_EXCEEDED", "Image exceeds 32 MiB");
    const bytes = decode(result.dataUrl.slice(prefix.length));
    if (bytes.length !== record.byteLength || bytes.length > 32 * 1024 * 1024 || await hash(bytes) !== record.sha256) throw failure("INVALID_MEDIA", "Image bytes do not match registration");
    const picture = new Image(); picture.src = result.dataUrl; await picture.decode();
    return { src: result.dataUrl, sha256: record.sha256, byteLength: record.byteLength };
  }
  async function catalog({ snapshot, draft, loadMedia, reads, live, limit = 24 }) {
    const assets = list(snapshot.document.assets).map(asset => ({ ...asset, kind: ({ "角色": "character", "场景": "scene", "道具": "prop", "产品": "prop", "风格": "style" })[asset.type] || "identity" }));
    const records = new Map(list(snapshot.media).filter(item => item.kind === "image").map(item => [item.id, item]));
    const references = FilmShotAuthoring.FIELDS.flatMap(field => draft[field].nodes.filter(item => item.type === "reference"));
    const pairs = new Set(), candidates = [];
    for (const ref of [...references, ...assets.flatMap(asset => [...new Set([asset.mediaId, ...list(asset.referenceMediaIds)])].map(mediaId => ({ assetId: asset.id, mediaId })))]) {
      const asset = assets.find(item => item.id === ref.assetId), record = records.get(ref.mediaId), key = `${ref.assetId}:${ref.mediaId}`;
      if (!asset || asset.type === "声音" || !record || pairs.has(key) || !(asset.mediaId === record.id || asset.referenceMediaIds?.includes(record.id))) continue;
      pairs.add(key); candidates.push({ id: record.id, assetId: asset.id, kind: "image", title: record.title || record.id, variant: asset.mediaId === record.id ? "当前图片" : "已关联图片" });
    }
    const ids = [...new Set(candidates.map(item => item.id))], queue = ids.slice(0, limit);
    async function worker() {
      while (queue.length && live()) {
        const id = queue.shift(), record = records.get(id), cached = reads.get(id);
        if (cached?.src && cached.sha256 === record.sha256 && cached.byteLength === record.byteLength) continue;
        try { const result = await image(record, loadMedia, snapshot.document.id); if (live()) reads.set(id, result); }
        catch (error) { if (live()) reads.set(id, { error: error.message }); }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    return { assets, media: candidates.filter(item => reads.get(item.id)?.src).map(item => ({ ...item, src: reads.get(item.id).src })), total: ids.length,
      loaded: ids.filter(id => reads.get(id)?.src).length, more: ids.length > limit };
  }
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function savedPackage({ shot, snapshot, actions, live }) {
    const settings = FilmShotAuthoring.fromShot(shot, snapshot.document);
    const args = { shotId: shot.id, expectedShotRevision: snapshot.shotStates[shot.id].revision, operation: settings.operation, maxReferenceImages: settings.maxReferenceImages };
    const prepared = checked(await actions.onPrepareGeneration(args));
    if (!live()) throw failure("CONFLICT", "View changed during export");
    if (prepared.productionRevision !== snapshot.document.revision) throw failure("CONFLICT", "项目参数或素材已变化，请回读核对后导出");
    const images = [];
    for (const slot of prepared.compiled.images) {
      const bytes = new Uint8Array(slot.byteLength); let offset = 0;
      do {
        const part = checked(await actions.onReadGenerationImage({ ...args, requestHash: prepared.requestHash, slot: slot.slot, offset, length: 65536 }));
        if (!live()) throw failure("CONFLICT", "View changed during export");
        const chunk = decode(part.data);
        if (part.mediaId !== slot.mediaId || part.sha256 !== slot.sha256 || part.mimeType !== slot.mimeType || part.byteLength !== bytes.length || part.nextOffset !== offset + chunk.length || part.nextOffset > bytes.length || part.eof !== (part.nextOffset === bytes.length)) throw failure("INVALID_MEDIA", "Invalid image chunk boundary or metadata");
        bytes.set(chunk, offset); offset = part.nextOffset;
      } while (offset < bytes.length);
      if (await hash(bytes) !== slot.sha256) throw failure("INVALID_MEDIA", "Exported image hash mismatch");
      images.push({ ...slot, data: encode(bytes), encoding: "base64" });
    }
    const fresh = checked(await actions.onPrepareGeneration(args));
    if (!live() || fresh.requestHash !== prepared.requestHash) throw failure("CONFLICT", "Request changed during export");
    return { schemaVersion: 1, saved: true, productionId: snapshot.document.id, shotId: shot.id, ...prepared, images };
  }
  async function draftPackage({ shot, snapshot, draft, actions, live }) {
    const patch = FilmShotAuthoring.patch(draft, shot, snapshot.document.assets);
    const compiled = FilmShotAuthoring.compile({ shot: { ...shot, ...patch }, production: snapshot.document, assets: snapshot.document.assets, media: snapshot.media });
    for (const field of FilmShotAuthoring.FIELDS) for (const ref of draft[field].nodes.filter(node => node.type === "reference")) {
      const asset = snapshot.document.assets.find(item => item.id === ref.assetId), media = snapshot.media.find(item => item.id === ref.mediaId);
      if (!asset || !media) throw failure("NOT_FOUND", "引用的资产或图片已不存在");
      if (asset.type === "声音" || media.kind !== "image") throw failure("INVALID_MEDIA", "引用必须绑定图片资产");
      if (asset.mediaId !== media.id && !asset.referenceMediaIds?.includes(media.id)) throw failure("CONFLICT", "图片不再关联到此资产");
      if ((media.shotId !== undefined || media.shotRevision !== undefined) &&
        (!Number.isSafeInteger(media.shotRevision) || media.shotRevision < 1 || !snapshot.document.shots.some(item => item.id === media.shotId) || snapshot.shotStates?.[media.shotId]?.revision !== media.shotRevision)) {
        throw failure("CONFLICT", "参考图片的来源镜头版本已过期，请核对素材");
      }
    }
    async function checkBase() {
      const fresh = checked(await actions.onRefreshGeneration({ isCurrent: live }))?.snapshot;
      if (!live() || fresh?.document?.id !== snapshot.document.id || fresh.document.revision !== snapshot.document.revision || fresh.shotStates?.[shot.id]?.revision !== snapshot.shotStates?.[shot.id]?.revision) throw failure("CONFLICT", "作品已变化，请回读核对后导出草稿");
    }
    await checkBase();
    const images = [];
    for (const slot of compiled.images) {
      const read = await image({ ...slot, id: slot.mediaId }, actions.loadMedia, snapshot.document.id);
      if (!live()) throw failure("CONFLICT", "View changed during export");
      images.push({ ...slot, data: read.src.split(",")[1], encoding: "base64" });
    }
    await checkBase();
    const value = { schemaVersion: 1, saved: false, productionId: snapshot.document.id, shotId: shot.id, baseProductionRevision: snapshot.document.revision,
      baseShotRevision: snapshot.shotStates[shot.id].revision, draft: patch, compiled, images };
    return { ...value, inputHash: await hash(new TextEncoder().encode(JSON.stringify(value))) };
  }
  globalThis.BoneGenerationInputs = Object.freeze({ checked, catalog, download, savedPackage, draftPackage, hash });
})();
