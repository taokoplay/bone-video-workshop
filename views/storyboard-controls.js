/* Storyboard transient UI, revision-guarded mutations and render lifetime. */
(() => {
  "use strict";
  let current = null;
  const list = value => Array.isArray(value) ? value : [];
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }
  function checked(value) {
    if (value?.error) throw new Error(value.error.message || String(value.error));
    return value;
  }
  function beginRender() { current?.dispose(); current = null; }
  function scope() {
    beginRender();
    const controller = new AbortController(), disposers = new Set();
    const value = {
      live: () => !controller.signal.aborted,
      on(target, event, fn, options = {}) { target.addEventListener(event, fn, { ...options, signal: controller.signal }); },
      own(dispose) { disposers.add(dispose); return () => disposers.delete(dispose); },
      dispose() { controller.abort(); for (const dispose of disposers) dispose(); disposers.clear(); },
    };
    current = value;
    return value;
  }
  function button(scope, text, action, className = "bw-button") {
    const element = node("button", className, text); element.type = "button";
    scope.on(element, "click", action);
    return element;
  }
  function chevron() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ class: "bw-scale-chevron", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "aria-hidden": "true" })) svg.setAttribute(name, value);
    const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", "m7 10 5 5 5-5"); svg.append(path);
    return svg;
  }
  function position(element, trigger) {
    const rect = trigger.getBoundingClientRect(), box = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`;
    element.style.top = `${Math.max(8, rect.bottom + box.height + 8 > window.innerHeight ? rect.top - box.height - 6 : rect.bottom + 6)}px`;
  }
  function moveTarget(doc, context, shot, direction) {
    if (direction !== -1 && direction !== 1) return null;
    const index = context.shots.findIndex(item => item.id === shot.id);
    const neighbor = index < 0 ? null : context.shots[index + direction];
    const target = neighbor ? list(doc.shots).findIndex(item => item.id === neighbor.id) : -1;
    return target < 0 ? null : target;
  }
  function addPayload(snapshot, context, values) {
    const beats = list(context.group?.episode?.script?.beats);
    if (!context.group?.episode || !beats.some(beat => beat.id === values.beatId)) throw Error("请选择本集已有的脚本节拍。");
    const title = String(values.title || "").trim(), scene = String(values.scene || "").trim();
    if (!title || !scene) throw Error("请填写镜头标题和画面描述。");
    if (title.length > 80 || scene.length > 2000) throw Error("标题最多 80 字，画面描述最多 2000 字。");
    return { episodeId: context.group.id, shots: [{ title, scene, beatId: values.beatId }], expectedProductionRevision: snapshot.document.revision };
  }
  function create(scope, snapshot, context, actions) {
    let menu = null, dialog = null, pending = false;
    const revision = shot => snapshot.shotStates?.[shot.id]?.revision;
    function closeMenu(restore = false) { menu?.close(restore); }
    function openEditor(shot, trigger, focusField = "body") {
      closeMenu();
      globalThis.BoneGenerationPanel.open({ snapshot, shot, actions, trigger, focusField });
    }
    async function run(operation, controls, error, live = scope.live) {
      if (!live()) return false;
      if (pending) { error.textContent = "正在保存，请稍候。"; return false; }
      pending = true; error.textContent = "";
      const states = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      try { checked(await operation()); return live(); }
      catch (failure) { if (live()) error.textContent = failure?.message || String(failure); return false; }
      finally {
        pending = false;
        if (scope.live()) controls.forEach((control, index) => { control.disabled = states[index]; });
      }
    }
    function popup(trigger, title, className = "") {
      if (menu?.trigger === trigger) { closeMenu(true); return null; }
      closeMenu();
      const controller = new AbortController();
      const root = node("div", `bw-overlay bw-menu ${className}`), error = node("p", "bw-error");
      root.setAttribute("role", "menu"); root.setAttribute("aria-label", title); error.setAttribute("role", "alert");
      trigger.setAttribute("aria-expanded", "true");
      let removeOwner;
      const result = { root, error, trigger, live: () => scope.live() && !controller.signal.aborted,
        on(target, event, fn) { target.addEventListener(event, fn, { signal: controller.signal }); },
        close(restore = false) {
          controller.abort(); root.remove(); trigger.setAttribute("aria-expanded", "false"); removeOwner?.();
          if (menu === result) menu = null;
          if (restore && trigger.isConnected) trigger.focus({ preventScroll: true });
        },
        show() {
          root.append(error); document.body.append(root); position(root, trigger);
          const items = () => [...root.querySelectorAll("button:not(:disabled)")];
          (root.querySelector('[aria-checked="true"]') || items()[0])?.focus({ preventScroll: true });
        },
      };
      const on = (target, event, fn, capture = false) => target.addEventListener(event, fn, { signal: controller.signal, capture });
      on(document, "pointerdown", event => { if (!root.contains(event.target) && !trigger.contains(event.target)) result.close(); });
      on(document, "keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); result.close(true); }
        if (event.key === "Tab") result.close();
      });
      on(root, "keydown", event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = [...root.querySelectorAll("button:not(:disabled)")], index = items.indexOf(document.activeElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      });
      on(window, "resize", () => result.close());
      on(document, "scroll", event => { if (!root.contains(event.target)) result.close(); }, true);
      removeOwner = scope.own(() => result.close()); menu = result;
      return result;
    }
    function scale(shot, trigger) {
      const pop = popup(trigger, "选择景别", "bw-scale-menu"); if (!pop) return;
      for (const value of ["", ...globalThis.FilmShotAuthoring.SCALES]) {
        const option = button(pop, value || "未指定", async () => {
          if (value === (shot.scale || "")) { pop.close(true); return; }
          if (await run(() => actions.onUpdateShot({ shotId: shot.id, expectedShotRevision: revision(shot), scale: value }),
            [trigger, ...pop.root.querySelectorAll("button")], pop.error, pop.live)) pop.close(true);
        }, "bw-menu-option");
        option.setAttribute("role", "menuitemradio"); option.setAttribute("aria-checked", String(value === (shot.scale || "")));
        option.setAttribute("aria-label", value || "未指定");
        option.disabled = typeof actions.onUpdateShot !== "function";
        if (value === (shot.scale || "")) option.append(node("span", "", "✓"));
        pop.root.append(option);
      }
      pop.show();
    }
    function modal(trigger, title, subtitle) {
      closeMenu(); dialog?.close();
      const root = node("dialog", "bw-overlay bw-mutation-dialog"), head = node("div", "bw-dialog-head"), body = node("div", "bw-dialog-body"), foot = node("div", "bw-dialog-foot");
      const copy = node("div", ""), error = node("p", "bw-error");
      copy.append(node("h2", "", title), node("p", "bw-hint", subtitle)); error.setAttribute("role", "alert");
      const controller = new AbortController(); let removeOwner;
      const result = { root, body, foot, error, live: () => scope.live() && !controller.signal.aborted,
        on(target, event, fn) { target.addEventListener(event, fn, { signal: controller.signal }); },
        close(restore = true) {
          controller.abort(); if (root.open) root.close(); root.remove(); removeOwner?.();
          if (dialog === result) dialog = null;
          if (restore && trigger.isConnected) trigger.focus({ preventScroll: true });
        },
        show() { body.append(error); root.append(head, body, foot); document.body.append(root); root.showModal(); },
      };
      head.append(copy, button(result, "×", () => result.close(), "bw-button bw-icon")); head.lastChild.setAttribute("aria-label", "关闭");
      root.setAttribute("aria-label", title);
      root.addEventListener("cancel", event => { event.preventDefault(); result.close(); }, { signal: controller.signal });
      root.addEventListener("click", event => { if (event.target === root) { const box = root.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) result.close(); } }, { signal: controller.signal });
      foot.append(button(result, "取消", () => result.close()));
      removeOwner = scope.own(() => result.close(false)); dialog = result;
      return result;
    }
    function add(trigger) {
      const pop = modal(trigger, "添加镜头", context.group?.title || "尚无剧集"), beats = list(context.group?.episode?.script?.beats);
      const inputs = {};
      for (const [key, text, tag] of [["beatId", "所属脚本节拍", "select"], ["title", "镜头标题", "input"], ["scene", "画面描述 · 生成正文", "textarea"]]) {
        const label = node("label", "bw-dialog-field"), input = node(tag, "bw-control"); input.name = key; input.required = true;
        label.append(node("span", "", text), input); pop.body.append(label); inputs[key] = input;
      }
      inputs.title.maxLength = 80; inputs.scene.maxLength = 2000;
      const placeholder = node("option", "", "请选择已有节拍"); placeholder.value = ""; inputs.beatId.append(placeholder);
      for (const beat of beats) { const option = node("option", "", beat.title || beat.id); option.value = beat.id; inputs.beatId.append(option); }
      if (!beats.length) pop.body.append(node("p", "bw-hint", "本集尚无脚本节拍，请先到脚本页建立节拍。"), button(pop, "查看本集脚本", () => { pop.close(); actions.onBeat(null); }));
      if (actions.onCopy) pop.body.append(button(pop, "复制新增指令", () => actions.onCopy(
        `请用 get_production 读取作品 ${snapshot.document.id}。${context.group?.id ? `当前 episodeId: ${context.group.id}。` : "先建立实际剧集。"}检查并补齐脚本节拍，再用 add_shots 按实际 beatId 添加有标题和画面描述的镜头。保留已有内容，不要覆盖无关镜头。`), "bw-text-button"));
      const save = button(pop, "添加镜头", async () => {
        if (await run(() => actions.onAddShots(addPayload(snapshot, context, Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])))),
          [save, ...Object.values(inputs)], pop.error, pop.live)) pop.close();
      }, "bw-button bw-primary");
      save.disabled = !beats.length || typeof actions.onAddShots !== "function"; pop.foot.append(save); pop.show();
    }
    function remove(shot, trigger) {
      const pop = modal(trigger, "删除镜头", shot.title || shot.id);
      pop.body.append(node("p", "", "确认删除此镜头及其脚本映射？已登记素材会保留。"));
      const save = button(pop, "确认删除", async () => {
        if (await run(() => actions.onDeleteShot({ shotId: shot.id, expectedShotRevision: revision(shot), expectedProductionRevision: snapshot.document.revision }), [save], pop.error, pop.live)) pop.close();
      }, "bw-button bw-danger");
      pop.foot.append(save); pop.show();
    }
    function operations(shot, trigger, inspect) {
      const pop = popup(trigger, "镜头操作"); if (!pop) return;
      const edit = button(pop, "编辑镜头", () => openEditor(shot, trigger), "bw-menu-option"); edit.setAttribute("role", "menuitem"); pop.root.append(edit);
      if (inspect) { const item = button(pop, "本镜素材与制作", () => { pop.close(); inspect(shot); }, "bw-menu-option"); item.setAttribute("role", "menuitem"); pop.root.append(item); }
      for (const [direction, title] of [[-1, "上移一镜"], [1, "下移一镜"]]) {
        const target = moveTarget(snapshot.document, context, shot, direction);
        const item = button(pop, title, async () => {
          if (await run(() => actions.onMoveShot({ shotId: shot.id, toIndex: target, expectedProductionRevision: snapshot.document.revision }),
            [...pop.root.querySelectorAll("button")], pop.error, pop.live)) pop.close(true);
        }, "bw-menu-option");
        item.setAttribute("role", "menuitem"); item.disabled = target === null || typeof actions.onMoveShot !== "function"; pop.root.append(item);
      }
      const del = button(pop, "删除镜头…", () => remove(shot, trigger), "bw-menu-option bw-danger");
      del.setAttribute("role", "menuitem"); del.disabled = typeof actions.onDeleteShot !== "function"; pop.root.append(del); pop.show();
    }
    return { openEditor, scale, operations, add, run, closeMenu };
  }
  const listen = (target, event, action) => current?.on(target, event, action);
  globalThis.BoneStoryboardControls = Object.freeze({ node, button, chevron, position, scope, listen, beginRender, create, moveTarget, addPayload, checked });
})();
