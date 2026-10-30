"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRevisionService, publicRevisionPlan, revisionStatus } = require("../lib/revision-service.js");
const { contentFingerprint } = require("../lib/revision-status.js");
const { createEditorialService } = require("../lib/editing-service.js");
const { editorialStatus } = require("../lib/editorial-status.js");
const clone = structuredClone;
function initial() {
  return { document: { id: "pr_test", revision: 1, createdAt: 1, updatedAt: 1, title: "Arrival", kind: "film", fps: 24, ratio: "16:9",
    brief: "Reunion", arc: "Reconcile", style: "Natural", projectBible: { rules: "No magic" },
    episodes: [{ id: "ep_one", title: "Home", script: { prose: "INT. HOUSE", beats: [{ id: "bt_one", title: "Enter", synopsis: "Enter house", purpose: "setup", shotIds: ["sh_one"] }] } },
      { id: "ep_two", title: "Road" }], assets: [{ id: "as_one", description: "Blue coat", locked: false }, { id: "as_locked", description: "Red coat", locked: true }],
    shots: [{ id: "sh_one", title: "Enter", scene: "Door opens", episodeId: "ep_one", beatId: "bt_one", duration: 3, assetIds: ["as_one"], outputs: { video: "md_one" }, mediaId: "md_image" },
      { id: "sh_two", title: "Reply", scene: "A glance", episodeId: "ep_one", duration: 2, assetIds: [] },
      { id: "sh_three", title: "Exit", scene: "Exit", episodeId: "ep_one", duration: 2, assetIds: [] },
      { id: "sh_other", title: "Road", scene: "Road", episodeId: "ep_two", duration: 1, assetIds: [] }] },
    shotStates: Object.fromEntries(["sh_one", "sh_two", "sh_three", "sh_other"].map(id => [id, { revision: 1, outputVersion: 7, outputRevisions: { image: 1, video: 1 }, needsUpdate: false }])),
    media: [{ id: "md_one", kind: "video", sha256: "a".repeat(64), shotId: "sh_one", shotRevision: 1, fileName: "unused.mp4" },
      { id: "md_image", kind: "image", sha256: "b".repeat(64), shotId: "sh_one", shotRevision: 1 }], mediaInspections: {}, reviews: [], editPlans: {} };
}
function fixture(seed = initial(), { liveQueue = false } = {}) {
  let snapshot = clone(seed), sequence = 0, tail = Promise.resolve(), writes = 0, marks = [];
  const host = { readSnapshot: async id => { assert.equal(id, "pr_test"); return snapshot; }, newId: prefix => `${prefix}_${++sequence}`,
    markShotDirty(candidate, id) {
      marks.push(id);
      const state = candidate.shotStates[id];
      if (state) { state.revision++; state.needsUpdate = true; }
      else candidate.shotStates[id] = { revision: 1, outputVersion: 0, needsUpdate: true };
    },
    mutateProduction(id, mutate) {
      const next = tail.then(async () => {
        assert.equal(id, "pr_test");
        const candidate = liveQueue ? snapshot : clone(snapshot);
        const result = await mutate(candidate);
        candidate.document.revision++;
        candidate.document.updatedAt++;
        snapshot = clone(candidate); writes++;
        return { ...result, revision: snapshot.document.revision };
      });
      tail = next.catch(() => {});
      return next;
    } };
  const service = createRevisionService(host), editorial = createEditorialService(host);
  const call = (name, args = {}) => [...service.tools, ...editorial.tools].find(tool => tool.name === name).execute({ id: "pr_test",
    ...(name === "get_revision_plan" ? {} : { expectedProductionRevision: snapshot.document.revision }), ...args });
  return { service, call, get snapshot() { return snapshot; }, get writes() { return writes; }, get marks() { return marks; },
    save: (changes = [change("shot", "sh_one", "dialogue", "Hello")], extra = {}) => call("save_revision_plan", { title: "Clarify reunion", intent: "story", instruction: "Clarify without changing events", preserve: ["Keep the reunion"], reviewIds: [], changes, ...extra }),
    apply: (planId, extra = {}) => call("apply_revision_plan", { planId, confirm: true, authorization: "User requested applying this plan to pr_test", ...extra }),
    restore: (planId, extra = {}) => call("restore_revision_plan", { planId, confirm: true, authorization: "User requested restoring this plan in pr_test", ...extra }),
    get: planId => call("get_revision_plan", { planId }),
    review: (extra = {}) => call("record_review", { scope: { kind: "shot", shotId: "sh_one" }, category: "text", verdict: "needs-revision", evidence: [], findings: "Dialogue is unclear", nextAction: "Clarify wording", ...extra }),
  };
}
function change(targetType, targetId, field, value, extra = {}) {
  return { targetType, targetId, field, replacementJson: JSON.stringify(value), sourceIssue: "Dialogue clarity", reason: "Make intent visible", acceptanceCriteria: "Check meaning and continuity", ...extra };
}
async function rejectsUnchanged(f, action, code = "INVALID_ARGUMENT") {
  const before = clone(f.snapshot), writes = f.writes;
  await assert.rejects(action, error => { assert.equal(error.code, code); return true; });
  assert.deepEqual(f.snapshot, before); assert.equal(f.writes, writes);
}

