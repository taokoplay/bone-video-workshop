"use strict";
const { editorialStatus } = require("./editorial-status.js");
const { revisionStatus } = require("./revision-status.js");

// Derive readiness from persisted facts; never invent generation jobs or progress.
function workflowStatus(snapshot) {
  const doc = snapshot.document;
  const issues = [];
  const episodes = doc.episodes || [];
  const shots = doc.shots || [];
  const assets = new Map((doc.assets || []).map(asset => [asset.id, asset]));
  const media = new Map((snapshot.media || []).map(item => [item.id, item]));
  const add = (stage, tool, message, context = {}) => issues.push({ stage, tool, message, ...context });
  const adopted = (shot, kind) => {
    const legacy = media.get(shot.mediaId);
    const id = shot.outputs?.[kind] ?? (!Object.prototype.hasOwnProperty.call(shot.outputs || {}, kind) && legacy?.kind === kind ? legacy.id : null);
    const item = media.get(id);
    return item?.kind === kind ? item : null;
  };
  if (!doc.brief?.trim()) add("brief", "update_production", "补充作品简介、受众与风格方向。");
  if (!episodes.length) add("story", "write_script", "先建立剧集并写连续的剧本正文 prose。");
  let beatsCount = 0;
  for (const ep of episodes) {
    const context = { episodeId: ep.id };
    if (!ep.script?.prose?.trim()) add("story", "write_script", "这一集缺少剧本正文 prose。", context);
    const beats = ep.script?.beats || [];
    beatsCount += beats.length;
    if (!beats.length) add("beats", "write_episodes", "把本集正文拆成有因果和视觉动作的脚本节拍。", context);
    for (const beat of beats) {
      if (!(beat.shotIds || []).some(id => shots.some(shot => shot.id === id && shot.episodeId === ep.id))) {
        add("shots", "add_shots", "这个节拍还没有分镜；新增时带上 episodeId 和 beatId。", { ...context, beatId: beat.id });
      }
    }
  }
  const summaries = [];
  for (const shot of shots) {
    const context = { episodeId: shot.episodeId, shotId: shot.id };
    const ep = episodes.find(item => item.id === shot.episodeId);
    const mapped = (ep?.script?.beats || []).filter(beat => (beat.shotIds || []).includes(shot.id));
    if (mapped.length !== 1) add("shots", "update_shot", "镜头需要映射到本集唯一节拍。", context);
    if (!shot.scene?.trim()) add("shots", "update_shot", "补充镜头画面描述。", context);
    if (doc.kind !== "image") {
      if (!shot.videoPlan) add("plans", "update_shot", "补充 videoPlan，选择文生视频、单帧或首尾帧驱动及依据。", context);
      if (!shot.continuityPlan) add("plans", "update_shot", "补充 continuityPlan 的入场、出场和声音接续。", context);
      if (!shot.soundDesign) add("plans", "update_shot", "补充 soundDesign；无音效或音乐时明确填写无。", context);
    }
    const plan = shot.videoPlan;
    const frames = [];
    if (plan && plan.mode !== "text-to-video") {
      const refs = [["first", plan.firstFrameAssetId]];
      if (plan.mode === "first-last-frame") refs.push(["last", plan.lastFrameAssetId]);
      for (const [role, assetId] of refs) {
        const asset = assets.get(assetId);
        const item = assetId ? media.get(asset?.mediaId) : adopted(shot, "image");
        const ready = item?.kind === "image" && (role !== "last" || Boolean(assetId));
        frames.push({ role, assetId: assetId || null, mediaId: ready ? item.id : null, ready });
        if (!ready) add("frames", "register_media", `${role === "first" ? "首帧" : "尾帧"}缺少已绑定图片；生成或导入图片后登记，再用 adopt_media 绑定。`, { ...context, assetId: assetId || null });
      }
    }
    const targetKind = doc.kind === "image" ? "image" : "video";
    const final = adopted(shot, targetKind);
    const state = snapshot.shotStates?.[shot.id];
    const outputRevision = state?.outputRevisions?.[targetKind];
    const needsUpdate = outputRevision === undefined ? Boolean(state?.needsUpdate) : outputRevision !== state?.revision;
    if (!final) add("outputs", "register_media", `缺少已采用${targetKind === "image" ? "画面" : "影片"}。用可用生成工具或已有文件制作后登记并采用。`, context);
    else if (needsUpdate) add("outputs", "adopt_media", "镜头设定已变更，需重做或核对当前结果后重新采用。", context);
    summaries.push({ ...context, title: shot.title, mappedBeatId: mapped.length === 1 ? mapped[0].id : null,
      frames, outputs: Object.fromEntries(["image", "video", "audio"].map(kind => [kind, adopted(shot, kind)?.id || null])),
      needsUpdate });
  }
  const stages = ["brief", "story", "beats", "shots", "plans", "frames", "outputs"];
  issues.sort((left, right) => stages.indexOf(left.stage) - stages.indexOf(right.stage));
  const editorial = editorialStatus(snapshot);
  const timingWarnings = editorial.episodes.filter(ep => ep.targetSeconds > 0 && Math.abs(ep.deltaSeconds) > 0.001)
    .map(ep => ({ episodeId: ep.episodeId, budgetSeconds: ep.budgetSeconds, targetSeconds: ep.targetSeconds, deltaSeconds: ep.deltaSeconds,
      message: `分镜预算 ${Number(ep.budgetSeconds.toFixed(3))} 秒，目标 ${ep.targetSeconds} 秒；偏差 ${Number(ep.deltaSeconds.toFixed(3))} 秒。生成源片长度不参与成片预算汇总。` }));
  const latest = editorial.reviews.filter(review => !review.superseded);
  const readiness = {
    text: { savedEpisodes: episodes.filter(ep => ep.script?.prose?.trim()).length, totalEpisodes: episodes.length,
      supportedEpisodes: episodes.filter(ep => latest.some(r => r.scope.kind === "episode" && r.scope.episodeId === ep.id && r.category === "text" && r.current && r.verdict === "supported")).length },
    planning: { plannedShots: shots.filter(shot => shot.productionPlan).length, totalShots: shots.length },
    media: { registered: media.size, adoptedPrimary: summaries.filter(shot => shot.outputs[doc.kind === "image" ? "image" : "video"]).length, totalShots: shots.length },
    editing: { savedEpisodes: editorial.episodes.filter(ep => ep.editPlan).length, currentEpisodes: editorial.episodes.filter(ep => ep.editPlan && !ep.editPlan.stale).length },
    review: editorial.reviewCounts,
  };
  return { id: doc.id, revision: doc.revision, complete: shots.length > 0 && issues.length === 0,
    counts: { episodes: episodes.length, beats: beatsCount, assets: assets.size, shots: shots.length, media: media.size },
    next: issues[0] || (shots.length ? { stage: "complete", message: "已登记的创作链完整；仍需人工观看检查成片质量。" } : { stage: "shots", tool: "add_shots", message: "按脚本节拍创建分镜。" }),
    issues, shots: summaries,
    revisions: revisionStatus(snapshot),
    editorial, readiness, timingWarnings, completionMeaning: "structural-output-links-only",
    generation: { images: "Use an available host image-generation tool, then register_media and adopt_media.", videos: "Use an explicitly available video tool or import an existing file; the plugin does not generate video itself." } };
}
function workflowTool(readSnapshot) {
  return { name: "get_workflow_status", risk: "low",
    description: "检查 Bone 影视工厂完整创作链：简介、分集正文、脚本节拍、分镜映射、视频/声音/衔接计划、首尾帧图片和最终输出。返回缺口、下一步工具和各镜头状态；开始/继续创作前与完成后都调用。",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    execute: async args => workflowStatus(await readSnapshot(args?.id)),
  };
}
module.exports = { workflowStatus, workflowTool };
