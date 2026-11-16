// The tow truck (odtahovka). A wreck that has stood on or beside the road for a while gets fetched
// instead of vanishing: a rollback truck drives up the road (from the side without a queue), stops
// past the wreck, slides its deck back and tips it to the tarmac, winches the wreck up by the nose,
// levels the deck and drives off with it. Only when the truck is out of sight is the wreck put back
// on the road as a fresh car (traffic.js placeCar) and the truck parked for the next call.
import * as THREE from 'three';
import { lineS, height } from './world.js';
import { TOW } from './civil.js';
import { LANE } from './npcdrive.js';

const WAIT = 18;                                   // seconds a wreck stands before the tow is called
const DECK_S = 3.0, DECK_A = 0.29;                 // how far the deck slides back, how far it tips (rad)
const PIV = new THREE.Vector3(0, 1.1, -3.6);       // where it tips: the end of the truck's frame
const DECK_TOP = 1.28, DECK_F = 2.0, DECK_R = -4.4, WINCH = new THREE.Vector3(0, 1.45, DECK_F - 0.35);
const PULL = 1.1, CLIMB = 0.8;                     // winch speed on the road and up the deck, m/s
const smooth = k => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const tv = new THREE.Vector3(), tw = new THREE.Vector3(), tm = new THREE.Matrix4(), tm2 = new THREE.Matrix4(), te = new THREE.Euler();
const NORMAL = { name: 'normal', speed: 1, gap: 1, look: 1, wobble: 0.04 };