test("stage/read/apply/restore lifecycle preserves unrelated content, histories and stale media provenance", async () => {
  const f = fixture(); const review = await f.review();
  const original = clone(f.snapshot);
  const saved = await f.save([change("production", null, "brief", "A clear reunion"), change("episode", "ep_one", "prose", "INT. HOUSE - DAY"),
    change("beat", "bt_one", "synopsis", "Recognize the visitor"), change("asset", "as_one", "description", "Worn blue coat"), change("shot", "sh_one", "dialogue", "You came back")], { reviewIds: [review.review.id] });
  assert.equal(saved.revision, 3); assert.equal(saved.plan.baseProductionRevision, 2);
  assert.equal(saved.plan.current, true); assert.equal(saved.plan.canApply, true);
  const document = clone(f.snapshot.document); document.revision = original.document.revision; document.updatedAt = original.document.updatedAt;
  assert.deepEqual(document, original.document);
  for (const key of ["shotStates", "media", "reviews", "editPlans", "mediaInspections"]) assert.deepEqual(f.snapshot[key], original[key]);
  const planId = saved.planId;
  assert.deepEqual(await f.get(planId), saved.plan);
  assert.deepEqual(saved.plan.changes[4], { ...change("shot", "sh_one", "dialogue", "You came back"), beforeExists: false, before: null, afterExists: true, after: "You came back" });
  const applied = await f.apply(planId);
  assert.equal(applied.revision, 4); assert.equal(applied.status, "applied"); assert.equal(applied.changedFields.length, 5);
  assert.deepEqual(applied.dirtyShotIds, ["sh_one", "sh_two", "sh_three", "sh_other"]);
  assert.deepEqual(f.marks, applied.dirtyShotIds);
  assert.equal(f.snapshot.document.shots[0].dialogue, "You came back");
  assert.equal(f.snapshot.document.assets[0].description, "Worn blue coat");
  assert.equal(f.snapshot.document.episodes[0].script.prose, "INT. HOUSE - DAY");
  assert.equal((await f.get(planId)).canRestore, true);
  assert.equal(f.snapshot.revisionPlans[0].appliedProductionRevision, 4);
  assert.equal(editorialStatus(f.snapshot).reviews[0].current, false);
  await rejectsUnchanged(f, () => f.apply(planId), "CONFLICT");
  await f.review({ findings: "Post-apply observation" });
  f.snapshot.mediaInspections.md_one = { sha256: "a".repeat(64), durationSeconds: 8, findings: "New measurement" };
  const laterPlan = await f.save([change("shot", "sh_two", "dialogue", "Wait")]);
  const histories = clone({ reviews: f.snapshot.reviews, media: f.snapshot.media, mediaInspections: f.snapshot.mediaInspections });
  const restored = await f.restore(planId);
  assert.equal(restored.status, "restored");
  const restoredDocument = clone(f.snapshot.document); restoredDocument.revision = original.document.revision; restoredDocument.updatedAt = original.document.updatedAt;
  assert.deepEqual(restoredDocument, original.document);
  for (const [key, value] of Object.entries(histories)) assert.deepEqual(f.snapshot[key], value);
  assert.equal(f.snapshot.revisionPlans.length, 2);
  assert.equal((await f.get(laterPlan.planId)).canApply, false);
  assert.equal(f.snapshot.shotStates.sh_one.revision, 3);
  assert.equal(f.snapshot.shotStates.sh_one.outputVersion, 7);
  assert.equal(f.snapshot.shotStates.sh_one.needsUpdate, true);
  assert.equal(editorialStatus(f.snapshot).shots[0].candidates.find(item => item.id === "md_one").stale, true);
  assert.ok(editorialStatus(f.snapshot).reviews.every(item => !item.current));
  await rejectsUnchanged(f, () => f.restore(planId), "CONFLICT");
  await rejectsUnchanged(f, () => f.apply(planId), "CONFLICT");
  assert.deepEqual(revisionStatus(f.snapshot).counts, { proposed: 1, applied: 0, restored: 1, stale: 1 });
});

