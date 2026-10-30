"use strict";
const assetDetailSchemas = {
  profile: { type: "string", maxLength: 20000, description: "资产详细设定；角色填写目标、动机、秘密、关系与成长线，其他类型填写背景及用途。" },
  imagePrompt: { type: "string", maxLength: 8000, description: "资产生图提示词：稳定外观、构图、视角、材质、光线与风格。声音资产可留空。" },
  negativePrompt: { type: "string", maxLength: 8000, description: "生图避免项与一致性约束；仅在生成工具支持时作为负向提示词。" },
};
function assetDetailPatch(input) {
  const patch = {};
  for (const [key, schema] of Object.entries(assetDetailSchemas)) {
    if (input?.[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length > schema.maxLength) {
      const error = new Error(`${key} must be text of at most ${schema.maxLength} characters`);
      error.code = "INVALID_ARGUMENT";
      throw error;
    }
    patch[key] = input[key].trim();
  }
  return patch;
}
module.exports = { assetDetailSchemas, assetDetailPatch };
