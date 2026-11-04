/* Inline reference display and bounded, hash-checked registered-image reads. */
(() => {
  "use strict";
  const list = value => Array.isArray(value) ? value : [];
  const roles = { identity: "身份参考", scene: "场景参考", prop: "道具参考", style: "风格参考", "first-frame": "首帧", "last-frame": "尾帧" };
  const MAX_BYTES = 32 * 1024 * 1024;
  function boundImage(snapshot, reference) {
    const asset = list(snapshot.document.assets).find(item => item.id === reference.assetId);
    if (!asset) throw Error("引用资产已不存在。");
    if (asset.mediaId !== reference.mediaId && !list(asset.referenceMediaIds).includes(reference.mediaId)) throw Error("该图片已不属于此资产，请重新选择引用。");
    const record = list(snapshot.media).find(item => item.id === reference.mediaId);
    if (!record || record.kind !== "image") throw Error("引用图片记录缺失。");
    return record;
  }
  async function verifiedImage(record, value) {
    if (value?.error) throw Error(value.error.message || String(value.error));
    const mime = record.mimeType, url = value?.dataUrl, prefix = `data:${mime};base64,`;
    if (value?.kind !== "image" || value.mimeType !== mime || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) ||
      !Number.isSafeInteger(record.byteLength) || record.byteLength <= 0 || record.byteLength > MAX_BYTES || typeof url !== "string" ||
      !url.startsWith(prefix) || url.length > prefix.length + Math.ceil(MAX_BYTES / 3) * 4) throw Error("登记图片数据无效。");
    const encoded = url.slice(prefix.length);
    if (encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error("登记图片编码无效。");
    const decoded = atob(encoded);
    if (decoded.length !== record.byteLength) throw Error("引用图片字节长度已变化，请刷新。");
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    const hash = [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== record.sha256) throw Error("引用图片内容已变化，请刷新后重新选择。");
    return url;
  }
  function reader(scope, snapshot, actions) {
    const entries = new Map(), queue = []; let active = 0, cachedBytes = 0;
    function evict() {
      for (const [key, entry] of entries) {
        if (entries.size < 8 && cachedBytes <= 64 * 1024 * 1024) break;
        if (!entry.done) continue;
        cachedBytes -= entry.bytes; entries.delete(key);
      }
    }
    function pump() {
      while (scope.live() && active < 2 && queue.length) {
        const entry = queue.shift(); active++;
        (async () => {
          try {
            const value = await actions.loadMedia({ id: snapshot.document.id, mediaId: entry.record.id });
            if (!scope.live()) throw Error("分镜视图已关闭。");
            const url = await verifiedImage(entry.record, value);
            if (!scope.live()) throw Error("分镜视图已关闭。");
            entry.bytes = entry.record.byteLength; cachedBytes += entry.bytes; entry.resolve(url);
          } catch (error) { entry.reject(error); }
          finally { entry.done = true; active--; evict(); pump(); }
        })();
      }
    }
    scope.own(() => { for (const entry of entries.values()) if (!entry.done) entry.reject(Error("分镜视图已关闭。")); queue.length = 0; entries.clear(); cachedBytes = 0; });
    return reference => {
      if (!scope.live()) return Promise.reject(Error("分镜视图已关闭。"));
      let record;
      try { record = boundImage(snapshot, reference); } catch (error) { return Promise.reject(error); }
      const key = `${record.id}:${record.sha256}:${record.byteLength}`;
      if (entries.has(key)) return entries.get(key).promise;
      evict();
      if (entries.size >= 8) return Promise.reject(Error("图片正在读取，请稍后再试。"));
      const entry = { record, done: false, bytes: 0 };
      entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      entries.set(key, entry); queue.push(entry); pump(); return entry.promise;
    };
  }
  function create(scope, snapshot, actions) {
    const { node, position } = globalThis.BoneStoryboardControls, read = reader(scope, snapshot, actions);
    let hover = null, version = 0;
    function close() { version++; hover?.remove(); hover = null; }
    scope.own(close);
    scope.on(window, "resize", close);
    scope.on(document, "scroll", close, { capture: true });
    scope.on(document, "keydown", event => { if (event.key === "Escape") close(); });
    scope.on(document, "pointerdown", close);
    async function show(trigger, reference) {
      close(); if (!scope.live()) return;
      const epoch = version, asset = list(snapshot.document.assets).find(item => item.id === reference.assetId);
      const root = node("div", "bw-overlay bw-reference-preview"), status = node("p", "", "正在读取登记图片…");
      root.setAttribute("role", "tooltip");
      root.append(node("strong", "", asset?.name || "资产不可用"), node("p", "", roles[reference.role] || reference.role), status);
      hover = root; document.body.append(root); position(root, trigger);
      try {
        const src = await read(reference);
        if (!scope.live() || version !== epoch) return;
        const image = node("img", ""); image.alt = asset?.name || "引用图片"; image.src = src;
        image.addEventListener("error", () => { if (scope.live() && version === epoch) { image.remove(); status.textContent = "登记图片无法解码。"; } }, { once: true });
        root.prepend(image); status.textContent = ""; position(root, trigger);
      } catch (error) { if (scope.live() && version === epoch) { status.textContent = error?.message || String(error); position(root, trigger); } }
    }
    function render(doc, field) {
      const content = node("span", `bw-cell-text${field === "body" ? " bw-inline-scene" : ""}`);
      for (const item of list(doc?.nodes)) {
        if (item.type === "text") { content.append(document.createTextNode(item.text)); continue; }
        if (item.type !== "reference") continue;
        const asset = list(snapshot.document.assets).find(asset => asset.id === item.assetId);
        const token = node("span", `bw-reference-token${["prop", "scene"].includes(item.role) ? ` bw-ref-${item.role}` : ""}`, `@${asset?.name || "资产不可用"}`);
        token.dataset.assetId = item.assetId; token.dataset.mediaId = item.mediaId; token.dataset.role = item.role;
        token.setAttribute("aria-label", `${asset?.name || "资产不可用"}，${roles[item.role] || item.role}`);
        scope.on(token, "pointerenter", () => show(token, item)); scope.on(token, "pointerleave", close);
        content.append(token);
      }
      if (!content.textContent) { content.textContent = "—"; content.classList.add("bw-empty-text"); }
      return content;
    }
    function focusPreview(trigger, doc) {
      const first = list(doc?.nodes).find(item => item.type === "reference");
      if (first) { scope.on(trigger, "focus", () => show(trigger, first)); scope.on(trigger, "blur", close); }
    }
    return { render, close, focusPreview };
  }
  globalThis.BoneStoryboardReferences = Object.freeze({ boundImage, verifiedImage, reader, create });
})();
