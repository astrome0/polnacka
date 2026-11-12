// The drone's ground station (U): a Start tab to launch, land and take over, an Upgrades tab paid
// for with the crop you've wrecked. And the drone's own feed: telemetry, static as the signal
// goes, rain on the lens (V wipes it) and the waypoint arrow when it lies somewhere out there.
import * as THREE from 'three';
import { UPGRADES } from './drone.js';

const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const kc = n => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
const dist = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km';
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const CARD = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
const ICON = {
  bat: '<svg viewBox="0 0 32 32"><rect x="4" y="9" width="22" height="14" rx="2.5"/><rect x="26" y="13" width="3" height="6" rx="1"/><path d="M14 11l-3 6h4l-2 5 6-7h-4l2-4z" class="f"/></svg>',
  range: '<svg viewBox="0 0 32 32"><circle cx="16" cy="22" r="2.4" class="f"/><path d="M10.5 16.5a8 8 0 0 1 11 0M6.5 12.5a13.5 13.5 0 0 1 19 0M2.5 8.5a19 19 0 0 1 27 0"/></svg>',
  charge: '<svg viewBox="0 0 32 32"><path d="M11 4v7M21 4v7M8 11h16v5a8 8 0 0 1-16 0zM16 24v5"/><path d="M17 13l-3 5h3l-2 4" class="bolt"/></svg>',
  motor: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="3.2" class="f"/><path d="M16 12.8c1-5 6-8 9-6s-2 7-6 8.5M19.2 16c5 1 8 6 6 9s-7-2-8.5-6M16 19.2c-1 5-6 8-9 6s2-7 6-8.5M12.8 16c-5-1-8-6-6-9s7 2 8.5 6"/></svg>',
};

