/* Unified storyboard workbench. Persistence remains in explicit host actions. */
(() => {
  "use strict";
  const modes = new Map();
  const labels = { body:"画面描述 · 生成正文", duration:"成片预算", scale:"景别", lighting:"光影氛围", dialogue:"对白·旁白", effects:"音效", motion:"运镜" };
  const columns = [[60,"镜号"],[76,"时长"],[370,"画面描述 · 图片引用"],[100,"景别"],[188,"光影氛围"],[180,"对白·旁白"],[180,"音效"],[168,"运镜"],[64,"操作"]];
  function viewState(id) {
    if (!modes.has(id)) {
      if (modes.size >= 64) modes.delete(modes.keys().next().value);
      modes.set(id, { mode:"table", expanded:false });
    }
    return modes.get(id);
  }
  function render(snapshot, context, actions, legacy) {
    const controls = globalThis.BoneStoryboardControls, { node, chevron } = controls;
    const scope = controls.scope(), ui = controls.create(scope, snapshot, context, actions);
    const refs = globalThis.BoneStoryboardReferences.create(scope, snapshot, actions);
    const button = (text, action, className) => controls.button(scope, text, action, className);
    const { document:doc } = snapshot, { shots, shot, group } = context, state = viewState(doc.id);
    const authoring = globalThis.FilmShotAuthoring, drafts = new Map();
    const draft = item => {
      if (!drafts.has(item.id)) drafts.set(item.id, authoring.fromShot(item, doc));
      return drafts.get(item.id);
    };
    const episodeView = group?.episode ? globalThis.BoneEditorial.renderEpisode(snapshot, actions.editorial, group.episode, actions) : null;
    function inspect(item) { state.mode = "cards"; actions.onShot(item?.id || null); }
    function more(item, index, card = false) {
      const trigger = button(card ? "操作 ···" : "···", () => { refs.close(); ui.operations(item, trigger, card ? null : inspect); }, card ? "bw-button" : "bw-button bw-icon");
      trigger.setAttribute("aria-label", `镜头 ${index + 1} 更多操作`); trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false");
      return trigger;
    }
    function cell(item, field) {
      const value = draft(item);
      const trigger = button("", () => { refs.close(); field === "scale" ? ui.scale(item, trigger) : ui.openEditor(item, trigger, field); }, field === "scale" ? "bw-scale" : `bw-cell-read${field === "duration" ? " bw-duration" : ""}`);
      trigger.dataset.edit = field; trigger.dataset.shot = item.id; trigger.dataset.generationShotId = item.id;
      trigger.setAttribute("aria-label", `编辑 ${item.title || item.id} 的${labels[field]}`);
      trigger.setAttribute("aria-haspopup", field === "scale" ? "menu" : "dialog");
      if (field === "scale") { trigger.append(document.createTextNode(value.scale || "未指定"), chevron()); trigger.setAttribute("aria-expanded", "false"); }
      else if (field === "duration") trigger.append(node("span", "bw-cell-text", legacy.seconds(value.duration)));
      else { trigger.append(refs.render(value[field], field)); refs.focusPreview(trigger, value[field]); }
      return trigger;
    }
    function table() {
      const root = node("section", "bw-sheet"), head = node("div", "bw-sheet-head"), copy = node("div", "");
      copy.append(node("strong", "", "分镜脚本"), node("span", "bw-hint", "正文中的 @ 是图片引用，悬停可预览"));
      const expand = button(state.expanded ? "收起长文本" : "展开全文", () => {
        state.expanded = !state.expanded; grid.classList.toggle("bw-expanded", state.expanded); expand.textContent = state.expanded ? "收起长文本" : "展开全文";
      }, "bw-button bw-link");
      head.append(copy, expand);
      const scroll = node("div", "bw-sheet-scroll"); scroll.tabIndex = 0; scroll.setAttribute("aria-label", "分镜表格，可横向滚动");
      const grid = node("table", `bw-shot-table${state.expanded ? " bw-expanded" : ""}`); grid.setAttribute("aria-label", "本集分镜脚本");
      const widths = node("colgroup", ""), thead = node("thead", ""), titles = node("tr", ""), tbody = node("tbody", "");
      for (const [width, title] of columns) {
        const col = node("col", ""); col.style.width = `${width}px`; widths.append(col);
        const th = node("th", "", title); th.scope = "col"; titles.append(th);
      }
      thead.append(titles);
      shots.forEach((item, index) => {
        const row = node("tr", ""); row.dataset.shot = item.id;
        const number = button(String(index + 1).padStart(2, "0"), () => inspect(item), "bw-number"); number.setAttribute("aria-label", `查看镜头 ${index + 1}：${item.title || item.id}`);
        const values = [number, cell(item,"duration"), cell(item,"body"), cell(item,"scale"), ...["lighting","dialogue","effects","motion"].map(field => cell(item,field)), more(item,index)];
        values.forEach((value, i) => { const td = node("td", i === 2 ? "bw-scene-cell" : ""); td.append(value); row.append(td); }); tbody.append(row);
      });
      if (!shots.length) { const row = node("tr",""), empty = node("td","bw-table-empty","本集尚无镜头。添加镜头时请选择已有的脚本节拍。"); empty.colSpan = columns.length; row.append(empty); tbody.append(row); }
      grid.append(widths,thead,tbody); scroll.append(grid);
      const foot = node("div","bw-sheet-foot"); foot.append(node("span","bw-hint","横向滚动查看完整字段 · 镜号与操作固定"),node("span","bw-save-state",`作品修订 ${doc.revision} · ${shots.length} 个镜头`));
      root.append(head,scroll,foot); return root;
    }
    function sidebar() {
      const root = node("aside","bw-sidebar"), title = node("div","bw-side-title"), strip = node("div","bw-shot-list");
      root.setAttribute("aria-label","镜头序列"); title.append(node("span","","镜头序列"),node("span","",String(shots.length).padStart(2,"0")));
      strip.setAttribute("role","group"); strip.setAttribute("aria-label","分镜序列");
      shots.forEach((item,index) => {
        const slots = legacy.outputs(snapshot,item), version = snapshot.shotStates?.[item.id];
        const status = version?.needsUpdate ? "待更新" : slots[0].adopted ? "影片已采用" : slots[1].adopted ? "画面已采用" : slots[2].adopted ? "音频已采用" : "文字已保存";
        const card = button("",()=>actions.onShot(item.id),"bw-shot"); card.dataset.shotId=item.id;
        card.setAttribute("aria-current",String(item.id===shot?.id)); card.setAttribute("aria-pressed",String(item.id===shot?.id));
        card.setAttribute("aria-label",`镜头 ${index+1}，${item.title||"未命名镜头"}，${legacy.seconds(item.duration)}，${status}`);
        const thumbnail = node("div","bw-thumbnail");
        if (slots[1].adopted) thumbnail.append(actions.preview(slots[1].adopted,{title:item.title||"镜头画面"})); else thumbnail.append(legacy.icon("film"));
        thumbnail.append(node("span","bw-shot-number",String(index+1).padStart(2,"0")),node("span","bw-shot-duration",legacy.seconds(item.duration)));
        card.append(thumbnail,node("strong","bw-shot-title",item.title||"未命名镜头"),node("span","bw-status",`${status} · v${version?.revision??0}`)); strip.append(card);
      });
      if (!shots.length) strip.append(node("p","bw-hint","本集尚无镜头")); root.append(title,strip); return root;
    }
    function cards() {
      const main = node("div","bw-main");
      if (!shot) {
        main.append(legacy.empty(group ? "这一集还没有分镜" : "先建立剧集和脚本","按真实脚本节拍添加镜头，填写标题和画面描述。"));
        if (group?.episode) main.append(button("查看本集脚本",()=>actions.onBeat(null)));
      } else {
        const index = shots.findIndex(item=>item.id===shot.id), slots = legacy.outputs(snapshot,shot), version = snapshot.shotStates?.[shot.id];
        const inspector = node("article","bw-card-inspector"), head = node("header","bw-card-head"), copy = node("div","bw-current-copy"), nav = node("nav","bw-navigation");
        copy.append(node("span","bw-hint","当前镜头"),node("h2","",shot.title||"未命名镜头"));
        const previous = button("‹",()=>actions.onShot(shots[index-1].id),"bw-button bw-icon"), next = button("›",()=>actions.onShot(shots[index+1].id),"bw-button bw-icon");
        previous.setAttribute("aria-label","上一镜头"); previous.disabled=index===0; next.setAttribute("aria-label","下一镜头"); next.disabled=index===shots.length-1;
        nav.setAttribute("aria-label","切换镜头"); nav.append(previous,next);
        head.append(node("span","bw-current-index",String(index+1).padStart(2,"0")),copy,nav,more(shot,index,true));
        const workspace = node("div","bw-shot-workspace"), input = node("section","bw-work-block bw-generation-block"), result = node("section","bw-work-block bw-results-block");
        input.setAttribute("aria-label","生成输入"); input.append(node("h3","bw-work-heading","生成输入"));
        const fields = node("div","bw-card-fields");
        for (const field of ["body","scale","lighting","motion","dialogue","effects"]) {
          const section = node("div",`bw-card-field${["body","dialogue","effects"].includes(field)?" bw-wide":""}`), title = node("div","bw-card-field-head");
          title.append(node("span","",labels[field])); section.append(title,cell(shot,field)); fields.append(section);
        }
        input.append(fields,legacy.inputContext(snapshot,shot),legacy.framePlan(snapshot,shot,actions));
        result.setAttribute("aria-label","素材结果"); result.append(node("h3","bw-work-heading","素材结果"));
        const preview = node("div","bw-card-preview"), primary = doc.kind==="image"?slots[1]:slots[0];
        if (primary.adopted) preview.append(actions.preview(primary.adopted,{title:shot.title||primary.name,zoom:primary.kind==="image"}));
        else preview.append(legacy.icon(primary.kind==="image"?"image":"film"),node("strong","",primary.missing?`${primary.name}素材记录缺失`:`暂无镜头${primary.name}`),node("span","bw-hint","已保存输入不等于已生成素材"));
        result.append(preview,node("p","bw-result-state bw-hint",`镜头 v${version?.revision??0} · 输出 v${version?.outputVersion??0} · ${version?.needsUpdate?"素材待更新":primary.status}`),globalThis.BoneEditorial.materials(snapshot,doc,shot,slots,actions));
        workspace.append(input,result);
        const planning = node("div","bw-planning-grid"); planning.append(globalThis.BoneEditorial.planning(doc,shot,actions,cell(shot,"duration")),legacy.narrativeContext(snapshot,context,actions));
        inspector.append(head,workspace,planning,globalThis.BoneEditorial.shotReview(doc,actions.editorial,shot,actions)); main.append(inspector);
      }
      if (episodeView) main.append(episodeView); return main;
    }
    const page = node("div","bw-storyboard"); page.setAttribute("aria-label","分镜工作台"); page.dataset.mode=state.mode;
    const toolbar = node("div","bw-toolbar"), episodeGroup = node("div","bw-episode-group"), segment = node("div","bw-segment"); segment.setAttribute("aria-label","分镜视图");
    for (const [mode,title] of [["cards","卡片视图"],["table","剧本大表"]]) {
      const trigger=button(title,()=>{state.mode=mode;actions.onShot(shot?.id||null);},"bw-mode"); trigger.setAttribute("aria-pressed",String(state.mode===mode)); segment.append(trigger);
    }
    const picker=globalThis.BoneSelect.create({label:"选择剧集",options:context.groups.map(item=>[item.id,item.title]),value:group?.id,placeholder:"尚无集数"});
    picker.element.classList.add("bw-episode-picker"); scope.own(()=>picker.destroy()); scope.on(picker.element,"change",()=>actions.onEpisode(picker.value));
    episodeGroup.append(segment,picker.element,node("span","bw-count",`${shots.length} 个镜头 · 预算 ${legacy.seconds(shots.reduce((sum,item)=>sum+(Number(item.duration)||0),0))}`));
    const buttons=node("div","bw-toolbar-actions"),error=node("p","bw-error bw-toolbar-error"); error.setAttribute("role","alert");
    const exportButton=button("导出本集输入包",async()=>{if(await ui.run(()=>actions.onExportEpisode({episodeId:group?.id,shots}),[exportButton],error))status.textContent="本集输入包已导出";});
    exportButton.disabled=!shots.length||typeof actions.onExportEpisode!=="function";
    const add=button("＋ 添加镜头",()=>ui.add(add));
    const episodeTools=button("本集剪辑与审核",()=>{refs.close();ui.closeMenu();episodeView?.scrollIntoView({block:"start"});episodeView?.querySelector("h2")?.focus({preventScroll:true});}); episodeTools.disabled=!episodeView;
    const status=node("span","bw-export-status"); status.setAttribute("role","status"); buttons.append(episodeTools,exportButton,add); toolbar.append(episodeGroup,buttons); page.append(toolbar,error,status);
    const layout=node("div",`bw-layout${state.mode==="table"?" bw-table-mode":""}`);
    if(state.mode==="table"){const main=node("div","bw-main bw-table-main");main.append(table());if(episodeView)main.append(episodeView);layout.append(main);}else layout.append(sidebar(),cards());
    page.append(layout);
    scope.own(()=>page.querySelectorAll("video, audio").forEach(media=>media.pause())); scope.own(()=>globalThis.BoneSequencePreview?.beginRender());
    return page;
  }
  globalThis.BoneStoryboardSurface=Object.freeze({render});
})();
