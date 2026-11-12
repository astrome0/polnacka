// Touch controls for phones and tablets (landscape). Polňačka reads the keyboard, so every button here
// just sends the key it stands for; turning the view goes through window.game.lookBy (main.js).
//   in the car:     ◀ ▶ steer · PLYN gas · BRZDA brake · RUČNÍ handbrake · NITRO · drag the right side to look round
//   on foot:        left stick walks (all the way = run) · SKOK · BĚH · dalekohled · drag to look
//   flying the drone: left stick flies · NAHORU / DOLŮ · TURBO · +/− zoom · drag to look
// With a mouse nothing here runs. To try it on a computer, add ?touch=1 to the address.
import { svg } from './icons.js';
import { initLayout } from './layout.js';
const touchDevice = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
if (touchDevice || /[?&]touch=1/.test(location.search)) init();

function init() {
  document.body.classList.add('touch');
  const g = () => window.game;
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true, cancelable: true }));
  const down = (code) => send('keydown', code);
  const up = (code) => send('keyup', code);
  const held = new Set();
  const hold = (code, on) => { if (on && !held.has(code)) { held.add(code); down(code); } else if (!on && held.has(code)) { held.delete(code); up(code); } };
  const releaseAll = () => { for (const c of [...held]) hold(c, false); };

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const root = el('div'); root.id = 'touch';
  const stickZone = el('div', 'tzone left'), lookZone = el('div', 'tzone right');
  const base = el('div', 'tbase hide'), knob = el('div', 'tknob');
  base.append(knob);
  root.append(stickZone, lookZone, base);
  const layout = initLayout(root, 'polnacka-touch-layout', { hint: 'Táhni tlačítko · − + velikost', sens: 'Rychlost otáčení', reset: 'Výchozí', resetAll: 'Vše výchozí', done: 'Hotovo' });

  // a button; `modes` says where it shows: drive foot drone
  const button = (label, cls, modes, onDown, onUp, title) => {
    const b = el('button', `tbtn ${cls}`);
    b.type = 'button'; b.dataset.m = modes; b.setAttribute('aria-label', title || label); b.innerHTML = label[0] === '@' ? svg(label.slice(1)) : label;
    b.dataset.id = cls.split(' ').pop();
    const d = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } if (layout.editing) { layout.grab(b, e); return; } b.classList.add('on'); onDown?.(); };
    const u = (e) => { e.preventDefault(); if (layout.editing) { layout.release(); return; } b.classList.remove('on'); onUp?.(); };
    b.addEventListener('pointermove', (e) => { if (layout.editing) layout.move(b, e); });
    b.addEventListener('pointerdown', d); b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u);
    root.append(b);
    return b;
  };
  const keyBtn = (label, cls, modes, code, title) => button(label, cls, modes, () => hold(code, true), () => hold(code, false), title);
  const tapBtn = (label, cls, modes, code, title) => button(label, cls, modes, () => { down(code); }, () => { up(code); }, title);

  // driving
  keyBtn('@left', 'big steerL', 'drive', 'KeyA', 'Steer left');
  keyBtn('@right', 'big steerR', 'drive', 'KeyD', 'Steer right');
  keyBtn('<b>PLYN</b>', 'big gas', 'drive', 'KeyW', 'Gas');
  keyBtn('<b>BRZDA</b>', 'big brake', 'drive', 'KeyS', 'Brake / reverse');
  keyBtn('<b>RUČNÍ</b>', 'mid hand', 'drive', 'Space', 'Handbrake');
  keyBtn('<b>NITRO</b>', 'mid nitro', 'drive', 'ShiftLeft', 'Nitro');
  // on foot
  keyBtn('<b>SKOK</b>', 'big jump', 'foot', 'Space', 'Jump');
  keyBtn('<b>BĚH</b>', 'mid run', 'foot', 'ShiftLeft', 'Run (hold)');
  tapBtn('@bino', 'mid bino', 'foot', 'KeyB', 'Binoculars');
  // the drone
  keyBtn('<b>NAHORU</b>', 'big dup', 'drone', 'Space', 'Up');
  keyBtn('<b>DOLŮ</b>', 'mid ddown', 'drone', 'ShiftLeft', 'Down');
  button('<b>TURBO</b>', 'mid turbo', 'drone', () => { down('KeyW'); up('KeyW'); hold('KeyW', true); }, () => hold('KeyW', false), 'Turbo');
  button('@plus', 'small zin', 'drone', () => g().drone.zoomBy(1.25), null, 'Zoom in');
  button('@minus', 'small zout', 'drone', () => g().drone.zoomBy(0.8), null, 'Zoom out');
  tapBtn('@wiper', 'small wipe', 'drone', 'KeyV', 'Wipe the lens');

  // top right, always
  const all = 'drive foot drone';
  tapBtn('@pause', 'small pause', all, 'Escape', 'Menu');
  const more = button('@dots', 'small more', all, () => root.classList.toggle('more'), null, 'More');
  tapBtn('@door', 'small door', 'drive foot', 'KeyF', 'Get in / out');
  tapBtn('@drone', 'small deck', all, 'KeyU', 'Drone station');
  tapBtn('@camera', 'small cam', 'drive', 'KeyC', 'Camera');
  // the "more" drawer
  tapBtn('@wrench', 'small x1', 'drive', 'KeyR', 'Repair the car');
  tapBtn('@bulb', 'small x2', 'drive', 'KeyL', 'Lights');
  keyBtn('@horn', 'small x3', 'drive', 'KeyH', 'Horn');
  tapBtn('@wiper', 'small x4', 'drive', 'KeyV', 'Wipers');
  tapBtn('@weather', 'small x5', all, 'KeyP', 'Change the weather');
  tapBtn('@clock', 'small x6', all, 'KeyT', 'Time +2 h');
  tapBtn('@sound', 'small x7', all, 'KeyM', 'Sound');
  button('@move', 'small x8', all, () => { releaseAll(); layout.start(); }, null, 'Move the buttons');
  document.body.append(root);
  layout.refresh();

  // ───────── the stick (on foot and with the drone) ─────────
  const R = 56, DEAD = 0.28;
  let stickId = null, sx = 0, sy = 0;
  const setStick = (dx, dy) => {
    const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R, ny = dy / R;
    hold('KeyW', ny < -DEAD); hold('KeyS', ny > DEAD); hold('KeyA', nx < -DEAD); hold('KeyD', nx > DEAD);
    if (root.dataset.mode === 'foot') hold('ShiftLeft', Math.hypot(nx, ny) > 0.97 && ny < -0.6); // all the way forward = run
  };
  const stopStick = () => {
    stickId = null; base.classList.add('hide');
    for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) hold(c, false);
    if (root.dataset.mode === 'foot') hold('ShiftLeft', false);
  };
  stickZone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) stopStick(); // a lost pointerup must never lock the stick
    e.preventDefault();
    try { stickZone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
    base.style.left = `${sx}px`; base.style.top = `${sy}px`; knob.style.transform = '';
    base.classList.remove('hide');
  });
  stickZone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) setStick(e.clientX - sx, e.clientY - sy); });
  const endStick = (e) => { if (e.pointerId === stickId) stopStick(); };
  stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick);

  // ───────── looking round ─────────
  let lookId = null, lx = 0, ly = 0;
  lookZone.addEventListener('pointerdown', (e) => {
    lookId = null; // a new finger takes over (never stay stuck on an old one)
    e.preventDefault();
    try { lookZone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    g().G.pointer = true; // (the head swings back slowly while you look, like with the mouse)
  });
  lookZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    g().lookBy((e.clientX - lx) * 1.5 * layout.sens, (e.clientY - ly) * 1.5 * layout.sens);
    lx = e.clientX; ly = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) { lookId = null; g().G.pointer = false; } };
  lookZone.addEventListener('pointerup', endLook); lookZone.addEventListener('pointercancel', endLook);
