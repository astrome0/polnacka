// The whole landscape as pure functions of (x, z). No three.js here: this file runs in the
// main thread (physics) and in the workers (chunk baking), and both must agree exactly.

export const CHUNK = 128;
export const KIND = { WHEAT: 0, RAPE: 1, GREEN: 2, MEADOW: 3, PLOUGH: 4, STUBBLE: 5, FOREST: 6, PATH: 7, VERGE: 8, ROAD: 9, BANK: 10, BED: 11, FORD: 12, PANEL: 13 };
export const OBJ = { BEECH: 0, SPRUCE: 1, BIRCH: 2, OAK: 3, BUSH: 4, ROCK: 5, BALE: 6, BARN: 7, STAND: 8, POLE: 9, POST: 10, HOUSE: 11, CHURCH: 12, RAIL: 13, LOG: 14 };

// ---- noise ------------------------------------------------------------------------------
const P = new Uint8Array(512);
{
  let s = 90210;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const a = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 512; i++) P[i] = a[i & 255];
}
const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const X = xi & 255, Y = yi & 255;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = P[P[X] + Y] & 7, b = P[P[X + 1] + Y] & 7, c = P[P[X] + Y + 1] & 7, d = P[P[X + 1] + Y + 1] & 7;
  const n00 = GX[a] * fx + GY[a] * fy, n10 = GX[b] * (fx - 1) + GY[b] * fy;
  const n01 = GX[c] * fx + GY[c] * (fy - 1), n11 = GX[d] * (fx - 1) + GY[d] * (fy - 1);
  const x1 = n00 + u * (n10 - n00), x2 = n01 + u * (n11 - n01);
  return (x1 + v * (x2 - x1)) * 1.1;
}
export function fbm(x, y, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function hash2(i, j) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const hash1 = i => hash2(i, 91);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---- field layout: a warped, rotated grid. Grid lines are field borders, some carry paths ---
const ANG = 0.31, CA = Math.cos(ANG), SA = Math.sin(ANG);
const CW = 235, CH = 178;
const lineU = i => i * CW + (hash1(i * 7 + 3) - 0.5) * 80;
const lineV = j => j * CH + (hash1(j * 5 + 41) - 0.5) * 60;
// asphalt roads: a sparse net along every third and fourth grid line, without the fine wiggle
// the farm tracks have, so they stay drivable at speed
const MAIN_U = 3, MAIN_V = 4;
const mod = (a, n) => ((a % n) + n) % n;
const mainU = k => lineU(k * MAIN_U + 1), mainV = k => lineV(k * MAIN_V + 2);
const pathU = i => mod(i, MAIN_U) !== 1 && hash1(i * 13 + 1) < 0.5;
const pathV = j => mod(j, MAIN_V) !== 2 && hash1(j * 17 + 5) < 0.42;
const lineStyle = n => { const h = hash1(n * 29 + 2); return h < 0.45 ? 0 : h < 0.85 ? 1 : 2; }; // 0 gravel, 1 dirt, 2 concrete panels

const L = { u: 0, v: 0, i: 0, j: 0, du: 0, dv: 0, li: 0, lj: 0, pathD: 0, along: 0, style: 0, onU: false, mainD: 0, mainS: 0, mainAlong: 0, mainCross: 0, ku: 0, kv: 0, su: 0, sv: 0 };
function locate(x, z) {
  let u = CA * x + SA * z, v = -SA * x + CA * z;
  const a = x * 0.0042, b = z * 0.0042, c = x * 0.019, d = z * 0.019;
  u += noise(a + 11.3, b - 5.1) * 52;
  v += noise(a - 40.7, b + 70.2) * 52;
  const uc = CA * x + SA * z + noise(x * 0.0019 + 3.7, z * 0.0019 - 1.3) * 66;
  const vc = -SA * x + CA * z + noise(x * 0.0019 - 8.2, z * 0.0019 + 6.1) * 66;
  u += noise(c, d + 9.7) * 7;
  v += noise(c + 31.1, d) * 7;
  let i = Math.floor(u / CW), j = Math.floor(v / CH);
  while (u < lineU(i)) i--; while (u >= lineU(i + 1)) i++;
  while (v < lineV(j)) j--; while (v >= lineV(j + 1)) j++;
  const a0 = u - lineU(i), a1 = lineU(i + 1) - u, b0 = v - lineV(j), b1 = lineV(j + 1) - v;
  L.u = u; L.v = v; L.i = i; L.j = j;
  L.du = Math.min(a0, a1); L.li = a0 < a1 ? i : i + 1;
  L.dv = Math.min(b0, b1); L.lj = b0 < b1 ? j : j + 1;
  const pu = pathU(L.li) ? L.du : 1e4, pv = pathV(L.lj) ? L.dv : 1e4;
  L.onU = pu < pv;
  L.pathD = L.farmD = Math.min(pu, pv);
  L.along = L.onU ? v : u;
  L.style = lineStyle(L.onU ? L.li : L.lj + 500);
  // nearest asphalt on each axis, measured on the smooth coordinates
  let su = 1e9, sv = 1e9;
  const ku = Math.round((uc / CW - 1) / MAIN_U), kv = Math.round((vc / CH - 2) / MAIN_V);
  for (let k = ku - 1; k <= ku + 1; k++) { const q = uc - mainU(k); if (Math.abs(q) < Math.abs(su)) { su = q; L.ku = k; } }
  for (let k = kv - 1; k <= kv + 1; k++) { const q = vc - mainV(k); if (Math.abs(q) < Math.abs(sv)) { sv = q; L.kv = k; } }
  L.su = su; L.sv = sv;
  const au = Math.abs(su), av = Math.abs(sv), byU = au < av;
  L.mainD = byU ? au : av; L.mainS = byU ? su : sv; L.mainAlong = byU ? vc : uc; L.mainCross = byU ? av : au;
  if (L.mainD <= L.pathD) { L.pathD = L.mainD; L.onU = byU; L.along = L.mainAlong; L.style = 3; }
  return L;
}

// Some crossroads grow a village: flat lawns along all four arms of the junction.
function villageAmt() {
  if (hash2(L.ku * 3 + 1, L.kv * 5 + 2) > 0.42) return 0;
  return (1 - sstep(34, 54, L.mainD)) * (1 - sstep(125, 170, Math.max(Math.abs(L.su), Math.abs(L.sv))));
}
export function inVillage(x, z) { locate(x, z); return villageAmt() > 0.5; }

function isForestCell(i, j) {
  const cu = (i + 0.5) * CW, cv = (j + 0.5) * CH;
  return fbm(cu * 0.00125 + 3.1, cv * 0.00125 - 7.7, 3) + (hash2(i, j) - 0.5) * 0.3 > 0.07;
}
function cellKind(i, j) {
  if (isForestCell(i, j)) return KIND.FOREST;
  const h = hash2(i * 3 + 7, j * 5 - 3);
  if (h < 0.3) return KIND.GREEN;
  if (h < 0.53) return KIND.WHEAT;
  if (h < 0.65) return KIND.RAPE;
  if (h < 0.84) return KIND.MEADOW;
  if (h < 0.92) return KIND.STUBBLE;
  return KIND.PLOUGH;
}

// ---- height ------------------------------------------------------------------------------
function bigLow(x, z) {
  const n = fbm(x * 0.00095 + 5, z * 0.00095 + 2, 3);
  return n > 0 ? n * n * 90 + n * 18 : n * 26;
}
function hLow(x, z) { return bigLow(x, z) + fbm(x * 0.0041, z * 0.0041, 2) * 9; }
// natural kickers: sharp grassy crests, never placed by hand
function hBump(x, z) {
  const r = 1 - Math.abs(noise(x * 0.0115 + 8.1, z * 0.0115 - 3.3) * 1.5);
  const crest = r > 0 ? r * r * r * r : 0;
  return crest * 3.4 * sstep(-0.3, 0.35, noise(x * 0.0037, z * 0.0037 + 40)) + noise(x * 0.047, z * 0.047) * 0.75 + noise(x * 0.17, z * 0.17) * 0.13;
}

// ---- water -------------------------------------------------------------------------------
// Rivers run along their own rotated axis p. Creeks cross them on the q axis and flow into the
// nearest one. Short streams follow the asphalt and the farm tracks inside the ditch.
// Each stream fills one record per point: distance d from its centre line, half width w, level.
const RA = 1.08, RC = Math.cos(RA), RS = Math.sin(RA);
const R_GAP = 1640, R_OFF = 0, R_SWING = 290, R_VALLEY = 250;
const C_GAP = 470, C_STEP = 12, C_REACH = 78;
const D_LEN = 520, D_STEP = 20, D_ON = 0.42;
const REACH = 10;     // how far past the bank a point still counts as "by this stream"
const stream = kind => ({ on: false, kind, d: 0, w: 0, lvl: 0, depth: 0, fx: 0, fz: 0, sp: 0, foam: 0, fade: 1, main: false });
const R = stream(1), RB = stream(1), C = stream(2), D = stream(3);
const TAB = new Map();

const riverC = (m, p) => m * R_GAP + R_OFF + noise(p * 0.00085 + m * 3.7, m * 9.13 + 0.4) * 230 + noise(p * 0.0036 - m * 2.3, m * 4.41 + 20.5) * 46 + noise(p * 0.012, m * 1.37 + 0.5) * 9;
const creekP = (k, q) => k * C_GAP + noise(q * 0.0032 + k * 1.7, k * 2.93 + 0.5) * 70 + noise(q * 0.013, k * 0.77 + 3.1) * 18 + noise(q * 0.041 + k, 7.7) * 4.5;
// A river's level drifts over kilometres and follows only the broadest lows of the land, slowly
// enough that twenty metres of water still read as level.
function riverLevel(m, p, c) {
  const x = RC * p - RS * c, z = RS * p + RC * c, n = noise(x * 0.00095 + 5, z * 0.00095 + 2);
  const b = -3 + Math.min(0, n * 26 + 3) * 0.35, f = -1 + noise(p * 0.00031 + m * 5.5, m * 2.13 + 0.4) * 3;
  const k = 4, t = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - f) / k));
  return mix(b, f, t) - k * t * (1 - t);
}
function scanRiver(s, p, q, x, z) {
  s.on = false;
  const m = Math.round((q - R_OFF) / R_GAP);
  if (Math.abs(q - R_OFF - m * R_GAP) > R_SWING + R_VALLEY * 1.5) return;
  const c = riverC(m, p), dq = q - c;
  if (Math.abs(dq) > R_VALLEY * 1.5) return;
  const sl = (riverC(m, p + 5) - riverC(m, p - 5)) / 10, l = Math.sqrt(1 + sl * sl);
  if (Math.abs(dq) / l > R_VALLEY + 10) return;
  const big = hash1(m * 19 + 4) < 0.45;
  s.on = true;
  s.w = (big ? 13 : 8) + hash1(m * 23 + 8) * 2.5 + noise(p * 0.004, m * 2.2 + 0.3) * 2;
  // the channel wanders, the valley around it stays smooth: a road has to drive down that
  s.d0 = Math.abs(dq) / l; s.d = Math.max(0, s.d0 + noise(x * 0.041, z * 0.041) * s.w * 0.14);
  s.lvl = riverLevel(m, p, c); s.depth = 1.35 + s.w * 0.07;
  const dir = hash1(m * 31 + 2) < 0.5 ? 1 : -1;
  s.fx = (RC - RS * sl) / l * dir; s.fz = (RS + RC * sl) / l * dir;
  s.sp = big ? 0.75 : 1.05; s.foam = 0; s.fade = 1;
}
// land around a river: a level flood plain, then valley sides as wide as the hill is high
function riverLand(s, h, x, z, rough) {
  const over = Math.max(0, s.d0 - s.w), T = s.lvl + 1 + over * 0.02 + noise(x * 0.13, z * 0.13) * 0.28 * sstep(0, 7, over) * rough;
  const r1 = Math.min(R_VALLEY, s.w + 46 + Math.abs(h - T) * 4.6);
  return mix(h, T, 1 - sstep(s.w + 20, r1, s.d0));
}
// terrain without the bumps, which is what a stream cuts its way down through
function hRef(x, z) {
  const h = hLow(x, z);
  scanRiver(RB, RC * x + RS * z, -RS * x + RC * z, x, z);
  return RB.on ? riverLand(RB, h, x, z, 0) : h;
}
// Walking down from the spring the level can only fall, and it never rises above the ground:
// a dip is followed and the next crest gets a gully, the way a real stream cuts through.
function creekTable(k, m, side) {
  const key = (k + 9999) * 2e5 + (m + 9999) * 2 + (side > 0 ? 1 : 0);
  let t = TAB.get(key);
  if (t) return t;
  let len = 300 + hash2(k * 11 + side * 3, m * 7 + 9) * 380, q0 = m * R_GAP + R_OFF;
  for (let i = 0; i < 8; i++) q0 = riverC(m, creekP(k, q0));
  const n = Math.ceil(len / C_STEP), ref = new Float32Array(n + 2), lev = new Float32Array(n + 2), p0 = creekP(k, q0), mouth = riverLevel(m, p0, riverC(m, p0));
  for (let i = 0; i <= n; i++) { const q = q0 + side * i * C_STEP, p = creekP(k, q); ref[i] = hRef(RC * p - RS * q, RS * p + RC * q); }
  lev[n] = ref[n] - 0.4;
  for (let i = n - 1; i >= 0; i--) lev[i] = Math.min(lev[i + 1] - 0.1, ref[i] - 0.45);
  for (let i = 0; i <= n; i++) {
    lev[i] = Math.max(lev[i], mouth + i * 0.1);
    if (i < 14) lev[i] = Math.min(lev[i], mouth + i * C_STEP * 0.035);
    if (i) lev[i] = Math.max(lev[i], lev[i - 1] + 0.04);
    // land lower than the river behind it: no stream can come from up there
    if (i > 2 && lev[i] > ref[i] - 0.2) { len = i > 6 ? (i - 1) * C_STEP : 0; break; }
  }
  lev[n + 1] = lev[n];
  t = { q0, len, lev, big: 0.85 + hash2(k * 3 + side, m * 5 + 1) * 0.5 };
  TAB.set(key, t);
  return t;
}
// a level table's fall per step, smooth across steps so the flow doesn't jump at each one
function slopeOf(lev, i, a) {
  const n = lev.length - 1, at = j => lev[Math.max(0, Math.min(n, j))];
  return Math.abs(mix(at(i + 1) - at(i - 1), at(i + 2) - at(i), a)) / 2;
}
function scanCreek(p, q) {
  C.on = false;
  const k = Math.round(p / C_GAP);
  if (Math.abs(p - k * C_GAP) > 92 + C_REACH * 1.6) return;
  const dp = p - creekP(k, q);
  if (Math.abs(dp) > C_REACH * 1.6) return;
  const m = Math.round((q - R_OFF) / R_GAP), side = q > riverC(m, p) ? 1 : -1;
  if (hash2(k * 5 + side, m * 3 + 2) > 0.66) return;
  const t = creekTable(k, m, side), s = (q - t.q0) * side;
  if (!t.len || s < -14 || s > t.len) return;
  const f = Math.max(0, s / C_STEP), i = Math.min(t.lev.length - 2, f | 0), a = f - i, drop = t.lev[i + 1] - t.lev[i];
  const sl = (creekP(k, q + 3) - creekP(k, q - 3)) / 6, l = Math.sqrt(1 + sl * sl), young = Math.max(0, 1 - s / t.len);
  if (Math.abs(dp) / l > C_REACH) return;
  C.on = true; C.fade = sstep(0, 46, t.len - s) * sstep(-14, -3, s);
  C.d = Math.abs(dp) / l; C.w = t.big * (0.9 + 2.5 * Math.pow(young, 0.8)) * C.fade; C.lvl = t.lev[i] + drop * a; C.depth = (0.24 + 0.36 * young) * C.fade;
  C.fx = -side * sl / l * RC + side / l * RS; C.fz = -side * sl / l * RS - side / l * RC;
  const fall = slopeOf(t.lev, i, a) / C_STEP;
  C.sp = Math.min(2.4, 0.75 + fall * 50); C.foam = Math.min(0.55, Math.max(0, fall * 9 - 0.06));
}
// ditch streams have the same falling level, read off the road they follow
function onPath(axis, line, off, along) { return gridPoint(axis ? along : lineU(line) + off, axis ? lineV(line) + off : along); }
// world position of a point in the warped field grid
function gridPoint(ut, vt) {
  let x = CA * ut - SA * vt, z = SA * ut + CA * vt;
  for (let i = 0; i < 9; i++) {
    const a = x * 0.0042, b = z * 0.0042, c = x * 0.019, d = z * 0.019;
    const u = ut - noise(a + 11.3, b - 5.1) * 52 - noise(c, d + 9.7) * 7, v = vt - noise(a - 40.7, b + 70.2) * 52 - noise(c + 31.1, d) * 7;
    x = CA * u - SA * v; z = SA * u + CA * v;
  }
  return [x, z];
}
function ditchTable(main, axis, line, n, side) {
  const key = ((line + 9999) * 2 + axis) * 4e5 + (n + 9999) * 2 + (main ? 1 : 0) + 1e13;
  let t = TAB.get(key);
  if (t) return t;
  const N = D_LEN / D_STEP, ref = new Float32Array(N + 1), top = new Float32Array(N + 1), lev = new Float32Array(N + 2), off = (main ? 9.2 : 5.5) * side;
  for (let i = 0; i <= N; i++) {
    const a = (n * D_LEN) + i * D_STEP, q = main ? onRoad(axis, line, off, a) : onPath(axis, line, off, a), c = main ? onRoad(axis, line, 0, a) : onPath(axis, line, 0, a);
    ref[i] = hRef(q[0], q[1]);
    // on a side slope the bank is higher than the road, and the water still has to stay below it
    top[i] = Math.min(ref[i] - 0.55, hRef(c[0], c[1]) - 0.5);
  }
  const dn = ref[0] > ref[N];    // water runs towards the lower end of the stretch
  lev[dn ? 0 : N] = top[dn ? 0 : N];
  if (dn) for (let i = 1; i <= N; i++) lev[i] = Math.min(lev[i - 1] - 0.03, top[i]);
  else for (let i = N - 1; i >= 0; i--) lev[i] = Math.min(lev[i + 1] - 0.03, top[i]);
  lev[N + 1] = lev[N];
  t = { lev, ref, dn };
  TAB.set(key, t);
  return t;
}
function scanDitch() {
  D.on = false;
  const main = L.style === 3;
  if (main ? L.mainD > 18 || L.mainCross < 24 : L.pathD > 14) return;
  const byU = main ? Math.abs(L.su) < Math.abs(L.sv) : L.onU, axis = byU ? 0 : 1, line = main ? (byU ? L.ku : L.kv) : (byU ? L.li : L.lj);
  const s0 = main ? L.mainS : byU ? L.u - lineU(L.li) : L.v - lineV(L.lj), along = main ? L.mainAlong : L.along;
  const n = Math.floor(along / D_LEN), h = hash2(line * 7 + axis * 3 + (main ? 11 : 0), n * 3 + 1);
  if (h >= D_ON) return;
  // the stream takes the side of the road the power line leaves free
  const poled = main && hash2(line * 7 + axis, 33) <= 0.62, side = poled ? (hash2(line * 3 + axis, 71) < 0.5 ? -1 : 1) : h < D_ON / 2 ? 1 : -1;
  const off = side * ((main ? 9.2 : 5.5) + noise(along * 0.031, line * 1.7 + 0.2) * 0.9 + noise(along * 0.11, line + 0.4) * 0.3), d = Math.abs(s0 - off);
  if (d > 9) return;
  const t = ditchTable(main, axis, line, n, side), pos = along - n * D_LEN, f = pos / D_STEP, i = Math.min(t.lev.length - 2, f | 0), a = f - i;
  const other = main ? 1e4 : byU ? (pathV(L.lj) ? L.dv : 1e4) : (pathU(L.li) ? L.du : 1e4);
  const lvl = t.lev[i] + (t.lev[i + 1] - t.lev[i]) * a, cut = t.ref[Math.min(i, t.ref.length - 1)] - lvl;
  let e = sstep(0, 46, pos) * sstep(0, 46, D_LEN - pos) * sstep(9, 17, other) * (1 - sstep(1.2, 2.2, cut)) * (main ? sstep(8, 16, L.farmD) : sstep(8, 16, L.mainD));
  if (R.on) e *= sstep(R.w + 3, R.w + 16, R.d);
  if (C.on) e *= sstep(C.w + 1, C.w + 10, C.d);
  if (e < 0.3) return;
  D.on = true; D.main = main; D.d = d; D.w = (1.05 + (h * 37 % 1) * 0.7) * e; D.lvl = lvl; D.depth = 0.26 + 0.14 * e; D.fade = sstep(0.3, 0.7, e);
  const sg = t.dn ? 1 : -1, tx = byU ? -SA : CA, tz = byU ? CA : SA, fall = slopeOf(t.lev, i, a) / D_STEP;
  D.fx = tx * sg; D.fz = tz * sg; D.sp = Math.min(1.9, 0.6 + fall * 40); D.foam = Math.min(0.28, fall * 7);
}
function scan(x, z) {
  const p = RC * x + RS * z, q = -RS * x + RC * z;
  scanRiver(R, p, q, x, z); scanCreek(p, q); scanDitch();
}
// the stream whose water is closest to this point, after a scan
function nearest() {
  let s = null, b = 1e9;
  if (R.on && R.d - R.w < b) { s = R; b = R.d - R.w; }
  if (C.on && C.d - C.w < b && !(s && b < 0)) { s = C; b = C.d - C.w; }
  if (D.on && D.d - D.w < b && !(s && b < 0)) s = D;
  return s;
}
// inside the channel: a bowl of a bed with gravel bars, rising into the land g around it
function channel(s, g, bw, ford, fordD, x, z) {
  const B = mix(bw, 7, ford);
  if (s.d >= s.w + B) return g;
  const t = Math.min(1, s.d / s.w);
  let bed = s.lvl - s.depth * (1 - t * t) + noise(x * 0.09, z * 0.09) * 0.2 * s.depth;
  if (ford > 0) bed = mix(bed, s.lvl - fordD, ford);
  return mix(bed, g, sstep(s.w * 0.72, s.w + B, s.d));
}
const fordAt = () => (L.style !== 3 ? 1 - sstep(3.4, 7.5, L.pathD) : 0);
let bedH = 0, decked = false;
function wetHeight(x, z, h, mesh) {
  scan(x, z);
  decked = false;
  if (!R.on && !C.on && !D.on) return h;
  const md = L.mainD, road = 1 - sstep(5.8, 15, md);
  if (R.on) h = riverLand(R, h, x, z, sstep(3, 12, L.pathD)) + 1.5 * (1 - sstep(5.8, 34, md)) * (1 - sstep(R.w + 3, R.w + 62, R.d0));
  if (C.on) {
    // the asphalt keeps its line through a creek's valley and crosses on a bridge
    const over = Math.max(0, C.d - C.w), T = C.lvl + 0.55 + over * 0.03;
    const r1 = Math.min(C_REACH - 2, C.w + 7 + Math.abs(h - T) * 3.4);
    h = mix(h, T, (1 - sstep(C.w + 2.5, r1, C.d)) * C.fade * sstep(5.8, 16, md));
    const need = C.lvl + 1.15 - h;
    if (need > 0) h += Math.min(need, 1.6) * C.fade * road * (1 - sstep(C.w + 2, C.w + 30, C.d));
  }
  const keep = !D.on ? 0 : D.main ? sstep(5.7, 6.5, md) : sstep(2.3, 3, L.pathD);
  if (D.on) h = mix(h, D.lvl + 0.42, (1 - sstep(D.w + 0.6, D.w + 4, D.d)) * keep * D.fade);
  const g = h, ford = fordAt();
  if (R.on) h = channel(R, h, 5, ford, 0.3, x, z);
  // a creek goes under the asphalt through a culvert, only a river gets a bridge
  const cut = sstep(5.9, 6.6, md);
  if (C.on && cut > 0) h = mix(h, Math.min(h, channel(C, h, 2, ford, 0.15, x, z)), cut);
  if (D.on) h = mix(h, Math.min(h, channel(D, h, 1.6, 0, 0, x, z)), keep * D.fade);
  if (mesh) return h;
  // on a bridge the wheels ride on the deck, and the real channel lies under it
  const b = 1 - sstep(5.6, 5.9, md);
  if (b <= 0) return h;
  decked = g - h > 0.3; bedH = h;
  return mix(h, g, b);
}

