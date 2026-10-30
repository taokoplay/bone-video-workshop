/**
 * Bone 影视工厂 (bone.video.workshop) — PI-Desktop plugin entry.
 *
 * Agent-first creation flow: productions are created and written by the
 * Agent through registered tools, stored in the plugin's private data path
 * (the same snapshot schema as the original visual-production format), and
 * browsed in the work panel view over host-forwarded bridge channels.
 * No file permissions are needed: the data path is plugin-private, and the
 * panel reaches storage only through onPanelInvoke.
 *
 * Tool flow for the Agent:
 *   create_production -> write_script -> add_assets -> add_shots
 *   (list_productions / get_production for reading)
 */
const { promises: fs } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { planSchemas, applyPlans, referencedAssets } = require("./lib/production-plans.js");
const { workflowStatus, workflowTool } = require("./lib/workflow.js");
const { createMediaService } = require("./lib/media-service.js");
const { projectBibleSchema, validateProjectBible } = require("./lib/project-bible.js");
const { assetDetailSchemas, assetDetailPatch } = require("./lib/asset-details.js");
const { createEditorialService } = require("./lib/editing-service.js");
const { createRevisionService, publicRevisionPlan } = require("./lib/revision-service.js");

const COMMAND_ID = "bone.video.workshop.open";
const VIEW_ID = "workshop";
const PRODUCTIONS_DIR = "productions";
const LOAD_LOG = "loads.jsonl";
const PANEL_LOG = "panelcalls.jsonl";
const KINDS = ["comic", "film", "promo", "image"];
/** 节拍的叙事功能，沿用原始影像项目的用途枚举。 */
const BEAT_PURPOSES = [
  "hook",
  "setup",
  "inciting-incident",
  "rising-action",
  "reveal",
  "turn",
  "resolution",
  "tag",
];
/** 节拍的正文要素；shotIds 是映射，不在这里。 */
const BEAT_TEXT_FIELDS = [
  "dramaticQuestion",
  "synopsis",
  "visualAction",
  "dialogue",
  "sound",
  "continuity",
];
const SCRIPT_TEXT_FIELDS = [
  "logline",
  "audiencePromise",
  "hook",
  "turningPoint",
  "payoff",
  "productionNotes",
];
const LIMITS = {
  maxProductions: 64,
  maxTitle: 80,
   maxBrief: 2000,
  maxArc: 4000,
   maxStyle: 200,
  maxTextField: 2000,
  maxProse: 200000,
  maxEpisodeTitle: 120,
  maxAssetName: 60,
  maxShotTitle: 80,
  maxEpisodes: 32,
  maxEpisodesPerCall: 20,
  maxBeats: 40,
  maxBeatsPerCall: 40,
  maxBeatTitle: 80,
  maxShotIdsPerBeat: 20,
  maxAssets: 200,
  maxAssetsPerCall: 32,
  maxShots: 500,
  maxShotsPerCall: 50,
  maxDurationSeconds: 600,
};

let dataPath = null;
let manifestVersion = "unknown";
// 启动自检结果：宿主未授予 agent 能力时工具注册会全部失败，
// 与其静默停摆，不如把状态报到面板上让人看见。
const capabilities = { agentAvailable: false, tools: [], errors: [] };
const writeQueues = new Map();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function str(value) {
  return typeof value === "string" ? value.trim() : "";
}
function messageOf(error) {
  if (error && typeof error.message === "string") return error.message;
  return String(error);
}
function assertProductionId(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw fail("INVALID_ARGUMENT", `production id invalid: ${id}`);
  }
}
function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}
function productionDir(id) {
  return path.join(dataPath, PRODUCTIONS_DIR, id);
}
function snapshotFile(id) {
  return path.join(productionDir(id), "snapshot.json");
}

// ---------- storage ----------
// The whole read-modify-write cycle of a mutating tool runs inside the
// per-production write queue: reads that happen outside the queue would let
// interleaved tool calls overwrite each other with stale snapshots.

