"use strict";
const { validateDocument, documentSchema } = require("./reference-document.js");
const { requireValue } = require("./editing-schemas.js");
const generationBriefSchema = { ...documentSchema, type: ["object", "null"],
  description: "Authoritative generation wording with explicit asset/media/role nodes. Whole replacement; omission preserves, null clears. Scene edits must explicitly resubmit or clear an existing brief." };
function referenceNodes(shot) {
  return [shot?.generationBrief, ...Object.values(shot?.referenceFields || {})]
    .flatMap(document => document?.nodes || []).filter(node => node.type === "reference");
}
function briefAssetIds(shot) {
  return [...new Set(referenceNodes(shot).map(node => node.assetId))];
}
function validateBriefAssets(shot, doc) {
  for (const id of briefAssetIds(shot)) {
    requireValue(doc.assets.some(asset => asset.id === id), "NOT_FOUND", "Generation brief asset not found");
    requireValue(shot.assetIds?.includes(id), "INVALID_ARGUMENT", "Generation brief assets must also appear in shot.assetIds");
  }
}
function applyGenerationBrief(shot, value, doc) {
  if (value === null) delete shot.generationBrief;
  else if (value !== undefined) shot.generationBrief = validateDocument(value);
  validateBriefAssets(shot, doc);
}
function checkSceneBriefChange(before, scene, supplied) {
  requireValue(!before.generationBrief || scene === undefined || scene === before.scene || supplied,
    "CONFLICT", "Scene changed: explicitly resubmit or clear generationBrief after reviewing its wording");
}
module.exports = { generationBriefSchema, referenceNodes, briefAssetIds, validateBriefAssets, applyGenerationBrief, checkSceneBriefChange };
