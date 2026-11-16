// Tuning, part 1: looks. A "build" per car (paint, finish, livery, number, rims, glass, light bar,
// plate) is kept in localStorage and laid over the car's spec sheet when it is built; the sheet in
// CARS never changes. Colours and finishes go straight onto the live car, the rest rebuilds it.
import * as THREE from 'three';
import { svg } from './icons.js';

const KEY = 'polnacka-tune';
let store = {};
try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };

export const PAINTS = [
  ['Červená', 0xc8141e], ['Oranžová', 0xe07a12], ['Žlutá', 0xf2c21b], ['Limetková', 0x8cc63f],
  ['Zelená', 0x2a5d4a], ['Tyrkysová', 0x1a9a9a], ['Modrá', 0x1d4fb4], ['Noční modrá', 0x1a2340],
  ['Fialová', 0x6b2d8f], ['Růžová', 0xe05a9a], ['Bílá', 0xeeeeea], ['Stříbrná', 0xa8adb4],
  ['Šedá', 0x4a4e55], ['Černá', 0x141518], ['Hnědá', 0x5a3a22], ['Béžová', 0xc9b48a],
];
const RIMS = [
  ['Stříbrná', 0xc9ccd0], ['Bílá', 0xe6e8ea], ['Černá', 0x2c2e33], ['Grafit', 0x55585e],
  ['Zlatá', 0xc9a24a], ['Bronzová', 0x8a6538], ['Červená', 0xc8141e], ['Modrá', 0x1d4fb4],
];
const FINISH = {
  gloss: { name: 'Lesk', metal: 0.08, coat: 1, env: 0.55 },
  metal: { name: 'Metalíza', rough: 0.34, metal: 0.6, coat: 1, env: 0.8 },
  matte: { name: 'Mat', rough: 0.72, metal: 0, coat: 0, env: 0.3 },
  pearl: { name: 'Perleť', rough: 0.26, metal: 0.2, coat: 1, env: 0.7, irid: 1 },
  chrome: { name: 'Chrom', rough: 0.07, metal: 1, coat: 0.4, env: 1.2 },
};
const LIVERY = { none: ['Žádný', 0], stripes: ['Závodní pruhy', 1], side: ['Boční pruh', 2], twotone: ['Dvoubarva', 3] };
const GLASS = { clear: ['Čirá'], tint: ['Tónovaná', 0.8, 0x080b0d], dark: ['Tmavá', 0.92, 0x030405] };
const SPOKES = [5, 6, 8, 10];

function defaults(spec) {
  return {
    paint: spec.paint, finish: 'gloss', livery: 'none', paint2: spec.stripe ?? 0xf0f1ee, num: false, numVal: 7,
    rim: spec.wheel.rim, spokes: spec.wheel.spokes, glass: 'clear', roofBar: spec.id === 'pickup' || spec.id === 'rally' || spec.id === 'buggy', plate: spec.plate,
    susp: 0.5,
  };
}
export const tuneOf = spec => ({ ...defaults(spec), ...store[spec.id] });

// the spec sheet with this car's build laid over it (only what needs a rebuild lives here)
export function tunedSpec(spec) {
  const t = tuneOf(spec);
  return { ...spec, plate: t.plate, roofBar: t.roofBar, wheel: { ...spec.wheel, rim: t.rim, spokes: t.spokes }, phys: suspended(spec.phys, t.susp) };
}

// Suspension 0..1 around the car's own setup (0.5 = as it was tuned): soft is weaker springs, much
// weaker dampers and a little more travel, so it bobs and wallows; stiff is the other way round.
export function suspended(p, s = 0.5) {
  const f = Math.max(0, Math.min(1, s)) - 0.5;
  if (Math.abs(f) < 1e-3) return p;
  return { ...p, k: p.k * 2 ** (f * 1.6), c: p.c * 2 ** (f * 2.2), travel: p.travel * 2 ** (-f * 0.5) };
}
const SUSP_WORD = s => s < 0.15 ? 'Hodně měkké' : s < 0.4 ? 'Měkké' : s <= 0.6 ? 'Původní' : s < 0.85 ? 'Tvrdé' : 'Hodně tvrdé';

