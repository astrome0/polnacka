// One rigid body on four raycast wheels over the analytic ground. Runs at a fixed 120 Hz.
import * as THREE from 'three';
import { ground, normal, surface, waterAt, KIND, noise } from './world.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const nrm = new THREE.Vector3(), rel = new THREE.Vector3(), iq = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// how wet the land is, 0 to 1, and the wind in m/s: set by the weather in main.js, read here so every car on the map feels it
// ice is hail lying on the ground: the stones roll under a tyre like ball bearings
// vortex: the tornadoes (tornado.js) while there are any; their wind is read at the car itself
export const WEATHER = { wet: 0, ice: 0, wind: { x: 0, z: 0 }, vortex: null };
const vw = { x: 0, y: 0, z: 0, core: 0 };

export class Vehicle {
  constructor(spec) {
    this.spec = spec;
    const p = spec.phys, lift = spec.lift || 0;
    this.p = p;
    this.mass = p.mass;
    this.invI = new THREE.Vector3(1 / p.I[0], 1 / p.I[1], 1 / p.I[2]);
    this.pos = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.force = new THREE.Vector3(); this.torque = new THREE.Vector3();
    this.g = 9.81;
    this.R = spec.wheel.r;
    this.staticX = p.mass * 9.81 / (4 * p.k);
    const mountY = this.R + p.travel - this.staticX;
    this.wheels = [
      [spec.axle.f, 1, true], [spec.axle.f, -1, true], [spec.axle.r, 1, false], [spec.axle.r, -1, false],
    ].map(([z, s, front]) => ({
      m: new THREE.Vector3(s * spec.track, mountY - p.comY, z), front, s, omega: 0, spin: 0, x: 0, xPrev: 0, contact: false, slipL: 0, slipS: 0, load: 0,
      surf: { kind: KIND.PATH, mu: 1, rough: 0, drag: 0, crop: 0, panel: false }, tick: Math.random() * 4 | 0, off: false, gx: 0, gy: 0, gz: 0, vis: this.R + p.travel - this.staticX, bent: 0,
      wl: -1e9, wd: 0, cx: 0, cz: 0,   // water level over this corner, depth at the tyre, current
    }));
    this.wet = 0; this.flood = 0;
    const hw = spec.stations[4].w, S = spec.stations, zF = S[S.length - 1].z, zR = S[0].z;
    const top = S[4].top + lift, low = S[4].low + lift, c = p.comY;
    this.half = { x: hw, z: Math.max(zF, -zR), zF, zR, yLow: low - c, yTop: top - c };
    this.hull = [
      [hw * 0.92, low - c, zF * 0.9], [-hw * 0.92, low - c, zF * 0.9], [hw * 0.92, low - c, zR * 0.9], [-hw * 0.92, low - c, zR * 0.9],
      [hw, low - c, 0], [-hw, low - c, 0],
      [hw * 0.9, S[S.length - 3].top + lift - c, zF * 0.82], [-hw * 0.9, S[S.length - 3].top + lift - c, zF * 0.82],
      [hw * 0.9, S[1].top + lift - c, zR * 0.9], [-hw * 0.9, S[1].top + lift - c, zR * 0.9],
      [S[4].wt, top - c, 0.3], [-S[4].wt, top - c, 0.3], [S[4].wt, top - c, -0.7], [-S[4].wt, top - c, -0.7],
      [0, top + 0.02 - c, -0.2],
    ].map(a => new THREE.Vector3(...a));
    this.input = { throttle: 0, brake: 0, steer: 0, hand: 0, nitro: 0 };
    this.steer = 0; this.gear = 1; this.shift = 0; this.rpm = p.idle; this.engineHP = 100; this.fuelCut = 0; this.rev = 0;
    this.nitroFuel = 1; this.pull = 0; this.damageMul = 1;
    this.onImpact = null; this.onSolid = null; this.onTick = null;
    this.solids = []; this.bales = []; this.movers = [];
    this.air = 0; this.t = 0;
    this.topComp = 0;
  }
  place(x, y, z, heading) {
    this.pos.set(x, y, z); this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.v.set(0, 0, 0); this.w.set(0, 0, 0);
    for (const w of this.wheels) { w.omega = 0; w.x = 0; w.xPrev = 0; }
    this.gear = 1; this.rpm = this.p.idle;
  }
  applyAt(fx, fy, fz, r) {
    this.force.x += fx; this.force.y += fy; this.force.z += fz;
    this.torque.x += r.y * fz - r.z * fy; this.torque.y += r.z * fx - r.x * fz; this.torque.z += r.x * fy - r.y * fx;
  }
  // impulse response at offset r along n, world space
  invMassAt(r, n) {
    v1.crossVectors(r, n); iq.copy(this.q).conjugate(); v1.applyQuaternion(iq);
    v1.multiply(this.invI); v1.applyQuaternion(this.q); v2.crossVectors(v1, r);
    return 1 / this.mass + n.dot(v2);
  }
  impulse(jx, jy, jz, r) {
    this.v.x += jx / this.mass; this.v.y += jy / this.mass; this.v.z += jz / this.mass;
    v3.set(r.y * jz - r.z * jy, r.z * jx - r.x * jz, r.x * jy - r.y * jx);
    iq.copy(this.q).conjugate(); v3.applyQuaternion(iq); v3.multiply(this.invI); v3.applyQuaternion(this.q);
    this.w.add(v3);
  }
  driveTorque(dt) {
    const p = this.p, inp = this.input;
    const ratio = () => p.gears[this.gear - 1] * p.final;
    let wheelW = 0, n = 0;
    for (const w of this.wheels) if (!w.off && (p.drive === 'awd' || !w.front)) { wheelW += w.omega; n++; }
    wheelW /= n || 1;
    const rev = this.gear < 0;
    const r = rev ? 3.4 * p.final : ratio();
    const fromWheels = Math.abs(wheelW) * r * 9.55;
    const free = p.idle + inp.throttle * (p.redline - p.idle) * 0.68;
    const spd = this.forwardSpeed;
    // the clutch stays open at a crawl so the engine can rev up from a stop
    const target = Math.max(p.idle, fromWheels, Math.abs(spd) < 5 ? free : 0);
    this.rpm += (target - this.rpm) * Math.min(1, dt * 14);
    if (this.rpm > p.redline * 1.02) this.rpm = p.redline * 1.02;
    // automatic gearbox, driven by road speed so wheelspin cannot make it hunt
    this.shift = Math.max(0, this.shift - dt);
    const fromRoad = Math.abs(spd) / this.R * r * 9.55;
    if (!rev && this.shift <= 0) {
      if (fromRoad > p.redline * 0.93 && this.gear < p.gears.length) { this.gear++; this.shift = 0.16; this.onShift?.(); }
      else if (this.gear > 1) {
        const lower = fromRoad / p.gears[this.gear - 1] * p.gears[this.gear - 2];
        if (lower < p.redline * 0.72) { this.gear--; this.shift = 0.1; this.onShift?.(); }
      }
    }
    if (this.dead) return 0;
    const rn = clamp(this.rpm / p.redline, 0.1, 1.02);
    const curve = 0.62 + 0.46 * Math.sin(Math.min(1, rn * 1.1) * Math.PI * 0.82);
    let T = p.torque * curve * inp.throttle;
    T *= 0.32 + 0.68 * clamp(this.engineHP / 70, 0, 1);
    if (fromWheels > p.redline * 1.02 || this.shift > 0) T = 0;
    if (inp.nitro && this.nitroFuel > 0) T *= 1 + p.nitro;
    // traction control trims the worst wheelspin but still lets the tail step out
    let spin = 0;
    for (const w of this.wheels) if (!w.off && w.contact && (p.drive === 'awd' || !w.front)) spin = Math.max(spin, Math.abs(w.slipL));
    T *= clamp(1 - (spin - 2.5) / 6, 0.3, 1);
    return T * r * (rev ? -1 : 1);
  }
  get forwardSpeed() { v1.set(0, 0, 1).applyQuaternion(this.q); return this.v.dot(v1); }

