"use strict";

const { lookup, provenanceIssues, planIssues, planDuration, selectedClips, relatedMediaIds, reviewKey, reviewIssues } = require("./editing-dependencies.js");

function editorialStatus(snapshot) {
  const doc = snapshot.document || {};
  const savedReviews = snapshot.reviews || [];
  const latest = new Map(savedReviews.map((record, index) => [reviewKey(record), index]));
  const reviews = savedReviews.map((record, index) => {
    const issues = reviewIssues(snapshot, record);
    return { ...record, current: issues.length === 0, superseded: latest.get(reviewKey(record)) !== index, issues };
  });
  const effective = reviews.filter(record => !record.superseded);
  const episodeIds = [...new Set([...(doc.episodes || []).map(episode => episode.id), ...Object.keys(snapshot.editPlans || {})])];
  const episodes = episodeIds.map(episodeId => {
    const episode = lookup(doc.episodes, episodeId);
    const shots = (doc.shots || []).filter(shot => shot.episodeId === episodeId);
    const budgetSeconds = shots.reduce((sum, shot) => sum + (Number.isFinite(shot.duration) ? shot.duration : 0), 0);
    const targetSeconds = Number.isFinite(episode?.script?.targetDurationSeconds) ? episode.script.targetDurationSeconds : null;
    const saved = snapshot.editPlans?.[episodeId];
    const issues = saved ? planIssues(snapshot, saved) : [];
    return { episodeId, missing: !episode, budgetSeconds, targetSeconds,
      deltaSeconds: targetSeconds === null ? null : budgetSeconds - targetSeconds,
      generationSeconds: shots.reduce((sum, shot) => sum + (Number.isFinite(shot.productionPlan?.generationDurationSeconds) ? shot.productionPlan.generationDurationSeconds : 0), 0),
      planningMissingShotIds: shots.filter(shot => !shot.productionPlan).map(shot => shot.id),
      editPlan: saved ? { ...saved, durationSeconds: planDuration(saved), stale: issues.length > 0, issues,
        budgetDeltaSeconds: planDuration(saved) - budgetSeconds,
        targetDeltaSeconds: targetSeconds === null ? null : planDuration(saved) - targetSeconds,
        cuts: (saved.clips || []).slice(1).map((clip, index) => ({ fromClipId: saved.clips[index].clipId, toClipId: clip.clipId,
          fromShotId: saved.clips[index].shotId, toShotId: clip.shotId })) } : null,
      reviews: effective.filter(record => record.scope.episodeId === episodeId),
    };
  });
  const shots = (doc.shots || []).map(shot => {
    const related = new Set(relatedMediaIds(snapshot, shot.id));
    const candidates = (snapshot.media || []).filter(media => media.shotId === undefined || media.shotId === shot.id || related.has(media.id)).map(media => {
      const { fileName, ...metadata } = media;
      const issues = provenanceIssues(snapshot, media, shot.id);
      const inspection = snapshot.mediaInspections?.[media.id] || null;
      return { ...metadata, mediaId: media.id, provenanceCurrent: issues.length === 0, stale: issues.length > 0, issues,
        inspection, inspectionCurrent: Boolean(inspection && inspection.sha256 === media.sha256), reportedBy: inspection ? "agent" : null };
    });
    return { shotId: shot.id, candidates, reviews: effective.filter(record => record.scope.kind === "shot" ? record.scope.shotId === shot.id
      : ["cut", "sequence"].includes(record.scope.kind) && selectedClips(snapshot.editPlans?.[record.scope.episodeId], record.scope).some(clip => clip.shotId === shot.id)) };
  });
  const current = effective.filter(record => record.current);
  return structuredClone({ episodes, shots, reviews, reviewCounts: {
    total: reviews.length, effective: effective.length, superseded: reviews.length - effective.length,
    current: current.length, stale: effective.length - current.length,
    supported: current.filter(record => record.verdict === "supported").length,
    needsRevision: current.filter(record => record.verdict === "needs-revision").length,
    notVerified: current.filter(record => record.verdict === "not-verified").length,
    unreviewedShots: shots.filter(shot => !shot.reviews.length).length,
  } });
}
module.exports = { editorialStatus };
