"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
let html = fs.readFileSync(path.join(root, "design/reference-prototype.template.html"), "utf8");
for (const [marker, file] of [
  ["/*__REFERENCE_COMPILER__*/", "lib/reference-document.js"],
  ["/*__REFERENCE_EDITOR__*/", "views/reference-editor.js"],
  ["/*__REFERENCE_APP__*/", "design/reference-prototype.js"],
]) {
  if (html.split(marker).length !== 2) throw Error(`Expected one marker: ${marker}`);
  const script = fs.readFileSync(path.join(root, file), "utf8");
  new vm.Script(script, { filename: file });
  html = html.replace(marker, () => script.replace(/<\/script/gi, "<\\/script"));
}
const output = path.join(root, "views/shot-table-prototype.html");
if (process.argv.includes("--check")) {
  if (fs.readFileSync(output, "utf8") !== html) throw Error("Prototype is stale; run scripts/build-reference-prototype.cjs");
  console.log("Reference prototype matches shared compiler/editor sources");
} else {
  fs.writeFileSync(output, html);
  console.log(`Built ${output}`);
}
