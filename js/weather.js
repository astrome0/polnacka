// Weather as cells that drift over the land with the wind. Each cell is a patch of low cloud that
// builds, rains and dies; rain, storms and wet ground exist only under one. A small map round the
// player holds the field for the shaders (LIT.uWxTex): r the lid of cloud, g rain, b heaped cloud up
// to 0.5 and storm above it, a how wet the ground is. Wetness is kept per spot, so the road dries where the rain has moved on.
//
// The wind near the ground lives here too, on a second map (LIT.uWindTex): rg the wind in m/s,
// b how gusty it is, a dust it can lift. It is the day's wind (the clouds' drift, slower and veered
// near the ground, rising and falling over minutes) plus the cold air that showers and storms throw
// out ahead of themselves. That outflow peaks in a ring just outside the rain, strongest on the side
// the cell is moving to: the gust front, which reaches you before the rain does. Gusts are a noise
// that drifts with the wind (LIT.uWindOff), the same in the shaders as in windAt here.
import * as THREE from 'three';
import { LIT, CLOUD_TILE } from './flora.js';

export const WX_N = 96, WX_SPAN = 48000, WX_CELL = WX_SPAN / WX_N;
const R = (a, b) => a + Math.random() * (b - a);
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const fract = x => x - Math.floor(x);
const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const vnoise2 = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y); let a = x - i, b = y - j;
  a = a * a * (3 - 2 * a); b = b * b * (3 - 2 * b);
  return (hash2(i, j) * (1 - a) + hash2(i + 1, j) * a) * (1 - b) + (hash2(i, j + 1) * (1 - a) + hash2(i + 1, j + 1) * a) * b;
};
// Supercells: a rare storm (SUPER_ODDS of the storms that build on their own, key O calls one) whose
// updraft rotates. It doesn't drift with the wind like other cells: it moves slower and veers right
// of it (a right mover), its heading wandering a little over minutes. Its rain falls ahead of the
// updraft, which stands over a rain-free base with the wall cloud hanging under it (cbAt in clouds.js).
const SUPER_ODDS = 0.15;
// how hard each kind of cell blows out ahead of itself, m/s at the gust front
const OUTFLOW = { drizzle: 0, shower: 7, band: 4, storm: 21 };
// how windy each weather is near the ground, as a share of the clouds' drift: Jasno, Mlha, Mrholení, Déšť, Bouřka
const CALM = [0.45, 0.12, 0.45, 0.55, 0.6];
// the wind map is stored in ±WIND_MAX m/s
const WIND_MAX = 32;
// sizes in metres, times in real seconds
export const KINDS = {
  drizzle: { r: [4500, 8000], asp: [1.4, 2.2], amp: [0.22, 0.36], grow: [90, 150], life: [480, 840] },
  shower: { r: [1300, 2600], asp: [1, 1.4], amp: [0.45, 0.85], grow: [70, 120], life: [240, 420] },
  band: { r: [4000, 7500], asp: [1.6, 2.6], amp: [0.5, 0.75], grow: [90, 150], life: [480, 840] },
  storm: { r: [1800, 3000], asp: [1, 1.5], amp: [0.95, 1], grow: [90, 150], life: [360, 600] },
};
// what each weather (WEATHERS in main.js) keeps round you: Jasno, Mlha, Mrholení, Déšť, Bouřka
const WANT = [{}, {}, { drizzle: 1 }, { band: 1, shower: 2 }, { storm: 2, shower: 1 }];
// and what P puts right overhead
const FORCE = [null, null, 'drizzle', 'band', 'storm'];

