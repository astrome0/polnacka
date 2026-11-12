// Rally stages: a one-way route laid over the real tracks and fields, and five rivals who drive it
// on the same physics as the player. No rails: a bot steers, brakes and gets stuck like anyone else.
import * as THREE from 'three';
import { CARS } from './cars.js';
import { Vehicle } from './physics.js';
import { grid, cellAt, surface, height, waterAt, inVillage, KIND, OBJ } from './world.js';

const { lineU, lineV, pathU, pathV, cellKind, point } = grid;
const STEP = 6, GATE_GAP = 180, GRID_S = 40;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const random = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const $ = id => document.getElementById(id);
export const RACES = {
  forest: { name: 'Lesní rallye', want: 3400, room: 2.2, gateW: 6, lane: 1 },
  field: { name: 'Přes lány', want: 3000, room: 14, gateW: 13, lane: 3.5 },
  ford: { name: 'Brody a potoky', want: 3600, room: 2.4, gateW: 6.5, lane: 1 },
};
const RIVALS = [['Pepa Kolář', 0, 0xd8d6cf], ['Mára Dostál', 0, 0x1f4f9a], ['Zdena Vlčková', 1, 0x2e6b48], ['Honza Beran', 0, 0xe0a020], ['Lojza Šimek', 1, 0x2f3338]];