test("legacy reads never write or add revisionPlans, public views and inputs are detached", async () => {
  const f = fixture(), original = clone(f.snapshot);
  assert.deepEqual(revisionStatus(f.snapshot), { plans: [], counts: { proposed: 0, applied: 0, restored: 0, stale: 0 } });
  await rejectsUnchanged(f, () => f.get("rp_absent"), "NOT_FOUND");
  assert.deepEqual(f.snapshot, original); assert.equal(f.writes, 0);
  const requested = [change("shot", "sh_one", "dialogue", "Hello")], preserve = ["Keep story"];
  const pending = f.save(requested, { preserve }); requested[0].replacementJson = '"Changed outside"'; preserve[0] = "Changed";
  const saved = await pending; saved.plan.changes[0].after = "Outside";
  const fetched = await f.get(saved.planId); assert.equal(fetched.changes[0].after, "Hello"); assert.deepEqual(fetched.preserve, ["Keep story"]);
  fetched.impact.dirtyShotIds.length = 0;
  const summary = revisionStatus(f.snapshot); summary.plans[0].dirtyShotIds.length = 0;
  const publicPlan = publicRevisionPlan(f.snapshot, f.snapshot.revisionPlans[0]); publicPlan.changes.length = 0;
  assert.equal(f.snapshot.revisionPlans[0].changes.length, 1); assert.deepEqual(f.snapshot.revisionPlans[0].impact.dirtyShotIds, ["sh_one"]);
});

test("strict schemas reject missing, null, unknown, non-JSON and invalid lifecycle arguments", async () => {
  const f = fixture(), tool = f.service.tools.find(tool => tool.name === "save_revision_plan");
  for (const value of [null, [], {}, { id: "pr_test" }, new Date()]) await rejectsUnchanged(f, () => tool.execute(value));
  for (const extra of [{ title: null }, { title: " " }, { title: "x".repeat(201) }, { instruction: null }, { preserve: [] }, { preserve: [null] }, { reviewIds: null },
    { intent: null }, { intent: "fix" }, { extra: 1 }, { expectedProductionRevision: null }, { expectedProductionRevision: 0 }, { expectedProductionRevision: 1.5 },
    { expectedProductionRevision: Infinity }, { expectedProductionRevision: Number.MAX_SAFE_INTEGER + 1 }, { id: "../production" }, { changes: null }, { changes: [] },
    { preserve: Array(1) }, { preserve: [undefined] }]) await rejectsUnchanged(f, () => f.save(undefined, extra));
  const { planId } = await f.save();
  for (const method of [f.apply, f.restore]) for (const extra of [{ confirm: false }, { confirm: null }, { confirm: "true" }, { authorization: null }, { authorization: " " }, { authorization: "x".repeat(4001) }, { unexpected: true }]) {
    await rejectsUnchanged(f, () => method(planId, extra));
  }
  await rejectsUnchanged(f, () => f.call("get_revision_plan", { planId, expectedProductionRevision: 2 }));
  await rejectsUnchanged(f, () => f.call("get_revision_plan", { planId: null }));
  for (const tool of f.service.tools) {
    assert.equal(tool.schema.additionalProperties, false);
    assert.deepEqual(tool.schema.required, Object.keys(tool.schema.properties));
  }
  const fields = tool.schema.properties.changes.items.properties;
  assert.deepEqual(fields.targetId.type, ["string", "null"]);
  assert.equal(fields.replacementJson.type, "string");
});

