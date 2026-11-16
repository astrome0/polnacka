// What a driver does after you hit them: by temper (people.js look). Comic, never gory: some stay in
// their seat shaking their head, some get out to phone or take photos, some come over and shout and
// wave, the hot-headed ones bang on your car, and the worst pull you out and slap you about. Drive off
// and they run after you for a bit. Then they walk back, get in and (if the car still goes) drive on.
import * as THREE from 'three';
import { Person } from './people.js';
import { height } from './world.js';

const R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const WALK = 1.5, RUN = 4.4;
const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tq = new THREE.Quaternion();

const LINES = {
  shaken: ['Řidič zůstal sedět a jen kroutí hlavou', 'Řidič se třese a nevystoupí'],
  phone: ['„Haló, policie? Tady mi jeden…“', '„Mami, nebudeš věřit, co se mi stalo…“', '„Jo, fotím si to. Všechno.“', '„Pojišťovna? Mám tu blázna.“'],
  shout: ['„Ty vole, kdo ti dal řidičák?!“', '„Vidíš tu díru?! To zaplatíš!“', '„Jezdíš jak prase!“', '„Máš vůbec oči?!“', '„Tohle bylo nový auto!“'],
  shoutOld: ['„Mladej, to se nedělá!“', '„To řeknu tvý mámě!“', '„Kde máš brejle?!“', '„Za nás se takhle nejezdilo!“'],
  bang: ['„Vylez ven!“', '„Otevři to!“', '„No tak, vylez!“', '„Já vím, že tam jsi!“'],
  drag: ['„Pojď sem!“', '„Teď si to vyřídíme!“'],
  slap: ['Plesk!', 'Au!', '„Tohle sis zasloužil!“', 'Jauvajs!'],
  chase: ['„Stůj! Kam jedeš?!“', '„Ujíždí! Ujíždí!“', '„Já si tě najdu!“'],
  giveUp: ['„…no počkej, já si tvou značku pamatuju!“', 'Řidič to vzdal a funí'],
};

