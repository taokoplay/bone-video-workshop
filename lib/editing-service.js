"use strict";

const { schemas, validate, requireValue } = require("./editing-schemas.js");
const { own, lookup, fingerprint, provenanceIssues, clipFingerprint, planFingerprint, planIssues, planDuration,
  selectedClips, selectedTracks, relatedMediaIds, reviewBasis, reviewIssues } = require("./editing-dependencies.js");
const EPSILON = 1e-7;
const MAX_REVIEWS = 2000;
const invalid = (ok, message) => requireValue(ok, "INVALID_ARGUMENT", message);
function mediaRecord(snapshot, mediaId, kind) {
  const media = lookup(snapshot.media, mediaId);
  requireValue(media, "NOT_FOUND", "已登记素材不存在");
  invalid(!kind || media.kind === kind, "素材类型不匹配");
  return media;
}
function inspectionFor(snapshot, mediaId) {
  const media = mediaRecord(snapshot, mediaId);
  const inspection = own(snapshot.mediaInspections, mediaId) ? snapshot.mediaInspections[mediaId] : null;
  invalid(inspection && inspection.sha256 === media.sha256 && Number.isFinite(inspection.durationSeconds) && inspection.durationSeconds > 0 && inspection.durationSeconds <= 86400,
    "素材缺少与当前字节匹配的 Agent 时长测量");
  return inspection;
}
function interval(start, end, duration) {
  invalid(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration, "源范围必须有效且不超过报告时长");
}
function provenance(snapshot, media, shotId) {
  requireValue(provenanceIssues(snapshot, media, shotId).length === 0, "CONFLICT", "素材对应其他镜头或旧镜头版本");
}
function audioProvenance(snapshot, media, episodeId) {
  if (media.shotId === undefined) return;
  const shot = lookup(snapshot.document.shots, media.shotId);
  invalid(shot?.episodeId === episodeId, "声音素材不属于本集镜头");
  provenance(snapshot, media, shot.id);
}
function normalizeScope(snapshot, input) {
  const scope = { ...input };
  const used = scope.kind === "shot" ? ["kind", "episodeId", "shotId"] : scope.kind === "cut"
    ? ["kind", "episodeId", "fromClipId", "toClipId"] : ["kind", "episodeId"];
  invalid(Object.keys(scope).every(key => used.includes(key)), "评审范围包含不适用的标识");
  if (scope.kind === "shot") {
    const shot = lookup(snapshot.document.shots, scope.shotId);
    requireValue(shot, "NOT_FOUND", "评审镜头不存在");
    invalid(scope.episodeId === undefined || scope.episodeId === shot.episodeId, "评审镜头不属于指定剧集");
    scope.episodeId = shot.episodeId;
  }
  requireValue(lookup(snapshot.document.episodes, scope.episodeId), "NOT_FOUND", "评审剧集不存在");
  if (["cut", "sequence"].includes(scope.kind)) {
    const plan = snapshot.editPlans?.[scope.episodeId];
    requireValue(plan, "NOT_FOUND", "评审需要已保存的剪辑方案");
    if (scope.kind === "cut") invalid(selectedClips(plan, scope).length === 2, "切点评审必须指定相邻片段");
  }
  return scope;
}
function covered(evidence, mediaId, start, end) {
  // Coverage may be supplied as several adjoining observations of the same bytes.
  let cursor = start;
  for (const item of evidence.filter(item => item.mediaId === mediaId && Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds))
    .sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (item.endSeconds <= cursor) continue;
    if (item.startSeconds > cursor + EPSILON) return false;
    cursor = Math.max(cursor, item.endSeconds);
    if (cursor + EPSILON >= end) return true;
  }
  return false;
}
function validateEvidence(snapshot, scope, category, verdict, evidence) {
  const plan = snapshot.editPlans?.[scope.episodeId];
  const clips = selectedClips(plan, scope);
  const tracks = selectedTracks(plan, scope);
  const related = scope.kind === "shot" ? relatedMediaIds(snapshot, scope.shotId)
    : [...clips.map(clip => clip.mediaId), ...tracks.map(track => track.mediaId)];
  const sound = new Set(scope.kind === "shot" ? related.filter(id => {
    const media = lookup(snapshot.media, id);
    return media?.kind === "audio" || (media?.kind === "video" && (plan?.clips || []).some(clip => clip.shotId === scope.shotId && clip.mediaId === id && clip.includeSourceAudio));
  }) : [...tracks.map(track => track.mediaId), ...clips.filter(clip => clip.includeSourceAudio).map(clip => clip.mediaId)]);
  for (const item of evidence) {
    const media = mediaRecord(snapshot, item.mediaId);
    invalid(related.includes(media.id), "证据素材与评审范围无关");
    if (media.shotId !== undefined) {
      if (media.kind === "audio" && tracks.some(track => track.mediaId === media.id)) audioProvenance(snapshot, media, scope.episodeId);
      else provenance(snapshot, media, scope.kind === "shot" ? scope.shotId : media.shotId);
    }
    invalid((item.startSeconds === undefined) === (item.endSeconds === undefined), "证据起止时间必须同时填写");
    if (verdict === "supported" && category !== "text" && ["video", "audio"].includes(media.kind)) invalid(item.startSeconds !== undefined, "音视频通过结论需要实际观察的起止范围");
    if (item.startSeconds !== undefined) {
      invalid(["video", "audio"].includes(media.kind), "静态图片不接受时间范围");
      interval(item.startSeconds, item.endSeconds, inspectionFor(snapshot, media.id).durationSeconds);
    }
  }
  if (verdict !== "supported") return;
  if (category !== "text") invalid(evidence.length > 0, "非文本通过结论需要实际素材证据");
  if (category === "visual") invalid(evidence.some(item => ["image", "video"].includes(lookup(snapshot.media, item.mediaId)?.kind)), "画面评审需要图片或视频证据");
  if (category === "audio") invalid(evidence.some(item => sound.has(item.mediaId)), "声音评审需要音频或明确播放源声音的视频证据");
  if (["cut", "sequence"].includes(scope.kind)) {
    requireValue(planIssues(snapshot, plan).length === 0, "CONFLICT", "剪辑方案已过期，请先重新保存选段");
    for (const clip of clips) invalid(covered(evidence, clip.mediaId, clip.inSeconds, clip.outSeconds), "通过的切点或整段评审必须覆盖每个选中视频的完整源范围");
    if (category === "audio") {
      for (const track of tracks) invalid(covered(evidence, track.mediaId, track.inSeconds, track.outSeconds), "声音评审必须覆盖相关独立音轨的源范围");
    }
  }
}

