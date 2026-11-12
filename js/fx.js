// Particles and flying wreckage.
import * as THREE from 'three';
import { softDot } from './textures.js';
import { ground } from './world.js';

const MAX = 2400, TRACK = 3000;
const R = (a, b) => a + Math.random() * (b - a);
const tv = new THREE.Vector3(), tq = new THREE.Quaternion(), ta = new THREE.Vector3(), ts = new THREE.Vector3();

export class FX {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 4); this.size = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: softDot() }, uH: { value: 500 }, uDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 2600 }, uSoft: { value: 1 } },
      vertexShader: /* glsl */`attribute vec4 aCol; attribute float aSize; varying vec4 vC; varying float vZ, vR; uniform float uH;
        void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); vZ=-mv.z; vR=max(aSize*.5,.05); gl_PointSize=aSize*uH/max(-mv.z,.25); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: /* glsl */`#include <packing>
        varying vec4 vC; varying float vZ, vR; uniform sampler2D uTex, uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft;
        void main(){ float a=texture2D(uTex,gl_PointCoord).a; float c=length(gl_PointCoord-.5)*2.; a=max(a,0.)*(1.-c*c)*1.8; if(a<.01) discard;
          float k=1.;
          if(uSoft>.5){ float z=-perspectiveDepthToViewZ(texture2D(uDepth,gl_FragCoord.xy*uRes).r,uNear,uFar); k=clamp((z-vZ)/vR,0.,1.); if(k<=0.) discard; }
          gl_FragColor=vec4(vC.rgb,vC.a*min(a,1.)*k); }`,
      transparent: true, depthWrite: false, depthTest: false,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4; this.points.layers.set(2); scene.add(this.points);
    this.p = []; this.free = []; for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.alive = [];
    this.wind = { x: 0, z: 0 };   // set by main.js from the weather
    this.field = null; this.fv = { x: 0, y: 0, z: 0 };   // a tornado's wind at a point (tornado.js), for the particles spawned with field
    this.parts = [];
    this.tint = new THREE.Color(1, 0.9, 0.75);
    this.fallen = [];
    this.makeTracks(scene);
  }
  // Tyre prints on gravel: thin ribbons with a tread, far finer than the half-metre ground texture.
  // One long ring of quads, so the oldest fade away and get reused.
  makeTracks(scene) {
    const g = new THREE.BufferGeometry(), idx = new Uint32Array(TRACK * 6), id = new Float32Array(TRACK * 4), side = new Float32Array(TRACK * 4);
    for (let i = 0; i < TRACK; i++) {
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
      id.fill(i, i * 4, i * 4 + 4); side.set([0, 1, 0, 1], i * 4);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACK * 12), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRun', new THREE.BufferAttribute(new Float32Array(TRACK * 8), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aId', new THREE.BufferAttribute(id, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.trackMat = new THREE.ShaderMaterial({
      uniforms: { uHead: { value: 0 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, side: THREE.DoubleSide,
      vertexShader: /* glsl */`attribute vec2 aRun; attribute float aId, aSide; uniform float uHead; varying vec2 vRun; varying float vA;
        void main(){ vRun = vec2(aRun.x, aSide); float age = mod(uHead - aId, ${TRACK}.) / ${TRACK}.; vA = aRun.y * (1. - age * age * age); gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */`varying vec2 vRun; varying float vA;
        void main(){
          // rows of tread blocks pressed in, soft at the tyre's edges
          float e = smoothstep(0., .18, vRun.y) * smoothstep(1., .82, vRun.y);
          float tread = step(.34, fract(vRun.x * 5.5 + abs(vRun.y - .5) * 1.7));
          gl_FragColor = vec4(.055, .045, .035, vA * e * (.45 + .55 * tread));
        }`,
    });
    this.tracks = new THREE.Mesh(g, this.trackMat); this.tracks.frustumCulled = false; scene.add(this.tracks);
    this.trackN = 0;
  }
  // w remembers where the last print ended, so each wheel lays its own unbroken ribbon
  track(w, x, y, z, halfW, strength) {
    const l = w.print;
    if (!l) { w.print = { x, y, z, ax: 0, az: 0, run: 0, on: false }; return; }
    const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz);
    if (d < 0.45) return;
    // a short hop over a bump shouldn't break the line, a real jump or a reset should
    if (d > 5) { w.print = null; return; }
    const nx = dz / d * halfW, nz = -dx / d * halfW, i = this.trackN++ % TRACK, g = this.tracks.geometry, p = g.attributes.position, r = g.attributes.aRun, run = l.run + d, up = 0.06;
    if (!l.on) { l.ax = nx; l.az = nz; l.on = true; }
    p.setXYZ(i * 4, l.x + l.ax, l.y + up, l.z + l.az); p.setXYZ(i * 4 + 1, l.x - l.ax, l.y + up, l.z - l.az);
    p.setXYZ(i * 4 + 2, x + nx, y + up, z + nz); p.setXYZ(i * 4 + 3, x - nx, y + up, z - nz);
    r.setXY(i * 4, l.run, strength); r.setXY(i * 4 + 1, l.run, strength); r.setXY(i * 4 + 2, run, strength); r.setXY(i * 4 + 3, run, strength);
    p.needsUpdate = true; r.needsUpdate = true;
    this.trackMat.uniforms.uHead.value = i;
    Object.assign(l, { x, y, z, ax: nx, az: nz, run });
  }
  // field: it goes with a tornado's wind (this.field), up and round, not only with the day's
  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, grav, drag, stick, field = false) {
    if (!this.free.length) return;
    const i = this.free.pop();
    this.alive.push({ i, x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, a, grav, drag, stick, field });
  }
  dust(x, y, z, vx, vy, vz, col, amt = 1) {
    const t = this.tint;
    this.spawn(x + R(-0.2, 0.2), y + R(0, 0.1), z + R(-0.2, 0.2), vx * 0.3 + R(-0.5, 0.5), R(0.3, 1.1), vz * 0.3 + R(-0.5, 0.5), R(1.2, 2.6), R(0.5, 1.2) * amt, R(1.2, 2.2),
      col[0] * t.r, col[1] * t.g, col[2] * t.b, R(0.16, 0.34), -0.05, 1.3);
  }
  // water thrown up by a tyre or a hull: droplets that fall, and a little mist that hangs
  splash(x, y, z, vx, vz, amt = 1) {
    const t = this.tint, up = 1.1 + amt * 2.6;
    this.spawn(x + R(-0.2, 0.2), y, z + R(-0.2, 0.2), vx * 0.34 + R(-1.3, 1.3), R(0.6, up), vz * 0.34 + R(-1.3, 1.3), R(0.35, 0.8), R(0.04, 0.11), 0.1, 0.82 * t.r, 0.88 * t.g, 0.92 * t.b, 0.8, 9.8, 0.3, false);
    if (Math.random() < 0.3) this.spawn(x, y + 0.1, z, vx * 0.25 + R(-0.5, 0.5), R(0.3, 1), vz * 0.25 + R(-0.5, 0.5), R(0.6, 1.3), R(0.3, 0.6) * Math.min(1.6, amt + 0.5), R(1, 1.8), 0.85 * t.r, 0.88 * t.g, 0.9 * t.b, 0.14, 0.2, 1.4, false);
  }
  clod(x, y, z, vx, vy, vz, col) {
    this.spawn(x, y, z, vx * 0.3 + R(-1.6, 1.6), R(1.4, 4.4), vz * 0.3 + R(-1.6, 1.6), R(0.6, 1.2), R(0.05, 0.12), 0, col[0], col[1], col[2], 1, 9.8, 0.2, true);
  }
  chaff(x, y, z, vx, vz, col) {
    this.spawn(x + R(-0.4, 0.4), y + R(0.1, 0.8), z + R(-0.4, 0.4), vx * 0.4 + R(-1.2, 1.2), R(0.6, 2.8), vz * 0.4 + R(-1.2, 1.2), R(0.8, 1.9), R(0.05, 0.11), 0, col[0], col[1], col[2], 0.95, 2.4, 1.4, true);
  }
  sparks(p, sev) {
    const n = Math.min(40, sev * 3 | 0);
    for (let i = 0; i < n; i++) this.spawn(p.x, p.y, p.z, R(-6, 6), R(1, 7), R(-6, 6), R(0.2, 0.6), R(0.04, 0.09), 0, 6, 3.4, 0.9, 1, 9.8, 0.5, false);
  }
  dirtBurst(p, sev) {
    const n = Math.min(26, sev * 2 | 0);
    for (let i = 0; i < n; i++) { this.clod(p.x, p.y, p.z, R(-4, 4), 0, R(-4, 4), [0.1, 0.07, 0.04]); this.dust(p.x, p.y, p.z, 0, 0, 0, [0.42, 0.34, 0.24], 1.5); }
  }
  debris(p, sev) {
    const n = Math.min(22, sev * 1.5 | 0);
    for (let i = 0; i < n; i++) this.spawn(p.x, p.y + 0.5, p.z, R(-4, 4), R(1, 6), R(-4, 4), R(0.6, 1.3), R(0.04, 0.11), 0, 0.26, 0.2, 0.13, 1, 9.8, 0.3, true);
  }
  leaves(p, n, col = [0.26, 0.42, 0.13]) {
    for (let i = 0; i < n; i++) this.spawn(p.x + R(-1.4, 1.4), p.y + R(0.4, 2.5), p.z + R(-1.4, 1.4), R(-2.4, 2.4), R(-0.4, 2.4), R(-2.4, 2.4), R(1.2, 2.6), R(0.05, 0.12), 0, col[0] * R(0.7, 1.3), col[1] * R(0.7, 1.3), col[2], 1, 1.1, 1.4, true);
  }
  glass(p, v, n = 110) {
    for (let i = 0; i < n; i++) this.spawn(p.x + R(-0.7, 0.7), p.y + R(-0.3, 0.3), p.z + R(-0.7, 0.7), v.x * 0.7 + R(-3, 3), v.y * 0.7 + R(-0.5, 4), v.z * 0.7 + R(-3, 3), R(0.5, 1.2), R(0.02, 0.05), 0, 2, 2.3, 2.6, 0.9, 9.8, 0.3, true);
  }
  smoke(x, y, z, vx, vz, dark, heat) {
    const c = dark ? 0.05 : 0.5;
    this.spawn(x + R(-0.1, 0.1), y, z + R(-0.1, 0.1), vx * 0.5 + R(-0.2, 0.2), R(0.8, 1.8), vz * 0.5 + R(-0.2, 0.2), R(1.2, 2.6), R(0.25, 0.5), R(1, 1.8), c, c, c * 1.05, dark ? 0.5 : 0.17, -0.2, 0.8);
    if (heat) this.spawn(x + R(-0.25, 0.25), y, z + R(-0.25, 0.25), vx * 0.6 + R(-0.3, 0.3), R(1, 2.4), vz * 0.6 + R(-0.3, 0.3), R(0.28, 0.6), R(0.28, 0.6), -0.3, 3.6, 1.2, 0.2, 0.9, -0.5, 0.8);
  }
  exhaust(x, y, z, vx, vz) { this.spawn(x, y, z, vx * 0.2 + R(-0.2, 0.2), R(0, 0.3), vz * 0.2 + R(-0.2, 0.2), R(0.3, 0.7), 0.1, 0.8, 0.8, 0.8, 0.8, 0.05, -0.1, 1); }
  flame(x, y, z, vx, vz) { for (let i = 0; i < 3; i++) this.spawn(x + R(-0.05, 0.05), y, z + R(-0.05, 0.05), vx * 0.9 + R(-0.5, 0.5), R(-0.2, 0.5), vz * 0.9 + R(-0.5, 0.5), R(0.08, 0.2), R(0.12, 0.26), -0.8, 2.4, 2.8, 6, 0.9, 0, 0); }

  // A panel or a wheel leaves the car and tumbles to rest; it keeps its dents.
  throwPart(mesh, world, v, w, info) {
    world.decompose(tv, tq, ts);
    const holder = new THREE.Group();
    holder.position.copy(tv); holder.quaternion.copy(tq); holder.scale.copy(ts);
    if (mesh.geometry) {
      mesh.geometry.computeBoundingSphere();
      const c = mesh.geometry.boundingSphere.center.clone();
      mesh.position.set(-c.x, -c.y, -c.z); mesh.rotation.set(0, 0, 0);
      holder.position.add(c.applyQuaternion(tq));
    } else mesh.position.set(0, 0, 0);
    holder.add(mesh); this.scene.add(holder);
    const p = { holder, v: v.clone().multiplyScalar(0.8).add(ta.set(R(-3, 3), R(1.5, 4.5), R(-3, 3))), av: new THREE.Vector3(R(-7, 7), R(-7, 7), R(-7, 7)), wheel: !!info?.wheel, r: info?.r ?? 0.12, t: 0, rest: false };
    this.parts.push(p);
    if (this.parts.length > 34) { const o = this.parts.shift(); this.scene.remove(o.holder); }
  }
  // Felled tree: pivots at the stump and crashes down.
  fallTree(group, axisX, axisZ) {
    this.fallen.push({ group, ax: axisX, az: axisZ, a: 0, w: 0.05 });
    if (this.fallen.length > 28) this.scene.remove(this.fallen.shift().group);
  }
  update(dt, camH) {
    this.mat.uniforms.uH.value = camH;
    const a = this.alive, pos = this.pos, col = this.col, size = this.size;
    for (let k = a.length - 1; k >= 0; k--) {
      const p = a[k];
      p.life -= dt;
      if (p.life <= 0) { this.free.push(p.i); size[p.i] = 0; a[k] = a[a.length - 1]; a.pop(); continue; }
      p.vy -= p.grav * dt;
      // drag slows a particle to the air around it, so dust, smoke and leaves go with the wind
      const d = Math.max(0, 1 - p.drag * dt), W = this.wind;
      if (p.field && this.field) {
        const F = this.field(p.x, p.y, p.z, this.fv);
        p.vx = W.x + F.x + (p.vx - W.x - F.x) * d; p.vy = F.y + (p.vy - F.y) * d; p.vz = W.z + F.z + (p.vz - W.z - F.z) * d;
      } else { p.vx = W.x + (p.vx - W.x) * d; p.vy *= d; p.vz = W.z + (p.vz - W.z) * d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.stick && p.y < -999) p.life = 0;
      const t = p.life / p.max;
      const i = p.i;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.a * Math.min(1, t * 2);
      size[i] = p.size + p.grow * (1 - t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;

    for (const p of this.parts) {
      if (p.rest) continue;
      p.t += dt;
      p.v.y -= 9.81 * dt;
      p.holder.position.addScaledVector(p.v, dt);
      ta.copy(p.av).multiplyScalar(dt);
      const l = ta.length();
      if (l > 1e-5) p.holder.quaternion.premultiply(tq.setFromAxisAngle(ta.divideScalar(l), l));
      const h = ground(p.holder.position.x, p.holder.position.z, p.holder.position.y) + p.r;
      if (p.holder.position.y < h) {
        p.holder.position.y = h;
        if (p.v.y < 0) p.v.y *= p.wheel ? -0.42 : -0.28;
        const f = p.wheel ? 0.985 : 0.82;
        p.v.x *= f; p.v.z *= f;
        p.av.multiplyScalar(p.wheel ? 0.98 : 0.7);
        if (p.v.lengthSq() < 0.5 && p.t > 0.7) p.rest = true;
      }
    }
    for (const f of this.fallen) {
      if (f.done) continue;
      f.w += (0.9 + Math.sin(f.a) * 2.6) * dt;
      f.a += f.w * dt;
      if (f.a > 1.5) { f.a = 1.5; f.w *= -0.2; if (Math.abs(f.w) < 0.1) f.done = true; }
      f.group.rotation.set(0, 0, 0);
      f.group.setRotationFromAxisAngle(ta.set(f.ax, 0, f.az).normalize(), f.a);
    }
  }
}
