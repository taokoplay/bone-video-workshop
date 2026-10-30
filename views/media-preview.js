/* Plugin-private media only. The host bridge owns lookup and byte validation. */
(() => {
  "use strict";
  const mimeKinds = {
    "image/png": "image", "image/jpeg": "image", "image/webp": "image", "image/gif": "image",
    "video/mp4": "video", "video/webm": "video", "audio/wav": "audio", "audio/x-wav": "audio",
    "audio/mpeg": "audio", "audio/ogg": "audio",
  };
  let epoch = 0;
  let observer = null;
  const players = new Set();
  const dialogs = new Set();
  const tasks = new WeakMap();
  const cache = new Map();
  let cachedBytes = 0;
  const cacheLimit = 24 * 1024 * 1024;

  function beginRender() {
    epoch += 1;
    observer?.disconnect();
    observer = null;
    for (const player of players) { player.pause(); player.removeAttribute("src"); player.load(); }
    players.clear();
    for (const dialog of dialogs) { if (dialog.open) dialog.close(); }
    dialogs.clear();
  }
  function remember(key, value) {
    if (value.dataUrl.length > cacheLimit) return;
    if (cache.has(key)) {
      cachedBytes -= cache.get(key).dataUrl.length;
      cache.delete(key);
    }
    while (cache.size && cachedBytes + value.dataUrl.length > cacheLimit) {
      const first = cache.keys().next().value;
      cachedBytes -= cache.get(first).dataUrl.length;
      cache.delete(first);
    }
    cache.set(key, value);
    cachedBytes += value.dataUrl.length;
  }
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function playback(kind, url, title, ownerEpoch) {
    const wrap = element("div", "bw-playable");
    const media = document.createElement(kind === "video" ? "video" : "audio");
    media.preload = "metadata";
    media.setAttribute("aria-label", title);
    if (kind === "video") media.playsInline = true;
    media.src = url;
    players.add(media);
    const controls = element("div", "bw-playback");
    const play = element("button", "vp-button", "播放"); play.type = "button";
    play.setAttribute("aria-label", `播放${title}`);
    const seek = element("input", "bw-media-seek"); seek.type = "range";
    seek.min = "0"; seek.max = "1"; seek.step = "0.01"; seek.value = "0"; seek.disabled = true;
    seek.setAttribute("aria-label", "播放进度");
    const time = element("span", "bw-media-time", "0:00 / 0:00");
    const error = element("p", "bw-media-error"); error.hidden = true;
    const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    const update = () => {
      const duration = Number.isFinite(media.duration) ? media.duration : 0;
      seek.max = String(duration || 1); seek.disabled = !duration;
      seek.value = String(media.currentTime || 0);
      time.textContent = `${clock(media.currentTime || 0)} / ${clock(duration)}`;
      play.textContent = media.paused ? "播放" : "暂停";
      play.setAttribute("aria-label", `${media.paused ? "播放" : "暂停"}${title}`);
    };
    play.addEventListener("click", async () => {
      if (!media.paused) { media.pause(); return; }
      for (const other of players) if (other !== media) other.pause();
      try { await media.play(); }
      catch (reason) {
        if (ownerEpoch !== epoch || !wrap.isConnected) return;
        error.hidden = false; error.textContent = `无法播放：${reason.message || "媒体格式不受支持"}`;
      }
    });
    seek.addEventListener("input", () => { if (!seek.disabled) media.currentTime = Number(seek.value); });
    for (const event of ["loadedmetadata", "timeupdate", "play", "pause", "ended"]) media.addEventListener(event, update);
    media.addEventListener("error", () => { error.hidden = false; error.textContent = "无法解码此媒体，请检查文件格式。"; play.disabled = true; });
    controls.append(play, seek, time); wrap.append(media, controls, error);
    return wrap;
  }
  function picture(url, title, zoom) {
    const image = document.createElement("img"); image.src = url; image.alt = title; image.decoding = "async";
    if (!zoom) return image;
    const wrap = element("div", "bw-zoomable");
    const open = element("button", "bw-zoom-button"); open.type = "button"; open.setAttribute("aria-label", `放大${title}`);
    open.append(image);
    const dialog = element("dialog", "bw-media-dialog");
    dialog.setAttribute("aria-label", title);
    const header = element("div", "bw-heading");
    const close = element("button", "vp-button", "关闭"); close.type = "button"; close.addEventListener("click", () => dialog.close());
    header.append(element("strong", "", title), close);
    const large = document.createElement("img"); large.src = url; large.alt = title;
    dialog.append(header, large); dialogs.add(dialog);
    open.addEventListener("click", () => { for (const media of players) media.pause(); dialog.showModal(); });
    wrap.append(open, dialog); return wrap;
  }
  function create({ productionId, mediaId, kind, title = "素材", zoom = false, load }) {
    const container = element("div", "bw-media-preview", "加载素材…");
    container.dataset.mediaId = mediaId;
    const ownerEpoch = epoch;
    const run = async () => {
      if (ownerEpoch !== epoch || !container.isConnected) return;
      const key = `${productionId}:${mediaId}`;
      try {
        let value = cache.get(key);
        if (!value) {
          value = await load({ id: productionId, mediaId });
          if (ownerEpoch !== epoch || !container.isConnected) return;
          if (value?.kind !== kind || mimeKinds[value?.mimeType] !== kind || typeof value.dataUrl !== "string"
            || !value.dataUrl.startsWith(`data:${value.mimeType};base64,`)) throw new Error("素材类型不匹配");
          remember(key, value);
        }
        if (value.kind !== kind) throw new Error("素材类型不匹配");
        const rendered = kind === "image" ? picture(value.dataUrl, title, zoom) : playback(kind, value.dataUrl, title, ownerEpoch);
        container.replaceChildren(rendered);
        container.dataset.loaded = "true";
        if (kind === "image") {
          const images = rendered.tagName === "IMG" ? [rendered] : rendered.querySelectorAll("img");
          for (const image of images) image.addEventListener("error", () => {
            container.dataset.error = "true";
            container.textContent = "图片无法解码";
          });
        }
      } catch (error) {
        if (ownerEpoch === epoch && container.isConnected) {
          container.dataset.error = "true"; container.textContent = `素材读取失败：${error.message || "未知错误"}`;
        }
      }
    };
    // Defer until the synchronous render attaches the node; load only visible media.
    queueMicrotask(() => {
      if (ownerEpoch !== epoch || !container.isConnected) return;
      if (typeof IntersectionObserver === "undefined") { void run(); return; }
      if (!observer) observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          observer?.unobserve(entry.target);
          const task = tasks.get(entry.target); tasks.delete(entry.target); if (task) void task();
        }
      }, { rootMargin: "100px" });
      tasks.set(container, run); observer.observe(container);
    });
    return container;
  }
  window.addEventListener("pagehide", beginRender);
  globalThis.BoneMediaPreview = Object.freeze({ create, beginRender });
})();
