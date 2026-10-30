"use strict";
const text = { type: "string", maxLength: 8000 };
const productionPlanSchema = {
  type: ["object", "null"],
  description: "分镜制作与剪辑空间计划，整体替换；null 清除。duration 仍是成片预算，这里的生成长度不能相加当成成片长度。",
  properties: {
    sourceScene: { ...text, description: "对应完整剧本场次标识" },
    purpose: { ...text, description: "本镜必须传达的叙事信息" },
    requiredEvents: { type: "array", minItems: 1, maxItems: 12, items: text, description: "剪辑不可省略的可见事件、接触或结果" },
    generationDurationSeconds: { type: "number", exclusiveMinimum: 0, maximum: 600, description: "计划申请的源片长度，需按实际模型能力选档；不是实际测得时长" },
    headHandleSeconds: { type: "number", minimum: 0, description: "期望动作前可剪留量，需生成后核实" },
    tailHandleSeconds: { type: "number", minimum: 0, description: "期望动作后可剪留量；首尾留量和须小于生成时长" },
    retimePolicy: { type: "string", enum: ["allowed", "silent-only", "forbidden"], description: "允许变速／仅不使用源音频时允许／禁止变速。允许不代表变速后质量通过" },
    editingNotes: { ...text, description: "覆盖、拆切、对白与变速限制；不可删除的动作依据" },
  },
  required: ["sourceScene", "purpose", "requiredEvents", "generationDurationSeconds", "headHandleSeconds", "tailHandleSeconds", "retimePolicy", "editingNotes"],
  additionalProperties: false,
};
function applyProductionPlan(shot, input) {
  if (input === undefined) return;
  if (input === null) { delete shot.productionPlan; return; }
  const fail = message => { throw Object.assign(new Error(message), { code: "INVALID_ARGUMENT" }); };
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("productionPlan must be an object");
  for (const key of Object.keys(input)) if (!Object.hasOwn(productionPlanSchema.properties, key)) fail(`Unknown productionPlan field: ${key}`);
  const readText = (value, key, required = true) => {
    if (typeof value !== "string" || value.length > 8000 || (required && !value.trim())) fail(`${key} must be ${required ? "nonempty " : ""}text <=8000 characters`);
    return value.trim();
  };
  const sourceScene = readText(input.sourceScene, "sourceScene"), purpose = readText(input.purpose, "purpose");
  if (!Array.isArray(input.requiredEvents) || input.requiredEvents.length < 1 || input.requiredEvents.length > 12) fail("requiredEvents must contain 1..12 events");
  const requiredEvents = input.requiredEvents.map(value => readText(value, "requiredEvent"));
  const { generationDurationSeconds, headHandleSeconds, tailHandleSeconds, retimePolicy } = input;
  if (!Number.isFinite(generationDurationSeconds) || generationDurationSeconds <= 0 || generationDurationSeconds > 600) fail("generationDurationSeconds must be >0..600");
  if (![headHandleSeconds, tailHandleSeconds].every(value => Number.isFinite(value) && value >= 0) || headHandleSeconds + tailHandleSeconds >= generationDurationSeconds) fail("Handles must be nonnegative and leave time for the action");
  if (!productionPlanSchema.properties.retimePolicy.enum.includes(retimePolicy)) fail("Invalid retimePolicy");
  shot.productionPlan = { sourceScene, purpose, requiredEvents, generationDurationSeconds, headHandleSeconds, tailHandleSeconds, retimePolicy, editingNotes: readText(input.editingNotes, "editingNotes", false) };
}
module.exports = { productionPlanSchema, applyProductionPlan };
