(() => {
  "use strict";
  let activeDialog = null;
  let instance = 0;
  function beginRender() {
    if (activeDialog?.open) activeDialog.close();
    activeDialog = null;
  }
  function node(tag, cls, text) {
    const n = document.createElement(tag); n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function text(value) { return typeof value === "string" ? value : ""; }
  function bindDialog(dialog, trigger, onOpen = () => {}) {
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", () => {
      if (activeDialog && activeDialog !== dialog) activeDialog.close();
      onOpen();
      activeDialog = dialog;
      dialog.showModal();
    });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']")]
        .filter(control => control.getClientRects().length && !control.closest("[hidden]"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    // Close only when the pointer gesture starts and ends on the backdrop.
    let startedOutside = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener("pointerdown", event => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener("click", event => {
      if (startedOutside && event.target === dialog && outside(event)) dialog.close();
      startedOutside = false;
    });
    dialog.addEventListener("close", () => {
      for (const media of dialog.querySelectorAll("audio, video")) media.pause();
      if (activeDialog === dialog) activeDialog = null;
    });
  }
  function render(asset, doc, copyText, trigger, preview) {
    const dialog = node("dialog", "bw-asset-dialog");
    const headingId = `bone-asset-dialog-${++instance}`;
    dialog.setAttribute("aria-labelledby", headingId);
    const header = node("header", "bw-asset-dialog-head");
    const title = node("h3", "", asset.name || asset.id); title.id = headingId;
    const close = node("button", "vp-button", "关闭"); close.type = "button";
    close.setAttribute("aria-label", "关闭资产详情"); close.autofocus = true;
    close.addEventListener("click", () => dialog.close());
    header.append(title, close);
    const body = node("div", "bw-asset-dialog-body");
    const visual = node("div", "bw-asset-dialog-visual");
    const image = node("div", "bw-asset-dialog-preview", asset.type === "声音" ? "暂无声音素材" : "暂无资产图片");
    visual.append(image, node("p", "vp-muted", `${asset.type || "资产"}${asset.locked ? " · 已锁定" : ""}`));
    const details = node("div", "bw-asset-dialog-fields");
    const fields = [
      ["description", "资产介绍", "尚未填写资产介绍"],
      ["profile", asset.type === "角色" ? "人物档案" : "详细设定", "尚未填写详细设定"],
      ["imagePrompt", asset.type === "声音" ? "制作提示词" : "生图提示词", "尚未填写提示词"],
      ["negativePrompt", "避免项与一致性约束", "尚未设置避免项"],
    ];
    for (const [key, label, empty] of fields) {
      const section = node("section", "bw-asset-field");
      section.append(node("h4", "", label), node("p", "bw-asset-text", text(asset[key]) || empty));
      if (key === "imagePrompt" && text(asset.imagePrompt).trim()) {
        const copy = node("button", "vp-button", "复制提示词"); copy.type = "button";
        copy.addEventListener("click", () => copyText(text(asset.imagePrompt) + (text(asset.negativePrompt).trim() ? `\n\n避免项与一致性约束：\n${asset.negativePrompt}` : ""), "提示词已复制"));
        section.append(copy);
      }
      details.append(section);
    }
    const edit = node("button", "vp-button", "复制完善指令"); edit.type = "button";
    edit.addEventListener("click", () => copyText(`请完善 Bone 作品 ${doc.id} 的资产「${asset.name}」（assetId: ${asset.id}，类型：${asset.type}）。先 get_production 读取现有设定及关联镜头，用 update_asset 保存 description（介绍）、profile（${asset.type === "角色" ? "人物目标、动机、秘密、关系与成长线" : "背景、用途与详细设定"}）、imagePrompt（${asset.type === "声音" ? "声音制作方向" : "可执行生图提示词：稳定外观、构图、视角、材质、光线和风格"}）、negativePrompt（避免项与一致性约束）。只修改必要字段，保留已定稿内容与锁定状态，不自动生成媒体。回读确认保存，并说明影响哪些镜头。`, "指令已复制，去对话里粘贴"));
    details.append(edit); body.append(visual, details); dialog.append(header, body);
    let previewCreated = false;
    bindDialog(dialog, trigger, () => {
      if (!previewCreated && asset.mediaId) {
        image.replaceChildren(preview()); previewCreated = true;
      }
    });
    return dialog;
  }
  function legacy(doc, copyText) {
    if (!text(doc.projectBible?.characters).trim()) return null;
    const wrap = node("div", "bw-legacy-characters");
    const trigger = node("button", "vp-button", "查看待归档人物资料"); trigger.type = "button";
    const dialog = node("dialog", "bw-asset-dialog bw-legacy-dialog");
    const headingId = `bone-legacy-dialog-${++instance}`;
    dialog.setAttribute("aria-labelledby", headingId);
    const header = node("header", "bw-asset-dialog-head");
    const title = node("h3", "", "待归档人物资料（旧版项目设定）"); title.id = headingId;
    const close = node("button", "vp-button", "关闭"); close.type = "button"; close.autofocus = true;
    close.setAttribute("aria-label", "关闭人物资料");
    close.addEventListener("click", () => dialog.close());
    header.append(title, close);
    const details = node("div", "bw-asset-dialog-body bw-legacy-dialog-body");
    details.append(node("p", "vp-muted", "原文已保留。请让 Agent 按实际人物归入角色资产，核对后再清空旧资料。"), node("p", "bw-asset-text", doc.projectBible.characters));
    const button = node("button", "vp-button", "复制归档指令"); button.type = "button";
    button.addEventListener("click", () => copyText(`请读取 Bone 作品 ${doc.id} 的 projectBible.characters 与全部角色资产。先核对人物身份与已有 profile，逐项合并旧人物资料，保留已有有效设定，不用一段新资料覆盖整份档案；矛盾或无法确定归属时标明待核对。使用 save_revision_plan 提出 profile 与旧资料字段的修改前后方案，保留 description、提示词、素材及锁定状态。本次只提归档方案，不应用、不清空旧栏；全部归档成功的验收条件是逐项核对原文均有去处。缺少角色时先报告需要新增的角色，不擅自创建。明确授权后再执行，并回读确认后才清空旧 projectBible.characters。`, "归档方案指令已复制，粘贴发送给 Agent"));
    details.append(button); dialog.append(header, details); wrap.append(trigger, dialog);
    bindDialog(dialog, trigger);
    return wrap;
  }
  window.addEventListener("pagehide", beginRender);
  globalThis.BoneAssetDetails = Object.freeze({ render, legacy, beginRender });
})();
