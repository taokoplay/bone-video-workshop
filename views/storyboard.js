/* Storyboard presentation. Host mutations are delegated through explicit actions. */
(() => {
  "use strict";
  const list = value => Array.isArray(value) ? value : [];
  const label = value => typeof value === "string" ? value : "";
  const seconds = value => `${Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000}s`;
  const kinds = [["video", "影片"], ["image", "画面"], ["audio", "独立音频"]];

  function selection(doc, episodeId, shotId) {
    const all = list(doc.shots);
    const groups = list(doc.episodes).map(ep => ({ id: ep.id, title: ep.title || ep.id, episode: ep }));
    for (const shot of all) {
      const id = shot.episodeId || "";
      if (!groups.some(group => group.id === id)) groups.push({ id, title: "未归属剧集", episode: null });
    }
    const requested = all.find(shot => shot.id === shotId);
    const group = (requested && groups.find(item => item.id === (requested.episodeId || "")))
      || groups.find(item => item.id === episodeId) || groups[0];
    const shots = group ? all.filter(shot => (shot.episodeId || "") === group.id) : [];
    return { groups, group, shots, shot: shots.find(shot => shot.id === shotId) || shots[0] || null };
  }

  function outputIds(shot, media) {
    const ids = { ...shot.outputs };
    const legacy = media.find(item => item.id === shot.mediaId);
    if (legacy && ids[legacy.kind] === undefined) ids[legacy.kind] = legacy.id;
    return ids;
  }

  function outputs(snapshot, shot) {
    const media = list(snapshot.media);
    const ids = outputIds(shot, media);
    return kinds.map(([kind, name]) => {
      const id = ids[kind];
      const adopted = media.find(item => item.id === id && item.kind === kind);
      const candidates = list(snapshot.candidates).filter(candidate => {
        if (candidate.status !== "ready" || candidate.baseRevision !== snapshot.document.revision) return false;
        const proposed = list(candidate.draft?.shots).find(item => item.id === shot.id);
        if (!proposed) return false;
        const next = outputIds(proposed, media)[kind];
        return next && next !== id && media.some(item => item.id === next && item.kind === kind);
      });
      return { kind, name, adopted, missing: Boolean(id && !adopted), candidates,
        status: adopted ? "已采用" : id ? "素材记录缺失" : candidates.length ? "候选待采用" : "未生成" };
    });
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }
  function button(text, action, className = "vp-button") {
    const element = node("button", className, text);
    element.type = "button";
    globalThis.BoneStoryboardControls.listen(element, "click", action);
    return element;
  }
  function icon(kind) {
    const paths = {
      film: "M4 3h16v18H4z M4 7h16 M4 17h16 M8 3v4 M16 3v4 M8 17v4 M16 17v4 M10 10l5 2-5 2z",
      image: "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M7 7h.01",
      sound: "M9 18V5l11-2v13 M9 8l11-2 M9 18c0 4-6 4-6 1s6-4 6-1 M20 16c0 4-6 4-6 1s6-4 6-1",
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", paths[kind] || paths.film);
    svg.append(path);
    return svg;
  }
  function heading(title, trailing) {
    const row = node("div", "bw-heading");
    row.append(node("h3", "", title));
    if (trailing) row.append(trailing);
    return row;
  }
  function field(title, text) {
    const section = node("section", "bw-field");
    section.append(node("h4", "", title), node("p", "", label(text) || "尚未设置"));
    return section;
  }
  function empty(title, text, kind = "film") {
    const element = node("div", "bw-empty");
    element.append(icon(kind), node("strong", "", title), node("p", "", text));
    return element;
  }
  function prompt(doc, group, shot, action) {
    group = group || list(doc.episodes).find(ep => ep.id === shot?.episodeId);
    return [`请用 get_production 读取影视工厂作品 ${doc.id}《${doc.title || doc.id}》。`,
      group ? `当前集：${group.title}（episodeId: ${group.id || "未归属"}）。` : "当前还没有剧集。",
      shot ? `当前镜头：${shot.title || shot.id}（shotId: ${shot.id}）。` : "",
      action, "保留其他已定稿内容，不要删除作品或覆盖无关镜头。"].filter(Boolean).join("\n");
  }


  // Match the source workbench's frame contract; each role keeps its own slot.
  function references(snapshot, shot) {
    const media = list(snapshot.media);
    const imageId = outputIds(shot, media).image;
    const image = media.find(item => item.id === imageId && item.kind === "image");
    const result = [];
    const plan = shot.videoPlan;
    function frame(role, title, assetId) {
      const asset = assetId ? list(snapshot.document.assets).find(item => item.id === assetId) : null;
      const bound = assetId ? media.find(item => item.id === asset?.mediaId && item.kind === "image") : image;
      return { role, title, source: assetId ? (asset?.name || "帧资产不可用") : "当前已采用画面", media: bound || null };
    }
    if (plan?.mode === "image-to-video" || plan?.mode === "first-last-frame") {
      result.push(frame("first", "首帧", plan.firstFrameAssetId));
      if (plan.mode === "first-last-frame") result.push(frame("last", "尾帧", plan.lastFrameAssetId));
    }
    if (image && !result.some(item => item.media?.id === image.id)) {
      result.push({ role: "image", title: "已采用画面", source: "镜头画面输出", media: image });
    }
    if (!result.length) result.push({ role: "image", title: "画面参考", source: imageId ? "素材记录缺失" : "构图与视觉参考", media: null });
    return result;
  }

  function inputContext(snapshot, shot) {
    const doc = snapshot.document, draft = globalThis.FilmShotAuthoring.fromShot(shot, doc);
    const modes = { "image.generate":"文生图 · 无参考图", "image.reference":"参考图生图", "video.text":"文生视频 · 无参考图", "video.reference":"参考图生视频", "video.image":"首帧生视频", "video.first-last":"首尾帧生视频" };
    const box = node("div", "bw-input-context"), grid = node("div", "bw-context-grid");
    box.append(heading("请求参数", node("span", "bw-hint", shot.generationBrief ? "已保存输入" : "尚未保存生成输入")));
    grid.append(field("请求形式", `${modes[draft.operation] || draft.operation}${shot.generationSettings?.operation ? "" : "（默认）"}`),
      field("参考图片上限", `${draft.maxReferenceImages} 张${shot.generationSettings?.maxReferenceImages === undefined ? "（默认）" : ""}`),
      field("项目画幅", doc.ratio), field("项目美术风格", doc.style));
    if (draft.operation.startsWith("video.")) {
      grid.append(field("项目帧率", doc.fps > 0 ? `${doc.fps} FPS` : "未指定"));
      if (shot.soundDesign?.music) grid.append(field("镜头配乐指引", shot.soundDesign.music));
      if (doc.music) grid.append(field("项目配乐指引", doc.music));
      if (doc.voice) grid.append(field("项目人声指引", doc.voice));
    }
    box.append(grid, node("p", "bw-note", "请求形式和图片上限随镜头保存；画幅、风格及帧率来自项目设置。图片上限是输入约束，不代表模型能力。"));
    if (draft.operation.startsWith("image.")) box.append(node("p", "bw-note", "本次图片请求使用画面描述、景别、光影及其图片引用；运镜、声音和时长保留用于视频制作。"));
    return box;
  }
  function framePlan(snapshot, shot, actions) {
    const image = node("section", "bw-frame-plan");
    const items = references(snapshot, shot).filter(item => item.role === "first" || item.role === "last");
    if (!items.length) return image;
    image.append(heading("计划首尾帧", node("span", "bw-status", "视频制作策略")));
    const gallery = node("div", "bw-reference-gallery");
    gallery.setAttribute("aria-label", "计划首尾帧图片");
    for (const item of items) {
      const card = node("section", "bw-reference-card");
      card.dataset.role = item.role;
      card.dataset.ready = String(Boolean(item.media));
      const copy = node("div", "bw-reference-copy");
      copy.append(node("h4", "", item.title), node("span", "", item.source));
      const preview = node("div", "bw-reference-preview");
      if (item.media) preview.append(actions.preview(item.media, { title: item.title, zoom: true }));
      else preview.append(icon("image"), node("span", "", "尚未绑定图片"));
      card.append(copy, preview);
      const targetAssetId = item.role === "first" ? shot.videoPlan?.firstFrameAssetId : item.role === "last" ? shot.videoPlan?.lastFrameAssetId : null;
      card.append(button(`复制${item.title}制作指令`, () => actions.onCopy(prompt(snapshot.document, null, shot,
        `请按本镜设定制作${item.title}。先用 get_workflow_status 检查制作计划；用实际可用的图片工具生成到工作区 bone-media/，再 register_media。${targetAssetId ? `将图片 adopt_media 到 assetId: ${targetAssetId}；若资产已锁定先保留现状并说明。` : "将图片 adopt_media 到当前镜头 image 输出，携带当前 expectedShotRevision。"}`)), "bw-text-button"));
      gallery.append(card);
    }
    image.append(gallery, node("p", "bw-note", "这里展示制作计划指定的帧资产。本次生成使用的图片仍以各字段中的 @ 绑定为准，不会自动替换引用。"));
    return image;
  }

  function narrativeContext(snapshot, context, actions) {
    const { shot, group } = context, doc = snapshot.document;
    const panel = node("section", "bw-panel bw-narrative-context"); panel.setAttribute("aria-label", "叙事与衔接");
    const edit = button("复制计划修改指令", () => actions.onCopy(prompt(doc, group, shot,
      "请先读 get_workflow_status，核对本镜 videoPlan、continuityPlan 与 productionPlan，并核对 generationSettings.operation 的本次请求形式。只修改我指定的计划字段，用 update_shot 带 expectedShotRevision 保存；保留正文引用、音乐和无关字段。")));
    panel.append(heading("叙事与衔接", edit));
    const fields = node("div", "bw-context-grid");
    if (shot.videoPlan) {
      const modes = { "text-to-video":"文生视频", "image-to-video":"采用画面驱动", "first-last-frame":"首尾帧驱动" };
      const transitions = { "hard-cut":"硬切", "match-cut":"匹配剪辑", dissolve:"叠化" };
      fields.append(field("视频制作策略", modes[shot.videoPlan.mode] || shot.videoPlan.mode), field("策略依据", shot.videoPlan.rationale), field("入场转场计划", transitions[shot.videoPlan.transitionIn] || shot.videoPlan.transitionIn));
    }
    if (shot.continuityPlan) {
      const plan = shot.continuityPlan;
      const audio = { "hard-cut":"直接切换", "carry-over":"声音延续", prelap:"声音先入", "dialogue-carry":"对白跨镜" };
      fields.append(field("入场状态", plan.entryState), field("出场状态", plan.exitState), field("衔接依据", plan.rationale), field("声音衔接计划", audio[plan.audioTransition] || plan.audioTransition));
      for (const anchor of list(plan.anchors)) {
        const asset = list(doc.assets).find(item => item.id === anchor.assetId);
        fields.append(field(`连续性锚点 · ${anchor.phase}`, `${anchor.state}${asset ? ` · ${asset.name}` : ""}`));
      }
    }
    const beat = list(group?.episode?.script?.beats).find(item => list(item.shotIds).includes(shot.id));
    const mapping = node("section", "bw-field");
    mapping.append(node("h4", "", "所属脚本节拍"));
    if (beat) mapping.append(button(beat.title || beat.id, () => actions.onBeat(beat.id), "bw-text-button"));
    else mapping.append(node("p", "", "尚未映射到脚本节拍"));
    fields.append(mapping);
    panel.append(fields);
    const assets = node("section", "bw-assets");
    const draft = globalThis.FilmShotAuthoring.fromShot(shot, doc);
    const assetIds = [...new Set([...list(shot.assetIds), ...globalThis.FilmShotAuthoring.FIELDS.flatMap(key => list(draft[key]?.nodes).filter(item => item.type === "reference").map(item => item.assetId))])];
    assets.append(heading("引用资产", node("span", "vp-muted", `${assetIds.length} 项`)));
    const links = node("div", "bw-asset-links");
    for (const id of assetIds) {
      const asset = list(doc.assets).find(item => item.id === id);
      const link = button(asset ? `${asset.name || id}${asset.locked ? " · 已锁定" : ""}` : "资产不可用", () => actions.onAsset(asset), "vp-button");
      link.disabled = !asset;
      link.title = asset?.description || id;
      links.append(link);
    }
    assets.append(links);
    if (!assetIds.length) assets.append(node("p", "bw-note", "尚未引用资产"));
    panel.append(assets);
    panel.append(button("复制镜头 ID", () => actions.onCopy(shot.id), "bw-text-button"));
    return panel;
  }


  function render(snapshot, context, actions) {
    return globalThis.BoneStoryboardSurface.render(snapshot, context, actions,
      { outputs, references, icon, seconds, empty, prompt, inputContext, framePlan, narrativeContext });
  }
  function beginRender() { globalThis.BoneStoryboardControls?.beginRender(); }

  globalThis.BoneStoryboard = Object.freeze({ selection, outputs, references, render, beginRender });
})();