export function height(x, z) { locate(x, z); return wetHeight(x, z, dryHeight(x, z), false); }
// what the terrain mesh shows: the same, except that the channels run on under the bridges
export function heightMesh(x, z) { locate(x, z); return wetHeight(x, z, dryHeight(x, z), true); }
// for something at height y: under a bridge the ground is the river bed
export function ground(x, z, y) {
  const h = height(x, z);
  return decked && y < h - 0.8 ? bedH : h;
}
const W = { on: false, lvl: 0, edge: 0, d: 0, kind: 0, fx: 0, fz: 0, sp: 0, foam: 0 };
// Water near (x,z). on: the point is at most REACH from a bank. edge: signed metres past the bank.
export function waterAt(x, z) {
  locate(x, z); scan(x, z);
  const s = nearest();
  W.on = !!s && s.d - s.w < REACH;
  if (!W.on) { W.edge = 1e4; W.kind = 0; W.foam = 0; return W; }
  W.lvl = s.lvl; W.edge = s.d - s.w; W.d = s.d; W.kind = s.kind; W.fx = s.fx; W.fz = s.fz; W.sp = s.sp;
  W.foam = Math.max(s.foam, fordAt() * (s.d < s.w + 1 ? 0.14 : 0));
  return W;
}

function dryHeight(x, z) {
  const pd = L.pathD, md = L.mainD;
  let h = hLow(x, z);
  const va = villageAmt();
  const m = Math.min(sstep(3, 15, pd), sstep(6, 25, md)) * (1 - va);
  const bump = m > 0 ? m * hBump(x, z) : 0;
  h += bump;
  // shallow ditches beside the road
  if (L.style !== 3 && pd < 8 && pd > 3) { const t = (pd - 5.2) / 1.9; h -= 0.42 * Math.max(0, 1 - t * t); }
  // the road's ditch stops where a farm track joins it, or every crossing would be a jump
  if (md < 11.6 && md > 6.2) { const t = (md - 8.9) / 2.6; h -= 0.5 * Math.max(0, 1 - t * t) * (1 - va) * sstep(2.5, 7, L.farmD); }
  // terrace step on some field borders
  const ed = Math.min(L.du, L.dv);
  if (va === 0 && ed < 9 && pd > 9 && hash2(L.li, L.lj + 7) < 0.3) h += 0.8 * (1 - sstep(0, 9, ed));
  return h;
}
export function normal(x, z, out) {
  const e = 0.7;
  const dx = height(x + e, z) - height(x - e, z), dz = height(x, z + e) - height(x, z - e);
  const l = 1 / Math.sqrt(dx * dx + dz * dz + 4 * e * e);
  out.x = -dx * l; out.y = 2 * e * l; out.z = -dz * l;
  return out;
}

