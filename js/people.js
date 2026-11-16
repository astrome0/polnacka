// People: one builder for everyone in the world (drivers now; walkers, players and angry drivers later).
// A person is a set of joint points; every limb is a unit piece stretched between two of them, so any
// pose is just new points. Colours live in the vertices, so the whole crowd shares one material.
// Model space: +Z is where the person faces, +X is their left, Y=0 under their feet when standing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PEOPLE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
const C = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0), D = new THREE.Vector3(), E = new THREE.Vector3(), F = new THREE.Vector3();

// seeded, so the same seed always makes the same person (a player's look can be sent as one number)
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[r() * list.length | 0];

// ---- geometry helpers: everything is painted, non-indexed and without uvs, so it merges freely ----
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  C.setHex(hex); const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const merge = list => { const g = mergeGeometries(list); g.computeBoundingSphere(); return g; };
const sphere = (r, hex, ws = 12, hs = 9) => paint(new THREE.SphereGeometry(r, ws, hs), hex);
const boxG = (w, h, d, hex) => paint(new THREE.BoxGeometry(w, h, d), hex);
// a limb piece: unit length along +Y centred on 0, radius 1 (scaled per person)
const tubeG = (hex, r0 = 1, r1 = 1, seg = 10) => paint(new THREE.CylinderGeometry(r1, r0, 1, seg, 1, false), hex);

// ---- looks ---------------------------------------------------------------------------------------
const SKIN = [0xf1c9a5, 0xe8b894, 0xd9a47c, 0xc68c63, 0xa8704c, 0x86563a, 0x63402b];
const HAIR = [0x1c1612, 0x2e2119, 0x4a3322, 0x6a4a2c, 0x9a7348, 0xc9a46a, 0x8a3a1c];
const GREY = [0x8e8a84, 0xb8b4ae, 0xe2ded6];
const TOPS = [0xc8141e, 0x1d4fb4, 0x2a5d4a, 0xe8e8e4, 0x24262b, 0x6b2d8f, 0xe07a12, 0x7c8a96, 0x8c1c3a, 0x3a6a9a, 0xd8c79a, 0x4a5a2c, 0x1a2340, 0xb04a2a, 0x5a7a5a];
const PANTS = [0x2e4a72, 0x3a5680, 0x24262b, 0x8a7d5a, 0x55585e, 0x3c4a2c, 0x1d2430];
const HATS = [0xc8141e, 0x1d4fb4, 0x24262b, 0x2a5d4a, 0xe07a12, 0xe8e8e4];

// Rolls a look. Everything here is plain data, so it can be sent, saved or tweaked.
export function makeLook(seed, opts = {}) {
  const r = rng(seed);
  const age = opts.age ?? (r() < 0.12 ? 'young' : r() < 0.7 ? 'adult' : 'old');
  const long = r() < 0.4;
  const look = {
    seed, age,
    h: 1.58 + r() * 0.34,                                         // height
    w: 0.86 + r() * 0.3 + (age === 'old' ? 0.08 : 0) + (r() < 0.18 ? 0.25 : 0),   // girth
    skin: pick(r, SKIN),
    hair: age === 'old' && r() < 0.75 ? pick(r, GREY) : pick(r, HAIR),
    style: age === 'old' && !long && r() < 0.45 ? 'balding' : r() < 0.07 ? 'bald' : long ? pick(r, ['long', 'long', 'ponytail', 'bob']) : pick(r, ['short', 'short', 'buzz', 'curly']),
    beard: long ? 'none' : pick(r, ['none', 'none', 'none', 'stubble', 'full', 'moustache', 'goatee']),
    glasses: r() < (age === 'old' ? 0.55 : 0.18) ? (r() < 0.25 ? 'sun' : 'clear') : 'none',
    hat: r() < 0.28 ? pick(r, ['cap', 'cap', 'beanie', 'straw']) : 'none',
    hatColor: pick(r, HATS),
    top: pick(r, ['tee', 'tee', 'long', 'long', 'jacket', 'hivis', 'overalls', 'suit']),
    topColor: pick(r, TOPS),
    pants: pick(r, PANTS),
    shoes: pick(r, [0x1c1c1e, 0x3a2a1e, 0xe8e8e4, 0x5a4a3a]),
    // how they drive and how they take a crash: read by the traffic (driving style) and the crash reactions
    temper: r(), calm: r(), phone: r() < 0.12,
  };
  if (look.top === 'overalls') look.pants = pick(r, [0x2c4a8a, 0x3c4a2c, 0x7a5a3a]);
  if (look.top === 'suit') { look.topColor = pick(r, [0x24262b, 0x2a3040, 0x4a4e55]); look.pants = look.topColor; look.hat = 'none'; }
  if (look.hat === 'straw' && look.age === 'young') look.hat = 'cap';
  return Object.assign(look, opts);
}