async function readSnapshot(id) {
  assertProductionId(id);
  let raw;
  try {
    raw = await fs.readFile(snapshotFile(id), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") throw fail("NOT_FOUND", `production not found: ${id}`);
    throw fail("INVALID_ARGUMENT", `cannot read production ${id}: ${error.message}`);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch (error) {
    throw fail("INVALID_ARGUMENT", `corrupt snapshot for ${id}: ${error.message}`);
  }
  const doc = snapshot && snapshot.document;
  if (!doc || doc.schemaVersion !== 1 || !Array.isArray(doc.shots)) {
    throw fail("INVALID_ARGUMENT", `unsupported snapshot format for ${id}`);
  }
  return snapshot;
}

async function listIds() {
  try {
    const entries = await fs.readdir(path.join(dataPath, PRODUCTIONS_DIR), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

// Serialize tasks per production; a failed task must not wedge the queue.
function queueWrite(id, task) {
  const previous = writeQueues.get(id) || Promise.resolve();
  const next = previous.then(task, task);
  writeQueues.set(id, next.catch(() => {}));
  return next;
}

// Atomically replace the snapshot (temp file + rename). Queue-internal.
async function writeNow(id, snapshot) {
  await fs.mkdir(productionDir(id), { recursive: true });
  const tmp = `${snapshotFile(id)}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.rename(tmp, snapshotFile(id));
}

function commit(id, snapshot) {
  snapshot.document.revision += 1;
  snapshot.document.updatedAt = Date.now();
  return snapshot;
}

/**
 * Run one mutating tool step as a serialized read-modify-write cycle.
 * The mutator receives the fresh snapshot and returns the call result;
 * on success the revision bumps and the snapshot persists atomically.
 */
async function mutateProduction(id, mutator) {
  assertProductionId(id);
  return queueWrite(id, async () => {
    const snapshot = await readSnapshot(id);
    const result = await mutator(snapshot);
    commit(id, snapshot);
    await writeNow(id, snapshot);
     return result && typeof result === "object"
       ? { ...result, revision: snapshot.document.revision }
       : result;
  });
}

function blankDocument(input) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: input.id,
    revision: 0, // the creation write commits this to revision 1
    createdAt: now,
    updatedAt: now,
    title: input.title,
    kind: input.kind,
     brief: input.brief,
    arc: input.arc || "",
    ...(input.projectBible === undefined ? {} : { projectBible: input.projectBible }),
     style: input.style || "",
    ratio: input.ratio || "16:9",
    fps: Number.isFinite(input.fps) && input.fps > 0 ? Math.round(input.fps) : 24,
    voice: input.voice || "",
    music: input.music || "",
    episodes: [],
    assets: [],
    shots: [],
  };
}

function blankSnapshot(document) {
  return {
    document,
    media: [],
    assetVersions: {},
    shotStates: {},
    candidates: [],
    jobs: [],
  };
}

function productionSummary(snapshot) {
  const doc = snapshot.document;
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    revision: doc.revision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    episodeCount: doc.episodes.length,
    shotCount: doc.shots.length,
    assetCount: doc.assets.length,
    mediaCount: snapshot.media.length,
  };
}

async function listSummaries() {
  const summaries = [];
  for (const id of await listIds()) {
    try {
      summaries.push(productionSummary(await readSnapshot(id)));
    } catch {
      // One broken production must not hide the rest.
      summaries.push({ id, title: id, kind: "", broken: true });
    }
  }
  return summaries;
}

// ---------- tool implementations ----------

async function toolListProductions() {
  return { productions: await listSummaries() };
}

async function toolGetProduction(args) {
  const snapshot = await readSnapshot(str(args?.id));
  return {
    production: snapshot.document,
    shotStates: snapshot.shotStates,
    mediaCount: snapshot.media.length,
    media: snapshot.media.map(({ fileName, ...item }) => item),
    workflow: workflowStatus(snapshot),
    mediaInspections: snapshot.mediaInspections || {},
    editPlans: snapshot.editPlans || {},
    reviews: snapshot.reviews || [],
    revisionPlans: (snapshot.revisionPlans || []).map(plan => publicRevisionPlan(snapshot, plan)),
  };
}

async function toolCreateProduction(args) {
  const title = str(args?.title);
  if (!title) throw fail("INVALID_ARGUMENT", "title is required");
  if (title.length > LIMITS.maxTitle) throw fail("INVALID_ARGUMENT", `title too long (max ${LIMITS.maxTitle})`);
  const kind = str(args?.kind) || "comic";
  if (!KINDS.includes(kind)) throw fail("INVALID_ARGUMENT", `kind must be one of: ${KINDS.join(", ")}`);
  const document = blankDocument({
    id: newId("bp"),
    title,
    kind,
     brief: str(args?.brief).slice(0, LIMITS.maxBrief),
    arc: str(args?.arc).slice(0, LIMITS.maxArc),
    projectBible: args?.projectBible === undefined ? undefined : validateProjectBible(args.projectBible),
     style: str(args?.style).slice(0, LIMITS.maxStyle),
     ratio: str(args?.ratio) || undefined,
     fps: Number(args?.fps),
    voice: str(args?.voice),
    music: str(args?.music),
  });
  await queueWrite(document.id, async () => {
    if ((await listIds()).length >= LIMITS.maxProductions) {
      throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxProductions} productions`);
    }
    await writeNow(document.id, commit(document.id, blankSnapshot(document)));
  });
  return {
    id: document.id,
    title: document.title,
    next: [
      `先用 update_production 补充 projectBible 的背景、规则、历史时间线及 arc 全剧主线；人物档案保存在角色资产 profile，生图提示词保存在 imagePrompt/negativePrompt；`,
      `用 write_script(id: "${document.id}", title: "第一集", prose: ...) 写连续剧本正文；`,
      `用 write_episodes 为本集拆 beats，再用 add_assets 登记角色、场景和首尾帧资产；`,
      `用 add_shots 带 episodeId/beatId 创建分镜，用 update_shot 完善 videoPlan、soundDesign、continuityPlan；`,
      `生成结果先 register_media 再 adopt_media，最后用 get_workflow_status 检查缺口。`,
    ].join(""),
  };
}

async function toolWriteScript(args) {
  const id = str(args?.id);
  const title = str(args?.title);
  if (!title) throw fail("INVALID_ARGUMENT", "title is required");
  if (title.length > LIMITS.maxEpisodeTitle) {
    throw fail("INVALID_ARGUMENT", `episode title too long (max ${LIMITS.maxEpisodeTitle})`);
  }
  const wanted = str(args?.episodeId);
  const textUpdates = {};
  for (const field of SCRIPT_TEXT_FIELDS) {
    if (args?.[field] !== undefined) textUpdates[field] = str(args[field]).slice(0, LIMITS.maxTextField);
  }
  // 剧本正文是一篇文章，长度与七要素不同量级。
  if (args?.prose !== undefined) textUpdates.prose = str(args.prose).slice(0, LIMITS.maxProse);
  let target = Number(args?.targetDurationSeconds);
  target = Number.isFinite(target) && target >= 0 ? Math.round(target) : null;
  return mutateProduction(id, (snapshot) => {
    const doc = snapshot.document;
    let episode = wanted ? doc.episodes.find((item) => item.id === wanted) : null;
    if (wanted && !episode) throw fail("NOT_FOUND", `episode not found: ${wanted}`);
    if (!episode) {
      if (doc.episodes.length >= LIMITS.maxEpisodes) {
        throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxEpisodes} episodes per production`);
      }
      episode = { id: newId("ep"), title, script: {} };
      doc.episodes.push(episode);
    }
    episode.title = title;
    const script = episode.script || (episode.script = {});
    Object.assign(script, textUpdates);
    if (target !== null) script.targetDurationSeconds = target;
    return { id: doc.id, episodeId: episode.id, revision: doc.revision };
  });
}

async function toolWriteEpisodes(args) {
  const id = str(args?.id);
  const input = Array.isArray(args?.episodes) ? args.episodes : [];
  if (!input.length) throw fail("INVALID_ARGUMENT", "episodes must be a non-empty array");
  if (input.length > LIMITS.maxEpisodesPerCall) {
    throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxEpisodesPerCall} episodes per call`);
  }
  return mutateProduction(id, (snapshot) => {
    const doc = snapshot.document;
    const written = [];
    const orphanWarnings = [];
    for (const raw of input) {
      const title = str(raw?.title);
      if (!title) throw fail("INVALID_ARGUMENT", "every episode needs a title");
      if (title.length > LIMITS.maxEpisodeTitle) {
        throw fail("INVALID_ARGUMENT", `episode title too long (max ${LIMITS.maxEpisodeTitle})`);
      }
      const wanted = str(raw?.episodeId);
      let episode = wanted ? doc.episodes.find((item) => item.id === wanted) : null;
      if (wanted && !episode) throw fail("NOT_FOUND", `episode not found: ${wanted}`);
      if (!episode) {
        if (doc.episodes.length >= LIMITS.maxEpisodes) {
          throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxEpisodes} episodes per production`);
        }
        episode = { id: newId("ep"), title, script: {} };
        doc.episodes.push(episode);
      }
      episode.title = title;
      const script = episode.script || (episode.script = {});
      for (const field of SCRIPT_TEXT_FIELDS) {
        if (raw?.[field] !== undefined) script[field] = str(raw[field]).slice(0, LIMITS.maxTextField);
      }
      if (raw?.prose !== undefined) script.prose = str(raw.prose).slice(0, LIMITS.maxProse);
      const target = Number(raw?.targetDurationSeconds);
      if (Number.isFinite(target) && target >= 0) {
        script.targetDurationSeconds = Math.round(target);
      }
      if (Array.isArray(raw?.beats)) {
        const existing = new Map((script.beats || []).map((beat) => [beat.id, beat]));
        if (raw.beats.length > LIMITS.maxBeatsPerCall) {
          throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxBeatsPerCall} beats per call`);
        }
        if (raw.beats.length > LIMITS.maxBeats) {
          throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxBeats} beats per episode`);
        }
        const beats = [];
        for (const rawBeat of raw.beats) {
          const beatTitle = str(rawBeat?.title);
          if (!beatTitle) throw fail("INVALID_ARGUMENT", "every beat needs a title");
          const purpose = str(rawBeat?.purpose);
          if (purpose && !BEAT_PURPOSES.includes(purpose)) {
            throw fail("INVALID_ARGUMENT", `beat purpose must be one of: ${BEAT_PURPOSES.join(", ")}`);
          }
          const wantedBeat = str(rawBeat?.beatId);
          const previous = wantedBeat ? existing.get(wantedBeat) : null;
          if (wantedBeat && !previous) throw fail("NOT_FOUND", `beat not found: ${wantedBeat}`);
          const beat = previous || { id: newId("bt"), shotIds: [] };
          beat.title = beatTitle.slice(0, LIMITS.maxBeatTitle);
          beat.purpose = purpose || beat.purpose || "rising-action";
          for (const field of BEAT_TEXT_FIELDS) {
            if (rawBeat?.[field] !== undefined) {
              beat[field] = str(rawBeat[field]).slice(0, LIMITS.maxTextField);
            } else if (beat[field] === undefined) {
              beat[field] = "";
            }
          }
          if (!Array.isArray(beat.shotIds)) beat.shotIds = [];
          beats.push(beat);
        }
        // 整体替换前记下原本已映射的镜头，替换后仍无归属的要明确告警，
        // 否则 Agent 少写一个节拍就会让镜头悄悄变成"未映射"。
        const previouslyMapped = new Set(
          (script.beats || []).flatMap((beat) => (Array.isArray(beat.shotIds) ? beat.shotIds : [])),
        );
        script.beats = beats;
        const stillMapped = new Set(beats.flatMap((beat) => beat.shotIds));
        const orphaned = [...previouslyMapped].filter((shotId) => !stillMapped.has(shotId));
        if (orphaned.length) {
          const titles = orphaned
            .map((shotId) => doc.shots.find((shot) => shot.id === shotId))
            .filter(Boolean)
            .map((shot) => shot.title || shot.id);
          orphanWarnings.push(
            `「${episode.title}」有 ${orphaned.length} 个镜头因节拍替换失去映射：${titles.join("、")}（用 update_shot 带 beatId 重新挂上）`,
          );
        }
      }
      written.push({ episodeId: episode.id, title: episode.title, beatCount: (script.beats || []).length });
    }
    const result = { id: doc.id, writtenCount: written.length, episodes: written };
    if (orphanWarnings.length) result.warning = orphanWarnings.join("；");
    return result;
  });
}

async function toolAddAssets(args) {
  const id = str(args?.id);
  const input = Array.isArray(args?.assets) ? args.assets : [];
  if (!input.length) throw fail("INVALID_ARGUMENT", "assets must be a non-empty array");
  return mutateProduction(id, (snapshot) => {
    const doc = snapshot.document;
    if (doc.assets.length + input.length > LIMITS.maxAssets) {
      throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxAssets} assets per production`);
    }
    const added = [];
    for (const raw of input.slice(0, LIMITS.maxAssetsPerCall)) {
      const name = str(raw?.name);
      const type = str(raw?.type);
      if (!name || !type) throw fail("INVALID_ARGUMENT", "every asset needs name and type");
      const asset = {
        id: newId("as"),
        name: name.slice(0, LIMITS.maxAssetName),
        type: type.slice(0, 20),
        description: str(raw?.description).slice(0, LIMITS.maxTextField),
        ...assetDetailPatch(raw),
        locked: raw?.locked === true,
        mediaId: null,
      };
      doc.assets.push(asset);
      added.push({ id: asset.id, name: asset.name });
    }
    return { id: doc.id, addedCount: added.length, assets: added, revision: doc.revision };
  });
}