test("target IDs, unknown fields, duplicate cells and forged before values reject atomically", async () => {
  const f = fixture();
  for (const request of [change("production", "pr_test", "brief", "New"), change("shot", null, "dialogue", "New"), change("shot", "sh_one", "assetIds", []),
    change("shot", "sh_one", "outputs", {}), change("shot", "sh_one", "episodeId", "ep_two"), change("production", null, "title", "New"),
    change("production", null, "projectBible", {}), change("production", null, "projectBible.rules.extra", "X"), change("episode", "ep_one", "beats", []),
    change("asset", "as_one", "locked", false), change("beat", "bt_one", "shotIds", []), change("shot", "sh_one", "__proto__", {}),
    change("shot", "sh_one", "dialogue", "New", { before: "Forged" }), change("shot", "sh_one", "dialogue", "New", { sourceIssue: null })]) {
    await rejectsUnchanged(f, () => f.save([request]));
  }
  await rejectsUnchanged(f, () => f.save([change("shot", "sh_absent", "dialogue", "New")]), "NOT_FOUND");
  const c = change("shot", "sh_one", "dialogue", "New");
  await rejectsUnchanged(f, () => f.save([c, c]));
  f.snapshot.document.episodes[1].script = { beats: [{ id: "bt_one" }] };
  await rejectsUnchanged(f, () => f.save([change("beat", "bt_one", "dialogue", "New")]));
});

test("intent gates permit declared field groups and reject broader edits", async () => {
  const f = fixture();
  for (const [intent, request] of [["wording", change("episode", "ep_one", "productionNotes", "Clear")], ["wording", change("beat", "bt_one", "dramaticQuestion", "Who?")],
    ["wording", change("shot", "sh_one", "dialogue", "Hello")], ["visual", change("shot", "sh_one", "scene", "Close up")],
    ["visual", change("asset", "as_one", "imagePrompt", "Coat")], ["pacing", change("shot", "sh_one", "duration", 2.5)],
    ["pacing", change("episode", "ep_one", "targetDurationSeconds", 20)]]) await f.save([request], { intent });
  for (const [intent, request] of [["wording", change("production", null, "brief", "New")], ["wording", change("shot", "sh_one", "duration", 2)],
    ["visual", change("shot", "sh_one", "dialogue", "Hi")], ["visual", change("asset", "as_one", "description", "New")],
    ["pacing", change("episode", "ep_one", "prose", "New")], ["pacing", change("shot", "sh_one", "scene", "New")]]) await rejectsUnchanged(f, () => f.save([request], { intent }));
});

test("replacement JSON and field bounds reject malformed, oversized, null and wrong types without truncation", async () => {
  const f = fixture();
  for (const value of [null, 2, {}, [], true, "x".repeat(2001)]) await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", "dialogue", value)]));
  for (const value of [-1, 601, null, "2", {}, 1e100]) await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", "duration", value)]));
  for (const value of [0, -1, 86401, null]) await rejectsUnchanged(f, () => f.save([change("episode", "ep_one", "targetDurationSeconds", value)]));
  for (const replacementJson of ["", "undefined", "{", "(()=>1)()", "NaN", "1e400", " ".repeat(220001)]) await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", "duration", 1, { replacementJson })]));
  for (const [type, id, field, max] of [["production", null, "brief", 2000], ["production", null, "arc", 4000], ["production", null, "style", 200],
    ["production", null, "voice", 2000], ["production", null, "music", 2000], ["production", null, "projectBible.rules", 20000],
    ["episode", "ep_one", "prose", 200000], ["episode", "ep_one", "logline", 2000], ["beat", "bt_one", "title", 80],
    ["asset", "as_one", "profile", 20000], ["asset", "as_one", "imagePrompt", 8000], ["asset", "as_one", "negativePrompt", 8000], ["shot", "sh_one", "title", 80]]) {
    await rejectsUnchanged(f, () => f.save([change(type, id, field, "x".repeat(max + 1))]));
  }
  await rejectsUnchanged(f, () => f.save([change("beat", "bt_one", "purpose", "other")]));
  for (const field of ["title", "scene"]) await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", field, " ")]));
  const saved = await f.save([change("shot", "sh_one", "dialogue", "  Keep spaces  "), change("shot", "sh_two", "duration", 0)]);
  await f.apply(saved.planId); assert.equal(f.snapshot.document.shots[0].dialogue, "  Keep spaces  "); assert.equal(f.snapshot.document.shots[1].duration, 0);
});

