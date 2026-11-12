import * as THREE from 'three';
import { ground, waterAt, surface, KIND } from './world.js';
import { WEATHER } from './physics.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const EYE = 1.66, R = 0.3, WALK = 2.4, RUN = 6;
// where the feet float when the water is deeper than this: head and shoulders out
const SWIM = 1.32;
const STEP_SOUND = { [KIND.PATH]: [2100, 'bandpass', 0.2], [KIND.ROAD]: [900, 'bandpass', 0.11], [KIND.PANEL]: [900, 'bandpass', 0.11], [KIND.PLOUGH]: [240, 'lowpass', 0.3], [KIND.FOREST]: [520, 'lowpass', 0.22] };
const tv = new THREE.Vector3(), tq = new THREE.Quaternion(), IDENT = new THREE.Quaternion(), vw = { x: 0, y: 0, z: 0, core: 0 };

// The driver out of the car: a capsule that walks over the same ground the wheels read.
export class Walker {
  constructor() {
    this.pos = new THREE.Vector3();     // feet
    this.v = new THREE.Vector3();       // traffic reads this like a car's
    this.forwardSpeed = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = true; this.depth = 0;
    this.bob = 0; this.stride = 0; this.printAt = 0;
    // a tornado's wind took you off your feet: how long you're still at its mercy, and how the view tumbles
    this.blown = 0; this.roll = 0; this.spin = new THREE.Vector3(); this.tumble = new THREE.Quaternion();
    this.onLand = null;   // (speed) when you hit the ground hard
  }
  // stand beside the driver's door, or the other one when that side is blocked
  place(veh, eyeX, solids) {
    const right = tv.set(1, 0, 0).applyQuaternion(veh.q); right.y = 0; right.normalize();
    const side = Math.sign(eyeX) || 1;
    for (const s of [side, -side]) {
      const d = veh.half.x + R + 0.25;
      const x = veh.pos.x + right.x * d * s, z = veh.pos.z + right.z * d * s;
      if (s === -side || !solids.some(o => Math.hypot(o.x - x, o.z - z) < o.r + R)) {
        this.pos.set(x, ground(x, z, veh.pos.y + 1), z);
        break;
      }
    }
    this.v.set(0, 0, 0); this.onGround = true; this.stride = 0;
  }
  // input: fwd and side in -1..1, run and jump as booleans
  step(dt, input, solids, veh, g, sound) {
    const p = this.pos;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let mx = fx * input.fwd + fz * -input.side, mz = fz * input.fwd - fx * -input.side;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    // wading slows you, swimming more
    const w = waterAt(p.x, p.z), gh = ground(p.x, p.z, p.y + 0.5);
    this.depth = w.on && w.edge < 0.5 ? Math.max(0, w.lvl - gh) : 0;
    const swim = this.depth > SWIM;
    let speed = (input.run && !swim ? RUN : WALK) * (swim ? 0.55 : 1 - Math.min(0.55, this.depth * 0.6));
    const k = this.onGround || swim ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 1.2);
    // a strong gust shoves you along with it
    const W = WEATHER.wind, ws = Math.hypot(W.x, W.z), shove = ws > 8 ? (ws - 8) * 0.13 / ws : 0;
    // A tornado's wind: drag on a body (about 0.9 m² of it standing, 75 kg). Once it pushes harder
    // than your feet can hold, you're off them and it has you: no walking, it carries you round and
    // up till you fall out of it.
    let ax = 0, ay = 0, az = 0;
    if (WEATHER.vortex) {
      const a = WEATHER.vortex.windAt(p.x, p.y + 0.9, p.z, vw), rx = a.x + W.x - this.v.x, ry = a.y - this.v.y, rz = a.z + W.z - this.v.z, rl = Math.hypot(rx, ry, rz);
      const c = 0.5 * 1.2 * 1.0 * 0.9 / 75 * rl;
      ax = rx * c; ay = ry * c; az = rz * c;
      if (Math.hypot(ax, az) > 4.5 || ay > g * 0.7) this.blown = Math.max(this.blown, 1.2);
      // eddies spin you about
      if (this.blown > 0) this.spin.addScaledVector(tv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), rl * 0.05 * (0.3 + a.core) * (this.onGround ? 0.25 : 1) * dt * 60);
    }
    this.blown = Math.max(0, this.blown - dt);
    const thrown = this.blown > 0 && !swim;
    if (thrown) {
      this.v.x += ax * dt; this.v.y += ay * dt - g * dt; this.v.z += az * dt;
      // rolling and sliding over the ground, not walking
      if (this.onGround) { const f = Math.max(0, 1 - dt * 3); this.v.x *= f; this.v.z *= f; }
    } else {
      this.v.x += (mx * speed + W.x * shove - this.v.x) * k + ax * dt * 0.5;
      this.v.z += (mz * speed + W.z * shove - this.v.z) * k + az * dt * 0.5;
    }
    // the view tumbles while you're thrown about and comes upright when you're down
    const sp = this.spin.length();
    if (sp > 1e-4) this.tumble.premultiply(tq.setFromAxisAngle(tv.copy(this.spin).divideScalar(sp), sp * dt));
    this.spin.multiplyScalar(Math.max(0, 1 - dt * (this.onGround ? 4 : 0.6)));
    if (!thrown) this.tumble.slerp(IDENT, Math.min(1, dt * 2.5));
    if (swim) {
      this.v.x += w.fx * w.sp * 0.4 * dt; this.v.z += w.fz * w.sp * 0.4 * dt;
      const float = w.lvl - SWIM;
      this.v.y += (float - p.y) * dt * 6 - this.v.y * dt * 3;
      this.onGround = false;
    } else if (!thrown) {
      this.v.y -= g * dt;
      if (input.jump && this.onGround) { this.v.y = g < 5 ? 3.2 : 4.6; this.onGround = false; }
    }
    p.addScaledVector(this.v, dt);
    // trees, posts, houses: push out sideways, unless you're above them
    for (const s of solids) {
      if (p.y > s.top) continue;
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), r = s.r + R;
      if (d < r && d > 1e-4) { p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
    }
    this.pushOutOfCar(veh);
    const h = ground(p.x, p.z, p.y + 0.5);
    if (p.y <= h) {
      if (!this.onGround && this.v.y < -6) sound?.(0.3, 160, 'lowpass', Math.min(0.5, -this.v.y * 0.04));
      // (thrown sideways into the ground hurts as much as falling onto it)
      const hit = Math.hypot(this.v.x, this.v.y, this.v.z);
      if (!this.onGround && this.v.y < -3 && hit > 12) this.onLand?.(hit);
      p.y = h; if (this.v.y < 0) this.v.y = 0;
      this.onGround = !swim;
    } else if (!swim && p.y - h < 0.25 && this.v.y <= 0) { p.y = h; this.v.y = 0; this.onGround = true; }   // follow the ground down a slope
    else if (!swim) this.onGround = false;
    this.forwardSpeed = Math.hypot(this.v.x, this.v.z);
    // the head bobs with the stride, and every stride is a step you hear
    const moving = this.onGround ? this.forwardSpeed : 0;
    if (moving > 0.3) {
      const before = this.stride;
      this.stride += moving * dt / (moving > 3 ? 1.6 : 1.3);
      if (Math.floor(before * 2) !== Math.floor(this.stride * 2)) this.footstep(sound);
    }
    this.bob += ((moving > 0.3 ? 1 : 0) - this.bob) * Math.min(1, dt * 6);
  }
  footstep(sound) {
    if (!sound) return;
    const s = surface(this.pos.x, this.pos.z), run = this.forwardSpeed > 3;
    if (this.depth > 0.05) { sound(0.22, 700, 'lowpass', 0.22 + Math.min(0.3, this.depth * 0.3)); return; }
    const [f, type, gain] = STEP_SOUND[s.kind] || (s.crop > 0.5 ? [3200, 'highpass', 0.14] : [1300, 'bandpass', 0.12]);
    sound(run ? 0.07 : 0.09, f * (0.85 + Math.random() * 0.3), type, gain * (run ? 1.4 : 1), 1.2);
  }
  // the car is a box you walk round
  pushOutOfCar(veh) {
    const p = this.pos, h = veh.half;
    if (p.y > veh.pos.y + h.yTop) return;
    tq.copy(veh.q).invert();
    const l = tv.copy(p).sub(veh.pos).applyQuaternion(tq);
    const x0 = -h.x - R, x1 = h.x + R, z0 = h.zR - R, z1 = h.zF + R;
    if (l.x <= x0 || l.x >= x1 || l.z <= z0 || l.z >= z1) return;
    const out = [l.x - x0, x1 - l.x, l.z - z0, z1 - l.z], m = Math.min(...out);
    if (m === out[0]) l.x = x0; else if (m === out[1]) l.x = x1; else if (m === out[2]) l.z = z0; else l.z = z1;
    const y = p.y;
    p.copy(l.applyQuaternion(veh.q)).add(veh.pos); p.y = y;
  }
  eye(out) {
    const b = this.bob * Math.sin(this.stride * Math.PI * 2) * (this.forwardSpeed > 3 ? 0.045 : 0.028);
    return out.set(this.pos.x, this.pos.y + EYE + Math.abs(b), this.pos.z);
  }
  // how far from the driver's door, for the "get in" prompt
  doorDist(veh) {
    tq.copy(veh.q).invert();
    const l = tv.copy(this.pos).sub(veh.pos).applyQuaternion(tq);
    const dx = Math.max(0, Math.abs(l.x) - veh.half.x), dz = Math.max(0, l.z - veh.half.zF, veh.half.zR - l.z);
    return Math.hypot(dx, dz);
  }
}