// ---- the head: one rigid piece with face, hair, beard, glasses and hat ---------------------------
function headGeo(L) {
  const parts = [], s = 0.105;
  const skull = sphere(s, L.skin, 16, 12); skull.scale(0.92, 1.06, 1); parts.push(skull);
  const ear = sphere(0.026, L.skin, 8, 6); for (const x of [-1, 1]) parts.push(ear.clone().scale(0.6, 1, 0.8).translate(x * s * 0.93, -0.005, -0.005));
  parts.push(boxG(0.026, 0.04, 0.03, L.skin).translate(0, -0.012, s * 0.98));                 // nose
  const dark = 0x15120f;
  for (const x of [-1, 1]) {
    parts.push(sphere(0.012, 0xf4f2ee, 8, 6).translate(x * 0.036, 0.02, s * 0.9));             // eyes
    parts.push(sphere(0.0075, dark, 6, 5).translate(x * 0.036, 0.02, s * 0.9 + 0.008));
    parts.push(boxG(0.032, 0.007, 0.01, L.age === 'old' ? L.hair : 0x2a2018).translate(x * 0.037, 0.043, s * 0.93).rotateZ(x * -0.08)); // brows
  }
  parts.push(boxG(0.04, 0.007, 0.01, 0x7a3a32).translate(0, -0.052, s * 0.9));                // mouth
  const hc = L.hair;
  // hair: caps slightly bigger than the skull, cut open at the face
  const cap = (scale, thetaLen, hex) => { const g = new THREE.SphereGeometry(s * scale, 16, 10, Math.PI * 0.62, Math.PI * 1.76, 0, thetaLen); return paint(g, hex).scale(0.92, 1.06, 1); };
  if (L.style === 'short' || L.style === 'curly') parts.push(cap(1.06, Math.PI * 0.5, hc));
  if (L.style === 'curly') for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; parts.push(sphere(0.03, hc, 6, 5).translate(Math.cos(a) * 0.075, 0.07 + (i % 3) * 0.012, Math.sin(a) * 0.075 - 0.01)); }
  if (L.style === 'buzz') parts.push(cap(1.02, Math.PI * 0.48, hc));
  if (L.style === 'balding') { const g = paint(new THREE.TorusGeometry(s * 0.88, 0.022, 6, 18, Math.PI * 1.2), hc); g.rotateX(Math.PI / 2).rotateY(-Math.PI * 0.1).translate(0, -0.005, -0.01); parts.push(g); }
  if (L.style === 'long' || L.style === 'ponytail' || L.style === 'bob') {
    parts.push(cap(1.07, Math.PI * 0.55, hc));
    if (L.style === 'long') parts.push(boxG(0.2, 0.24, 0.06, hc).translate(0, -0.1, -0.075));
    if (L.style === 'bob') parts.push(paint(new THREE.CylinderGeometry(s * 1.08, s * 1.12, 0.12, 14, 1, true, Math.PI * 0.75, Math.PI * 1.5), hc).translate(0, -0.03, 0));
    if (L.style === 'ponytail') { parts.push(sphere(0.035, hc, 8, 6).translate(0, 0.02, -0.11)); parts.push(paint(new THREE.CylinderGeometry(0.02, 0.03, 0.18, 8), hc).translate(0, -0.08, -0.125)); }
  }
  // beards
  if (L.beard === 'full') { const b = sphere(s * 0.82, hc, 12, 8); b.scale(1, 0.75, 0.75).translate(0, -0.055, 0.035); parts.push(b); }
  if (L.beard === 'stubble') { const b = sphere(s * 0.97, mix(L.skin, hc, 0.45), 12, 8); b.scale(0.93, 0.6, 0.98).translate(0, -0.045, 0.004); parts.push(b); }
  if (L.beard === 'moustache' || L.beard === 'goatee') parts.push(boxG(0.06, 0.014, 0.014, hc).translate(0, -0.035, s * 0.95));
  if (L.beard === 'goatee') parts.push(boxG(0.035, 0.04, 0.02, hc).translate(0, -0.08, s * 0.8));
  // glasses
  if (L.glasses !== 'none') {
    const fr = L.glasses === 'sun' ? 0x111111 : 0x2a2a2a;
    for (const x of [-1, 1]) {
      if (L.glasses === 'sun') parts.push(boxG(0.045, 0.028, 0.008, 0x0c0d10).translate(x * 0.037, 0.02, s * 0.97));
      else { const ring = paint(new THREE.TorusGeometry(0.02, 0.0035, 5, 14), fr); ring.translate(x * 0.037, 0.02, s * 0.97); parts.push(ring); }
      parts.push(boxG(0.004, 0.004, 0.09, fr).translate(x * 0.088, 0.022, s * 0.5));
    }
    parts.push(boxG(0.024, 0.004, 0.004, fr).translate(0, 0.024, s * 0.98));
  }
  // hats
  const hk = L.hatColor;
  if (L.hat === 'cap') { parts.push(cap(1.1, Math.PI * 0.42, hk).translate(0, 0.006, 0)); parts.push(paint(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 16, 1, false, -Math.PI / 2, Math.PI), hk).scale(1, 1, 0.9).translate(0, 0.045, 0.085).rotateX(0.12)); }
  if (L.hat === 'beanie') { const g = paint(new THREE.SphereGeometry(s * 1.1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hk); g.scale(0.94, 1.18, 1.02); parts.push(g); }
  if (L.hat === 'straw') { const k = 0xd8c07a; parts.push(paint(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 20), k).translate(0, 0.05, 0)); parts.push(paint(new THREE.CylinderGeometry(0.075, 0.09, 0.09, 14), k).translate(0, 0.095, 0)); parts.push(paint(new THREE.CylinderGeometry(0.091, 0.091, 0.02, 14), 0x6a3a1c).translate(0, 0.065, 0)); }
  return merge(parts);
}
function mix(a, b, t) { const A = new THREE.Color(a), B = new THREE.Color(b); return A.lerp(B, t).getHex(); }