test("whole nested shot plans use existing normalization, clear semantics and reference validation", async () => {
  const f = fixture();
  const requests = [change("shot", "sh_one", "videoPlan", { mode: "image-to-video", firstFrameAssetId: "as_one", rationale: " Frame " }),
    change("shot", "sh_one", "soundDesign", { effects: " Wind ", music: " " }),
    change("shot", "sh_one", "continuityPlan", { entryState: " Door ", exitState: " Hall ", rationale: " Match ", anchors: [{ phase: "start", state: " Door ", assetId: "as_one" }] }),
    change("shot", "sh_one", "productionPlan", { sourceScene: " House ", purpose: " Reveal ", requiredEvents: [" Door "], generationDurationSeconds: 8, headHandleSeconds: 1, tailHandleSeconds: 1, retimePolicy: "forbidden", editingNotes: " " })];
  const { planId, plan } = await f.save(requests);
  assert.equal(plan.changes[0].after.transitionIn, "hard-cut"); assert.equal(plan.changes[0].after.rationale, "Frame");
  assert.equal(plan.changes[1].after.effects, "Wind"); assert.equal(plan.changes[2].after.audioTransition, "hard-cut");
  await f.apply(planId);
  assert.equal(f.snapshot.document.shots[0].productionPlan.sourceScene, "House"); assert.deepEqual(f.marks, ["sh_one"]);
  await f.restore(planId);
  for (const field of ["videoPlan", "soundDesign", "continuityPlan", "productionPlan"]) assert.equal(Object.hasOwn(f.snapshot.document.shots[0], field), false);
  for (const request of [change("shot", "sh_one", "videoPlan", { mode: "first-last-frame", rationale: "No last" }),
    change("shot", "sh_one", "videoPlan", { mode: "image-to-video", firstFrameAssetId: "as_locked", rationale: "Not bound" }),
    change("shot", "sh_one", "soundDesign", { effects: "Wind", music: "", nested: {} }),
    change("shot", "sh_one", "continuityPlan", { entryState: "In", exitState: "Out", rationale: "Match", anchors: [{ phase: "start", state: "In", extra: true }] }),
    change("shot", "sh_one", "productionPlan", { ...JSON.parse(requests[3].replacementJson), headHandleSeconds: 8 }),
    change("shot", "sh_one", "productionPlan", { ...JSON.parse(requests[3].replacementJson), extra: true })]) await rejectsUnchanged(f, () => f.save([request]));
});

test("null clears an existing plan and restore reinstates the exact prior plan, including optional absence", async () => {
  const seed = initial(); seed.document.shots[0].soundDesign = { effects: "Wind", music: "None" };
  const f = fixture(seed), saved = await f.save([change("shot", "sh_one", "soundDesign", null)]);
  assert.equal(saved.plan.changes[0].afterExists, false); assert.equal(saved.plan.changes[0].after, null);
  await f.apply(saved.planId); assert.equal(Object.hasOwn(f.snapshot.document.shots[0], "soundDesign"), false);
  await f.restore(saved.planId); assert.deepEqual(f.snapshot.document.shots[0].soundDesign, seed.document.shots[0].soundDesign);
});

