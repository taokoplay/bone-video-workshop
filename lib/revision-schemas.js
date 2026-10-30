"use strict";

const { validate, requireValue } = require("./editing-schemas.js");
const id = description => ({ type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", maxLength: 128, description });
const text = (description, maxLength, minLength = 1) => ({ type: "string", minLength, maxLength, description });
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const list = (items, maxItems, minItems = 0) => ({ type: "array", items, minItems, maxItems });
const revision = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: "最新作品版本；在写入队列内检查" };
const base = { id: id("作品 ID"), expectedProductionRevision: revision };
const changeSchema = object({
  targetType: { type: "string", enum: ["production", "episode", "beat", "asset", "shot"] },
  targetId: { ...id("production 必须传 null；其余传本作品的真实对象 ID"), type: ["string", "null"] },
  field: text("允许修改的单一字段；设定集只允许 projectBible.background/rules/timeline/characters", 80),
  replacementJson: text('替换值的 JSON 编码字符串；文本示例："新对白"，数字：2.5，完整计划：{"effects":"风","music":""}，清除计划：null。只解析 JSON。', 220000),
  sourceIssue: text("实际问题或编辑意见引用；不是虚构评审 ID", 4000),
  reason: text("此项修改的理由", 4000),
  acceptanceCriteria: text("应用后仍需核验的验收标准；不自动标记通过", 4000),
});
const lifecycle = object({ ...base, planId: id("已保存的修订方案 ID"), confirm: { type: "boolean", description: "必须为 true；Agent 声明已取得针对本作品及方案的当前用户授权" },
  authorization: text("Agent 引述或说明当前用户对本作品及方案的授权；不是宿主认证的用户同意，仍须遵守宿主权限审批", 4000) });
const schemas = {
  save_revision_plan: object({ ...base, title: text("方案标题", 200), intent: { type: "string", enum: ["wording", "visual", "pacing", "story"] },
    instruction: text("用户要求和修订范围", 8000), preserve: list(text("必须保留的约束", 4000), 100, 1),
    reviewIds: list(id("当前且未被替代的真实评审 ID；没有则传空数组"), 100), changes: list(changeSchema, 100, 1) }),
  get_revision_plan: object({ id: id("作品 ID"), planId: id("修订方案 ID") }),
  apply_revision_plan: lifecycle,
  restore_revision_plan: structuredClone(lifecycle),
};

// Reject non-JSON direct-call inputs before the shared schema validator or cloning.
// Schemas remain strict objects; only targetId explicitly accepts null.
function validateInput(schema, value) {
  function json(value, depth = 0) {
    requireValue(depth <= 12, "INVALID_ARGUMENT", "参数嵌套过深");
    if (value === null || ["string", "boolean"].includes(typeof value)) return;
    if (typeof value === "number") { requireValue(Number.isFinite(value), "INVALID_ARGUMENT", "数值必须有限"); return; }
    requireValue(value && typeof value === "object" && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), "INVALID_ARGUMENT", "参数必须为 JSON 值");
    requireValue(Reflect.ownKeys(value).every(key => typeof key === "string"), "INVALID_ARGUMENT", "参数包含不支持的键");
    if (Array.isArray(value)) {
      requireValue(value.length <= 100, "INVALID_ARGUMENT", "数组超出上限");
      for (let index = 0; index < value.length; index++) { requireValue(Object.hasOwn(value, index), "INVALID_ARGUMENT", "数组不得有空项"); json(value[index], depth + 1); }
      requireValue(Object.keys(value).length === value.length, "INVALID_ARGUMENT", "数组包含额外字段");
    } else {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        requireValue(Object.hasOwn(descriptor, "value") && descriptor.enumerable, "INVALID_ARGUMENT", "参数必须为普通 JSON 属性");
        json(descriptor.value, depth + 1);
      }
    }
  }
  json(value);
  validate(schema, value);
}
module.exports = { schemas, validateInput };