// ---- the person -----------------------------------------------------------------------------------
export class Person {
  constructor(look) {
    this.look = look;
    const L = look, g = this.group = new THREE.Group(), k = L.w;
    this.k = k; this.s = L.h / 1.75;
    const shirt = L.top === 'hivis' ? 0x3a3c40 : L.topColor, sleeve = L.top === 'tee' || L.top === 'hivis' ? L.skin : shirt;
    const torsoCol = L.top === 'overalls' ? L.pants : shirt;
    const parts = this.parts = {};
    const add = (name, geo) => { const m = new THREE.Mesh(geo, PEOPLE_MAT); m.name = name; g.add(m); parts[name] = m; return m; };
    // torso: a capsule, wider than deep; the belly sits on it for the heavier ones
    const torso = paint(new THREE.CapsuleGeometry(1, 1, 4, 12), torsoCol);
    const extra = [];
    if (L.top === 'overalls') extra.push(boxG(1.4, 0.9, 0.3, shirt).translate(0, 0.35, -0.85));                 // shirt showing at the back
    if (L.top === 'hivis') { extra.push(boxG(2.04, 0.9, 2.04, 0xd8f020).translate(0, 0.05, 0)); for (const y of [-0.2, 0.25]) extra.push(boxG(2.08, 0.1, 2.08, 0xb8bcc0).translate(0, y, 0)); }
    if (L.top === 'suit') { extra.push(boxG(0.5, 0.7, 0.2, 0xeeeeea).translate(0, 0.45, 0.92)); extra.push(boxG(0.14, 0.6, 0.06, 0x8c1c3a).translate(0, 0.38, 1.02)); }
    if (L.top === 'jacket') extra.push(boxG(0.08, 1.4, 0.1, 0x1a1a1a).translate(0, 0.1, 0.98));          // zip
    add('torso', extra.length ? merge([torso, ...extra]) : torso);
    add('pelvis', paint(new THREE.CapsuleGeometry(1, 0.6, 4, 10), L.pants));
    if (k > 1.12) add('belly', sphere(1, torsoCol, 12, 9));
    add('neck', tubeG(L.skin, 1, 1, 8));
    for (const sd of ['L', 'R']) {
      add('upper' + sd, tubeG(sleeve === L.skin ? shirt : sleeve, 1, 0.9));   // a tee still has a short sleeve at the top
      add('fore' + sd, tubeG(sleeve, 0.92, 0.8));
      add('hand' + sd, sphere(1, L.skin, 10, 8));
      add('shoulder' + sd, sphere(1, shirt, 10, 8));
      add('elbow' + sd, sphere(1, sleeve, 8, 6));
      add('thigh' + sd, tubeG(L.pants, 0.85, 1));
      add('knee' + sd, sphere(1, L.pants, 8, 6));
      add('shin' + sd, tubeG(L.pants, 0.78, 0.92));
      // (stretched along the foot: its +Z ends up pointing down, so the sole sits at +Z)
      add('shoe' + sd, merge([boxG(1, 1, 0.75, L.shoes), boxG(1.04, 1.04, 0.2, 0x2a2622).translate(0, 0, 0.42)]));
    }
    // the head turns on its own
    this.head = new THREE.Group(); g.add(this.head);
    const hm = new THREE.Mesh(headGeo(L), PEOPLE_MAT); hm.name = 'head'; this.head.add(hm); parts.head = hm;
    this.pts = {};
    this.yaw = 0; this.pitch = 0;
    g.traverse(o => { o.castShadow = true; });
    this.stand();
  }
  // sizes of everything for this person
  get dims() {
    const s = this.s, k = this.k;
    return { s, k, upper: 0.29 * s, fore: 0.27 * s, thigh: 0.44 * s, shin: 0.43 * s, sh: 0.19 * s * (0.9 + 0.1 * k), hip: 0.09 * s * k };
  }
  // ---- poses: they only move points; apply() sets the pieces ----
  stand() {
    const s = this.s, d = this.dims, P = this.pts;
    P.pelvis = V(0, 0.96 * s, 0); P.neck = V(0, 1.47 * s, -0.01); P.headC = V(0, 1.6 * s, 0.01);
    for (const [sd, x] of [['L', 1], ['R', -1]]) {
      P['sh' + sd] = V(x * d.sh, 1.41 * s, -0.01); P['el' + sd] = V(x * (d.sh + 0.04), 1.13 * s, -0.02); P['ha' + sd] = V(x * (d.sh + 0.05), 0.87 * s, 0.02);
      P['hip' + sd] = V(x * d.hip, 0.92 * s, 0); P['kn' + sd] = V(x * d.hip * 1.05, 0.5 * s, 0.02); P['an' + sd] = V(x * d.hip * 1.1, 0.08, 0); P['toe' + sd] = V(x * d.hip * 1.1, 0.04, 0.15);
    }
    this.apply();
  }
  // seated with the hips at H (car space, the person's group sits at the origin), feet towards F.y on the floor
  sit(H, floorY, footZ) {
    const s = this.s, d = this.dims, P = this.pts;
    P.pelvis = V(H.x, H.y, H.z); P.neck = V(H.x, H.y + 0.5 * s, H.z - 0.07); P.headC = V(H.x, H.y + 0.63 * s, H.z - 0.04);
    for (const [sd, x] of [['L', 1], ['R', -1]]) {
      P['sh' + sd] = V(H.x + x * d.sh, H.y + 0.45 * s, H.z - 0.07);
      P['hip' + sd] = V(H.x + x * d.hip, H.y - 0.02, H.z);
      // thigh forward, shin down to the floor; with a low seat the knees come up
      const kn = V(H.x + x * d.hip * 1.15, Math.max(H.y + 0.03, floorY + d.shin * 0.92), H.z + d.thigh * 0.92);
      P['kn' + sd] = kn;
      const fz = Math.min(footZ, kn.z + 0.28);
      P['an' + sd] = V(H.x + x * d.hip * 1.25, floorY + 0.08, fz);
      P['toe' + sd] = V(H.x + x * d.hip * 1.25, floorY + 0.05, fz + 0.14);
      P['el' + sd] = V(H.x + x * (d.sh + 0.03), H.y + 0.18 * s, H.z + 0.05); P['ha' + sd] = V(H.x + x * d.sh * 0.8, H.y + 0.05, H.z + 0.25);
    }
    this.apply();
  }
  // hands to world-ish targets (same space as the points), elbows bending down and out
  reach(hL, hR) {
    const d = this.dims, P = this.pts;
    for (const [sd, T, x] of [['L', hL, 1], ['R', hR, -1]]) {
      if (!T) continue;
      const S = P['sh' + sd]; D.subVectors(T, S); let dist = D.length();
      const a = d.upper, b = d.fore, dd = Math.min(Math.max(dist, Math.abs(a - b) + 0.01), a + b - 0.005);
      D.normalize();
      const ca = (a * a + dd * dd - b * b) / (2 * a * dd), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      E.set(x * 0.6, -1, -0.2); E.addScaledVector(D, -E.dot(D)).normalize();          // pole: down, out, a little back
      P['el' + sd].copy(S).addScaledVector(D, a * ca).addScaledVector(E, a * sa);
      P['ha' + sd].copy(T);
    }
    this.applyArms();
  }
  turnHead(yaw, pitch = 0) { this.yaw = yaw; this.pitch = pitch; this.head.rotation.set(pitch, yaw, 0, 'YXZ'); }