  step(dt) {
    this.t += dt;
    const p = this.p, inp = this.input, g = this.g;
    this.force.set(0, -this.mass * g, 0); this.torque.set(0, 0, 0);
    const fwd = v4.set(0, 0, 1).applyQuaternion(this.q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q), spd = this.v.dot(fwd), speed = this.v.length();
    this.forwardSpeedCache = spd;

    // S at a standstill means reverse, W gets it back into first
    if (this.wantsReverse && Math.abs(spd) < 1.2 && this.gear > 0) this.gear = -1;
    if (!this.wantsReverse && this.gear < 0 && (inp.throttle > 0 || Math.abs(spd) < 0.5)) this.gear = 1;

    const sRate = Math.abs(inp.steer) > 0.01 ? 2.8 : 5.5;
    const limit = THREE.MathUtils.lerp(0.56, 0.085, Math.sqrt(clamp(Math.abs(spd) / 45, 0, 1)));
    this.steer += clamp(inp.steer * limit - this.steer, -sRate * dt, sRate * dt);

    const T = this.driveTorque(dt);
    const drivers = this.wheels.filter(w => !w.off && (p.drive === 'awd' || !w.front));
    const Iw = 1.3 * (this.R / 0.33) ** 2;
    let inAir = true, contacts = 0;

    for (const w of this.wheels) {
      if (w.off) continue;
      const mount = v1.copy(w.m).applyQuaternion(this.q).add(this.pos);
      const rest = p.travel;
      // the contact sits where the ground meets this wheel's line of travel
      const cx = mount.x - up.x * (rest + this.R), cz = mount.z - up.z * (rest + this.R);
      w.tick = (w.tick + 1) & 3;
      if (w.tick === 0) {
        const s = surface(cx, cz);
        w.surf.kind = s.kind; w.surf.mu = s.mu * (1 - WEATHER.wet * (s.kind === KIND.ROAD ? 0.3 : s.kind === KIND.PATH ? 0.2 : 0.14)) * (1 - 0.35 * WEATHER.ice); w.surf.rough = s.rough; w.surf.drag = s.drag; w.surf.crop = s.crop; w.surf.panel = s.panel;
        normal(cx, cz, w.n ||= new THREE.Vector3());
        const wt = waterAt(cx, cz);
        // only the channel holds water: next to a stream the ground counts as dry at any height
        const inIt = wt.on && wt.edge < 1;
        w.wl = inIt ? wt.lvl : -1e9; w.cx = inIt ? wt.fx * wt.sp : 0; w.cz = inIt ? wt.fz * wt.sp : 0;
      }
      const n = w.n ||= new THREE.Vector3(0, 1, 0), surf = w.surf;
      const groundH = ground(cx, cz, mount.y) + (noise(cx * 2.6, cz * 2.6) + noise(cx * 7.1 + 4, cz * 7.1)) * surf.rough;
      w.wd = Math.max(0, w.wl - groundH);
      const denom = up.dot(n);
      const t = denom > 0.15 ? ((mount.x - cx) * n.x + (mount.y - groundH) * n.y + (mount.z - cz) * n.z) / denom : 1e3;
      const xNew = rest + this.R - t;
      w.xPrev = w.x;
      if (xNew <= 0) {
        w.contact = false; w.x = 0; w.load = 0; w.slipL = 0; w.slipS = 0;
        const tau = (drivers.includes(w) ? T / drivers.length : 0) - (inp.brake + inp.hand * (w.front ? 0 : 1)) * Math.sign(w.omega) * 800;
        w.omega += tau / Iw * dt * 0.2; w.omega *= 1 - 0.3 * dt;
        w.spin += w.omega * dt; w.vis = rest; continue;
      }
      inAir = false; contacts++;
      w.contact = true;
      const compression = Math.min(xNew, p.travel * 1.3);
      w.x = compression;
      const rate = clamp((compression - w.xPrev) / dt, -6, 6);
      let N = p.k * compression + p.c * rate;
      if (xNew > p.travel) {          // bump stop
        N += (xNew - p.travel) * p.k * 9;
        if (rate > 2.4) this.onBottom?.(rate);
      }
      N = clamp(N, 0, this.mass * 30);
      w.load = N;
      const r = v2.copy(mount).addScaledVector(up, -t).sub(this.pos);
      // lift the force point towards the centre of mass, an anti-roll bar in all but name
      const rApply = rel.copy(r).addScaledVector(up, 0.55 * (-r.dot(up)));
      this.applyAt(up.x * N, up.y * N, up.z * N, rApply);

      // tyre frame on the ground plane
      const st = w.front ? this.steer + w.bent : w.bent;
      const fx0 = Math.sin(st), fz0 = Math.cos(st);
      const f = v3.set(fx0, 0, fz0).applyQuaternion(this.q);
      const fn = f.dot(n); f.addScaledVector(n, -fn).normalize();
      const sx = n.y * f.z - n.z * f.y, sy = n.z * f.x - n.x * f.z, sz = n.x * f.y - n.y * f.x;
      const vcx = this.v.x + this.w.y * r.z - this.w.z * r.y, vcy = this.v.y + this.w.z * r.x - this.w.x * r.z, vcz = this.v.z + this.w.x * r.y - this.w.y * r.x;
      const vf = vcx * f.x + vcy * f.y + vcz * f.z, vs = vcx * sx + vcy * sy + vcz * sz;

      let mu = surf.mu * p.mu;
      if (surf.kind !== KIND.PATH && surf.kind !== KIND.ROAD) mu *= p.offroad;
      // a tyre has to push the water out of the way before it touches anything
      if (w.wd > 0) mu *= (1 - 0.3 * Math.min(1, w.wd / 0.4)) * (1 - 0.5 * Math.min(1, w.wd / 0.25) * clamp((Math.abs(vf) - 9) / 16, 0, 1));
      const muN = mu * N;
      // wheel spin, solved implicitly so it stays stable at any stiffness
      const slipRef = 1.1, Kx = muN / slipRef;
      let tau = drivers.includes(w) ? T / drivers.length : 0;
      const brakeT = (inp.brake * p.brake * (w.front ? 0.6 : 0.4) + (inp.hand && !w.front ? 5200 : 0));
      const R = this.R, A = dt / Iw;
      let om = (w.omega + A * (tau + Kx * R * vf)) / (1 + A * Kx * R * R);
      let Fx = Kx * (om * R - vf);
      if (Fx > muN) { Fx = muN; om = w.omega + A * (tau - Fx * R); } else if (Fx < -muN) { Fx = -muN; om = w.omega + A * (tau - Fx * R); }
      if (brakeT > 0) {
        const dOm = brakeT * A;
        if (Math.abs(om) <= dOm) { om = 0; Fx = clamp(-vf * Kx * 2, -muN, muN); } else { om -= Math.sign(om) * dOm; Fx = clamp(Kx * (om * R - vf), -muN, muN); }
      }
      w.omega = om; w.spin += om * dt;

      const slipRefS = Math.max(0.55, Math.abs(vf) * 0.1);
      let Fy = clamp(-vs / slipRefS, -1, 1) * muN;
      // stop tiny creeping without wrecking stability
      const cap = Math.abs(vs) * this.mass * 0.25 / dt; if (Math.abs(Fy) > cap) Fy = Math.sign(Fy) * cap;
      // friction circle, with less grip once really sliding
      const len = Math.hypot(Fx, Fy);
      const slide = Math.hypot(om * R - vf, vs);
      w.slipL = om * R - vf; w.slipS = vs;
      const peak = slide > 3.5 ? 0.84 : 1;
      if (len > muN * peak) { const s = muN * peak / len; Fx *= s; Fy *= s; }
      const drag = -clamp(vf, -3, 3) * surf.drag * N * 0.35;
      const lat = Fx + drag;
      this.applyAt(f.x * lat + sx * Fy, f.y * lat + sy * Fy, f.z * lat + sz * Fy, r);
      if (w.wd > 0) {
        // the tyre wades: drag on what stands in the water, against the current
        const rx = vcx - w.cx, rz = vcz - w.cz, sp = Math.hypot(rx, rz), k = 0.5 * 1000 * 0.95 * this.spec.wheel.w * Math.min(w.wd, this.R * 1.4) * 0.5;
        rel.set(0, r.y * 0.3, 0).add(v2.copy(r).setY(0));
        this.applyAt(-k * sp * rx, 0, -k * sp * rz, rel);
      }
      w.gx = cx; w.gy = groundH; w.gz = cz;
      w.vis = rest - compression;
    }
    this.onGround = !inAir;
    const swim = this.wade(dt, up);
    this.air = inAir && !swim ? this.air + dt : 0;

    // air drag against the moving air, and a little aero grip
    const tall = this.spec.kind === 'pickup';
    const cd = 0.42 + (this.spec.kind === 'pickup' ? 0.35 : 0);
    rel.set(this.v.x - WEATHER.wind.x, this.v.y, this.v.z - WEATHER.wind.z);
    const relS = rel.length();
    this.force.addScaledVector(rel, -cd * relS);
    if (!inAir) this.force.addScaledVector(up, -0.9 * speed * speed);
    // A crosswind leans on the flank of the body. It acts above the centre of mass, so a gust also
    // rolls the car on its springs, and a tall car feels it more.
    // (only the wind's part: the car's own sliding is the tyres' business, and drifts must feel the same)
    v2.set(1, 0, 0).applyQuaternion(this.q);
    const lat = -(WEATHER.wind.x * v2.x + WEATHER.wind.z * v2.z), side = (tall ? 3.4 : 2.3) * lat * Math.abs(lat);
    v3.set(0, tall ? 0.7 : 0.45, 0).applyQuaternion(this.q);
    this.applyAt(-v2.x * side, -v2.y * side, -v2.z * side, v3);
    if (WEATHER.vortex) this.vortex(WEATHER.vortex);
    // lost wheels drag the axle along the ground, nothing extra needed: hull points handle that
    if (inp.nitro && this.nitroFuel > 0) {
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 0.22);
      this.force.addScaledVector(fwd, this.mass * 3.6 * p.nitro);
    } else this.nitroFuel = Math.min(1, this.nitroFuel + dt * 0.05);
    // gentle air control so jumps land instead of nosediving every time
    if (inAir) { this.torque.addScaledVector(up, inp.steer * -0 * this.mass); }