// ---- routes ---------------------------------------------------------------------------------
function waterCrossings(pts) {
  let n = 0, was = false;
  for (const p of pts) { const w = waterAt(p.x, p.z), is = w.on && w.edge < 0 && w.kind !== 3; if (is && !was) n++; was = is; }
  return n;
}
function section(axis, line, a, b) {
  const from = axis ? lineU(a) : lineV(a), to = axis ? lineU(b) : lineV(b), n = Math.ceil(Math.abs(to - from) / STEP), out = [];
  for (let k = 0; k < n; k++) {
    const along = from + (to - from) * k / n, q = axis ? point(along, lineV(line)) : point(lineU(line), along);
    out.push({ x: q[0], z: q[1] });
  }
  return out;
}
// One try: drive the track network from crossing to crossing, leaning towards what the race wants.
function tryTracks(r, type, c, want, cache) {
  let axis = r() < 0.5 ? 0 : 1, i = c.i + Math.floor(r() * 15 - 7), j = c.j + Math.floor(r() * 15 - 7), dir = r() < 0.5 ? 1 : -1;
  if (axis) while (!pathV(j)) j++; else while (!pathU(i)) i++;
  const info = (ax, ii, jj, d) => {
    const k = ax + ':' + ii + ':' + jj + ':' + d;
    let s = cache.get(k);
    if (s) return s;
    const pts = ax ? section(1, jj, ii, ii + d) : section(0, ii, jj, jj + d);
    const a = ax ? [ii + Math.min(d, 0), jj - 1] : [ii - 1, jj + Math.min(d, 0)], b = ax ? [ii + Math.min(d, 0), jj] : [ii, jj + Math.min(d, 0)];
    s = { pts, forest: ((cellKind(a[0], a[1]) === KIND.FOREST ? 1 : 0) + (cellKind(b[0], b[1]) === KIND.FOREST ? 1 : 0)) / 2, cross: type === 'ford' ? waterCrossings(pts) : 0 };
    cache.set(k, s);
    return s;
  };
  const seen = new Set([i + ',' + j]), route = [];
  let score = 0, len = 0, turns = 0;
  while (len < want) {
    const opts = [];
    const add = (ax, d) => {
      const ni = ax ? i + d : i, nj = ax ? j : j + d;
      if (seen.has(ni + ',' + nj)) return;
      const s = info(ax, i, j, d);
      opts.push({ ax, d, ni, nj, s, w: (type === 'forest' ? 0.12 + s.forest * s.forest * 3 : 0.3 + s.cross * 5) * (ax === axis ? 1 : 0.8) });
    };
    add(axis, dir);
    if (axis ? pathU(i) : pathV(j)) { add(1 - axis, 1); add(1 - axis, -1); }
    if (!opts.length) return null;
    let t = r() * opts.reduce((a, o) => a + o.w, 0), o = opts[0];
    for (const q of opts) { t -= q.w; if (t <= 0) { o = q; break; } }
    if (o.ax !== axis) turns++;
    route.push(...o.s.pts); len += o.s.pts.length * STEP;
    score += type === 'forest' ? o.s.forest * o.s.pts.length * STEP / want : o.s.cross;
    axis = o.ax; dir = o.d; i = o.ni; j = o.nj; seen.add(i + ',' + j);
  }
  return { pts: route, score: score + Math.min(turns, 6) * 0.02 };
}
function smooth(pts, passes) {
  for (let k = 0; k < passes; k++) {
    let ax = pts[0].x, az = pts[0].z;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], nx = (ax + 2 * p.x + q.x) / 4, nz = (az + 2 * p.z + q.z) / 4;
      ax = p.x; az = p.z; p.x = nx; p.z = nz;
    }
  }
  return pts;
}
// Over open land: from field to field through their middles, turning where it's interesting.
function tryFields(r, c, want) {
  const WEIGHT = { [KIND.WHEAT]: 3, [KIND.RAPE]: 3, [KIND.GREEN]: 2, [KIND.MEADOW]: 1.6, [KIND.STUBBLE]: 1.6, [KIND.PLOUGH]: 0.5 };
  let i = c.i + Math.floor(r() * 21 - 10), j = c.j + Math.floor(r() * 21 - 10);
  if (!WEIGHT[cellKind(i, j)]) return null;
  const middle = (a, b) => point((lineU(a) + lineU(a + 1)) / 2 + (r() - 0.5) * grid.CW * 0.34, (lineV(b) + lineV(b + 1)) / 2 + (r() - 0.5) * grid.CH * 0.34);
  const way = [middle(i, j)], seen = new Set([i + ',' + j]);
  let di = 0, dj = 0, len = 0, score = 0;
  while (len < want) {
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => !seen.has(i + a + ',' + (j + b)) && WEIGHT[cellKind(i + a, j + b)])
      .map(([a, b]) => ({ a, b, w: WEIGHT[cellKind(i + a, j + b)] * (a === di && b === dj ? 1.8 : 1) }));
    if (!opts.length) return null;
    let t = r() * opts.reduce((s, o) => s + o.w, 0), o = opts[0];
    for (const q of opts) { t -= q.w; if (t <= 0) { o = q; break; } }
    i += o.a; j += o.b; di = o.a; dj = o.b; seen.add(i + ',' + j); score += o.w;
    const p = middle(i, j), q = way[way.length - 1];
    len += Math.hypot(p[0] - q[0], p[1] - q[1]); way.push(p);
  }
  // Catmull-Rom through the field middles
  const pts = [];
  for (let k = 0; k < way.length - 1; k++) {
    const a = way[Math.max(0, k - 1)], b = way[k], d = way[k + 1], e = way[Math.min(way.length - 1, k + 2)], n = Math.ceil(Math.hypot(d[0] - b[0], d[1] - b[1]) / STEP);
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t, f = (u, v, w, y) => 0.5 * (2 * v + (w - u) * t + (2 * u - 5 * v + 4 * w - y) * t2 + (3 * v - u - 3 * w + y) * t3);
      pts.push({ x: f(a[0], b[0], d[0], e[0]), z: f(a[1], b[1], d[1], e[1]) });
    }
  }
  return { pts, score };
}
// no route may need a boat, or go through somebody's kitchen
function drivable(pts, type) {
  for (const p of pts) {
    const w = waterAt(p.x, p.z);
    if (w.on && w.edge < 0) { const lvl = w.lvl; if (lvl - height(p.x, p.z) > 0.55) return false; }
    if (type === 'field' && inVillage(p.x, p.z)) return false;
  }
  return true;
}
function layOut(type, seed, x, z) {
  const def = RACES[type], r = random(seed + 77), c = cellAt(x, z), cache = new Map();
  let best = null;
  for (let t = 0; t < 70 || (!best && t < 900); t++) {
    const o = type === 'field' ? tryFields(r, c, def.want * (t > 300 ? 0.75 : 1)) : tryTracks(r, type, c, def.want, cache);
    if (!o) continue;
    const pts = smooth(o.pts.map(p => ({ ...p })), type === 'field' ? 1 : 4);
    if ((!best || o.score > best.score) && drivable(pts, type)) best = { pts, score: o.score };
  }
  return best && finishTrack(best.pts, type);
}
function finishTrack(pts, type) {
  const def = RACES[type], n = pts.length, s = new Float32Array(n), kappa = new Float32Array(n), crest = new Float32Array(n), mu = new Float32Array(n), road = new Uint8Array(n), wet = new Uint8Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  // how sharply the ground falls away: over a crest like this a fast car leaves the road
  const hs = pts.map(p => height(p.x, p.z));
  for (let i = 2; i < n - 2; i++) crest[i] = Math.max(0, (2 * hs[i] - hs[i - 2] - hs[i + 2]) / 144, (2 * hs[i] - hs[i - 1] - hs[i + 1]) / 36);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 3)], b = pts[i], c = pts[Math.min(n - 1, i + 3)];
    const ax = b.x - a.x, az = b.z - a.z, cx = c.x - b.x, cz = c.z - b.z, l = Math.hypot(ax + cx, az + cz) || 1;
    b.tx = (ax + cx) / l; b.tz = (az + cz) / l;
    const la = Math.hypot(ax, az) || 1, lc = Math.hypot(cx, cz) || 1;
    kappa[i] = Math.abs(ax * cz - az * cx) / (la * lc) * 2 / (la + lc);
    const sf = surface(b.x, b.z);
    mu[i] = sf.mu; road[i] = sf.kind === KIND.ROAD ? 2 : sf.kind === KIND.PATH ? 1 : 0;
    const w = waterAt(b.x, b.z);
    if (w.on && w.edge < 1.5) { const lvl = w.lvl; if (lvl > height(b.x, b.z) - 0.1) wet[i] = 1; }
  }
  // a gate stands square across a straight bit, its direction taken over several points so one kink can't twist it
  const mk = i => {
    const a = pts[Math.max(0, i - 5)], b = pts[Math.min(n - 1, i + 5)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { i, s: s[i], x: pts[i].x, z: pts[i].z, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l, w: def.gateW };
  };
  const gates = [];
  let next = 90;
  for (let i = 1; i < n - 16; i++) if (s[i] >= next && s[n - 1] - s[i] > 70 || (wet[i - 1] && !wet[i] && s[i] > next - GATE_GAP + 50)) {
    let j = i;
    for (let k = i; k < i + 9; k++) if (kappa[k] < kappa[j]) j = k;
    gates.push(mk(j)); next = s[j] + GATE_GAP; i = j;
  }
  gates.push(mk(n - 1));
  return { type, pts, s, kappa, crest, mu, road, wet, gates, len: s[n - 1], room: def.room, lane: def.lane, name: def.name };
}