// ---- surface sample: kind plus sRGB albedo --------------------------------------------------
const S = { kind: 0, r: 0, g: 0, b: 0, crop: 0, mu: 1, rough: 0, drag: 0, h: 0, panel: false };
const put = (r, g, b) => { S.r = r; S.g = g; S.b = b; };
const blend = (r, g, b, t) => { S.r = mix(S.r, r, t); S.g = mix(S.g, g, t); S.b = mix(S.b, b, t); };

export function isForest(x, z) { locate(x, z); return isForestCell(L.i, L.j); }
// What a forest is made of here: 0 spruce, 1 beech and oak, 2 a light birch grove.
// Pure noise, so trees, floor colour and undergrowth all agree without asking each other.
export const FOREST = { SPRUCE: 0, BROAD: 1, BIRCH: 2 };
export function forestType(x, z) {
  if (fbm(x * 0.012 + 4, z * 0.012, 2) > 0.08) return FOREST.SPRUCE;
  return fbm(x * 0.0085 - 31, z * 0.0085 + 17, 2) > 0.1 ? FOREST.BIRCH : FOREST.BROAD;
}
// glades: where this is high no tree stands, and grass and flowers take the light
export function forestClearing(x, z) { return fbm(x * 0.024 + 2, z * 0.024 - 9, 2); }
// metres to the middle of the nearest farm track
export function trackDist(x, z) { locate(x, z); return L.pathD; }