// also when the finger lifts outside the zone or the browser loses the event (iOS does that)
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) addEventListener(t, (e) => { endStick(e); endLook(e); });

  // ───────── which buttons show ─────────
  let last = '';
  setInterval(() => {
    const api = g();
    if (!api) return;
    let mode = '';
    if (api.G.mode === 'play' && !api.deck.open) mode = api.drone.view ? 'drone' : api.G.onFoot ? 'foot' : 'drive';
    if (layout.editing && last) mode = last; // (the game goes on while you place buttons: keep this set)
    if (mode !== last) {
      stopStick(); lookId = null; releaseAll(); root.classList.remove('more');
      root.dataset.mode = mode; root.classList.toggle('hide', !mode);
      document.body.classList.toggle('t-stick', mode === 'foot' || mode === 'drone');
      last = mode;
    }
  }, 120);

  // full screen and sideways when you press Start (needs that tap)
  document.getElementById('go')?.addEventListener('click', () => {
    try { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {}); } catch { /* not allowed */ }
    try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch { /* not allowed */ }
  });
  root.classList.add('hide');
  for (const t of ['gesturestart', 'gesturechange']) addEventListener(t, (e) => e.preventDefault());
  // (no document-wide touchmove listener: a non-passive one makes Safari wait for each frame before it delivers the finger's movement)
}
