// The drone: launched from the deck (U), flown from its own camera. It flies in the same air as
// everything else: the day's wind and its gusts (weather.js, stronger with height) and a tornado's
// vortex (tornado.js), which can pull it in, spin it, carry it up and hit it with debris. The
// battery runs out where it runs out and the signal fades with distance, hills, villages, forest
// and fog: it never flies home by itself. Wherever it ends up, a yellow beam marks it until you
// walk or drive up to it, and back in the car it charges (1 % every 5 s, faster with the upgrade).
import * as THREE from 'three';
import { height, ground, waterAt, isForest, inVillage } from './world.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SAVE = 'polnacka-drone';
const PICKUP = 6;                // how close you have to come to pick it up, m
const DRAG = 0.45;               // how hard the air drags it along, 1/s
// levels 0..4 of each upgrade; cost[i] buys level i + 1
export const UPGRADES = {
  bat: { name: 'Baterie', text: 'Delší let na jedno nabití.', vals: [5, 6.5, 8, 10, 12.5], fmt: v => `${String(v).replace('.', ',')} min`, cost: [12000, 28000, 55000, 100000] },
  range: { name: 'Dosah', text: 'Silnější vysílač, signál vydrží dál.', vals: [3, 4, 5.5, 7.5, 10], fmt: v => `${String(v).replace('.', ',')} km`, cost: [9000, 24000, 50000, 95000] },
  motor: { name: 'Motory', text: 'Rychlejší let a víc síly proti větru.', vals: [1, 1.15, 1.3, 1.5, 1.75], fmt: v => `${Math.round(v * 15)} m/s vítr`, cost: [15000, 35000, 65000, 115000] },
  // seconds per 1 % in the car
  charge: { name: 'Nabíjení', text: 'Rychlejší nabíjení v autě.', vals: [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5], fmt: v => `${String(v).replace('.', ',')} s / 1 %`, cost: [9500, 20500, 35000, 68000, 90000, 115000, 140000, 170000, 210000] },
};

const tv = new THREE.Vector3(), tq = new THREE.Quaternion(), te = new THREE.Euler(0, 0, 0, 'YXZ');
const wAir = { x: 0, z: 0, speed: 0, gust: 1, turb: 0, out: 0 }, wTor = { x: 0, y: 0, z: 0, core: 0 };

