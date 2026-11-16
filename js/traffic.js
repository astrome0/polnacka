// Life on the map: cars keeping to their lane on the asphalt and tractors working the fields.
// Both are kinematic until something hits them; after that they are wrecks that skid to a stop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARS, buildPanels, bodyMaterial } from './cars.js';
import { height, surface, roadAt, lineS, inVillage, mountainAt, KIND } from './world.js';
import { Driver, makeLook } from './people.js';
import { CIVIL, buildNpcCar } from './civil.js';
import { Vehicle } from './physics.js';
import { plan, LANE } from './npcdrive.js';
import { Tow } from './tow.js';

const R = (a, b) => a + Math.random() * (b - a);
// How people drive, picked from who they are (people.js look: age, temper, calm, phone).
// speed: × the usual 17-25 m/s; gap: × the 10 m they leave; look: × how far ahead they notice things;
// wobble: metres of wandering in the lane; honk at anyone slow; pass: × the patience before going round.
const STYLES = {
  normal: { name: 'normal', speed: 1, gap: 1, look: 1, wobble: 0.08 },
  granny: { name: 'granny', speed: 0.66, gap: 1.7, look: 1.3, wobble: 0.05, village: 10, pass: 2.5 },
  rusher: { name: 'rusher', speed: 1.3, gap: 0.4, look: 1.1, wobble: 0.1, honk: true, pass: 0.4 },
  phone: { name: 'phone', speed: 0.92, gap: 1, look: 0.9, wobble: 0.45 },
  learner: { name: 'learner', speed: 0.72, gap: 1.5, look: 1, wobble: 0.3, jerky: true, village: 11, pass: 3 },
};
export function styleOf(L) {
  if (L.phone) return STYLES.phone;
  if (L.age === 'old' && L.calm > 0.3) return STYLES.granny;
  if (L.age === 'young' && L.calm < 0.45) return STYLES.learner;
  if (L.temper > 0.72) return STYLES.rusher;
  return STYLES.normal;
}
const FAR = 470;
// within PHYS_IN a car is a real Vehicle on its wheels, driven by its driver; beyond PHYS_OUT it slides
// along its lane again (cheap). The gap between them keeps it from flickering.
const PHYS_IN = 200, PHYS_OUT = 240;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), fq = new THREE.Vector3(), tq = new THREE.Quaternion();
const tv = new THREE.Vector3(), lv = new THREE.Vector3(), inv = new THREE.Matrix4();
const flat = g => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return q; };
const box = (w, h, d, x, y, z) => flat(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
const wheelGeo = (r, w) => flat(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2));
const merge = list => { const g = mergeGeometries(list); g.computeVertexNormals(); return g; };