test("restore removes only newly introduced cells in the same container", async () => {
  const seed = initial(); delete seed.document.projectBible;
  const f = fixture(seed), { planId } = await f.save([change("production", null, "projectBible.rules", "No magic"), change("production", null, "projectBible.background", "Home"),
    change("episode", "ep_two", "prose", "Road"), change("episode", "ep_two", "hook", "Leaving")]);
  await f.apply(planId); await f.restore(planId);
  assert.deepEqual(f.snapshot.document.projectBible, {}); assert.deepEqual(f.snapshot.document.episodes[1].script, {});
  assert.deepEqual(f.snapshot.document.episodes[0].script, seed.document.episodes[0].script);
});

test("late invalid changes and tampered saved payloads never partially mutate even on a live host object", async () => {
  const f = fixture(initial(), { liveQueue: true });
  await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", "dialogue", "Valid"), change("shot", "sh_two", "duration", -1)]));
  const { planId } = await f.save([change("shot", "sh_one", "dialogue", "Valid"), change("shot", "sh_two", "scene", "Valid")]);
  f.snapshot.revisionPlans[0].changes[1].replacementJson = "null";
  await rejectsUnchanged(f, () => f.apply(planId));
  f.snapshot.revisionPlans[0].changes[1].replacementJson = '"Valid"';
  f.snapshot.revisionPlans[0].changes[0].before = "Forged";
  await rejectsUnchanged(f, () => f.apply(planId), "CONFLICT");
});

test("locked assets block staging and later lock/content changes block application", async () => {
  const f = fixture();
  await rejectsUnchanged(f, () => f.save([change("asset", "as_locked", "description", "Changed")]), "CONFLICT");
  const saved = await f.save([change("asset", "as_one", "description", "Changed")]);
  f.snapshot.document.assets[0].locked = true;
  await rejectsUnchanged(f, () => f.apply(saved.planId), "CONFLICT");
  assert.equal(f.snapshot.document.assets[0].locked, true);
});

test("impacts deduplicate directly affected shots and report only unmodified adjacent neighbors", async () => {
  const f = fixture();
  const saved = await f.save([change("shot", "sh_two", "dialogue", "New"), change("shot", "sh_two", "scene", "New scene")]);
  assert.deepEqual(saved.plan.impact, { episodeIds: ["ep_one"], dirtyShotIds: ["sh_two"], neighborShotIds: ["sh_one", "sh_three"] });
  const applied = await f.apply(saved.planId);
  assert.deepEqual(applied.dirtyShotIds, ["sh_two"]); assert.deepEqual(f.marks, ["sh_two"]);
  assert.equal(f.snapshot.shotStates.sh_one.revision, 1); assert.equal(f.snapshot.shotStates.sh_three.revision, 1);
  const beat = await f.save([change("beat", "bt_one", "synopsis", "New")]);
  assert.deepEqual(beat.plan.impact.dirtyShotIds, ["sh_one"]);
  const episode = await f.save([change("episode", "ep_two", "prose", "New")]);
  assert.deepEqual(episode.plan.impact, { episodeIds: ["ep_two"], dirtyShotIds: ["sh_other"], neighborShotIds: [] });
  f.snapshot.document.shots[2].videoPlan = { firstFrameAssetId: "as_one" };
  const asset = await f.save([change("asset", "as_one", "profile", "New")]);
  assert.deepEqual(asset.plan.impact.dirtyShotIds, ["sh_one", "sh_three"]);
  assert.deepEqual(asset.plan.impact.neighborShotIds, ["sh_two"]);
});

test("all-no-op changes reject and mixed no-ops do not dirty unaffected shots", async () => {
  const f = fixture();
  await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", "scene", "Door opens")]));
  await rejectsUnchanged(f, () => f.save([change("shot", "sh_one", "soundDesign", null)]));
  const saved = await f.save([change("shot", "sh_one", "scene", "Door opens"), change("shot", "sh_two", "dialogue", "Hello")]);
  const applied = await f.apply(saved.planId);
  assert.deepEqual(applied.dirtyShotIds, ["sh_two"]); assert.equal(applied.changedFields.length, 1);
});