function createEditorialService({ readSnapshot, mutateProduction, newId }) {
  // Reads happen inside the host mutation queue; readSnapshot is deliberately not used for guards.
  void readSnapshot;
  const actions = {
    record_media_inspection(snapshot, args) {
      const media = mediaRecord(snapshot, args.mediaId);
      invalid(["video", "audio"].includes(media.kind), "只有视频或音频可记录时长测量");
      invalid(args.sha256 === media.sha256, "测量的 SHA-256 与登记字节不匹配");
      for (const range of args.usableRanges) interval(range.inSeconds, range.outSeconds, args.durationSeconds);
      const inspection = { mediaId: media.id, sha256: args.sha256, durationSeconds: args.durationSeconds,
        method: args.method, findings: args.findings, usableRanges: args.usableRanges, reportedBy: "agent",
        revision: (snapshot.mediaInspections?.[media.id]?.revision || 0) + 1 };
      snapshot.mediaInspections = { ...(snapshot.mediaInspections || {}), [media.id]: inspection };
      return { id: args.id, inspection };
    },
    save_edit_plan(snapshot, args) {
      requireValue(lookup(snapshot.document.episodes, args.episodeId), "NOT_FOUND", "剧集不存在");
      const previous = own(snapshot.editPlans, args.episodeId) ? snapshot.editPlans[args.episodeId] : null;
      requireValue(args.expectedEditRevision === (previous?.revision || 0), "CONFLICT", "剪辑版本已改变");
      invalid(new Set(args.clips.map(clip => clip.clipId)).size === args.clips.length, "片段 ID 必须唯一");
      invalid(new Set(args.audioTracks.map(track => track.trackId)).size === args.audioTracks.length, "音轨 ID 必须唯一");
      for (const clip of args.clips) {
        const shot = lookup(snapshot.document.shots, clip.shotId);
        requireValue(shot, "NOT_FOUND", "片段镜头不存在");
        invalid(shot.episodeId === args.episodeId, "所有选段镜头必须属于本集");
        const media = mediaRecord(snapshot, clip.mediaId, "video");
        provenance(snapshot, media, shot.id);
        interval(clip.inSeconds, clip.outSeconds, inspectionFor(snapshot, media.id).durationSeconds);
        if (clip.speed !== 1) {
          const policy = shot.productionPlan?.retimePolicy;
          invalid(policy === "allowed" || (policy === "silent-only" && !clip.includeSourceAudio), "镜头策略不允许当前变速或变速源声音");
        }
      }
      const durationSeconds = planDuration(args);
      for (const track of args.audioTracks) {
        const media = mediaRecord(snapshot, track.mediaId, "audio");
        audioProvenance(snapshot, media, args.episodeId);
        interval(track.inSeconds, track.outSeconds, inspectionFor(snapshot, media.id).durationSeconds);
        invalid(track.startSeconds + track.outSeconds - track.inSeconds <= durationSeconds + EPSILON, "独立音轨超出剪辑时间线");
      }
      const cutKeys = new Set();
      for (const note of args.cutNotes) {
        const key = JSON.stringify([note.fromClipId, note.toClipId]);
        invalid(!cutKeys.has(key) && selectedClips(args, { kind: "cut", ...note }).length === 2, "衔接说明必须对应唯一的相邻片段对");
        cutKeys.add(key);
      }
      const plan = { episodeId: args.episodeId, revision: args.expectedEditRevision + 1, clips: args.clips,
        audioTracks: args.audioTracks, cutNotes: args.cutNotes, notes: args.notes };
      plan.clipFingerprints = Object.fromEntries(plan.clips.map(clip => [clip.clipId, clipFingerprint(snapshot, clip)]));
      plan.dependencyFingerprint = planFingerprint(snapshot, plan);
      snapshot.editPlans = { ...(snapshot.editPlans || {}), [args.episodeId]: plan };
      return { id: args.id, editPlan: plan, durationSeconds };
    },
    record_review(snapshot, args) {
      requireValue((snapshot.reviews || []).length < MAX_REVIEWS, "LIMIT_EXCEEDED", "评审历史已达 2000 条上限；历史不会自动删除");
      const scope = normalizeScope(snapshot, args.scope);
      invalid(scope.kind !== "episode" || args.category === "text", "剧集范围只支持文本评审；素材评审请选择镜头或剪辑序列");
      invalid(args.verdict === "supported" || args.nextAction.trim().length > 0, "未通过或未验证的评审需要下一步动作");
      validateEvidence(snapshot, scope, args.category, args.verdict, args.evidence);
      const review = { id: newId("rv"), scope, category: args.category, verdict: args.verdict,
        evidence: args.evidence, findings: args.findings, nextAction: args.nextAction, reportedBy: "agent",
        dependencyFingerprint: fingerprint(reviewBasis(snapshot, scope, args.evidence)) };
      const current = reviewIssues(snapshot, review).length === 0;
      requireValue(args.verdict !== "supported" || current, "CONFLICT", "评审依赖已过期");
      snapshot.reviews = [...(snapshot.reviews || []), review];
      return { id: args.id, review: { ...review, current, superseded: false } };
    },
  };
  const descriptions = {
    record_media_inspection: "记录 Agent 报告的视频或音频时长、方法与可用范围。须匹配登记字节；不代表宿主解码认证或观看证明，浏览器预览仍需独立解码核对。",
    save_edit_plan: "整体保存本集视频选段与独立音轨，校验源时长、镜头归属、变速策略和双版本锁。仅硬切预览；不修改源文件、不采用输出、不导出成片。",
    record_review: "保存有范围、有证据的评审者结论，并按内容依赖推导是否过期。同范围同类别的新结论取代旧结论；supported 不等于宿主认证的艺术质量。",
  };
  return { tools: Object.keys(actions).map(name => ({ name, risk: "medium", description: descriptions[name], schema: schemas[name],
    execute: async input => {
      validate(schemas[name], input);
      // Freeze caller-owned input across queue waits and detach result objects from private state.
      const args = structuredClone(input);
      if (name === "record_review") {
        args.scope = Object.fromEntries(Object.entries(args.scope).filter(([, value]) => value !== null));
        args.evidence = args.evidence.map(item => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null)));
      }
      return mutateProduction(args.id, snapshot => {
        requireValue(snapshot.document.revision === args.expectedProductionRevision, "CONFLICT", "作品版本已改变，请重新读取");
        return structuredClone(actions[name](snapshot, args));
      });
    },
  })) };
}
module.exports = { createEditorialService };
