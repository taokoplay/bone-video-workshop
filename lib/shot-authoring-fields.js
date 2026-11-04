"use strict";
const authoring = require("./shot-authoring.js");
const { documentSchema, validateDocument, OPERATIONS } = require("./reference-document.js");
const { requireValue, validate } = require("./editing-schemas.js");
const { checkSceneBriefChange, validateBriefAssets } = require("./generation-brief.js");
const fields = authoring.FIELDS.slice(1);
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const authoringSchemas = {
  scale: { type: "string", enum: ["", ...authoring.SCALES] },
  lighting: { type: "string", maxLength: 8000 },
  referenceFields: { ...object(Object.fromEntries(fields.map(field => [field, documentSchema]))), type: ["object", "null"] },
  generationSettings: { ...object({ operation: { type: "string", enum: OPERATIONS }, maxReferenceImages: { type: "integer", minimum: 1, maximum: 8 } }, ["operation", "maxReferenceImages"]), type: ["object", "null"] },
};
// Unlike revision-plan input arrays, shot documents may contain 256 nodes and
// asset unions may contain 1024 IDs. Reject non-JSON descriptors before cloning.
function validateShotInput(schema, value) {
  function json(value, depth = 0) {
    requireValue(depth <= 16, "INVALID_ARGUMENT", "Input nesting exceeds limit");
    if (value === null || ["string", "boolean"].includes(typeof value)) return;
    if (typeof value === "number") { requireValue(Number.isFinite(value), "INVALID_ARGUMENT", "Numbers must be finite"); return; }
    requireValue(value && typeof value === "object" && (Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value))), "INVALID_ARGUMENT", "Expected JSON input");
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value)) requireValue(value.length <= 2048 && keys.length === value.length + 1 &&
      Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean), "INVALID_ARGUMENT", "Invalid input array");
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      requireValue(typeof key === "string" && descriptor.enumerable && Object.hasOwn(descriptor, "value"), "INVALID_ARGUMENT", "Expected plain JSON fields");
      json(descriptor.value, depth + 1);
    }
  }
  function check(rule, value) {
    if (value === null && Array.isArray(rule.type) && rule.type.includes("null")) return;
    if (rule === documentSchema || (rule.properties?.schemaVersion && rule.properties?.nodes)) { validateDocument(value); return; }
    const type = Array.isArray(rule.type) ? rule.type.find(type => type !== "null") : rule.type;
    if (type === "object") {
      requireValue(value && typeof value === "object" && !Array.isArray(value), "INVALID_ARGUMENT", "Expected an object");
      for (const key of rule.required || []) requireValue(Object.hasOwn(value, key), "INVALID_ARGUMENT", `Missing ${key}`);
      for (const key of Object.keys(value)) {
        requireValue(Object.hasOwn(rule.properties, key), "INVALID_ARGUMENT", `Unknown field: ${key}`);
        check(rule.properties[key], value[key]);
      }
    } else if (type === "array") {
      requireValue(Array.isArray(value) && value.length >= (rule.minItems ?? 0) && value.length <= (rule.maxItems ?? 1024), "INVALID_ARGUMENT", "Array size exceeds limit");
      value.forEach(item => check(rule.items, item));
    } else validate(rule, value);
  }
  json(value); check(schema, value);
  return structuredClone(value);
}
function checkShotFields(input, properties) {
  requireValue(input && typeof input === "object" && !Array.isArray(input) && [Object.prototype, null].includes(Object.getPrototypeOf(input)), "INVALID_ARGUMENT", "Expected shot input");
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    requireValue(Object.hasOwn(properties, key) && descriptor.enumerable && Object.hasOwn(descriptor, "value"), "INVALID_ARGUMENT", `Unsupported shot field: ${String(key)}`);
    if (Object.hasOwn(authoringSchemas, key)) validateShotInput(authoringSchemas[key], descriptor.value);
  }
}
function checkAuthoringChange(before, input) {
  checkSceneBriefChange(before, input.scene, input.generationBrief !== undefined);
  for (const field of fields) {
    const supplied = field === "effects" ? input.soundDesign !== undefined : input[field] !== undefined;
    const value = field === "effects" ? input.soundDesign?.effects ?? "" : input[field];
    const previous = field === "effects" ? before.soundDesign?.effects ?? "" : before[field] ?? "";
    requireValue(!before.referenceFields?.[field] || !supplied || value === previous || input.referenceFields !== undefined,
      "CONFLICT", `${field} changed: explicitly replace or clear referenceFields after reviewing its wording`);
  }
}
function applyAuthoringFields(shot, input, doc) {
  for (const field of Object.keys(authoringSchemas)) if (input[field] !== undefined) {
    validateShotInput(authoringSchemas[field], input[field]);
    if (input[field] === null) delete shot[field]; else shot[field] = structuredClone(input[field]);
  }
  if (input.generationBrief !== undefined) {
    if (input.generationBrief === null) delete shot.generationBrief;
    else shot.generationBrief = validateDocument(input.generationBrief);
  }
  if (input.referenceFields) for (const field of fields) if (input.referenceFields[field]) {
    const value = authoring.text(input.referenceFields[field], doc.assets);
    requireValue(value.length <= (["lighting", "effects"].includes(field) ? 8000 : 2000), "INVALID_ARGUMENT", `${field} exceeds its text limit`);
    const supplied = field === "effects" ? input.soundDesign !== undefined : input[field] !== undefined;
    const plain = field === "effects" ? input.soundDesign?.effects ?? "" : input[field];
    requireValue(!supplied || value === plain, "CONFLICT", `${field} does not match its reference document`);
    if (field === "effects") shot.soundDesign = { ...shot.soundDesign, music: shot.soundDesign?.music ?? "", effects: value };
    else shot[field] = value;
  }
  validateBriefAssets(shot, doc);
}
function validateAtomicPatch(input, shot, doc) {
  const full = Object.keys(input).some(key => !["id", "shotId", "expectedShotRevision", "generationBrief", "assetIds"].includes(key));
  if (!full) return;
  const keys = ["scene", "generationBrief", "scale", "lighting", "motion", "dialogue", "soundDesign", "referenceFields", "generationSettings", "duration", "assetIds"];
  requireValue(keys.every(key => Object.hasOwn(input, key)), "INVALID_ARGUMENT", "Full editor saves require the complete atomic patch");
  requireValue(input.generationBrief && input.referenceFields && fields.every(field => input.referenceFields[field]) && input.generationSettings,
    "INVALID_ARGUMENT", "Full editor saves require every reference document and generation setting");
  const expected = authoring.patch(authoring.fromShot(input, doc), shot, doc.assets);
  for (const key of ["scene", "lighting", "motion", "dialogue"]) requireValue(expected[key] === input[key], "CONFLICT", `${key} does not match its reference document`);
  requireValue(expected.soundDesign.effects === input.soundDesign?.effects && expected.soundDesign.music === input.soundDesign?.music,
    "CONFLICT", "Sound design differs from the draft or saved music");
  requireValue(expected.assetIds.every(id => input.assetIds.includes(id)), "CONFLICT", "Atomic save must retain existing and referenced assets");
}
module.exports = { authoringSchemas, validateShotInput, checkShotFields, checkAuthoringChange, applyAuthoringFields, validateAtomicPatch };