export class Tow {
  constructor(T) {
    this.T = T; this.m = null; this.truck = null;
    // the winch cable: a unit cylinder stretched between the drum and the wreck's nose
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 }));
    this.cable.visible = false; T.scene.add(this.cable);
  }
  update(dt) {
    const T = this.T;
    if (!this.m) {
      for (const w of T.movers) {
        if (!w.crashed || !w.civ || w.carried || w.react || w.driverOut || !w.g.visible || w.parked || w.job) continue;
        w.wreckT = (w.wreckT || 0) + dt;
        if (w.wreckT > WAIT && this.dispatch(w)) break;
      }
      return;
    }
    this.step(dt);
  }
  // send the truck out for wreck w
  dispatch(w) {
    const T = this.T, P = T.playerPos;
    if (!P || w.axis == null || w.pos.distanceTo(P) > 320) return false;
    if (Math.abs(lineS(w.pos.x, w.pos.z, w.axis, w.k)) > 9) return false;   // far off in a field: it can stay there
    const L = { axis: w.axis, k: w.k };
    // the two ways in: the one without a queue, then the one further from you (so it doesn't pop up in view)
    let best = null;
    for (const sg of [1, -1]) {
      let x = w.pos.x, z = w.pos.z;
      for (let i = 0; i < 22; i++) {
        const [gx, gz, l] = T.grad(L, x, z), Lq = Math.sqrt(l);
        x += gz / Lq * sg * 12; z -= gx / Lq * sg * 12;
        const s = lineS(x, z, L.axis, L.k), [hx, hz, q] = T.grad(L, x, z); x -= hx / q * s; z -= hz / q * s;
      }
      const dir = -sg, [gx, gz, l] = T.grad(L, w.pos.x, w.pos.z), Lq = Math.sqrt(l), tx = gz / Lq * sg, tz = -gx / Lq * sg;
      let queue = 0;
      for (const o of T.movers) {
        if (o === w || o.crashed || o.kind !== 'car' || o.speed > 5) continue;   // (a queue creeps forward now and then)
        const f = (o.pos.x - w.pos.x) * tx + (o.pos.z - w.pos.z) * tz;
        if (f > 0 && f < 90 && lineS(o.pos.x, o.pos.z, L.axis, L.k) * dir > 0) queue++;
      }
      const score = queue * 1000 - Math.hypot(x - P.x, z - P.z);
      if (!best || score < best.score) best = { score, x, z, dir };
    }
    const m = this.truck ||= T.newCar(TOW);
    m.isTow = true;
    if (m.phys) T.sleep(m);
    const [gx, gz, l] = T.grad(L, best.x, best.z), Lq = Math.sqrt(l);
    m.axis = L.axis; m.k = L.k; m.dir = best.dir;
    m.x = best.x + gx / l * LANE * best.dir; m.z = best.z + gz / l * LANE * best.dir;
    m.pos.set(m.x, height(m.x, m.z), m.z);
    m.heading = Math.atan2(gz / Lq * best.dir, -gx / Lq * best.dir);
    m.g.rotation.set(0, m.heading, 0); m.g.visible = true; m.fresh = false; m.parked = false; m.crashed = false;
    m.vel.set(0, 0, 0); m.spin = 0;
    T.seatDriver(m); m.style = NORMAL; m.target = 15; m.speed = 13;
    m.st = 'lane'; m.stT = 0; m.blockT = 0; m.noRoom = 0; m.queueT = 0; m.tries = 0; m.wedge = 0; m.pb = null;
    m.job = { w, ph: 'drive', t: 0, tt: 0 }; w.job = 'towed';
    if (!T.movers.includes(m)) T.movers.push(m);
    this.m = m; this.setDeck(0);
    return true;
  }
  // the driver's part while on the job (called after the planner): slow near the wreck, stop past it, hold still
  steer(m, r, x, z, tx, tz, phys) {
    const j = m.job; if (!j) return r;
    if (j.ph === 'drive') {
      const w = j.w, f = (w.pos.x - x) * tx + (w.pos.z - z) * tz;
      if (f > 0) j.ahead = true;   // (it has to have come up to the wreck before it can be past it)
      if (f < 45 && r.goal != null) r.goal = Math.min(r.goal, f < 0 ? 4 : 8);
      // its deck end a few metres past the wreck's nose: stop there
      // (back in its own lane first: stopping half way round the wreck would shut the road)
      const u = lineS(x, z, m.axis, m.k) * m.dir;
      if (j.ahead && f < -(3.6 + 2.2 + w.hl) && (Math.abs(u - LANE) < 0.7 || f < -(30 + w.hl))) { j.ph = 'stop'; j.t = 0; }
      return r;
    }
    if (j.ph === 'leave' || j.ph === 'dead') return r;
    // standing still on purpose: not wedged, not given up, not stuck behind anything
    m.wedge = 0; m.tries = 0; m.st = 'lane'; m.blockT = 0; m.noRoom = 0; m.queueT = 0;
    if (phys) return { ctl: { rev: false, throttle: 0, brake: 1, steer: 0 } };
    r.goal = 0; return r;
  }
  // slide (first half) and tip (second half) the deck: k 0 = carried, 1 = down on the road
  setDeck(k) {
    const d = this.m?.civ?.groups?.deck; if (!d) return;
    const s = DECK_S * smooth(k / 0.55), a = -DECK_A * smooth((k - 0.4) / 0.6);
    // slid back by s along the frame, then tipped about the frame's end
    d.matrix.makeTranslation(PIV.x, PIV.y, PIV.z).multiply(tm.makeRotationX(a)).multiply(tm2.makeTranslation(-PIV.x, -PIV.y, -PIV.z - s));
    d.matrixWorldNeedsUpdate = true;
    this.deckK = k;
  }
  // a point on the deck's top (z along it), in the world
  deckAt(z, out) {
    const m = this.m, d = m.civ.groups.deck;
    m.g.updateMatrixWorld();
    return out.set(0, DECK_TOP, z).applyMatrix4(d.matrix).applyMatrix4(m.g.matrixWorld);
  }
  // behind the deck's tail, on the road: z < DECK_R
  groundAt(z, out) {
    const m = this.m, foot = this.deckAt(DECK_R, out), h = m.heading, back = DECK_R - z;
    foot.x -= Math.sin(h) * back; foot.z -= Math.cos(h) * back; foot.y = height(foot.x, foot.z);
    return foot;
  }
  pointAt(z, out) { return z >= DECK_R ? this.deckAt(z, out) : this.groundAt(z, out); }
  // put the wreck between its nose point and its tail point
  poseWreck(w, n, r) {
    const fx = n.x - r.x, fy = n.y - r.y, fz = n.z - r.z, L = Math.hypot(fx, fy, fz) || 1;
    w.pos.set((n.x + r.x) / 2, (n.y + r.y) / 2, (n.z + r.z) / 2);
    w.heading = Math.atan2(fx, fz);
    w.g.quaternion.setFromEuler(te.set(-Math.asin(fy / L), w.heading, 0, 'YXZ'));
    w.x = w.pos.x; w.z = w.pos.z; w.vel.set(0, 0, 0);
  }
  step(dt) {
    const T = this.T, m = this.m, j = m.job, w = j.w;
    j.t += dt; j.tt += dt;
    const lit = j.ph !== 'leave' || j.t < 4;
    if (m.civ.beacon) m.civ.beacon.emissiveIntensity = lit ? (Math.sin(T.t * 11) > 0.2 ? 3.2 : 0.15) : 0;
    const spd = m.phys ? Math.abs(m.veh.forwardSpeed) : m.speed;
    // the truck got hit, or the wreck went somewhere else: give up the job
    if ((m.crashed || m.st === 'gone') && j.ph !== 'dead') { this.drop(w); j.ph = 'dead'; }
    if (j.ph === 'drive' && (!T.movers.includes(w) || !w.crashed || j.tt > 150)) { w.job = null; j.ph = 'leave'; j.empty = true; }
    const n = tv, r = tw;
    switch (j.ph) {
      case 'stop':
        if (spd < 0.2 && j.t > 1) { j.ph = 'tilt'; j.t = 0; }
        break;
      case 'tilt':
        this.setDeck(j.t / 3.5);
        if (j.t > 3.5) {
          j.ph = 'pull'; j.t = 0;
          if (w.phys) T.sleep(w);
          w.carried = 'pull'; w.crashed = true;
          j.nose = w.pos.clone().add(new THREE.Vector3(Math.sin(w.heading), 0, Math.cos(w.heading)).multiplyScalar(w.hl * 0.95));
          j.zq = null;
        }
        break;
      case 'pull': {
        // first along the road to the deck's foot (the tail follows the nose, so it swings in line),
        // then nose first up the deck
        const hl = w.hl * 0.95;
        if (j.zq == null) {
          const tgt = this.groundAt(DECK_R - 0.15, new THREE.Vector3()), dx = tgt.x - j.nose.x, dz = tgt.z - j.nose.z, d = Math.hypot(dx, dz);
          const st = Math.min(d, PULL * dt); j.nose.x += dx / d * st; j.nose.z += dz / d * st;
          j.nose.y = height(j.nose.x, j.nose.z);
          const ox = w.pos.x - j.nose.x, oz = w.pos.z - j.nose.z, od = Math.hypot(ox, oz) || 1;
          r.set(j.nose.x + ox / od * hl * 2, 0, j.nose.z + oz / od * hl * 2); r.y = height(r.x, r.z);
          this.poseWreck(w, n.copy(j.nose), r);
          if (d < 0.12) j.zq = DECK_R - 0.15;
        } else {
          j.zq = Math.min(DECK_F - 0.35, j.zq + CLIMB * dt);
          this.poseWreck(w, this.pointAt(j.zq, n), this.pointAt(j.zq - hl * 2, r));
          if (j.zq >= DECK_F - 0.35) { j.ph = 'level'; j.t = 0; w.carried = 'deck'; }
        }
        this.drawCable(w);
        break;
      }
      case 'level':
        this.setDeck(1 - j.t / 3.5); this.cable.visible = false;
        this.ride(w);
        if (j.t > 3.5) { this.setDeck(0); j.ph = 'leave'; j.t = 0; }
        break;
      case 'leave':
        if (!j.empty) this.ride(w);
        break;
    }
    // done: once the truck is out of sight the wreck comes back as a fresh car and the truck goes home
    const d = m.pos.distanceTo(T.playerPos);
    if ((j.ph === 'leave' || j.ph === 'dead') && (d > 380 || (d > 160 && !T.seen(m)))) this.finish();
  }
  ride(w) { const hl = w.hl * 0.95; this.poseWreck(w, this.pointAt(DECK_F - 0.35, tv), this.pointAt(DECK_F - 0.35 - hl * 2, tw)); }
  drawCable(w) {
    const c = this.cable, a = this.deckAt(WINCH.z, new THREE.Vector3()); a.y += WINCH.y - DECK_TOP;
    const b = tv.set(0, 0.45, w.hl * 0.95).applyQuaternion(w.g.quaternion).add(w.pos);
    const d = tw.copy(b).sub(a), L = d.length();
    c.position.copy(a); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); c.scale.set(1, L, 1);
    c.visible = true;
  }
  drop(w) { if (w.carried) { w.carried = false; w.pos.y = height(w.pos.x, w.pos.z); w.g.quaternion.setFromEuler(te.set(0, w.heading, 0)); } w.job = null; this.cable.visible = false; this.setDeck(0); }
  finish() {
    const T = this.T, m = this.m, w = m.job.w;
    if (m.job.ph !== 'dead' && !m.job.empty) { w.carried = false; w.job = null; w.fresh = true; }
    this.cable.visible = false; this.setDeck(0);
    if (m.phys) T.sleep(m);
    m.job = null; m.g.visible = false; m.crashed = false;
    if (m.civ.beacon) m.civ.beacon.emissiveIntensity = 0;
    T.movers = T.movers.filter(o => o !== m);
    this.m = null;
  }
}