export class Weather {
  constructor(sky, wind) {
    this.sky = sky; this.wind = wind;
    this.cells = []; this.regime = 0; this.spawnT = 0; this.mapT = 0; this.t = 0;
    this.data = new Uint8Array(WX_N * WX_N * 4);
    this.wet = new Float32Array(WX_N * WX_N);
    this.ox = NaN; this.oz = NaN;
    const tex = this.tex = new THREE.DataTexture(this.data, WX_N, WX_N, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    LIT.uWxTex.value = tex;
    this.windData = new Uint8ClampedArray(WX_N * WX_N * 4);
    const wt = this.windTex = new THREE.DataTexture(this.windData, WX_N, WX_N, THREE.RGBAFormat);
    wt.magFilter = wt.minFilter = THREE.LinearFilter; wt.needsUpdate = true;
    LIT.uWindTex.value = wt;
    // hail on the same grid: r how white the ground is with it (kept per spot like wetness, it melts
    // in a few minutes), g hail falling right now. b and a carry a storm's anvil and shelf cloud.
    this.ice = new Float32Array(WX_N * WX_N);
    this.iceData = new Uint8Array(WX_N * WX_N * 4);
    const it = this.iceTex = new THREE.DataTexture(this.iceData, WX_N, WX_N, THREE.RGBAFormat);
    it.magFilter = it.minFilter = THREE.LinearFilter; it.needsUpdate = true;
    LIT.uIceTex.value = it;
    // the day's wind near the ground, and how far the gusts have drifted with it
    this.base = new THREE.Vector2(); this.calm = CALM[0]; this.off = LIT.uWindOff.value;
    this.here = { lid: 0, rain: 0, storm: 0, wet: 0, stormNear: Infinity };
    this.air = { x: 0, z: 0, speed: 0, gust: 1, turb: 0, out: 0 };
    this.onBolt = null;
  }
  // a cell's strength over its life: builds, holds, fades
  env(c) { return ss(0, c.grow, c.age) * (1 - ss(c.life - c.fade, c.life, c.age)); }
  // The steady wind at x, z without the gusts: the day's wind and every cell's outflow. out.turb is
  // how gusty it is there (0.35 in the open, up to 1 in an outflow), out.out the outflow's own speed.
  steady(x, z, out) {
    let vx = this.base.x, vz = this.base.y;
    const w = this.wind, wl = Math.hypot(w.x, w.y) || 1;
    let ox = 0, oz = 0, core = 0;
    for (const c of this.cells) {
      const S = OUTFLOW[c.kind];
      if (!S) continue;
      const dx = x - c.x, dz = z - c.z, dist = Math.hypot(dx, dz), r = c.r * (1 + c.asp) * 0.5, d = dist / r;
      if (d > 1.9) continue;
      const e = this.env(c);
      if (e <= 0) continue;
      // nothing under the middle, a sharp rise to the gust front just outside the rain, then it dies away
      const prof = ss(0.25, 0.95, d) * (1 - ss(1.4, 1.8, d));
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      const ahead = 0.4 + 0.6 * (0.5 + 0.5 * (nx * w.x + nz * w.y) / wl);
      const s = S * prof * ahead * e;
      ox += nx * s; oz += nz * s;
      // the downdraft under a storm's core is all gusts, no direction
      if (c.storm) core = Math.max(core, e * (1 - ss(0.2, 0.7, d)));
    }
    const os = Math.hypot(ox, oz);
    out.x = vx + ox; out.z = vz + oz; out.out = os;
    out.turb = Math.min(1, 0.35 + os / 14 + core * 0.6);
    return out;
  }
  // the gust factor at x, z: 1 is the mean, it swings more where turb is high (same sum as windAt in flora.js)
  gust(x, z, turb) {
    const qx = x - this.off.x, qz = z - this.off.y;
    const n = vnoise2(qx / 70, qz / 70) * 0.6 + vnoise2((qx - this.off.x * 0.3) / 23, (qz - this.off.y * 0.3) / 23) * 0.4;
    return 1 + (0.3 + 1.4 * n - 1) * (0.45 + 0.55 * turb);
  }
  // the wind as it blows at x, z right now, gusts and all
  windAt(x, z, out) {
    this.steady(x, z, out);
    const g = this.gust(x, z, out.turb);
    out.x *= g; out.z *= g; out.gust = g; out.speed = Math.hypot(out.x, out.z);
    return out;
  }
  // the cloud cover map where a drifting cloud stands: the same numbers the sky's clouds are made of
  cover(x, z) {
    const { data, N } = this.sky.cloudMap, w = this.wind, t = this.t;
    const fx = (((x - w.x * t) / CLOUD_TILE) % 1 + 1) % 1 * N, fy = (((z - w.y * t) / CLOUD_TILE) % 1 + 1) % 1 * N;
    const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, at = (p, q) => data[(q % N) * N + (p % N)];
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  }
  // sup: make a storm a supercell (true), or let the odds decide (undefined)
  spawn(kind, x, z, age = 0, grow, sup) {
    const K = KINDS[kind], w = this.wind, a = Math.atan2(w.y, w.x);
    const c = {
      kind, storm: kind === 'storm', r: R(...K.r), asp: R(...K.asp), amp: R(...K.amp),
      // long cells lie across the wind like a front, showers and storms along it
      ang: a + (kind === 'band' || kind === 'drizzle' ? Math.PI / 2 : 0) + R(-0.4, 0.4),
      x, z, age, grow: grow ?? R(...K.grow), life: R(...K.life), boltT: R(3, 12), seed: Math.random(),
    };
    c.sup = c.storm && (sup ?? Math.random() < SUPER_ODDS);
    if (c.sup) {
      // bigger, rounder, longer lived; it takes a while to organise before it rotates
      Object.assign(c, { r: R(2300, 3000), asp: R(1, 1.15), amp: 1, grow: grow ?? R(140, 200), life: R(800, 1200) });
      // heading right of the wind, and where it wanders to next
      c.veer = R(0.3, 0.6); c.veerTo = c.veer; c.veerT = R(60, 150);
      // the wall cloud's and the tower's turn, radians
      c.spin = Math.random() * 6.283; c.spinW = c.spin;
    }
    c.fade = Math.min(90, c.life * 0.25);
    // most storms drop hail from their core while they're at their strongest, some don't
    c.hail = c.storm && (c.sup || Math.random() < 0.75) ? R(c.sup ? 0.7 : 0.45, 1) : 0;
    this.move(c, 0);
    this.cells.push(c);
    return c;
  }
  // how far a supercell has organised: the rotation, the wall cloud under it. 0 to 1.
  meso(c) {
    return c.sup ? ss(c.grow * 0.8, c.grow * 1.6, c.age) * (1 - ss(c.life - c.fade * 1.5, c.life - c.fade * 0.3, c.age)) : 0;
  }
  // where the rain falls, against the cell's middle (the updraft): a supercell drops it ahead and to
  // the left of its updraft, a plain cell right under itself
  rainOff(c) {
    if (!c.sup) return [0, 0];
    const h = Math.atan2(c.vz, c.vx) - 0.6, rr = c.r * (1 + c.asp) * 0.5 * 0.55;
    return [Math.cos(h) * rr, Math.sin(h) * rr];
  }
  // A cell at x, z, each 0 to 1: [lid, rain, storm, heaped, hail, anvil, shelf]; n is the cover map there.
  shape(c, x, z, n, out) {
    const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
    const dx = x - c.x, dz = z - c.z, u = (dx * ca + dz * sa) / (c.r * c.asp), v = (dz * ca - dx * sa) / c.r;
    // the cover map makes the edge ragged, and it moves with the clouds above it
    let d = Math.sqrt(u * u + v * v) + (0.5 - n) * 0.7, dr = d, clear = 1;
    if (c.sup) {
      // a supercell's rain is measured from its own middle ahead of the updraft, and the updraft
      // itself stands over a rain-free base (clear), where the wall cloud hangs
      const [ox, oz] = this.rainOff(c), rr = c.r * (1 + c.asp) * 0.5;
      dr = Math.hypot(dx - ox, dz - oz) / (rr * 0.85) + (0.5 - n) * 0.7;
      clear = ss(0.22, 0.5, Math.hypot(dx, dz) / rr + (0.5 - n) * 0.15);
      d = Math.min(d, dr * 1.1);
    }
    let anvil = 0, shelf = 0;
    if (c.storm) {
      const w = this.wind, wl = Math.hypot(w.x, w.y) || 1, wx = w.x / wl, wz = w.y / wl, rr = c.r * (1 + c.asp) * 0.5;
      // The anvil: the top of the storm spread out by the wind aloft, a long flat sheet reaching
      // far ahead of the storm. It grows as the storm matures and outlives its rain.
      // (it starts over the tower and reaches out one way only, or it comes out a mushroom)
      // (the same cap as cbAt in clouds.js draws: about 1.9 radii long, a little more of it downwind)
      // (a supercell's reaches a little further downwind, see cbAt)
      const al = (dx * wx + dz * wz) / rr - (c.sup ? 0.7 : 0.3), ac = (dz * wx - dx * wz) / rr;
      const da = Math.hypot(al / (c.sup ? 1.7 : 1.15), ac / (c.sup ? 1.2 : 1.5)) + (0.5 - n) * 0.3;
      anvil = ss(c.grow * 0.7, c.grow * 1.6, c.age) * (1 - ss(c.life - c.fade * 0.4, c.life, c.age)) * (1 - ss(0.65, 1.05, da));
      // The shelf cloud: a low wedge riding the gust front, a long arc across the storm's leading
      // side. The value climbs outwards to its leading edge and drops there at once: the cloud
      // reads it as how low its underside reaches, so the wedge is lowest in front.
      const d0 = Math.hypot(dx, dz) / rr + (n - 0.5) * 0.1, ahead = (dx * wx + dz * wz) / (Math.hypot(dx, dz) || 1);
      shelf = ss(c.grow, c.grow * 1.4, c.age) * (1 - ss(c.life - c.fade * 1.5, c.life - c.fade * 0.5, c.age))
        * ss(0.85, 1.42, d0) * (1 - ss(1.44, 1.52, d0)) * ss(-0.45, 0.4, ahead);
    }
    out[5] = anvil; out[6] = shelf;
    if (d > 1.4) { out[0] = out[1] = out[2] = out[3] = out[4] = 0; return anvil > 0 || shelf > 0; }
    const end = 1 - ss(c.life - c.fade, c.life, c.age);
    const env = ss(0, c.grow, c.age) * end, wetEnv = ss(c.grow * 0.5, c.grow * 1.1, c.age) * end;
    out[0] = env * (1 - ss(0.6, 1.25, d));
    out[1] = wetEnv * c.amp * (1 - ss(0.3, 0.95, dr)) * clear;
    out[2] = c.storm ? env * (1 - ss(0.4, 1.05, d)) : 0;
    // showers and storms are heaped cloud; drizzle and fronts are a flat layer
    out[3] = c.kind === 'shower' || c.storm ? env * (1 - ss(0.5, 1.2, d)) : 0;
    // hail: a narrow patch in the core, only while the storm is at its height
    out[4] = c.hail ? c.hail * ss(c.grow, c.grow * 1.6, c.age) * (1 - ss(c.life - c.fade * 2, c.life - c.fade, c.age)) * (1 - ss(0.12, 0.45, dr)) * clear : 0;
    return true;
  }
  at(x, z, res) {
    let lid = 0, dry = 1, storm = 0, conv = 0, hail = 0, anvil = 0, shelf = 0;
    if (this.cells.length) {
      const n = this.cover(x, z), o = this.tmp ||= [0, 0, 0, 0, 0, 0, 0];
      for (const c of this.cells) if (this.shape(c, x, z, n, o)) {
        lid = Math.max(lid, o[0]); dry *= 1 - o[1]; storm = Math.max(storm, o[2]); conv = Math.max(conv, o[3]); hail = Math.max(hail, o[4]);
        anvil = Math.max(anvil, o[5]); shelf = Math.max(shelf, o[6]);
      }
    }
    res.lid = lid; res.rain = 1 - dry; res.storm = storm; res.conv = conv; res.hail = hail; res.anvil = anvil; res.shelf = shelf;
    return res;
  }
  // how big the stones are where you are, 0.45 to 1: the hailing cell's own size
  cellHail() {
    let s = 0.45;
    for (const c of this.cells) {
      const [ox, oz] = this.rainOff(c);
      if (c.hail && Math.hypot(c.x + ox - this.fx, c.z + oz - this.fz) < c.r * 0.6) s = Math.max(s, c.hail);
    }
    return s;
  }
  // P: this weather, now and right overhead
  force(regime, x, z) {
    this.regime = regime;
    // whatever stands near clears off in half a minute
    for (const c of this.cells) {
      if (Math.hypot(c.x - x, c.z - z) > c.r * c.asp + 9000 || c.age > c.life - c.fade) continue;
      c.fade = 30; c.life = c.age + 30;
    }
    const kind = FORCE[regime];
    // a little upwind, so it stays over you a while as it drifts
    if (kind) { const c = this.spawn(kind, x - this.wind.x * 40, z - this.wind.y * 40, 0, 25); c.life = Math.max(c.life, 300); c.age = 0; }
    this.spawnT = 40;
  }
  // O: a grown supercell some 9 km off, coming your way and passing a few km to one side, so you
  // see it whole: the tower, the anvil and the wall cloud under it
  supercell(x, z) {
    const w = this.wind, a = Math.atan2(w.y, w.x) + 0.45, side = Math.random() < 0.5 ? -1 : 1, d = R(8000, 10000), off = R(2500, 4500) * side;
    const fx = Math.cos(a), fz = Math.sin(a);
    const c = this.spawn('storm', x - fx * d - fz * off, z - fz * d + fx * off, 0, undefined, true);
    c.age = c.grow * R(1.2, 1.5);
    return c;
  }
  // a cell's way over the land: plain cells drift with the clouds, a supercell goes its own way
  move(c, dt) {
    const w = this.wind;
    if (!c.sup) { c.vx = w.x; c.vz = w.y; }
    else {
      // the heading wanders between 0.3 and 0.6 rad right of the wind, a new aim every minute or two
      if ((c.veerT -= dt) <= 0) { c.veerT = R(60, 150); c.veerTo = R(0.25, 0.65); }
      c.veer += (c.veerTo - c.veer) * Math.min(1, dt / 40);
      const a = Math.atan2(w.y, w.x) + c.veer, s = Math.max(4, Math.hypot(w.x, w.y) * 0.75);
      c.vx = Math.cos(a) * s; c.vz = Math.sin(a) * s;
      // it turns anticlockwise seen from above; the wall cloud once in about 70 s, faster as it tightens,
      // the tower above it once in some 5 minutes
      // (and with a tornado under it, the wall cloud tightens and turns faster still: tornado.js)
      const m = this.meso(c);
      c.spinW += dt * (0.4 + 0.6 * m + 1.4 * (c.torI || 0)) * 6.283 / 70;
      c.spin += dt * (0.4 + 0.6 * m) * 6.283 / 300;
    }
    c.x += c.vx * dt; c.z += c.vz * dt;
  }
  // a fresh load: the cells of this weather already standing round you at all ages, the ground wet where they've been
  settle(regime, x, z) {
    this.regime = regime; this.cells.length = 0;
    for (const [kind, n] of Object.entries(WANT[regime])) for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = R(0, 14000), K = KINDS[kind];
      const c = this.spawn(kind, x + Math.cos(a) * d, z + Math.sin(a) * d);
      c.age = R(c.grow, c.life * 0.6);
    }
    this.ox = NaN; this.build(x, z, 0, true);
  }
  update(dt, x, z, t) {
    this.t = t; this.fx = x; this.fz = z;
    const w = this.wind;
    // the day's wind near the ground: the clouds' drift, veered and slowed by the land, rising and
    // falling over a few minutes. Fog comes with still air.
    this.calm += (CALM[this.regime] - this.calm) * Math.min(1, dt / 60);
    const a = Math.atan2(w.y, w.x) - 0.3, s = Math.hypot(w.x, w.y) * this.calm * (0.6 + 0.8 * vnoise2(t / 70, 3.7));
    this.base.set(Math.cos(a) * s, Math.sin(a) * s);
    this.off.addScaledVector(this.base, dt);
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const c = this.cells[i];
      c.age += dt;
      this.move(c, dt);
      const cx = c.x, cz = c.z;
      if (c.age > c.life || Math.hypot(cx - x, cz - z) > 34000) { this.cells.splice(i, 1); continue; }
      // lightning, from the core of a grown storm
      if (c.storm && c.age > c.grow * 0.8 && c.age < c.life - c.fade * 0.5 && (c.boltT -= dt) <= 0) {
        c.boltT = R(3.5, 16);
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * c.r * 0.5, [ox, oz] = this.rainOff(c);
        this.onBolt?.(cx + ox + Math.cos(a) * r, cz + oz + Math.sin(a) * r);
      }
    }
    // keep what this weather wants within reach: new cells build some way off, mostly upwind
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = R(15, 35);
      const want = WANT[this.regime];
      for (const kind in want) {
        const have = this.cells.filter(c => c.kind === kind && c.age < c.life - c.fade).length;
        if (have >= want[kind]) continue;
        const a = Math.atan2(-w.y, -w.x) + R(-1.2, 1.2), d = R(3000, 15000);
        this.spawn(kind, x + Math.cos(a) * d, z + Math.sin(a) * d);
        break;
      }
    }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.build(x, z, 0.2 - this.mapT); this.mapT = 0.2; }
    const h = this.at(x, z, this.here);
    h.wet = this.wetAt(x, z); h.ice = this.wetAt(x, z, this.ice);
    h.stormNear = h.superNear = Infinity;
    for (const c of this.cells) if (c.storm && c.age > c.grow * 0.5) {
      const d = Math.hypot(c.x - x, c.z - z) - c.r;
      h.stormNear = Math.min(h.stormNear, d);
      if (this.meso(c) > 0.3) h.superNear = Math.min(h.superNear, d);
    }
    LIT.uWxP.value.w = this.cells.length ? 1 : 0;
    this.windAt(x, z, this.air);
  }
  wetAt(x, z, W = this.wet) {
    const fx = (x - this.ox) / WX_CELL - 0.5, fz = (z - this.oz) / WX_CELL - 0.5, i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    const at = (p, q) => W[Math.min(WX_N - 1, Math.max(0, q)) * WX_N + Math.min(WX_N - 1, Math.max(0, p))];
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  }
  // the field round x, z into the map. The map moves in whole texels; the wetness moves with it.
  build(x, z, dt, fresh) {
    const ox = Math.round(x / WX_CELL) * WX_CELL - WX_SPAN / 2, oz = Math.round(z / WX_CELL) * WX_CELL - WX_SPAN / 2;
    const W = this.wet, I = this.ice;
    if (ox !== this.ox || oz !== this.oz) {
      if (!Number.isNaN(this.ox)) {
        const di = Math.round((ox - this.ox) / WX_CELL), dj = Math.round((oz - this.oz) / WX_CELL), old = W.slice(), oldI = I.slice();
        for (let j = 0; j < WX_N; j++) for (let i = 0; i < WX_N; i++) {
          const si = i + di, sj = j + dj, inside = si >= 0 && sj >= 0 && si < WX_N && sj < WX_N;
          W[j * WX_N + i] = inside ? old[sj * WX_N + si] : 0;
          I[j * WX_N + i] = inside ? oldI[sj * WX_N + si] : 0;
        }
      }
      this.ox = ox; this.oz = oz;
      LIT.uWxP.value.set(ox, oz, 1 / WX_SPAN, LIT.uWxP.value.w);
    }
    const D = this.data, A = this.windData, o = {}, s = {};
    for (let j = 0, p = 0; j < WX_N; j++) for (let i = 0; i < WX_N; i++, p++) {
      // the field fades out at the edge of the map, where the texture clamps
      const edge = Math.min(1, Math.min(i, j, WX_N - 1 - i, WX_N - 1 - j) / 3);
      const px = ox + (i + 0.5) * WX_CELL, pz = oz + (j + 0.5) * WX_CELL;
      this.at(px, pz, o);
      this.steady(px, pz, s);
      // wet in a minute or so of rain, dry in a few without
      let wv = W[p];
      if (fresh) wv = o.rain;
      else wv += o.rain > wv ? (o.rain - wv) * Math.min(1, dt * 0.18) : -dt / 160;
      W[p] = wv = Math.min(1, Math.max(0, wv));
      // hail whitens the ground in half a minute of a heavy fall; it melts over about four minutes, faster in rain
      let iv = I[p] + (o.hail > 0.02 ? o.hail * dt / 30 : 0) - (o.hail > 0.02 ? 0 : dt / 240 + o.rain * dt / 400);
      I[p] = iv = Math.min(1, Math.max(0, iv));
      const Q = this.iceData;
      Q[p * 4] = iv * edge * 255; Q[p * 4 + 1] = o.hail * edge * 255; Q[p * 4 + 2] = o.anvil * edge * 255; Q[p * 4 + 3] = o.shelf * edge * 255;
      // b holds both: up to a half for heaped cloud, above it the storm
      D[p * 4] = o.lid * edge * 255; D[p * 4 + 1] = o.rain * edge * 255; D[p * 4 + 2] = Math.max(o.conv * 0.5, o.storm) * edge * 255; D[p * 4 + 3] = wv * edge * 255;
      // the wind needs no fade: the clamped edge just carries the day's wind on outwards.
      // A gust front lifts dust off dry fields and tracks, not off wet ones.
      A[p * 4] = (0.5 + s.x / (2 * WIND_MAX)) * 255; A[p * 4 + 1] = (0.5 + s.z / (2 * WIND_MAX)) * 255;
      A[p * 4 + 2] = s.turb * 255; A[p * 4 + 3] = ss(8, 16, s.out) * (1 - Math.min(1, wv * 2.5)) * edge * 255;
    }
    this.tex.needsUpdate = true; this.windTex.needsUpdate = true; this.iceTex.needsUpdate = true;
  }
}