async function toolAddShots(args) {
  const id = str(args?.id);
  const input = Array.isArray(args?.shots) ? args.shots : [];
  if (!input.length) throw fail("INVALID_ARGUMENT", "shots must be a non-empty array");
  const wantedEpisode = str(args?.episodeId);
  return mutateProduction(id, (snapshot) => {
    const doc = snapshot.document;
    if (doc.shots.length + input.length > LIMITS.maxShots) {
      throw fail("LIMIT_EXCEEDED", `at most ${LIMITS.maxShots} shots per production`);
    }
    let episodeId = "";
    if (wantedEpisode) {
      if (!doc.episodes.some((item) => item.id === wantedEpisode)) {
        throw fail("NOT_FOUND", `episode not found: ${wantedEpisode}`);
      }
      episodeId = wantedEpisode;
    } else if (doc.episodes.length === 1) {
      episodeId = doc.episodes[0].id;
    }
    const knownAssets = new Set(doc.assets.map((asset) => asset.id));
    const unknownAssets = new Set();
    const defaultDuration = doc.kind === "image" ? 0 : 4;
    const added = [];
    for (const raw of input.slice(0, LIMITS.maxShotsPerCall)) {
      const title = str(raw?.title);
      const scene = str(raw?.scene);
      if (!title || !scene) throw fail("INVALID_ARGUMENT", "every shot needs title and scene");
      let duration = Number(raw?.duration);
      if (!Number.isFinite(duration) || duration < 0) duration = defaultDuration;
      duration = Math.min(duration, LIMITS.maxDurationSeconds);
      const assetIds = Array.isArray(raw?.assetIds) ? raw.assetIds.map(str).filter(Boolean) : [];
      for (const assetId of assetIds) {
        if (!knownAssets.has(assetId)) unknownAssets.add(assetId);
      }
      // 先脚本后分镜：镜头必须落在本集某个叙事节拍上，从源头杜绝"未映射"。
      const beatId = str(raw?.beatId);
      if (!beatId) {
        throw fail(
          "INVALID_ARGUMENT",
          `shot "${title}" needs beatId：先用 write_episodes 写本集叙事节拍，再把镜头挂到对应节拍`,
        );
      }
      const ownerEpisode = doc.episodes.find((item) => item.id === episodeId);
      if (!ownerEpisode) {
        throw fail(
          "INVALID_ARGUMENT",
          `every shot needs an episode：先用 write_episodes 建立剧集与节拍（当前 ${doc.episodes.length} 集，episodeId="${episodeId}"）`,
        );
      }
      if ((ownerEpisode.script?.beats || []).length === 0) {
        throw fail("INVALID_ARGUMENT", "this episode has no beats yet：先写剧本节拍再拆镜头");
      }
      beatOrFail(ownerEpisode, beatId);
      const shot = {
        id: newId("sh"),
        episodeId,
        title: title.slice(0, LIMITS.maxShotTitle),
        duration,
        scene: scene.slice(0, LIMITS.maxTextField),
        motion: str(raw?.motion).slice(0, LIMITS.maxTextField),
        dialogue: str(raw?.dialogue).slice(0, LIMITS.maxTextField),
        assetIds: assetIds.filter((assetId) => knownAssets.has(assetId)),
        mediaId: null,
        outputs: { image: null, video: null, audio: null },
      };
      applyPlans(shot, raw, doc);
      doc.shots.push(shot);
      snapshot.shotStates[shot.id] = { revision: 1, outputVersion: 0, needsUpdate: false };
      const targetBeat = beatOrFail(ownerEpisode, beatId);
      if (!targetBeat.shotIds.includes(shot.id)) targetBeat.shotIds.push(shot.id);
      added.push({ id: shot.id, title: shot.title, beatId, shotRevision: 1 });
    }
    const result = { id: doc.id, addedCount: added.length, shots: added, revision: doc.revision };
    if (unknownAssets.size) {
      result.warning = `未登记的资产 id 已忽略: ${[...unknownAssets].join(", ")}（先用 add_assets 登记）`;
    }
    if (!episodeId && doc.kind !== "image") {
      result.warning = [result.warning, "作品还没有剧集，镜头暂不归属集数；可用 write_script 建集。"].filter(Boolean).join("；");
    }
    return result;
  });
}

 // ---------- editing tools ----------

 function beatOrFail(episode, beatId) {
  const beat = (episode?.script?.beats || []).find((item) => item.id === beatId);
  if (!beat) throw fail("NOT_FOUND", `beat not found: ${beatId}`);
  return beat;
}