  apply() {
    const P = this.pts, d = this.dims, k = this.k, s = this.s, p = this.parts;
    // torso from just above the pelvis to the neck; 1+1 capsule → scale so the caps end at the points
    seg(p.torso, F.copy(P.pelvis).add(V0.set(0, 0.02 * s, 0)), P.neck, 0.17 * k * s, 0.115 * k * s, 3);
    seg(p.pelvis, F.copy(P.hipL).lerp(P.hipR, 0.5).add(V0.set(0, 0.02, 0)), F2.copy(P.pelvis).add(V0.set(0, 0.1 * s, 0)), 0.16 * k * s, 0.11 * k * s, 2.6);
    if (p.belly) { p.belly.position.copy(P.pelvis).lerp(P.neck, 0.3).add(V0.set(0, 0, 0.045 * k * s)); p.belly.scale.set(0.15 * k * s, 0.14 * k * s, 0.1 * k * s); }
    seg(p.neck, P.neck, F.copy(P.headC).add(V0.set(0, -0.08 * s, -0.01)), 0.048 * s, 0.048 * s);
    this.head.position.copy(P.headC); this.head.scale.setScalar(s);
    for (const sd of ['L', 'R']) {
      seg(p['thigh' + sd], P['hip' + sd], P['kn' + sd], 0.078 * k * s, 0.078 * k * s);
      ball(p['knee' + sd], P['kn' + sd], 0.062 * k * s);
      seg(p['shin' + sd], P['kn' + sd], P['an' + sd], 0.056 * Math.sqrt(k) * s, 0.056 * Math.sqrt(k) * s);
      seg(p['shoe' + sd], F.copy(P['an' + sd]).lerp(P['toe' + sd], -0.15), P['toe' + sd], 0.055 * s, 0.05 * s, 1, true);
      ball(p['shoulder' + sd], P['sh' + sd], 0.062 * k * s);
    }
    this.applyArms();
  }
  applyArms() {
    const P = this.pts, k = this.k, s = this.s, p = this.parts;
    for (const sd of ['L', 'R']) {
      seg(p['upper' + sd], P['sh' + sd], P['el' + sd], 0.054 * k * s, 0.054 * k * s);
      ball(p['elbow' + sd], P['el' + sd], 0.046 * k * s);
      seg(p['fore' + sd], P['el' + sd], P['ha' + sd], 0.047 * k * s, 0.047 * k * s);
      ball(p['hand' + sd], P['ha' + sd], 0.045 * s); p['hand' + sd].scale.y *= 1.25;
    }
  }
  // bake the pieces that won't move again (a seated driver's body) into one mesh: far fewer draw calls
  freeze(names) {
    const list = [];
    for (const n of names) { const m = this.parts[n]; if (!m) continue; m.updateMatrix(); list.push(m.geometry.clone().applyMatrix4(m.matrix)); m.visible = false; }
    const baked = new THREE.Mesh(merge(list), PEOPLE_MAT); baked.castShadow = true; this.group.add(baked); this.baked = baked;
  }
  dispose() { this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.group.removeFromParent(); }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z), V0 = new THREE.Vector3(), F2 = new THREE.Vector3(), Q = new THREE.Quaternion();