// ---- rivals ---------------------------------------------------------------------------------
class Bot {
  constructor(race, spec, def, color, name, pace, slot) {
    this.race = race; this.spec = spec; this.name = name; this.pace = pace; this.kind = 'bot';
    const { g } = race.traffic.model(def, color);
    race.scene.add(g);
    this.g = g;
    const v = this.veh = new Vehicle(spec);
    this.pos = v.pos; this.vel = v.v; this.hw = spec.stations[4].w; this.hl = v.half.z; this.mass = v.mass; this.heading = 0;
    const t = race.track;
    v.bales = race.bales;
    v.onSolid = (s, vel, n) => race.onBreak?.(s, n);
    v.onMover = (m, sp, n, wp) => { if (m.kind === 'car' || m.kind === 'tractor') race.traffic.hit(m, sp, n, wp); };
    this.i = 0; this.think = 1 + slot % 4; this.lane = (slot % 2 ? 1 : -1) * t.lane * (0.3 + race.rand() * 0.7); this.avoid = 0;
    this.limit = planSpeeds(t, spec, 0.4 + pace * 0.12);
    this.mark = 0; this.markT = 0; this.stuck = 0; this.rev = 0; this.flipT = 0; this.offT = 0; this.time = 0; this.scanT = slot * 0.05; this.stampT = 0;
  }
  place(x, z, h) {
    const v = this.veh, y = height(x, z) + this.spec.phys.comY + 0.1;
    v.place(x, y, z, h);
    this.heading = h;
  }
  respawn() {
    // brought back to the same spot again? Then what blocks it won't move: put it beyond that
    this.again = Math.abs(this.i - (this.lastReset ?? -99)) < 5 ? (this.again || 0) + 1 : 0;
    const t = this.race.track, i = clamp(this.i - 1 + this.again * 6, 1, t.pts.length - 2), p = t.pts[i], v = this.veh, h = Math.atan2(p.tx, p.tz);
    this.lastReset = i;
    this.place(p.x, p.z, h);
    v.dead = false; v.engineHP = 100; v.flood = 0; v.wet = 0; v.wantsReverse = false; v.gear = 1;
    for (const w of v.wheels) { w.wl = -1e9; w.wd = 0; }
    this.i = i; this.stuck = 0; this.rev = 0; this.flipT = 0; this.offT = 0; this.avoid = 0;
  }
  // called at 30 Hz
  drive(dt, player) {
    const v = this.veh, T = this.race.track, pts = T.pts, n = pts.length, inp = v.input, x = v.pos.x, z = v.pos.z;
    if (this.time) { inp.throttle = 0; inp.brake = 0.6; inp.hand = 0; inp.steer = 0; return; }
    let best = this.i, bd = 1e9;
    for (let k = this.i, e = Math.min(n, this.i + 16); k < e; k++) { const dx = pts[k].x - x, dz = pts[k].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = k; } }
    this.i = best;
    const off = Math.sqrt(bd), here = pts[best], q = v.q;
    if (T.s[best] > T.len - 5) { this.time = this.race.t; return; }
    const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y), rx = 1 - 2 * (q.y * q.y + q.z * q.z), rz = 2 * (q.x * q.z - q.w * q.y), upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const spd = v.v.dot(new THREE.Vector3(fx, 2 * (q.y * q.z - q.w * q.x), fz)), abs = Math.abs(spd);
    this.heading = Math.atan2(fx, fz);
    // the way ahead, and whatever stands on it
    const nx = here.tz, nz = -here.tx, side = (x - here.x) * nx + (z - here.z) * nz;
    let dodge = null, cap = 1e9;
    const look = (ox, oz, r, sp) => {
      const dx = ox - x, dz = oz - z, f = dx * here.tx + dz * here.tz;
      if (f < 2 || f > 24) return;
      const o = side + dx * nx + dz * nz, mine = this.lane + this.avoid, gap = r + 1.5;
      if (Math.abs(o - mine) < gap && (dodge === null || f < dodge.f)) dodge = { f, to: o >= mine ? o - gap - 0.2 : o + gap + 0.2 };
      if (sp != null && f < 10 && Math.abs(o - mine) < 1.5) cap = Math.min(cap, sp + 1);
    };
    for (const s of v.solids) if (!s.dead && s.r > 0.12 && s.o?.type !== OBJ.RAIL) look(s.x, s.z, s.r, null);
    for (const m of v.movers) { const sp = Math.hypot(m.vel.x, m.vel.z); if (sp < abs) look(m.pos.x, m.pos.z, 1.1, sp); }
    const goal = dodge ? clamp(dodge.to, -T.room, T.room) - this.lane : this.avoid * 0.97;
    this.avoid += (goal - this.avoid) * Math.min(1, dt * (dodge ? 5 : 1.2));
    // pure pursuit on a point further ahead the faster we go
    // (off the road, aim further along so it joins at a shallow angle instead of crossing it)
    const L = 6 + abs * 0.55 + off * 0.9, j = Math.min(n - 1, best + Math.round(L / STEP)), tg = pts[j], lat = (this.lane + this.avoid) * (T.wet[j] || T.wet[best] ? 0.15 : 1);
    const dx = tg.x + tg.tz * lat - x, dz = tg.z - tg.tx * lat - z, lx = dx * rx + dz * rz, lz = dx * fx + dz * fz, alpha = Math.atan2(lx, lz), ld = Math.hypot(dx, dz);
    const wb = this.spec.axle.f - this.spec.axle.r, delta = Math.atan2(2 * wb * Math.sin(alpha), Math.max(3, ld)), range = THREE.MathUtils.lerp(0.56, 0.085, Math.sqrt(clamp(abs / 45, 0, 1)));
    inp.steer = clamp(delta * 1.5 / range, -1, 1); inp.hand = 0; inp.nitro = 0;
    // Feel for the car: what a driver catches with hands and seat, and a 30 Hz controller can't.
    // It bends the car's path gently towards the line and calms it down over the bumps.
    if (this.rev <= 0 && abs > 3) {
      const k = Math.min(1, dt * (v.onGround ? 2.4 : 0.7)), sp = Math.hypot(v.v.x, v.v.z), lim = Math.max(3, ld);
      v.v.x += (dx / lim * sp - v.v.x) * k; v.v.z += (dz / lim * sp - v.v.z) * k;
      v.w.y += (clamp(alpha, -0.8, 0.8) * 2.2 - v.w.y) * Math.min(1, dt * 2.5);
    }
    const calm = 1 - Math.min(1, dt * 3);
    v.w.x *= calm; v.w.z *= calm;
    // a racer eases off when far ahead and digs in when far behind, as people do
    const gap = (T.s[best] - this.race.playerS) / 500;
    let want = this.limit[best] * this.pace * (1 - clamp(gap, -0.07, 0.06));
    if (Math.abs(alpha) > 0.7) want = Math.min(want, 9);
    if (off > 5) want = Math.min(want, 13);       // lost the road: find it again before anything else
    want = Math.min(want, cap);
    if (this.race.state === 'done' && player) want = Math.min(want, 22);
    const err = want - abs;
    inp.throttle = err > 0 ? clamp(err / 3 + 0.35, 0, 1) : 0; inp.brake = err < 0 ? clamp(-err / 6, 0, 1) : 0;
    v.wantsReverse = false;
    // trouble: first try to back out, then the marshals put the car back on the road
    this.markT += dt;
    if (this.markT > 1.5) {
      this.stuck = T.s[best] - this.mark < 3 ? this.stuck + 1 : 0;
      this.mark = T.s[best]; this.markT = 0;
      if (this.stuck === 1) this.rev = 1.5;
      if (this.stuck >= 3) { this.respawn(); return; }
    }
    this.flipT = upY < 0.35 ? this.flipT + dt : 0;
    this.offT = off > 28 ? this.offT + dt : 0;
    this.swimT = v.wet > 0.3 && !v.onGround ? (this.swimT || 0) + dt : 0;
    if (this.flipT > 1.6 || this.offT > 3 || this.swimT > 3 || v.dead) { this.swimT = 0; this.respawn(); return; }
    if (this.rev > 0) { this.rev -= dt; v.wantsReverse = true; inp.throttle = 0.8; inp.brake = 0; inp.steer = -inp.steer; }
  }
  step(dt, player) {
    if (--this.think <= 0) { this.think = 4; this.drive(dt * 4, player); }
    this.veh.step(dt);
  }
  sync(dt, r) {
    const v = this.veh, s = this.spec;
    if (!Number.isFinite(v.pos.x + v.q.x + v.v.x)) { v.q.identity(); v.w.set(0, 0, 0); this.respawn(); }
    this.g.quaternion.copy(v.q);
    this.g.position.set(0, -s.phys.comY, 0).applyQuaternion(v.q).add(v.pos);
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.25; v.solids = r.terrain.nearby(v.pos.x, v.pos.z, 28, v.solids); }
    const d = r.playerPos ? v.pos.distanceTo(r.playerPos) : 0, speed = v.v.length();
    if (d > 240) return;
    // what the tyres throw up, close enough to see
    this.stampT -= dt;
    const stamp = this.stampT <= 0;
    if (stamp) this.stampT = 0.09;
    for (const w of v.wheels) {
      if (!w.contact) continue;
      if (w.wd > 0.02) { if (speed > 2) for (let k = 0; k < 2; k++) r.fx.splash(w.gx, w.wl + 0.02, w.gz, v.v.x, v.v.z, Math.min(1.3, speed / 12)); continue; }
      if (w.surf.kind === KIND.PATH && d < 160) r.fx.track(w, w.gx, w.gy, w.gz, s.wheel.w / 2, w.surf.panel ? 0.26 : 0.36); else w.print = null;
      if (w.surf.kind !== KIND.ROAD && speed > 3 && Math.random() < dt * 22 * Math.min(1, speed / 16)) r.fx.dust(w.gx, w.gy + 0.08, w.gz, v.v.x, 0, v.v.z, w.surf.kind === KIND.PATH ? [0.62, 0.56, 0.45] : [0.42, 0.36, 0.22], 1.2);
      if (stamp && speed > 1 && w.surf.kind !== KIND.ROAD && d < 120) r.terrain.stamp(w.gx, w.gz, 0.55, 255);
    }
  }
}
// How fast each point of the route can be taken: limited by the corner, then by having to brake for it.
function planSpeeds(T, spec, grip) {
  const p = spec.phys, n = T.pts.length, v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const off = T.road[i] ? 1 : p.offroad, mu = T.mu[i] * p.mu * off;
    // above these a car skips over the bumps with half its wheels in the air, and can't turn
    const top = Math.min(p.top, T.road[i] === 2 ? 40 : T.road[i] === 1 ? 28 : 21 * off);
    v[i] = T.wet[i] ? 8.5 : Math.min(top, Math.sqrt(mu * 9.81 * grip / Math.max(1e-4, T.kappa[i])), Math.sqrt(9.81 * 0.9 / Math.max(1e-4, T.crest[i])));
  }
  for (let i = n - 2; i >= 0; i--) {
    const brake = T.mu[i] * p.mu * 9.81 * 0.55, ds = T.s[i + 1] - T.s[i];
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * brake * ds));
  }
  return v;
}

