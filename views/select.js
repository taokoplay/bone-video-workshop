/* Select-only combobox with a styled HTML popover, independent of OS menus. */
(() => {
  'use strict';
  let serial = 0, active = null;
  function icon(path, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({ viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.8', 'aria-hidden':'true', class:className })) svg.setAttribute(name, value);
    const line = document.createElementNS(svg.namespaceURI, 'path'); line.setAttribute('d', path); svg.append(line); return svg;
  }
  function create({ label, options = [], value, placeholder = '暂无可选项' }) {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'bw-select';
    element.setAttribute('role', 'combobox'); element.setAttribute('aria-label', label);
    element.setAttribute('aria-haspopup', 'listbox'); element.setAttribute('aria-expanded', 'false');
    const text = document.createElement('span'); text.className = 'bw-select-value';
    element.append(text, icon('m7 10 5 5 5-5', 'bw-select-chevron'));
    const id = `bw-select-${++serial}`, lifetime = new AbortController();
    let entries = [], explicitDisabled = false, popup = null, popupEvents = null, cursor = 0, alive = true;
    let search = '', searchAt = 0;
    const listen = (target, type, fn, signal = lifetime.signal, capture = false) => target.addEventListener(type, fn, { signal, capture });
    function close(restore = false) {
      popupEvents?.abort(); popupEvents = null;
      if (popup?.matches(':popover-open')) popup.hidePopover(); popup?.remove(); popup = null;
      element.setAttribute('aria-expanded', 'false'); element.removeAttribute('aria-activedescendant'); element.removeAttribute('aria-controls');
      if (active === handle) active = null;
      if (restore && element.isConnected && !element.disabled) element.focus({ preventScroll:true });
    }
    function paint() {
      text.textContent = entries.find(option => option.value === element.value)?.label || placeholder;
      element.disabled = explicitDisabled || !entries.length;
      if (element.disabled) close();
    }
    function setValue(next) {
      element.value = entries.some(option => option.value === String(next)) ? String(next) : entries[0]?.value ?? '';
      paint();
    }
    function position() {
      if (!popup) return;
      const rect = element.getBoundingClientRect();
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowY) && (rect.bottom <= clip.top || rect.top >= clip.bottom)) { close(); return; }
      }
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { close(); return; }
      popup.style.width = 'max-content';
      popup.style.width = Math.min(Math.max(rect.width, 160, popup.getBoundingClientRect().width), innerWidth - 16) + 'px';
      popup.style.maxHeight = '280px';
      const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
      const downward = below >= popup.getBoundingClientRect().height || below >= above;
      popup.style.maxHeight = Math.min(280, Math.max(40, downward ? below : above)) + 'px';
      const box = popup.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - box.width - 8)) + 'px';
      popup.style.top = Math.max(8, Math.min(downward ? rect.bottom + 4 : rect.top - box.height - 4, innerHeight - box.height - 8)) + 'px';
    }
    function highlight(index, scroll = false) {
      cursor = Math.max(0, Math.min(entries.length - 1, index));
      if (!popup) return;
      for (const [i, option] of [...popup.children].entries()) option.dataset.active = String(i === cursor);
      element.setAttribute('aria-activedescendant', `${id}-${cursor}`);
      if (scroll) popup.children[cursor]?.scrollIntoView({ block:'nearest' });
    }
    function choose(index) {
      if (element.disabled || !alive || !entries[index]) return;
      const changed = element.value !== entries[index].value;
      setValue(entries[index].value); close(true);
      if (changed) element.dispatchEvent(new Event('change', { bubbles:true }));
    }
    function open(index) {
      if (!alive || element.disabled || !element.isConnected) return;
      if (popup) return;
      active?.close(); active = handle;
      popup = document.createElement('div'); popup.className = 'bw-select-menu'; popup.id = id;
      popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', label);
      popupEvents = new AbortController(); const signal = popupEvents.signal;
      entries.forEach((entry, i) => {
        const option = document.createElement('div'); option.className = 'bw-select-option'; option.id = `${id}-${i}`;
        option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(entry.value === element.value)); option.dataset.value = entry.value;
        const label = document.createElement('span'); label.textContent = entry.label;
        option.append(label, icon('m5 12 4 4L19 6', 'bw-select-check'));
        listen(option, 'pointermove', () => highlight(i), signal);
        listen(option, 'click', () => choose(i), signal); popup.append(option);
      });
      listen(popup, 'pointerdown', event => event.preventDefault(), signal);
      listen(document, 'pointerdown', event => { if (!popup?.contains(event.target) && !element.contains(event.target)) close(); }, signal, true);
      listen(window, 'resize', () => close(), signal);
      listen(document, 'scroll', event => { if (!popup?.contains(event.target)) position(); }, signal, true);
      (element.closest('dialog') || document.body).append(popup); popup.showPopover();
      element.setAttribute('aria-expanded', 'true'); element.setAttribute('aria-controls', id);
      position(); highlight(index ?? Math.max(0, entries.findIndex(entry => entry.value === element.value)), true);
    }
    listen(element, 'click', () => popup ? close() : open());
    listen(element, 'blur', () => close());
    listen(element, 'keydown', event => {
      if (event.isComposing || element.disabled) return;
      if (event.key === 'Escape' && popup) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Tab') { close(); return; }
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); popup ? choose(cursor) : open(); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const end = event.key === 'End', home = event.key === 'Home';
        if (!popup) open(end ? entries.length - 1 : home ? 0 : undefined);
        else highlight(end ? entries.length - 1 : home ? 0 : (cursor + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length, true);
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); const now = performance.now(); search = now - searchAt > 700 ? event.key : search + event.key; searchAt = now;
        const index = entries.findIndex(entry => entry.label.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
        if (index >= 0) { if (!popup) open(index); else highlight(index, true); }
      }
    });
    const handle = {
      element, close,
      get value() { return element.value; }, set value(next) { setValue(next); },
      get disabled() { return element.disabled; }, set disabled(next) { explicitDisabled = Boolean(next); paint(); },
      setOptions(next) { close(); entries = next.map(([value, label]) => ({ value:String(value), label:String(label) })); setValue(element.value); },
      focus() { element.focus(); }, scrollIntoView(options) { element.scrollIntoView(options); },
      destroy() { alive = false; close(); lifetime.abort(); },
    };
    handle.setOptions(options); if (value !== undefined) handle.value = value;
    return handle;
  }
  window.addEventListener('pagehide', () => active?.close());
  globalThis.BoneSelect = Object.freeze({ create });
})();