// stretch a unit piece from a to b; rx/rz its half widths. capLen: how much of the unit length the
// piece's own geometry spans (2 for the 1+1 capsule). across: optional pair of points that set its width axis.
function seg(m, a, b, rx, rz, capLen = 1, flatFoot) {
  D.subVectors(b, a); const l = D.length() || 1e-4;
  m.position.copy(a).addScaledVector(D, 0.5);
  D.divideScalar(l);
  m.quaternion.setFromUnitVectors(UP, D);
  if (flatFoot) { m.scale.set(rx * 2, l, rz * 2.2); return; }   // a shoe lies along the foot: width across, height up
  m.scale.set(rx, l / capLen, rz);
}
function ball(m, p, r) { m.position.copy(p); m.scale.setScalar(r); }

// ---- seats ------------------------------------------------------------------------------------------
// A driver sat in a vehicle: the person plus a steering wheel they hold. seat: { hip:[x,y,z], floor, foot,
// wheel:[x,y,z], tilt, R } in the vehicle's model space. update() turns the wheel and the head.
export class Driver {
  constructor(look, seat) {
    this.person = new Person(look); this.seat = seat; this.look = look;
    const g = this.group = new THREE.Group(); g.add(this.person.group);
    const [hx, hy, hz] = seat.hip;
    this.person.sit(new THREE.Vector3(hx, hy, hz), seat.floor, seat.foot);
    // the parts that never move again go into one mesh
    this.person.freeze(['torso', 'pelvis', 'belly', 'neck', 'thighL', 'thighR', 'kneeL', 'kneeR', 'shinL', 'shinR', 'shoeL', 'shoeR', 'shoulderL', 'shoulderR']);
    // steering wheel: a ring on a hub, tilted towards the driver
    const wheel = this.wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(merge([paint(new THREE.TorusGeometry(seat.R, 0.014, 8, 28), 0x1c1d21), paint(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 12).rotateX(Math.PI / 2), 0x26272c), boxG(seat.R * 2 - 0.03, 0.025, 0.012, 0x2c2d33)]), PEOPLE_MAT));
    // (elbow balls are left out in a cab: the sleeves overlap there anyway, and each is a draw call)
    this.person.parts.elbowL.visible = this.person.parts.elbowR.visible = false;
    this.holder = new THREE.Group(); this.holder.position.set(...seat.wheel); this.holder.rotation.x = seat.tilt ?? 0.35; this.holder.add(wheel); g.add(this.holder);
    this.angle = 0; this.yaw = 0; this.glance = 0; this.glanceT = 2 + Math.random() * 5;
    this.hL = new THREE.Vector3(); this.hR = new THREE.Vector3();
    // inside a cab: no shadows of its own and left out of the rear-view mirror (layer 1), each would draw it all again
    g.traverse(o => { o.castShadow = false; o.layers.set(1); });
    this.update(0, 0, null);
  }
  // steer: wheel angle in radians. lookAt: a point in the vehicle's model space to glance at, or null.
  update(dt, steer, lookAt, phone = false) {
    this.angle += (steer - this.angle) * Math.min(1, dt * 6);
    this.wheel.rotation.z = this.angle;
    // hands at ten to two on the rim, carried round by the wheel
    const R = this.seat.R;
    // (model +X is the driver's left: the left hand sits at +X, ten o'clock)
    this.holder.updateMatrix();
    for (const [v, a] of [[this.hL, Math.PI / 6], [this.hR, Math.PI * 5 / 6]]) v.set(Math.cos(a + this.angle) * R, Math.sin(a + this.angle) * R, -0.03).applyMatrix4(this.holder.matrix);
    if (phone) {
      const H = this.person.pts.pelvis;
      this.hR.set(H.x - 0.1, H.y + 0.32, H.z + 0.32);
      if (!this.phoneMesh) { this.phoneMesh = new THREE.Mesh(merge([boxG(0.07, 0.14, 0.012, 0x15161a), boxG(0.06, 0.12, 0.002, 0x7aa6d8).translate(0, 0, 0.007)]), PEOPLE_MAT); this.phoneMesh.layers.set(1); this.group.add(this.phoneMesh); }
      this.phoneMesh.position.copy(this.hR).add(V0.set(0, 0.06, 0.02)); this.phoneMesh.rotation.set(-0.9, 0, 0);
    }
    if (this.phoneMesh) this.phoneMesh.visible = phone;
    this.person.reach(this.hL, this.hR);
    // eyes on the road, into the turn, and now and then a look round (or at you, when you're close)
    this.glanceT -= dt;
    if (this.glanceT < 0) { this.glanceT = 2 + Math.random() * 6; this.glance = (Math.random() - 0.5) * 1.6; this.glanceHold = 0.6 + Math.random() * 1.2; }
    this.glanceHold = Math.max(0, (this.glanceHold || 0) - dt);
    let want = -steer * 0.35 + (this.glanceHold > 0 ? this.glance : 0);
    if (lookAt) { const H = this.person.pts.headC; want = Math.atan2(lookAt.x - H.x, lookAt.z - H.z); want = Math.max(-1.5, Math.min(1.5, want)); }
    if (phone && !lookAt) want = -0.15;
    this.yaw += (want - this.yaw) * Math.min(1, dt * 4);
    this.pitch = (this.pitch || 0) + ((phone && !lookAt ? 0.55 : 0) - (this.pitch || 0)) * Math.min(1, dt * 5);
    this.person.turnHead(this.yaw, this.pitch);
  }
  dispose() { this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.group.removeFromParent(); }
}