// ---- the event ------------------------------------------------------------------------------
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

export class Race {
  constructor(scene, terrain, traffic, fx, audio, bales) {
    Object.assign(this, { scene, terrain, traffic, fx, audio, bales });
    this.active = false; this.state = 'off'; this.bots = []; this.parts = []; this.hudT = 0;
    this.me = { kind: 'player', pos: null, vel: null, heading: 0, hw: 1, hl: 2.2, mass: 1200, g: { visible: true } };
    this.allMovers = [];
    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const banner = (text, a, b) => tex(512, 64, x => {
      x.fillStyle = a; x.fillRect(0, 0, 512, 64); x.fillStyle = b; x.font = '700 42px "Barlow Condensed",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const px of [128, 384]) x.fillText(text, px, 34);
    });
    this.poleM = new THREE.MeshStandardMaterial({ map: tex(16, 128, x => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f2efe6' : '#c8281e'; x.fillRect(0, i * 16, 16, 16); } }), roughness: 0.6 });
    this.bannerM = new THREE.MeshStandardMaterial({ map: banner('POLŇAČKA', '#c8281e', '#fff7e8'), roughness: 0.7, side: THREE.DoubleSide });
    this.finishM = new THREE.MeshStandardMaterial({ map: tex(512, 64, x => { for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#101114' : '#f2efe6'; x.fillRect(i * 16, j * 16, 16, 16); } }), roughness: 0.7, side: THREE.DoubleSide });
    this.startM = new THREE.MeshStandardMaterial({ map: banner('START', '#1f4f9a', '#fff7e8'), roughness: 0.7, side: THREE.DoubleSide });
    this.poleG = new THREE.CylinderGeometry(0.07, 0.09, 1, 8).translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 70, 12, 1, true).translate(0, 35, 0), new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.renderOrder = 3; this.beam.visible = false; scene.add(this.beam);
  }
  // Lay out a stage and line everybody up. Returns where the player's car goes.
  prepare(type, seed, x, z) {
    this.stop();
    const T = layOut(type, seed, x, z);
    if (!T) return null;
    this.track = T; this.type = type; this.seed = seed; this.from = [x, z]; this.rand = random(seed + 5); this.t = 0; this.penalty = 0; this.next = 0; this.miss = 0;
    this.state = 'load'; this.active = true; this.hold = true; this.count = 3.6; this.lastCount = 9; this.playerS = 0; this.pi = 0; this.endT = 0; this.shown = false;
    const pts = T.pts, slot = k => {
      const s = GRID_S - Math.floor(k / 2) * 9, i = Math.round(s / STEP), p = pts[i], sd = (k % 2 ? 1 : -1) * Math.min(1.7, T.room);
      return { x: p.x + p.tz * sd, z: p.z - p.tx * sd, h: Math.atan2(p.tx, p.tz) };
    };
    const order = RIVALS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = this.rand() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((idx, k) => {
      const [name, car, color] = RIVALS[idx], spec = CARS[car];
      const def = (this.defs ||= {})[spec.id] ||= this.traffic.lofted(spec);
      const b = new Bot(this, spec, def, color, name, 0.84 + idx * 0.035 + this.rand() * 0.02, k), s = slot(k);
      b.place(s.x, s.z, s.h);
      this.bots.push(b);
    });
    this.buildMarkers();
    this.traffic.others = this.bots;
    $('race').classList.add('on'); $('rEnd').classList.remove('on');
    $('rBig').textContent = 'Stavíme trať…'; $('rBig').classList.add('on'); $('rName').textContent = T.name + ' · ' + (T.len / 1000).toFixed(1) + ' km';
    this.refreshMovers();
    return slot(5);
  }
  // the player's car changes when it is repaired
  attach(veh) {
    Object.assign(this.me, { pos: veh.pos, vel: veh.v, hw: veh.spec.stations[4].w, hl: veh.half.z, mass: veh.mass });
    this.veh = veh;
    this.refreshMovers();
    return this.allMovers;
  }
  refreshMovers() {
    this.allMovers.length = 0;
    this.allMovers.push(...this.traffic.movers, ...this.bots);
    for (const b of this.bots) b.veh.movers = [...this.traffic.movers, ...this.bots.filter(o => o !== b), ...(this.me.pos ? [this.me] : [])];
  }
  buildMarkers() {
    const T = this.track, add = (x, z, tx, tz, w, mat) => {
      const g = new THREE.Group(), nx = tz, nz = -tx, yA = height(x + nx * w, z + nz * w), yB = height(x - nx * w, z - nz * w), top = Math.max(yA, yB) + 4.2;
      // the banner hangs level, so on a side slope the lower pole is the longer one
      for (const [sx, y] of [[1, yA], [-1, yB]]) { const p = new THREE.Mesh(this.poleG, this.poleM); p.position.set(x + nx * w * sx, y - 0.3, z + nz * w * sx); p.scale.y = top - y + 0.3; p.castShadow = true; g.add(p); }
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.62, 0.05), mat);
      b.position.set(x, top - 0.31, z); b.rotation.y = Math.atan2(nx, nz) - Math.PI / 2; b.castShadow = true; g.add(b);
      this.scene.add(g); this.parts.push(g);
    };
    const p0 = T.pts[Math.round((GRID_S + 9) / STEP)];
    add(p0.x, p0.z, p0.tx, p0.tz, Math.max(T.gates[0].w, 6), this.startM);
    T.gates.forEach((g, i) => add(g.x, g.z, g.tx, g.tz, g.w, i === T.gates.length - 1 ? this.finishM : this.bannerM));
  }
  stop() {
    for (const b of this.bots) this.scene.remove(b.g);
    for (const g of this.parts) { this.scene.remove(g); g.traverse(o => { if (o.geometry && o.geometry !== this.poleG) o.geometry.dispose(); }); }
    this.bots = []; this.parts = []; this.active = false; this.state = 'off'; this.hold = false; this.traffic.others = null; this.beam.visible = false;
    $('race').classList.remove('on'); $('rEnd').classList.remove('on'); $('rBig').classList.remove('on');
  }
  // one physics step for the rivals
  step(dt) {
    if (this.state === 'load') return;
    const held = this.state === 'count';
    for (const b of this.bots) {
      if (held) { const i = b.veh.input; i.throttle = 0; i.brake = 1; i.hand = 1; b.veh.step(dt); } else b.step(dt, this.veh);
    }
  }
  // back on the stage after a crash
  rescue() {
    const p = this.track.pts[Math.max(1, this.pi - 1)];
    this.penalty += 5;
    return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz) };
  }
  passGates(v) {
    const T = this.track, g = T.gates[this.next];
    if (!g) return;
    const dx = v.pos.x - g.x, dz = v.pos.z - g.z, f = dx * g.tx + dz * g.tz, l = Math.abs(dx * g.tz - dz * g.tx), last = this.next === T.gates.length - 1;
    if (Math.abs(f) < 5 && l < g.w + 2.5) {
      this.next++;
      if (last) this.finish(); else this.audio.tone?.(880, 0.09);
    } else if (!last && this.playerS > g.s + 45) {
      this.next++; this.penalty += 5; this.note = 3; $('rNote').textContent = 'Vynechaná brána +5 s'; this.audio.tone?.(220, 0.25);
    }
  }
  finish() {
    this.state = 'done'; this.playerTime = this.t + this.penalty; this.endT = this.t;
    this.audio.tone?.(1320, 0.5); this.beam.visible = false;
    const place = this.bots.filter(b => b.time && b.time < this.playerTime).length + 1;
    $('rBig').textContent = place + '. místo'; $('rBig').classList.add('on');
  }
  results() {
    this.shown = true;
    const T = this.track, avg = T.len / Math.max(1, this.playerTime);
    const rows = [{ name: 'Ty', time: this.playerTime, me: true }, ...this.bots.map(b => ({ name: b.name, time: b.time || this.t + (T.len - T.s[b.i]) / Math.max(8, avg * 0.9), guess: !b.time }))].sort((a, b) => a.time - b.time);
    const first = rows[0].time;
    $('rTable').innerHTML = rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}.</td><td>${r.name}</td><td>${r.guess ? '~' : ''}${fmt(r.time)}</td><td>${i ? '+' + (r.time - first).toFixed(1) : ''}</td></tr>`).join('');
    $('rSub').textContent = T.name + (this.penalty ? ` · penalizace ${this.penalty} s` : '');
    $('rBig').classList.remove('on'); $('rEnd').classList.add('on');
    this.onResults?.();
  }
  update(dt, veh, camera) {
    if (!this.active) return;
    this.playerPos = veh.pos; this.me.heading = 2 * Math.atan2(veh.q.y, veh.q.w);
    const T = this.track;
    for (const b of this.bots) b.sync(dt, this);
    if (this.state === 'load') {
      if (this.terrain.ready(veh.pos.x, veh.pos.z)) { this.state = 'count'; for (const b of this.bots) b.veh.solids = this.terrain.nearby(b.veh.pos.x, b.veh.pos.z, 28, b.veh.solids); }
      return;
    }
    if (this.state === 'count') {
      this.count -= dt;
      const c = Math.ceil(this.count);
      if (c !== this.lastCount && c <= 3) { this.lastCount = c; if (c > 0) { $('rBig').textContent = c; this.audio.tone?.(660, 0.14); } }
      if (this.count <= 0) { this.state = 'run'; this.hold = false; $('rBig').textContent = 'JEĎ!'; this.audio.tone?.(1320, 0.3); this.goT = 0.9; }
      return;
    }
    this.t += dt;
    if (this.goT > 0) { this.goT -= dt; if (this.goT <= 0) $('rBig').classList.remove('on'); }
    // where the player is along the route; a short cut only moves this as far as the next stretch
    const pts = T.pts;
    let best = this.pi, bd = 1e9;
    for (let k = Math.max(0, this.pi - 10), e = Math.min(pts.length, this.pi + 30); k < e; k++) { const dx = pts[k].x - veh.pos.x, dz = pts[k].z - veh.pos.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = k; } }
    this.pi = best; this.playerS = T.s[best];
    if (this.state === 'run') this.passGates(veh);
    if (this.note > 0) { this.note -= dt; if (this.note <= 0) $('rNote').textContent = ''; }
    if (this.state === 'done' && !this.shown && (this.t - this.endT > 3.5) && (this.bots.every(b => b.time) || this.t - this.endT > 14)) this.results();
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const g = T.gates[this.next];
    if (g) {
      this.beam.visible = true; this.beam.position.set(g.x, height(g.x, g.z), g.z);
      camera.getWorldDirection(tv);
      const a = Math.atan2(g.x - camera.position.x, g.z - camera.position.z) - Math.atan2(tv.x, tv.z);
      $('rArrow').style.transform = `rotate(${(-a * 180 / Math.PI).toFixed(1)}deg)`;
      $('rDist').textContent = Math.round(Math.hypot(g.x - veh.pos.x, g.z - veh.pos.z)) + ' m';
    }
    $('rTime').textContent = fmt(this.state === 'done' ? this.playerTime : this.t + this.penalty);
    $('rGate').textContent = `Brána ${Math.min(this.next + 1, T.gates.length)}/${T.gates.length}`;
    const order = [{ name: 'Ty', s: this.state === 'done' ? T.len : this.playerS, me: true }, ...this.bots.map(b => ({ name: b.name, s: T.s[b.i] }))].sort((a, b) => b.s - a.s);
    $('rPos').textContent = (order.findIndex(o => o.me) + 1) + '/' + order.length;
    $('rList').innerHTML = order.map(o => `<li class="${o.me ? 'me' : ''}">${o.name}</li>`).join('');
  }
}
const tv = new THREE.Vector3();