// baked: for the ground texture, which shows the channel under a bridge rather than its deck
export function surface(x, z, baked = false) {
  locate(x, z);
  S.panel = false;       // concrete drives like a track but marks like asphalt
  const kindCell = cellKind(L.i, L.j);
  const edge = Math.min(L.du, L.dv), wob = noise(x * 0.09, z * 0.09);
  const fine = noise(x * 0.62, z * 0.62), big = fbm(x * 0.021 + 9, z * 0.021, 3);
  const dirU = hash2(L.i + 3, L.j + 9) < 0.5, skew = hash2(L.i, L.j) * 0.3 - 0.15;
  const row = (dirU ? L.u : L.v) + (dirU ? L.v : L.u) * skew, side = dirU ? L.v : L.u;
  const tramOn = Math.abs((((row / 21) % 1 + 1) % 1 - 0.5) * 21), tramLine = Math.abs(tramOn - 0.95) < 0.34 ? 1 : 0;
  const stripe = Math.sin(row * 2.2) * 0.5 + 0.5, patch = fbm(row * 0.03 + L.i, side * 0.012 + L.j, 3);
  let k = kindCell;
  switch (k) {
    case KIND.WHEAT: {
      put(205 + patch * 40, 165 + patch * 40, 68 + patch * 18);
      blend(176, 150, 62, 0.35 * stripe);
      if (tramLine) blend(150, 128, 70, 0.75);
      S.crop = 1; S.mu = 0.72; S.rough = 0.05; S.drag = 0.03; break;
    }
    case KIND.RAPE: {
      put(236, 205 + patch * 30, 30 + fine * 16);
      blend(160, 178, 52, 0.22 + big * 0.4 + 0.1 * stripe);
      if (tramLine) blend(120, 130, 50, 0.7);
      S.crop = 1; S.mu = 0.72; S.rough = 0.05; S.drag = 0.04; break;
    }
    case KIND.GREEN: {
      put(92 + patch * 60, 155 + patch * 46, 40 + patch * 16);
      blend(72, 128, 34, 0.3 * stripe);
      if (tramLine) blend(116, 118, 62, 0.78);
      S.crop = 1; S.mu = 0.74; S.rough = 0.04; S.drag = 0.012; break;
    }
    case KIND.MEADOW: {
      put(104 + big * 80 + fine * 16, 150 + big * 50 + fine * 16, 58 + big * 22);
      S.crop = 1; S.mu = 0.76; S.rough = 0.07; S.drag = 0.01; break;
    }
    case KIND.PLOUGH: {
      const f = Math.sin(row * 3.6 + fine * 0.8);
      put(92 + f * 15 + big * 26, 72 + f * 12 + big * 20, 54 + f * 9 + big * 14);
      S.crop = 0; S.mu = 0.56; S.rough = 0.13; S.drag = 0.06; break;
    }
    case KIND.STUBBLE: {
      put(198 + big * 34 + stripe * 8, 178 + big * 30 + stripe * 8, 118 + big * 20);
      S.crop = 1; S.mu = 0.76; S.rough = 0.05; S.drag = 0.01; break;
    }
    default: {
      // forest floor with sun-flecked clearings along the track
      const clear = sstep(0.2, 0.55, big + 0.15 * wob);
      const moss = sstep(-0.18, 0.2, big + wob * 0.2 + fine * 0.12);
      // drifts of litter a few metres across, so the floor isn't one even brown
      const drift = fbm(x * 0.07 + 3, z * 0.07 - 5, 2) + fine * 0.15;
      const ft = forestType(x, z);
      if (ft === FOREST.SPRUCE) {
        // red-brown needles under a lot of moss
        put(80 + fine * 14, 58 + fine * 10, 40 + fine * 8);
        blend(104, 70, 46, sstep(0.08, 0.34, drift) * 0.55);
        // moss in cushions, not one green sheet: the needles show between them
        const cushion = moss * sstep(-0.05, 0.3, fine + drift * 0.6);
        blend(52, 82, 34, cushion * 0.85);
        blend(78, 108, 42, sstep(0.3, 0.6, fine + big * 0.5) * cushion * 0.45);
      } else if (ft === FOREST.BROAD) {
        // last autumn's leaves, orange where they're fresh, dark humus where they've rotted
        put(102 + fine * 18, 74 + fine * 14, 44 + fine * 8);
        blend(138, 92, 46, sstep(0.05, 0.32, drift) * 0.6);
        blend(56, 46, 32, sstep(-0.12, -0.36, drift) * 0.55);
        blend(70, 104, 44, moss * 0.45);
      } else {
        // a birch grove lets the light down: grass with leaves in it
        put(98 + fine * 16, 116 + fine * 14, 58 + fine * 8);
        blend(124, 144, 64, sstep(-0.1, 0.3, big) * 0.6);
        blend(110, 88, 54, sstep(0.18, 0.4, drift) * 0.45);
      }
      blend(82, 124, 50, clear * 0.8);
      // a glade: meadow grass, lit
      const glade = sstep(0.2, 0.34, forestClearing(x, z) + wob * 0.04);
      if (glade > 0) blend(108 + big * 40 + fine * 14, 148 + big * 30 + fine * 12, 62 + big * 12, glade * 0.9);
      S.crop = 0.6; S.mu = 0.66; S.rough = 0.09; S.drag = 0.015;
    }
  }
  S.kind = k;
  // grass margin along every field edge
  if (k !== KIND.FOREST) {
    const em = 1 - sstep(1.8, 3.4, edge + wob * 1.1);
    if (em > 0) {
      blend(108 + big * 40, 142 + big * 28, 62, em);
      if (em > 0.5) { S.kind = KIND.VERGE; S.crop = 1; S.mu = 0.76; S.rough = 0.06; S.drag = 0.008; }
    }
  }
  // road
  const pd = L.pathD;
  const hw = L.style === 2 ? 1.75 : 1.95;
  if (pd < 6 && L.style !== 3) {
    if (k === KIND.FOREST) { const v = 1 - sstep(2.5, 5, pd); blend(84, 112, 50, v * 0.8); }
    const ed2 = pd + wob * (L.style === 2 ? 0.1 : 0.55) + fine * 0.14;
    const m = 1 - sstep(hw - 0.35, hw + 0.2, ed2);
    if (m > 0) {
      if (L.style === 2) {
        const seam = Math.abs(((L.along / 3) % 1 + 1) % 1 - 0.5) > 0.485 ? 0.55 : 1, tone = hash2(Math.floor(L.along / 3), 3) * 16;
        blend((154 + tone + fine * 12) * seam, (150 + tone + fine * 12) * seam, (139 + tone + fine * 10) * seam, m);
      } else {
        const g = L.style === 0;
        const ruts = 1 - 0.2 * Math.exp(-Math.pow((pd - 0.95) / 0.34, 2));
        const r0 = (g ? 182 : 150) + fine * 22 + big * 12, g0 = (g ? 168 : 124) + fine * 20 + big * 10, b0 = (g ? 146 : 92) + fine * 18 + big * 8;
        blend(r0 * ruts, g0 * ruts, b0 * ruts, m);
        // grass mane down the middle
        const cg = (1 - sstep(0.18, 0.5, pd + wob * 0.2)) * (g ? 0.5 : 0.95);
        if (cg > 0) blend(92, 128, 52, cg * sstep(-0.3, 0.25, big + 0.25));
      }
      if (m > 0.55) { S.kind = KIND.PATH; S.panel = L.style === 2; S.crop = 0; S.mu = L.style === 2 ? 1.0 : 0.88; S.rough = L.style === 2 ? 0.004 : 0.012; S.drag = 0; }
    }
  }
  if (S.kind !== KIND.PATH && pd < 5.5 && pd > 1.8 && k !== KIND.FOREST) S.crop = 1;
  const md = L.mainD, va = villageAmt();
  if (va > 0) {
    const lawn = sstep(0.35, 0.6, va);
    blend(98 + big * 30 + fine * 12, 140 + big * 26 + fine * 10, 60 + big * 12, lawn);
    if (lawn > 0.5) { S.kind = KIND.MEADOW; S.crop = 1; S.mu = 0.78; S.rough = 0.03; S.drag = 0.008; }
  }
  if (md < 9) {
    const edgeN = md + wob * 0.7 + fine * 0.12;
    const grass = 1 - sstep(6.2, 8.6, edgeN);
    if (grass > 0) {
      blend(96 + big * 34 + fine * 14, 134 + big * 26 + fine * 12, 58 + big * 12, grass);
      S.kind = KIND.VERGE; S.crop = 1; S.mu = 0.76; S.rough = 0.05; S.drag = 0.008;
    }
    if (va > 0.5) {
      // village pavement instead of a gravel shoulder
      const walk = 1 - sstep(6.3, 6.42, md);
      if (walk > 0) { const slab = Math.abs(((L.mainAlong / 1.5) % 1 + 1) % 1 - 0.5) > 0.46 ? 0.86 : 1; blend((172 + fine * 10) * slab, (169 + fine * 10) * slab, (160 + fine * 10) * slab, walk); if (walk > 0.5) { S.kind = KIND.PATH; S.crop = 0; S.mu = 0.95; S.rough = 0.004; S.drag = 0; } }
    }
    const shoulder = va > 0.5 ? 0 : 1 - sstep(4.8, 5.45, md + fine * 0.2 + wob * 0.12);
    if (shoulder > 0) { blend(148 + fine * 26, 138 + fine * 24, 120 + fine * 20, shoulder); if (shoulder > 0.5) { S.kind = KIND.PATH; S.crop = 0; S.mu = 0.84; S.rough = 0.012; S.drag = 0; } }
    const m = 1 - sstep(4.48, 4.6, md + fine * 0.05);
    if (m > 0) {
      // old Czech asphalt: worn lanes, darker repairs, nothing perfectly even
      const wear = Math.exp(-Math.pow((md - 2.2) / 0.9, 2)) * 7, tar = hash2(Math.floor(L.mainAlong / 23), Math.floor(L.mainS / 4.4)) < 0.1 ? -10 : 0;
      const base = 86 + big * 18 + fine * 9 + wear + tar;
      blend(base, base, base * 1.03, m);
      if (m > 0.5) { S.kind = KIND.ROAD; S.crop = 0; S.mu = 1.06; S.rough = 0.0015; S.drag = 0; }
    }
  }
  scan(x, z);
  const st = nearest();
  if (st && (md > 5.9 || (baked && st.kind === 1 && st.d - st.w < 7))) {
    if (md <= 5.9) { S.kind = KIND.VERGE; blend(104, 128, 62, 1); }
    wetSurface(st, st.d - st.w + wob * 0.7 + fine * 0.3, fine, big);
    // nothing grows up through a bridge deck
    if (md <= 6.3) S.crop = 0;
  }
  return S;
}
// banks of tussock grass, a wet edge of mud and stones, then the bed under the water
function wetSurface(st, edge, fine, big) {
  const reach = st.kind === 1 ? 7 : st.kind === 2 ? 4.5 : 2.6;
  const ford = fordAt() > 0.45 && st.kind !== 3 && edge < 7;
  const road = S.kind === KIND.PATH || S.kind === KIND.ROAD;
  if (edge < reach && !road) {
    const g = 1 - sstep(reach * 0.55, reach, edge), straw = sstep(-0.2, 0.3, big + fine * 0.3);
    blend(mix(92, 182, straw) + fine * 20, mix(126, 164, straw) + fine * 16, mix(52, 86, straw), g);
    if (g > 0.4) { S.kind = KIND.BANK; S.crop = 1; S.mu = 0.6; S.rough = 0.06; S.drag = 0.02; }
  }
  const rim = st.kind === 1 ? 1.6 : 0.9;
  if (edge < rim) {
    const e = 1 - sstep(0.1, rim, edge), stones = sstep(0.08, 0.3, fine);
    const c = st.kind === 1 ? 118 + big * 34 : 96 + big * 22;
    blend(c + stones * 62, c * 0.92 + stones * 58, c * 0.74 + stones * 52, e);
    if (e > 0.5) { S.kind = KIND.BANK; S.crop = 0; S.mu = 0.56; S.rough = 0.05; S.drag = 0.02; }
  }
  if (edge < 0.15) {
    const stones = sstep(0.05, 0.28, fine);
    put(62 + stones * 74 + big * 26, 56 + stones * 68 + big * 22, 44 + stones * 56 + big * 16);
    S.kind = KIND.BED; S.crop = 0; S.mu = 0.5; S.rough = st.kind === 1 ? 0.04 : 0.08; S.drag = 0.02;
  }
  if (ford && edge < 5.5) {
    const stones = fine * 26;
    blend(150 + stones, 138 + stones, 112 + stones, 1 - sstep(3.5, 5.5, edge));
    if (edge < 4) { S.kind = KIND.FORD; S.crop = 0; S.mu = 0.8; S.rough = 0.022; S.drag = 0.004; }
  }
}

