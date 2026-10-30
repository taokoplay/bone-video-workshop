"use strict";

const { createHash } = require("node:crypto");
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const lookup = (items, id) => (items || []).find(item => item.id === id) || null;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
function fingerprint(value) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function omit(object, keys) { return Object.fromEntries(Object.entries(object || {}).filter(([key]) => !keys.includes(key))); }
function canon(snapshot) {
  return omit(snapshot.document, ["revision", "createdAt", "updatedAt", "episodes", "shots", "assets"]);
}
function sourceBasis(snapshot, mediaId) {
  const media = lookup(snapshot.media, mediaId);
  const inspection = own(snapshot.mediaInspections, mediaId) ? snapshot.mediaInspections[mediaId] : null;
  return { media: media ? omit(media, ["fileName", "createdAt", "title"]) : null,
    currentOriginRevision: media?.shotId ? snapshot.shotStates?.[media.shotId]?.revision ?? null : null,
    inspection: inspection ? omit(inspection, ["revision", "createdAt", "updatedAt"]) : null };
}
function assetIds(shot) {
  return [...new Set([...(shot?.assetIds || []), shot?.videoPlan?.firstFrameAssetId,
    shot?.videoPlan?.lastFrameAssetId, ...(shot?.continuityPlan?.anchors || []).map(anchor => anchor.assetId)]
    .filter(Boolean))].sort();
}
function shotBasis(snapshot, shotId) {
  const shot = lookup(snapshot.document.shots, shotId);
  if (!shot) return null;
  return { shot, shotRevision: snapshot.shotStates?.[shotId]?.revision ?? null,
    assets: assetIds(shot).map(id => {
      const asset = lookup(snapshot.document.assets, id);
      return { id, asset, media: asset?.mediaId ? sourceBasis(snapshot, asset.mediaId) : null };
    }), outputs: [...new Set([shot.mediaId, ...Object.values(shot.outputs || {})].filter(Boolean))]
      .sort().map(id => ({ id, ...sourceBasis(snapshot, id) })) };
}
function episodeBasis(snapshot, episodeId) {
  return { canon: canon(snapshot), episode: lookup(snapshot.document.episodes, episodeId),
    shotOrder: (snapshot.document.shots || []).filter(shot => shot.episodeId === episodeId).map(shot => shot.id) };
}
function provenanceIssues(snapshot, media, shotId) {
  if (!media) return ["素材已删除或不存在"];
  const issues = [];
  if (media.shotId !== undefined && media.shotId !== shotId) issues.push("素材所属镜头不匹配");
  if (media.shotRevision !== undefined && media.shotRevision !== snapshot.shotStates?.[shotId]?.revision) issues.push("素材对应旧镜头版本");
  return issues;
}
function clipFingerprint(snapshot, clip) {
  return fingerprint({ clip, shot: shotBasis(snapshot, clip.shotId), source: sourceBasis(snapshot, clip.mediaId) });
}
function planFingerprint(snapshot, plan) {
  return fingerprint({ episode: episodeBasis(snapshot, plan.episodeId), clips: (plan.clips || []).map(clip => clipFingerprint(snapshot, clip)),
    audioTracks: (plan.audioTracks || []).map(track => ({ track, source: sourceBasis(snapshot, track.mediaId),
      provenanceShot: lookup(snapshot.media, track.mediaId)?.shotId ? shotBasis(snapshot, lookup(snapshot.media, track.mediaId).shotId) : null })),
    cutNotes: plan.cutNotes || [], notes: plan.notes || "" });
}
function planIssues(snapshot, plan) {
  const issues = [];
  if (!lookup(snapshot.document.episodes, plan.episodeId)) issues.push("剧集已删除或不存在");
  for (const clip of plan.clips || []) {
    const shot = lookup(snapshot.document.shots, clip.shotId);
    if (!shot || shot.episodeId !== plan.episodeId) issues.push(`片段 ${clip.clipId} 的镜头已删除或移出本集`);
    for (const issue of provenanceIssues(snapshot, lookup(snapshot.media, clip.mediaId), clip.shotId)) issues.push(`片段 ${clip.clipId}：${issue}`);
    if (plan.clipFingerprints?.[clip.clipId] !== clipFingerprint(snapshot, clip)) issues.push(`片段 ${clip.clipId} 的依赖已改变`);
  }
  if (plan.dependencyFingerprint !== planFingerprint(snapshot, plan)) issues.push("剪辑方案的剧本、顺序、素材或创作依赖已改变");
  return issues;
}
function planDuration(plan) { return (plan?.clips || []).reduce((sum, clip) => sum + (clip.outSeconds - clip.inSeconds) / clip.speed, 0); }
function selectedClips(plan, scope) {
  if (scope.kind === "sequence") return plan?.clips || [];
  if (scope.kind === "shot") return (plan?.clips || []).filter(clip => clip.shotId === scope.shotId);
  if (scope.kind !== "cut") return [];
  const index = (plan?.clips || []).findIndex(clip => clip.clipId === scope.fromClipId);
  return index >= 0 && plan.clips[index + 1]?.clipId === scope.toClipId ? plan.clips.slice(index, index + 2) : [];
}
function selectedTracks(plan, scope) {
  if (scope.kind === "sequence") return plan?.audioTracks || [];
  const selected = new Set(selectedClips(plan, scope));
  let cursor = 0;
  const ranges = (plan?.clips || []).flatMap(clip => {
    const start = cursor;
    cursor += (clip.outSeconds - clip.inSeconds) / clip.speed;
    return selected.has(clip) ? [{ start, end: cursor }] : [];
  });
  return (plan?.audioTracks || []).filter(track => ranges.some(range => track.startSeconds < range.end && track.startSeconds + track.outSeconds - track.inSeconds > range.start));
}
function relatedMediaIds(snapshot, shotId) {
  const shot = lookup(snapshot.document.shots, shotId);
  if (!shot) return [];
  return [...new Set([shot.mediaId, ...Object.values(shot.outputs || {}),
    ...(snapshot.media || []).filter(media => media.shotId === shotId).map(media => media.id),
    ...(snapshot.editPlans?.[shot.episodeId]?.clips || []).filter(clip => clip.shotId === shotId).map(clip => clip.mediaId),
    ...selectedTracks(snapshot.editPlans?.[shot.episodeId], { kind: "shot", shotId }).map(track => track.mediaId),
    ...assetIds(shot).map(id => lookup(snapshot.document.assets, id)?.mediaId)].filter(Boolean))];
}
function reviewKey(record) { return fingerprint({ scope: record.scope, category: record.category }); }
function reviewBasis(snapshot, scope, evidence) {
  const plan = snapshot.editPlans?.[scope.episodeId];
  const clips = selectedClips(plan, scope);
  const tracks = selectedTracks(plan, scope);
  const shots = scope.kind === "shot" ? [scope.shotId] : scope.kind === "episode"
    ? (snapshot.document.shots || []).filter(shot => shot.episodeId === scope.episodeId).map(shot => shot.id)
    : [...new Set(clips.map(clip => clip.shotId))];
  return { episode: episodeBasis(snapshot, scope.episodeId), scope, shots: shots.map(id => shotBasis(snapshot, id)),
    selection: scope.kind === "sequence" ? (plan ? planFingerprint(snapshot, plan) : null)
      : scope.kind === "shot" ? { clips, tracks }
        : scope.kind === "cut" ? { clips, tracks, cutNotes: (plan?.cutNotes || []).filter(note => note.fromClipId === scope.fromClipId && note.toClipId === scope.toClipId) } : null,
    sources: [...new Set([...clips.map(clip => clip.mediaId), ...tracks.map(track => track.mediaId), ...(evidence || []).map(item => item.mediaId)])]
      .sort().map(id => ({ id, ...sourceBasis(snapshot, id) })) };
}
function reviewIssues(snapshot, record) {
  if (Object.hasOwn(snapshot.reviewInvalidations || {}, record.id)) return ["评审依据曾经修订，恢复原文后仍需重新评审"];
  const { scope } = record;
  if (!scope || !lookup(snapshot.document.episodes, scope.episodeId)) return ["评审剧集不存在"];
  if (scope.kind === "shot" && lookup(snapshot.document.shots, scope.shotId)?.episodeId !== scope.episodeId) return ["评审镜头已删除或移出本集"];
  if (["cut", "sequence"].includes(scope.kind)) {
    const plan = snapshot.editPlans?.[scope.episodeId];
    if (!plan) return ["评审剪辑方案不存在"];
    if (scope.kind === "cut" && selectedClips(plan, scope).length !== 2) return ["评审切点不再相邻"];
    const issues = planIssues(snapshot, plan);
    if (issues.length) return issues;
  }
  if (record.dependencyFingerprint !== fingerprint(reviewBasis(snapshot, scope, record.evidence))) return ["评审依赖已改变"];
  return [];
}
module.exports = { own, lookup, fingerprint, sourceBasis, shotBasis, assetIds, episodeBasis, provenanceIssues,
  clipFingerprint, planFingerprint, planIssues, planDuration, selectedClips, selectedTracks, relatedMediaIds, reviewKey, reviewBasis, reviewIssues };