export class Traffic {
  constructor(scene, fx, audio, terrain, env, q) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.terrain = terrain; this.env = env;
    this.count = q.traffic; this.farmers = q.tractors;
    this.movers = []; this.onCrash = null;
    this.tyre = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.9 });
    this.rim = new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 0.6, roughness: 0.4 });
    // see-through, so you can watch the driver at the wheel
    this.glass = new THREE.MeshPhysicalMaterial({ color: 0x1a262c, roughness: 0.05, metalness: 0, envMap: env, envMapIntensity: 0.55, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    this.trim = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.85 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.8 });
    // lit lenses: shaded glass by day (flat white they read as eyeballs on the new bodies), glowing at night
    this.front = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.08, metalness: 0.3, envMap: env, envMapIntensity: 1.2, emissive: 0xfff0d0, emissiveIntensity: 0 });
    this.rear = new THREE.MeshStandardMaterial({ color: 0x7a0c0a, roughness: 0.15, metalness: 0.1, emissive: 0xff2010, emissiveIntensity: 0 });
    this.dummyCab = { uCabInv: { value: new THREE.Matrix4() }, uSunLocal: { value: new THREE.Vector3(0, 1, 0) }, uSunVis: { value: 0 } };
    // everyday cars, vans and trucks (civil.js), all with real lofted bodies; weights set how common each is
    this.types = CIVIL.map(spec => ({ civ: spec, weight: spec.weight }));
    this.tractorDef = this.tractor();
    this.t = 0;
    this.tow = new Tow(this);   // fetches wrecks that block the road (tow.js)
  }
  lofted(spec) {
    const { panels } = buildPanels(spec), paint = [], panes = [];
    for (const n in panels) (n.startsWith('glass') ? panes : paint).push(panels[n]);
    const glass = mergeGeometries(panes);
    const s = spec.stations, a = spec.axle, r = spec.wheel.r, w = spec.wheel.w * 0.9, t = spec.track;
    const wheels = [], rims = [];
    for (const z of [a.f, a.r]) for (const x of [-t, t]) {
      wheels.push(wheelGeo(r, w).translate(x, r, z)); rims.push(wheelGeo(r * 0.62, w * 1.04).translate(x, r, z));
    }
    const zF = s[s.length - 2].z, zR = s[1].z, wF = s[4].w;
    const lamps = [box(0.3, 0.1, 0.03, -wF * 0.68, spec.kind === 'pickup' ? 1.05 : 0.7, zF), box(0.3, 0.1, 0.03, wF * 0.68, spec.kind === 'pickup' ? 1.05 : 0.7, zF)];
    const tails = [box(0.3, 0.12, 0.03, -wF * 0.76, spec.kind === 'pickup' ? 1.02 : 0.82, zR - 0.04), box(0.3, 0.12, 0.03, wF * 0.76, spec.kind === 'pickup' ? 1.02 : 0.82, zR - 0.04)];
    // the dark inside of the cabin only: running nose to tail it stood up through the sloping bonnet as a black lid
    const fz0 = (spec.marks.bed ? spec.marks.bed[1] : spec.marks.tail) + 0.05, fz1 = spec.marks.cowl - 0.05;
    const fill = [box(wF * 1.7, s[4].belt - 0.03 - s[4].low, fz1 - fz0, 0, (s[4].belt - 0.03 + s[4].low) / 2, (fz0 + fz1) / 2)];
    // seats and a dash, seen through the glass; the driver sits on the left one
    const [ex, ey, ez] = spec.eye, [wx, , wz] = spec.wheelPos, cowl = s.find(q => q.z >= spec.marks.cowl), wy = cowl.belt + 0.015 - 0.1;
    const inner = [box(s[4].wb * 1.85, 0.16, 0.4, 0, cowl.belt - 0.06, spec.dashZ - 0.2)];
    for (const x of [-ex, ex]) inner.push(box(0.46, 0.72, 0.12, x, ey - 0.4, ez - 0.32), box(0.24, 0.2, 0.1, x, ey - 0.02, ez - 0.36));
    const seat = { hip: [ex, ey - 0.66, ez - 0.12], floor: s[4].low + 0.1, foot: spec.dashZ - 0.25, wheel: [wx, wy, wz], tilt: 0.32, R: 0.17 };
    return { spec, seat, innerGeo: merge(inner), paintGeo: mergeGeometries(paint), glassGeo: glass, wheelGeo: mergeGeometries(wheels), rimGeo: mergeGeometries(rims), lampGeo: mergeGeometries(lamps), tailGeo: mergeGeometries(tails), fillGeo: mergeGeometries(fill), hw: wF, hl: Math.max(zF, -zR), mass: spec.phys.mass };
  }
  tractor() {
    const body = [box(1, 0.8, 2.3, 0, 1.25, 1), box(1.05, 0.5, 1.4, 0, 0.95, -0.5), box(0.9, 0.14, 0.5, 0, 1.68, 1.5)];
    const cabin = [box(1.45, 0.08, 1.5, 0, 2.75, -0.45), box(1.3, 0.3, 1.3, 0, 1.3, -0.5)];
    for (const [x, z] of [[-0.68, 0.22], [0.68, 0.22], [-0.68, -1.12], [0.68, -1.12]]) cabin.push(box(0.07, 1.4, 0.07, x, 2.05, z));
    const wheels = [wheelGeo(0.82, 0.46).translate(-1, 0.82, -0.75), wheelGeo(0.82, 0.46).translate(1, 0.82, -0.75), wheelGeo(0.48, 0.3).translate(-0.86, 0.48, 1.75), wheelGeo(0.48, 0.3).translate(0.86, 0.48, 1.75)];
    const rims = [wheelGeo(0.44, 0.48).translate(-1, 0.82, -0.75), wheelGeo(0.44, 0.48).translate(1, 0.82, -0.75), wheelGeo(0.25, 0.32).translate(-0.86, 0.48, 1.75), wheelGeo(0.25, 0.32).translate(0.86, 0.48, 1.75)];
    return {
      box: true, seat: { hip: [0, 1.82, -0.72], floor: 1.47, foot: -0.15, wheel: [0, 2.18, -0.2], tilt: 0.75, R: 0.2 }, innerGeo: merge([box(0.5, 0.6, 0.12, 0, 2.05, -0.98)]), cabGeo: merge(body), loadGeo: merge(cabin), glassGeo: merge([box(1.3, 1.25, 0.03, 0, 2.08, 0.2), box(1.34, 1.1, 1.2, 0, 2.08, -0.45)]),
      wheelGeo: mergeGeometries(wheels), rimGeo: mergeGeometries(rims), lampGeo: mergeGeometries([box(0.2, 0.12, 0.03, -0.32, 1.42, 2.17), box(0.2, 0.12, 0.03, 0.32, 1.42, 2.17)]),
      tailGeo: mergeGeometries([box(0.12, 0.12, 0.03, -0.55, 1.2, -1.22), box(0.12, 0.12, 0.03, 0.55, 1.2, -1.22)]), hw: 1.25, hl: 2.2, mass: 6500,
    };
  }
  model(def, color) {
    const g = new THREE.Group(), add = (geo, mat, cast = true) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = cast; g.add(m); return m; };
    let bodyMesh;
    if (def.spec) {
      const key = 'paint' + def.spec.id + color; const mat = this[key] ||= bodyMaterial(color, 0.35, this.env, def.spec, { value: 0.14 }, this.dummyCab);
      bodyMesh = add(def.paintGeo, mat); add(def.fillGeo, this.dark, false);
    } else {
      const mat = this['box' + color] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      bodyMesh = add(def.cabGeo, mat);
      add(def.loadGeo, def === this.tractorDef ? this.dark : (this.load ||= new THREE.MeshStandardMaterial({ color: 0xd9dbd8, roughness: 0.7 })));
    }
    add(def.innerGeo, this.trim, false);
    const glass = add(def.glassGeo, this.glass, false); if (glass) glass.renderOrder = 5;
    add(def.wheelGeo, this.tyre); add(def.rimGeo, this.rim, false);
    add(def.lampGeo, this.front, false); add(def.tailGeo, this.rear, false);
    return { g, bodyMesh };
  }
  newCar(force) {
    let r = Math.random() * this.types.reduce((a, t) => a + t.weight, 0), def = this.types[0];
    for (const t of this.types) { r -= t.weight; if (r <= 0) { def = t; break; } }
    const spec = force || def.civ, car = buildNpcCar(spec, this.env, this), S = spec.stations;
    car.paint.color.setHex(spec.colors[Math.random() * spec.colors.length | 0]);
    this.scene.add(car.g);
    const d = { seat: car.seat, hw: spec.hw ?? S[4].w, hl: spec.hl ?? Math.max(S[S.length - 1].z, -S[0].z), mass: spec.phys.mass, vmax: spec.vmax };
    return { kind: 'car', driver: null, civ: car, spec, kvel: null, parts: car.npcParts, def: d, g: car.g, bodyMesh: car.bodyMesh, mesh: car.g, pos: car.g.position, vel: new THREE.Vector3(), heading: 0, spin: 0, speed: 0, target: 0, hw: d.hw, hl: d.hl, mass: d.mass, crashed: false, smoke: 0 };
  }
  newTractor() {
    const { g, bodyMesh } = this.model(this.tractorDef, [0x2f7a3a, 0xc83a22, 0x2f7a3a][Math.random() * 3 | 0]);
    this.scene.add(g);
    return { kind: 'tractor', driver: null, def: this.tractorDef, g, bodyMesh, pos: g.position, vel: new THREE.Vector3(), heading: 0, spin: 0, speed: 4.6, hw: 1.25, hl: 2.2, mass: 6500, crashed: false, smoke: 0, turn: 0, check: 0, stamp: 0 };
  }
  // a new face behind the wheel every time a vehicle is (re)placed out of sight
  seatDriver(m) {
    m.driver?.dispose();
    const seed = Math.random() * 2 ** 31 | 0;
    const look = makeLook(seed, m.kind === 'tractor' ? { top: Math.random() < 0.6 ? 'overalls' : 'long', hat: ['straw', 'cap', 'none', 'cap'][seed % 4] } : {});
    m.driver = new Driver(look, m.def.seat); m.g.add(m.driver.group);
    m.lastHeading = m.heading; m.turnRate = 0;
    m.style = styleOf(look); m.seed = seed % 1000; m.phoneT = R(4, 14); m.phoneOn = false;
  }
  grad(m, x, z) {
    const e = 0.8, gx = (lineS(x + e, z, m.axis, m.k) - lineS(x - e, z, m.axis, m.k)) / (2 * e), gz = (lineS(x, z + e, m.axis, m.k) - lineS(x, z - e, m.axis, m.k)) / (2 * e);
    return [gx, gz, gx * gx + gz * gz];
  }
  placeCar(m, p) {
    const o = {}; roadAt(p.x, p.z, o);
    m.axis = Math.random() < 0.5 ? 0 : 1;
    m.k = (m.axis ? o.kv : o.ku) + (Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? -1 : 1);
    let x = p.x, z = p.z;
    for (let i = 0; i < 8; i++) { const s = lineS(x, z, m.axis, m.k), [gx, gz, l] = this.grad(m, x, z); x -= gx / l * s; z -= gz / l * s; }
    if (Math.hypot(x - p.x, z - p.z) > 400) return false;
    const walk = (Math.random() < 0.5 ? -1 : 1) * R(270, 420), n = Math.ceil(Math.abs(walk) / 12);
    for (let i = 0; i < n; i++) {
      const [gx, gz, l] = this.grad(m, x, z), L = Math.sqrt(l), sg = Math.sign(walk);
      x += gz / L * sg * 12; z -= gx / L * sg * 12;
      const s = lineS(x, z, m.axis, m.k), [hx, hz, q] = this.grad(m, x, z); x -= hx / q * s; z -= hz / q * s;
    }
    if (Math.hypot(x - p.x, z - p.z) < 200) return false;
    if (mountainAt(x, z) > 0) return false;     // the asphalt ends at the foot of the range
    m.dir = Math.random() < 0.5 ? -1 : 1;
    m.x = x; m.z = z; m.pos.set(x, height(x, z), z);
    if (m.phys) this.sleep(m);
    m.speed = m.target; m.crashed = false; m.spin = 0; m.vel.set(0, 0, 0);
    m.g.rotation.set(0, 0, 0); m.g.visible = true;
    this.seatDriver(m);
    m.target = Math.min(R(17, 25) * m.style.speed, m.def.vmax ?? 99);   // trucks and vans keep it slower, and so does granny
    m.speed = m.target;
    if (m.civ) m.civ.paint.color.setHex(m.civ.spec.colors[Math.random() * m.civ.spec.colors.length | 0]);
    for (const mesh of [m.bodyMesh, ...(m.parts || []).map(p => p.mesh)]) if (mesh.userData.base) { mesh.geometry.dispose(); mesh.geometry = mesh.userData.base; mesh.userData.base = null; }
    for (const p of m.parts || []) { if (p.off) { this.debris = this.debris.filter(d => d.mesh !== p.mesh); m.g.add(p.mesh); p.mesh.position.set(0, 0, 0); p.mesh.rotation.set(0, 0, 0); } p.off = false; p.hp = p.hp0; }
    if (m.civ?.glassMesh) m.civ.glassMesh.visible = true;
    m.glassGone = false; m.dmg = 0;
    m.carried = false; m.job = null; m.wreckT = 0;
    m.st = 'lane'; m.stT = 0; m.blockT = 0; m.noRoom = 0; m.queueT = 0; m.tries = 0; m.wedge = 0; m.honk = 0; m.pb = null;
    return true;
  }
  placeTractor(m, p) {
    for (let i = 0; i < 24; i++) {
      const a = R(0, 6.28), r = R(110, 330), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, s = surface(x, z);
      if (s.kind === KIND.WHEAT || s.kind === KIND.GREEN || s.kind === KIND.STUBBLE || s.kind === KIND.PLOUGH) {
        m.field = s.kind; m.pos.set(x, height(x, z), z); m.heading = 0.31 + (i % 2) * Math.PI / 2 + (i % 4 > 1 ? Math.PI : 0);
        m.crashed = false; m.speed = 4.6; m.turn = 0; m.g.rotation.set(0, 0, 0); this.seatDriver(m); return true;
      }
    }
    return false;
  }
  stepCar(m, dt, player) {
    let { x, z } = m;
    const [gx, gz, l] = this.grad(m, x, z), L = Math.sqrt(l);
    const tx = gz / L * m.dir, tz = -gx / L * m.dir, rx = -tz, rz = tx;      // forward and the driver's right
    const s = lineS(x, z, m.axis, m.k);
    const r = plan(this, m, dt, x, z, tx, tz, this.speedGoal(m, dt, x, z), null);
    const { goal } = this.tow.steer(m, r, x, z, tx, tz, null), want = r.u * m.dir;
    m.speed += Math.max(-9 * dt, Math.min(2.6 * dt, goal - m.speed));
    if (m.speed < 0) m.speed = 0;
    x += tx * m.speed * dt + gx / l * (want - s) * Math.min(1, dt * 2.5);
    z += tz * m.speed * dt + gz / l * (want - s) * Math.min(1, dt * 2.5);
    m.x = x; m.z = z;
    m.heading = Math.atan2(tx, tz);
    m.vel.set(tx * m.speed, 0, tz * m.speed);
    const hl = m.hl * 0.7, hF = height(x + tx * hl, z + tz * hl), hR = height(x - tx * hl, z - tz * hl);
    m.pos.set(x, (hF + hR) / 2, z);
    m.g.rotation.set(-Math.atan2(hF - hR, hl * 2), m.heading, 0, 'YXZ');
  }
  // how fast this driver wants to go on an open road: the limit, the village, their style
  // (what's ahead of them and getting round it is npcdrive.js plan)
  speedGoal(m, dt, x, z) {
    const st = m.style || STYLES.normal;
    m.check -= dt;
    if (!(m.check > 0)) { m.check = 0.8; m.limit = inVillage(x, z) ? Math.min(m.target, st.village ?? 14) : m.target; }
    let goal = m.limit ?? m.target;
    // a learner surges on and off the throttle; someone on the phone drifts off the pace
    if (st.jerky) goal *= 0.82 + 0.18 * Math.sin(this.t * 1.9 + m.seed);
    if (m.phoneOn) goal *= 0.85;
    return goal;
  }
  hearMe(m) { return this.playerPos && m.pos.distanceToSquared(this.playerPos) < 3600; }
  // can you see this car? (re-placing one that gave up waits until you can't)
  seen(m) {
    const p = this.playerPos, d = m.pos.distanceTo(p);
    if (d < 70) return true;
    if (d > 300) return false;
    const c = this.cam; if (!c) return true;
    c.getWorldDirection(fq);
    return fq.dot(tv.copy(m.pos).sub(c.position).normalize()) > 0.45;
  }
  // how far off the middle of the lane this driver wanders (the phone makes it much worse)
  weave(m) { const w = (m.style?.wobble || 0) * (m.phoneOn ? 1.6 : 1); return w ? w * Math.sin(this.t * 0.8 + m.seed) * Math.sin(this.t * 0.31 + m.seed * 2) : 0; }
  // ---- real physics near the player ----
  wake(m) {
    const v = m.veh ||= this.makeVeh(m), sp = m.speed || 0, fx = Math.sin(m.heading), fz = Math.cos(m.heading);
    v.place(m.pos.x, height(m.pos.x, m.pos.z) + m.spec.phys.comY + 0.03, m.pos.z, m.heading);
    v.v.set(fx * sp, 0, fz * sp); v.dead = false; v.engineHP = 100; v.wantsReverse = false;
    for (const w of v.wheels) { w.omega = sp / v.R; w.off = false; w.bent = 0; w.wl = -1e9; w.wd = 0; }
    const p = m.spec.phys; v.gear = 1;   // the gear that fits the speed, not first at 70 km/h
    while (v.gear < p.gears.length && sp / v.R * p.gears[v.gear - 1] * p.final * 9.55 > p.redline * 0.8) v.gear++;
    m.kvel = m.vel; m.vel = v.v; m.phys = true; m.think = 1 + (Math.random() * 4 | 0); m.solT = 0;
    v.solids = this.terrain.nearby(v.pos.x, v.pos.z, 24, v.solids || []);
  }
  makeVeh(m) {
    const v = new Vehicle(m.spec);
    // bumping into another car or into you: both stop being polite
    v.onMover = (o, sp, nw, wp) => {
      if (sp > 2.5) this.hit(m, sp, nw.clone().negate(), wp, o.kind === 'player');   // its own dent, where it was struck
      if (sp > 6 && o.kind === 'car' && o.civ && !o.crashed) this.crash(o, sp);   // (a nudge in a queue isn't a crash)
    };
    v.onImpact = (p, dir, sp, wp, kind) => { if (kind !== 'ground' && sp > 6 && !m.crashed) this.crash(m, sp); };
    return v;
  }
  sleep(m) {
    const v = m.veh; m.phys = false;
    m.vel = m.kvel || new THREE.Vector3(); m.vel.copy(v.v); m.vel.y = 0;
    m.x = v.pos.x; m.z = v.pos.z; m.speed = Math.max(0, v.forwardSpeed); m.spin = v.w.y;
  }
  crash(m, sp) { m.crashed = true; m.smoke = 0; m.lean = R(-0.03, 0.03); this.onCrash?.(m, sp); }
  // the fixed 120 Hz physics step (main.js), for the cars that are awake
  step(dt) {
    for (const m of this.movers) if (m.phys) {
      if (--m.think <= 0) { m.think = 4; this.drivePhys(m, dt * 4); }
      m.veh.step(dt);
    }
  }
  // the driver: hold the lane with pure pursuit on a point ahead on it, keep the speed the manners above
  // allow, slow for bends. Like the race bots, plus a little of the feel a driver has through the seat.
  drivePhys(m, dt) {
    const v = m.veh, inp = v.input, q = v.q, x = v.pos.x, z = v.pos.z;
    const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y), lx0 = 1 - 2 * (q.y * q.y + q.z * q.z), lz0 = 2 * (q.x * q.z - q.w * q.y), upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const spd = v.forwardSpeed;
    if (m.crashed || upY < 0.3) { inp.throttle = 0; inp.brake = 0.5; inp.hand = 1; inp.steer = 0; inp.nitro = 0; v.wantsReverse = false; return; }
    const [gx, gz, l] = this.grad(m, x, z), L = Math.sqrt(l), tx = gz / L * m.dir, tz = -gx / L * m.dir;
    m.speed = Math.max(0, spd);
    const r = this.tow.steer(m, plan(this, m, dt, x, z, tx, tz, this.speedGoal(m, dt, x, z), { fx, fz, spd }), x, z, tx, tz, true);
    if (r.ctl) {
      // a manoeuvre (backing up, turning round): the plan drives the pedals and the wheel itself
      const c = r.ctl; v.wantsReverse = c.rev; inp.throttle = c.throttle; inp.brake = c.brake; inp.steer = c.steer; inp.hand = 0; inp.nitro = 0;
      if ((m.solT -= dt) <= 0) { m.solT = 0.3; v.solids = this.terrain.nearby(x, z, 24, v.solids); }
      return;
    }
    let goal = r.goal;
    // a point on the lane ahead, further the faster we go
    const want = r.u * m.dir, Lk = (m.st === 'pass' ? 4 : 7) + Math.abs(spd) * 0.6;   // (going round something: a sharper line)
    let px = x + tx * Lk, pz = z + tz * Lk;
    for (let i = 0; i < 3; i++) { const s = lineS(px, pz, m.axis, m.k), [hx, hz, ll] = this.grad(m, px, pz); px -= hx / ll * (s - want); pz -= hz / ll * (s - want); }
    const dx = px - x, dz = pz - z, lx = dx * lx0 + dz * lz0, lz = dx * fx + dz * fz, alpha = Math.atan2(lx, lz), ld = Math.hypot(dx, dz);
    const a = m.spec.axle, wb = a.f - a.r, delta = Math.atan2(2 * wb * Math.sin(alpha), Math.max(3, ld)), range = THREE.MathUtils.lerp(0.56, 0.085, Math.sqrt(clamp(Math.abs(spd) / 45, 0, 1)));
    inp.steer = clamp(delta * 1.5 / range, -1, 1); inp.hand = 0; inp.nitro = 0; v.wantsReverse = false;
    // slow for a bend: how far round the point ahead is
    const bend = Math.abs(alpha);
    if (bend > 0.2) goal = Math.min(goal, THREE.MathUtils.lerp(22, 7, clamp((bend - 0.2) / 0.5, 0, 1)));
    const err = goal - spd;
    inp.throttle = err > 0 ? clamp(err / 3 + 0.25, 0, 1) : 0;
    inp.brake = goal < 0.5 ? 1 : err < -0.3 ? clamp(-err / (err < -1.5 ? 2.5 : 5), 0, 1) : 0;
    // what hands and seat catch: bend the path gently onto the line and calm the wobble
    if (spd > 3 && v.onGround !== false) {
      const k = Math.min(1, dt * 1.6), sp = Math.hypot(v.v.x, v.v.z), lim = Math.max(3, ld);
      v.v.x += (dx / lim * sp - v.v.x) * k; v.v.z += (dz / lim * sp - v.v.z) * k;
    }
    const calm = 1 - Math.min(1, dt * 3); v.w.x *= calm; v.w.z *= calm;
    // trees and poles for its own collisions, refreshed now and then
    if ((m.solT -= dt) <= 0) { m.solT = 0.3; v.solids = this.terrain.nearby(x, z, 24, v.solids); }
  }
  // the body and the wheels where the physics has them
  syncPhys(m) {
    const v = m.veh, s = m.spec, c = m.civ;
    m.g.quaternion.copy(v.q);
    m.g.position.copy(fq.set(0, -s.phys.comY, 0).applyQuaternion(v.q)).add(v.pos);
    m.x = m.g.position.x; m.z = m.g.position.z;
    m.heading = Math.atan2(2 * (v.q.x * v.q.z + v.q.w * v.q.y), 1 - 2 * (v.q.x * v.q.x + v.q.y * v.q.y));
    v.wheels.forEach((w, i) => {
      const vis = c.wheels[i];
      vis.steer.position.y = w.m.y + s.phys.comY - w.vis;
      vis.steer.rotation.y = w.front ? v.steer + w.bent : w.bent;
      vis.spinner.rotation.x = w.spin;
    });
  }
  stepTractor(m, dt, player) {
    m.check -= dt;
    const fx = Math.sin(m.heading), fz = Math.cos(m.heading);
    if (m.turn > 0) { const w = Math.PI / 5; m.heading += w * dt * m.turnDir; m.turn -= dt; }
    else if (!(m.check > 0)) {
      m.check = 0.4;
      const s = surface(m.pos.x + fx * 9, m.pos.z + fz * 9);
      if (s.kind !== m.field) { m.turn = 5; m.turnDir = m.turnDir === 1 ? -1 : 1; }
    }
    const blocked = Math.hypot(player.x - m.pos.x, player.z - m.pos.z) < 9;
    m.speed += Math.max(-3 * dt, Math.min(dt, (blocked ? 0 : 4.6) - m.speed));
    m.pos.x += fx * m.speed * dt; m.pos.z += fz * m.speed * dt;
    m.vel.set(fx * m.speed, 0, fz * m.speed);
    const hF = height(m.pos.x + fx * 1.4, m.pos.z + fz * 1.4), hR = height(m.pos.x - fx * 1.4, m.pos.z - fz * 1.4);
    m.pos.y = (hF + hR) / 2; m.g.rotation.set(-Math.atan2(hF - hR, 2.8), m.heading, 0, 'YXZ');
    m.stamp -= dt;
    if (m.stamp <= 0 && m.speed > 1) {
      m.stamp = 0.3;
      this.terrain.stamp(m.pos.x - fx * 1.2, m.pos.z - fz * 1.2, 1.25, 170);
      this.fx.dust(m.pos.x - fx * 2, m.pos.y + 0.2, m.pos.z - fz * 2, 0, 0, 0, [0.6, 0.5, 0.34], 1.8);
    }
    if (Math.random() < dt * 5) this.fx.exhaust(m.pos.x + fx * 0.9, m.pos.y + 2.7, m.pos.z + fz * 0.9, 0, 0);
  }
  stepWreck(m, dt) {
    const sp = Math.hypot(m.vel.x, m.vel.z), drop = Math.min(sp, dt * 7);
    if (sp > 0.01) { m.vel.x -= m.vel.x / sp * drop; m.vel.z -= m.vel.z / sp * drop; }
    m.spin *= 1 - Math.min(1, dt * 1.7);
    m.heading += m.spin * dt;
    m.pos.x += m.vel.x * dt; m.pos.z += m.vel.z * dt; m.x = m.pos.x; m.z = m.pos.z;
    m.pos.y = height(m.pos.x, m.pos.z);
    m.g.rotation.set(0, m.heading, m.lean || 0, 'YXZ');
    m.smoke -= dt;
    if (m.smoke <= 0) { m.smoke = 0.22; const f = m.hl * 0.6, a = m.heading; this.fx.smoke(m.pos.x + Math.sin(a) * f, m.pos.y + 1.1, m.pos.z + Math.cos(a) * f, 0, 0, true, false); }
  }
  // the player hit m: throw it, dent it
  hit(m, speed, normal, worldP, byPlayer = true) {
    if (speed < 2.5) return;
    if (byPlayer && speed > 3) this.react?.start(m);   // angry.js: the driver will have something to say
    const now = performance.now();
    if (now - (m.lastHit || 0) < 120) return;   // one contact, many physics steps: dent it once
    m.lastHit = now;
    if (!m.phys) m.spin += R(-1, 1) * Math.min(4, speed * 0.25);
    if (!m.crashed && (byPlayer || speed > 6)) this.crash(m, speed);   // (two NPCs nudging in a queue or a turn: a dent, not a wreck)
    m.g.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(m.g.matrixWorld).invert(), c = tv.copy(worldP).applyMatrix4(inv);
    const dir = normal.clone().negate().transformDirection(inv); dir.y = 0; dir.normalize();
    // the contact point arrives at the other car's centre line: walk it back out to this body's skin
    const S = m.spec?.stations, hw = m.hw * 0.98, zF = m.spec?.hullZ?.[1] ?? (S ? S[S.length - 1].z : m.hl), zR = m.spec?.hullZ?.[0] ?? (S ? S[0].z : -m.hl);
    // (when this car did the hitting, the point is inside the other one: then the nearest point of this box is the skin)
    if (Math.abs(c.x) < hw && c.z > zR && c.z < zF) {
      let t = 1e9;
      if (Math.abs(dir.x) > 1e-3) t = Math.min(t, ((dir.x > 0 ? -hw : hw) - c.x) / -dir.x);
      if (Math.abs(dir.z) > 1e-3) t = Math.min(t, ((dir.z > 0 ? zR : zF) - c.z) / -dir.z);
      if (t < 1e9 && t > 0) c.addScaledVector(dir, -t);
    } else { c.x = clamp(c.x, -hw, hw); c.z = clamp(c.z, zR, zF); }
    c.y = S ? (S[4].mid + S[4].belt) / 2 : 1;
    const rr = clamp(0.45 + speed * 0.05, 0.4, 1.4), depth = clamp(speed * 0.032, 0.02, 0.42);
    const dent = mesh => {
      if (!mesh.userData.base) { mesh.userData.base = mesh.geometry; mesh.geometry = mesh.geometry.clone(); }
      const g = mesh.geometry, a = g.attributes.position.array, o = mesh.position; let hitAny = false;
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i] + o.x, y = a[i + 1] + o.y, z = a[i + 2] + o.z, d = Math.hypot(x - c.x, (y - c.y) * 0.8, z - c.z);
        if (d >= rr) continue;
        const k = 1 - d / rr, crumple = 0.6 + 0.8 * Math.abs(Math.sin(x * 23.1 + z * 17.3) * Math.cos(y * 19.7 + z * 7.9)), q = depth * k * k * (3 - 2 * k) * crumple;
        a[i] += dir.x * q; a[i + 1] -= q * 0.15; a[i + 2] += dir.z * q; hitAny = true;
      }
      if (hitAny) { g.attributes.position.needsUpdate = true; g.computeVertexNormals(); }
    };
    dent(m.bodyMesh);
    const energy = speed * speed * 0.05;
    m.dmg = (m.dmg || 0) + energy;
    for (const p of m.parts || []) {
      if (p.off) continue;
      dent(p.mesh);
      const dist = p.center.distanceTo(c), reach = rr + 0.9;
      if (dist > reach) continue;
      p.hp -= energy * (1 - dist / reach) * R(0.7, 1.3);
      if (p.hp < 0) this.dropPart(m, p, dir, speed);
    }
    // the side and rear glass gives way to a proper knock
    if (speed > 8 && !m.glassGone && m.civ?.glassMesh) {
      m.glassGone = true; m.civ.glassMesh.visible = false;
      this.fx.glass(tv.copy(c).applyMatrix4(m.g.matrixWorld), m.vel, 60); this.audio.glass?.(0.6);
    }
  }
  // a panel comes off and tumbles away (it lies where it lands until the car is re-placed)
  dropPart(m, p, dir, speed) {
    p.off = true;
    const mesh = p.mesh; m.g.updateMatrixWorld();
    const wp = p.center.clone().applyMatrix4(m.g.matrixWorld), q = new THREE.Quaternion(); m.g.getWorldQuaternion(q);
    // re-centre the panel on its own middle so it spins about it
    mesh.removeFromParent(); this.scene.add(mesh);
    mesh.position.copy(wp); mesh.quaternion.copy(q);
    mesh.geometry.translate(-p.center.x, -p.center.y, -p.center.z); mesh.userData.recentred = p.center.clone();
    const out = dir.clone().negate().transformDirection(m.g.matrixWorld);
    const v = m.vel.clone().addScaledVector(out, 2 + speed * 0.25); v.y = 2 + Math.random() * 3;
    mesh.geometry.computeBoundingSphere();
    (this.debris ||= []).push({ mesh, v, w: new THREE.Vector3(R(-6, 6), R(-6, 6), R(-6, 6)), half: 0.12, t: 0, r: mesh.geometry.boundingSphere.radius * 0.75 });
    this.audio.thud?.(0.3);
  }
  stepDebris(dt) {
    for (const d of this.debris || []) {
      if (d.rest) continue;
      d.t += dt; d.v.y -= 9.81 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      tq.setFromAxisAngle(tv.copy(d.w).normalize(), d.w.length() * dt); d.mesh.quaternion.premultiply(tq);
      const gy = height(d.mesh.position.x, d.mesh.position.z) + d.half;
      if (d.mesh.position.y < gy) {
        d.mesh.position.y = gy; d.v.y = Math.abs(d.v.y) * 0.25; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.5);
        if (d.v.lengthSq() < 0.3 && d.t > 0.6) d.rest = true;
      }
    }
  }
  // the driver turns the wheel with the road and looks into the bend, at you when you're close,
  // and keeps staring after a crash. Only near ones are animated; far ones aren't drawn at all.
  driveDriver(m, dt, d, p) {
    const dr = m.driver; if (!dr) return;
    dr.group.visible = d < 140 && !m.driverOut;   // (the one who got out is walking about: angry.js)
    let dh = m.heading - (m.lastHeading ?? m.heading); dh = Math.atan2(Math.sin(dh), Math.cos(dh)); m.lastHeading = m.heading;
    if (dt > 0) m.turnRate += (dh / dt - m.turnRate) * Math.min(1, dt * 4);
    if (m.style?.name === 'phone' && !m.crashed && (m.phoneT -= dt) <= 0) { m.phoneOn = !m.phoneOn; m.phoneT = m.phoneOn ? R(4, 9) : R(6, 15); }
    if (d > 70) return;
    if (m.civ && !m.phys) {
      const sp = m.crashed ? Math.hypot(m.vel.x, m.vel.z) : m.speed, R = m.civ.spec.wheel.r, a = m.civ.spec.axle;
      const toe = m.crashed ? 0 : Math.atan((a.f - a.r) * m.turnRate / Math.max(3, sp));
      for (const w of m.civ.wheels) { w.spinner.rotation.x += sp / R * dt; if (w.front) w.steer.rotation.y += (toe - w.steer.rotation.y) * Math.min(1, dt * 8); }
    }
    if (m.driverOut || m.react?.state === 'shake') return;   // out of the car, or shaking their head in it (angry.js)
    const steer = m.phys ? -m.veh.steer * 7.5 : m.crashed ? 0 : Math.max(-2.4, Math.min(2.4, -m.turnRate * (m.kind === 'tractor' ? 3 : 6)));
    let at = null;
    if (d < 16 || m.crashed) { m.g.updateMatrixWorld(); at = lv.copy(p).applyMatrix4(inv.copy(m.g.matrixWorld).invert()); }
    dr.update(dt, steer, at, m.phoneOn && !m.crashed);
  }
  setEnv(e) { this.env = e; this.glass.envMap = e; this.front.envMap = e; for (const k in this) if (this[k]?.isMeshPhysicalMaterial) this[k].envMap = e; }
  setNight(n) { this.front.emissiveIntensity = n ? 1.6 : 0; this.rear.emissiveIntensity = n ? 1.4 : 0; }
  update(dt, veh) {
    const p = veh.pos;
    this.t += dt;
    this.playerPos = p;
    this.playerSpeed = Math.abs(veh.forwardSpeed ?? 0);
    // your car, as the awake traffic sees it (shares its velocity, so a shove moves you too)
    const car = this.car;
    if (car) { const me = this.me ||= { kind: 'player', g: { visible: true } }; Object.assign(me, { pos: car.pos, vel: car.v, hw: car.half.x, hl: car.half.z, mass: car.mass, heading: 2 * Math.atan2(car.q.y, car.q.w) }); }
    while (this.movers.filter(m => m.kind === 'car').length < this.count) { const m = this.newCar(); this.movers.push(m); m.fresh = true; }
    while (this.movers.filter(m => m.kind === 'tractor').length < this.farmers) { const m = this.newTractor(); this.movers.push(m); m.fresh = true; }
    this.stepDebris(dt);
    this.tow.update(dt);
    this.react?.update(dt);
    let near = 1e9, rel = 0;
    for (const m of this.movers) {
      const d = m.pos.distanceTo(p);
      // on the tow truck's deck (tow.js moves it), or the tow truck itself (tow.js sends it home)
      if (m.carried) { this.driveDriver(m, dt, d, p); continue; }
      // (a car that drove on to where its road ends below the mountains turns up somewhere else)
      if (m.fresh || (d > FAR && !m.job) || (m.kind === 'car' && !m.crashed && !m.job && (m.mtCheck = (m.mtCheck || 0) + 1) % 30 === 0 && mountainAt(m.pos.x, m.pos.z) > 0)) {
        const ok = m.kind === 'car' ? this.placeCar(m, p) : this.placeTractor(m, p);
        m.g.visible = ok; m.parked = !ok; m.fresh = !ok;
        continue;
      }
      if (m.parked) continue;
      // a driver who gave up (wedged, or the road shut both ways) is put back elsewhere once you can't see it
      if (m.st === 'gone' && !m.crashed && !m.isTow && !this.seen(m)) { m.fresh = true; continue; }
      if (m.civ) {
        if (!m.phys && d < PHYS_IN) this.wake(m);
        else if (m.phys && d > PHYS_OUT) this.sleep(m);
      }
      if (m.phys) {
        m.veh.movers = this.movers.filter(o => o !== m && !o.parked && o.g.visible && !o.carried);
        if (this.me) m.veh.movers.push(this.me);
        this.syncPhys(m);
        if (m.crashed && (m.smoke -= dt) <= 0) { m.smoke = 0.3; const f = m.hl * 0.6, a = m.heading; this.fx.smoke(m.pos.x + Math.sin(a) * f, m.pos.y + 1.1, m.pos.z + Math.cos(a) * f, 0, 0, true, false); }
      }
      else if (m.crashed) this.stepWreck(m, dt);
      else if (m.kind === 'car') this.stepCar(m, dt, p);
      else this.stepTractor(m, dt, p);
      this.driveDriver(m, dt, d, p);
      if (d < near && !m.crashed) { near = d; rel = tv.copy(m.vel).sub(veh.v).length(); }
    }
    // race rivals pass by just as loudly
    for (const b of this.others || []) { const d = b.pos.distanceTo(p); if (d < near) { near = d; rel = tv.copy(b.vel).sub(veh.v).length(); } }
    this.audio.passing?.(near, rel);
  }
}
