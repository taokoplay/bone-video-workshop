"use strict";

const { fingerprint } = require("./editing-dependencies.js");
const { editorialStatus } = require("./editorial-status.js");

function contentFingerprint(snapshot) {
  const document = Object.fromEntries(Object.entries(snapshot.document || {}).filter(([key]) => !["revision", "createdAt", "updatedAt"].includes(key)));
  const shotRevisions = Object.fromEntries(Object.entries(snapshot.shotStates || {}).map(([id, state]) => [id, state.revision ?? null]));
  return fingerprint({ document, shotRevisions });
}
function reviewSources(snapshot, reviewIds) {
  if (!reviewIds.length) return { current: true, fingerprints: {} };
  const reviews = editorialStatus(snapshot).reviews;
  const fingerprints = {};
  let current = true;
  for (const id of reviewIds) {
    const matches = reviews.filter(review => review.id === id);
    const review = matches[0];
    if (matches.length !== 1 || !review.current || review.superseded) current = false;
    const original = (snapshot.reviews || []).find(record => record.id === id);
    if (original) fingerprints[id] = fingerprint(original);
  }
  return { current, fingerprints };
}
function eligibility(snapshot, plan, currentFingerprint = contentFingerprint(snapshot)) {
  if (plan.status === "restored") return { current: currentFingerprint === plan.restoredContentFingerprint, canApply: false, canRestore: false, statusReason: "方案已还原；不能重复应用或还原" };
  if (!["proposed", "applied"].includes(plan.status)) return { current: false, canApply: false, canRestore: false, statusReason: "方案状态无效" };
  const matches = currentFingerprint === (plan.status === "proposed" ? plan.baseContentFingerprint : plan.afterContentFingerprint);
  if (!matches) return { current: false, canApply: false, canRestore: false, statusReason: "作品内容或镜头版本已改变，请重新评估" };
  if (plan.status === "proposed") {
    const sources = reviewSources(snapshot, plan.reviewIds);
    if (!sources.current || fingerprint(sources.fingerprints) !== fingerprint(plan.sourceReviewFingerprints)) {
      return { current: false, canApply: false, canRestore: false, statusReason: "引用评审已过期、被替代或改变" };
    }
  }
  return { current: true, canApply: plan.status === "proposed", canRestore: plan.status === "applied",
    statusReason: plan.status === "proposed" ? "待明确授权后应用；保存方案不修改作品" : "已应用但不代表评审通过；可在明确授权后还原" };
}
function publicRevisionPlan(snapshot, plan) {
  return structuredClone({ ...plan, ...eligibility(snapshot, plan) });
}
function revisionStatus(snapshot) {
  const currentFingerprint = contentFingerprint(snapshot);
  const counts = { proposed: 0, applied: 0, restored: 0, stale: 0 };
  const plans = (snapshot.revisionPlans || []).map(plan => {
    const status = eligibility(snapshot, plan, currentFingerprint);
    if (Object.hasOwn(counts, plan.status) && plan.status !== "stale") counts[plan.status]++;
    if (!status.current && plan.status !== "restored") counts.stale++;
    return { id: plan.id, title: plan.title, status: plan.status, intent: plan.intent,
      canApply: status.canApply, canRestore: status.canRestore, changeCount: plan.changes.length,
      dirtyShotIds: plan.impact.dirtyShotIds, neighborShotIds: plan.impact.neighborShotIds, statusReason: status.statusReason };
  });
  return structuredClone({ plans, counts });
}
module.exports = { contentFingerprint, reviewSources, eligibility, publicRevisionPlan, revisionStatus };
