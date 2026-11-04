const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../views/storyboard.js");
const { selection, outputs } = globalThis.BoneStoryboard;
const document = {
  revision: 7,
  episodes: [{ id: "ep1", title: "One" }, { id: "ep2", title: "Two" }, { id: "ep3", title: "Empty" }],
  shots: [{ id: "s1", episodeId: "ep1" }, { id: "s2", episodeId: "ep1" }, { id: "s3", episodeId: "ep2" }],
};

test("episode selection isolates shots and preserves empty episodes", () => {
  assert.deepEqual(selection(document, "ep1", null).shots.map(s => s.id), ["s1", "s2"]);
  assert.equal(selection(document, "ep2", null).shot.id, "s3");
  const empty = selection(document, "ep3", null);
  assert.equal(empty.group.id, "ep3");
  assert.equal(empty.shot, null);
  assert.deepEqual(empty.shots, []);
});
test("a shot link resolves its owning episode; removed selection falls back safely", () => {
  assert.equal(selection(document, "ep1", "s3").group.id, "ep2");
  assert.equal(selection(document, "ep1", "deleted").shot.id, "s1");
  assert.equal(selection(document, "deleted", null).group.id, "ep1");
});
test("legacy unassigned shots remain browseable without mutating the document", () => {
  const legacy = structuredClone(document);
  legacy.shots.push({ id: "orphan" });
  const before = JSON.stringify(legacy);
  const result = selection(legacy, "ep1", "orphan");
  assert.equal(result.group.title, "未归属剧集");
  assert.equal(result.shot.id, "orphan");
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(selection({ episodes: [], shots: [] }).shot, null);
});
const media = [{ id: "i1", kind: "image" }, { id: "v1", kind: "video" }, { id: "v2", kind: "video" }];
const snapshot = { document, media, candidates: [] };
test("image and video adoption remain separate, including legacy mediaId", () => {
  const slots = outputs(snapshot, { id: "s1", mediaId: "i1" });
  assert.equal(slots.find(s => s.kind === "video").status, "未生成");
  assert.equal(slots.find(s => s.kind === "image").adopted.id, "i1");
  const legacyVideo = outputs(snapshot, { id: "s1", mediaId: "v1" });
  assert.equal(legacyVideo[0].adopted.id, "v1");
  assert.equal(legacyVideo[1].adopted, undefined);
  assert.equal(outputs(snapshot, { id: "s1", mediaId: "i1", outputs: { image: null } })[1].adopted, undefined);
});
test("missing or mismatched media is not marked adopted", () => {
  assert.equal(outputs(snapshot, { outputs: { video: "missing" } })[0].status, "素材记录缺失");
  assert.equal(outputs(snapshot, { outputs: { video: "i1" } })[0].adopted, undefined);
});
test("only current ready candidates that change this shot's slot are counted", () => {
  const candidate = (id, shotId, revision = 7, status = "ready", output = "v2") => ({
    id, baseRevision: revision, status, draft: { shots: [{ id: shotId, outputs: { video: output } }] },
  });
  const withCandidates = { ...snapshot, candidates: [
    candidate("valid", "s1"), candidate("other-shot", "s2"), candidate("stale", "s1", 6),
    candidate("failed", "s1", 7, "failed"), candidate("unchanged", "s1", 7, "ready", "v1"),
    candidate("wrong-kind", "s1", 7, "ready", "i1"),
  ] };
  const result = outputs(withCandidates, { id: "s1", outputs: { video: "v1" } });
  assert.deepEqual(result[0].candidates.map(c => c.id), ["valid"]);
  assert.equal(result[0].adopted.id, "v1");
  assert.equal(result[1].candidates.length, 0);
});