function unmapShotFromBeats(doc, shotId, keepBeatId) {
  for (const episode of doc.episodes) {
    for (const beat of episode.script?.beats || []) {
      if (keepBeatId && beat.id === keepBeatId) continue;
      beat.shotIds = (beat.shotIds || []).filter((item) => item !== shotId);
    }
  }
}

function shotOrFail(doc, shotId) {
   const shot = doc.shots.find((item) => item.id === shotId);
   if (!shot) throw fail("NOT_FOUND", `shot not found: ${shotId}`);
   return shot;
 }

 function assetOrFail(doc, assetId) {
   const asset = doc.assets.find((item) => item.id === assetId);
   if (!asset) throw fail("NOT_FOUND", `asset not found: ${assetId}`);
   return asset;
 }

 // A shot's settings revision separates "the design changed" from "the
 // adopted output changed": edits mark the output as needing regeneration.
 function markShotDirty(snapshot, shotId) {
   const state = snapshot.shotStates[shotId];
   if (state) {
     state.revision += 1;
     state.needsUpdate = true;
   } else {
     snapshot.shotStates[shotId] = { revision: 1, outputVersion: 0, needsUpdate: true };
   }
 }

 async function toolUpdateProduction(args) {
   const id = str(args?.id);
   const patch = {};
   if (args?.title !== undefined) {
     const title = str(args.title);
     if (!title) throw fail("INVALID_ARGUMENT", "title cannot be empty");
     if (title.length > LIMITS.maxTitle) throw fail("INVALID_ARGUMENT", `title too long (max ${LIMITS.maxTitle})`);
     patch.title = title;
   }
   if (args?.kind !== undefined) {
     const kind = str(args.kind);
     if (!KINDS.includes(kind)) throw fail("INVALID_ARGUMENT", `kind must be one of: ${KINDS.join(", ")}`);
     patch.kind = kind;
   }
   if (args?.brief !== undefined) patch.brief = str(args.brief).slice(0, LIMITS.maxBrief);
   if (args?.arc !== undefined) patch.arc = str(args.arc).slice(0, LIMITS.maxArc);
   if (args?.projectBible !== undefined) patch.projectBible = validateProjectBible(args.projectBible);
   if (args?.style !== undefined) patch.style = str(args.style).slice(0, LIMITS.maxStyle);
   if (args?.ratio !== undefined) patch.ratio = str(args.ratio).slice(0, 20);
   if (args?.voice !== undefined) patch.voice = str(args.voice).slice(0, LIMITS.maxTextField);
   if (args?.music !== undefined) patch.music = str(args.music).slice(0, LIMITS.maxTextField);
   if (args?.fps !== undefined) {
     const fps = Number(args.fps);
     if (!Number.isFinite(fps) || fps < 0 || fps > 240) throw fail("INVALID_ARGUMENT", "fps must be 0..240");
     patch.fps = Math.round(fps);
   }
   const changed = Object.keys(patch);
   if (!changed.length) throw fail("INVALID_ARGUMENT", "provide at least one field to update");
   return mutateProduction(id, (snapshot) => {
     if (patch.projectBible !== undefined) patch.projectBible = { ...snapshot.document.projectBible, ...patch.projectBible };
     Object.assign(snapshot.document, patch);
     return { id: snapshot.document.id, changed };
   });
 }

 async function toolUpdateShot(args) {
   const id = str(args?.id);
   const shotId = str(args?.shotId);
   if (!shotId) throw fail("INVALID_ARGUMENT", "shotId is required");
   const patch = {};
   if (args?.title !== undefined) {
     const title = str(args.title);
     if (!title) throw fail("INVALID_ARGUMENT", "shot title cannot be empty");
     patch.title = title.slice(0, LIMITS.maxShotTitle);
   }
   if (args?.scene !== undefined) {
     const scene = str(args.scene);
     if (!scene) throw fail("INVALID_ARGUMENT", "shot scene cannot be empty");
     patch.scene = scene.slice(0, LIMITS.maxTextField);
   }
   if (args?.motion !== undefined) patch.motion = str(args.motion).slice(0, LIMITS.maxTextField);
   if (args?.dialogue !== undefined) patch.dialogue = str(args.dialogue).slice(0, LIMITS.maxTextField);
   if (args?.duration !== undefined) {
     const duration = Number(args.duration);
     if (!Number.isFinite(duration) || duration < 0) throw fail("INVALID_ARGUMENT", "duration must be >= 0");
     patch.duration = Math.min(duration, LIMITS.maxDurationSeconds);
   }
   const hasAssetIds = args?.assetIds !== undefined;
   const hasEpisodeId = args?.episodeId !== undefined;
   const changedPlans = Object.keys(planSchemas).filter(key => args?.[key] !== undefined);
   if (!Object.keys(patch).length && !changedPlans.length && !hasAssetIds && !hasEpisodeId && args?.beatId === undefined) {
     throw fail("INVALID_ARGUMENT", "provide at least one field to update");
   }
   return mutateProduction(id, (snapshot) => {
     const doc = snapshot.document;
     const shot = shotOrFail(doc, shotId);
     if (args?.expectedShotRevision !== undefined && args.expectedShotRevision !== snapshot.shotStates[shotId]?.revision) {
       throw fail("CONFLICT", "shot changed; read get_production again before updating");
     }
     const unknownAssets = [];
     if (hasEpisodeId) {
       const episodeId = str(args.episodeId);
       if (!episodeId || !doc.episodes.some((item) => item.id === episodeId)) {
         throw fail("NOT_FOUND", `episode not found: ${episodeId}`);
       }
       if (episodeId !== shot.episodeId && args?.beatId === undefined) {
         throw fail("INVALID_ARGUMENT", "moving a shot to another episode requires its new beatId");
       }
       shot.episodeId = episodeId;
     }
     if (args?.beatId !== undefined) {
       // 空值不再表示"取消映射"：镜头必须始终属于一个节拍。
       const beatId = str(args.beatId);
       if (!beatId) throw fail("INVALID_ARGUMENT", "beatId cannot be empty：请指定要挂到的节拍");
       const owner = doc.episodes.find((item) => item.id === shot.episodeId);
       const target = beatOrFail(owner, beatId);
       unmapShotFromBeats(doc, shotId);
       target.shotIds = [...new Set([...(target.shotIds || []), shotId])];
     }
     if (hasAssetIds) {
       const known = new Set(doc.assets.map((asset) => asset.id));
       const wanted = Array.isArray(args.assetIds) ? args.assetIds.map(str).filter(Boolean) : [];
       for (const assetId of wanted) if (!known.has(assetId)) unknownAssets.push(assetId);
       shot.assetIds = wanted.filter((assetId) => known.has(assetId));
     }
     Object.assign(shot, patch);
     if (changedPlans.length || hasAssetIds) applyPlans(shot, args, doc);
     markShotDirty(snapshot, shotId);
     const result = {
       id: doc.id,
       shotId,
       changed: [...Object.keys(patch), ...changedPlans, ...(hasAssetIds ? ["assetIds"] : []), ...(hasEpisodeId ? ["episodeId"] : []), ...(args?.beatId !== undefined ? ["beatId"] : [])],
       shotRevision: snapshot.shotStates[shotId].revision,
       needsUpdate: true,
     };
     if (unknownAssets.length) {
       result.warning = `未登记的资产 id 已忽略: ${unknownAssets.join(", ")}（先用 add_assets 登记）`;
     }
     return result;
   });
 }

 async function toolDeleteShot(args) {
   const id = str(args?.id);
   const shotId = str(args?.shotId);
   if (!shotId) throw fail("INVALID_ARGUMENT", "shotId is required");
   return mutateProduction(id, (snapshot) => {
     const doc = snapshot.document;
     const index = doc.shots.findIndex((item) => item.id === shotId);
     if (index < 0) throw fail("NOT_FOUND", `shot not found: ${shotId}`);
     doc.shots.splice(index, 1);
     delete snapshot.shotStates[shotId];
     unmapShotFromBeats(doc, shotId);
     return { id: doc.id, deleted: shotId, remaining: doc.shots.length };
   });
 }

 async function toolMoveShot(args) {
   const id = str(args?.id);
   const shotId = str(args?.shotId);
   if (!shotId) throw fail("INVALID_ARGUMENT", "shotId is required");
   const toIndex = Number(args?.toIndex);
   if (!Number.isInteger(toIndex)) throw fail("INVALID_ARGUMENT", "toIndex must be an integer (0-based)");
   return mutateProduction(id, (snapshot) => {
     const doc = snapshot.document;
     const from = doc.shots.findIndex((item) => item.id === shotId);
     if (from < 0) throw fail("NOT_FOUND", `shot not found: ${shotId}`);
     if (toIndex < 0 || toIndex >= doc.shots.length) {
       throw fail("INVALID_ARGUMENT", `toIndex must be 0..${doc.shots.length - 1}`);
     }
     const [shot] = doc.shots.splice(from, 1);
     doc.shots.splice(toIndex, 0, shot);
     return { id: doc.id, shotId, from, toIndex, order: doc.shots.map((item) => item.id) };
   });
 }

 async function toolUpdateAsset(args) {
   const id = str(args?.id);
   const assetId = str(args?.assetId);
   if (!assetId) throw fail("INVALID_ARGUMENT", "assetId is required");
   const patch = {};
   if (args?.name !== undefined) {
     const name = str(args.name);
     if (!name) throw fail("INVALID_ARGUMENT", "asset name cannot be empty");
     patch.name = name.slice(0, LIMITS.maxAssetName);
   }
   if (args?.type !== undefined) {
     const type = str(args.type);
     if (!type) throw fail("INVALID_ARGUMENT", "asset type cannot be empty");
     patch.type = type.slice(0, 20);
   }
   if (args?.description !== undefined) patch.description = str(args.description).slice(0, LIMITS.maxTextField);
   Object.assign(patch, assetDetailPatch(args));
   if (args?.locked !== undefined) patch.locked = args.locked === true;
   const changed = Object.keys(patch);
   if (!changed.length) throw fail("INVALID_ARGUMENT", "provide at least one field to update");
   return mutateProduction(id, (snapshot) => {
     const doc = snapshot.document;
     const asset = assetOrFail(doc, assetId);
     Object.assign(asset, patch);
     // Asset settings constrain every shot that references them.
     const affected = doc.shots.filter((shot) => (shot.assetIds || []).includes(assetId));
     for (const shot of affected) markShotDirty(snapshot, shot.id);
     return { id: doc.id, assetId, changed, shotsAffected: affected.length };
   });
 }

 async function toolDeleteAsset(args) {
   const id = str(args?.id);
   const assetId = str(args?.assetId);
   if (!assetId) throw fail("INVALID_ARGUMENT", "assetId is required");
   return mutateProduction(id, (snapshot) => {
     const doc = snapshot.document;
     const index = doc.assets.findIndex((item) => item.id === assetId);
     if (index < 0) throw fail("NOT_FOUND", `asset not found: ${assetId}`);
     if (doc.shots.some(shot => referencedAssets(shot).includes(assetId))) {
       throw fail("CONFLICT", "asset is used by a shot plan; update or clear that plan before deleting it");
     }
     doc.assets.splice(index, 1);
     const affected = [];
     for (const shot of doc.shots) {
       const before = (shot.assetIds || []).length;
       shot.assetIds = (shot.assetIds || []).filter((item) => item !== assetId);
       if (shot.assetIds.length !== before) {
         affected.push(shot.id);
         markShotDirty(snapshot, shot.id);
       }
     }
     return { id: doc.id, deleted: assetId, shotsAffected: affected.length };
   });
 }

 async function toolDeleteProduction(args) {
   const id = str(args?.id);
   if (args?.confirm !== true) {
     throw fail("INVALID_ARGUMENT", "delete_production requires confirm: true — this removes the work permanently");
   }
   assertProductionId(id);
   return queueWrite(id, async () => {
     await readSnapshot(id); // 404 for a missing production before touching the dir
     await fs.rm(productionDir(id), { recursive: true, force: true });
     return { deleted: id, permanent: true };
   });
 }
