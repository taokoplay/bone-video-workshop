/* Read-only revision proposals. Buttons copy explicit, scoped Agent requests. */
(() => {
  "use strict";
  const list = value => Array.isArray(value) ? value : [];
  const intentLabels = { wording: "文字润色", visual: "视觉执行", pacing: "节奏与留量", story: "剧情与关联修订" };
  const statuses = { proposed: "待执行方案", applied: "已应用 · 待复核", restored: "已恢复" };
  function node(tag, cls, value) { const e = document.createElement(tag); e.className = cls; if (value !== undefined) e.textContent = value; return e; }
  function button(label, action) { const e = node("button", "vp-button", label); e.type = "button"; e.addEventListener("click", action); return e; }
  function valueText(value, exists = true) { return !exists ? "（原字段不存在）" : value === undefined ? "（未设置）" : typeof value === "string" ? (value || "（空文本）") : JSON.stringify(value, null, 2); }
  function render(snapshot, status, copyText) {
    const doc = snapshot.document;
    const card = node("section", "vp-card bw-revisions"); card.setAttribute("aria-label", "评审与修订");
    const head = node("div", "vp-card-head"); head.append(node("h3", "", "评审与修订"));
    card.append(head, node("p", "bw-note", "先评审或提出方案，明确要求执行后再应用。这里的按钮只复制指令，不会修改作品。已应用不等于已通过复核。"));
    const actions = node("div", "bw-revision-actions");
    const context = `目标是 Bone 影视作品 ${doc.id}《${doc.title}》，不是插件代码。页面修订 ${doc.revision}，先 get_production 和 get_workflow_status 回读最新内容。`;
    actions.append(button("复制仅评审指令", () => copyText(`${context}本次仅评审，不改项目、正文、脚本、资产、镜头或剪辑方案。按 dramatic-craft 与 review 指引检查剧本可拍性、对白、知情范围、时间预算和全部相邻镜头连续性；每项定位证据、影响、负责阶段、最小修订结果和验收条件。可用 record_review 保存真实范围的结论；不使用 apply_revision_plan，不把建议写进正式稿，无媒体则不作声画通过判断。`, "仅评审指令已复制，粘贴发送给 Agent")),
      button("复制修订方案指令", () => copyText(`${context}本次只提出修订方案，不执行改写。读取当前有效评审；确定 wording/visual/pacing/story 范围与必须保留的事实。用 save_revision_plan 保存逐字段 changes，每项列 targetType、真实 targetId（作品级 null）、field、replacementJson、sourceIssue、reason、acceptanceCriteria；必须合并保留有价值的旧内容，不用新片段覆盖整份档案。引用真实 reviewIds，无则空数组，列 preserve。用 get_revision_plan 回读差异并说明影响镜头和相邻复核范围。不调用 apply_revision_plan 或直接编辑工具；等待明确执行要求。`, "只提方案指令已复制，粘贴发送给 Agent")));
    card.append(actions);
    const plans = list(status?.plans);
    if (!plans.length) card.append(node("p", "bw-note", "尚无修订方案。评审意见不会自动改写作品；已有直接编辑工具继续可用。"));
    for (const summary of [...plans].reverse()) {
      const plan = list(snapshot.revisionPlans).find(item => item.id === summary.id) || summary;
      const item = node("details", "bw-revision-plan"); item.dataset.planId = summary.id;
      item.append(node("summary", "", `${summary.title || summary.id} · ${statuses[summary.status] || summary.status}${summary.statusReason ? " · " + summary.statusReason : ""}`));
      item.append(node("p", "bw-note", `${intentLabels[summary.intent] || summary.intent} · ${summary.changeCount ?? list(plan.changes).length} 个字段 · 基线修订 ${plan.baseProductionRevision ?? "见详情"}`));
      if (plan.instruction) item.append(node("p", "bw-revision-text", plan.instruction));
      const preserve = node("ul", "bw-required-events");
      for (const rule of list(plan.preserve)) preserve.append(node("li", "", `保留：${rule}`));
      item.append(preserve);
      const impact = summary.impact || plan.impact || summary;
      item.append(node("p", "bw-note", `受影响镜头：${list(impact.dirtyShotIds).join("、") || "无"}`),
        node("p", "bw-note", `相邻复核：${list(impact.neighborShotIds).join("、") || "无"}`));
      for (const change of list(plan.changes)) {
        const row = node("details", "bw-revision-change");
        row.append(node("summary", "", `${change.targetType} · ${change.targetId || doc.id} · ${change.field}`));
        row.append(node("p", "bw-revision-text", `问题：${change.sourceIssue || ""}\n依据与理由：${change.reason || ""}\n验收：${change.acceptanceCriteria || ""}`));
        const diff = node("div", "bw-revision-diff");
        for (const [label, value] of [["修改前", valueText(change.before, change.beforeExists !== false)], ["修改后", valueText(change.after)]]) {
          const side = node("section", ""); side.append(node("h4", "", label), node("pre", "", value)); diff.append(side);
        }
        row.append(diff); item.append(row);
      }
      const controls = node("div", "bw-revision-actions");
      controls.append(button("复制方案 ID", () => copyText(summary.id, "方案 ID 已复制")));
      const apply = button("复制执行此方案指令", () => copyText(`${context}我明确要求执行当前作品的修订方案 ${summary.id}，范围仅限该方案已列出的修改。先 get_revision_plan 回读修改前后与 preserve，确认基线仍有效、锁定资产不被覆盖；使用最新 expectedProductionRevision 调用 apply_revision_plan，confirm=true，authorization 如实引用本条指令。若方案已过期或范围不符，停止执行并报告差异，不重新猜测覆盖。成功后回读每个修改字段与受影响相邻镜头，按 acceptanceCriteria 复核并记录新评审；不生成媒体，不宣称已通过成片审核。`, "执行指令已复制；发送后 Agent 才会执行"));
      apply.disabled = !summary.canApply; apply.title = summary.canApply ? "发送前请确认方案差异符合你的意图" : "当前方案不能应用，请先复核状态";
      const restore = button("复制恢复此方案指令", () => copyText(`${context}我明确要求恢复方案 ${summary.id} 应用前的对应字段。先 get_revision_plan 确认 canRestore，再用最新 expectedProductionRevision 调用 restore_revision_plan，confirm=true，authorization 引用本条指令。只恢复此方案记录的字段；若出现后续内容变更冲突，停止并报告，不覆盖新内容、不直接修改快照。回读确认恢复结果，保留审核和媒体历史；恢复不代表旧素材重新通过。`, "恢复指令已复制；发送后 Agent 才会执行"));
      restore.disabled = !summary.canRestore;
      controls.append(apply, restore); item.append(controls); card.append(item);
    }
    return card;
  }
  globalThis.BoneRevisions = Object.freeze({ render });
})();