const { references } = globalThis.BoneStoryboard;
const frameSnapshot = {
  document: { ...document, assets: [{ id: "first", name: "Entry", mediaId: "i1" }, { id: "last", name: "Exit", mediaId: "i2" }, { id: "wrong", name: "Video", mediaId: "v1" }] },
  media: [...media, { id: "i2", kind: "image" }, { id: "i3", kind: "image" }],
};
test("first/last frame mode resolves two independent asset references", () => {
  const result = references(frameSnapshot, { videoPlan: { mode: "first-last-frame", firstFrameAssetId: "first", lastFrameAssetId: "last" } });
  assert.deepEqual(result.map(item => [item.role, item.media.id]), [["first", "i1"], ["last", "i2"]]);
});
test("missing and wrong-kind frames keep their named slots", () => {
  const result = references(frameSnapshot, { videoPlan: { mode: "first-last-frame", firstFrameAssetId: "wrong", lastFrameAssetId: "deleted" } });
  assert.deepEqual(result.map(item => item.media), [null, null]);
  assert.equal(result[1].title, "尾帧");
  assert.equal(result[1].source, "帧资产不可用");
});
test("current adopted image is reused without adding a duplicate ordinary card", () => {
  const shot = { outputs: { image: "i1" }, videoPlan: { mode: "first-last-frame", firstFrameAssetId: null, lastFrameAssetId: "last" } };
  assert.deepEqual(references(frameSnapshot, shot).map(item => item.role), ["first", "last"]);
  shot.outputs.image = "i3";
  shot.videoPlan.firstFrameAssetId = "first";
  assert.deepEqual(references(frameSnapshot, shot).map(item => item.role), ["first", "last", "image"]);
});
test("one image may fill two frame roles without losing the tail role", () => {
  const result = references(frameSnapshot, { outputs: { image: "i1" }, videoPlan: { mode: "first-last-frame" } });
  assert.deepEqual(result.map(item => [item.role, item.media.id]), [["first", "i1"], ["last", "i1"]]);
});
test("ordinary and image-driven modes remain supported", () => {
  assert.equal(references(frameSnapshot, {})[0].role, "image");
  assert.deepEqual(references(frameSnapshot, { videoPlan: { mode: "image-to-video", firstFrameAssetId: "first" } }).map(item => item.role), ["first"]);
  assert.equal(references(frameSnapshot, { outputs: { image: "i2" }, videoPlan: { mode: "text-to-video" } })[0].media.id, "i2");
});

require("../views/storyboard-controls.js");
require("../views/storyboard-references.js");
const controls = globalThis.BoneStoryboardControls;
const referenceUI = globalThis.BoneStoryboardReferences;
const { createHash, webcrypto } = require("node:crypto");
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("episode-relative moves address the neighbor's absolute document index", () => {
  const doc = { episodes: document.episodes, shots: [document.shots[2], document.shots[0], { id: "other", episodeId: "ep2" }, document.shots[1]] };
  const context = selection(doc, "ep1");
  assert.equal(controls.moveTarget(doc, context, context.shots[0], 1), 3);
  assert.equal(controls.moveTarget(doc, context, context.shots[1], -1), 1);
  assert.equal(controls.moveTarget(doc, context, context.shots[0], -1), null);
  assert.equal(controls.moveTarget(doc, context, context.shots[1], 1), null);
});

test("new shots require an existing selected beat and authored nonempty title/body", () => {
  const production = { ...document, episodes: [{ id: "ep1", script: { beats: [{ id: "beat" }] } }] };
  const context = selection(production, "ep1"), input = { beatId: "beat", title: "  Arrival  ", scene: "Visible action" };
  assert.deepEqual(controls.addPayload({ document: production }, context, input), {
    episodeId: "ep1", expectedProductionRevision: 7, shots: [{ beatId: "beat", title: "Arrival", scene: "Visible action" }],
  });
  for (const invalid of [{ ...input, beatId: "other-episode" }, { ...input, title: " " }, { ...input, scene: " " }, { ...input, scene: "x".repeat(2001) }]) {
    assert.throws(() => controls.addPayload({ document: production }, context, invalid));
  }
});

