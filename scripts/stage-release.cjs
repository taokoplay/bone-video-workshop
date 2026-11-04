"use strict";
// Stage a clean installable source tree; PluginPack owns archive creation.
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
async function main() {
  if (process.argv.length !== 3) throw Error("Usage: node scripts/stage-release.cjs <empty-output-directory>");
  const root = path.resolve(__dirname, ".."), destination = path.resolve(process.argv[2]);
  if (destination === root || root.startsWith(destination + path.sep)) throw Error("Output must not contain the source tree");
  await fs.mkdir(destination, { recursive:true });
  if ((await fs.readdir(destination)).length) throw Error("Output directory must be empty");
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd:root }).toString().split("\0").filter(Boolean);
  const top = new Set(["manifest.json", "main.js", "LICENSE", "README.md", "README.zh-CN.md", "CHANGELOG.md"]);
  const selected = files.filter(file => top.has(file) || /^(lib|views|skills|docs)\//.test(file))
    .filter(file => file !== "views/shot-table-prototype.html").sort();
  if (!selected.includes("manifest.json") || !selected.includes("LICENSE")) throw Error("Missing package metadata or license");
  for (const relative of selected) {
    const source = path.join(root, relative), stat = await fs.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Release input is not a regular file: ${relative}`);
    const target = path.join(destination, relative); await fs.mkdir(path.dirname(target), { recursive:true }); await fs.copyFile(source, target);
  }
  const manifest = JSON.parse(await fs.readFile(path.join(destination, "manifest.json"), "utf8"));
  console.log(`Staged ${manifest.id}@${manifest.version}: ${selected.length} files at ${destination}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