export class Deck {
  // api: canLaunch() -> reason or null, launch(), wind() -> { speed, tornado }
  constructor(drone, api) {
    this.d = drone; this.api = api; this.open = false; this.tab = 'start'; this.t = 0;
    document.querySelectorAll('#dkTabs button').forEach(b => b.addEventListener('click', () => this.show(b.dataset.tab)));
    $('dkClose').addEventListener('click', () => api.close());
    $('dkGo').addEventListener('click', () => { if (!this.api.canLaunch()) { this.api.launch(); this.api.close(); } });
    $('dkLand').addEventListener('click', () => { this.d.land(); this.render(); });
    $('dkBack').addEventListener('click', () => { this.d.release(); this.api.close(); });
    $('dkTake').addEventListener('click', () => { if (!this.d.lost) { this.d.view = true; this.d.landing = false; this.api.close(); } });
    $('dkCards').addEventListener('click', e => {
      const b = e.target.closest('button[data-buy]');
      if (b && this.d.buy(b.dataset.buy)) { this.api.bought?.(UPGRADES[b.dataset.buy].name); this.render(); }
    });
  }
  show(tab) {
    this.tab = tab;
    document.querySelectorAll('#dkTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('dkStart').classList.toggle('on', tab === 'start'); $('dkUp').classList.toggle('on', tab === 'up');
    this.render();
  }
  setOpen(on) { this.open = on; $('deck').classList.toggle('on', on); if (on) this.render(); }
  update(dt) { if (!this.open) return; this.t -= dt; if (this.t <= 0) { this.t = 0.2; this.render(); } }
  render() {
    const d = this.d, st = d.state;
    $('dkCash').textContent = kc(d.cash);
    // the battery ring
    const b = d.battery, C = 2 * Math.PI * 52;
    $('dkRing').style.strokeDasharray = `${(C * b).toFixed(1)} ${C.toFixed(1)}`;
    $('dkRing').style.stroke = b < 0.2 ? 'var(--red)' : 'var(--gold)';
    $('dkBatN').textContent = Math.floor(b * 100) + ' %';
    $('dkBatT').textContent = st === 'packed' ? (b >= 1 ? 'Plně nabito' : `Nabíjí se · plná za ${mmss((1 - b) * this.d.fullCharge)}`) : st === 'flying' ? 'Ve vzduchu' : 'Nenabíjí se, leží venku';
    $('dkRigCharge').classList.toggle('on', st === 'packed' && b < 1);
    $('dkProps').classList.toggle('spin', st === 'flying' && !d.dead);
    const chip = $('dkState');
    chip.textContent = st === 'packed' ? 'V autě' : st === 'flying' ? (d.view ? 'Letí' : d.landing ? 'Přistává' : 'Visí ve vzduchu') : `Leží ${dist(d.dist)} odsud`;
    chip.className = 'chip ' + st;
    $('dkBat').textContent = UPGRADES.bat.fmt(UPGRADES.bat.vals[d.lv.bat]);
    $('dkRange').textContent = UPGRADES.range.fmt(UPGRADES.range.vals[d.lv.range]);
    const w = this.api.wind();
    $('dkWind').textContent = Math.round(w.speed) + ' m/s';
    $('dkWind').className = w.speed > 15 * d.motor ? 'bad' : w.speed > 10 ? 'warn' : '';
    $('dkSig').textContent = st === 'flying' ? (d.lost ? 'ztracen' : Math.round(d.signal * 100) + ' %') : '—';
    // what you can do from here
    const why = st === 'packed' ? this.api.canLaunch() : null;
    let note = '';
    if (st === 'packed') note = why || (w.tornado ? 'Pozor, poblíž je tornádo. Dron ho nepřežije, jestli se dostane do jádra.' : w.speed > 15 * d.motor ? 'Vítr je silnější, než motory zvládnou. Dron bude unášet.' : '');
    else if (st === 'down') note = 'Dron sám nepřiletí. Dojeď nebo dojdi ke žlutému paprsku, sebereš ho, až budeš u něj.';
    else if (d.lost) note = 'Signál ztracen. Dron visí na místě, dokud se nepřiblížíš nebo mu nedojde baterie.';
    else if (!d.view) note = d.landing ? 'Přistává tam, kde je. Pak si pro něj dojdi.' : '';
    $('dkNote').textContent = note; $('dkNote').classList.toggle('on', !!note);
    $('dkGo').style.display = st === 'packed' ? '' : 'none'; $('dkGo').disabled = !!why;
    $('dkLand').style.display = st === 'flying' && d.view && !d.landing ? '' : 'none';
    $('dkBack').style.display = st === 'flying' && d.view ? '' : 'none';
    $('dkTake').style.display = st === 'flying' && !d.view && !d.dead ? '' : 'none'; $('dkTake').disabled = d.lost;
    if (this.tab === 'up') this.renderCards();
  }
  renderCards() {
    const d = this.d;
    $('dkCards').innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
      const l = d.lv[k], max = l >= u.cost.length, price = u.cost[l], can = !max && d.cash >= price;
      const pips = u.vals.map((_, i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('');
      return `<div class="dkCard${max ? ' max' : ''}">
        <div class="dkIco">${ICON[k]}</div>
        <div class="dkTxt"><b>${u.name}</b><p>${u.text}</p><div class="pips">${pips}</div></div>
        <div class="dkVal"><span>${u.fmt(u.vals[l])}</span>${max ? '' : `<em>→ ${u.fmt(u.vals[l + 1])}</em>`}</div>
        <button data-buy="${k}" ${can ? '' : 'disabled'}>${max ? 'Maximum' : kc(price)}</button>
      </div>`;
    }).join('');
  }
}

// The drone's feed over the picture
export class DroneHud {
  constructor(drone) {
    this.d = drone; this.t = 0; this.drops = []; this.dropsDirty = true; this.wipe = 0;
    this.st = $('dStatic'); this.sx = this.st.getContext('2d'); this.st.width = 192; this.st.height = 108;
    this.img = this.sx.createImageData(192, 108);
    this.dc = $('dDrops'); this.dx = this.dc.getContext('2d');
    // the compass tape: a mark every 15°, from -360 to 720 so it never runs out
    let h = '';
    for (let a = -360; a <= 720; a += 15) { const n = ((a % 360) + 360) % 360; h += `<span class="${n % 45 ? '' : 'big'}">${n % 45 ? '·' : CARD[n / 45]}</span>`; }
    $('dTape').innerHTML = h;
  }
  update(dt, camera, info) {
    const d = this.d, on = d.view;
    document.body.classList.toggle('dview', on);
    // the waypoint: to where the drone lies, or from the drone back to the car (Y)
    const home = on && d.homeOn, nav = home || (!on && d.beam.visible);
    $('dNav').classList.toggle('on', nav);
    if (nav) {
      const t = home ? d.pilot : d.pos;
      camera.getWorldDirection(tmp);
      const a = Math.atan2(t.x - camera.position.x, t.z - camera.position.z) - Math.atan2(tmp.x, tmp.z);
      $('dArrow').style.transform = `rotate(${(-a * 180 / Math.PI).toFixed(1)}deg)`;
      $('dDistN').textContent = home ? `${info.onFoot ? 'Ty' : 'Auto'} · ${dist(d.homeDist)}` : 'Dron · ' + dist(d.dist);
    }
    if (!on) { this.drops.length = 0; this.dropsDirty = true; this.paintDrops(); return; }
    // static: the weaker the signal, the more of it; all of it when it's gone or down
    const down = d.state !== 'flying', q = down ? 0 : d.lost ? 0.02 : d.signal;
    const noise = down ? 1 : clamp(Math.pow(1 - q, 1.6) * 1.05, 0, 0.96) + d.shake * 0.04;
    this.st.style.opacity = noise.toFixed(3);
    if (noise > 0.02) {
      const px = this.img.data;
      for (let i = 0; i < px.length; i += 4) { const v = Math.random() * 255 | 0; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
      this.sx.putImageData(this.img, 0, 0);
    }
    $('dLost').classList.toggle('on', d.lost || down);
    $('dLost').textContent = down ? 'SPOJENÍ PŘERUŠENO' : 'SIGNÁL ZTRACEN';
    // rain on the lens
    if (info.rain > 0.05 && Math.random() < info.rain * dt * 7) this.addDrop();
    if (this.wipe > 0) { this.wipe -= dt; this.drops.length = 0; this.dropsDirty = true; }
    this.paintDrops();
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.08;
    // the time left at the way it's been flying lately, not this instant
    this.load = (this.load ?? 0.3) + (d.load - (this.load ?? 0.3)) * 0.04;
    const b = d.battery, left = b * d.capacity / (0.75 + 0.65 * this.load);
    $('dBatI').style.width = (b * 100).toFixed(1) + '%';
    $('dBatI').className = b < 0.15 ? 'bad' : b < 0.3 ? 'warn' : '';
    $('dBatN').textContent = Math.floor(b * 100) + ' %';
    $('dBatT').textContent = '≈ ' + mmss(left);
    const bars = d.lost ? 0 : Math.ceil(q * 5);
    document.querySelectorAll('#dSig i').forEach((e, i) => e.classList.toggle('on', i < bars));
    $('dDist').textContent = dist(d.dist) + ' / ' + dist(d.range);
    $('dAlt').textContent = Math.round(d.agl) + ' m';
    $('dSpd').textContent = Math.round(Math.hypot(d.v.x, d.v.z) * 3.6) + ' km/h';
    $('dVs').textContent = (d.v.y >= 0 ? '+' : '') + d.v.y.toFixed(1).replace('.', ',') + ' m/s';
    $('dZoom').textContent = d.zoom.toFixed(1).replace('.', ',') + '×';
    // heading: north is -z, so turning right counts up
    const hd = ((-d.yaw * 180 / Math.PI) % 360 + 360) % 360;
    $('dHead').textContent = `${CARD[Math.round(hd / 45) % 8]} ${Math.round(hd)}°`;
    $('dTape').style.transform = `translateX(${(-(hd + 360) / 15 * 26).toFixed(1)}px)`;
    // the wind as it blows across the picture: up is straight ahead
    const W = d.wind, ws = Math.hypot(W.x, W.z), fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
    const wa = Math.atan2(W.x * -fz + W.z * fx, W.x * fx + W.z * fz);
    $('dWArr').style.transform = `rotate(${(wa * 180 / Math.PI).toFixed(1)}deg)`;
    $('dWTxt').textContent = `Vítr ${Math.round(ws)} m/s`;
    const lim = 15 * d.motor;
    $('dWind').className = ws > lim ? 'bad' : ws > lim * 0.66 ? 'warn' : '';
    let warn = '';
    if (d.dead) warn = 'PADÁ';
    else if (d.core > 0.25) warn = 'TORNÁDO · ZTRÁTA STABILITY';
    else if (d.hp < 0.5) warn = 'POŠKOZENÉ VRTULE';
    else if (ws > lim) warn = 'SILNÝ VÍTR · UNÁŠÍ';
    else if (b < 0.15) warn = 'SLABÁ BATERIE';
    else if (q < 0.35) warn = 'SLABÝ SIGNÁL';
    else if (d.landing) warn = 'PŘISTÁVÁ';
    $('dWarn').textContent = warn; $('dWarn').classList.toggle('on', !!warn);
  }
  addDrop() {
    if (this.drops.length > 60) this.drops.shift();
    this.drops.push({ x: Math.random(), y: Math.random(), r: 3 + Math.random() * 9 });
    this.dropsDirty = true;
  }
  paintDrops() {
    if (!this.dropsDirty) return;
    this.dropsDirty = false;
    const c = this.dc, w = c.width = innerWidth >> 1, h = c.height = innerHeight >> 1, x = this.dx;
    x.clearRect(0, 0, w, h);
    for (const p of this.drops) {
      const g = x.createRadialGradient(p.x * w - p.r * 0.3, p.y * h - p.r * 0.3, 0, p.x * w, p.y * h, p.r);
      g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.6, 'rgba(200,215,230,.12)'); g.addColorStop(0.9, 'rgba(20,25,30,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(p.x * w, p.y * h, p.r, 0, 6.283); x.fill();
    }
  }
}
const tmp = new THREE.Vector3();
