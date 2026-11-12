// Life on the map: cars keeping to their lane on the asphalt and tractors working the fields.
// Both are kinematic until something hits them; after that they are wrecks that skid to a stop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARS, buildPanels, bodyMaterial } from './cars.js';
import { height, surface, roadAt, lineS, inVillage, KIND } from './world.js';

const R = (a, b) => a + Math.random() * (b - a);
const LANE = 2.1, FAR = 470;
const tv = new THREE.Vector3();
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
    this.glass = new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: 0.08, metalness: 0.4, envMap: env, envMapIntensity: 1.2 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.8 });
    this.front = new THREE.MeshBasicMaterial({ color: 0xc8ccd0 });
    this.rear = new THREE.MeshBasicMaterial({ color: 0x6a0a08 });
    this.dummyCab = { uCabInv: { value: new THREE.Matrix4() }, uSunLocal: { value: new THREE.Vector3(0, 1, 0) }, uSunVis: { value: 0 } };
    this.types = [this.lofted(CARS[0]), this.lofted(CARS[0]), this.lofted(CARS[1]), this.truck(), this.van()];
    this.tractorDef = this.tractor();
    this.t = 0;
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
    const fill = [box(wF * 1.7, s[4].belt - s[4].low, zF - zR - 0.5, 0, (s[4].belt + s[4].low) / 2, (zF + zR) / 2)];
    return { spec, paintGeo: mergeGeometries(paint), glassGeo: glass, wheelGeo: mergeGeometries(wheels), rimGeo: mergeGeometries(rims), lampGeo: mergeGeometries(lamps), tailGeo: mergeGeometries(tails), fillGeo: mergeGeometries(fill), hw: wF, hl: Math.max(zF, -zR), mass: spec.phys.mass };
  }
  truck() {
    const cab = [box(2.3, 1.9, 2, 0, 1.75, 3), box(2.3, 0.5, 2.1, 0, 0.82, 3)];
    const load = [box(2.4, 2.5, 6.2, 0, 2.15, -1.2)];
    const wheels = [], rims = [];
    for (const z of [3, -2, -3.1]) for (const x of [-1.05, 1.05]) { wheels.push(wheelGeo(0.5, 0.4).translate(x, 0.5, z)); rims.push(wheelGeo(0.3, 0.42).translate(x, 0.5, z)); }
    return { box: true, cabGeo: merge(cab), loadGeo: merge(load), glassGeo: merge([box(2.2, 0.8, 0.05, 0, 2.15, 4.02), box(2.34, 0.6, 1, 0, 2.2, 3.2)]), wheelGeo: mergeGeometries(wheels), rimGeo: mergeGeometries(rims), lampGeo: mergeGeometries([box(0.3, 0.14, 0.03, -0.9, 0.9, 4.06), box(0.3, 0.14, 0.03, 0.9, 0.9, 4.06)]), tailGeo: mergeGeometries([box(0.3, 0.14, 0.03, -0.95, 0.95, -4.33), box(0.3, 0.14, 0.03, 0.95, 0.95, -4.33)]), hw: 1.2, hl: 4.3, mass: 11000 };
  }
  van() {
    const cab = [box(1.9, 1.75, 3.6, 0, 1.45, -0.5), box(1.9, 1, 1.3, 0, 1.0, 1.9)];
    const wheels = [], rims = [];
    for (const z of [1.6, -1.6]) for (const x of [-0.86, 0.86]) { wheels.push(wheelGeo(0.36, 0.24).translate(x, 0.36, z)); rims.push(wheelGeo(0.22, 0.26).translate(x, 0.36, z)); }
    return { box: true, cabGeo: merge(cab), loadGeo: null, glassGeo: merge([box(1.8, 0.6, 0.05, 0, 1.85, 1.3), box(1.94, 0.55, 1, 0, 1.9, 0.75)]), wheelGeo: mergeGeometries(wheels), rimGeo: mergeGeometries(rims), lampGeo: mergeGeometries([box(0.28, 0.13, 0.03, -0.72, 1.1, 2.56), box(0.28, 0.13, 0.03, 0.72, 1.1, 2.56)]), tailGeo: mergeGeometries([box(0.14, 0.4, 0.03, -0.8, 1.2, -2.32), box(0.14, 0.4, 0.03, 0.8, 1.2, -2.32)]), hw: 0.96, hl: 2.5, mass: 2400 };
  }
  tractor() {
    const body = [box(1, 0.8, 2.3, 0, 1.25, 1), box(1.05, 0.5, 1.4, 0, 0.95, -0.5), box(0.9, 0.14, 0.5, 0, 1.68, 1.5)];
    const cabin = [box(1.45, 0.08, 1.5, 0, 2.75, -0.45), box(1.3, 0.3, 1.3, 0, 1.3, -0.5)];
    for (const [x, z] of [[-0.68, 0.22], [0.68, 0.22], [-0.68, -1.12], [0.68, -1.12]]) cabin.push(box(0.07, 1.4, 0.07, x, 2.05, z));
    const wheels = [wheelGeo(0.82, 0.46).translate(-1, 0.82, -0.75), wheelGeo(0.82, 0.46).translate(1, 0.82, -0.75), wheelGeo(0.48, 0.3).translate(-0.86, 0.48, 1.75), wheelGeo(0.48, 0.3).translate(0.86, 0.48, 1.75)];
    const rims = [wheelGeo(0.44, 0.48).translate(-1, 0.82, -0.75), wheelGeo(0.44, 0.48).translate(1, 0.82, -0.75), wheelGeo(0.25, 0.32).translate(-0.86, 0.48, 1.75), wheelGeo(0.25, 0.32).translate(0.86, 0.48, 1.75)];
    return {
      box: true, cabGeo: merge(body), loadGeo: merge(cabin), glassGeo: merge([box(1.3, 1.25, 0.03, 0, 2.08, 0.2), box(1.34, 1.1, 1.2, 0, 2.08, -0.45)]),
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
    add(def.glassGeo, this.glass, false); add(def.wheelGeo, this.tyre); add(def.rimGeo, this.rim, false);
    add(def.lampGeo, this.front, false); add(def.tailGeo, this.rear, false);
    return { g, bodyMesh };
  }
  newCar() {
    const def = this.types[Math.random() * this.types.length | 0];
    const color = def === this.types[3] ? [0x24497a, 0xa82a22, 0x2e6b48][Math.random() * 3 | 0] : def === this.types[4] ? [0xe8e8e4, 0xd6d9dc, 0x2c5a90][Math.random() * 3 | 0]
      : [0xbfc3c8, 0x1f2c44, 0x7c1c1c, 0xe6e6e2, 0x2f3338, 0x38604a, 0xa58a5a][Math.random() * 7 | 0];
    const { g, bodyMesh } = this.model(def, color);
    this.scene.add(g);
    return { kind: 'car', def, g, bodyMesh, mesh: g, pos: g.position, vel: new THREE.Vector3(), heading: 0, spin: 0, speed: 0, target: 0, hw: def.hw, hl: def.hl, mass: def.mass, crashed: false, smoke: 0 };
  }
  newTractor() {
    const { g, bodyMesh } = this.model(this.tractorDef, [0x2f7a3a, 0xc83a22, 0x2f7a3a][Math.random() * 3 | 0]);
    this.scene.add(g);
    return { kind: 'tractor', def: this.tractorDef, g, bodyMesh, pos: g.position, vel: new THREE.Vector3(), heading: 0, spin: 0, speed: 4.6, hw: 1.25, hl: 2.2, mass: 6500, crashed: false, smoke: 0, turn: 0, check: 0, stamp: 0 };
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
    m.dir = Math.random() < 0.5 ? -1 : 1;
    m.x = x; m.z = z; m.pos.set(x, height(x, z), z);
    m.target = R(17, 25); m.speed = m.target; m.crashed = false; m.spin = 0; m.vel.set(0, 0, 0);
    m.g.rotation.set(0, 0, 0); m.g.visible = true;
    if (m.bodyMesh.userData.base) { m.bodyMesh.geometry.dispose(); m.bodyMesh.geometry = m.bodyMesh.userData.base; m.bodyMesh.userData.base = null; }
    return true;
  }
  placeTractor(m, p) {
    for (let i = 0; i < 24; i++) {
      const a = R(0, 6.28), r = R(110, 330), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, s = surface(x, z);
      if (s.kind === KIND.WHEAT || s.kind === KIND.GREEN || s.kind === KIND.STUBBLE || s.kind === KIND.PLOUGH) {
        m.field = s.kind; m.pos.set(x, height(x, z), z); m.heading = 0.31 + (i % 2) * Math.PI / 2 + (i % 4 > 1 ? Math.PI : 0);
        m.crashed = false; m.speed = 4.6; m.turn = 0; m.g.rotation.set(0, 0, 0); return true;
      }
    }
    return false;
  }
  stepCar(m, dt, player) {
    let { x, z } = m;
    const [gx, gz, l] = this.grad(m, x, z), L = Math.sqrt(l);
    const tx = gz / L * m.dir, tz = -gx / L * m.dir, rx = -tz, rz = tx;      // forward and the driver's right
    const s = lineS(x, z, m.axis, m.k);
    m.check -= dt;
    if (!(m.check > 0)) { m.check = 0.8; m.limit = inVillage(x, z) ? Math.min(m.target, 14) : m.target; }
    let goal = m.limit ?? m.target;
    // keep a gap to whoever is ahead in this lane, the player included
    const look = 12 + m.speed * 1.2;
    const gap = (o, v) => {
      const dx = o.x - x, dz = o.z - z, f = dx * tx + dz * tz, side = Math.abs(dx * rx + dz * rz);
      if (f > 0 && f < look && side < 2.4) { goal = Math.min(goal, v * 0.9 + Math.max(0, f - 10) * 0.35); if (o === player && f < 18 && m.speed > 7 && !m.honk) { m.honk = 2.5; this.audio.beep?.(); } }
    };
    for (const o of this.movers) if (o !== m && o.pos.distanceToSquared(m.pos) < 3600) gap(o.pos, o.crashed ? 0 : o.speed ?? 0);
    gap(player, this.playerSpeed);
    if (this.parked) gap(this.parked, 0);   // the car you got out of still blocks the lane
    m.honk = Math.max(0, (m.honk || 0) - dt);
    // stuck behind something that isn't moving: pull out and go round it
    m.stuck = goal < 3 && m.speed < 3 ? (m.stuck || 0) + dt : 0;
    if (m.stuck > 2.5) { m.pass = 7; m.stuck = 0; }
    m.pass = Math.max(0, (m.pass || 0) - dt);
    m.swing = (m.swing || 0) + ((m.pass > 0 ? 1 : 0) - (m.swing || 0)) * Math.min(1, dt * 1.1);
    if (m.pass > 0) goal = Math.max(goal, 7);
    const want = LANE * (1 - 2 * m.swing) * (rx * gx + rz * gz) / L;
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
  hit(m, speed, normal, worldP) {
    if (speed < 2.5) return;
    m.spin += R(-1, 1) * Math.min(4, speed * 0.25);
    if (!m.crashed) { m.crashed = true; m.smoke = 0; m.lean = R(-0.03, 0.03); this.onCrash?.(m, speed); }
    const mesh = m.bodyMesh, inv = new THREE.Matrix4().copy(m.g.matrixWorld).invert();
    if (!mesh.userData.base) { mesh.userData.base = mesh.geometry; mesh.geometry = mesh.geometry.clone(); }
    const g = mesh.geometry, a = g.attributes.position.array, c = tv.copy(worldP).applyMatrix4(inv), rr = Math.min(1.5, 0.5 + speed * 0.05), depth = Math.min(0.5, speed * 0.03);
    const dir = normal.clone().negate().transformDirection(inv);
    for (let i = 0; i < a.length; i += 3) {
      const d = Math.hypot(a[i] - c.x, a[i + 1] - c.y, a[i + 2] - c.z);
      if (d < rr) { const t = 1 - d / rr, q = depth * t * t; a[i] += dir.x * q; a[i + 1] += dir.y * q; a[i + 2] += dir.z * q; }
    }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
  }
  setEnv(e) { this.env = e; this.glass.envMap = e; for (const k in this) if (this[k]?.isMeshPhysicalMaterial) this[k].envMap = e; }
  setNight(n) { this.front.color.set(n ? 0xfff0d0 : 0xc8ccd0); this.rear.color.set(n ? 0xff2010 : 0x6a0a08); }
  update(dt, veh) {
    const p = veh.pos;
    this.playerSpeed = Math.abs(veh.forwardSpeed);
    while (this.movers.filter(m => m.kind === 'car').length < this.count) { const m = this.newCar(); this.movers.push(m); m.fresh = true; }
    while (this.movers.filter(m => m.kind === 'tractor').length < this.farmers) { const m = this.newTractor(); this.movers.push(m); m.fresh = true; }
    let near = 1e9, rel = 0;
    for (const m of this.movers) {
      const d = m.pos.distanceTo(p);
      if (m.fresh || d > FAR) {
        const ok = m.kind === 'car' ? this.placeCar(m, p) : this.placeTractor(m, p);
        m.g.visible = ok; m.parked = !ok; m.fresh = !ok;
        continue;
      }
      if (m.parked) continue;
      if (m.crashed) this.stepWreck(m, dt);
      else if (m.kind === 'car') this.stepCar(m, dt, p);
      else this.stepTractor(m, dt, p);
      if (d < near && !m.crashed) { near = d; rel = tv.copy(m.vel).sub(veh.v).length(); }
    }
    // race rivals pass by just as loudly
    for (const b of this.others || []) { const d = b.pos.distanceTo(p); if (d < near) { near = d; rel = tv.copy(b.vel).sub(veh.v).length(); } }
    this.audio.passing?.(near, rel);
  }
}