// ---------- tool definitions (mirrored in manifest.json) ----------

const mediaService = createMediaService({
  getDataPath: () => dataPath, readSnapshot, mutateProduction, newId, markShotDirty,
  getHostFs: () => pi.fs, getWorkspace: () => pi.workspace.get(),
});
const editorialService = createEditorialService({ readSnapshot, mutateProduction, newId });
const revisionService = createRevisionService({ readSnapshot, mutateProduction, newId, markShotDirty });

const TOOL_DEFS = [
  ...mediaService.tools,
  ...editorialService.tools,
  ...revisionService.tools,
  workflowTool(readSnapshot),
  {
    name: "list_productions",
    description: "列出 Bone 影视工厂中的全部影像作品（标题、类型、集数、镜头数、更新时间）。",
    risk: "low",
    schema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => toolListProductions(),
  },
  {
    name: "get_production",
    description: "读取作品设定、完整剧本 prose、脚本 beats、资产、分镜、素材测量 mediaInspections、剪辑方案 editPlans、评审 reviews、修订方案 revisionPlans 及派生 workflow。修改前先读取当前 revision；评审不授权改稿，duration 是成片预算。",
    risk: "low",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "作品 id" } },
      required: ["id"],
      additionalProperties: false,
    },
    execute: async (args) => toolGetProduction(args),
  },
  {
    name: "create_production",
    description: "创建 Bone 影视作品，kind 为 comic/film/promo/image。projectBible 保存世界背景、规则和历史时间线；arc 保存全剧主线。人物档案与生图提示词通过 add_assets/update_asset 保存到各角色资产。",
    risk: "medium",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "作品名称" },
        kind: { type: "string", enum: KINDS, description: "作品类型" },
         brief: { type: "string", description: "作品简介：核心内容、题材与受众" },
         arc: { type: "string", description: "全片故事线：主线因果与分集钩子如何串联（剧本按集存，这是跨集视角）" },
        projectBible: projectBibleSchema,
         style: { type: "string", description: "美术风格，如“赛博朋克”“水墨”“厚涂”" },
        ratio: { type: "string", description: "画面比例，默认 16:9" },
        fps: { type: "number", description: "帧率，默认 24" },
        voice: { type: "string", description: "配音要求" },
        music: { type: "string", description: "音乐要求" },
      },
      required: ["title", "kind"],
      additionalProperties: false,
    },
    execute: async (args) => toolCreateProduction(args),
  },
  {
    name: "write_script",
    description: "写一集完整可拍摄剧本 prose：按叙事顺序写全场次、可见动作和精确对白，篇幅服从目标时长，不能用一句梗概或节拍表代替。多集创作先读取项目设定集和分集规划。按 episodeId 更新或新建；结构化脚本节拍另用 write_episodes 的 beats 拆解。",
    risk: "medium",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "作品 id" },
        episodeId: { type: "string", description: "可选：更新已有集；缺省则新建一集" },
        title: { type: "string", description: "集数名称" },
        logline: { type: "string" },
        audiencePromise: { type: "string" },
        hook: { type: "string" },
        turningPoint: { type: "string" },
        payoff: { type: "string" },
        targetDurationSeconds: { type: "number", description: "本集目标时长（秒）" },
        productionNotes: { type: "string" },
        prose: { type: "string", description: "完整可拍摄正文：场次标识、场景、动作、反应及完整对白按叙事顺序写成；篇幅与时间预算匹配，不强制字数。梗概、分集大纲和 beats 不能代替正文。" },
      },
      required: ["id", "title"],
      additionalProperties: false,
    },
    execute: async (args) => toolWriteScript(args),
  },
  {
    name: "write_episodes",
    description: "一次性写入整部剧本：按顺序提交多集，每集含标题与七要素，以及有序的 beats 叙事节拍（每个节拍含 purpose 叙事功能、dramaticQuestion 观众问题、synopsis 节拍概述、visualAction 视觉动作方向、dialogue 对白意图、sound 声音、continuity 连续性）。缺省 episodeId 时新建集；给出 episodeId 时更新该集。注意：传入的 beats 数组会整体替换该集节拍列表，只想改一个节拍时也要把其余节拍一并带上（用 beatId 指定被改的那个）。",
    risk: "medium",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "作品 id" },
        episodes: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              episodeId: { type: "string", description: "可选：更新已有集；缺省则新建" },
              title: { type: "string", description: "集数名称" },
              logline: { type: "string" },
              audiencePromise: { type: "string" },
              hook: { type: "string" },
              turningPoint: { type: "string" },
              payoff: { type: "string" },
              targetDurationSeconds: { type: "number" },
              productionNotes: { type: "string" },
              prose: { type: "string", description: "完整可拍摄正文：场次标识、场景、动作、反应及完整对白按叙事顺序写成；篇幅与时间预算匹配，不强制字数。梗概、分集大纲和 beats 不能代替正文。" },
              beats: {
                type: "array",
                description: "有序叙事节拍；数组顺序即剧本顺序。缺省 beatId 时新建成节拍。",
                maxItems: 40,
                items: {
                  type: "object",
                  properties: {
                    beatId: { type: "string", description: "可选：更新已有节拍" },
                    title: { type: "string", description: "节拍名称" },
                    purpose: { type: "string", enum: BEAT_PURPOSES, description: "叙事功能" },
                    dramaticQuestion: { type: "string", description: "观众此刻追问或期待的问题" },
                    synopsis: { type: "string", description: "事件因果与信息变化，不代替分镜动作" },
                    visualAction: { type: "string", description: "给分镜动作与表演的视觉执行方向" },
                    dialogue: { type: "string", description: "对白或旁白意图；精确台词写入镜头" },
                    sound: { type: "string", description: "声音意图；精确音效写入镜头" },
                    continuity: { type: "string", description: "跨镜连续性约束" },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["id", "episodes"],
      additionalProperties: false,
    },
    execute: async (args) => toolWriteEpisodes(args),
  },
  {
    name: "add_assets",
    description: "登记角色、场景、道具等资产。description 写资产介绍，profile 写人物档案或详细设定，imagePrompt/negativePrompt 写生图提示词与避免项。人物档案按角色分别保存，不集中写入项目设定。",
    risk: "medium",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "作品 id" },
        assets: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", description: "业务类型：角色/场景/产品/道具/风格/品牌/声音" },
              description: { type: "string", description: "外观、一致性或使用约束" },
              ...assetDetailSchemas,
              locked: { type: "boolean" },
            },
            required: ["name", "type"],
            additionalProperties: false,
          },
        },
      },
      required: ["id", "assets"],
      additionalProperties: false,
    },
    execute: async (args) => toolAddAssets(args),
  },
  {
    name: "add_shots",
    description: "按本集脚本节拍创建分镜。每镜必须 title、scene、beatId，episodeId 缺省仅在唯一剧集时自动归属。可写 motion、dialogue、assetIds、videoPlan、soundDesign、continuityPlan；首尾帧资产必须已登记并加入 assetIds。先有正文和节拍，再拆镜头。",
    risk: "medium",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "作品 id" },
        episodeId: { type: "string", description: "可选：归属的剧集 id" },
        shots: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              duration: { type: "number", description: "成片剪辑预算秒数，保留小数；缺省4（图片0）。生成长度另存 productionPlan。" },
              scene: { type: "string", description: "画面描述和场景" },
              motion: { type: "string", description: "镜头运动与主体动作" },
              dialogue: { type: "string", description: "对白、旁白或字幕" },
              assetIds: { type: "array", items: { type: "string" } },
              beatId: { type: "string", description: "必填：本集某个叙事节拍的 id（先用 write_episodes 写节拍）" },
              ...planSchemas,
            },
            required: ["title", "scene", "beatId"],
            additionalProperties: false,
          },
        },
      },
      required: ["id", "shots"],
      additionalProperties: false,
    },
     execute: async (args) => toolAddShots(args),
   },
   {
     name: "update_production",
     description: "修改作品设定、全剧主线 arc 与 projectBible（世界背景、规则、历史时间线）。只传要改的字段；projectBible 按栏目合并，省略保留、空字符串清空。人物档案请用 update_asset 保存到角色 profile。",
     risk: "medium",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         title: { type: "string" },
         kind: { type: "string", enum: KINDS },
         brief: { type: "string" },
         arc: { type: "string", description: "全片故事线" },
         projectBible: projectBibleSchema,
         style: { type: "string", description: "美术风格" },
         ratio: { type: "string" },
         fps: { type: "number" },
         voice: { type: "string" },
         music: { type: "string" },
       },
       required: ["id"],
       additionalProperties: false,
     },
     execute: async (args) => toolUpdateProduction(args),
   },
   {
     name: "update_shot",
     description: "修改镜头画面、运镜、对白、成片预算 duration（保留小数）、资产与制作计划。productionPlan/videoPlan/soundDesign/continuityPlan 整体替换，null 清除；生成长度与留量存 productionPlan。跨集修改须指定 beatId；建议 expectedShotRevision 防止覆盖新设定。",
     risk: "medium",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         shotId: { type: "string", description: "镜头 id（用 get_production 查）" },
         title: { type: "string" },
         scene: { type: "string", description: "画面描述和场景" },
         motion: { type: "string", description: "镜头运动与主体动作" },
         dialogue: { type: "string", description: "对白、旁白或字幕" },
         duration: { type: "number", description: "成片剪辑预算秒数，保留小数；不是生成长度" },
         assetIds: { type: "array", items: { type: "string" }, description: "整体替换引用资产" },
         episodeId: { type: "string", description: "改归属集时必须同时给出该集的 beatId" },
         beatId: { type: "string", description: "改映射的叙事节拍；不可为空（镜头必须属于一个节拍）" },
         expectedShotRevision: { type: "integer", minimum: 1, description: "可选乐观锁：get_production 返回的 shotStates[shotId].revision" },
         ...planSchemas,
       },
       required: ["id", "shotId"],
       additionalProperties: false,
     },
     execute: async (args) => toolUpdateShot(args),
   },
   {
     name: "delete_shot",
     description: "删除一个镜头（从分镜序列移除，并清除其镜头状态）。",
     risk: "medium",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         shotId: { type: "string", description: "镜头 id" },
       },
       required: ["id", "shotId"],
       additionalProperties: false,
     },
     execute: async (args) => toolDeleteShot(args),
   },
   {
     name: "move_shot",
     description: "调整镜头在分镜序列中的位置（数组顺序即同集镜头顺序）。toIndex 从 0 开始。",
     risk: "medium",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         shotId: { type: "string", description: "要移动的镜头 id" },
         toIndex: { type: "number", description: "目标位置，0-based" },
       },
       required: ["id", "shotId", "toIndex"],
       additionalProperties: false,
     },
     execute: async (args) => toolMoveShot(args),
   },
   {
     name: "update_asset",
     description: "修改资产介绍、人物档案 profile、生图提示词 imagePrompt、避免项 negativePrompt 或锁定状态。省略保留，空字符串清空指定字段；改动将引用镜头标记待更新。已定稿资产按用户授权修改。",
     risk: "medium",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         assetId: { type: "string", description: "资产 id" },
         name: { type: "string" },
         type: { type: "string" },
         description: { type: "string" },
         ...assetDetailSchemas,
         locked: { type: "boolean" },
       },
       required: ["id", "assetId"],
       additionalProperties: false,
     },
     execute: async (args) => toolUpdateAsset(args),
   },
   {
     name: "delete_asset",
     description: "删除一个资产，并从所有引用它的镜头中移除该引用。",
     risk: "medium",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         assetId: { type: "string", description: "资产 id" },
       },
       required: ["id", "assetId"],
       additionalProperties: false,
     },
     execute: async (args) => toolDeleteAsset(args),
   },
   {
     name: "delete_production",
     description: "永久删除一个影像作品及其全部剧本、资产和分镜。不可恢复，必须显式传 confirm: true；删除前先向用户确认。",
     risk: "high",
     schema: {
       type: "object",
       properties: {
         id: { type: "string", description: "作品 id" },
         confirm: { type: "boolean", description: "必须为 true 才会执行删除" },
       },
       required: ["id", "confirm"],
       additionalProperties: false,
     },
     execute: async (args) => toolDeleteProduction(args),
   },
];

