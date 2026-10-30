/* Project-wide story context; all persisted content is rendered as plain text. */
(() => {
  "use strict";
  const sections = [
    { key: "background", label: "世界背景", hint: "时代、地域、社会结构与核心冲突的起因。" },
    { key: "rules", label: "世界规则", hint: "规则的触发条件、能力边界、代价与例外。" },
    { key: "timeline", label: "历史时间线", hint: "按世界内真实时间顺序记录事件、因果与后果，区分观众获知的顺序。" },
    { key: "arc", label: "全剧主线", hint: "贯穿各集的核心冲突、关键转折与结局。" },
  ];
  const selections = new Map();
  let instance = 0;
  function node(tag, className, text) {
    const value = document.createElement(tag);
    value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }
  function textFor(doc, key) {
    const value = key === "arc" ? doc.arc : doc.projectBible?.[key];
    return typeof value === "string" ? value : "";
  }
  function prompt(doc, section) {
    const field = section.key === "arc" ? "arc" : `projectBible.${section.key}`;
    return `请${textFor(doc, section.key).trim() ? "审阅并完善" : "补充"} Bone 影视工厂作品《${doc.title || doc.id}》（${doc.id}）的「${section.label}」。先用 get_production 读取已有项目设定、全剧主线和分集正文，遵循项目开发专业提示词。${section.hint} 区分已确定事实、提议与未知项，不自行改动其他栏目或已定稿内容。使用 update_production 将完整内容保存到 ${field}；projectBible 只传本次修改的栏目，不用空字符串占位其他栏目。保存后回读，说明对相关集数或镜头的影响；不要只在对话中给出梗概。`;
  }
  function render(doc, { copyText }) {
    const prefix = `bone-bible-${++instance}`;
    const card = node("section", "vp-card bw-bible");
    card.setAttribute("aria-label", "项目设定");
    const header = node("div", "vp-card-head bw-bible-head");
    const heading = node("div", "bw-bible-heading");
    heading.append(node("h3", "", "项目设定"), node("span", "vp-muted", `已填写 ${sections.filter(item => textFor(doc, item.key).trim()).length} / ${sections.length}`));
    const copy = node("button", "vp-button"); copy.type = "button";
    header.append(heading, copy);
    const nav = node("div", "bw-bible-tabs"); nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "项目设定分类");
    const panel = node("div", "bw-bible-panel"); panel.id = `${prefix}-panel`; panel.setAttribute("role", "tabpanel"); panel.tabIndex = 0;
    const buttons = [];
    let selected = sections.find(item => item.key === selections.get(doc.id)) || sections[0];
    function select(section, focus = false) {
      selected = section;
      selections.set(doc.id, section.key);
      if (selections.size > 64) selections.delete(selections.keys().next().value);
      buttons.forEach((button, index) => {
        const active = sections[index] === section;
        button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
        if (active && focus) { button.focus(); button.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      });
      panel.setAttribute("aria-labelledby", `${prefix}-${section.key}`);
      panel.scrollTop = 0;
      const content = textFor(doc, section.key);
      const hint = node("p", "bw-bible-hint", section.hint);
      if (content.trim()) {
        panel.replaceChildren(hint, node("div", "bw-bible-prose", content));
      } else {
        const empty = node("div", "bw-bible-empty");
        empty.append(node("h4", "", `尚未填写${section.label}`), node("p", "", "由 Agent 完善并保存后，这里会展示完整设定。"));
        panel.replaceChildren(hint, empty);
      }
      copy.textContent = content.trim() ? "复制完善指令" : "复制补充指令";
      copy.setAttribute("aria-label", `复制${section.label}${content.trim() ? "完善" : "补充"}指令`);
    }
    sections.forEach((section, index) => {
      const button = node("button", "bw-bible-tab"); button.type = "button"; button.id = `${prefix}-${section.key}`;
      button.setAttribute("role", "tab"); button.setAttribute("aria-controls", panel.id);
      button.append(node("span", "", section.label));
      const filled = Boolean(textFor(doc, section.key).trim());
      const status = node("span", `bw-bible-dot${filled ? " is-filled" : ""}`);
      status.setAttribute("aria-hidden", "true"); button.append(status);
      button.setAttribute("aria-label", `${section.label}，${filled ? "已填写" : "待补充"}`);
      button.addEventListener("click", () => select(section));
      button.addEventListener("keydown", event => {
        let target;
        if (event.key === "ArrowRight") target = (index + 1) % sections.length;
        if (event.key === "ArrowLeft") target = (index + sections.length - 1) % sections.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = sections.length - 1;
        if (target !== undefined) { event.preventDefault(); select(sections[target], true); }
      });
      buttons.push(button); nav.append(button);
    });
    copy.addEventListener("click", () => copyText(prompt(doc, selected), "指令已复制，去对话里粘贴"));
    card.append(header, nav, panel);
    select(selected);
    return card;
  }
  globalThis.BoneProjectBible = Object.freeze({ render });
})();