// Scatter everything that stands on the land. margin widens the search so shade from a
// neighbour's trees reaches this chunk; those items carry own=false.
export function objects(cx, cz, margin = 0) {
  const out = [], step = 5;
  const x0 = cx * CHUNK - margin, z0 = cz * CHUNK - margin, x1 = x0 + CHUNK + margin * 2, z1 = z0 + CHUNK + margin * 2;
  const add = (type, x, z, s, rot) => out.push({ type, x, z, s, rot, own: x >= cx * CHUNK && x < (cx + 1) * CHUNK && z >= cz * CHUNK && z < (cz + 1) * CHUNK });
  for (let ix = Math.floor(x0 / step); ix * step < x1; ix++) for (let iz = Math.floor(z0 / step); iz * step < z1; iz++) {
    const h = hash2(ix, iz), hx = hash2(ix + 91, iz), hz = hash2(ix, iz + 57), hr = hash2(ix + 13, iz - 77);
    const x = (ix + 0.1 + hx * 0.8) * step, z = (iz + 0.1 + hz * 0.8) * step;
    if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
    locate(x, z);
    scan(x, z);
    const st = nearest(), wet = st ? st.d - st.w : 1e4, clear = L.pathD > 6 && L.mainD > 8;
    // boulders stand in the streams and along them, willows and scrub line the banks
    if (wet < 1.2) {
      if (clear && st.kind !== 3 && h < (st.kind === 2 ? 0.2 : 0.035)) add(OBJ.ROCK, x, z, 0.5 + hr * 0.75, hr * 6.283);
      continue;
    }
    if (clear && wet < 3 && st.kind !== 3 && h < 0.07) { add(OBJ.ROCK, x, z, 0.45 + hr * 0.6, hr * 6.283); continue; }
    if (clear && wet < (st?.kind === 1 ? 12 : 6) && villageAmt() < 0.12) {
      const big = st.kind === 1;
      if (h < (big ? 0.3 : 0.16)) { add(OBJ.BUSH, x, z, 0.8 + hr * 0.7, hr * 6.283); continue; }
      if (h < (big ? 0.37 : 0.2)) { add(hr < 0.45 ? OBJ.BIRCH : OBJ.BEECH, x, z, 0.6 + hr * 0.35, hr * 6.283); continue; }
    }
    if (wet < 3) continue;
    if (villageAmt() > 0.12) {
      // only fruit trees in the gardens, the houses are placed below
      if (h < 0.05 && L.mainD > 24) add(hr < 0.5 ? OBJ.OAK : OBJ.BEECH, x, z, 0.4 + hr * 0.2, hr * 6.283);
      continue;
    }
    const pd = L.pathD, edge = Math.min(L.du, L.dv), { li, lj, du, dv, along, onU } = L, i = L.i, j = L.j, wide = L.style === 3 ? 4 : 0;
    const kind = cellKind(i, j), s = 0.82 + hr * 0.5, rot = hr * 6.283;
    if (kind === KIND.FOREST) {
      if (pd < 4.6 + wide) continue;
      if (edge < 7 && h < 0.42) { add(OBJ.BUSH, x, z, s, rot); continue; }
      const ft = forestType(x, z);
      const clear = forestClearing(x, z);
      // gaps between the trees fill with young growth, more of it where light gets down; a birch grove stands thinner
      if (clear > (ft === FOREST.BIRCH ? 0.14 : 0.28) || h > (ft === FOREST.BIRCH ? 0.66 : 0.8)) { if (hr < 0.3) add(OBJ.BUSH, x, z, 0.65 + hr * 1.3, rot); continue; }
      if (h < 0.03) { add(OBJ.ROCK, x, z, s, rot); continue; }
      // a fallen trunk, well clear of the track it could block
      if (h < 0.045 && pd > 9 + wide) { add(OBJ.LOG, x, z, 0.8 + hr * 0.45, rot); continue; }
      const t = ft === FOREST.SPRUCE ? (hr < 0.9 ? OBJ.SPRUCE : OBJ.BIRCH)
        : ft === FOREST.BIRCH ? (hr < 0.84 ? OBJ.BIRCH : hr < 0.94 ? OBJ.BEECH : OBJ.OAK)
        : (hr < 0.68 ? OBJ.BEECH : hr < 0.8 ? OBJ.OAK : hr < 0.9 ? OBJ.SPRUCE : OBJ.BIRCH);
      add(t, x, z, s, rot);
      continue;
    }
    if (pd < 4 + wide) continue;
    // alleys of old trees along some roads
    if (pd > 4.6 + wide && pd < 7.2 + wide && hash1((onU ? li : lj + 500) * 11 + 6) < 0.3 && ((along / 15) % 1 + 1) % 1 < 0.12) { add(hr < 0.5 ? OBJ.OAK : OBJ.BEECH, x, z, s * 0.82, rot); continue; }
    // hedgerows on the unpaved borders
    const hedgeU = du < 3.4 && hash2(li, 3) < 0.55, hedgeV = dv < 3.4 && hash2(lj, 8) < 0.42;
    if ((hedgeU || hedgeV) && pd > 8 + wide) {
      if (h < 0.62) add(OBJ.BUSH, x, z, s * 1.15, rot);
      else if (h < 0.84) add(hr < 0.3 ? OBJ.BIRCH : hr < 0.7 ? OBJ.BEECH : OBJ.OAK, x, z, s * 0.72, rot);
      continue;
    }
    if (edge < 5 && h < 0.0065) { add(OBJ.STAND, x, z, 1, rot); continue; }
    if (kind === KIND.MEADOW) {
      if (h < 0.0042) { add(OBJ.OAK, x, z, s * 1.1, rot); continue; }
      if (h < 0.0095 && edge > 26 && pd > 22) { add(OBJ.BARN, x, z, 1, rot); continue; }
      if (h < 0.018) { add(OBJ.ROCK, x, z, s * 0.8, rot); continue; }
      if (h < 0.024) { add(OBJ.BUSH, x, z, s, rot); continue; }
    } else if (kind === KIND.STUBBLE && edge > 8) {
      if (h < 0.06) add(OBJ.BALE, x, z, 1, rot);
    } else if (h < 0.0012) add(OBJ.OAK, x, z, s, rot);
  }
  poles(cx, cz, out);
  // white marker posts down both sides of the asphalt
  const fine = 1.5;
  for (let ix = 0; ix * fine < CHUNK; ix++) for (let iz = 0; iz * fine < CHUNK; iz++) {
    const x = cx * CHUNK + (ix + 0.5) * fine, z = cz * CHUNK + (iz + 0.5) * fine;
    locate(x, z);
    const va = villageAmt();
    if (va < 0.3 && Math.abs(L.mainD - 5.75) < fine * 0.62 && L.mainCross > 13 && mod(L.mainAlong, 48) < fine * 1.1) { const st = dryLand(x, z); if (st) out.push({ type: OBJ.POST, x, z, s: 1, rot: Math.atan2(L.mainS, 1), own: true }); }
    if (va < 0.6) continue;
    if (!dryLand(x, z)) continue;
    const su = L.su, sv = L.sv, s0 = L.mainS, md = L.mainD, along = L.mainAlong, cross = L.mainCross, byU = Math.abs(su) < Math.abs(sv);
    if (su > 27 && su < 28.5 && sv > 27 && sv < 28.5) out.push({ type: OBJ.CHURCH, x, z, s: 1, rot: 0.31, own: true });
    else if (Math.abs(md - 16) < 0.75 && cross > 22 && mod(along, 16) < 0.75 && !(su > 15 && sv > 15 && su < 42 && sv < 42)) {
      // the front door faces the road
      locate(x + 1, z); const dx = (byU ? L.su : L.sv) - s0;
      locate(x, z + 1); const dz = (byU ? L.su : L.sv) - s0;
      const q = hash2(Math.floor(along / 16), Math.floor(s0));
      out.push({ type: OBJ.HOUSE, x, z, s: 0.92 + q * 0.3, rot: Math.atan2(-Math.sign(s0) * dx, -Math.sign(s0) * dz), own: true, tint: q });
    }
  }
  return out;
}

