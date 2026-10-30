/* Local cut-only preview. Saved selections are immutable inputs; no host writes. */
(() => {
  "use strict";
  const disposers = new Set();
  function beginRender() { for (const dispose of [...disposers]) dispose(); }
  const number = value => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
  function node(tag, cls, text) { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function segment(plan, from, to) {
    const all = plan.clips || [];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= all.length || to - from >= 8) throw Error("每次请选择连续的 1–8 个片段预览");
    let cursor = 0;
    const timed = all.map(clip => { const duration = (clip.outSeconds - clip.inSeconds) / clip.speed; const value = { ...clip, start: cursor, duration }; cursor += duration; return value; });
    const offset = timed[from].start, end = timed[to].start + timed[to].duration;
    return { clips: timed.slice(from, to + 1).map(c => ({ ...c, start: c.start - offset })),
      audio: (plan.audioTracks || []).filter(t => t.startSeconds < end && t.startSeconds + t.outSeconds - t.inSeconds > offset)
        .map(t => { const start = Math.max(t.startSeconds, offset), stop = Math.min(t.startSeconds + t.outSeconds - t.inSeconds, end); return { ...t, start: start - offset, inSeconds: t.inSeconds + start - t.startSeconds, outSeconds: t.inSeconds + stop - t.startSeconds }; }),
      duration: end - offset, offset };
  }
  function create({ productionId, plan, media, from = 0, to = 0, load }) {
    const wrap = node("section", "bw-sequence-preview"); wrap.setAttribute("aria-label", "剪辑段落预览");
    const stage = node("div", "bw-sequence-stage"), status = node("p", "bw-note", "等待加载实际素材…"); status.setAttribute("role", "status");
    const controls = node("div", "bw-playback");
    const play = node("button", "vp-button", "播放段落"); play.type = "button"; play.disabled = true;
    const seek = node("input", "bw-media-seek"); seek.type = "range"; seek.min = "0"; seek.step = "0.001"; seek.value = "0"; seek.disabled = true; seek.setAttribute("aria-label", "段落播放进度");
    const clock = node("span", "bw-media-time", "0s");
    const close = node("button", "vp-button", "关闭预览"); close.type = "button";
    controls.append(play, seek, clock, close); wrap.append(stage, controls, status,
      node("p", "bw-note", "本地硬切预览 · 包含已保存声音轨；文字转场说明不自动执行。浏览器预览不等于逐帧渲染或最终导出。"));
    let stopped = false, running = false, loading = true, raf = 0, position = 0, currentIndex = -1, generation = 0;
    let selected; const videos = [], tracks = [], mediaElements = [];
    const pendingPlay = new Map();
    const abort = new AbortController();
    function update() {
      seek.value = String(position); clock.textContent = `${number(position)} / ${number(selected?.duration || 0)}s`;
      play.textContent = running ? "暂停段落" : "播放段落";
      wrap.dataset.position = String(position); wrap.dataset.playing = String(running);
    }
    function pause() { running = false; generation += 1; cancelAnimationFrame(raf); pendingPlay.clear(); for (const e of mediaElements) e.pause(); update(); }
    function dispose() {
      if (stopped) return;
      stopped = true; pause(); abort.abort();
      for (const e of mediaElements) { e.removeAttribute("src"); e.load(); }
      disposers.delete(dispose); stage.replaceChildren(); play.disabled = true; seek.disabled = true;
    }
    disposers.add(dispose);
    close.addEventListener("click", () => { dispose(); wrap.remove(); });
    function fail(error) {
      if (stopped) return;
      pause(); status.textContent = `预览不可用：${error.message || error}`; wrap.dataset.error = "true";
      play.disabled = true; seek.disabled = true;
    }
    function ready(element, predicate, event) {
      if (predicate()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const done = error => { clearTimeout(timer); element.removeEventListener(event, success); element.removeEventListener("error", failure); abort.signal.removeEventListener("abort", cancelled); error ? reject(error) : resolve(); };
        const success = () => { if (predicate()) done(); };
        const failure = () => done(Error("媒体无法解码"));
        const cancelled = () => done(Error("预览已关闭"));
        const timer = setTimeout(() => done(Error("媒体加载超时")), 15000);
        element.addEventListener(event, success); element.addEventListener("error", failure); abort.signal.addEventListener("abort", cancelled, { once: true });
      });
    }
    async function loadElement(kind, url) {
      const e = document.createElement(kind); mediaElements.push(e); e.preload = "auto";
      if (kind === "video") e.playsInline = true;
      e.addEventListener("error", () => fail(Error("媒体解码失败，请检查实际文件")));
      e.src = url; e.load();
      await ready(e, () => e.readyState >= 1, "loadedmetadata");
      if (stopped) throw Error("预览已关闭");
      if (!Number.isFinite(e.duration) || e.duration <= 0) throw Error("无法取得实际媒体长度");
      return e;
    }
    async function seekElement(e, time) {
      if (Math.abs(e.currentTime - time) < 0.015 && !e.seeking) return;
      e.currentTime = time;
      await ready(e, () => !e.seeking, "seeked");
    }
    function indexAt(time) { return selected.clips.findIndex((c, i) => time < c.start + c.duration || i === selected.clips.length - 1); }
    async function show(time) {
      position = Math.max(0, Math.min(time, selected.duration));
      const index = indexAt(position), clip = selected.clips[index], video = videos[index];
      for (let i = 0; i < videos.length; i++) if (i !== index) videos[i].pause();
      currentIndex = index;
      if (stage.firstChild !== video) stage.replaceChildren(video);
      video.playbackRate = clip.speed; video.muted = !clip.includeSourceAudio;
      await seekElement(video, Math.min(clip.outSeconds, clip.inSeconds + Math.max(0, position - clip.start) * clip.speed));
      update();
    }
    function activeTrack(track, time) { return time >= track.start && time < track.start + track.outSeconds - track.inSeconds; }
    async function prepareAudio(time, token) {
      for (const { track, element } of tracks) {
        if (token !== generation || stopped || !running) return;
        element.pause();
        if (activeTrack(track, time)) await seekElement(element, track.inSeconds + time - track.start);
      }
    }
    function startMedia(element, token) {
      if (stopped || !running || token !== generation || !element.paused || pendingPlay.get(element) === token) return;
      pendingPlay.set(element, token);
      void element.play().then(() => {
        if (pendingPlay.get(element) !== token) return;
        pendingPlay.delete(element);
        if (stopped || !running || token !== generation) element.pause();
      }).catch(error => {
        if (pendingPlay.get(element) !== token) return;
        pendingPlay.delete(element);
        if (!stopped && running && token === generation) fail(error);
      });
    }
    function syncAudio(time, token) {
      for (const { track, element } of tracks) {
        if (token !== generation || stopped || !running) return;
        if (!activeTrack(track, time)) { element.pause(); pendingPlay.delete(element); continue; }
        const at = track.inSeconds + time - track.start;
        if (!element.seeking && Math.abs(element.currentTime - at) > 0.12) element.currentTime = at;
        if (!element.seeking) startMedia(element, token);
      }
    }
    async function resume() {
      const token = ++generation;
      if (position >= selected.duration - 0.01) position = 0;
      running = true; update();
      try {
        await show(position);
        if (stopped || token !== generation || !running) return;
        await prepareAudio(position, token);
        if (stopped || token !== generation || !running) return;
        // Never await play promises in the boundary monitor. Audio preparation
        // happens with the video paused; playback begins only after seeking.
        raf = requestAnimationFrame(tick);
        startMedia(videos[currentIndex], token);
        syncAudio(position, token);
      } catch (error) { if (token === generation) fail(error); }
    }
    async function tick() {
      if (!running || stopped) return;
      const token = generation, clip = selected.clips[currentIndex], video = videos[currentIndex];
      if ((video.readyState < 3 || video.paused) && !video.ended) {
        for (const { element } of tracks) element.pause();
        raf = requestAnimationFrame(tick); return;
      }
      position = Math.min(selected.duration, clip.start + Math.max(0, video.currentTime - clip.inSeconds) / clip.speed);
      if (video.currentTime >= clip.outSeconds - 0.012 || video.ended) {
        video.pause(); for (const { element } of tracks) element.pause();
        position = clip.start + clip.duration;
        if (currentIndex === selected.clips.length - 1) { pause(); position = selected.duration; update(); return; }
        try {
          await show(position + 0.000001);
          if (token !== generation || stopped || !running) return;
          await prepareAudio(position, token);
          if (token !== generation || stopped || !running) return;
          startMedia(videos[currentIndex], token);
          syncAudio(position, token);
        } catch (error) { if (token === generation) fail(error); return; }
      } else {
        try { syncAudio(position, token); } catch (error) { if (token === generation) fail(error); return; }
      }
      update();
      if (token === generation && running && !stopped) raf = requestAnimationFrame(tick);
    }
    play.addEventListener("click", () => { if (loading || stopped) return; running ? pause() : void resume(); });
    seek.addEventListener("input", async () => {
      if (loading || stopped) return;
      const wanted = Number(seek.value); pause(); const token = generation;
      try { await show(wanted); } catch (error) { if (token === generation) fail(error); }
    });
    queueMicrotask(async () => {
      if (stopped || !wrap.isConnected) return;
      try {
        if (plan.stale) throw Error("剪辑依据已变更，先让 Agent 复核并重新保存方案");
        selected = segment(plan, from, to);
        if (!Number.isFinite(selected.duration) || selected.duration <= 0) throw Error("剪辑区间无效");
        const ids = [...new Set([...selected.clips.map(c => c.mediaId), ...selected.audio.map(t => t.mediaId)])];
        const records = ids.map(id => media.find(m => m.id === id));
        if (records.some(m => !m)) throw Error("素材记录缺失");
        if (records.reduce((sum, m) => sum + (m.byteLength || 0), 0) > 192 * 1024 * 1024) throw Error("本段素材过大，请缩短预览范围");
        const urls = new Map();
        for (const id of ids) {
          const value = await load({ id: productionId, mediaId: id });
          if (stopped) return;
          const supported = value.kind === "video" ? ["video/mp4", "video/webm"] : ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg"];
          if (!supported.includes(value.mimeType) || typeof value.dataUrl !== "string" || !value.dataUrl.startsWith(`data:${value.mimeType};base64,`)) throw Error("媒体类型不匹配");
          urls.set(id, value);
        }
        for (const clip of selected.clips) {
          if (urls.get(clip.mediaId).kind !== "video") throw Error("片段必须引用视频");
          const e = await loadElement("video", urls.get(clip.mediaId).dataUrl); videos.push(e);
          if (!(clip.inSeconds >= 0 && clip.outSeconds > clip.inSeconds && clip.outSeconds <= e.duration + 0.001 && clip.speed >= 0.25 && clip.speed <= 4)) throw Error("采用区间超出实际视频长度或倍速无效");
        }
        for (const track of selected.audio) {
          if (urls.get(track.mediaId).kind !== "audio") throw Error("声音轨必须引用音频");
          const e = await loadElement("audio", urls.get(track.mediaId).dataUrl);
          if (!(track.inSeconds >= 0 && track.outSeconds > track.inSeconds && track.outSeconds <= e.duration + 0.001)) throw Error("声音区间超出实际音频长度");
          // HTML audio volume is bounded to 1. Gain above unity needs a mixer, not silent clipping.
          if (!(track.gain >= 0 && track.gain <= 1)) throw Error("浏览器预览支持音量 0–1；更高增益请先制作混音文件");
          e.volume = track.gain; tracks.push({ track, element: e }); wrap.append(e);
        }
        if (stopped) return;
        await show(0); if (stopped) return;
        seek.max = String(selected.duration); seek.disabled = false; play.disabled = false; loading = false;
        status.textContent = `实际文件长度已校验 · ${selected.clips.length} 段 · ${selected.audio.length} 条声音轨 · 剪辑占用 ${number(selected.duration)}s`;
        wrap.dataset.ready = "true"; update();
      } catch (error) { fail(error); }
    });
    return wrap;
  }
  window.addEventListener("pagehide", beginRender);
  globalThis.BoneSequencePreview = Object.freeze({ create, beginRender, segment });
})();