// hooks (main.js): player() → { pos, inCar, veh, eyeX, eyeZ, speed }, bang(worldPoint, normal), dragOut(), slap(dir, hard), say(text)
export class Reactions {
  constructor(traffic, scene, hooks) {
    this.traffic = traffic; this.scene = scene; this.hooks = hooks;
    this.list = [];
  }
  // a car the player crashed into: its driver will do something about it
  start(m) {
    if (!m.driver || m.react || this.list.length >= 2) return;
    const L = m.driver.look, old = L.age === 'old';
    const r = L.temper * 0.75 + (1 - L.calm) * 0.25 + R(-0.12, 0.12) - (old ? 0.18 : 0);
    // (Patrik wants the good stuff more often: roughly drag 37 %, bang 25 %, shout 16 %, phone 12 %, shaken 10 %)
    const kind = r < 0.12 ? 'shaken' : r < 0.24 ? 'phone' : r < 0.36 ? 'shout' : r < 0.55 ? 'bang' : 'drag';
    const a = { m, kind, old, state: 'settle', t: 0, phase: 0, yaw: m.heading, person: null, hits: 0, said: 0, look: L };
    m.react = a; this.list.push(a);
  }
  update(dt) {
    for (const a of this.list) this.step(a, dt);
    this.list = this.list.filter(a => !a.done);
  }
  // ---- the state machine ----
  step(a, dt) {
    const m = a.m, P = this.hooks.player(), H = this.hooks;
    a.t += dt;
    if (m.parked || !m.g.visible || m.pos.distanceTo(P.pos) > 150) return this.finish(a);
    switch (a.state) {
      case 'settle': {   // wait for the car to stop
        const sp = Math.hypot(m.vel.x, m.vel.z);
        if (sp < 0.6 || a.t > 4) {
          if (m.pos.distanceTo(P.pos) > 60) return this.finish(a);
          a.t = 0;
          if (a.kind === 'shaken') { a.state = 'shake'; H.say(pick(LINES.shaken)); }
          else this.getOut(a);
        }
        break;
      }
      case 'shake': {    // stays in the seat, shaking the head
        m.driver.person.turnHead(Math.sin(a.t * 9) * 0.5, 0.2);
        if (a.t > 6) { a.state = 'drive'; a.t = 0; }   // pulls itself together and drives on
        break;
      }
      case 'out': {      // a moment by the door, looking at the damage, then off to what they meant to do
        this.pose(a, 'stand'); this.face(a, P.pos, dt);
        if (a.t > 1.2) { a.t = 0; a.state = a.kind === 'phone' ? 'phone' : 'approach'; if (a.kind === 'phone') H.say(pick(LINES.phone)); }
        break;
      }
      case 'phone': {    // calls someone by the car, then photographs the damage and you
        this.face(a, a.t < 6 ? P.pos : m.pos, dt);
        this.pose(a, a.t < 6 ? 'phone' : 'photo');
        if (a.t > 10) { a.t = 0; a.state = 'return'; }
        break;
      }
      case 'approach': { // walks over to you (or your car); runs if you're getting away
        const tgt = this.target(a, P), d = Math.hypot(tgt.x - a.pos.x, tgt.z - a.pos.z);
        const away = P.speed > 6 && d > 8;   // (a car still rolling from the hit isn't getting away)
        if (away) { a.state = 'chase'; a.t = 0; H.say(pick(LINES.chase)); break; }
        this.walkTo(a, tgt, WALK, dt);
        if (d < 0.5 || a.t > 14) {
          a.t = 0; a.hits = 0;
          // shouters shout; bangers bang on your car (or shout, if you're out of it); the worst open your door, or just slap you
          a.state = a.kind === 'bang' ? (P.inCar ? 'bang' : 'shout') : a.kind === 'drag' ? (P.inCar ? 'door' : 'slap') : 'shout';
          H.say(pick(a.state === 'shout' ? (a.old ? LINES.shoutOld : LINES.shout) : a.state === 'bang' ? LINES.bang : LINES.drag));
        }
        break;
      }
      case 'chase': {    // drive off and they run after you, waving, until they give up
        const d = a.pos.distanceTo(P.pos);
        this.walkTo(a, P.pos, RUN, dt, 'run');
        if (d < 3 && P.speed < 2) { a.state = 'approach'; a.t = 0; break; }
        if (a.t > 7 || d > 35) { H.say(pick(LINES.giveUp)); a.state = 'return'; a.t = 0; }
        break;
      }
      case 'shout': {    // shouts and waves both arms at you
        this.face(a, P.pos, dt); this.pose(a, 'wave');
        if (a.t > 2.6 && a.said < 2) { a.said++; a.t = 0.01; H.say(pick(a.old ? LINES.shoutOld : LINES.shout)); }
        if (a.said >= 2 && a.t > 2.6) { a.state = 'return'; a.t = 0; }
        if (P.speed > 6) { a.state = 'chase'; a.t = 0; H.say(pick(LINES.chase)); }
        break;
      }
      case 'bang': {     // bangs on your car with a fist: thuds, your view shakes, a little dent
        this.face(a, this.carPoint(P, 0), dt);
        const beat = 0.55, k = (a.t % beat) / beat;
        this.pose(a, 'punch', k);
        if (a.t > (a.hits + 1) * beat) { a.hits++; H.bang(this.carPoint(P, 0.1), a.yaw); }
        if (a.hits === 4) H.say(pick(LINES.bang));
        if (a.hits >= 8 || P.speed > 6) { a.state = P.speed > 6 ? 'chase' : 'return'; a.t = 0; }
        break;
      }
      case 'door': {     // opens your door and hauls you out
        this.face(a, P.pos, dt); this.pose(a, 'pull', Math.min(1, a.t / 0.8));
        if (a.t > 0.9) { H.dragOut(a.pos); a.state = 'slap'; a.t = 0; a.hits = 0; }
        if (P.speed > 6) { a.state = 'chase'; a.t = 0; }
        break;
      }
      case 'slap': {     // and slaps you, three times; the third one has you seeing stars
        const d = Math.hypot(P.pos.x - a.pos.x, P.pos.z - a.pos.z);
        if (d > 1.3) { this.walkTo(a, P.pos, d > 6 ? RUN : WALK * 1.4, dt, d > 6 ? 'run' : 'walk'); if (a.t > 8) { a.state = 'return'; a.t = 0; } break; }
        this.face(a, P.pos, dt);
        const beat = 0.75, k = (a.t % beat) / beat;
        this.pose(a, 'slap', k);
        if (a.hits < 3 && a.t > (a.hits + 1) * beat) {
          a.hits++;
          H.slap(tv2.set(P.pos.x - a.pos.x, 0, P.pos.z - a.pos.z).normalize(), a.hits >= 3);
          H.say(pick(LINES.slap));
        }
        if (a.hits >= 3 && a.t > 3 * beat + 0.8) { a.state = 'return'; a.t = 0; }
        break;
      }
      case 'return': {   // back to the car and in
        const door = this.doorPoint(a.m);
        this.walkTo(a, door, WALK, dt);
        if (Math.hypot(door.x - a.pos.x, door.z - a.pos.z) < 0.4 || a.t > 20) this.getIn(a);
        break;
      }
      case 'drive': {    // a breath, then off again if the car still goes
        if (a.t > 2) { if ((m.dmg || 0) < 40) { m.crashed = false; m.speed = 0; } this.finish(a); }
        break;
      }
    }
  }
  // ---- getting in and out ----
  doorPoint(m) {
    const seat = m.def.seat, s = Math.sign(seat.hip[0]) || 1;
    m.g.updateMatrixWorld();
    const p = tv.set(s * (m.hw + 0.45), 0, seat.hip[2]).applyMatrix4(m.g.matrixWorld);
    p.y = height(p.x, p.z);
    return p.clone();
  }
  getOut(a) {
    const m = a.m, p = this.doorPoint(m);
    const per = a.person ||= new Person(m.driver.look);
    this.scene.add(per.group);
    a.pos = per.group.position; a.pos.copy(p);
    a.yaw = m.heading + Math.PI / 2 * (Math.sign(m.def.seat.hip[0]) || 1);
    m.driver.group.visible = false; m.driverOut = true;
    a.state = 'out'; a.t = 0;
    this.pose(a, 'stand');
  }
  getIn(a) {
    const m = a.m;
    if (a.person) { a.person.group.removeFromParent(); }
    m.driver.group.visible = true; m.driverOut = false;
    a.state = 'drive'; a.t = 0;
  }
  finish(a) {
    if (a.person) { a.person.dispose(); a.person = null; }
    if (a.m.driver) { a.m.driver.group.visible = true; a.m.driver.person.turnHead(0, 0); }
    a.m.driverOut = false; a.m.react = null; a.done = true;
  }
  // where to stand: by your driver's door when you're in the car, in front of you when you're on foot
  target(a, P) {
    if (P.inCar) return this.carPoint(P, 0.55);
    return tv2.copy(P.pos).addScaledVector(tv.set(a.pos.x - P.pos.x, 0, a.pos.z - P.pos.z).normalize(), 1.0).clone();
  }
  carPoint(P, out) {
    const v = P.veh, side = Math.sign(P.eyeX) || 1;
    const p = tv.set(side * (v.half.x + out), 0, P.eyeZ).applyQuaternion(v.q).add(v.pos);
    p.y = height(p.x, p.z) + (out < 0.3 ? 1.1 : 0);
    return p.clone();
  }
  walkTo(a, tgt, speed, dt, gait = 'walk') {
    const dx = tgt.x - a.pos.x, dz = tgt.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const st = Math.min(d, speed * dt);
      a.pos.x += dx / d * st; a.pos.z += dz / d * st;
      this.face(a, tgt, dt, 8);
    }
    a.pos.y = height(a.pos.x, a.pos.z);
    a.phase += dt * speed * (gait === 'run' ? 2.2 : 3.4);
    this.pose(a, d > 0.05 ? gait : 'stand');
  }
  face(a, tgt, dt, k = 5) {
    const want = Math.atan2(tgt.x - a.pos.x, tgt.z - a.pos.z);
    let d = want - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.yaw += d * Math.min(1, dt * k);
    if (a.person) a.person.group.rotation.y = a.yaw;
  }
  // ---- body language: the standing pose, then limbs moved for the action ----
  pose(a, what, k = 0) {
    const per = a.person; if (!per) return;
    per.stand();
    const P = per.pts, s = per.s, ph = a.phase, sw = Math.sin(ph), cw = Math.cos(ph);
    if (what === 'walk' || what === 'run') {
      const run = what === 'run', L = run ? 0.42 : 0.26, lift = run ? 0.22 : 0.12;
      for (const [sd, sg] of [['L', 1], ['R', -1]]) {
        const st = Math.sin(ph) * sg, up = Math.max(0, Math.cos(ph) * sg);
        P['kn' + sd].z += st * L * 0.6; P['kn' + sd].y += up * lift;
        P['an' + sd].z += st * L; P['an' + sd].y += up * lift * 1.4; P['toe' + sd].z += st * L; P['toe' + sd].y += up * lift * 1.4;
        P['el' + sd].z -= st * L * 0.5; P['ha' + sd].z -= st * L * 0.9; P['ha' + sd].y += run ? 0.25 : 0.03;
        if (run) { P['el' + sd].y += 0.05; P['ha' + sd].z += 0.1; }
      }
      const bob = Math.abs(cw) * (run ? 0.05 : 0.025);
      for (const n in P) P[n].y += bob;
      if (run && a.state === 'chase') { P.haL.set(per.dims.sh + 0.15, 1.8 * s + sw * 0.1, 0.1); P.elL.set(per.dims.sh + 0.12, 1.55 * s, 0.05); }   // one arm up, shaking a fist
    }
    if (what === 'wave') {   // both arms up, waving
      for (const [sd, sg] of [['L', 1], ['R', -1]]) {
        const w = Math.sin(a.t * 9 + sg) * 0.18;
        P['el' + sd].set(sg * (per.dims.sh + 0.15), 1.55 * s, 0.05); P['ha' + sd].set(sg * (per.dims.sh + 0.12 + w), 1.85 * s, 0.12);
      }
    }
    if (what === 'phone') { P.elR.set(-per.dims.sh - 0.05, 1.2 * s, 0.12); P.haR.set(-0.11, 1.56 * s, 0.03); }
    if (what === 'photo') { for (const [sd, sg] of [['L', 1], ['R', -1]]) { P['el' + sd].set(sg * 0.2, 1.25 * s, 0.22); P['ha' + sd].set(sg * 0.05, 1.42 * s, 0.42); } }
    if (what === 'punch') { const p = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7; P.elR.set(-0.22, 1.32 * s, 0.1 + p * 0.25); P.haR.set(-0.14, 1.42 * s + (1 - p) * 0.1, 0.2 + p * 0.38); }
    if (what === 'pull') { for (const [sd, sg] of [['L', 1], ['R', -1]]) { P['el' + sd].set(sg * 0.22, 1.2 * s, 0.25 - k * 0.15); P['ha' + sd].set(sg * 0.15, 1.15 * s, 0.55 - k * 0.3); } }
    if (what === 'slap') { const p = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75; P.elR.set(-0.3 + p * 0.15, 1.35 * s, 0.05 + p * 0.2); P.haR.set(-0.45 + p * 0.55, 1.5 * s, 0.15 + p * 0.3); }
    per.apply();
    per.turnHead(0, what === 'phone' ? 0.15 : what === 'photo' ? 0.1 : 0);
  }
}
