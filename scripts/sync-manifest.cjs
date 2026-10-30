"use strict";
// Derive public descriptors from runtime registration in an isolated mock host.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const mode = process.argv[2] || "--check";
  if (!["--check", "--write"].includes(mode) || process.argv.length > 3) {
    throw new Error("Usage: node scripts/sync-manifest.cjs [--check|--write]");
  }
  const root = path.resolve(__dirname, "..");
  const manifestPath = path.join(root, "manifest.json");
  const viewPath = path.join(root, "views/workshop.html");
  const manifestText = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const view = await fs.readFile(viewPath, "utf8");
  const stamp = /(<meta name="bone-build" content=")[^"]*(")/g;
  if ([...view.matchAll(stamp)].length !== 1) throw new Error("Expected exactly one bone-build meta tag");
  const scratch = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), "bone-manifest-"));
  const tools = new Map();
  globalThis.pi = {
    plugin: { getDataPath: async () => scratch, getManifest: async () => manifest },
    commands: { register: async () => {}, unregister: async () => {} },
    agent: { registerTool: async tool => tools.set(tool.name, tool), unregisterTool: async () => {} },
    ui: { revealView: async () => {} },
  };
  const plugin = require(path.join(root, "main.js"));
  try {
    await plugin.onLoad();
    if (!tools.size) throw new Error("No tools registered");
    const descriptors = [...tools.values()].map(({ name, description, risk, schema }) => ({ name, description, risk, schema }));
    const toolsMatch = JSON.stringify(descriptors) === JSON.stringify(manifest.contributes.agentTools);
    const stamped = view.replace(stamp, (_match, start, end) => `${start}${manifest.version}${end}`);
    if (mode === "--check") {
      if (!toolsMatch || stamped !== view) throw new Error("Manifest or view stamp drift; run with --write");
      console.log(`Manifest and view stamp match ${tools.size} runtime tools (${manifest.version})`);
    } else {
      if (!toolsMatch) {
        manifest.contributes.agentTools = descriptors;
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      }
      if (stamped !== view) await fs.writeFile(viewPath, stamped);
      console.log(`Synchronized ${tools.size} tools and view stamp (${manifest.version})`);
    }
  } finally {
    try { await plugin.onUnload(); }
    finally { delete globalThis.pi; await fs.rm(scratch, { recursive: true, force: true }); }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