// Exact point at offset `off` from a road, `along` metres down it. The warp is gentle enough for
// plain fixed-point iteration, so a pole's neighbour can be found without ever scanning for it.
function onRoad(axis, k, off, along) {
  const ut = axis ? along : mainU(k) + off, vt = axis ? mainV(k) + off : along;
  let x = CA * ut - SA * vt, z = SA * ut + CA * vt;
  for (let i = 0; i < 6; i++) {
    const u = ut - noise(x * 0.0019 + 3.7, z * 0.0019 - 1.3) * 66, v = vt - noise(x * 0.0019 - 8.2, z * 0.0019 + 6.1) * 66;
    x = CA * u - SA * v; z = SA * u + CA * v;
  }
  return [x, z];
}
const POLE_GAP = 44, POLE_OFF = 7.3;
// a pole can't stand on the road it would meet at a junction
const poleOk = p => {
  locate(p[0], p[1]);
  if (L.mainD <= 6.6) return false;
  scan(p[0], p[1]);
  return (!R.on || R.d - R.w > 6) && (!C.on || C.d - C.w > 6);
};
// after a locate: nothing built stands in the water or on the crumbling edge of a bank
function dryLand(x, z) { scan(x, z); const s = nearest(); return !s || s.d - s.w > (s.kind === 3 ? 1.5 : 6); }