export class Drone {
  // ctx: weather, tornadoes, terrain, audio, toast(text), air() -> { fog, rain }
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.pos = new THREE.Vector3(); this.v = new THREE.Vector3();
    // packed (in the car), flying, down (lying somewhere, waiting to be picked up)
    this.state = 'packed'; this.view = false;
    this.landing = false; this.dead = false; this.lost = false; this.launchT = 0; this.endT = 0;
    this.yaw = 0; this.pitch = -0.2; this.wantYaw = 0; this.wantPitch = -0.2;
    this.tiltF = 0; this.tiltR = 0; this.spin = 0; this.shake = 0; this.zoom = 1;
    this.battery = 1; this.hp = 1; this.signal = 1; this.load = 0; this.agl = 0; this.dist = 0;
    this.wind = new THREE.Vector3(); this.core = 0;
    this.input = { x: 0, z: 0, y: 0, turbo: false };
    this.solids = []; this.sigT = 0; this.hitT = 0; this.saveT = 0;
    this.cash = 0; this.lv = { bat: 0, range: 0, motor: 0, charge: 0 };
    try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s) { this.cash = s.cash || 0; Object.assign(this.lv, s.lv); this.battery = s.battery ?? 1; } } catch {}
    this.mesh = buildMesh(); this.mesh.visible = false; scene.add(this.mesh);
    // the same beam the races stand on the next gate
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 70, 12, 1, true).translate(0, 35, 0), new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.renderOrder = 3; this.beam.visible = false; scene.add(this.beam);
    // Y while flying: the same beam on the car (or on you), so you can find your way back
    this.homeOn = false; this.pilot = new THREE.Vector3(); this.homeDist = 0;
    this.homeBeam = new THREE.Mesh(this.beam.geometry, this.beam.material);
    this.homeBeam.renderOrder = 3; this.homeBeam.visible = false; scene.add(this.homeBeam);
  }
  get capacity() { return UPGRADES.bat.vals[this.lv.bat] * 60; }
  get range() { return UPGRADES.range.vals[this.lv.range] * 1000; }
  get motor() { return UPGRADES.motor.vals[this.lv.motor]; }
  // seconds for a full charge in the car (1 % every 5 s at first)
  get fullCharge() { return UPGRADES.charge.vals[this.lv.charge] * 100; }
  save() { try { localStorage.setItem(SAVE, JSON.stringify({ cash: Math.round(this.cash), lv: this.lv, battery: this.battery })); } catch {} }
  earn(kc) { this.cash += kc; }
  buy(key) {
    const u = UPGRADES[key], l = this.lv[key];
    if (l >= u.cost.length || this.cash < u.cost[l]) return false;
    this.cash -= u.cost[l]; this.lv[key]++; this.save();
    return true;
  }
  // from the car's roof, or out of your hands on foot; yaw is where you're looking
  launch(at, yaw) {
    this.state = 'flying'; this.view = true; this.landing = false; this.dead = false; this.lost = false;
    this.hp = 1; this.pos.copy(at); this.v.set(0, 2.5, 0); this.launchT = 1.1; this.endT = 0;
    this.yaw = this.wantYaw = yaw; this.pitch = this.wantPitch = -0.15; this.spin = 0; this.zoom = 1;
    this.tiltF = this.tiltR = 0;
  }
  // back to your own eyes: it can't fly home, so it sets down where it is
  release() { this.view = false; if (this.state === 'flying') this.landing = true; }
  land() { if (this.state === 'flying' && !this.lost) this.landing = true; }
  pack() { this.state = 'packed'; this.view = false; this.landing = false; this.dead = false; this.lost = false; this.mesh.visible = false; this.beam.visible = false; this.save(); }
  look(mx, my) {
    // the gimbal turns as far as you push, but the camera only gets there with some weight
    this.wantYaw -= mx * 0.0022 / this.zoom;
    this.wantPitch = clamp(this.wantPitch - my * 0.0022 / this.zoom, -1.5, 1.35);
  }
  zoomBy(f) { this.zoom = clamp(this.zoom * f, 1, 4); }

  update(dt, pilot, controls) {
    const st = this.state;
    this.pilot.copy(pilot);
    this.homeBeam.visible = this.view && this.homeOn;
    if (this.homeBeam.visible) { this.homeBeam.position.set(pilot.x, height(pilot.x, pilot.z), pilot.z); this.homeDist = Math.hypot(this.pos.x - pilot.x, this.pos.z - pilot.z); }
    if (st === 'packed') { this.battery = Math.min(1, this.battery + dt / this.fullCharge); this.mesh.visible = false; this.beam.visible = false; this.saveSoon(dt); return; }
    this.dist = Math.hypot(this.pos.x - pilot.x, this.pos.z - pilot.z);
    if (st === 'down') {
      this.beam.visible = true; this.beam.position.set(this.pos.x, height(this.pos.x, this.pos.z), this.pos.z);
      this.mesh.visible = true;
      if (this.endT > 0) { this.endT -= dt; if (this.endT <= 0) this.view = false; }
      if (!this.view && this.dist < PICKUP && Math.abs(this.pos.y - pilot.y) < 4) { this.pack(); this.ctx.toast('Dron je zpátky v autě'); }
      this.ctx.audio.drone?.(0, 0);
      return;
    }
    // flying
    this.sigT -= dt;
    if (this.sigT <= 0) { this.sigT = 0.1; this.measureSignal(pilot); }
    const sub = Math.ceil(dt / (1 / 90));
    for (let i = 0; i < sub && this.state === 'flying'; i++) this.fly(dt / sub, controls && this.view && !this.lost);
    if (this.state === 'flying') {
      this.battery = Math.max(0, this.battery - dt / this.capacity * (0.75 + 0.65 * this.load));
      if (this.battery <= 0 && !this.dead) { this.dead = true; this.ctx.toast('Baterie je vybitá'); }
      if (this.hp <= 0 && !this.dead) { this.dead = true; this.ctx.toast('Dron to nevydržel'); }
    }
    // seen from outside (you let go of it, it's landing) it carries the beam
    this.mesh.visible = !this.view;
    this.beam.visible = !this.view;
    if (this.beam.visible) this.beam.position.set(this.pos.x, height(this.pos.x, this.pos.z), this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.setFromEuler(te.set(this.tiltF, this.yaw, -this.tiltR));
    for (const r of this.mesh.userData.rotors) r.rotation.y += dt * (this.dead ? 0 : 70);
    const a = this.view ? 0.22 : clamp(1 - this.dist / 120, 0, 1) * 0.5;
    this.ctx.audio.drone?.(this.dead ? 0 : a, 0.6 + this.load * 0.5 + (this.input.turbo ? 0.2 : 0));
    this.saveSoon(dt);
  }
  saveSoon(dt) { this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 3; this.save(); } }

  fly(dt, steer) {
    const p = this.pos, v = this.v, m = this.motor;
    const g = ground(p.x, p.z, p.y);
    this.agl = p.y - g;
    // the wind: the day's at the ground, stronger higher up, and the vortex on top of it
    this.ctx.weather.windAt(p.x, p.z, wAir);
    const lift = 1 + 0.6 * ss(0, 150, this.agl);
    this.ctx.tornadoes.windAt(p.x, p.y, p.z, wTor);
    const W = this.wind.set(wAir.x * lift + wTor.x, wTor.y, wAir.z * lift + wTor.z);
    this.core = wTor.core;
    // what the pilot asks for, in the camera's own directions
    let dx = 0, dz = 0, dy = 0;
    const turbo = this.input.turbo, spd = (turbo ? 21 : 12) * m, climb = (turbo ? 7 : 4.5) * m;
    if (this.launchT > 0) { this.launchT -= dt; dy = 3; }
    else if (this.landing) dy = -Math.min(5, 1.2 + this.agl * 0.12);
    else if (steer) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), ix = this.input.x, iz = this.input.z, l = Math.hypot(ix, iz) || 1;
      dx = (fx * iz + Math.cos(this.yaw) * ix) / Math.max(1, l) * spd; dz = (fz * iz - Math.sin(this.yaw) * ix) / Math.max(1, l) * spd;
      dy = this.input.y * climb;
    }
    // the air drags it along; the motors fight that and the pilot's wish at once, up to what they've got
    const ax = (W.x - v.x) * DRAG, ay = (W.y - v.y) * DRAG, az = (W.z - v.z) * DRAG;
    let cx = 0, cy = 0, cz = 0;
    if (!this.dead) {
      cx = (dx - v.x) * 3.5 - ax; cz = (dz - v.z) * 3.5 - az; cy = (dy - v.y) * 3 - ay;
      // enough thrust to hold against 15 m/s × motor of wind on top of the speed asked for, so turbo
      // really is faster but a hovering drone still drifts in a gale; and at speed some more to turn
      // with, or a fast drone slid sideways through every turn
      const ask = Math.hypot(dx, dz), maxA = DRAG * (15 * m + ask) + 1.5 + 0.6 * ask, ch = Math.hypot(cx, cz);
      this.load = clamp(ch / maxA, 0, 1.4);
      if (ch > maxA) { cx *= maxA / ch; cz *= maxA / ch; }
      cy = clamp(cy, -9, 9 * m);
    } else { cy = -9.81; this.load = 0; }
    v.x += (ax + cx) * dt; v.y += (ay + cy) * dt; v.z += (az + cz) * dt;
    // the body leans into what the motors push; you see some of it through the gimbal
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const k = 1 - Math.exp(-dt * 6);
    this.tiltF += (clamp(-(cx * fx + cz * fz) * 0.05, -0.5, 0.5) - this.tiltF) * k;
    this.tiltR += (clamp((cx * -fz + cz * fx) * 0.05, -0.5, 0.5) - this.tiltR) * k;
    // a vortex: eddies shake it, and once the air round it outruns the motors it starts to turn
    // (the wind itself, not the air against the drone: its own speed on turbo is not a gale)
    const rel = Math.hypot(W.x, W.z), over = ss(10, 30, rel);
    this.shake = clamp(over * 0.8 + this.core * 1.2 + wAir.turb * ss(6, 18, wAir.speed) * 0.35, 0, 2);
    const lim = 15 * m;
    this.spin += ((wTor.core * 5 + ss(lim, lim * 2, rel) * 2.2) - this.spin) * (1 - Math.exp(-dt * 1.5));
    if (this.spin > 0.05) { this.yaw -= this.spin * dt; this.wantYaw -= this.spin * dt; }
    // in the core the rotors can't take it, and boards and branches fly
    if (wTor.core > 0.55) this.hp -= dt * 0.18 * wTor.core;
    const torS = Math.hypot(wTor.x, wTor.z);
    this.hitT -= dt;
    if (torS > 30 && this.hitT <= 0 && Math.random() < (torS - 30) / 12 * dt) {
      this.hitT = 0.6; this.hp -= 0.22 + Math.random() * 0.25; this.shake = 2;
      this.ctx.audio.clang?.(); this.ctx.toast('Zásah troskou!');
      v.x += (Math.random() - 0.5) * 12; v.y += Math.random() * 6; v.z += (Math.random() - 0.5) * 12;
    }
    p.addScaledVector(v, dt);
    // trees, poles, houses
    this.ctx.terrain.nearby(p.x, p.z, 3, this.solids);
    for (const s of this.solids) {
      if (p.y > s.top) continue;
      const ex = p.x - s.x, ez = p.z - s.z, d = Math.hypot(ex, ez), r = s.r + 0.35;
      if (d >= r || d < 1e-4) continue;
      const sp = v.length();
      if (sp > 5 && !this.dead) { this.crash('Dron narazil'); return; }
      p.x += ex / d * (r - d); p.z += ez / d * (r - d);
    }
    // the ground, or water over it
    let floor = ground(p.x, p.z, p.y) + 0.12, wet = false;
    const w = waterAt(p.x, p.z);
    if (w.on && w.edge < 0 && w.lvl > floor) { floor = w.lvl; wet = true; }
    if (p.y < floor) {
      const hit = Math.hypot(v.x, v.y * 1.4, v.z);
      p.y = floor;
      if (wet) { this.crash('Dron spadl do vody'); return; }
      if (this.dead || hit > 6.5) { this.crash(this.dead ? 'Dron spadl' : 'Dron narazil do země'); return; }
      if (this.landing) { this.touchdown(); return; }
      if (v.y < 0) v.y = 0;
      v.x *= 1 - Math.min(1, dt * 6); v.z *= 1 - Math.min(1, dt * 6);
    }
  }
  touchdown() {
    this.v.set(0, 0, 0); this.state = 'down'; this.landing = false; this.tiltF = this.tiltR = 0;
    this.mesh.quaternion.setFromEuler(te.set(0, this.yaw, 0)); this.mesh.position.copy(this.pos);
    this.ctx.toast(this.dist < PICKUP ? 'Dron přistál' : 'Dron přistál, dojdi si pro něj');
    this.view = false;
  }
  crash(why) {
    this.state = 'down'; this.landing = false; this.dead = false; this.v.set(0, 0, 0);
    this.ctx.audio.clang?.(); this.ctx.audio.thud?.(0.4);
    this.ctx.toast(`${why}, dojdi si pro něj`);
    // it lies where it fell, on its side
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.setFromEuler(te.set(0.5 + Math.random() * 0.8, this.yaw, (Math.random() - 0.5) * 1.6));
    // a moment of static before you're back in your own eyes
    if (this.view) this.endT = 1.4;
  }
  // 0..1: the distance against the range, with hills, villages and trees in the way, and fog
  measureSignal(pilot) {
    const p = this.pos, ay = pilot.y + 1.6, R = this.range, N = 12;
    let block = 0;
    for (let i = 1; i < N; i++) {
      const t = i / N, x = pilot.x + (p.x - pilot.x) * t, z = pilot.z + (p.z - pilot.z) * t, y = ay + (p.y - ay) * t, h = height(x, z);
      if (y < h) block += 1;
      else if (y < h + 20 && isForest(x, z)) block += 0.35;
      else if (y < h + 12 && inVillage(x, z)) block += 0.5;
    }
    const air = this.ctx.air(), d = Math.hypot(p.x - pilot.x, p.y - ay, p.z - pilot.z);
    const eff = d * (1 + 0.7 * air.fog + 0.15 * air.rain) * (1 + block * 0.4);
    this.signal = 1 - ss(0.65 * R, R, eff);
    // hysteresis, so it doesn't flicker on the edge
    if (!this.lost && this.signal < 0.05) { this.lost = true; this.ctx.toast('Signál ztracen'); }
    else if (this.lost && this.signal > 0.12) { this.lost = false; this.ctx.toast('Signál zpět'); }
  }
  // the drone's camera: heavy on the turn, some of the body's lean and all of its shaking
  camera(cam, dt) {
    const ky = 1 - Math.exp(-dt * 3.2), kp = 1 - Math.exp(-dt * 3.5);
    // (no wrapping: after a fast flick past half a turn it must keep turning the way you pushed)
    this.yaw += (this.wantYaw - this.yaw) * ky; this.pitch += (this.wantPitch - this.pitch) * kp;
    const sh = this.shake * 0.012 * (this.state === 'flying' ? 1 : 0);
    cam.position.copy(this.pos); cam.position.y -= 0.12;
    // the gimbal keeps the horizon nearly level: only a hint of the body's lean shows
    te.set(this.pitch + this.tiltF * 0.1 + (Math.random() - 0.5) * sh, this.yaw + (Math.random() - 0.5) * sh, -this.tiltR * 0.08 + (Math.random() - 0.5) * sh * 1.5);
    cam.quaternion.setFromEuler(te);
    const fov = 78 / this.zoom;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.near = 0.1; cam.updateProjectionMatrix(); }
  }
}

// a small quadcopter: dark body, gold stripe, four arms and blurred props
function buildMesh() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.45, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc24a, roughness: 0.4, emissive: 0x332000 });
  const prop = new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), dark); g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.015, 0.2), gold); stripe.position.y = 0.035; g.add(stripe);
  const camB = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), dark); camB.position.set(0, -0.05, -0.13); g.add(camB);
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.26), dark);
    arm.position.set(sx * 0.12, 0, sz * 0.12); arm.rotation.y = Math.atan2(sx, sz); g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), dark); motor.position.set(sx * 0.21, 0.02, sz * 0.21); g.add(motor);
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18).rotateX(-Math.PI / 2), prop); r.position.set(sx * 0.21, 0.045, sz * 0.21); g.add(r); rotors.push(r);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: sz < 0 ? 0xff3020 : 0x30ff60 })); led.position.set(sx * 0.21, -0.02, sz * 0.21); g.add(led);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.rotors = rotors;
  return g;
}