// ---------- lifecycle ----------

/**
 * Append one line per plugin load: version, process, and the hash of the view
 * file on disk. A panel that keeps rendering old markup while this log shows a
 * new hash means the page itself is stale, not the bundle.
 */
async function recordLoad() {
  try {
    const viewPath = path.join(__dirname, "views", "workshop.html");
    let viewHash = "missing";
    let viewBytes = 0;
    try {
      const source = await fs.readFile(viewPath);
      viewBytes = source.length;
      viewHash = crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
    } catch {
      // The view file is optional for diagnostics.
    }
    const line = JSON.stringify({
      at: new Date().toISOString(),
      pid: process.pid,
      version: manifestVersion,
      viewHash,
      viewBytes,
    });
    await fs.appendFile(path.join(dataPath, LOAD_LOG), line + "\n");
  } catch {
    // Diagnostics never block loading.
  }
}

async function onLoad() {
  dataPath = await pi.plugin.getDataPath();
  await fs.mkdir(path.join(dataPath, PRODUCTIONS_DIR), { recursive: true });

  try {
    const manifest = await pi.plugin.getManifest();
    manifestVersion = String(manifest?.version ?? "unknown");
  } catch {
    manifestVersion = "unknown";
  }
  // Load diagnostics: record which build the host actually loaded, so a stale
  // panel page can be told apart from a stale bundle without guessing.
  await recordLoad();

  await pi.commands.register({
    id: COMMAND_ID,
    title: "Bone 影视工厂: 打开工作台",
    keywords: ["bone", "video", "影视", "workshop"],
    run: async () => {
      await pi.ui.revealView({ viewId: VIEW_ID });
    },
  });

  // 宿主可能重复调用 onLoad：先清掉上一次的注册记录，避免注销时漏掉工具。
  if (capabilities.tools.length && typeof pi.agent?.unregisterTool === "function") {
    for (const name of capabilities.tools) {
      try {
        await pi.agent.unregisterTool(name);
      } catch {
        // 忽略：旧注册可能已随宿主重启消失。
      }
    }
  }
  capabilities.tools = [];
  capabilities.errors = [];
  capabilities.agentAvailable = typeof pi.agent?.registerTool === "function";
  if (!capabilities.agentAvailable) {
    capabilities.errors.push(
      "agent 能力不可用：manifest 声明了 agent.tool.register，需要在 Plugins 页对「Bone 影视工厂」执行 More → Reload 并同意新增权限",
    );
    return;
  }
  for (const tool of TOOL_DEFS) {
    try {
      await pi.agent.registerTool(tool);
      capabilities.tools.push(tool.name);
    } catch (error) {
      const code = error && error.code ? String(error.code) : "";
      const message = error && error.message ? error.message : String(error);
      capabilities.errors.push(`${tool.name}: ${code ? code + " " : ""}${message}`);
    }
  }
}