const numTex = {};
function numberTexture(n) {
  if (numTex[n]) return numTex[n];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f3ee'; x.beginPath(); x.arc(128, 128, 120, 0, Math.PI * 2); x.fill();
  x.lineWidth = 7; x.strokeStyle = '#16181c'; x.beginPath(); x.arc(128, 128, 106, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#16181c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 ${String(n).length > 1 ? 128 : 150}px Arial, sans-serif`; x.fillText(n, 128, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (numTex[n] = t);
}

// colours, finish, livery and glass straight onto a built car
export function dress(car, t, lite) {
  const p = car.paint, F = FINISH[t.finish] || FINISH.gloss;
  p.color.setHex(t.paint);
  p.roughness = F.rough ?? car.spec.roughness; p.metalness = F.metal; p.envMapIntensity = F.env;
  p.clearcoat = lite ? 0 : F.coat; p.clearcoatRoughness = 0.08;
  p.iridescence = F.irid || 0; p.iridescenceIOR = 1.7; p.iridescenceThicknessRange = [180, 620];
  if (car.userData?.finish !== t.finish) { p.needsUpdate = true; (car.userData ||= {}).finish = t.finish; }
  const L = p.userData.liv;
  L.uLiv.value = (LIVERY[t.livery] || LIVERY.none)[1];
  L.uPaint2.value.setHex(t.paint2);
  L.uNumOn.value = t.num ? 1 : 0;
  if (t.num) L.uNum.value = numberTexture(t.numVal);
  car.root.traverse(o => { if (o.material?.name === 'rim') o.material.color.setHex(t.rim); });
  // tinted side and rear glass; the windscreen stays clear so the driver still sees out
  const G = GLASS[t.glass] || GLASS.clear;
  let tint = car.glassTint;
  if (G.length > 1) {
    if (!tint) tint = car.glassTint = car.glass.clone();
    tint.opacity = G[1]; tint.color.setHex(G[2]);
  }
  for (const n in car.panes) if (n !== 'glassF') car.panes[n].mesh.material = G.length > 1 ? tint : car.glass;
}

// ---- the panel in the garage --------------------------------------------------------------
const CSS = `
#tuneBtn { display:inline-flex; align-items:center; gap:6px; background:rgba(22,14,6,.55); color:var(--ink); border:1px solid var(--gold); font:700 18px/1 'Barlow Condensed',sans-serif; letter-spacing:.04em; padding:9px 16px; cursor:pointer; }
#tuneBtn svg { width:18px; height:18px; }
#tuneBtn:hover { background:rgba(22,14,6,.8); }
#menu.tuning #pick, #menu.tuning #startRow, #menu.tuning #modes { display:none; }
#tune { position:fixed; z-index:21; top:clamp(12px,2vw,24px); right:clamp(12px,2vw,24px); bottom:clamp(12px,2vw,24px); width:min(370px, calc(100vw - 24px));
  display:none; flex-direction:column; background:rgba(22,14,6,.82); backdrop-filter:blur(10px); border-top:2px solid var(--gold); color:var(--ink); font-size:14px; }
#tune.on { display:flex; }
#tune header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px 8px; }
#tune header b { font:700 26px/1 'Barlow Condensed',sans-serif; letter-spacing:.015em; }
#tune header em { display:block; font-style:normal; color:var(--gold); font-size:13px; font-weight:600; }
#tune .x { background:none; border:0; color:var(--ink); cursor:pointer; padding:4px; }
#tune .body { overflow-y:auto; padding:2px 14px 14px; flex:1; }
#tune h4 { margin:14px 0 6px; font:600 13px/1 'Barlow',sans-serif; color:var(--dim); text-transform:uppercase; letter-spacing:.08em; }
#tune .sw { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
#tune .sw button { width:30px; height:30px; border-radius:50%; border:2px solid rgba(255,255,255,.18); cursor:pointer; padding:0; }
#tune .sw button.on { border-color:var(--gold); box-shadow:0 0 0 2px rgba(255,194,74,.35); }
#tune input[type=color] { width:30px; height:30px; padding:0; border:2px solid rgba(255,255,255,.18); border-radius:50%; background:none; cursor:pointer; overflow:hidden; }
#tune input[type=color]::-webkit-color-swatch-wrapper { padding:0; } #tune input[type=color]::-webkit-color-swatch { border:0; border-radius:50%; }
#tune .seg { display:flex; flex-wrap:wrap; gap:5px; }
#tune .seg button { background:rgba(255,247,232,.06); color:var(--ink); border:1px solid var(--line); font:inherit; font-size:13.5px; padding:6px 10px; cursor:pointer; }
#tune .seg button.on { border-color:var(--gold); color:var(--gold); }
#tune input[type=text], #tune input[type=number] { background:#f4f5f0; color:#16181c; border:0; font:700 20px/1 Arial,sans-serif; padding:6px 10px; width:150px; text-transform:uppercase; letter-spacing:.04em; }
#tune input[type=number] { width:76px; }
#tune .row { display:flex; gap:8px; align-items:center; }
#tune .susp { display:flex; gap:10px; align-items:center; font-size:13px; color:var(--dim); }
#tune .susp input { flex:1; accent-color:var(--gold); }
#tune .suspv { margin-top:4px; font-size:13px; color:var(--dim); } #tune .suspv b { color:var(--gold); }
#tune footer { display:flex; gap:8px; padding:10px 14px 14px; }
#tune footer button { flex:1; background:rgba(255,247,232,.06); color:var(--ink); border:1px solid var(--line); font:600 15px/1 'Barlow',sans-serif; padding:10px; cursor:pointer; }
#tune footer .done { background:var(--gold); color:#241607; border:0; font:700 19px/1 'Barlow Condensed',sans-serif; letter-spacing:.05em; }
@media (max-height:480px) { #tune h4 { margin:9px 0 4px; } #tune header b { font-size:21px; } #tune .sw button, #tune input[type=color] { width:26px; height:26px; } }
`;

const hex = n => '#' + n.toString(16).padStart(6, '0');

export function initTuning({ getCar, rebuild, lite }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const btn = document.createElement('button'); btn.id = 'tuneBtn'; btn.innerHTML = svg('wrench') + 'Tuning';
  const go = document.getElementById('go'); go.parentNode.insertBefore(btn, go);
  const el = document.createElement('div'); el.id = 'tune'; document.body.appendChild(el);
  const menu = document.getElementById('menu');
  const ui = { open: false };

  const spec = () => getCar().spec;
  const cur = () => tuneOf(spec());
  // `rb`: the change needs the car built again (rims, plate, light bar)
  const set = (patch, rb) => {
    const id = spec().id;
    store[id] = { ...cur(), ...patch }; save();
    if (rb) rebuild(); else dress(getCar(), cur(), lite());
    render();
  };

  const swatches = (list, val, key) => `<div class="sw">${list.map(([n, c]) => `<button title="${n}" data-k="${key}" data-v="${c}" class="${c === val ? 'on' : ''}" style="background:${hex(c)}"></button>`).join('')}<input type="color" data-k="${key}" value="${hex(val)}" title="Vlastní barva"></div>`;
  const seg = (obj, val, key) => `<div class="seg">${Object.entries(obj).map(([k, v]) => `<button data-k="${key}" data-s="${k}" class="${k === val ? 'on' : ''}">${v.name || v[0]}</button>`).join('')}</div>`;

  function render() {
    if (!ui.open) return;
    const s = spec(), t = cur();
    el.innerHTML = `
      <header><div><em>${s.tag}</em><b>${s.name}</b></div><button class="x" title="Zavřít (Esc)">${svg('close')}</button></header>
      <div class="body">
        <h4>Lak</h4>${swatches(PAINTS, t.paint, 'paint')}
        <h4>Povrch</h4>${seg(FINISH, t.finish, 'finish')}
        <h4>Polep</h4>${seg(Object.fromEntries(Object.entries(LIVERY).map(([k, v]) => [k, { name: v[0] }])), t.livery, 'livery')}
        <h4>Barva polepu a dvoubarvy</h4>${swatches(PAINTS, t.paint2, 'paint2')}
        <h4>Startovní číslo</h4>
        <div class="row"><div class="seg"><button data-k="num" data-s="0" class="${t.num ? '' : 'on'}">Bez čísla</button><button data-k="num" data-s="1" class="${t.num ? 'on' : ''}">S číslem</button></div>
          <input type="number" min="0" max="99" value="${t.numVal}" data-in="numVal" ${t.num ? '' : 'disabled style="opacity:.4"'}></div>
        <h4>Disky</h4>${swatches(RIMS, t.rim, 'rim')}
        <div class="seg" style="margin-top:6px">${SPOKES.map(n => `<button data-k="spokes" data-s="${n}" class="${n === t.spokes ? 'on' : ''}">${n} paprsků</button>`).join('')}</div>
        <h4>Perování</h4>
        <div class="susp"><span>Měkké</span><input type="range" min="0" max="1" step="0.05" value="${t.susp}" data-in="susp"><span>Tvrdé</span></div>
        <div class="suspv">${t.susp.toFixed(2)} · <b>${SUSP_WORD(t.susp)}</b></div>
        ${s.open ? '' : `<h4>Skla</h4>${seg(Object.fromEntries(Object.entries(GLASS).map(([k, v]) => [k, { name: v[0] }])), t.glass, 'glass')}`}
        <h4>Rampa světel na střeše</h4><div class="seg"><button data-k="roofBar" data-s="0" class="${t.roofBar ? '' : 'on'}">Bez rampy</button><button data-k="roofBar" data-s="1" class="${t.roofBar ? 'on' : ''}">S rampou</button></div>
        <h4>SPZ</h4><input type="text" maxlength="8" value="${t.plate}" data-in="plate" spellcheck="false">
      </div>
      <footer><button class="reset">Původní vzhled</button><button class="done">Hotovo</button></footer>`;
  }

  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('x') || b.classList.contains('done')) return close();
    if (b.classList.contains('reset')) { delete store[spec().id]; save(); rebuild(); render(); return; }
    const k = b.dataset.k; if (!k) return;
    if (b.dataset.v) return set({ [k]: +b.dataset.v });
    const s = b.dataset.s;
    if (k === 'num') return set({ num: s === '1' });
    if (k === 'roofBar') return set({ roofBar: s === '1' }, true);
    if (k === 'spokes') return set({ spokes: +s }, true);
    set({ [k]: s });
  });
  // colour pickers: live while dragging, without redrawing the panel under the pointer
  el.addEventListener('input', e => {
    const i = e.target;
    if (i.dataset.in === 'susp') { el.querySelector('.suspv').innerHTML = `${(+i.value).toFixed(2)} · <b>${SUSP_WORD(+i.value)}</b>`; return; }
    if (i.type === 'color') { store[spec().id] = { ...cur(), [i.dataset.k]: parseInt(i.value.slice(1), 16) }; save(); dress(getCar(), cur(), lite()); }
  });
  el.addEventListener('change', e => {
    const i = e.target;
    if (i.type === 'color') render();
    else if (i.dataset.in === 'susp') set({ susp: Math.round(+i.value * 20) / 20 }, true);
    else if (i.dataset.in === 'numVal') set({ numVal: Math.max(0, Math.min(99, Math.round(+i.value) || 0)) });
    else if (i.dataset.in === 'plate') { const v = i.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 8); set({ plate: v || spec().plate }, true); }
  });
  // typing in the panel must not drive the garage (A/D switch cars, Space sets off)
  el.addEventListener('keydown', e => { if (e.code === 'Escape') close(); e.stopPropagation(); });

  function open() { ui.open = true; el.classList.add('on'); menu.classList.add('tuning'); render(); }
  function close() { ui.open = false; el.classList.remove('on'); menu.classList.remove('tuning'); }
  btn.addEventListener('click', () => { btn.blur(); open(); });
  ui.close = close; ui.sync = render;
  return ui;
}
