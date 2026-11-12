// Edit mode for the touch buttons: drag a button to move it, − / + to resize it, saved in this browser.
// Every .tbtn needs data-id (a short unique name). Positions are kept as an offset from where the CSS puts the
// button and a scale, so the default layout always stays the starting point (and "Reset" brings it back).
import { svg } from './icons.js';

export function initLayout(root, key, text = {}) {
  const T = { title: 'Move buttons', hint: 'Drag a button · − + for size', sens: 'Look speed', reset: 'Reset', resetAll: 'Reset all', done: 'Done', ...text };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { saved = {}; }
  const L = { editing: false, selected: null, onExit: null, get sens() { const v = Number(saved._sens); return v > 0 ? v : 1; } };
  const buttons = () => [...root.querySelectorAll('.tbtn')];
  const get = (b) => saved[b.dataset.id] || { x: 0, y: 0, s: 1 };
  const apply = (b) => { const v = get(b); b.style.translate = `${v.x}px ${v.y}px`; b.style.scale = String(v.s); };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* private mode */ } };
  L.refresh = () => buttons().forEach(apply);

  // the panel
  const panel = document.createElement('div');
  panel.className = 'tpanel hide';
  panel.innerHTML = `<span class="tptitle">${T.hint}</span>
    <label class="tpsens">${T.sens}<input type="range" min="0.3" max="3" step="0.1" value="${L.sens}"><b>${L.sens.toFixed(1)}×</b></label>
    <button type="button" data-a="minus" aria-label="Smaller">${svg('minus')}</button>
    <button type="button" data-a="plus" aria-label="Bigger">${svg('plus')}</button>
    <button type="button" data-a="reset">${T.reset}</button>
    <button type="button" data-a="all">${T.resetAll}</button>
    <button type="button" data-a="done" class="pri">${T.done}</button>`;
  root.append(panel);
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (!a) return;
    const b = L.selected;
    if ((a === 'plus' || a === 'minus') && b) {
      const v = { ...get(b) };
      v.s = Math.min(2.2, Math.max(0.5, Math.round((v.s + (a === 'plus' ? 0.1 : -0.1)) * 10) / 10));
      saved[b.dataset.id] = v; apply(b); save();
    } else if (a === 'reset' && b) { delete saved[b.dataset.id]; apply(b); save(); }
    else if (a === 'all') { saved = {}; L.refresh(); save(); const rg = panel.querySelector('.tpsens input'); rg.value = '1'; rg.dispatchEvent(new Event('input')); }
    else if (a === 'done') L.stop();
  });

  panel.querySelector('.tpsens input').addEventListener('input', (e) => {
    saved._sens = Number(e.target.value); save();
    panel.querySelector('.tpsens b').textContent = saved._sens.toFixed(1) + '×';
  });

  // dragging
  let drag = null;
  L.grab = (b, e) => {
    L.select(b);
    const v = get(b);
    drag = { b, id: e.pointerId, px: e.clientX, py: e.clientY, x: v.x, y: v.y };
  };
  L.move = (b, e) => {
    if (!drag || drag.b !== b || e.pointerId !== drag.id) return;
    const v = { ...get(b), x: Math.round(drag.x + e.clientX - drag.px), y: Math.round(drag.y + e.clientY - drag.py) };
    const lim = Math.max(innerWidth, innerHeight);
    v.x = Math.max(-lim, Math.min(lim, v.x)); v.y = Math.max(-lim, Math.min(lim, v.y));
    saved[b.dataset.id] = v; apply(b);
  };
  L.release = () => { if (drag) { drag = null; save(); } };
  L.select = (b) => {
    L.selected?.classList.remove('sel');
    L.selected = b; b?.classList.add('sel');
  };

  L.start = () => {
    L.editing = true;
    root.classList.add('edit', 'more');
    panel.classList.remove('hide');
    L.select(null);
  };
  L.stop = () => {
    L.editing = false; drag = null;
    root.classList.remove('edit', 'more');
    panel.classList.add('hide');
    L.select(null);
    L.onExit?.();
  };
  L.refresh();
  return L;
}