test("mutations reject double submissions, retain inputs on failure and ignore stale completion", async () => {
  const scope = controls.scope(), ui = controls.create(scope, snapshot, selection(document, "ep1"), {});
  const input = { value: "Authored draft", disabled: false }, error = { textContent: "" }, pending = deferred(); let writes = 0;
  const request = ui.run(() => { writes++; return pending.promise; }, [input], error);
  assert.equal(input.disabled, true);
  assert.equal(await ui.run(() => { writes++; }, [input], error), false);
  pending.reject(Error("Revision conflict")); assert.equal(await request, false);
  assert.equal(writes, 1); assert.equal(input.value, "Authored draft"); assert.equal(input.disabled, false); assert.match(error.textContent, /Revision conflict/);
  const late = deferred(), stale = ui.run(() => late.promise, [input], error);
  controls.beginRender(); late.resolve({ ok: true }); assert.equal(await stale, false); assert.equal(error.textContent, "");
});

test("closing a pending menu restores its still-mounted trigger after a failed write", async () => {
  const scope = controls.scope(), ui = controls.create(scope, snapshot, selection(document, "ep1"), {});
  const trigger = { disabled: false }, pending = deferred(); let open = true;
  const request = ui.run(() => pending.promise, [trigger], { textContent: "" }, () => open && scope.live());
  open = false; pending.reject(Error("Revision conflict")); await request;
  assert.equal(trigger.disabled, false); scope.dispose();
});

