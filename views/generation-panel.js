/* Focused shot authoring, verified export and on-demand conflict recovery. */
(() => {
  "use strict";
  const list = value => Array.isArray(value) ? value : [];
  const clone = value => structuredClone(value);
  const labels = { body: "画面描述 · 图片引用", lighting: "光影氛围", motion: "运镜", dialogue: "对白 · 旁白", effects: "音效" };
  const modes = [["image.generate", "文生图 · 无参考图"], ["image.reference", "参考图生图"], ["video.text", "文生视频 · 无参考图"], ["video.reference", "参考图生视频"], ["video.image", "首帧生视频"], ["video.first-last", "首尾帧生视频"]];
  const omittedNames = { ...labels, duration: "剪辑预算", fps: "帧率", voice: "项目人声", music: "项目音乐", "soundDesign.music": "镜头音乐", "productionPlan.generationDurationSeconds": "源片长度", "productionPlan.headHandleSeconds": "头部留量", "productionPlan.tailHandleSeconds": "尾部留量" };
  const failure = (code, message) => Object.assign(new Error(message), { code });
  const checked = result => BoneGenerationInputs.checked(result);
  function signature(value) {
    if (value?.nodes) {
      const nodes = [];
      for (const item of value.nodes) {
        if (item.type === "text" && !item.text) continue;
        if (item.type === "text" && nodes.at(-1)?.type === "text") nodes.at(-1).text += item.text;
        else nodes.push({ ...item });
      }
      return JSON.stringify(nodes);
    }
    if (value && typeof value === "object") return JSON.stringify(Object.keys(value).sort().map(key => [key, signature(value[key])]));
    return JSON.stringify(value);
  }
  function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  let active = null, serial = 0;
  function beginRender() { active?.destroy(false); }
  function open({ snapshot: initialSnapshot, shot: initialShot, actions, trigger, focusField = "body" }) {
    beginRender();
    const productionId = initialSnapshot.document.id, shotId = initialShot.id;
    let snapshot = clone(initialSnapshot), shot = clone(initialShot), revision = snapshot.shotStates?.[shotId]?.revision;
    let draft = FilmShotAuthoring.fromShot(shot, snapshot.document), baseline = clone(draft), saved = Boolean(shot.generationBrief);
    let alive = true, busy = false, loading = false, composing = false, reconcile = false, compiled = null, pending = null;
    let catalogLimit = 24, loadVersion = 0;
    const editors = new Map(), hosts = new Map(), reads = new Map(), listeners = new AbortController();
    const selects = [];
    function select(label, options = []) { const control = BoneSelect.create({ label, options }); selects.push(control); return control; }
    const dialog = node("dialog", "bw-generation-dialog"), heading = node("h3", "", `编辑镜头 · ${shot.title || shotId}`);
    heading.id = `bone-generation-${++serial}`; dialog.setAttribute("aria-labelledby", heading.id);
    const on = (target, event, fn) => target.addEventListener(event, fn, { signal: listeners.signal });
    function button(text, fn) { const el = node("button", "vp-button", text); el.type = "button"; on(el, "click", fn); return el; }
    const live = () => alive && dialog.open && dialog.isConnected && (!actions.isGenerationCurrent || actions.isGenerationCurrent());
    const dirty = () => !saved || signature(draft) !== signature(baseline);
    const validRevision = () => Number.isSafeInteger(revision) && revision > 0;
    const header = node("header", "bw-generation-head"), title = node("div");
    title.append(heading, node("p", "bw-generation-note", "修改实时更新右侧输入，保存后写回镜头。"));
    const close = button("×", () => destroy(true)); close.classList.add("bw-generation-close"); close.setAttribute("aria-label", "关闭编辑镜头"); header.append(title, close);
    const body = node("div", "bw-generation-body"), grid = node("div", "bw-generation-grid"), left = node("section", "bw-generation-side"), right = node("section", "bw-generation-side");
    function field(name, parent) {
      const wrapper = node("div", `bw-generation-field bw-generation-field-${name}`), label = node("label", "", labels[name]);
      const host = node("div", "bw-generation-editor"); host.dataset.field = name; hosts.set(name, host); wrapper.append(label, host); parent.append(wrapper);
    }
    field("body", left);
    const catalogNote = node("p", "bw-generation-note"); catalogNote.setAttribute("role", "status"); catalogNote.hidden = true;
    const more = button("加载更多参考图片", () => { catalogLimit += 24; void mountEditors(); }); more.hidden = true; left.append(catalogNote, more);
    const settings = node("div", "bw-generation-settings");
    function control(label, el, parent) { const wrapper = node("label", "", label); el.setAttribute("aria-label", label); wrapper.append(el); parent.append(wrapper); }
    const scale = select("景别", [["", "未指定"], ...FilmShotAuthoring.SCALES.map(item => [item, item])]);
    const duration = node("input"); duration.type = "number"; duration.min = "0"; duration.max = "600"; duration.step = "0.01";
    control("景别", scale.element, settings); control("成片预算时长（秒）", duration, settings);
    for (const name of ["lighting", "motion", "dialogue", "effects"]) field(name, settings);
    left.append(settings);
    duration.title = "剪辑预算；源片生成长度与头尾留量沿用制作计划，未配置时不推测。";
    const controls = node("div", "bw-generation-controls"), operation = select("请求形式", modes);
    const imageLimit = select("图片上限", Array.from({ length:8 }, (_, i) => [String(i + 1), String(i + 1)]));
    control("请求形式", operation.element, controls); control("图片上限", imageLimit.element, controls); right.append(controls);
    const localPreview = node("section", "bw-generation-request");
    const omitted = node("p", "bw-generation-note");
    right.append(localPreview, omitted, node("p", "bw-generation-note", "图片上限是本次输入约束；外部工具是否支持该形式，需要交接时核对。"));
    grid.append(left, right); body.append(grid);
    const errorBox = node("section", "bw-generation-error"); errorBox.setAttribute("role", "alert"); errorBox.hidden = true;
    const compare = node("section", "bw-generation-reconcile"); compare.hidden = true;
    const status = node("span", "bw-generation-note bw-generation-status"); status.setAttribute("role", "status");
    const reread = button("回读并核对", readForReconcile); reread.hidden = true; reread.classList.add("bw-generation-recover");
    body.append(errorBox, reread, compare);
    const footer = node("footer", "bw-generation-footer"), save = button("保存镜头", saveDraft), exportButton = button("导出当前输入包", exportCurrent);
    save.classList.add("primary"); footer.append(status, button("取消", () => destroy(true)), exportButton, save); dialog.append(header, body, footer); document.body.append(dialog);
    const observer = new MutationObserver(() => { if (!dialog.isConnected) destroy(false); }); observer.observe(document.body, { childList: true, subtree: true });
    function destroy(notify) {
      if (!alive) return; alive = false; loadVersion++; listeners.abort(); observer.disconnect();
      for (const editor of editors.values()) editor.destroy(); editors.clear(); reads.clear();
      for (const control of selects) control.destroy();
      if (dialog.open) dialog.close(); dialog.remove();
      if (active?.dialog === dialog) active = null;
      if (notify) actions.onGenerationClose?.(); if (trigger?.isConnected) trigger.focus();
    }
    active = { dialog, destroy }; on(dialog, "cancel", event => { event.preventDefault(); destroy(true); }); on(dialog, "close", () => destroy(true));
    dialog.showModal();
    function inputProblem(error, preview = false) {
      const mode = draft.operation, code = error?.code;
      if (code === "UNSUPPORTED_REFERENCE_MODE") {
        if (mode === "video.text" || mode === "image.generate") {
          const target = mode === "video.text" ? "video.reference" : "image.reference";
          const name = modes.find(item => item[0] === target)[1];
          return { title:"参考图片与请求形式不匹配", message:`已添加参考图片，请切换为“${name}”，或移除图片引用。`, operation:target, action:`切换为${name}` };
        }
        if (mode === "image.reference" || mode === "video.reference") {
          const video = mode === "video.reference", name = video ? "文生视频 · 无参考图" : "文生图 · 无参考图";
          return { title:"还没有参考图片", message:`此请求形式至少需要一张参考图片。请用 @ 选择图片，或切换为“${name}”。`, operation:video ? "video.text" : "image.generate", action:`切换为${video ? "文生视频" : "文生图"}` };
        }
        if (mode === "video.image") return { title:"请指定视频首帧", message:"“首帧生视频”需要且仅能使用一张图片，并将该引用的用途设为“首帧”。请点击图片引用标签调整用途；角色或场景参考不能直接作为首帧。" };
        if (mode === "video.first-last") return { title:"请指定不同的首帧和尾帧", message:"“首尾帧生视频”需要两张内容不同的图片，分别用于“首帧”和“尾帧”。请点击引用标签调整用途，并移除其他图片引用。" };
      }
      if (code === "LIMIT_EXCEEDED" && error.message === "Too many reference images for this request") return { title:"参考图片超过上限", message:draft.maxReferenceImages < 8 ? `当前图片数量超过上限（${draft.maxReferenceImages} 张）。请调高“图片上限”，或移除不需要的图片引用。` : "本次输入最多使用 8 张参考图片，请移除不需要的图片引用。" };
      const messages = {
        UNRESOLVED_REFERENCE:["还有未完成的图片引用", "请从 @ 选图列表中选择图片，或删除未绑定的 @ 文字。"],
        NOT_FOUND:["引用内容已不存在", "镜头、资产或图片可能已被删除。请核对当前作品，并重新选择可用图片。"],
        CONFLICT:preview ? ["图片关联已变化", "请点击引用标签，重新选择当前资产可用的图片。已有文字已保留。"] : ["内容已发生变化", "草稿已保留。请点击“回读并核对”，确认最新内容后再保存或导出。"],
        INVALID_MEDIA:["参考图片无法读取", "图片内容与登记信息不一致或无法解码，请检查素材并重新选择可用图片。"],
        LIMIT_EXCEEDED:["内容超出限制", "请减少文字、引用数量或图片大小后重试；具体限制可展开“技术详情”查看。"],
        INVALID_ARGUMENT:["请检查镜头内容", "请确认画面描述不为空、时长在 0–600 秒之间，并检查引用和参数是否完整。"],
        UNAVAILABLE:["当前操作暂不可用", "请检查插件状态后重试，当前草稿已保留。"],
      };
      const [title, message] = messages[code] || ["操作未完成", "当前草稿已保留，请重试。若仍失败，可展开“技术详情”查看原因。"];
      return { title, message };
    }
    function renderProblem(target, error, allowSwitch = false) {
      const problem = inputProblem(error, allowSwitch);
      target.replaceChildren(node("h4", "", problem.title), node("p", "", problem.message));
      if (allowSwitch && problem.operation) target.append(button(problem.action, () => {
        if (!live() || busy || loading || composing) return;
        draft.operation = problem.operation; operation.value = problem.operation; changed();
      }));
      const details = node("details", "bw-generation-diagnostic");
      details.append(node("summary", "", "技术详情"), node("pre", "", `${error?.code || "ERROR"} · ${error?.message || String(error)}`));
      target.append(details);
    }
    function showError(error) { errorBox.hidden = false; renderProblem(errorBox, error); errorBox.scrollIntoView({ block:"nearest" }); }
    function clearError() { errorBox.hidden = true; errorBox.textContent = ""; }
    function update() {
      if (!alive) return;
      const locked = busy || loading || composing;
      save.disabled = locked || !dirty() || reconcile || !validRevision();
      exportButton.disabled = locked || reconcile || !compiled || !validRevision(); reread.disabled = locked; more.disabled = locked;
      reread.hidden = !reconcile && validRevision();
      left.inert = busy || loading; scale.disabled = busy || loading;
      operation.disabled = busy; imageLimit.disabled = busy;
      status.textContent = busy ? "正在处理…" : loading ? "正在读取参考图片…" : reconcile ? "请核对冲突" : dirty() ? "尚未保存" : "已保存";
    }
    function renderRequest(target, request) {
      target.replaceChildren(node("h4", "", "编译提示词"));
      const text = node("textarea", "bw-generation-text"); text.readOnly = true; text.value = request.prompt; text.rows = 9; text.setAttribute("aria-label", "编译提示词"); target.append(text);
      target.append(node("p", "bw-generation-note", `${request.images.length} 张匹配图片 · ${request.referenceCount} 处引用`));
      const images = node("ol", "bw-generation-images");
      for (const image of request.images) {
        const item = node("li", "bw-generation-image"); item.dataset.mediaId = image.mediaId; item.dataset.slot = String(image.slot);
        const read = reads.get(image.mediaId);
        if (read?.src && read.sha256 === image.sha256 && read.byteLength === image.byteLength) { const img = node("img"); img.src = read.src; img.alt = `图${image.slot}`; item.append(img); }
        else item.append(node("span", "bw-generation-missing", read?.error || "正在读取图片"));
        item.append(node("strong", "", `图${image.slot} · ${image.assetIds.map(id => snapshot.document.assets.find(a => a.id === id)?.name || id).join("、")}`), node("code", "", image.mediaId), node("small", "", image.roles.join(" · "))); images.append(item);
      }
      target.append(images);
    }
    function compileDraft() {
      compiled = null; omitted.textContent = "";
      try {
        const pendingField = FilmShotAuthoring.FIELDS.find(name => draft[name].nodes.some(item => item.type === "text" && item.text.includes("@")));
        if (pendingField) { localPreview.replaceChildren(node("h4", "", "等待选择资产"), node("p", "bw-generation-note", `${labels[pendingField]}中有待选择的 @，请选择图片或删除该符号。`)); update(); return; }
        const patch = FilmShotAuthoring.patch(draft, shot, snapshot.document.assets);
        compiled = FilmShotAuthoring.compile({ shot: { ...shot, ...patch }, production: snapshot.document, assets: snapshot.document.assets, media: snapshot.media });
        renderRequest(localPreview, compiled);
        omitted.textContent = compiled.omittedFields.length ? `本次图片输入不使用：${compiled.omittedFields.map(name => omittedNames[name] || name).join("、")}。内容仍会保存。` : "";
      } catch (error) {
        const feedback = node("section", "bw-generation-error"); feedback.setAttribute("role", "alert");
        renderProblem(feedback, error, true); localPreview.replaceChildren(feedback);
      }
      update();
    }
    function changed() { clearError(); compileDraft(); }
    function syncControls() { scale.value = draft.scale; duration.value = String(draft.duration); operation.value = draft.operation; imageLimit.value = String(draft.maxReferenceImages); }
    on(scale.element, "change", () => { draft.scale = scale.value; changed(); });
    on(duration, "input", () => { draft.duration = duration.value === "" ? NaN : Number(duration.value); changed(); });
    on(operation.element, "change", () => { draft.operation = operation.value; changed(); });
    on(imageLimit.element, "change", () => { draft.maxReferenceImages = Number(imageLimit.value); changed(); });
    on(left, "compositionstart", () => { composing = true; update(); }); on(left, "compositionend", () => { composing = false; update(); });
    async function mountEditors(focus = null) {
      const version = ++loadVersion; loading = true; update();
      try {
        const catalog = await BoneGenerationInputs.catalog({ snapshot, draft, loadMedia: actions.loadMedia, reads, limit: catalogLimit, live: () => live() && version === loadVersion });
        if (!live() || version !== loadVersion) return;
        for (const editor of editors.values()) editor.destroy(); editors.clear();
        for (const name of FilmShotAuthoring.FIELDS) {
          const editor = FilmReferenceEditor.create({ document: clone(draft[name]), assets: catalog.assets, media: catalog.media, label: labels[name], placeholder: `填写${labels[name]}，使用 @ 选择图片`, onChange: value => { draft[name] = clone(value); changed(); } });
          editors.set(name, editor); hosts.get(name).replaceChildren(editor.element);
        }
        more.hidden = !catalog.more;
        const failed = catalog.loaded < Math.min(catalog.total, catalogLimit);
        catalogNote.hidden = !failed;
        catalogNote.textContent = failed ? "部分参考图片读取失败，暂不可选择；已有引用已保留。" : "";
        loading = false; compileDraft();
        if (focus) { const target = editors.get(focus)?.editor || ({ scale, duration })[focus]; target?.focus(); target?.scrollIntoView({ block: "nearest" }); }
      } catch (error) { if (live()) { loading = false; showError(error); update(); } }
    }
    function refreshed(result) {
      const fresh = checked(result)?.snapshot, next = list(fresh?.document?.shots).find(item => item.id === shotId), nextRevision = fresh?.shotStates?.[shotId]?.revision;
      if (fresh?.document?.id !== productionId || !next || !Number.isSafeInteger(nextRevision) || nextRevision < 1) throw failure("CONFLICT", "回读结果没有当前镜头及有效版本");
      return { snapshot: clone(fresh), shot: clone(next), revision: nextRevision };
    }
    function adopt(next, preserveDraft = false) {
      const latest = FilmShotAuthoring.fromShot(next.shot, next.snapshot.document);
      if (preserveDraft) for (const name of Object.keys(draft)) { if (signature(draft[name]) === signature(baseline[name])) draft[name] = clone(latest[name]); }
      else draft = clone(latest);
      snapshot = next.snapshot; shot = next.shot; revision = next.revision; baseline = clone(latest); saved = Boolean(shot.generationBrief);
      reconcile = false; pending = null; compare.hidden = true; compare.replaceChildren(); syncControls();
    }
    async function saveDraft() {
      if (save.disabled || !live()) return; busy = true; clearError(); update();
      try {
        const patch = FilmShotAuthoring.patch(draft, shot, snapshot.document.assets), submitted = clone(draft);
        checked(await actions.onSaveGenerationBrief({ ...patch, shotId, expectedShotRevision: revision })); if (!live()) return;
        const next = refreshed(await actions.onRefreshGeneration({ isCurrent: live })); if (!live()) return;
        if (signature(FilmShotAuthoring.fromShot(next.shot, next.snapshot.document)) !== signature(submitted)) throw failure("CONFLICT", "保存回读与提交内容不同，请核对");
        adopt(next); await mountEditors();
      } catch (error) { if (live()) { reconcile = error.code === "CONFLICT"; showError(error); } }
      finally { if (live()) { busy = false; update(); } }
    }
    async function readForReconcile() {
      if (reread.disabled || reread.hidden || !live()) return; busy = true; clearError(); update();
      try {
        pending = refreshed(await actions.onRefreshGeneration({ isCurrent: live })); if (!live()) return;
        reconcile = true; compare.hidden = false;
        const latest = FilmShotAuthoring.fromShot(pending.shot, pending.snapshot.document);
        compare.replaceChildren(node("h4", "", `最新镜头版本 ${pending.revision}`), node("pre", "bw-generation-text", FilmShotAuthoring.FIELDS.map(name => `${labels[name]}：${FilmShotAuthoring.text(latest[name], pending.snapshot.document.assets)}`).join("\n")), node("p", "bw-generation-note", "继续时保留你改过的字段；未改字段采用最新值。"), button("已核对，保留草稿继续编辑", async () => { if (busy || !pending || !live()) return; adopt(pending, true); clearError(); await mountEditors(); }));
      } catch (error) { if (live()) { reconcile = true; showError(error); } }
      finally { if (live()) { busy = false; update(); } }
    }
    async function exportCurrent() {
      if (exportButton.disabled || !live()) return; busy = true; clearError(); update();
      try {
        const value = dirty() ? await BoneGenerationInputs.draftPackage({ shot, snapshot, draft, actions, live }) : await BoneGenerationInputs.savedPackage({ shot, snapshot, actions, live });
        if (live()) BoneGenerationInputs.download(value, `${productionId}-${shotId}-inputs.json`);
      } catch (error) { if (live()) { reconcile = error.code === "CONFLICT"; showError(error); } }
      finally { if (live()) { busy = false; update(); } }
    }
    syncControls(); compileDraft(); void mountEditors(focusField);
    return { element: dialog, destroy: () => destroy(false) };
  }
  window.addEventListener("pagehide", beginRender);
  globalThis.BoneGenerationPanel = Object.freeze({ open, beginRender });
})();
