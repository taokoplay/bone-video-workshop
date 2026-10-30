"use strict";

const SECTION_LIMIT = 20000;
const descriptions = {
  background: "世界背景：时代、地域、社会结构、势力与核心冲突的起因。",
  rules: "世界规则：触发条件、能力边界、代价、例外与角色知情约束。",
  timeline: "历史时间线：按世界内真实发生顺序记录事件、因果与后果；区分观众获知顺序。",
  characters: "兼容旧版集中人物资料；新人物档案应保存到各角色资产 profile。旧资料归档核对完成后可清空，未归档内容在资产区展示。",
};
const projectBibleSchema = {
  type: "object",
  description: "项目设定，按栏目局部更新；省略保留，空字符串清空该栏。每栏最多20000字符。全剧主线使用 arc，不在此重复。",
  properties: Object.fromEntries(Object.entries(descriptions).map(([key, description]) => [key, { type: "string", maxLength: SECTION_LIMIT, description }])),
  additionalProperties: false,
};

function validateProjectBible(value) {
  const invalid = message => {
    const error = new Error(message);
    error.code = "INVALID_ARGUMENT";
    throw error;
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("projectBible must be an object");
  const patch = {};
  for (const [key, text] of Object.entries(value)) {
    if (!Object.hasOwn(descriptions, key)) invalid(`Unknown projectBible section: ${key}`);
    if (typeof text !== "string") invalid(`projectBible.${key} must be text`);
    if (text.length > SECTION_LIMIT) invalid(`projectBible.${key} exceeds ${SECTION_LIMIT} characters`);
    patch[key] = text.trim();
  }
  return patch;
}

module.exports = { projectBibleSchema, validateProjectBible };
