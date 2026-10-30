/* Read-only storyboard presentation. No host calls, file access or persistence. */
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
    element.addEventListener("click", action);
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
    return [`请用 get_production 读取 Bone 影视工厂作品 ${doc.id}《${doc.title || doc.id}》。`,
      group ? `当前集：${group.title}（episodeId: ${group.id || "未归属"}）。` : "当前还没有剧集。",
      shot ? `当前镜头：${shot.title || shot.id}（shotId: ${shot.id}）。` : "",
      action, "保留其他已定稿内容，不要删除作品或覆盖无关镜头。"].filter(Boolean).join("\n");
  }

  function episodePicker(context, onEpisode) {
    const picker = node("details", "bw-episode-picker");
    const trigger = node("summary", "vp-button", context.group?.title || "尚无集数");
    trigger.setAttribute("aria-label", "当前集数");
    trigger.append(node("span", "", "⌄"));
    const menu = node("div", "bw-episode-options");
    for (const group of context.groups) {
      const option = button(group.title, () => onEpisode(group.id), "bw-episode-option");
      option.setAttribute("aria-current", String(group.id === context.group?.id));
      menu.append(option);
    }
    if (!context.groups.length) menu.append(node("p", "vp-muted", "先让 Agent 建立剧集和脚本节拍"));
    picker.append(trigger, menu);
    picker.addEventListener("keydown", event => {
      if (event.key === "Escape") { picker.open = false; trigger.focus(); }
    });
    picker.addEventListener("focusout", event => {
      if (!picker.contains(event.relatedTarget)) picker.open = false;
    });
    return picker;
  }

  function filmPanel(snapshot, shot, slots, actions) {
    const video = slots.find(slot => slot.kind === "video");
    const panel = node("section", "bw-film");
    panel.setAttribute("aria-label", "影片主窗口");
    panel.append(heading(snapshot.document.kind === "image" ? "画面 · 主预览" : "影片 · 主预览", node("span", "bw-status", snapshot.document.kind === "image" ? slots[1].status : video.status)));
    if (shot.videoPlan) {
      const modes = { "text-to-video": "文生视频", "image-to-video": "当前画面驱动", "first-last-frame": "首尾帧驱动" };
      panel.append(field("生成设计", `${modes[shot.videoPlan.mode] || shot.videoPlan.mode || "未设置"}${shot.videoPlan.rationale ? " · " + shot.videoPlan.rationale : ""}`));
    }
    const stage = node("div", "bw-film-stage");
    const meta = node("div", "bw-film-meta");
    meta.append(node("span", "", `${snapshot.document.ratio || "16:9"} · ${snapshot.document.fps || 24} FPS`), node("span", "", `成片预算 ${seconds(shot.duration)}`));
    const slot = snapshot.document.kind === "image" ? slots[1] : video;
    stage.append(meta);
    if (slot.adopted) stage.append(actions.preview(slot.adopted, { title: shot.title || slot.name, zoom: slot.kind === "image" }));
    else stage.append(empty(slot.missing ? `${slot.name}素材记录缺失` : `本镜${slot.name}尚未生成`, "先确认镜头设定，再制作、登记并采用本镜素材", slot.kind === "image" ? "image" : "film"));
    panel.append(stage);
    const candidates = node("details", "bw-candidates");
    candidates.append(node("summary", "", `${slot.name}候选 · ${slot.candidates.length}`));
    if (!slot.candidates.length) candidates.append(node("p", "vp-muted", `暂无可用${slot.name}候选`));
    for (const candidate of slot.candidates) candidates.append(node("p", "", candidate.summary || candidate.id));
    panel.append(candidates);
    return panel;
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

  function supportPanels(snapshot, shot, slots, actions) {
    const support = node("div", "bw-support-grid");
    const image = node("section", "bw-panel bw-image-reference");
    const items = references(snapshot, shot);
    image.append(heading("画面参考", node("span", "bw-status", `${items.length} 项`)));
    const gallery = node("div", "bw-reference-gallery");
    gallery.setAttribute("aria-label", "生成帧与画面引用");
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
    const note = items.some(item => item.role === "last")
      ? "首帧与尾帧分别作为镜头起止画面，与影片独立管理。"
      : "用于构图、关键帧和视觉参考，与影片独立管理。";
    image.append(gallery, node("p", "bw-reference-note bw-note", note));
    const sound = node("section", "bw-panel");
    sound.append(heading("声音设计", node("span", "bw-status", slots[2].status)),
      field("对白 / 旁白", shot.dialogue), field("环境 / 音效", shot.soundDesign?.effects), field("配乐", shot.soundDesign?.music));
    if (snapshot.document.music && !shot.soundDesign?.music) sound.append(node("p", "bw-note", `作品配乐方向：${snapshot.document.music}`));
    if (slots[2].adopted) sound.append(actions.preview(slots[2].adopted, { title: "本镜独立音频" }));
    support.append(image, sound);
    return support;
  }

  function inspector(snapshot, context, slots, actions) {
    const { shot, group } = context;
    const doc = snapshot.document;
    const panel = node("section", "bw-panel bw-inspector");
    panel.setAttribute("aria-label", "镜头设定");
    const edit = button("复制修改指令", () => actions.onCopy(prompt(doc, group, shot,
      "请先读 get_workflow_status，结合我的要求完善本镜画面、运镜、对白、时长、videoPlan（含首尾帧）、soundDesign 和 continuityPlan，再用 update_shot 带 expectedShotRevision 更新。已有计划只改需要的部分，嵌套对象要保留其他字段。")));
    panel.append(heading("镜头设定", edit));
    const fields = node("div", "bw-inspector-fields");
    fields.append(field("画面描述", shot.scene), field("运镜与表演", shot.motion), field("对白", shot.dialogue));
    if (shot.continuityPlan) fields.append(field("入场状态", shot.continuityPlan.entryState), field("出场状态", shot.continuityPlan.exitState));
    const beat = list(group?.episode?.script?.beats).find(item => list(item.shotIds).includes(shot.id));
    const mapping = node("section", "bw-field");
    mapping.append(node("h4", "", "所属脚本节拍"));
    if (beat) mapping.append(button(beat.title || beat.id, () => actions.onBeat(beat.id), "bw-text-button"));
    else mapping.append(node("p", "", "尚未映射到脚本节拍"));
    fields.append(mapping);
    panel.append(fields);
    const output = node("section", "bw-output-list");
    output.append(heading("本镜输出", node("span", "vp-muted", "独立确认")));
    for (const slot of slots) {
      const row = node("div", "bw-output-row");
      row.append(node("span", "", slot.name), node("span", "bw-status", slot.status));
      output.append(row);
    }
    output.append(node("p", "bw-note", "影片、画面和声音分别管理，静帧不会被标记为影片。"));
    panel.append(output);
    const assets = node("section", "bw-assets");
    assets.append(heading("引用资产", node("span", "vp-muted", `${list(shot.assetIds).length} 项`)));
    const links = node("div", "bw-asset-links");
    for (const id of list(shot.assetIds)) {
      const asset = list(doc.assets).find(item => item.id === id);
      const link = button(asset ? `${asset.name || id}${asset.locked ? " · 已锁定" : ""}` : "资产不可用", () => actions.onAsset(asset), "vp-button");
      link.disabled = !asset;
      link.title = asset?.description || id;
      links.append(link);
    }
    assets.append(links);
    if (!list(shot.assetIds).length) assets.append(node("p", "bw-note", "尚未引用资产"));
    panel.append(assets);
    const state = snapshot.shotStates?.[shot.id];
    const footer = node("div", "bw-inspector-footer");
    footer.append(node("span", "vp-muted", `设定 v${state?.revision ?? 0} · 输出 v${state?.outputVersion ?? 0}${state?.needsUpdate ? " · 待更新" : ""}`),
      button("复制镜头 ID", () => actions.onCopy(shot.id)));
    panel.append(footer);
    return panel;
  }

  function render(snapshot, context, actions) {
    const { document: doc } = snapshot;
    const { group, shots, shot } = context;
    const page = node("div", "bw-storyboard");
    page.setAttribute("aria-label", "分镜工作台");
    const toolbar = node("div", "bw-toolbar");
    toolbar.append(episodePicker(context, actions.onEpisode), node("span", "vp-muted", `${shots.length} 个镜头 · 预算 ${seconds(shots.reduce((sum, item) => sum + (Number(item.duration) || 0), 0))}`),
      button("复制新增指令", () => actions.onCopy(prompt(doc, group, null,
        "请先检查本集的脚本节拍；缺少节拍时先补齐，再用 add_shots 为本集拆分镜头，每个镜头必须带对应 beatId。"))));
    page.append(toolbar);
    const layout = node("div", "bw-layout");
    const sidebar = node("aside", "bw-sidebar");
    sidebar.setAttribute("aria-label", "镜头序列");
    sidebar.append(node("span", "bw-eyebrow", "STORYBOARD"), heading("镜头序列", node("span", "vp-muted", String(shots.length).padStart(2, "0"))));
    const strip = node("div", "bw-shot-list");
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "分镜序列");
    shots.forEach((item, index) => {
      const slots = outputs(snapshot, item);
      const status = snapshot.shotStates?.[item.id]?.needsUpdate ? "待更新" : slots[0].adopted ? "影片已采用" : slots[1].adopted ? "画面已采用" : "文字已保存";
      const card = button("", () => actions.onShot(item.id), "bw-shot");
      card.dataset.shotId = item.id;
      card.setAttribute("aria-pressed", String(shot?.id === item.id));
      card.setAttribute("aria-label", `镜头 ${index + 1}，${item.title || "未命名镜头"}，${seconds(item.duration)}，${status}`);
      const preview = node("div", "bw-thumbnail");
      if (slots[1].adopted) preview.append(actions.preview(slots[1].adopted, { title: item.title || "镜头画面" }));
      else preview.append(icon("film"));
      preview.append(node("span", "bw-shot-number", String(index + 1).padStart(2, "0")), node("span", "bw-shot-duration", seconds(item.duration)));
      card.append(preview, node("strong", "bw-shot-title", item.title || "未命名镜头"), node("span", "bw-status", status));
      strip.append(card);
    });
    if (!shots.length) strip.append(node("p", "bw-note", "本集尚无镜头"));
    sidebar.append(strip, node("p", "bw-sidebar-foot", "影片 · 画面 · 声音"));
    const main = node("div", "bw-main");
    if (!shot) {
      main.append(empty(group ? "这一集还没有分镜" : "先建立剧集和脚本", "让 Agent 按脚本节拍拆镜头，完成后刷新查看。"));
      if (group?.episode) main.append(button("查看本集脚本", () => actions.onBeat(null)));
    } else {
      const index = shots.indexOf(shot);
      const head = node("header", "bw-current-heading");
      const copy = node("div", "bw-current-copy");
      copy.append(node("span", "vp-muted", `当前镜头 · 成片预算 ${seconds(shot.duration)}`), node("h2", "", shot.title || "未命名镜头"));
      const navigation = node("nav", "bw-navigation");
      navigation.setAttribute("aria-label", "切换镜头");
      const previous = button("‹", () => actions.onShot(shots[index - 1].id));
      previous.setAttribute("aria-label", "上一镜头"); previous.disabled = index === 0;
      const next = button("›", () => actions.onShot(shots[index + 1].id));
      next.setAttribute("aria-label", "下一镜头"); next.disabled = index === shots.length - 1;
      navigation.append(previous, node("span", "vp-muted", `${index + 1} / ${shots.length}`), next);
      head.append(node("span", "bw-current-index", String(index + 1).padStart(2, "0")), copy, navigation);
      const slots = outputs(snapshot, shot);
      main.append(head, filmPanel(snapshot, shot, slots, actions), supportPanels(snapshot, shot, slots, actions));
      const footer = node("div", "bw-main-footer");
      footer.append(node("span", "vp-muted", `镜头 ${index + 1} / ${shots.length} · 影片、画面分别确认`),
        button("复制给 Agent", () => actions.onCopy(prompt(doc, group, shot, "先用 get_workflow_status 检查本镜缺口，依次完善计划、首尾帧素材和输出。实际生成后必须 register_media，再 adopt_media；若没有视频生成工具，请说明并支持导入已有影片，不要把静帧称为影片。"))));
      main.append(footer, inspector(snapshot, context, slots, actions));
    }
    if (globalThis.BoneEditorial) main.append(globalThis.BoneEditorial.render(snapshot, actions.editorial, context, actions));
    layout.append(sidebar, main); page.append(layout);
    return page;
  }

  globalThis.BoneStoryboard = Object.freeze({ selection, outputs, references, render });
})();