test("content and shot revision guards detect drift, bindings and ABA while ignoring document commit timestamps", async () => {
  for (const drift of [snapshot => { snapshot.document.brief = "Changed"; }, snapshot => { snapshot.shotStates.sh_other.revision++; },
    snapshot => { snapshot.document.shots[0].outputs.video = "md_other"; }, snapshot => { snapshot.document.shots.reverse(); },
    snapshot => { snapshot.document.shots[0].scene = "Other"; snapshot.shotStates.sh_one.revision++; snapshot.document.shots[0].scene = "Door opens"; }]) {
    const f = fixture(), { planId } = await f.save(); drift(f.snapshot);
    assert.equal((await f.get(planId)).current, false);
    await rejectsUnchanged(f, () => f.apply(planId), "CONFLICT");
  }
  const f = fixture(), { planId } = await f.save(); const hash = contentFingerprint(f.snapshot);
  f.snapshot.document.createdAt++; f.snapshot.document.updatedAt++; f.snapshot.document.revision++;
  assert.equal(contentFingerprint(f.snapshot), hash);
  await f.apply(planId);
});

test("source reviews must be current, real, unique, not superseded and unchanged at apply", async () => {
  const f = fixture();
  await rejectsUnchanged(f, () => f.save(undefined, { reviewIds: ["rv_missing"] }), "CONFLICT");
  const review = await f.review();
  await rejectsUnchanged(f, () => f.save(undefined, { reviewIds: [review.review.id, review.review.id] }));
  const saved = await f.save(undefined, { reviewIds: [review.review.id] });
  await f.review({ findings: "Newer finding" });
  assert.equal((await f.get(saved.planId)).canApply, false);
  await rejectsUnchanged(f, () => f.apply(saved.planId), "CONFLICT");
  await rejectsUnchanged(f, () => f.save(undefined, { reviewIds: [review.review.id] }), "CONFLICT");
  const fresh = await f.save(undefined, { reviewIds: [f.snapshot.reviews[1].id] });
  f.snapshot.reviews[1].findings = "Changed in place";
  await rejectsUnchanged(f, () => f.apply(fresh.planId), "CONFLICT");
  f.snapshot.document.brief = "Changed";
  await rejectsUnchanged(f, () => f.save(undefined, { reviewIds: [f.snapshot.reviews[1].id] }), "CONFLICT");
});

test("unrelated review append leaves a proposal current but new inspection invalidates referenced evidence", async () => {
  const f = fixture();
  const review = await f.review({ category: "visual", evidence: [{ mediaId: "md_image", note: "Observed" }] });
  const saved = await f.save(undefined, { reviewIds: [review.review.id] });
  await f.review({ scope: { kind: "shot", shotId: "sh_other" }, findings: "Other shot" });
  assert.equal((await f.get(saved.planId)).canApply, true);
  f.snapshot.mediaInspections.md_image = { sha256: "b".repeat(64), findings: "New observation" };
  assert.equal(contentFingerprint(f.snapshot), f.snapshot.revisionPlans[0].baseContentFingerprint);
  await rejectsUnchanged(f, () => f.apply(saved.planId), "CONFLICT");
});