function poles(cx, cz, out) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  locate(x0 + CHUNK / 2, z0 + CHUNK / 2);
  const ku = L.ku, kv = L.kv;
  const coords = [[x0, z0], [x0 + CHUNK, z0], [x0, z0 + CHUNK], [x0 + CHUNK, z0 + CHUNK]].map(([x, z]) => [
    CA * x + SA * z + noise(x * 0.0019 + 3.7, z * 0.0019 - 1.3) * 66, -SA * x + CA * z + noise(x * 0.0019 - 8.2, z * 0.0019 + 6.1) * 66]);
  for (const axis of [0, 1]) for (let dk = -1; dk <= 1; dk++) {
    const k = (axis ? kv : ku) + dk;
    if (hash2(k * 7 + axis, 33) > 0.62) continue;
    const off = hash2(k * 3 + axis, 71) < 0.5 ? POLE_OFF : -POLE_OFF, a = coords.map(c => c[axis ? 0 : 1]);
    const n0 = Math.floor(Math.min(...a) / POLE_GAP) - 1, n1 = Math.ceil(Math.max(...a) / POLE_GAP) + 1;
    for (let n = n0; n <= n1; n++) {
      const p = onRoad(axis, k, off, n * POLE_GAP);
      if (p[0] < x0 || p[0] >= x0 + CHUNK || p[1] < z0 || p[1] >= z0 + CHUNK || !poleOk(p)) continue;
      let m = n + 1, q = onRoad(axis, k, off, m * POLE_GAP);
      while (!poleOk(q) && m < n + 4) q = onRoad(axis, k, off, ++m * POLE_GAP);
      const back = onRoad(axis, k, off, (n - 1) * POLE_GAP);
      out.push({ type: OBJ.POLE, x: p[0], z: p[1], s: 1, rot: Math.atan2(q[0] - back[0], q[1] - back[1]), own: true, wire: poleOk(q) ? q : undefined, key: axis + ':' + k + ':' + n, prev: axis + ':' + k + ':' + (n - 1) });
    }
  }
}

