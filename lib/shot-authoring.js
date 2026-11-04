(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./reference-document.js"));
  else root.FilmShotAuthoring = factory(root.FilmReferenceDocument);
})(globalThis, function (references) {
  "use strict";
  const SCALES = Object.freeze(["大远景", "全景", "中景", "中近景", "近景", "半身景", "特写", "极特写"]);
  const FIELDS = Object.freeze(["body", "lighting", "motion", "dialogue", "effects"]);
  const LIMITS = { body: 2000, lighting: 8000, motion: 2000, dialogue: 2000, effects: 8000 };
  function requireValue(ok, message) { if (!ok) throw Object.assign(new Error(message), { code: "INVALID_ARGUMENT" }); }
  function plain(value) { return { schemaVersion: 1, nodes: [{ type: "text", text: value ?? "" }] }; }
  function fromShot(shot, production = {}) {
    const result = { body: references.validateDocument(shot.generationBrief ?? plain(shot.scene)) };
    for (const field of FIELDS.slice(1)) result[field] = references.validateDocument(shot.referenceFields?.[field] ??
      plain(field === "effects" ? shot.soundDesign?.effects : shot[field]));
    return { ...result, scale: shot.scale ?? "", duration: shot.duration ?? 0,
      operation: shot.generationSettings?.operation ?? (production.kind === "image" ? "image.generate" : "video.text"),
      maxReferenceImages: shot.generationSettings?.maxReferenceImages ?? 8 };
  }
  function validateDraft(draft) {
    const keys = [...FIELDS, "scale", "duration", "operation", "maxReferenceImages"];
    requireValue(draft && typeof draft === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(draft)), "Expected an authoring draft");
    requireValue(Reflect.ownKeys(draft).length === keys.length && Reflect.ownKeys(draft).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(draft, key);
      return keys.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, "value");
    }), "Draft has missing or unsupported fields");
    const result = {};
    for (const field of FIELDS) {
      result[field] = references.validateDocument(draft[field]);
      const length = result[field].nodes.reduce((sum, node) => sum + (node.type === "text" ? node.text.length : 0), 0);
      requireValue(length <= LIMITS[field], `${field} exceeds ${LIMITS[field]} characters; shorten the draft before saving`);
    }
    requireValue(draft.scale === "" || SCALES.includes(draft.scale), "Unknown shot scale");
    requireValue(Number.isFinite(draft.duration) && draft.duration >= 0 && draft.duration <= 600, "duration must be 0..600");
    requireValue(references.OPERATIONS.includes(draft.operation), "Unknown generation operation");
    requireValue(Number.isInteger(draft.maxReferenceImages) && draft.maxReferenceImages >= 1 && draft.maxReferenceImages <= 8, "maxReferenceImages must be 1..8");
    return { ...result, scale: draft.scale, duration: draft.duration, operation: draft.operation, maxReferenceImages: draft.maxReferenceImages };
  }
  function text(document, assets = []) {
    return references.validateDocument(document).nodes.map(node => {
      if (node.type === "text") return node.text;
      const matches = assets.filter(asset => asset.id === node.assetId);
      requireValue(matches.length === 1 && typeof matches[0].name === "string", `Reference asset is missing or ambiguous: ${node.assetId}`);
      return matches[0].name;
    }).join("");
  }
  function patch(draft, shot, assets = []) {
    const value = validateDraft(draft), strings = {};
    for (const field of FIELDS) {
      strings[field] = text(value[field], assets);
      requireValue(strings[field].length <= LIMITS[field], `${field} exceeds ${LIMITS[field]} characters including reference names`);
    }
    requireValue(!!strings.body.trim(), "Shot body cannot be empty");
    return { scene: strings.body, generationBrief: value.body, scale: value.scale, lighting: strings.lighting,
      motion: strings.motion, dialogue: strings.dialogue,
      soundDesign: { ...shot.soundDesign, music: shot.soundDesign?.music ?? "", effects: strings.effects },
      referenceFields: Object.fromEntries(FIELDS.slice(1).map(field => [field, value[field]])),
      generationSettings: { operation: value.operation, maxReferenceImages: value.maxReferenceImages }, duration: value.duration,
      assetIds: [...new Set([...(shot.assetIds || []), ...FIELDS.flatMap(field => value[field].nodes.filter(node => node.type === "reference").map(node => node.assetId))])] };
  }
  function compile({ shot, production = {}, assets = [], media = [], operation, maxReferenceImages }) {
    const draft = fromShot(shot, production);
    operation = operation ?? draft.operation;
    maxReferenceImages = maxReferenceImages ?? draft.maxReferenceImages;
    requireValue(references.OPERATIONS.includes(operation), "Unknown generation operation");
    requireValue(Array.isArray(assets) && Array.isArray(media), "Assets and media must be arrays");
    const video = operation.startsWith("video.");
    const documents = [draft.body], parameters = {}, omittedFields = [];
    const authored = field => draft[field].nodes.some(node => node.type === "reference" || node.text.trim());
    function append(label, document) { documents.push(plain(`\n\n${label}: `), document); }
    if (draft.scale) append("Scale", plain(draft.scale));
    if (authored("lighting")) append("Lighting", draft.lighting);
    for (const field of ["motion", "dialogue", "effects"]) {
      if (!authored(field)) continue;
      if (video) append({ motion: "Camera motion", dialogue: "Dialogue / narration", effects: "Sound effects" }[field], draft[field]);
      else omittedFields.push(field);
    }
    for (const [field, label, value] of [["soundDesign.music", "Shot music", shot.soundDesign?.music], ["voice", "Project voice", production.voice], ["music", "Project music", production.music]]) {
      if (!value) continue;
      if (video) append(label, plain(value)); else omittedFields.push(field);
    }
    for (const field of ["ratio", "style"]) if (typeof production[field] === "string" && production[field]) {
      parameters[field] = production[field]; append(field === "ratio" ? "Ratio" : "Style", plain(production[field]));
    }
    const timed = [["duration", "editDurationSeconds", shot.duration, "Editorial budget (seconds)"],
      ["productionPlan.generationDurationSeconds", "requestedDurationSeconds", shot.productionPlan?.generationDurationSeconds, "Requested source duration (seconds)"],
      ["productionPlan.headHandleSeconds", "headHandleSeconds", shot.productionPlan?.headHandleSeconds, "Head handle (seconds)"],
      ["productionPlan.tailHandleSeconds", "tailHandleSeconds", shot.productionPlan?.tailHandleSeconds, "Tail handle (seconds)"],
      ["fps", "fps", production.fps, "FPS"]];
    for (const [field, parameter, value, label] of timed) if (Number.isFinite(value) && (field !== "fps" || value > 0)) {
      if (video) { parameters[parameter] = value; append(label, plain(String(value))); }
      else omittedFields.push(field);
    }
    for (const document of documents) for (const node of document.nodes) if (node.type === "reference") {
      const asset = assets.find(item => item.id === node.assetId);
      if (!asset) throw Object.assign(new Error("Reference asset not found"), { code: "NOT_FOUND" });
      if (asset.mediaId !== node.mediaId && !asset.referenceMediaIds?.includes(node.mediaId)) {
        throw Object.assign(new Error("Reference image is not associated with this asset"), { code: "CONFLICT" });
      }
      requireValue(asset.type !== "声音", "Sound assets cannot supply image references");
    }
    return { ...references.compileDocuments({ documents, assets, media, operation, maxReferenceImages }), parameters, omittedFields };
  }
  return { SCALES, FIELDS, fromShot, validateDraft, text, patch, compile };
});