test("serialized concurrent saves/applications enforce expected revision inside queue and recover after errors", async () => {
  const f = fixture();
  const savedResults = await Promise.allSettled([f.save(), f.save()]);
  assert.equal(savedResults.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(savedResults.find(result => result.status === "rejected").reason.code, "CONFLICT");
  const planId = savedResults.find(result => result.status === "fulfilled").value.planId;
  const second = await f.save([change("shot", "sh_two", "dialogue", "Wait")]);
  await rejectsUnchanged(f, () => f.apply(planId, { expectedProductionRevision: 1 }), "CONFLICT");
  const applied = await Promise.allSettled([f.apply(planId), f.apply(second.planId)]);
  assert.equal(applied.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(applied.find(result => result.status === "rejected").reason.code, "CONFLICT");
  const restored = await Promise.allSettled([f.restore(planId), f.restore(planId)]);
  assert.equal(restored.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(restored.find(result => result.status === "rejected").reason.code, "CONFLICT");
  await f.save([change("shot", "sh_three", "dialogue", "After failure")]);
});

test("later content edits and reverse-order multi-plan rollback refuse to overwrite history", async () => {
  const f = fixture(), first = await f.save(); await f.apply(first.planId);
  const second = await f.save([change("shot", "sh_two", "dialogue", "Wait")]); await f.apply(second.planId);
  await rejectsUnchanged(f, () => f.restore(first.planId), "CONFLICT");
  await f.restore(second.planId);
  await rejectsUnchanged(f, () => f.restore(first.planId), "CONFLICT");
  const third = await f.save([change("shot", "sh_three", "dialogue", "Bye")]); await f.apply(third.planId);
  f.snapshot.document.shots[0].dialogue = "Later edit";
  await rejectsUnchanged(f, () => f.restore(third.planId), "CONFLICT");
});

test("history and change-count limits reject rather than prune", async () => {
  const f = fixture();
  await rejectsUnchanged(f, () => f.save(Array.from({ length: 101 }, () => change("shot", "sh_one", "dialogue", "New"))));
  for (let index = 0; index < 40; index++) await f.save();
  assert.equal(f.snapshot.revisionPlans.length, 40);
  await rejectsUnchanged(f, () => f.save(), "LIMIT_EXCEEDED");
  assert.equal(revisionStatus(f.snapshot).counts.proposed, 40);
});

test("full record byte limit includes captured before/after and rejects without any mutation", async () => {
  const seed = initial(); seed.document.episodes = Array.from({ length: 6 }, (_, index) => ({ id: `ep_${index}`, script: { prose: "前".repeat(180000) } }));
  const f = fixture(seed, { liveQueue: true });
  await rejectsUnchanged(f, () => f.save(seed.document.episodes.map(episode => change("episode", episode.id, "prose", "后".repeat(180000)))), "LIMIT_EXCEEDED");
});

test("missing legacy shot state is created on apply without adopting outputs", async () => {
  const seed = initial(); delete seed.shotStates;
  const f = fixture(seed), saved = await f.save();
  assert.equal(f.snapshot.shotStates, undefined);
  await f.apply(saved.planId);
  assert.deepEqual(f.snapshot.shotStates.sh_one, { revision: 2, outputVersion: 0, needsUpdate: true });
  assert.equal(editorialStatus(f.snapshot).shots[0].candidates.find(item => item.id === "md_one").stale, true);
  assert.deepEqual(f.snapshot.document.shots[0].outputs, seed.document.shots[0].outputs);
  await f.restore(saved.planId); assert.equal(f.snapshot.shotStates.sh_one.revision, 3);
});

test("shot revision overflow and inconsistent future provenance refuse rather than revive old outputs", async () => {
  const f = fixture(); f.snapshot.shotStates.sh_one.revision = Number.MAX_SAFE_INTEGER;
  const saved = await f.save();
  await rejectsUnchanged(f, () => f.apply(saved.planId), "CONFLICT");
  const g = fixture(); g.snapshot.media[0].shotRevision = 2;
  const other = await g.save();
  await rejectsUnchanged(g, () => g.apply(other.planId), "CONFLICT");
});

test("restore preserves new registered media and output version history without restoring output validity", async () => {
  const f = fixture(), saved = await f.save(); await f.apply(saved.planId);
  const newMedia = { id: "md_later", kind: "video", sha256: "c".repeat(64), shotId: "sh_one", shotRevision: 2 };
  f.snapshot.media.push(newMedia);
  f.snapshot.shotStates.sh_one.outputVersion = 8;
  const beforeState = clone(f.snapshot.shotStates.sh_one);
  await f.restore(saved.planId);
  assert.deepEqual(f.snapshot.media.at(-1), newMedia);
  assert.equal(f.snapshot.shotStates.sh_one.outputVersion, 8);
  assert.deepEqual(f.snapshot.shotStates.sh_one.outputRevisions, beforeState.outputRevisions);
  assert.equal(f.snapshot.shotStates.sh_one.revision, 3);
  assert.ok(editorialStatus(f.snapshot).shots[0].candidates.filter(item => item.shotId === "sh_one").every(item => item.stale));
});