    // integrate
    this.v.addScaledVector(this.force, dt / this.mass);
    v1.copy(this.torque); iq.copy(this.q).conjugate(); v1.applyQuaternion(iq); v1.multiply(this.invI); v1.applyQuaternion(this.q);
    this.w.addScaledVector(v1, dt);
    this.w.multiplyScalar(1 - 0.12 * dt);
    this.pos.addScaledVector(this.v, dt);
    const wq = iq.set(this.w.x * dt * 0.5, this.w.y * dt * 0.5, this.w.z * dt * 0.5, 0).multiply(this.q);
    this.q.x += wq.x; this.q.y += wq.y; this.q.z += wq.z; this.q.w += wq.w; this.q.normalize();

    this.collideGround();
    this.collideSolids();
    if (speed > 80) { /* physics stays stable; nothing to clamp */ }
  }

  // A tornado's wind on the whole body: drag on each face of the box against the air (the flank and
  // the roof are big, so it slides the car sideways and, in the core's updraft, lifts it), lift off
  // the roof as the air rushes over it, all a little above the centre of mass so it rolls the car,
  // and in the core the air is all eddies that tumble it. The day's steady wind is handled above.
  vortex(V) {
    V.windAt(this.pos.x, this.pos.y, this.pos.z, vw);
    const rx = vw.x - this.v.x, ry = vw.y - this.v.y, rz = vw.z - this.v.z, rl = Math.hypot(rx, ry, rz);
    if (rl < 8 && vw.core < 0.05) return;
    const h = this.half, L = h.zF - h.zR, W = h.x * 2, Hh = h.yTop - h.yLow;
    // the air against the car in its own axes, then 0.5 rho Cd A on each face
    iq.copy(this.q).conjugate();
    const loc = v1.set(rx, ry, rz).applyQuaternion(iq);
    const k = 0.5 * 1.2 * 1.1;
    // (the floor is no smooth face: the updraft gets under the sills and the wheel arches)
    v2.set(k * L * Hh * loc.x, k * 1.3 * L * W * loc.y, k * W * Hh * 0.6 * loc.z).multiplyScalar(rl);
    // the air rushing over the roof pulls it up, as off a wing
    const hz = Math.hypot(loc.x, loc.z);
    v2.y += 0.5 * 1.2 * 0.5 * L * W * hz * hz;
    v2.applyQuaternion(this.q);
    this.applyAt(v2.x, v2.y, v2.z, v3.set(0, 0.35, 0).applyQuaternion(this.q));
    // eddies: a gusting push and a twist that change every moment, strongest in the core
    const e = vw.core * Math.max(0, rl - 18) * this.mass * 0.05, tt = this.t * 6.3;
    this.force.x += e * noise(tt, 1.3); this.force.y += e * noise(tt, 7.1); this.force.z += e * noise(tt, 4.7);
    this.torque.x += e * noise(tt * 0.8, 11.2) * 1.5; this.torque.z += e * noise(tt * 0.8, 15.9) * 1.5;
  }
  // The body in water, sampled at the four corners: it floats while the cabin holds air, then
  // fills up and goes down. Water reaching the air intake finishes the engine.
  wade(dt, up) {
    const hw = this.half.x, H = this.half.yTop - this.half.yLow, area = hw * 2 * (this.half.zF - this.half.zR) / 4;
    let total = 0, n = 0;
    for (const w of this.wheels) {
      if (w.wl < -1e8) continue;
      const r = v3.set(w.s * hw * 0.9, this.half.yLow, w.m.z).applyQuaternion(this.q), sub = w.wl - (this.pos.y + r.y);
      n++;
      if (sub <= 0) continue;
      const s = Math.min(sub, H);
      total += s;
      const vy = this.v.y + this.w.z * r.x - this.w.x * r.z;
      const lift = 1000 * 9.81 * area * s * 0.46 * (1 - this.flood * 0.86) - vy * 3600 * Math.min(1, s * 2);
      this.applyAt(0, lift, 0, rel.copy(r).multiplyScalar(0.7));
    }
    const sub = n ? total / 4 : 0;
    this.wet = sub;
    if (sub <= 0) { this.flood = Math.max(0, this.flood - dt * 0.03); return false; }
    // bow wave on the front of the hull and the current on all of it
    const cx = this.wheels[0].cx, cz = this.wheels[0].cz, rx = this.v.x - cx, rz = this.v.z - cz, sp = Math.hypot(rx, rz);
    const k = 0.5 * 1000 * 1.05 * hw * 2 * Math.min(sub, H);
    this.force.x -= k * sp * rx; this.force.z -= k * sp * rz;
    this.w.multiplyScalar(1 - Math.min(1, sub * 2.4) * dt);
    if (sub > 0.3) this.flood = Math.min(1, this.flood + dt * 0.055 * Math.min(1, sub));
    const intake = 0.62 + (this.spec.id === 'monster' ? 0.2 : 0);
    if (sub > intake && !this.dead) {
      this.engineHP -= dt * 42;
      if (this.engineHP <= 0) { this.engineHP = 0; this.dead = true; this.onDrown?.(); }
    }
    return sub > 0.04;
  }

  collideGround() {
    const mu = 0.55;
    let any = false;
    const n = nrm;
    let hi = 0;
    for (const lp of this.hull) {
      const r = v4.copy(lp).applyQuaternion(this.q), px = this.pos.x + r.x, py = this.pos.y + r.y, pz = this.pos.z + r.z;
      const h = ground(px, pz, py), depth = h - py;
      if (depth <= 0) continue;
      normal(px, pz, n);
      any = true;
      const rr = r.clone();
      const vpx = this.v.x + this.w.y * rr.z - this.w.z * rr.y, vpy = this.v.y + this.w.z * rr.x - this.w.x * rr.z, vpz = this.v.z + this.w.x * rr.y - this.w.y * rr.x;
      const vn = vpx * n.x + vpy * n.y + vpz * n.z;
      if (vn < 0) {
        const denom = this.invMassAt(rr, n);
        const j = -(1.12) * vn / denom;
        this.impulse(n.x * j, n.y * j, n.z * j, rr);
        // friction
        const tx = vpx - n.x * vn, ty = vpy - n.y * vn, tz = vpz - n.z * vn, tl = Math.hypot(tx, ty, tz);
        if (tl > 0.01) {
          const jt = Math.min(tl / denom, mu * j);
          this.impulse(-tx / tl * jt, -ty / tl * jt, -tz / tl * jt, rr);
        }
        if (-vn > 2.2) {
          const local = lp.clone(); const dir = n.clone().applyQuaternion(iq.copy(this.q).conjugate());
          this.onImpact?.(local, dir, -vn, new THREE.Vector3(px, py, pz), 'ground');
        } else if (tl > 2) this.onScrape?.(px, h, pz, tl);
      }
      if (depth > hi) hi = depth;
    }
    if (any) this.pos.y += Math.min(hi * 0.25, 0.06);
  }

  collideSolids() {
    const hx = this.half.x, zF = this.half.zF, zR = this.half.zR;
    const inv = iq.copy(this.q).conjugate();
    for (const s of this.solids) {
      if (s.dead) continue;
      v1.set(s.x - this.pos.x, 0, s.z - this.pos.z).applyQuaternion(inv);
      const y = clamp(v1.y, this.half.yLow, this.half.yTop * 0.6);
      const qx = clamp(v1.x, -hx, hx), qz = clamp(v1.z, zR, zF);
      const dx = v1.x - qx, dz = v1.z - qz, d = Math.hypot(dx, dz);
      if (d >= s.r) continue;
      if (this.pos.y + this.half.yLow > s.top) continue;
      this.hitSolid(s, qx, y, qz, dx, dz, d, s.r - d);
    }
    this.collideMovers(inv);
    for (const b of this.bales) {
      v1.set(b.pos.x - this.pos.x, b.pos.y - this.pos.y, b.pos.z - this.pos.z).applyQuaternion(inv);
      if (Math.abs(v1.y) > 1.8) continue;
      const qx = clamp(v1.x, -hx, hx), qz = clamp(v1.z, zR, zF);
      const dx = v1.x - qx, dz = v1.z - qz, d = Math.hypot(dx, dz);
      if (d >= 0.76) continue;
      const nx = d > 1e-3 ? dx / d : 0, nz = d > 1e-3 ? dz / d : 1;
      v2.set(nx, 0.25, nz).normalize().applyQuaternion(this.q);
      const r = v3.set(qx, 0, qz).applyQuaternion(this.q);
      const vp = v4.copy(this.w).cross(r).add(this.v);
      const closing = vp.dot(v2) - b.v.dot(v2);
      if (closing <= 0) continue;
      const m = 300, j = (1.3 * closing) / (1 / this.mass + 1 / m);
      this.v.addScaledVector(v2, -j / this.mass);
      b.v.addScaledVector(v2, j / m); b.spinAxis = v2.clone(); b.awake = true;
      b.w = Math.min(14, b.v.length() / 0.72);
      this.onBale?.(b, closing);
    }
  }
  // Traffic: heavy things that move. Each is three circles down its length against the car's box.
  collideMovers(inv) {
    const hx = this.half.x, zF = this.half.zF, zR = this.half.zR;
    for (const m of this.movers) {
      const cx = m.pos.x - this.pos.x, cz = m.pos.z - this.pos.z;
      if (cx * cx + cz * cz > 100 || Math.abs(m.pos.y - this.pos.y) > 3 || !m.g.visible) continue;
      const fx = Math.sin(m.heading), fz = Math.cos(m.heading), rad = m.hw + 0.05, reach = m.hl - rad;
      for (let t = -1; t <= 1; t++) {
        const px = m.pos.x + fx * reach * t, pz = m.pos.z + fz * reach * t;
        v1.set(px - this.pos.x, 0, pz - this.pos.z).applyQuaternion(inv);
        const qx = clamp(v1.x, -hx, hx), qz = clamp(v1.z, zR, zF), dx = v1.x - qx, dz = v1.z - qz, d = Math.hypot(dx, dz);
        if (d >= rad) continue;
        const local = new THREE.Vector3(qx, 0, qz), nw = new THREE.Vector3(d > 1e-3 ? -dx / d : 0, 0, d > 1e-3 ? -dz / d : -Math.sign(qz || 1)).applyQuaternion(this.q);
        nw.y = 0; nw.normalize();
        const r = local.clone().applyQuaternion(this.q);
        const vp = new THREE.Vector3().copy(this.w).cross(r).add(this.v).sub(m.vel), vn = vp.dot(nw);
        this.pos.addScaledVector(nw, (rad - d) * 0.6);
        if (vn >= 0) continue;
        const j = -1.25 * vn / (this.invMassAt(r, nw) + 1 / m.mass);
        this.impulse(nw.x * j, 0, nw.z * j, r);
        m.vel.addScaledVector(nw, -j / m.mass);
        const wp = new THREE.Vector3(px, this.pos.y, pz);
        if (-vn > 1.4) this.onImpact?.(local, nw.clone().applyQuaternion(iq.copy(this.q).conjugate()), -vn, wp, 'solid');
        this.onMover?.(m, -vn, nw, wp);
        break;
      }
    }
  }
  hitSolid(s, qx, qy, qz, dx, dz, d, depth) {
    const nx = d > 1e-3 ? -dx / d : (qz > 0 ? 0 : 0), nz = d > 1e-3 ? -dz / d : -Math.sign(qz || 1);
    const nw = new THREE.Vector3(nx, 0, nz).applyQuaternion(this.q); nw.y = 0; nw.normalize();
    const r = new THREE.Vector3(qx, qy, qz).applyQuaternion(this.q);
    this.pos.addScaledVector(nw, depth * 0.8);
    const vp = new THREE.Vector3().copy(this.w).cross(r).add(this.v);
    const vn = vp.dot(nw);
    if (vn >= 0) return;
    const denom = this.invMassAt(r, nw);
    let j = -(1.18) * vn / denom;
    const broke = j > s.str;
    if (broke) j = s.str * 0.55;
    this.impulse(nw.x * j, 0, nw.z * j, r);
    // scrape along the trunk
    const t = new THREE.Vector3().copy(vp).addScaledVector(nw, -vn);
    const tl = t.length();
    if (tl > 0.05) { const jt = Math.min(tl / denom, j * 0.4); t.multiplyScalar(-jt / tl); this.impulse(t.x, t.y, t.z, r); }
    if (-vn > 1.4) {
      const dir = nw.clone().applyQuaternion(iq.copy(this.q).conjugate());
      this.onImpact?.(new THREE.Vector3(qx, qy, qz), dir, -vn, new THREE.Vector3(s.x, this.pos.y, s.z), 'solid', s);
    }
    if (broke) this.onSolid?.(s, this.v.clone(), nw.clone());
  }
}

// Round bales: light spheres that roll down hills until they settle.
export function stepBale(b, dt) {
  const r = 0.72;
  b.v.y -= 9.81 * dt;
  b.pos.addScaledVector(b.v, dt);
  const g = ground(b.pos.x, b.pos.z, b.pos.y) + r;
  if (b.pos.y < g) {
    b.pos.y = g;
    normal(b.pos.x, b.pos.z, nrm);
    const vn = b.v.dot(nrm);
    if (vn < 0) b.v.addScaledVector(nrm, -1.35 * vn);
    b.v.multiplyScalar(1 - 1.3 * dt);
    if (b.v.lengthSq() < 0.06) { b.awake = false; b.v.set(0, 0, 0); }
  }
}
