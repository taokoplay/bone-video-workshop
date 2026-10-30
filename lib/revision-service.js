"use strict";

const { schemas, validateInput } = require("./revision-schemas.js");
const { requireValue } = require("./editing-schemas.js");
const { fingerprint, reviewBasis } = require("./editing-dependencies.js");
const { fieldRule, capture, writeCell, checkLock, prepareChanges, changedCells, impactFor } = require("./revision-fields.js");
const { contentFingerprint, reviewSources, eligibility, publicRevisionPlan, revisionStatus } = require("./revision-status.js");
const MAX_PLANS = 40;
const MAX_PLAN_BYTES = 2 * 1024 * 1024;
const requestKeys = ["targetType", "targetId", "field", "replacementJson", "sourceIssue", "reason", "acceptanceCriteria"];
function planSize(plan) {
  requireValue(Buffer.byteLength(JSON.stringify(plan), "utf8") <= MAX_PLAN_BYTES, "LIMIT_EXCEEDED", "完整修订记录超过 2MiB 上限");
}
function findPlan(snapshot, planId) {
  const matches = (snapshot.revisionPlans || []).filter(plan => plan.id === planId);
  requireValue(matches.length > 0, "NOT_FOUND", "修订方案不存在");
  requireValue(matches.length === 1, "CONFLICT", "修订方案 ID 不唯一");
  return matches[0];
}
function requestFor(plan, args) {
  return { id: args.id, expectedProductionRevision: args.expectedProductionRevision,
    title: plan.title, intent: plan.intent, instruction: plan.instruction, preserve: plan.preserve, reviewIds: plan.reviewIds,
    changes: plan.changes.map(change => Object.fromEntries(requestKeys.map(key => [key, change[key]]))) };
}
function createRevisionService({ readSnapshot, mutateProduction, newId, markShotDirty }) {
  function dirty(snapshot, impact) {
    snapshot.shotStates ||= {};
    for (const shotId of impact.dirtyShotIds) {
      const mediaRevisions = (snapshot.media || []).filter(media => media.shotId === shotId && media.shotRevision !== undefined).map(media => media.shotRevision);
      requireValue(mediaRevisions.every(value => Number.isSafeInteger(value) && value >= 0), "CONFLICT", "素材来源镜头版本无效");
      const highest = mediaRevisions.reduce((max, value) => Math.max(max, value), 0);
      // Legacy state can be absent while media still records a revision. Start above
      // those known revisions so creating state cannot revive an old generation.
      if (!Object.hasOwn(snapshot.shotStates, shotId)) snapshot.shotStates[shotId] = { revision: highest, outputVersion: 0, needsUpdate: true };
      const state = snapshot.shotStates[shotId];
      requireValue(Number.isSafeInteger(state?.revision) && state.revision >= highest && state.revision < Number.MAX_SAFE_INTEGER, "CONFLICT", "镜头版本无效、已达上限或低于已有素材来源版本");
      requireValue(Object.values(state.outputRevisions || {}).every(value => Number.isSafeInteger(value) && value >= 0 && value <= state.revision), "CONFLICT", "已采用输出的镜头版本无效");
    }
    for (const shotId of impact.dirtyShotIds) markShotDirty(snapshot, shotId);
  }
  function save(snapshot, args) {
    requireValue((snapshot.revisionPlans || []).length < MAX_PLANS, "LIMIT_EXCEEDED", "修订历史已达 40 条上限；不会自动删除历史");
    requireValue(new Set(args.reviewIds).size === args.reviewIds.length, "INVALID_ARGUMENT", "引用评审 ID 不得重复");
    const sources = reviewSources(snapshot, args.reviewIds);
    requireValue(sources.current, "CONFLICT", "引用评审不存在、已过期或已被替代");
    const changes = prepareChanges(snapshot.document, args.changes, args.intent);
    const plan = { id: newId("rp"), title: args.title, intent: args.intent, instruction: args.instruction,
      preserve: args.preserve, reviewIds: args.reviewIds, sourceReviewFingerprints: sources.fingerprints, changes,
      baseContentFingerprint: contentFingerprint(snapshot), baseProductionRevision: snapshot.document.revision,
      status: "proposed", impact: impactFor(snapshot.document, changes), createdAt: Date.now() };
    requireValue(!(snapshot.revisionPlans || []).some(record => record.id === plan.id), "CONFLICT", "修订方案 ID 冲突");
    planSize(plan);
    snapshot.revisionPlans = [...(snapshot.revisionPlans || []), plan];
    return { id: args.id, planId: plan.id, plan: publicRevisionPlan(snapshot, plan) };
  }
  function transition(snapshot, args, restore) {
    // These are Agent assertions, not independently authenticated user consent.
    requireValue(args.confirm === true, "INVALID_ARGUMENT", "应用或还原需要 confirm=true 及明确的当前用户授权说明");
    const plan = findPlan(snapshot, args.planId);
    const state = eligibility(snapshot, plan);
    requireValue(restore ? state.canRestore : state.canApply, "CONFLICT", state.statusReason);
    const request = requestFor(plan, args);
    validateInput(schemas.save_revision_plan, request);
    const actual = changedCells(plan.changes);
    if (!restore) {
      // Re-run the field/intent/plan validators and compare the host-captured baseline.
      const checked = prepareChanges(snapshot.document, request.changes, plan.intent);
      requireValue(fingerprint(checked) === fingerprint(plan.changes), "CONFLICT", "修订载荷或基线不匹配");
    }
    for (const change of plan.changes) {
      fieldRule(change, plan.intent);
      checkLock(snapshot.document, change);
      const current = capture(snapshot.document, change);
      const exists = restore ? change.afterExists : change.beforeExists;
      const value = restore ? change.after : change.before;
      requireValue(current.exists === exists && fingerprint(current.value) === fingerprint(value), "CONFLICT", "修订字段内容已改变");
    }
    const impact = impactFor(snapshot.document, plan.changes);
    const reviewBases = new Map((snapshot.reviews || []).map(review =>
      [review.id, fingerprint(reviewBasis(snapshot, review.scope, review.evidence))]));
    for (const change of actual) writeCell(snapshot.document, change, restore ? change.beforeExists : change.afterExists, restore ? change.before : change.after);
    dirty(snapshot, impact);
    // Preserve immutable evidence while preventing content restoration from
    // reviving old conclusions, including episode reviews with no shot counter.
    for (const review of snapshot.reviews || []) {
      if (reviewBases.get(review.id) !== fingerprint(reviewBasis(snapshot, review.scope, review.evidence))) {
        snapshot.reviewInvalidations ||= {};
        snapshot.reviewInvalidations[review.id] ||= args.expectedProductionRevision + 1;
      }
    }
    plan.status = restore ? "restored" : "applied";
    if (restore) {
      plan.restoredAt = Date.now();
      plan.restoredProductionRevision = args.expectedProductionRevision + 1;
      plan.restoreAuthorization = args.authorization;
      plan.restoredContentFingerprint = contentFingerprint(snapshot);
    } else {
      plan.appliedAt = Date.now();
      plan.appliedProductionRevision = args.expectedProductionRevision + 1;
      plan.authorization = args.authorization;
      plan.afterContentFingerprint = contentFingerprint(snapshot);
    }
    planSize(plan);
    return { id: args.id, planId: plan.id, status: plan.status,
      changedFields: actual.map(({ targetType, targetId, field }) => ({ targetType, targetId, field })), dirtyShotIds: impact.dirtyShotIds };
  }
  const descriptions = {
    save_revision_plan: "仅暂存具体修订方案及宿主捕获的修改前后值，不改剧本、镜头或素材。replacementJson 是一个字段值的 JSON 编码字符串。意图字段限制不是语义保持证明；保留约束仍须 Agent 核验。",
    get_revision_plan: "只读获取修订方案、精确修改前后值、影响范围及当前可应用／还原状态，不写入旧作品。",
    apply_revision_plan: "在版本、内容及引用评审均匹配时原子应用已保存方案。须 confirm=true 和 Agent 对当前用户授权的说明，并遵守宿主权限审批；不会生成素材或自动判定评审通过。",
    restore_revision_plan: "仅当应用后内容及镜头版本未改变时还原该方案修改的字段。保留素材、评审及输出历史，镜头版本继续递增；不能跨后续内容修改强制回滚或重复还原。须明确授权及宿主审批。",
  };
  return { tools: Object.keys(schemas).map(name => ({ name, risk: name === "get_revision_plan" ? "low" : "medium", description: descriptions[name], schema: structuredClone(schemas[name]),
    execute: async input => {
      validateInput(schemas[name], input);
      const args = structuredClone(input);
      if (name === "get_revision_plan") {
        const snapshot = await readSnapshot(args.id);
        return publicRevisionPlan(snapshot, findPlan(snapshot, args.planId));
      }
      const result = await mutateProduction(args.id, live => {
        requireValue(live.document.revision === args.expectedProductionRevision, "CONFLICT", "作品版本已改变，请重新读取");
        requireValue(live.document.revision < Number.MAX_SAFE_INTEGER, "LIMIT_EXCEEDED", "作品版本已达安全整数上限");
        // Validate and mutate a detached candidate even if the host exposes its live snapshot.
        const candidate = structuredClone(live);
        const output = name === "save_revision_plan" ? save(candidate, args) : transition(candidate, args, name === "restore_revision_plan");
        live.revisionPlans = candidate.revisionPlans;
        if (name !== "save_revision_plan") {
          live.document = candidate.document; live.shotStates = candidate.shotStates;
          if (candidate.reviewInvalidations) live.reviewInvalidations = candidate.reviewInvalidations;
        }
        return structuredClone(output);
      });
      return structuredClone(result);
    },
  })) };
}
module.exports = { createRevisionService, publicRevisionPlan, revisionStatus };