function imageFixture() {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
  const record = { id: "pinned", kind: "image", mimeType: "image/png", byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  return { record, value: { kind: "image", mimeType: "image/png", dataUrl: `data:image/png;base64,${bytes.toString("base64")}` },
    reference: { assetId: "asset", mediaId: "pinned", role: "identity" },
    snapshot: { document: { id: "production", assets: [{ id: "asset", name: "Renamed", mediaId: "new", referenceMediaIds: ["pinned"] }] }, media: [record] } };
}
test("hover keeps pinned image versions and verifies exact bytes rather than current adoption", async () => {
  const fixture = imageFixture();
  assert.equal(referenceUI.boundImage(fixture.snapshot, fixture.reference).id, "pinned");
  assert.equal(await referenceUI.verifiedImage(fixture.record, fixture.value), fixture.value.dataUrl);
  await assert.rejects(referenceUI.verifiedImage({ ...fixture.record, sha256: "0".repeat(64) }, fixture.value), /内容已变化/);
  await assert.rejects(referenceUI.verifiedImage({ ...fixture.record, byteLength: 1 }, fixture.value), /字节长度/);
  await assert.rejects(referenceUI.verifiedImage(fixture.record, { ...fixture.value, dataUrl: "https://invalid.example/image.png" }), /数据无效/);
  fixture.snapshot.document.assets[0].referenceMediaIds = [];
  assert.throws(() => referenceUI.boundImage(fixture.snapshot, fixture.reference), /不属于/);
});
test("hover reads deduplicate, bound concurrency and stop queued reads after render disposal", async () => {
  const fixture = imageFixture(), scope = controls.scope(), gates = [deferred(), deferred()]; let reads = 0;
  for (let i = 0; i < 8; i++) { fixture.snapshot.media.push({ ...fixture.record, id: `image${i}` }); fixture.snapshot.document.assets[0].referenceMediaIds.push(`image${i}`); }
  const read = referenceUI.reader(scope, fixture.snapshot, { loadMedia: () => gates[reads++].promise });
  const first = read(fixture.reference), duplicate = read(fixture.reference);
  assert.equal(first, duplicate);
  const requests = [first, ...Array.from({ length: 8 }, (_, index) => read({ ...fixture.reference, mediaId: `image${index}` }))];
  const settled = Promise.allSettled(requests);
  assert.equal(reads, 2); controls.beginRender(); gates.forEach(gate => gate.resolve(fixture.value));
  const results = await settled; assert.equal(reads, 2); assert.equal(results.every(result => result.status === "rejected"), true);
  const fresh = controls.scope(); let repeated = 0;
  const cached = referenceUI.reader(fresh, fixture.snapshot, { loadMedia: async () => { repeated++; return fixture.value; } });
  assert.equal(await cached(fixture.reference), fixture.value.dataUrl); await cached(fixture.reference); assert.equal(repeated, 1); fresh.dispose();
});

// Small DOM boundary fixture: production helpers, renderer and action wiring run unchanged.
function surfaceHarness() {
  const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
  let dom;
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.listeners = []; this.className = ""; this.value = ""; this.disabled = false; this._text = ""; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    append(...children) { for (const child of children) { const element = typeof child === "string" ? dom.createTextNode(child) : child; element.parent = this; this.children.push(element); } }
    prepend(child) { child.parent = this; this.children.unshift(child); }
    replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
    get lastChild() { return this.children.at(-1); }
    get classList() { return { add: value => { this.className += ` ${value}`; }, toggle: (value, enabled) => { this.className = this.className.split(" ").filter(item => item !== value).concat(enabled ? [value] : []).join(" "); } }; }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key === "class") this.className = value; }
    getAttribute(key) { return this.attributes[key]; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(event, fn, options = {}) { this.listeners.push({ event, fn, options }); }
    async fire(event, values = {}) { if (event === "click" && this.disabled) return; for (const listener of this.listeners) if (listener.event === event && !listener.options.signal?.aborted) await listener.fn({ target: this, preventDefault() {}, ...values }); }
    get isConnected() { return this === dom.body || Boolean(this.parent?.isConnected); }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    focus() { dom.activeElement = this; }
    scrollIntoView() { this.scrolled = true; }
    getBoundingClientRect() { return { top: 10, left: 10, bottom: 42, right: 170, width: 160, height: 100 }; }
    showModal() { this.open = true; } close() { this.open = false; }
    querySelectorAll(selector) {
      const matches = element => {
        if (selector === "button:not(:disabled)") return element.tagName === "button" && !element.disabled;
        if (selector.startsWith(".")) return element.className.split(" ").includes(selector.slice(1));
        const attribute = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
        return attribute ? element.getAttribute(attribute[1]) === attribute[2] : element.tagName === selector;
      };
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  dom = new Element("document"); dom.body = new Element("body"); dom.append(dom.body);
  dom.createElement = tag => new Element(tag); dom.createElementNS = (namespace, tag) => { const element = new Element(tag); element.namespaceURI = namespace; return element; };
  dom.createTextNode = text => { const element = new Element("#text"); element.textContent = text; return element; };
  const window = new Element("window"); window.innerWidth = 1440; window.innerHeight = 900;
  const sandbox = vm.createContext({ document: dom, window, AbortController, crypto: webcrypto, atob, console });
  for (const file of ["lib/reference-document.js", "lib/shot-authoring.js", "views/select.js", "views/editorial.js", "views/storyboard-controls.js", "views/storyboard-references.js", "views/storyboard-surface.js", "views/storyboard.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  const fixture = vm.runInContext(`({ document: { id: 'ui-production', revision: 11, kind: 'film', assets: [{id:'asset',name:'Current name'}],
    episodes: [{id:'ep1',title:'Episode one',script:{beats:[{id:'beat',title:'Actual beat',shotIds:['s1','s2']}]}},{id:'ep2',title:'Other episode'}],
    shots: [{id:'other',episodeId:'ep2',title:'Other',scene:'Elsewhere'},
      {id:'s1',episodeId:'ep1',title:'Arrival',scene:'Legacy scene',duration:0,lighting:'Real lighting',motion:'Real motion',dialogue:'Real dialogue',soundDesign:{effects:'Real effects',music:'Preserved music'},
       generationBrief:{schemaVersion:1,nodes:[{type:'text',text:'Authored '},{type:'reference',assetId:'asset',mediaId:'pinned',role:'identity'}]}},
      {id:'other2',episodeId:'ep2',title:'Other two',scene:'Elsewhere'}, {id:'s2',episodeId:'ep1',title:'Next',scene:'Scene fallback',duration:2}] },
      media:[], candidates:[], shotStates:{s1:{revision:3},s2:{revision:4}} })`, sandbox);
  const opened = [], calls = [], previews = [];
  sandbox.BoneGenerationPanel = { open: args => opened.push(args) };
  const actions = { preview: media => { previews.push(media.id); return dom.createElement("media-preview"); }, onShot: id => { selected = id; render(); }, onEpisode: id => { episode = id; selected = null; render(); },
    onCopy: text => calls.push(["copy", text]), onBeat: id => calls.push(["beat", id]), onAsset: asset => calls.push(["asset", asset.id]),
    onUpdateShot: async args => { calls.push(["update", args]); }, onMoveShot: async args => { calls.push(["move", args]); }, onDeleteShot: async args => { calls.push(["delete", args]); },
    onAddShots: async args => { calls.push(["add", args]); }, onExportEpisode: async args => { calls.push(["export", args]); }, loadMedia: async () => { throw Error("No fixture media"); } };
  let page, episode = "ep1", selected = "s1";
  function render() { const context = sandbox.BoneStoryboard.selection(fixture.document, episode, selected); page = sandbox.BoneStoryboard.render(fixture, context, actions); dom.body.replaceChildren(page); }
  render();
  return { sandbox, dom, fixture, actions, opened, calls, previews, render, get page() { return page; }, find: text => dom.querySelectorAll("button").find(button => button.textContent === text) };
}

test("table user path uses actual authoring fields and shared panel focus, then retains card production details", async () => {
  const app = surfaceHarness(), { page } = app;
  assert.equal(page.querySelector(".bw-sidebar"), null);
  assert.equal(page.querySelector(".bw-episode-group").children[0].className, "bw-segment");
  assert.deepEqual(page.querySelectorAll("th").map(th => th.textContent), ["镜号", "时长", "画面描述 · 图片引用", "景别", "光影氛围", "对白·旁白", "音效", "运镜", "操作"]);
  assert.deepEqual(page.querySelectorAll("col").map(col => col.style.width), [60,76,370,100,188,180,180,168,64].map(value => `${value}px`));
  for (const [field, text] of [["body", "Authored @Current name"], ["lighting", "Real lighting"], ["motion", "Real motion"], ["dialogue", "Real dialogue"], ["effects", "Real effects"], ["duration", "0s"]]) {
    const cell = page.querySelectorAll("button").find(button => button.dataset.edit === field && button.dataset.shot === "s1");
    assert.equal(cell.textContent, text); await cell.fire("click"); assert.equal(app.opened.at(-1).focusField, field); assert.equal(app.opened.at(-1).shot.id, "s1");
  }
  assert.equal(page.querySelector(".bw-scale").textContent, "未指定");
  assert.match(page.textContent, /Scene fallback/); assert.doesNotMatch(page.textContent, /Legacy scene|generation-input|编辑正文/);
  await app.find("卡片视图").fire("click"); assert.ok(app.page.querySelector(".bw-sidebar")); assert.ok(app.page.querySelector(".bw-episode-workbench"));
  const details = app.page.querySelector(".bw-card-inspector"); assert.equal(details.querySelectorAll("details").length, 0);
  assert.match(details.textContent, /Preserved music/); assert.match(details.textContent, /Actual beat/); assert.match(details.textContent, /引用资产/);
  assert.equal(details.querySelectorAll(".bw-shot-review").length, 1);
  assert.equal(details.textContent.split("Real dialogue").length - 1, 1); assert.equal(details.textContent.split("Real effects").length - 1, 1);
  await app.find("Actual beat").fire("click"); assert.deepEqual(app.calls.at(-1), ["beat", "beat"]);
  const oldBeat = app.find("Actual beat");
  await app.find("剧本大表").fire("click"); assert.equal(app.page.querySelector(".bw-sidebar"), null);
  const count = app.calls.length; await oldBeat.fire("click"); assert.equal(app.calls.length, count);
  const picker = app.page.querySelector(".bw-episode-picker"); picker.value = "ep2"; await picker.fire("change");
  assert.equal(app.page.querySelectorAll("tbody")[0].children.length, 2); assert.doesNotMatch(app.page.textContent, /Authored/);
  app.sandbox.BoneStoryboard.beginRender();
});

test("table scale and operation menus guard writes, confirm deletion and close on render", async () => {
  const app = surfaceHarness();
  const scale = app.page.querySelector(".bw-scale"); await scale.fire("click"); assert.equal(scale.getAttribute("aria-expanded"), "true");
  await app.find("特写").fire("click"); assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1))), ["update", { shotId: "s1", expectedShotRevision: 3, scale: "特写" }]);
  const more = app.page.querySelectorAll("button").find(button => button.getAttribute("aria-label") === "镜头 1 更多操作");
  await more.fire("click"); await app.find("下移一镜").fire("click");
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1))), ["move", { shotId: "s1", toIndex: 3, expectedProductionRevision: 11 }]);
  await more.fire("click"); await app.find("编辑镜头").fire("click"); assert.equal(app.opened.at(-1).focusField, "body");
  await more.fire("click"); await app.find("删除镜头…").fire("click"); assert.equal(app.calls.some(call => call[0] === "delete"), false);
  await app.find("取消").fire("click"); assert.equal(app.calls.some(call => call[0] === "delete"), false);
  await more.fire("click"); await app.find("删除镜头…").fire("click"); await app.find("确认删除").fire("click");
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1))), ["delete", { shotId: "s1", expectedShotRevision: 3, expectedProductionRevision: 11 }]);
  await scale.fire("click"); app.sandbox.BoneStoryboard.beginRender(); assert.equal(app.dom.querySelector(".bw-menu"), null); assert.equal(scale.getAttribute("aria-expanded"), "false");
});

test("add-shot dialog preserves authored draft after conflict and sends the selected real beat", async () => {
  const app = surfaceHarness(); let attempts = 0;
  app.actions.onAddShots = async args => { attempts++; if (attempts === 1) throw Error("Revision conflict"); app.calls.push(["add", args]); };
  await app.find("＋ 添加镜头").fire("click");
  const dialog = app.dom.querySelector("dialog"), inputs = dialog.querySelectorAll(".bw-control"), save = app.find("添加镜头");
  await save.fire("click"); assert.equal(attempts, 0); assert.match(dialog.textContent, /请选择本集已有/);
  inputs[0].value = "beat"; inputs[1].value = "New authored title"; inputs[2].value = "New authored action";
  await save.fire("click"); assert.match(dialog.textContent, /Revision conflict/); assert.equal(inputs[2].value, "New authored action"); assert.equal(save.disabled, false);
  await save.fire("click"); assert.equal(app.dom.querySelector("dialog"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.at(-1))), ["add", { episodeId: "ep1", expectedProductionRevision: 11, shots: [{ title: "New authored title", scene: "New authored action", beatId: "beat" }] }]);
  app.sandbox.BoneStoryboard.beginRender();
});

test("every structured text field renders current reference names and hover uses exact registered bytes", async () => {
  const app = surfaceHarness(), fixture = imageFixture(), shot = app.fixture.document.shots[1];
  app.fixture.media.push(fixture.record); app.fixture.document.assets[0].referenceMediaIds = ["pinned"];
  const body = shot.generationBrief;
  shot.referenceFields = Object.fromEntries(["lighting", "motion", "dialogue", "effects"].map(field => [field, body]));
  let reads = 0; app.actions.loadMedia = async args => { reads++; assert.equal(args.mediaId, "pinned"); return fixture.value; };
  app.render();
  for (const field of ["body", "lighting", "motion", "dialogue", "effects"]) {
    const cell = app.page.querySelectorAll("button").find(button => button.dataset.edit === field && button.dataset.shot === "s1");
    assert.equal(cell.textContent, "Authored @Current name");
    const token = cell.querySelector(".bw-reference-token"); await token.fire("pointerenter");
    const hover = app.dom.querySelector('[role="tooltip"]'); assert.equal(hover.querySelector("img").src, fixture.value.dataUrl); assert.match(hover.textContent, /身份参考/);
    await token.fire("pointerleave"); assert.equal(app.dom.querySelector('[role="tooltip"]'), null);
  }
  assert.equal(reads, 1);
  const token = app.page.querySelector(".bw-reference-token"), pending = deferred(); app.sandbox.BoneStoryboard.beginRender(); app.render();
  app.actions.loadMedia = () => pending.promise;
  const lateHover = app.page.querySelector(".bw-reference-token").fire("pointerenter"); app.sandbox.BoneStoryboard.beginRender(); await lateHover;
  pending.resolve(fixture.value); assert.equal(app.dom.querySelector('[role="tooltip"]'), null);
  await token.fire("pointerenter"); assert.equal(app.dom.querySelector('[role="tooltip"]'), null);
});

test("card detail route retains adopted outputs, frame plans, candidates, production plans and asset navigation", async () => {
  const app = surfaceHarness(), shot = app.fixture.document.shots[1];
  app.fixture.media.push({ id: "image", kind: "image" }, { id: "video", kind: "video" }, { id: "audio", kind: "audio" }, { id: "candidate-video", kind: "video" });
  shot.outputs = { image: "image", video: "video", audio: "audio" };
  app.fixture.document.assets[0].mediaId = "image"; shot.assetIds = ["asset"];
  shot.videoPlan = { mode: "first-last-frame", firstFrameAssetId: "asset", lastFrameAssetId: "asset", rationale: "Keep frame roles", transitionIn: "match-cut" };
  shot.continuityPlan = { entryState: "Entered", exitState: "Exited", rationale: "Continuous movement", audioTransition: "carry-over", anchors: [{ phase: "contact", state: "Visible contact", assetId: "asset" }] };
  shot.productionPlan = { sourceScene: "Scene 8", purpose: "Visible reveal", requiredEvents: ["Visible result"], generationDurationSeconds: 12, headHandleSeconds: 1, tailHandleSeconds: 2, retimePolicy: "forbidden", editingNotes: "Preserve action" };
  app.fixture.candidates.push({ id: "candidate", baseRevision: 11, status: "ready", summary: "Ready alternative", draft: { shots: [{ id: "s1", outputs: { video: "candidate-video" } }] } });
  app.render();
  const more = app.page.querySelectorAll("button").find(button => button.getAttribute("aria-label") === "镜头 1 更多操作");
  await more.fire("click"); await app.find("本镜素材与制作").fire("click");
  const details = app.page.querySelector(".bw-card-inspector"); assert.equal(details.querySelectorAll("details").length, 0);
  for (const text of ["首帧", "尾帧", "Ready alternative", "Visible contact", "Preserve action", "12s", "Preserved music"]) assert.ok(details.textContent.includes(text), text);
  for (const id of ["image", "video", "audio"]) assert.ok(app.previews.includes(id), id);
  assert.ok(app.page.querySelector(".bw-episode-editorial"));
  assert.equal(details.textContent.split("Preserve action").length - 1, 1);
  assert.equal(app.previews.filter(id => id === "video").length, 1);
  await app.find("Current name").fire("click"); assert.deepEqual(app.calls.at(-1), ["asset", "asset"]);
  app.sandbox.BoneStoryboard.beginRender();
});

test("export preserves selected-episode scope and surfaces failures for retry", async () => {
  const app = surfaceHarness(); let attempts = 0;
  app.actions.onExportEpisode = async args => { attempts++; if (attempts === 1) throw Error("Missing registered image"); app.calls.push(["export", args]); };
  const trigger = app.find("导出本集输入包"); await trigger.fire("click");
  assert.match(app.page.textContent, /Missing registered image/); assert.equal(trigger.disabled, false);
  await trigger.fire("click"); assert.match(app.page.textContent, /本集输入包已导出/);
  const args = app.calls.at(-1)[1]; assert.equal(args.episodeId, "ep1"); assert.deepEqual(Array.from(args.shots, shot => shot.id), ["s1", "s2"]);
  app.sandbox.BoneStoryboard.beginRender();
});

test("episode content is inline and toolbar navigation focuses its scoped heading", async () => {
  const app = surfaceHarness();
  const episode = app.page.querySelector(".bw-episode-workbench"); assert.ok(episode);
  await app.find("本集剪辑与审核").fire("click"); assert.equal(episode.scrolled, true);
  assert.equal(app.dom.activeElement, episode.querySelector("h2"));
  assert.match(episode.textContent, /Episode one/); assert.match(episode.textContent, /剪辑选段与声音轨/);
  assert.doesNotMatch(episode.textContent, /制作约束|本镜质量审核|输出与源素材/);
  assert.equal(app.dom.querySelector("dialog"), null); assert.equal(episode.querySelector("details"), null);
  await app.find("复制本集文本评审指令").fire("click"); assert.match(app.calls.at(-1)[1], /episodeId:\"ep1\"/);
  app.sandbox.BoneStoryboard.beginRender();
});

test("registered shared references are not counted as shot sources or output candidates", () => {
  const app = surfaceHarness(), shot = app.fixture.document.shots[1];
  app.fixture.media = [{ id:"reference",kind:"image" }, { id:"adopted",kind:"video" }, { id:"owned",kind:"video",shotId:shot.id }, { id:"other",kind:"video",shotId:"other" }, { id:"proposed",kind:"video" }];
  shot.outputs = { video:"adopted" };
  app.fixture.candidates = [{ id:"proposal",status:"ready",baseRevision:11,draft:{shots:[{id:shot.id,outputs:{video:"proposed"}}]} }];
  const slots = app.sandbox.BoneStoryboard.outputs(app.fixture, shot);
  const groups = app.sandbox.BoneEditorial.mediaGroups(app.fixture, shot, slots);
  assert.deepEqual(Array.from(groups.local, item => item.id), ["adopted","owned","proposed"]);
  assert.deepEqual(Array.from(groups.shared, item => item.id), ["reference"]);
  assert.equal(slots[0].candidates.length, 1);
  app.sandbox.BoneStoryboard.beginRender();
});

test("AI input context retains field ownership and never invents provider parameters", async () => {
  const app = surfaceHarness(), doc = app.fixture.document, shot = doc.shots[1];
  doc.ratio = "9:16"; doc.style = "Ink wash"; doc.fps = 24; doc.music = "Project score"; doc.voice = "Quiet voice";
  shot.generationSettings = { operation:"video.reference", maxReferenceImages:3 };
  const before = JSON.stringify(app.fixture); app.render(); await app.find("卡片视图").fire("click");
  const input = app.page.querySelector(".bw-input-context");
  for (const value of ["参考图生视频","3 张","9:16","Ink wash","24 FPS","Preserved music","Project score","Quiet voice"]) assert.ok(input.textContent.includes(value), value);
  assert.equal(JSON.stringify(app.fixture), before);
  shot.generationSettings.operation = "image.reference"; app.render();
  assert.doesNotMatch(app.page.querySelector(".bw-input-context").textContent, /24 FPS/);
  assert.match(app.page.querySelector(".bw-input-context").textContent, /本次图片请求/);
  app.sandbox.BoneStoryboard.beginRender();
});