// Bridges: wherever an asphalt road crosses a river or a creek. Each segment is a slice of road
// BR_STEP long whose midpoint lies in this chunk, so a bridge can run across chunk borders.
const BR_STEP = 3, BR_HALF = 5.7;
function overWater(x, z) {
  locate(x, z);
  if (L.mainD > 8) return false;
  scan(x, z);
  return R.on && R.d < R.w + 7;
}
function underRoad(x, z) {
  locate(x, z);
  if (L.mainD > 9) return false;
  scan(x, z);
  return C.on && C.d < C.w + 2.4;
}
export function bridges(cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK, out = [];
  locate(x0 + CHUNK / 2, z0 + CHUNK / 2);
  const ku = L.ku, kv = L.kv, midX = x0 + CHUNK / 2, midZ = z0 + CHUNK / 2;
  const coords = [[x0, z0], [x0 + CHUNK, z0], [x0, z0 + CHUNK], [x0 + CHUNK, z0 + CHUNK]].map(([x, z]) => [
    CA * x + SA * z + noise(x * 0.0019 + 3.7, z * 0.0019 - 1.3) * 66, -SA * x + CA * z + noise(x * 0.0019 - 8.2, z * 0.0019 + 6.1) * 66]);
  for (const axis of [0, 1]) for (let dk = -1; dk <= 1; dk++) {
    const k = (axis ? kv : ku) + dk;
    if (Math.abs(lineS(midX, midZ, axis, k)) > CHUNK) continue;
    const a = coords.map(c => c[axis ? 0 : 1]), n0 = Math.floor(Math.min(...a) / BR_STEP) - 4, n1 = Math.ceil(Math.max(...a) / BR_STEP) + 4;
    for (let n = n0; n < n1; n++) {
      const along = n * BR_STEP, mid = onRoad(axis, k, 0, along + BR_STEP / 2);
      if (mid[0] < x0 || mid[0] >= x0 + CHUNK || mid[1] < z0 || mid[1] >= z0 + CHUNK) continue;
      locate(mid[0], mid[1]);
      const flat = L.mainCross < 6.6;    // where two roads meet on a bridge: plain deck, no kerb or rail
      scan(mid[0], mid[1]);
      if (!(R.on && R.d - R.w < 34) && !(C.on && C.d - C.w < 12)) continue;
      const stn = v => {
        const l = onRoad(axis, k, -BR_HALF, v), r = onRoad(axis, k, BR_HALF, v), a = onRoad(axis, k, -4.4, v), b = onRoad(axis, k, 4.4, v);
        return { l, r, yl: height(a[0], a[1]), yr: height(b[0], b[1]), along: v };
      };
      for (const sd of [-1, 1]) {
        const q = onRoad(axis, k, sd * 6.3, along + BR_STEP / 2);
        if (underRoad(q[0], q[1])) out.push({ a: stn(along), b: stn(along + BR_STEP), wall: sd });
      }
      let hit = false;
      for (let t = -1; t <= 2 && !hit; t++) for (const off of [-5, 0, 5]) {
        const q = onRoad(axis, k, off, along + t * BR_STEP);
        if (overWater(q[0], q[1])) { hit = true; break; }
      }
      if (!hit) continue;
      const pierAt = mod(n, 4) === 0 && overWater(mid[0], mid[1]) && R.on && R.d < R.w + 1;
      // the rail opens where a farm track joins the road
      const open = sd => { const q = onRoad(axis, k, sd * 5.5, along + BR_STEP / 2); locate(q[0], q[1]); return flat || L.farmD < 7 || L.mainCross < 7; };
      out.push({ a: stn(along), b: stn(along + BR_STEP), pier: pierAt ? heightMesh(mid[0], mid[1]) : null, mid, flat, openL: open(-1), openR: open(1) });
    }
  }
  return out;
}

// Signed distance across the nearest asphalt and the distance along it, for crisp road paint.
export function roadAt(x, z, o) {
  locate(x, z);
  o.d = L.mainS; o.along = L.mainAlong; o.cross = L.mainCross; o.ku = L.ku; o.kv = L.kv;
  return o;
}

// Signed distance from one particular road, so traffic can drive straight through a junction.
export function lineS(x, z, axis, k) {
  return axis
    ? -SA * x + CA * z + noise(x * 0.0019 - 8.2, z * 0.0019 + 6.1) * 66 - mainV(k)
    : CA * x + SA * z + noise(x * 0.0019 + 3.7, z * 0.0019 - 1.3) * 66 - mainU(k);
}

// The field grid and its tracks, for laying out race routes.
export const grid = { CW, CH, lineU, lineV, pathU, pathV, cellKind, point: gridPoint };
export function cellAt(x, z) { locate(x, z); return { i: L.i, j: L.j }; }

// Sun direction is constant through the time-of-day presets so baked shade stays valid.
export const SUN_AZ = 2.42;