async function onUnload() {
  try {
    await pi.commands.unregister(COMMAND_ID);
  } catch {
    // 卸载尽力而为：命令可能从未注册成功。
  }
  if (typeof pi.agent?.unregisterTool !== "function") return;
  for (const name of capabilities.tools) {
    try {
      await pi.agent.unregisterTool(name);
    } catch {
      // 单个工具失败不阻塞其余清理。
    }
  }
  capabilities.tools = [];
}

// Panel bridge: the view reads and writes storage through these channels only.
async function onPanelInvoke(channel, payload) {
  const at = new Date().toISOString();
  try {
    const result = await handlePanelChannel(channel, payload);
    await tracePanelCall(channel, payload, true, "", at);
    return result;
  } catch (error) {
    await tracePanelCall(channel, payload, false, messageOf(error), at);
    throw error;
  }
}

/**
 * One line per channel call into <dataPath>/panelcalls.jsonl.
 *
 * A freshly opened panel always asks for the list and the status, so silence
 * after a reload means the page on screen is not running this build's
 * document — which no amount of guessing about the host can settle.
 */
async function tracePanelCall(channel, payload, ok, message, at) {
  if (!dataPath) return;
  try {
    const detail =
      channel === "bone.probe" && payload && typeof payload === "object"
        ? JSON.stringify(payload).slice(0, 400)
        : "";
    await fs.appendFile(
      path.join(dataPath, PANEL_LOG),
      JSON.stringify({ at, channel, ok, message, detail }) + "\n",
    );
  } catch {
    // Tracing never breaks a panel call.
  }
}

async function handlePanelChannel(channel, payload) {
  switch (channel) {
     case "bone.list":
       return toolListProductions();
     case "bone.get": {
       const snapshot = await readSnapshot(str(payload?.id));
       return { snapshot, workflow: workflowStatus(snapshot) };
     }
     // The panel's own forms go through the same validation and storage path
     // as the Agent tools, so both entries stay consistent.
     case "bone.create":
       return toolCreateProduction(payload ?? {});
     case "bone.update":
       return toolUpdateProduction(payload ?? {});
     case "bone.delete":
       return toolDeleteProduction(payload ?? {});
     case "bone.probe":
       // The page reports its own document, so a stale page is visible in the log.
       return { ok: true, pluginVersion: manifestVersion };
     case "bone.media":
       return mediaService.readMedia(payload);
     case "bone.workflow":
       return workflowStatus(await readSnapshot(str(payload?.id)));
     case "bone.status":
       return {
         version: manifestVersion,
         agentAvailable: capabilities.agentAvailable,
         tools: [...capabilities.tools],
         errors: [...capabilities.errors],
       };
     default:
       throw fail("NOT_FOUND", `unknown panel channel: ${channel}`);
   }
 }

 module.exports = { onLoad, onUnload, onPanelInvoke };
