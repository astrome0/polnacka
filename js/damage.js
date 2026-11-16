// Crash damage: sheet metal dents where it was hit, panels work loose and fall off, glass cracks
// and goes, wheels bend or shear off, the engine fades into smoke and fire.
import * as THREE from 'three';
import { noise } from './world.js';

const v = new THREE.Vector3();
const hailRay = new THREE.Raycaster(), hailO = new THREE.Vector3(), hailD = new THREE.Vector3(), hailDown = new THREE.Vector3(0, -1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Damage {
  constructor(car, veh, fx, audio) {
    this.car = car; this.veh = veh; this.fx = fx; this.audio = audio;
    this.total = 0; this.lastHit = -1; this.glassHP = 100; this.glassGone = false; this.shake = 0;
    this.smoke = 0; this.bagT = -1; this.loose = []; this.dropsLeft = -1;
    this.comY = car.spec.phys.comY; this.lift = car.spec.lift || 0;
    this.lightsBroken = [false, false];
    this.events = [];
    this.lastByZone = new Map();
    // an open car (the buggy) has no glass to crack and no airbag
    if (!car.panes.glassF) this.glassGone = true;
  }
  // p: impact point relative to the centre of mass, car axes. dir: push direction, car axes.
  impact(p, dir, speed, worldP, kind) {
    const now = performance.now() / 1000;
    const zone = `${Math.round(p.x)}:${Math.round(p.y * 2)}:${Math.round(p.z)}`, last = this.lastByZone.get(zone) || 0;
    const sev = speed * (kind === 'ground' ? 0.55 : 1);
    if (now - last < 0.16) return;
    this.lastByZone.set(zone, now);
    if (sev < 1.8) return;
    const massK = clamp(this.veh.mass / 1400, 0.6, 2), heavy = this.car.spec.id === 'monster' ? 0.32 : 1;
    const energy = sev * sev * 0.07 * massK * heavy;
    this.total += energy;
    const depth = clamp(sev * 0.034, 0.012, 0.42) * (this.car.spec.id === 'monster' ? 0.5 : 1);
    const radius = clamp(0.32 + sev * 0.045, 0.3, 1.15);
    // body sits at y=lift+model; convert from physics space into hull space
    const hit = new THREE.Vector3(p.x, p.y + this.comY - this.lift, p.z);
    this.dent(hit, dir, depth, radius);
    this.hurtParts(hit, energy, dir);
    this.hurtWheels(hit, sev);
    this.hurtEngine(hit, energy);
    if (sev > 7) this.crackGlass(hit, sev);
    if (sev > 5) this.hurtPanes(hit, sev);
    this.shake = Math.min(1.2, this.shake + sev * 0.045);
    if (sev > 4) this.fx.sparks(worldP, sev);
    if (kind === 'ground') this.fx.dirtBurst(worldP, sev); else this.fx.debris(worldP, sev);
    this.audio?.crash(clamp(sev / 22, 0.1, 1), kind);
    if (sev > 19 && this.bagT < 0 && p.z > 1 && kind !== 'ground') this.fireAirbag();
    this.events.push({ sev });
  }
  fireAirbag() {
    if (this.car.spec.open) return;
    this.bagT = 0; this.audio?.pop();
    const b = this.car.cab.bag; b.visible = true; b.scale.setScalar(0.001);
    b.getWorldPosition(v);
    for (let i = 0; i < 26; i++) this.fx.dust(v.x, v.y, v.z, this.veh.v.x, 0, this.veh.v.z, [0.92, 0.9, 0.84], 0.55);
  }
  dent(hit, dir, depth, radius) {
    const d = v.copy(dir), r2 = radius * radius;
    for (const name in this.car.parts) {
      const part = this.car.parts[name];
      if (part.off) continue;
      const g = part.mesh.geometry, pos = g.attributes.position;
      let touched = false;
      const a = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
        const dx = x - hit.x, dy = y - hit.y, dz = z - hit.z, q = dx * dx + dy * dy + dz * dz;
        if (q > r2) continue;
        const t = 1 - Math.sqrt(q) / radius, wr = 0.62 + 1.1 * Math.abs(noise(x * 9 + 3, z * 9 + y * 7));
        const s = depth * t * t * (3 - 2 * t) * wr;
        a[i * 3] += d.x * s + (noise(z * 6, y * 6) * s * 0.3);
        a[i * 3 + 1] += d.y * s + (noise(x * 6, z * 6 + 2) * s * 0.3);
        a[i * 3 + 2] += d.z * s;
        touched = true;
      }
      if (touched) { pos.needsUpdate = true; g.computeVertexNormals(); g.boundingSphere = null; }
    }
    for (const name in this.car.panes) {
      const gl = this.car.panes[name].mesh.geometry, a = gl.attributes.position.array;
      for (let i = 0; i < gl.attributes.position.count; i++) {
        const dx = a[i * 3] - hit.x, dy = a[i * 3 + 1] - hit.y, dz = a[i * 3 + 2] - hit.z, q = dx * dx + dy * dy + dz * dz;
        if (q > r2) continue;
        const t = 1 - Math.sqrt(q) / radius, s = depth * t * t;
        a[i * 3] += d.x * s; a[i * 3 + 1] += d.y * s; a[i * 3 + 2] += d.z * s;
      }
      gl.attributes.position.needsUpdate = true;
    }
  }
  partCenter(part) { return part.center ||= (part.mesh.geometry.computeBoundingBox(), part.mesh.geometry.boundingBox.getCenter(new THREE.Vector3())); }
  hurtParts(hit, energy, dir) {
    for (const name in this.car.parts) {
      if (name === 'shell') continue;
      const part = this.car.parts[name]; if (part.off) continue;
      const c = this.partCenter(part);
      const dist = c.distanceTo(hit);
      if (dist > 1.5) continue;
      part.hp -= energy * (1.6 - dist);
      if (part.hp < 0 && !part.off) this.detach(name, part);
      else if (part.hp < 12 && !part.swing && /door|hood|trunk/.test(name)) this.loosen(name, part);
    }
  }
  // a door or hood hangs off its hinge and flaps in the wind
  loosen(name, part) {
    const box = part.mesh.geometry.boundingBox || (part.mesh.geometry.computeBoundingBox(), part.mesh.geometry.boundingBox);
    const pivot = new THREE.Group();
    const door = /door/.test(name), axis = door ? 'y' : 'x';
    const hx = door ? (box.min.x + box.max.x) / 2 : 0, hy = door ? (box.min.y + box.max.y) / 2 : box.max.y, hz = door ? box.max.z : (name === 'hood' ? box.min.z : box.max.z);
    pivot.position.set(hx, hy, hz);
    part.mesh.parent.add(pivot); pivot.add(part.mesh); part.mesh.position.set(-hx, -hy, -hz);
    part.swing = { pivot, axis, a: 0.06 * (name === 'doorL' ? 1 : -1), w: 0, sign: name === 'doorR' ? -1 : 1, door, name };
    this.loose.push(part);
  }
  detach(name, part) {
    part.off = true;
    const mesh = part.mesh;
    const pv = part.swing?.pivot;
    mesh.updateWorldMatrix(true, false);
    const m = mesh.matrixWorld.clone();
    (mesh.parent).remove(mesh); pv?.parent?.remove(pv);
    this.loose = this.loose.filter(p => p !== part);
    this.fx.throwPart(mesh, m, this.veh.v, this.veh.w, part);
    this.audio?.clang();
    this.updateOpen();
    if (/bumperF/.test(name)) { this.breakLight(0); this.breakLight(1); }
  }
  breakLight(i) {
    if (this.lightsBroken[i]) return;
    this.lightsBroken[i] = true;
    const l = this.car.headL[i]; if (l) l.visible = false;
    if (this.lightsBroken[0] && this.lightsBroken[1]) this.beamOut = true;
  }
  hurtWheels(hit, sev) {
    const veh = this.veh;
    veh.wheels.forEach((w, i) => {
      if (w.off) return;
      const dz = hit.z - w.m.z, dx = hit.x - w.s * this.car.spec.track;
      const dist = Math.hypot(dz, dx);
      if (dist > 0.95) return;
      if (this.car.spec.id !== 'monster' && sev > 10) w.bent = clamp(w.bent + (Math.random() - 0.5) * sev * 0.0028, -0.09, 0.09);
      w.hp = (w.hp ?? 100) - sev * sev * 0.16 * (this.car.spec.id === 'monster' ? 0.1 : 1);
      if (w.hp < 0) this.loseWheel(i);
    });
  }
  loseWheel(i) {
    const w = this.veh.wheels[i], vis = this.car.wheels[i];
    if (w.off) return;
    w.off = true; vis.off = true; w.contact = false;
    vis.steer.updateWorldMatrix(true, true);
    const m = vis.spinner.matrixWorld.clone();
    vis.steer.remove(vis.spinner);
    this.fx.throwPart(vis.spinner, m, this.veh.v, this.veh.w, { wheel: true, r: this.car.spec.wheel.r });
    this.audio?.clang();
  }
  hurtEngine(hit, energy) {
    const veh = this.veh, near = hit.z > this.car.spec.axle.f - 1.3 ? 1 : 0.2;
    veh.engineHP = Math.max(0, veh.engineHP - energy * near * 0.9);
    if (veh.engineHP <= 0) veh.dead = true;
  }
  crackGlass(hit, sev) {
    if (this.glassGone) return;
    const c = this.car.cab, x = c.crackCtx, W = c.crackCv.width, H = c.crackCv.height;
    this.glassHP -= sev * 2.4;
    const sx = W * (0.5 - clamp(hit.x / 1.8, -0.5, 0.5)) * 0.8 + W * 0.1 + (Math.random() - 0.5) * 200, sy = hit.z > 0 ? H * (0.2 + Math.random() * 0.7) : H * (0.5 + Math.random() * 0.4);
    x.strokeStyle = 'rgba(235,245,255,.72)'; x.lineCap = 'round';
    const spokes = 9 + Math.random() * 7 | 0, len = 90 + sev * 15;
    for (let i = 0; i < spokes; i++) {
      let a = i / spokes * 6.283 + Math.random() * 0.3, px = sx, py = sy;
      x.lineWidth = 1.6; x.beginPath(); x.moveTo(px, py);
      const L = len * (0.5 + Math.random());
      for (let t = 0; t < 7; t++) { a += (Math.random() - 0.5) * 0.5; px += Math.cos(a) * L / 7; py += Math.sin(a) * L / 7; x.lineTo(px, py); }
      x.stroke();
    }
    for (let r = 1; r <= 3; r++) {
      x.lineWidth = 0.9; x.beginPath();
      const rad = len * 0.2 * r;
      for (let i = 0; i <= spokes; i++) { const a = i / spokes * 6.283 + r * 0.2, rr = rad * (0.74 + Math.random() * 0.4), px = sx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
    c.crackTex.needsUpdate = true;
    if (this.glassHP < 0 && !this.glassGone) this.shatter();
  }
  shatter() {
    this.glassGone = true;
    const c = this.car.cab;
    c.ws.visible = false;
    this.car.panes.glassF.mesh.visible = false; this.car.panes.glassF.off = true;
    v.setFromMatrixPosition(c.ws.matrixWorld);
    this.fx.glass(v.clone(), this.veh.v);
    this.audio?.glass(1);
    this.updateOpen();
  }
  // side and rear windows go on their own when the hit lands near them
  hurtPanes(hit, sev) {
    for (const name of ['glassL', 'glassR', 'glassB']) {
      const pane = this.car.panes[name];
      if (!pane || pane.off) continue;
      const c = pane.center ||= (pane.mesh.geometry.computeBoundingBox(), pane.mesh.geometry.boundingBox.getCenter(new THREE.Vector3()));
      const dist = name === 'glassB' ? Math.abs(hit.z - c.z) : Math.hypot(hit.x - c.x, (hit.z - c.z) * 0.5);
      if (dist > 1.3) continue;
      pane.hp -= sev * sev * 0.09 * (1.4 - dist);
      if (pane.hp < 0) {
        pane.off = true; pane.mesh.visible = false;
        this.fx.glass(c.clone().add(this.car.hull.position).applyMatrix4(this.car.root.matrixWorld), this.veh.v, 44);
        this.audio?.glass(0.45);
        this.updateOpen();
      }
    }
  }
  // how much of the outside reaches the driver's ears
  updateOpen() {
    let o = this.car.spec.open ? 1 : 0;
    for (const n in this.car.panes) if (this.car.panes[n].off) o += n === 'glassF' ? 0.6 : 0.3;
    for (const n of ['doorL', 'doorR']) if (this.car.parts[n]?.off) o += 0.35;
    this.audio?.setOpen(o);
  }
  mudOnGlass(amount) {
    const c = this.car.cab, x = c.crackCtx;
    if (this.glassGone) return;
    for (let i = 0; i < amount; i++) {
      // a splat is a thick core with a spray of fine droplets thrown in one direction
      const px = Math.random() * 1024, py = Math.random() * 512, a = Math.random() * 6.283, r = 1.5 + Math.random() * 3.5;
      x.fillStyle = `rgba(${52 + Math.random() * 20 | 0},${38 + Math.random() * 12 | 0},${24 + Math.random() * 8 | 0},.82)`;
      x.beginPath(); x.ellipse(px, py, r * 1.5, r, a, 0, 7); x.fill();
      for (let k = 0; k < 14; k++) {
        const d = r * (1 + Math.random() * 7), s = (Math.random() - 0.5) * 0.9, q = 0.5 + Math.random() * 1.1;
        x.beginPath(); x.arc(px + Math.cos(a + s) * d, py + Math.sin(a + s) * d, q, 0, 7); x.fill();
      }
    }
    c.crackTex.needsUpdate = true;
  }
  // A hailstone lands somewhere on top of the car: a ray straight down from above finds the panel,
  // and it gets a small round dent. size 0.45 to 1, the cell's stones.
  hailDent(size) {
    const veh = this.veh, h = veh.half;
    hailO.set((Math.random() * 2 - 1) * h.x * 0.85, h.yTop + 2, h.zR * 0.9 + Math.random() * (h.zF - h.zR) * 0.9).applyQuaternion(veh.q).add(veh.pos);
    hailD.set(0, -1, 0).applyQuaternion(veh.q);
    hailRay.set(hailO, hailD); hailRay.far = 4;
    const meshes = [];
    for (const n in this.car.parts) if (!this.car.parts[n].off) meshes.push(this.car.parts[n].mesh);
    const hit = hailRay.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const p = hit.object.worldToLocal(hit.point.clone());
    this.dent(p, hailDown, 0.005 + size * 0.008, 0.14 + size * 0.08);
    this.total += 0.03 * size;
  }
  // a stone on the windscreen: a small star chip, bigger stones bigger ones. Enough of them and it goes.
  hailChip(size) {
    if (this.glassGone) return;
    const c = this.car.cab, x = c.crackCtx, W = c.crackCv.width, H = c.crackCv.height;
    const sx = W * (0.08 + Math.random() * 0.84), sy = H * (0.05 + Math.random() * 0.75), len = (5 + Math.random() * 12) * (0.6 + size);
    x.strokeStyle = 'rgba(235,245,255,.6)'; x.lineCap = 'round'; x.lineWidth = 1.1;
    const spokes = 4 + Math.random() * 4 | 0;
    for (let i = 0; i < spokes; i++) {
      const a = i / spokes * 6.283 + Math.random() * 0.6, L = len * (0.4 + Math.random() * 0.8);
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke();
    }
    x.fillStyle = 'rgba(240,248,255,.55)'; x.beginPath(); x.arc(sx, sy, 1.2 + size * 1.4, 0, 7); x.fill();
    c.crackTex.needsUpdate = true;
    this.glassHP -= 0.5 * size;
    if (this.glassHP < 0) this.shatter();
  }
  // clear water on the windscreen: a pale drop with a brighter glint, gone again in a few seconds
  dropsOnGlass(amount) {
    const c = this.car.cab, x = c.dropCtx;
    if (this.glassGone) return;
    for (let i = 0; i < amount; i++) {
      const px = Math.random() * 512, py = Math.random() * 256, r = 0.8 + Math.random() * 2.2;
      x.fillStyle = 'rgba(210,226,235,.2)';
      x.beginPath(); x.ellipse(px, py, r, r * 1.4, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(240,248,252,.34)';
      x.beginPath(); x.arc(px - r * 0.3, py - r * 0.4, r * 0.3, 0, 7); x.fill();
    }
    c.dropTex.needsUpdate = true;
    this.dropsLeft = 4.5;
  }
  // they slide down the glass and thin out; at speed the wind pushes them up it instead
  runDrops(dt) {
    this.dropsLeft -= dt; this.dropT = (this.dropT || 0) - dt;
    if (this.dropT > 0) return;
    this.dropT = 0.09;
    const c = this.car.cab, x = c.dropCtx;
    if (this.dropsLeft <= 0) x.clearRect(0, 0, 512, 256);
    else {
      x.globalCompositeOperation = 'copy'; x.globalAlpha = 0.88;
      x.drawImage(c.dropCv, 0, Math.abs(this.veh.forwardSpeed) > 16 ? -3 : 2);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    }
    c.dropTex.needsUpdate = true;
  }
  wipe(amount) {
    const c = this.car.cab, x = c.crackCtx;
    // wipers sweep two overlapping fans, cracks stay because they're redrawn nowhere: mud and cracks share the sheet, so only erase softly
    x.save(); x.globalCompositeOperation = 'destination-out'; x.strokeStyle = `rgba(0,0,0,${amount})`; x.lineWidth = 130; x.lineCap = 'butt';
    for (const cx of [320, 700]) { x.beginPath(); x.arc(cx, 540, 300, Math.PI, 0); x.stroke(); }
    x.restore(); c.crackTex.needsUpdate = true;
    if (this.dropsLeft > 0) this.dropsLeft = 0;
  }
  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 3.2);
    if (this.dropsLeft > -1) this.runDrops(dt);
    if (this.bagT >= 0) {
      // full in a blink, then it empties and hangs off the hub
      this.bagT += dt;
      const t = this.bagT, full = clamp(t / 0.045, 0, 1), q = clamp((t - 0.28) / 1.3, 0, 1), e = q * q * (3 - 2 * q);
      const b = this.car.cab.bag;
      b.scale.set(0.27 * full * (1 - 0.3 * e), 0.27 * full * (1 - 0.46 * e), 0.2 * full * (1 - 0.74 * e));
      b.position.set(0, 0.01 - 0.11 * e, -0.15 + 0.09 * e);
    }
    const veh = this.veh;
    // swinging panels
    const fwd = veh.forwardSpeed;
    for (const part of this.loose) {
      const s = part.swing;
      const wind = clamp(fwd * 0.05, -2, 2), jerk = (veh.accelZ || 0) * 0.02;
      const target = s.door ? (s.sign * (0.25 - wind * 0.1)) : -0.25 - wind * 0.4;
      s.w += ((target - s.a) * 6 + (Math.random() - 0.5) * Math.min(12, Math.abs(fwd)) * 0.5 + jerk) * dt - s.w * 2.6 * dt;
      s.a += s.w;
      const max = s.door ? 1.25 : 1.1;
      if (s.a > max) { s.a = max; s.w *= -0.3; } if (s.a < -max) { s.a = -max; s.w *= -0.3; }
      if (s.axis === 'y') s.pivot.rotation.y = s.a; else s.pivot.rotation.x = s.a;
      if (Math.abs(fwd) > 26 && Math.random() < dt * 0.6) this.detach(s.name, part);
    }
    // engine wounds show as steam, then smoke, then fire
    const hp = veh.engineHP, cls = hp < 8 ? 3 : hp < 28 ? 2 : hp < 60 ? 1 : 0;
    this.smoke = cls;
  }
}
