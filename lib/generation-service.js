"use strict";
const { OPERATIONS, IMAGE_MAX_BYTES } = require("./reference-document.js");
const { compile } = require("./shot-authoring.js");
const { generationBriefSchema, validateBriefAssets, referenceNodes } = require("./generation-brief.js");
const { authoringSchemas, validateShotInput } = require("./shot-authoring-fields.js");
const { planSchemas } = require("./production-plans.js");
const { fingerprint, shotBasis, sourceBasis } = require("./editing-dependencies.js");
const { validateInput } = require("./revision-schemas.js");
const { requireValue } = require("./editing-schemas.js");
const id = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", maxLength: 128 };
const base = { id: { ...id, pattern: "^[a-z0-9][a-z0-9-]{0,63}$", maxLength: 64 }, shotId: id,
  expectedShotRevision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  operation: { type: "string", enum: OPERATIONS }, maxReferenceImages: { type: "integer", minimum: 1, maximum: 8 } };
const required = ["id", "shotId", "expectedShotRevision", "operation"];
const prepareSchema = { type: "object", properties: base, required, additionalProperties: false };
const readSchema = { type: "object", properties: { ...base,
  requestHash: { type: "string", pattern: "^[a-f0-9]{64}$", maxLength: 64 },
  slot: { type: "integer", minimum: 1, maximum: 8 }, offset: { type: "integer", minimum: 0, maximum: IMAGE_MAX_BYTES },
  length: { type: "integer", minimum: 1, maximum: 65536 } },
required: [...required, "requestHash", "slot", "offset", "length"], additionalProperties: false };
const saveSchema = { type: "object", properties: { id: base.id, shotId: id,
  expectedShotRevision: base.expectedShotRevision, generationBrief: generationBriefSchema,
  assetIds: { type: "array", maxItems: 1024, items: id }, ...authoringSchemas,
  scene: { type: "string", minLength: 1, maxLength: 2000 }, motion: { type: "string", maxLength: 2000 },
  dialogue: { type: "string", maxLength: 2000 }, duration: { type: "number", minimum: 0, maximum: 600 }, soundDesign: planSchemas.soundDesign },
  required: ["id", "shotId", "expectedShotRevision"], additionalProperties: false };
function panelDraft(input) {
  const args = validateShotInput(saveSchema, input);
  requireValue(Object.hasOwn(args, "generationBrief"), "INVALID_ARGUMENT", "generationBrief is required");
  return args;
}

function request(snapshot, args) {
  const shot = snapshot.document.shots.find(item => item.id === args.shotId);
  requireValue(shot, "NOT_FOUND", "Shot not found");
  requireValue(snapshot.shotStates?.[shot.id]?.revision === args.expectedShotRevision, "CONFLICT", "Shot revision changed");
  requireValue(shot.generationBrief, "INVALID_ARGUMENT", "Save an explicit generationBrief before preparing a request");
  validateBriefAssets(shot, snapshot.document);
  const compiled = compile({ shot, production: snapshot.document, assets: snapshot.document.assets, media: snapshot.media || [],
    operation: args.operation, maxReferenceImages: args.maxReferenceImages });
  const referenced = [];
  for (const node of referenceNodes(shot)) {
    const asset = snapshot.document.assets.find(item => item.id === node.assetId);
    requireValue(asset.mediaId === node.mediaId || asset.referenceMediaIds?.includes(node.mediaId), "CONFLICT", "Reference image is not associated with this asset");
    requireValue(asset.type !== "声音", "INVALID_ARGUMENT", "Sound assets cannot supply image references");
    const item = (snapshot.media || []).find(item => item.id === node.mediaId);
    requireValue(item, "NOT_FOUND", "Reference media not found");
    requireValue(item.kind === "image", "INVALID_ARGUMENT", "Reference must be an image");
    referenced.push(item);
  }
  const items = compiled.images.map(image => snapshot.media.find(item => item.id === image.mediaId));
  for (const item of referenced) {
    if (item.shotId === undefined && item.shotRevision === undefined) continue;
    requireValue(typeof item.shotId === "string" && Number.isSafeInteger(item.shotRevision) && item.shotRevision > 0 &&
      snapshot.document.shots.some(source => source.id === item.shotId) && snapshot.shotStates?.[item.shotId]?.revision === item.shotRevision,
    "CONFLICT", "Reference image has missing or stale source-shot provenance");
  }
  const productionRevision = snapshot.document.revision, shotRevision = args.expectedShotRevision;
  requireValue(Number.isSafeInteger(productionRevision) && productionRevision > 0, "INVALID_ARGUMENT", "Invalid production revision");
  const requestHash = fingerprint({ schemaVersion: 1, id: args.id, shotId: shot.id, productionRevision, shotRevision,
    maxReferenceImages: args.maxReferenceImages ?? shot.generationSettings?.maxReferenceImages ?? 8, compiled, shot: shotBasis(snapshot, shot.id),
    sources: referenced.map(item => sourceBasis(snapshot, item.id)) });
  return { compiled, productionRevision, shotRevision, requestHash, items };
}
function createGenerationService({ readSnapshot, mediaService, updateShot }) {
  async function saveDraft(input) {
    const args = panelDraft(input);
    requireValue(typeof updateShot === "function", "UNAVAILABLE", "Shot editor is unavailable");
    return updateShot(args);
  }
  async function fresh(args, hash) {
    const result = request(await readSnapshot(args.id), args);
    requireValue(!hash || result.requestHash === hash, "CONFLICT", "Generation request changed; prepare again");
    return result;
  }
  async function prepare(input) {
    validateInput(prepareSchema, input);
    const args = Object.freeze(structuredClone(input));
    const initial = await fresh(args);
    for (const item of initial.items) {
      await mediaService.verifyImage({ id: args.id, item });
      await fresh(args, initial.requestHash);
    }
    const { items, ...result } = await fresh(args, initial.requestHash);
    return result;
  }
  async function readImage(input) {
    validateInput(readSchema, input);
    const args = Object.freeze(structuredClone(input));
    const initial = await fresh(args, args.requestHash);
    const image = initial.compiled.images[args.slot - 1];
    requireValue(image, "INVALID_ARGUMENT", "Slot is not part of this request");
    const item = initial.items[args.slot - 1];
    const chunk = await mediaService.readImageRange({ id: args.id, item, offset: args.offset, length: args.length });
    await fresh(args, args.requestHash);
    return { slot: image.slot, mediaId: image.mediaId, sha256: image.sha256, mimeType: image.mimeType, byteLength: image.byteLength, ...chunk };
  }
  return { prepare, readImage, saveDraft, tools: [
    { name: "prepare_shot_generation", risk: "low", schema: prepareSchema, execute: prepare,
      description: "Compile a saved generationBrief and verify its registered image bytes against current revisions. Returns compiled prompt/ordered slots and a requestHash for read_generation_image. Read-only handoff; never submits to a provider." },
    { name: "read_generation_image", risk: "low", schema: readSchema, execute: readImage,
      description: "Read at most 64 KiB of one prepared reference image as base64. Rechecks requestHash and shot revision against fresh storage. Assemble decoded chunks, verify SHA-256, then use an authorized external generator; no private paths or provider submission." },
  ] };
}
module.exports = { createGenerationService };
