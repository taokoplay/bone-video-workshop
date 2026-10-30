"use strict";

const { requireValue } = require("./editing-schemas.js");
const { fingerprint, assetIds } = require("./editing-dependencies.js");
const { applyPlans } = require("./production-plans.js");
const invalid = (ok, message) => requireValue(ok, "INVALID_ARGUMENT", message);
const text = (max, nonempty = false) => ({ max, nonempty });
const fields = {
  production: { brief: text(2000), arc: text(4000), style: text(200), voice: text(2000), music: text(2000),
    "projectBible.background": text(20000), "projectBible.rules": text(20000), "projectBible.timeline": text(20000), "projectBible.characters": text(20000) },
  episode: { prose: text(200000), logline: text(2000), audiencePromise: text(2000), hook: text(2000), turningPoint: text(2000), payoff: text(2000), productionNotes: text(2000), targetDurationSeconds: { number: true, min: 0, max: 86400, positive: true } },
  beat: { title: text(80, true), synopsis: text(2000), visualAction: text(2000), dialogue: text(2000), sound: text(2000), continuity: text(2000), dramaticQuestion: text(2000),
    purpose: { values: ["hook", "setup", "inciting-incident", "rising-action", "reveal", "turn", "resolution", "tag"] } },
  asset: { description: text(2000), profile: text(20000), imagePrompt: text(8000), negativePrompt: text(8000) },
  shot: { title: text(80, true), scene: text(2000, true), motion: text(2000), dialogue: text(2000), duration: { number: true, min: 0, max: 600 },
    productionPlan: { plan: true }, videoPlan: { plan: true }, soundDesign: { plan: true }, continuityPlan: { plan: true } },
};
const intents = {
  wording: { episode: ["prose", "logline", "audiencePromise", "hook", "turningPoint", "payoff", "productionNotes"], beat: ["synopsis", "dialogue", "dramaticQuestion"], shot: ["dialogue"] },
  visual: { shot: ["scene", "motion", "videoPlan", "soundDesign", "continuityPlan"], asset: ["imagePrompt", "negativePrompt"] },
  pacing: { shot: ["duration", "productionPlan"], episode: ["targetDurationSeconds", "productionNotes"] },
};
function fieldRule(change, intent) {
  invalid(Object.hasOwn(fields, change.targetType) && Object.hasOwn(fields[change.targetType], change.field), "不支持修改此字段");
  invalid(intent === "story" || intents[intent]?.[change.targetType]?.includes(change.field), "修改字段超出声明的修订意图");
  invalid(change.targetType === "production" ? change.targetId === null : typeof change.targetId === "string" && !!change.targetId, "目标 ID 不适用");
  return fields[change.targetType][change.field];
}
function resolve(doc, change) {
  const { targetType, targetId } = change;
  if (targetType === "production") return { target: doc, episodeId: null };
  const matches = targetType === "beat" ? (doc.episodes || []).flatMap(episode => (episode.script?.beats || [])
    .filter(beat => beat.id === targetId).map(target => ({ target, episodeId: episode.id })))
    : (doc[{ episode: "episodes", asset: "assets", shot: "shots" }[targetType]] || [])
      .filter(target => target.id === targetId).map(target => ({ target, episodeId: targetType === "episode" ? target.id : target.episodeId || null }));
  requireValue(matches.length > 0, "NOT_FOUND", "修订目标不存在");
  invalid(matches.length === 1, "修订目标 ID 不唯一");
  return matches[0];
}
function cell(doc, change, create = false) {
  const { target } = resolve(doc, change);
  const container = change.targetType === "episode" ? "script" : change.field.startsWith("projectBible.") ? "projectBible" : null;
  if (container && create && !Object.hasOwn(target, container)) target[container] = {};
  if (container && Object.hasOwn(target, container)) invalid(target[container] && typeof target[container] === "object" && !Array.isArray(target[container]), "字段容器无效");
  return { parent: container ? target[container] : target, key: container === "projectBible" ? change.field.split(".")[1] : change.field };
}
function capture(doc, change) {
  const { parent, key } = cell(doc, change);
  const exists = !!parent && Object.hasOwn(parent, key);
  return { exists, value: exists ? structuredClone(parent[key]) : null };
}
function writeCell(doc, change, exists, value) {
  const { parent, key } = cell(doc, change, exists);
  if (exists) parent[key] = structuredClone(value);
  else if (parent) delete parent[key];
}
function checkLock(doc, change) {
  const { target } = resolve(doc, change);
  requireValue(change.targetType !== "asset" || target.locked !== true, "CONFLICT", "锁定资产不能通过修订方案修改");
}
function replace(doc, change, intent, value) {
  const rule = fieldRule(change, intent);
  checkLock(doc, change);
  if (rule.plan) {
    // Preserve the existing validators' normalization, reference checks and null-as-clear semantics.
    applyPlans(resolve(doc, change).target, { [change.field]: value }, doc);
    return;
  }
  if (rule.number) invalid(Number.isFinite(value) && value >= rule.min && value <= rule.max && (!rule.positive || value > 0), "字段数值超出范围");
  else if (rule.values) invalid(rule.values.includes(value), "字段枚举值无效");
  else invalid(typeof value === "string" && value.length <= rule.max && (!rule.nonempty || !!value.trim()), "字段文本无效或超出长度上限");
  writeCell(doc, change, true, value);
}
function prepareChanges(doc, requested, intent) {
  const candidate = structuredClone(doc), seen = new Set();
  const changes = requested.map(request => {
    fieldRule(request, intent);
    const key = JSON.stringify([request.targetType, request.targetId, request.field]);
    invalid(!seen.has(key), "同一目标字段不得重复"); seen.add(key);
    let value;
    try { value = JSON.parse(request.replacementJson); } catch { invalid(false, "replacementJson 必须为有效 JSON 编码值"); }
    const before = capture(doc, request);
    replace(candidate, request, intent, value);
    const after = capture(candidate, request);
    return { ...request, beforeExists: before.exists, before: before.value, afterExists: after.exists, after: after.value };
  });
  invalid(changes.some(change => change.beforeExists !== change.afterExists || fingerprint(change.before) !== fingerprint(change.after)), "方案不得全部为无变化修改");
  return changes;
}
function changedCells(changes) {
  return changes.filter(change => change.beforeExists !== change.afterExists || fingerprint(change.before) !== fingerprint(change.after));
}
function impactFor(doc, changes) {
  const shots = doc.shots || [], dirty = new Set(), episodes = new Set();
  for (const change of changedCells(changes)) {
    const resolved = resolve(doc, change);
    if (resolved.episodeId) episodes.add(resolved.episodeId);
    if (change.targetType === "production") for (const episode of doc.episodes || []) episodes.add(episode.id);
    for (const shot of shots) {
      const affected = change.targetType === "production" || (change.targetType === "episode" && shot.episodeId === change.targetId)
        || (change.targetType === "beat" && (shot.beatId === change.targetId || (resolved.target.shotIds || []).includes(shot.id)))
        || (change.targetType === "asset" && assetIds(shot).includes(change.targetId)) || (change.targetType === "shot" && shot.id === change.targetId);
      if (affected) { dirty.add(shot.id); if (shot.episodeId) episodes.add(shot.episodeId); }
    }
  }
  const neighbors = new Set();
  for (const episodeId of episodes) {
    const sequence = shots.filter(shot => shot.episodeId === episodeId);
    sequence.forEach((shot, index) => {
      if (!dirty.has(shot.id)) return;
      for (const neighbor of [sequence[index - 1], sequence[index + 1]]) if (neighbor && !dirty.has(neighbor.id)) neighbors.add(neighbor.id);
    });
  }
  return { episodeIds: [...episodes], dirtyShotIds: shots.filter(shot => dirty.has(shot.id)).map(shot => shot.id),
    neighborShotIds: shots.filter(shot => neighbors.has(shot.id)).map(shot => shot.id) };
}
module.exports = { fieldRule, resolve, capture, writeCell, checkLock, replace, prepareChanges, changedCells, impactFor };
