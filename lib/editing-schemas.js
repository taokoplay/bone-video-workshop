"use strict";

// Tool schemas are also enforced at the service boundary, including direct calls.
const id = description => ({ type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", description });
const text = (description, minLength = 0, maxLength = 8000) => ({ type: "string", minLength, maxLength, description });
const number = (description, minimum, maximum = 86400) => ({ type: "number", minimum, maximum, description });
const choice = (description, values) => ({ type: "string", enum: values, description });
const object = (properties, required = Object.keys(properties), description) => ({ type: "object", properties, required, additionalProperties: false, ...(description ? { description } : {}) });
const list = (description, items, maxItems, minItems = 0) => ({ type: "array", items, minItems, maxItems, description });
const revision = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: "读取到的当前作品版本；在写入队列内检查" };
const nullable = schema => ({ ...schema, type: [schema.type, "null"] });
const base = { id: id("作品 ID"), expectedProductionRevision: revision };
const interval = { inSeconds: number("源素材入点（秒）", 0), outSeconds: number("源素材出点（秒），必须大于入点", 0) };
const clip = object({ clipId: id("方案内稳定且唯一的片段标识"), shotId: id("本集真实镜头 ID"), mediaId: id("已登记视频 ID"), ...interval,
  speed: number("恒定播放速度；变速须符合镜头策略", 0.25, 4), includeSourceAudio: { type: "boolean", description: "是否播放该视频的源声音" }, note: text("选段说明") });
const track = object({ trackId: id("方案内稳定且唯一的音轨标识"), mediaId: id("已登记音频 ID"),
  role: choice("声音用途", ["dialogue", "ambience", "effects", "music"]), startSeconds: number("剪辑时间线起点（秒）", 0, 69120000),
  ...interval, gain: number("音量倍数，浏览器预览支持0..1", 0, 1), note: text("音轨说明") });
const cutNote = object({ fromClipId: id("前一个片段 ID"), toClipId: id("紧接的后一个片段 ID"), visual: text("画面衔接计划，仅作说明"), audio: text("声音衔接计划，仅作说明") });
const scope = object({ kind: choice("评审范围", ["episode", "shot", "cut", "sequence"]), episodeId: nullable(id("剧集 ID；镜头评审可由 shotId 推导，不适用传 null")),
  shotId: nullable(id("镜头评审的镜头 ID；不适用传 null")), fromClipId: nullable(id("切点评审前片段；不适用传 null")), toClipId: nullable(id("切点评审后片段；不适用传 null")) }, ["kind"]);
const evidence = object({ mediaId: id("与评审范围有关的已登记素材 ID"), startSeconds: nullable(number("证据起点（秒）；静态图片可 null", 0)),
  endSeconds: nullable(number("证据终点（秒）；音视频通过结论必须填实际观察范围", 0)), note: text("实际观察到的证据", 1) }, ["mediaId", "note"]);
const schemas = {
  record_media_inspection: object({ ...base, mediaId: id("已登记视频或音频 ID"), sha256: { type: "string", pattern: "^[a-f0-9]{64}$", description: "必须匹配登记素材的 SHA-256" },
    durationSeconds: { ...number("Agent 报告的源时长；不代表宿主解码认证", 0), exclusiveMinimum: 0 },
    method: text("Agent 使用的测量或观察方法", 1, 500), findings: text("观察结果与限制", 1),
    usableRanges: list("可用源范围；不等于作品剪辑预算", object({ ...interval, note: text("范围说明") }), 200) }),
  save_edit_plan: object({ ...base, episodeId: id("剧集 ID"), expectedEditRevision: { ...revision, minimum: 0, description: "当前剪辑版本；首次保存填 0" },
    clips: list("按时间线顺序排列的视频片段；仅支持硬切预览", clip, 200, 1), audioTracks: list("独立音轨，可明确重叠；不增加剪辑总长", track, 32),
    cutNotes: list("相邻片段衔接说明，不自动执行转场", cutNote, 199), notes: text("剪辑方案说明；保存不采用输出或导出成片") }),
  record_review: object({ ...base, scope, category: choice("评审类别", ["text", "technical", "visual", "audio", "continuity"]),
    verdict: choice("评审者的结论，不是宿主质量认证", ["supported", "needs-revision", "not-verified"]), evidence: list("已观察的范围内素材证据；通过的非文本评审必须提供", evidence, 512),
    findings: text("具体发现与依据", 1), nextAction: text("下一步动作；supported 时可为空") }),
};
function requireValue(ok, code, message) { if (!ok) throw Object.assign(new Error(message), { code }); }
function validate(schema, value, path = "参数") {
  const invalid = message => requireValue(false, "INVALID_ARGUMENT", `${path}：${message}`);
  if (Array.isArray(schema.type)) {
    if (value === null && schema.type.includes("null")) return;
    return validate({ ...schema, type: schema.type.find(type => type !== "null") }, value, path);
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("必须是对象");
    for (const key of schema.required) if (!Object.prototype.hasOwnProperty.call(value, key)) invalid(`缺少 ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) invalid(`不支持 ${key}`);
      validate(schema.properties[key], item, `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) invalid(`数量必须为 ${schema.minItems}..${schema.maxItems}`);
    value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`));
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length < (schema.minLength || 0) || value.length > (schema.maxLength || 128)) invalid("文本长度无效");
    if (schema.minLength > 0 && !value.trim()) invalid("不得为空白");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) invalid("格式无效");
    if (schema.enum && !schema.enum.includes(value)) invalid(`必须为 ${schema.enum.join("、")}`);
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") invalid("必须为布尔值");
  } else {
    if (!Number.isFinite(value) || (schema.type === "integer" && !Number.isSafeInteger(value)) || value < schema.minimum || value > schema.maximum ||
      (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)) invalid("数值超出有效范围");
  }
}
module.exports = { schemas, validate, requireValue };
