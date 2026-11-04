(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FilmReferenceDocument = factory();
})(globalThis, function () {
  "use strict";
  const ROLES = ["identity", "scene", "prop", "style", "first-frame", "last-frame"];
  const OPERATIONS = ["image.generate", "image.reference", "video.text", "video.reference", "video.image", "video.first-last"];
  const IMAGE_MAX_BYTES = 32 * 1024 * 1024;
  const ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$";
  function requireValue(ok, code, message) { if (!ok) throw Object.assign(new Error(message), { code }); }
  function object(value, keys, name) {
    requireValue(value && typeof value === "object" && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), "INVALID_ARGUMENT", `${name} must be an object`);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      requireValue(keys.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, "value"), "INVALID_ARGUMENT", `${name} has an unsupported property`);
    }
  }
  function identifier(value) {
    requireValue(typeof value === "string" && new RegExp(ID_PATTERN).test(value), "INVALID_ARGUMENT", "Invalid reference identifier");
    return value;
  }
  function validateDocument(doc) {
    object(doc, ["schemaVersion", "nodes"], "document");
    requireValue(doc.schemaVersion === 1 && Array.isArray(doc.nodes), "INVALID_ARGUMENT", "Expected schemaVersion 1 and nodes array");
    requireValue(doc.nodes.length <= 256, "LIMIT_EXCEEDED", "At most 256 reference document nodes");
    requireValue(Object.keys(doc.nodes).length === doc.nodes.length, "INVALID_ARGUMENT", "Nodes must be a dense array without extra fields");
    let totalText = 0;
    const nodes = Array.from(doc.nodes, node => {
      object(node, node?.type === "text" ? ["type", "text"] : ["type", "assetId", "mediaId", "role"], "node");
      if (node.type === "text") {
        requireValue(typeof node.text === "string", "INVALID_ARGUMENT", "Text node needs text");
        totalText += node.text.length;
        requireValue(totalText <= 24000, "LIMIT_EXCEEDED", "Document text exceeds 24000 characters");
        return { type: "text", text: node.text };
      }
      requireValue(node.type === "reference" && ROLES.includes(node.role), "INVALID_ARGUMENT", "Invalid reference type or role");
      return { type: "reference", assetId: identifier(node.assetId), mediaId: identifier(node.mediaId), role: node.role };
    });
    return { schemaVersion: 1, nodes };
  }
  function unique(items, id, name) {
    const matches = items.filter(item => item?.id === id);
    requireValue(matches.length > 0, "NOT_FOUND", `${name} not found: ${id}`);
    requireValue(matches.length === 1, "INVALID_ARGUMENT", `Ambiguous ${name} identifier`);
    return matches[0];
  }
  function imageMetadata(item) {
    requireValue(item.kind === "image" && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(item.mimeType) &&
      typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256) && Number.isSafeInteger(item.byteLength) && item.byteLength > 0,
    "INVALID_ARGUMENT", "Reference must have registered image type, SHA-256 and byte length");
    requireValue(item.byteLength <= IMAGE_MAX_BYTES, "LIMIT_EXCEEDED", "Image exceeds 32 MiB");
  }
  function compile(input) {
    object(input, ["document", "assets", "media", "operation", "maxReferenceImages"], "compile input");
    return compileNodes(input, validateDocument(input.document));
  }
  function compileDocuments(input) {
    object(input, ["documents", "assets", "media", "operation", "maxReferenceImages"], "compile documents input");
    requireValue(Array.isArray(input.documents) && input.documents.length <= 40, "INVALID_ARGUMENT", "Expected at most 40 documents");
    return compileNodes(input, { nodes: input.documents.flatMap(document => validateDocument(document).nodes) });
  }
  function compileNodes(input, doc) {
    const { assets, media, operation, maxReferenceImages = 8 } = input;
    requireValue(OPERATIONS.includes(operation), "INVALID_ARGUMENT", "Unknown generation operation");
    requireValue(Number.isInteger(maxReferenceImages) && maxReferenceImages >= 1 && maxReferenceImages <= 8,
      "INVALID_ARGUMENT", "maxReferenceImages must be 1..8");
    requireValue(Array.isArray(assets) && Array.isArray(media), "INVALID_ARGUMENT", "Assets and media must be arrays");
    requireValue(!doc.nodes.some(node => node.type === "text" && node.text.includes("@")), "UNRESOLVED_REFERENCE", "Resolve every @ mention into a reference node");
    const entries = new Map();
    let referenceCount = 0;
    for (const node of doc.nodes) {
      if (node.type !== "reference") continue;
      referenceCount++;
      const asset = unique(assets, node.assetId, "Asset"), item = unique(media, node.mediaId, "Media");
      requireValue(typeof asset.name === "string" && !!asset.name.trim() && asset.name.length <= 60, "INVALID_ARGUMENT", "Asset needs a bounded name");
      imageMetadata(item);
      if (!entries.has(item.id)) entries.set(item.id, { mediaId: item.id, assetIds: [], roles: [], mimeType: item.mimeType,
        sha256: item.sha256, byteLength: item.byteLength, mentions: [] });
      const entry = entries.get(item.id);
      if (!entry.assetIds.includes(asset.id)) entry.assetIds.push(asset.id);
      if (!entry.roles.includes(node.role)) entry.roles.push(node.role);
      if (!entry.mentions.some(mention => mention.assetId === asset.id && mention.role === node.role)) entry.mentions.push({ assetId: asset.id, name: asset.name, role: node.role });
    }
    let ordered = [...entries.values()];
    requireValue(ordered.length <= maxReferenceImages, "LIMIT_EXCEEDED", "Too many reference images for this request");
    const mode = ok => requireValue(ok, "UNSUPPORTED_REFERENCE_MODE", "Reference count or roles are incompatible with the operation");
    if (["image.generate", "video.text"].includes(operation)) mode(ordered.length === 0);
    if (["image.reference", "video.reference"].includes(operation)) mode(ordered.length >= 1);
    if (operation === "video.image") mode(ordered.length === 1 && ordered[0].roles.length === 1 && ordered[0].roles[0] === "first-frame");
    if (operation === "video.first-last") {
      mode(ordered.length === 2 && ordered.every(entry => entry.roles.length === 1) &&
        ordered.some(entry => entry.roles[0] === "first-frame") && ordered.some(entry => entry.roles[0] === "last-frame") && ordered[0].sha256 !== ordered[1].sha256);
      ordered = ordered.slice().sort((a, b) => (a.roles[0] === "first-frame" ? 0 : 1) - (b.roles[0] === "first-frame" ? 0 : 1));
    }
    const images = ordered.map(({ mentions, ...entry }, index) => ({ slot: index + 1, ...entry }));
    let prompt = doc.nodes.map(node => node.type === "text" ? node.text :
      `${unique(assets, node.assetId, "Asset").name}〔图${images.find(image => image.mediaId === node.mediaId).slot}〕`).join("");
    if (images.length) prompt += "\n\nReference images:\n" + ordered.map((entry, index) =>
      `图${index + 1}: ${entry.mentions.map(mention => `${mention.name} [${mention.role}]`).join("; ")}`).join("\n");
    return { schemaVersion: 1, operation, prompt, images, referenceCount };
  }
  const idSchema = { type: "string", pattern: ID_PATTERN, maxLength: 128 };
  const documentSchema = { type: "object", properties: {
    schemaVersion: { type: "integer", const: 1 }, nodes: { type: "array", maxItems: 256, items: { oneOf: [
      { type: "object", properties: { type: { const: "text", type: "string" }, text: { type: "string", maxLength: 24000 } }, required: ["type", "text"], additionalProperties: false },
      { type: "object", properties: { type: { const: "reference", type: "string" }, assetId: idSchema, mediaId: idSchema, role: { type: "string", enum: ROLES } }, required: ["type", "assetId", "mediaId", "role"], additionalProperties: false },
    ] } },
  }, required: ["schemaVersion", "nodes"], additionalProperties: false };
  return { validateDocument, compile, compileDocuments, documentSchema, ROLES, OPERATIONS, IMAGE_MAX_BYTES };
});
