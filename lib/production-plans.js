"use strict";
const { productionPlanSchema, applyProductionPlan } = require("./shot-production-plan.js");

const MODES = ["text-to-video", "image-to-video", "first-last-frame"];
const TRANSITIONS = ["hard-cut", "match-cut", "dissolve"];
const AUDIO_TRANSITIONS = ["hard-cut", "carry-over", "prelap", "dialogue-carry"];
const PHASES = ["start", "development", "contact", "peak", "result", "reaction", "exit"];
const textSchema = { type: "string", maxLength: 8000 };
const assetSchema = { type: ["string", "null"], description: "本作品资产 id；必须同时加入镜头 assetIds" };
const planSchemas = {
  productionPlan: productionPlanSchema,
  videoPlan: {
    type: ["object", "null"],
    description: "视频制作计划，整体替换；null 清除计划。首帧 null 表示使用镜头已采用画面。",
    properties: {
      mode: { type: "string", enum: MODES },
      firstFrameAssetId: assetSchema,
      lastFrameAssetId: assetSchema,
      transitionIn: { type: "string", enum: TRANSITIONS },
      rationale: { ...textSchema, description: "为何选择这种生成模式与转场" },
    },
    required: ["mode", "rationale"], additionalProperties: false,
  },
  soundDesign: {
    type: ["object", "null"], description: "镜头声音设计，整体替换；对白仍写 dialogue；null 清除。",
    properties: { effects: textSchema, music: textSchema },
    required: ["effects", "music"], additionalProperties: false,
  },
  continuityPlan: {
    type: ["object", "null"], description: "镜头衔接设计，整体替换；null 清除。",
    properties: {
      entryState: textSchema, exitState: textSchema, rationale: textSchema,
      audioTransition: { type: "string", enum: AUDIO_TRANSITIONS },
      anchors: {
        type: "array", maxItems: 12,
        items: { type: "object", properties: {
          phase: { type: "string", enum: PHASES }, state: textSchema, assetId: assetSchema,
        }, required: ["phase", "state"], additionalProperties: false },
      },
    }, required: ["entryState", "exitState", "rationale"], additionalProperties: false,
  },
};
function invalid(message) { const error = new Error(message); error.code = "INVALID_ARGUMENT"; throw error; }
function object(value, keys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${name}.${key} is not supported`);
}
function text(value, name, required = false) {
  if (typeof value !== "string" || value.length > 8000 || (required && !value.trim())) invalid(`${name} must be ${required ? "non-empty " : ""}text, at most 8000 characters`);
  return value.trim();
}
function member(value, values, name) {
  if (!values.includes(value)) invalid(`${name} must be one of ${values.join(", ")}`);
  return value;
}
function asset(value, doc, shot, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !doc.assets.some(item => item.id === value)) invalid(`${name}: asset is not in this production`);
  if (!shot.assetIds.includes(value)) invalid(`${name}: asset must also be in shot.assetIds`);
  return value;
}

// Optional fields preserve old snapshots. New nested values are whole replacements.
function applyPlans(shot, input, doc) {
  applyProductionPlan(shot, input.productionPlan);
  if (input.videoPlan !== undefined) {
    if (input.videoPlan === null) delete shot.videoPlan;
    else {
      const plan = input.videoPlan;
      object(plan, Object.keys(planSchemas.videoPlan.properties), "videoPlan");
      const mode = member(plan.mode, MODES, "videoPlan.mode");
      const first = asset(plan.firstFrameAssetId, doc, shot, "firstFrameAssetId");
      const last = asset(plan.lastFrameAssetId, doc, shot, "lastFrameAssetId");
      if (mode === "text-to-video" && (first || last)) invalid("text-to-video cannot reference frames");
      if (mode === "image-to-video" && last) invalid("image-to-video cannot reference a last frame");
      if (mode === "first-last-frame" && !last) invalid("first-last-frame requires lastFrameAssetId");
      if (first && first === last) invalid("first and last frame assets must be distinct");
      shot.videoPlan = { mode, firstFrameAssetId: first, lastFrameAssetId: last,
        transitionIn: member(plan.transitionIn ?? "hard-cut", TRANSITIONS, "transitionIn"), rationale: text(plan.rationale, "videoPlan.rationale", true) };
    }
  }
  if (input.soundDesign !== undefined) {
    if (input.soundDesign === null) delete shot.soundDesign;
    else {
      object(input.soundDesign, ["effects", "music"], "soundDesign");
      shot.soundDesign = { effects: text(input.soundDesign.effects, "soundDesign.effects"), music: text(input.soundDesign.music, "soundDesign.music") };
    }
  }
  if (input.continuityPlan !== undefined) {
    if (input.continuityPlan === null) delete shot.continuityPlan;
    else {
      const plan = input.continuityPlan;
      object(plan, Object.keys(planSchemas.continuityPlan.properties), "continuityPlan");
      const anchors = plan.anchors ?? [];
      if (!Array.isArray(anchors) || anchors.length > 12) invalid("anchors must be an array of at most 12 entries");
      const phases = new Set();
      shot.continuityPlan = {
        entryState: text(plan.entryState, "entryState", true), exitState: text(plan.exitState, "exitState", true),
        rationale: text(plan.rationale, "continuityPlan.rationale", true),
        audioTransition: member(plan.audioTransition ?? "hard-cut", AUDIO_TRANSITIONS, "audioTransition"),
        anchors: anchors.map(item => {
          object(item, ["phase", "state", "assetId"], "anchor");
          const phase = member(item.phase, PHASES, "anchor.phase");
          if (phases.has(phase)) invalid("anchor phases must not repeat");
          phases.add(phase);
          return { phase, state: text(item.state, "anchor.state", true), assetId: asset(item.assetId, doc, shot, "anchor.assetId") };
        }),
      };
    }
  }
  // An asset-list change must not silently detach references used by retained plans.
  for (const id of referencedAssets(shot)) asset(id, doc, shot, "plan reference");
}
function referencedAssets(shot) {
  return [...new Set([shot.videoPlan?.firstFrameAssetId, shot.videoPlan?.lastFrameAssetId,
    ...(shot.continuityPlan?.anchors || []).map(item => item.assetId)].filter(Boolean))];
}
module.exports = { planSchemas, applyPlans, referencedAssets };
