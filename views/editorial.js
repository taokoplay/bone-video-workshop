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
  function section(title, summary, open = false) {
    const e = node("details", "bw-panel bw-editorial-section"); e.open = open;
    e.append(node("summary", "", `${title}${summary ? " · " + summary : ""}`)); return e;
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
  function planning(doc, shot, actions) {
    const plan = shot.productionPlan;
    const box = section("制作计划与剪辑空间", plan ? "已记录计划，尚需素材核验" : "待补充", true);
    const metrics = node("div", "bw-editorial-metrics");
    metrics.append(field("成片预算", sec(shot.duration)), field("计划生成", sec(plan?.generationDurationSeconds)),
      field("预留头 / 尾", plan ? `${sec(plan.headHandleSeconds)} / ${sec(plan.tailHandleSeconds)}` : "未设置"));
    box.append(metrics);
    if (plan) {
      box.append(field("来源场次 · 叙事任务", `${plan.sourceScene} · ${plan.purpose}`));
      const events = node("ul", "bw-required-events"); for (const event of list(plan.requiredEvents)) events.append(node("li", "", event)); box.append(events);
      box.append(field("变速限制", { allowed: "允许尝试变速，需实际复验", "silent-only": "仅关闭源音频时允许变速", forbidden: "禁止变速" }[plan.retimePolicy]), field("剪辑说明", plan.editingNotes));
    }
    box.append(button("复制制作计划指令", () => copy(actions, doc, `为镜头 ${shot.id} 补充或核对 productionPlan：来源场次 sourceScene、purpose、必保留 requiredEvents、generationDurationSeconds、headHandleSeconds、tailHandleSeconds、retimePolicy 和 editingNotes。duration 是成片预算，不能改成生成长度；按实际模型能力给完整动作与前后留量。使用 update_shot 保存完整 productionPlan，不自动调用生成服务。`)));
    return box;
  }
  function candidates(snapshot, doc, shot, actions) {
    const candidates = list(snapshot.media).filter(m => !m.shotId || m.shotId === shot.id);
    const box = section("源素材与候选", `${candidates.length} 项`);
    box.append(node("p", "bw-note", "登记与采用分离。无镜头归属的素材为共享素材；报告测时不等于完成观看或听验。"));
    if (!candidates.length) box.append(node("p", "bw-note", "尚无已登记素材。先制作或导入真实文件，再登记与检查。"));
    for (const media of candidates) {
      const item = node("details", "bw-source-item");
      const stale = media.shotRevision !== undefined && media.shotRevision !== snapshot.shotStates?.[shot.id]?.revision;
      const inspection = snapshot.mediaInspections?.[media.id];
      item.append(node("summary", "", `${media.title || media.id} · ${media.kind}${stale ? " · 旧镜头版本" : ""}`), node("p", "bw-evidence", `${media.id} · ${media.sha256 || "旧版未记录校验值"}`));
      item.append(field("报告的源片长度", inspection ? sec(inspection.durationSeconds) : "未测量；不能用生成计划代替"));
      if (inspection) {
        item.append(field("测量方法与发现", `${inspection.method} · ${inspection.findings}`));
        for (const range of list(inspection.usableRanges)) item.append(node("p", "bw-note", `报告的可用区间 ${sec(range.inSeconds)}–${sec(range.outSeconds)} · ${range.note}`));
      }
      const preview = node("div", "bw-source-preview");
      const measured = node("p", "bw-note");
      let measuredDuration = null;
      preview.addEventListener("loadedmetadata", event => {
        if (Number.isFinite(event.target.duration)) { measuredDuration = event.target.duration; measured.textContent = `浏览器实际测时：${sec(measuredDuration)}（仅技术元数据）`; }
      }, true);
      const view = button("查看实际素材", () => {
        if (!preview.childElementCount) preview.append(actions.preview(media, { title: media.title || media.id, zoom: false }));
      });
      item.append(view, preview, measured);
      if (media.kind !== "image") item.append(button("复制测时与标注指令", () => copy(actions, doc,
        `为媒体 ${media.id}（sha256: ${media.sha256 || "请回读"}）记录 record_media_inspection。${measuredDuration === null ? "先用实际文件测量 durationSeconds。" : `本页浏览器读取 durationSeconds=${measuredDuration}，method 可写 browser-metadata；这仅证明报告的测时，不证明观看或听验。`} findings 说明检查范围；usableRanges 仅填真实看验后的可用区间，未检查时传空数组。不得猜测事件时间点。`)));
      item.append(button("复制采用指令", () => copy(actions, doc, `核对媒体 ${media.id} 与镜头 ${shot.id} 的设定、版本和实际内容。${stale ? "本素材属于旧镜头修订，先检查差异，不要强行采用。" : "适用且获授权时，用 adopt_media 仅指定 shotId、mediaId 和当前 expectedShotRevision，assetId 省略或 null；保留其他输出槽。"}`)));
      box.append(item);
    }
    return box;
  }
  function editing(snapshot, doc, episode, editorial, actions) {
    const summary = list(editorial?.episodes).find(e => e.episodeId === episode.id);
    const plan = summary?.editPlan;
    const box = section("剪辑方案与衔接", plan ? `v${plan.revision} · ${plan.stale ? "依据变更，需复核" : sec(plan.durationSeconds)}` : "未保存");
    box.append(node("p", "bw-note", "采用区间不改动源文件，也不会替代镜头输出。先记录真实媒体测量，再通过 Agent 保存剪辑方案。"));
    box.append(button("复制剪辑方案指令", () => copy(actions, doc,
      `为本集 ${episode.id} 编写 save_edit_plan，expectedEditRevision 当前 ${plan?.revision || 0}。按正文与节拍选用真实登记视频，clips 每项给稳定 clipId、shotId、mediaId、inSeconds、outSeconds、speed、includeSourceAudio、note。每个源片先 record_media_inspection，使用真实测时与可用区间；不把整个源片时长直接求和为成片。audioTracks 分别给 trackId、mediaId、role、startSeconds、inSeconds、outSeconds、gain、note；声音跨切点用独立轨的实际时间表达。cutNotes 指向相邻 fromClipId/toClipId，说明 visual/audio 衔接；文字说明不会自动生成特效。先保留必要动作和对白，再检查总剪辑占时与目标，不自动导出。`)));
    if (!plan) { box.append(node("p", "bw-note", "支持同一素材多次选段、恒定变速、独立声音轨和相邻片段预览；尚无方案时不虚构时间线。")); return box; }
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
  function render(snapshot, editorial, context, actions) {
    const doc = snapshot.document, shot = context.shot, episode = context.group?.episode;
    const wrap = node("div", "bw-editorial"); wrap.setAttribute("aria-label", "制作与剪辑");
    if (shot) {
      wrap.append(planning(doc, shot, actions), candidates(snapshot, doc, shot, actions));
      const review = section("当前镜头审核", "独立于保存和采用");
      review.append(reviewList(list(editorial?.reviews).filter(r => r.scope?.kind === "shot" && r.scope.shotId === shot.id)), button("复制镜头审核指令", () => copy(actions, doc,
        `审核镜头 ${shot.id}：先按正文/节拍/productionPlan 核对必保留事件，再分别检验真实素材的技术、画面与声音。使用 record_review，scope={kind:"shot",shotId:"${shot.id}"}，category 区分 text/technical/visual/audio/continuity；findings 写定位依据，nextAction 写最小修正。非文本 supported 必须提供真实关联媒体和已检查时间范围，未看未听则 not-verified。`)));
      wrap.append(review);
    }
    if (episode) {
      wrap.append(editing(snapshot, doc, episode, editorial || {}, actions));
      const review = section("本集文本与整段审核", "依据改变需复核");
      review.append(reviewList(list(editorial?.reviews).filter(r => ["episode", "sequence"].includes(r.scope?.kind) && r.scope.episodeId === episode.id)),
        button("复制本集文本评审指令", () => copy(actions, doc, `对本集 ${episode.id} 完整正文与所有节拍、分镜做因果、时长和连续性检查。record_review scope={kind:"episode",episodeId:"${episode.id}"},category=text；findings 定位到场次/镜头，指出依据及下一步。不把字段填写齐全当成生产定稿。`)));
      wrap.append(review);
    }
    return wrap;
  }
  globalThis.BoneEditorial = Object.freeze({ render });
})();
