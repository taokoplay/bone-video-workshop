"use strict";
const { validateShotInput } = require("./shot-authoring-fields.js");
const revision = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
function createShotPanel({ getTools, add, update, move, deleteShot }) {
  const channels = { "bone.shot.add": ["add_shots", add, ["expectedProductionRevision", "episodeId"]],
    "bone.shot.update": ["update_shot", update, ["expectedShotRevision"]],
    "bone.shot.move": ["move_shot", move, ["expectedProductionRevision"]],
    "bone.shot.delete": ["delete_shot", deleteShot, ["expectedProductionRevision", "expectedShotRevision"]] };
  return (channel, input) => {
    const [name, execute, required] = channels[channel];
    const schema = structuredClone(getTools().find(tool => tool.name === name).schema);
    schema.required = [...new Set([...schema.required, ...required])];
    for (const key of required.filter(key => key.startsWith("expected"))) schema.properties[key] = revision;
    const fields = name === "add_shots" ? schema.properties.shots.items.properties : schema.properties;
    for (const [field, maxLength] of [["title", 80], ["scene", 2000], ["motion", 2000], ["dialogue", 2000]]) {
      if (fields[field]) fields[field] = { type: "string", maxLength, ...(["title", "scene"].includes(field) ? { minLength: 1 } : {}) };
    }
    if (fields.duration) fields.duration = { type: "number", minimum: 0, maximum: 600 };
    if (name === "add_shots") schema.properties.episodeId = { type: "string", minLength: 1, maxLength: 128 };
    if (fields.assetIds) fields.assetIds.maxItems = 1024;
    if (schema.properties.toIndex) schema.properties.toIndex = { type: "integer", minimum: 0, maximum: 499 };
    const args = validateShotInput(schema, input);
    return execute(args);
  };
}
function checkProductionRevision(snapshot, args) {
  if (args.expectedProductionRevision !== undefined && snapshot.document.revision !== args.expectedProductionRevision) {
    throw Object.assign(new Error("Production changed; refresh before editing shots"), { code: "CONFLICT" });
  }
}
module.exports = { createShotPanel, checkProductionRevision };
