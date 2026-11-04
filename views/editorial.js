/* Read-only production planning, source selection and review surfaces. */
(() => {
  "use strict";
  const list = v => Array.isArray(v) ? v : [];
  const sec = v => Number.isFinite(v) ? `${Math.round(v * 1000) / 1000}s` : "未设置";
  const verdicts = { supported: "有证据支持", "needs-revision": "需修改", "not-verified": "未验证" };
  const categories = { text: "文本", technical: "技术", visual: "画面", audio: "声音", continuity: "连续性" };
  function node(tag, cls, text) { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function button(text, action) { const e = node("button", "vp-button", text); e.type = "button"; e.addEventListener("click", action); return e; }
  function field(label, value) { const e = node("div", "bw-editorial-field"); e.append(node("span", "vp-muted", label), node("p", "", value || "未设置")); return e; }
  function section(title, summary) {
    const e = node("section", "bw-panel bw-editorial-section"), head = node("header", "bw-section-heading"); e.setAttribute("aria-label", title);
    head.append(node("h3", "", title)); if (summary) head.append(node("span", "bw-hint", summary)); e.append(head); return e;
  }
  function copy(actions, doc, task) {
    actions.onCopy(`Bone 作品 ${doc.id}《${doc.title}》，页面修订 ${doc.revision}。先 get_production 与 get_workflow_status 回读最新状态，写入时使用最新 expectedProductionRevision，镜头修改使用 expectedShotRevision。${task} 若任务是审核，仅保存 record_review，不修改项目、正文、节拍、资产或镜头；修改建议不自动授权改写。需要修订时按用户范围另存 save_revision_plan，明确授权后才应用。保留无关已定稿内容；缺少证据标未验证，不把工具成功当成质量通过。`);
  }
  function reviewList(records) {
    const box = node("div", "bw-review-list");
    const current = list(records).filter(r => !r.superseded);
    if (!current.length) box.append(node("p", "bw-note", "尚无审核记录；保存或采用不代表审核通过。"));
    for (const r of current) {
      const row = node("div", "bw-review-entry");
      row.append(node("strong", "", `${categories[r.category] || r.category} · ${r.current ? (verdicts[r.verdict] || r.verdict) : "依据已变更 · 需复核"}`), node("p", "", r.findings || ""));
      if (r.nextAction) row.append(node("p", "vp-muted", `下一步：${r.nextAction}`));
      for (const evidence of list(r.evidence)) row.append(node("p", "bw-evidence", `${evidence.mediaId || "文本依据"}${Number.isFinite(evidence.startSeconds) ? ` · ${sec(evidence.startSeconds)}–${sec(evidence.endSeconds)}` : ""} · ${evidence.note || ""}`));
      box.append(row);
    }
    return box;
  }
  function planning(doc, shot, actions, budgetControl) {
    const plan = shot.productionPlan;
    const box = section("制作约束", plan ? "已保存计划" : "待补充计划");
    const metrics = node("div", "bw-editorial-metrics"), budget = field("成片预算", sec(shot.duration));
    if (budgetControl) budget.querySelector("p").replaceChildren(budgetControl);
    metrics.append(budget, field("计划源片长度", sec(plan?.generationDurationSeconds)), field("片头留量", sec(plan?.headHandleSeconds)), field("片尾留量", sec(plan?.tailHandleSeconds)));
    box.append(metrics, node("p", "bw-note", "成片预算用于剪辑；计划源片长度是明确申请的生成长度。实际时长以素材测量为准，不由预算推算。"));
    if (plan) {
      const grid = node("div", "bw-context-grid"); grid.append(field("来源场次", plan.sourceScene), field("叙事目的", plan.purpose)); box.append(grid);
      box.append(node("h4", "bw-subheading", "必须保留的事件"));
      const events = node("ul", "bw-required-events"); for (const event of list(plan.requiredEvents)) events.append(node("li", "", event)); box.append(events);
      box.append(field("变速限制", { allowed:"允许，需实际复验", "silent-only":"仅关闭源音频时允许", forbidden:"禁止变速" }[plan.retimePolicy]), field("剪辑说明", plan.editingNotes));
    }
    box.append(button("复制制作计划指令", () => copy(actions, doc, `为镜头 ${shot.id} 补充或核对 productionPlan：sourceScene、purpose、requiredEvents、generationDurationSeconds、headHandleSeconds、tailHandleSeconds、retimePolicy 和 editingNotes。duration 是成片预算，不能改成生成长度；按实际模型能力给完整动作与前后留量。使用 update_shot 保存完整 productionPlan，不自动调用生成服务。`)));
    return box;
  }
  function mediaGroups(snapshot, shot, slots) {
    const ids = new Set([...Object.values(shot.outputs || {}), shot.mediaId].filter(Boolean));
    for (const slot of slots) for (const candidate of slot.candidates) {
      const proposed = list(candidate.draft?.shots).find(item => item.id === shot.id);
      const id = proposed?.outputs?.[slot.kind] || proposed?.mediaId;
      if (id) ids.add(id);
    }
    const local = list(snapshot.media).filter(media => media.shotId === shot.id || ids.has(media.id));
    const shared = list(snapshot.media).filter(media => !media.shotId && !ids.has(media.id));
    return { local, shared };
  }
  function materials(snapshot, doc, shot, slots, actions) {
    const groups = mediaGroups(snapshot, shot, slots);
    const box = section("输出与源素材", `本镜关联 ${groups.local.length} 项`);
    const outputs = node("div", "bw-output-list");
    for (const slot of slots) {
      const row = node("div", "bw-output-row"); row.append(node("strong", "", slot.name), node("span", "bw-status", slot.status === "未生成" ? "待采用输出" : slot.status));
      if (slot.adopted) row.append(node("span", "bw-output-title", slot.adopted.title || slot.adopted.id)); outputs.append(row);
      if (slot.candidates.length) {
        const proposals = section(`${slot.name}候选方案`, `${slot.candidates.length} 项`);
        for (const candidate of slot.candidates) proposals.append(node("p", "bw-note", candidate.summary || candidate.id));
        outputs.append(proposals);
      }
    }
    box.append(outputs); const sourceGrid = node("div", "bw-source-grid");
    if (!groups.local.length) box.append(node("p", "bw-note", "本镜尚无关联输出或源素材。资产参考图片不计入本镜候选。"));
    const primary = slots.find(slot => slot.kind === (doc.kind === "image" ? "image" : "video"))?.adopted?.id;
    function sourceItem(media) {
      const item = node("article", "bw-source-item"); item.dataset.mediaId = media.id;
      const stale = media.shotRevision !== undefined && media.shotRevision !== snapshot.shotStates?.[media.shotId]?.revision;
      const inspection = snapshot.mediaInspections?.[media.id];
      const kind = { image:"图片", video:"视频", audio:"音频" }[media.kind] || media.kind;
      const state = slots.some(slot => slot.adopted?.id === media.id) ? "本镜已采用" : list(doc.assets).some(asset => asset.mediaId === media.id) ? "资产已采用" : list(doc.assets).some(asset => list(asset.referenceMediaIds).includes(media.id)) ? "资产关联图片" : "已登记 · 本镜未采用";
      const head = node("header", "bw-source-heading"); head.append(node("h4", "", media.title || media.id), node("span", "bw-status", `${kind} · ${state}${stale ? " · 来源已过期" : ""}`));
      item.append(head, node("p", "bw-evidence", media.id));
      if (media.kind !== "image") item.append(field("已报告素材时长", inspection ? sec(inspection.durationSeconds) : "未测量"));
      if (inspection) {
        item.append(field("测量方法与发现", `${inspection.method} · ${inspection.findings}`));
        for (const range of list(inspection.usableRanges)) item.append(node("p", "bw-note", `报告的可用区间 ${sec(range.inSeconds)}–${sec(range.outSeconds)} · ${range.note}`));
      }
      let measuredDuration = null;
      if (media.id === primary) item.append(node("p", "bw-note", "当前采用的主输出已在上方镜头预览中展示。"));
      else {
        const preview = node("div", "bw-source-preview"), measured = node("p", "bw-note");
        preview.addEventListener("loadedmetadata", event => {
          if (Number.isFinite(event.target.duration)) { measuredDuration = event.target.duration; measured.textContent = `浏览器实际测时：${sec(measuredDuration)}（仅技术元数据）`; }
        }, true);
        const view = button("查看实际素材", () => { if (!preview.childElementCount) preview.append(actions.preview(media, { title:media.title || media.id, zoom:false })); });
        if (media.kind === "audio" && slots.some(slot => slot.adopted?.id === media.id)) preview.append(actions.preview(media, { title:"本镜独立音频", zoom:false }));
        else item.append(view);
        item.append(preview, measured);
      }
      if (media.kind !== "image") item.append(button("复制测时与标注指令", () => copy(actions, doc,
        `为媒体 ${media.id}（sha256: ${media.sha256 || "请回读"}）记录 record_media_inspection。${measuredDuration === null ? "先用实际文件测量 durationSeconds。" : `本页浏览器读取 durationSeconds=${measuredDuration}，method 可写 browser-metadata；这仅证明报告的测时，不证明观看或听验。`} findings 说明检查范围；usableRanges 仅填真实看验后的可用区间，未检查时传空数组。不得猜测事件时间点。`)));
      item.append(button("复制采用指令", () => copy(actions, doc, `核对媒体 ${media.id} 与镜头 ${shot.id} 的设定、版本和实际内容。${stale ? "本素材来源镜头已更新，先检查差异，不要强行采用。" : "适用且获授权时，用 adopt_media 仅指定 shotId、mediaId 和当前 expectedShotRevision，assetId 省略或 null；保留其他输出槽。"}`)));
      return item;
    }
    for (const media of groups.local) sourceGrid.append(sourceItem(media)); box.append(sourceGrid);
    if (groups.shared.length) {
      const shared = section("共享素材", `${groups.shared.length} 项 · 未计入本镜输出`);
      shared.append(node("p", "bw-note", "包括资产参考图片及其他共享文件；登记或引用不等于已生成本镜影片。"));
      const grid = node("div", "bw-source-grid"); groups.shared.forEach(media => grid.append(sourceItem(media))); shared.append(grid); box.append(shared);
    }
    return box;
  }
  function editing(snapshot, doc, episode, editorial, actions) {
    const summary = list(editorial?.episodes).find(e => e.episodeId === episode.id);
    const plan = summary?.editPlan;
    const box = section("剪辑选段与声音轨", plan ? `方案 v${plan.revision} · ${plan.stale ? "依据已变化" : sec(plan.durationSeconds)}` : "尚无剪辑方案");
    box.append(node("p", "bw-note", "以下片段和声音轨属于当前剧集；选段不修改源文件，也不替代镜头输出。"));
    box.append(button("复制剪辑方案指令", () => copy(actions, doc,
      `为本集 ${episode.id} 编写 save_edit_plan，expectedEditRevision 当前 ${plan?.revision || 0}。按正文与节拍选用真实登记视频，clips 每项给稳定 clipId、shotId、mediaId、inSeconds、outSeconds、speed、includeSourceAudio、note。每个源片先 record_media_inspection，使用真实测时与可用区间；不把整个源片时长直接求和为成片。audioTracks 分别给 trackId、mediaId、role、startSeconds、inSeconds、outSeconds、gain、note；声音跨切点用独立轨的实际时间表达。cutNotes 指向相邻 fromClipId/toClipId，说明 visual/audio 衔接；文字说明不会自动生成特效。先保留必要动作和对白，再检查总剪辑占时与目标，不自动导出。`)));
    if (!plan) { box.append(node("p", "bw-note", "尚未保存本集剪辑方案。先准备并测量真实素材，再确定选段、声音轨与切点。")); return box; }
    const metrics = node("div", "bw-editorial-metrics");
    metrics.append(field("本集目标", sec(summary.targetSeconds)), field("分镜预算", sec(summary.budgetSeconds)), field("选段合计", sec(plan.durationSeconds)));
    box.append(metrics);
    for (const issue of list(plan.issues)) box.append(node("p", "bw-editorial-warning", issue));
    const clips = list(plan.clips); let from = 0, to = Math.min(1, clips.length - 1);
    const rangeLabel = node("p", "bw-note"); const previewHost = node("div", "bw-edit-preview-host");
    function labelRange() { rangeLabel.textContent = `预览范围：片段 ${from + 1}–${to + 1} · 每次最多 8 段`; }
    const rows = node("div", "bw-edit-clips");
    clips.forEach((clip, index) => {
      const row = node("div", "bw-edit-clip");
      const shot = list(doc.shots).find(s => s.id === clip.shotId);
      row.append(node("strong", "", `${index + 1}. ${shot?.title || clip.shotId}`),
        node("p", "bw-evidence", `${clip.clipId} · ${clip.mediaId}`),
        node("p", "", `${sec(clip.inSeconds)}–${sec(clip.outSeconds)} · ${clip.speed}× → ${sec((clip.outSeconds - clip.inSeconds) / clip.speed)} · ${clip.includeSourceAudio ? "保留源音频" : "源音频静音"}`));
      row.append(button("设为起点", () => { from = index; if (to < from) to = from; labelRange(); }), button("设为终点", () => { to = index; if (from > to) from = to; labelRange(); })); rows.append(row);
    });
    box.append(rows);
    for (const track of list(plan.audioTracks)) box.append(node("p", "bw-note", `声音轨 ${track.trackId} · ${track.role} · 时间线 ${sec(track.startSeconds)} 起 · 源 ${sec(track.inSeconds)}–${sec(track.outSeconds)} · 音量 ${track.gain}`));
    labelRange();
    const start = button("预览选中段落", () => {
      window.BoneSequencePreview.beginRender();
      for (const player of document.querySelectorAll("video, audio")) player.pause();
      previewHost.replaceChildren(window.BoneSequencePreview.create({ productionId: doc.id, plan, media: snapshot.media, from, to, load: actions.loadMedia }));
    }); start.disabled = Boolean(plan.stale);
    box.append(rangeLabel, start, previewHost);
    const cuts = section("相邻切点评审", `${Math.max(0, clips.length - 1)} 个连接`);
    for (let i = 1; i < clips.length; i++) {
      const left = clips[i - 1], right = clips[i];
      const note = list(plan.cutNotes).find(n => n.fromClipId === left.clipId && n.toClipId === right.clipId);
      const row = node("div", "bw-cut-entry");
      row.append(node("strong", "", `${i} → ${i + 1} · ${left.clipId} → ${right.clipId}`), field("画面连接", note?.visual), field("声音连接", note?.audio));
      const reviews = list(editorial.reviews).filter(r => r.scope?.kind === "cut" && r.scope.episodeId === episode.id && r.scope.fromClipId === left.clipId && r.scope.toClipId === right.clipId);
      row.append(reviewList(reviews), button("复制切点评审指令", () => copy(actions, doc,
        `审核本集 ${episode.id} 剪辑方案中 ${left.clipId} → ${right.clipId} 的切点。核对采用出点/入点的动作相位、角色视线、道具承重、光源与声音。分别报告文本判断与实际素材观察，用 record_review，scope={kind:"cut",episodeId:"${episode.id}",fromClipId:"${left.clipId}",toClipId:"${right.clipId}"}，category=continuity。evidence 必须关联两侧真实素材及采用区间；没有观看证据填 not-verified。`)), button("预览这两段", () => { from = i - 1; to = i; labelRange(); if (!start.disabled) start.click(); }));
      cuts.append(row);
    }
    box.append(cuts, button("复制整段审核指令", () => copy(actions, doc, `用 record_review 审核本集 ${episode.id} 已保存剪辑方案，scope.kind=sequence。分别检查 technical、visual、audio、continuity；完整实际观看或听验后提交相应 evidence 区间。范围不足或无证据必须 not-verified，不能称为最终成片通过。`)));
    return box;
  }
  function shotReview(doc, editorial, shot, actions) {
    const review = section("本镜质量审核", "文本 / 技术 / 画面 / 声音 / 连续性"); review.classList.add("bw-shot-review");
    review.append(reviewList(list(editorial?.reviews).filter(r => r.scope?.kind === "shot" && r.scope.shotId === shot.id)), button("复制镜头审核指令", () => copy(actions, doc,
      `审核镜头 ${shot.id}：核对正文、节拍和 productionPlan 的必保留事件，再检查真实素材。用 record_review，scope={kind:"shot",shotId:"${shot.id}"}，category 区分 text/technical/visual/audio/continuity。非文本 supported 必须关联真实媒体与检查区间；未看未听填 not-verified。`))); return review;
  }
  function renderEpisode(snapshot, editorial, episode, actions) {
    const doc = snapshot.document, wrap = node("section", "bw-episode-workbench"); wrap.setAttribute("aria-label", "本集剪辑与审核");
    if (!episode) return wrap;
    const head = node("header", "bw-episode-heading"), title = node("h2", "", "本集剪辑与审核"); title.tabIndex = -1;
    head.append(title, node("span", "bw-hint", `当前剧集 · ${episode.title || episode.id}`)); wrap.append(head);
    const content = node("div", "bw-editorial bw-episode-editorial");
    content.append(editing(snapshot, doc, episode, editorial || {}, actions));
    const review = section("本集文本与整段审核", "剧集级记录");
    review.append(reviewList(list(editorial?.reviews).filter(r => ["episode", "sequence"].includes(r.scope?.kind) && r.scope.episodeId === episode.id)),
      button("复制本集文本评审指令", () => copy(actions, doc, `对本集 ${episode.id} 完整正文与节拍、分镜做因果、时长和连续性检查。record_review scope={kind:"episode",episodeId:"${episode.id}"},category=text；findings 定位到场次/镜头。不把字段填齐当作定稿。`)));
    content.append(review); wrap.append(content); return wrap;
  }
  globalThis.BoneEditorial = Object.freeze({ materials, planning, shotReview, renderEpisode, mediaGroups });
})();
