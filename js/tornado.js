// Tornadoes. A supercell (weather.js) that has organised far enough may put one down under its wall
// cloud, or two in a row, or none at all: that's rolled when it organises, the moment isn't. Each one
// lives its own life: first only dust spinning on the ground with nothing above it, then the funnel
// lowering out of the wall cloud (not always all the way), a mature stage that pulses stronger and
// weaker, and at the end the rope: thin, tilted and contorted as the storm leaves it behind.
//
// Its wind is a modified Rankine vortex (anticlockwise from above) with inflow along the ground and
// the updraft in its core; the car, you on foot, the debris and the dust all read it (windAt). The
// picture is a raymarch of its own: the condensation funnel and the debris cloud round its foot,
// marched against the scene's depth, so it stands behind a tree or in front of a hill as it should.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { height, ground, surface, KIND } from './world.js';
import { LIT, HAZE } from './flora.js';

const R = (a, b) => a + Math.random() * (b - a);
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const fract = x => x - Math.floor(x);
const hash = x => fract(Math.sin(x * 127.1) * 43758.5453);
const vn = x => { const i = Math.floor(x), f = x - i, k = f * f * (3 - 2 * f); return hash(i) + (hash(i + 1) - hash(i)) * k; };
// the EF scale: how many tornadoes reach each class, and the peak wind near the ground, m/s
const EF = [[0.16, 33], [0.26, 44], [0.28, 57], [0.19, 71], [0.11, 87]];
// how many a supercell puts down once it rotates: none, one, or two in a row
const ODDS = [0.4, 0.42, 0.18];
// the wall cloud's foot, as clouds.js draws it (wallAt): the funnel hangs from there
export const wallFoot = m => 730 - 470 * Math.min(1, m);
// dust each kind of ground gives the debris cloud
const SOIL = { [KIND.PLOUGH]: [0.2, 0.15, 0.1], [KIND.WHEAT]: [0.62, 0.52, 0.34], [KIND.STUBBLE]: [0.6, 0.52, 0.36], [KIND.RAPE]: [0.36, 0.4, 0.2], [KIND.GREEN]: [0.3, 0.36, 0.18], [KIND.MEADOW]: [0.32, 0.36, 0.2], [KIND.PATH]: [0.5, 0.44, 0.34] };

export class Tornadoes {
  constructor(weather) {
    this.wx = weather;
    this.list = [];
    this.t = 0;
  }
  get on() { return this.list.length > 0; }
  // the one drawn and felt: there is rarely more than one, and then the stronger
  get main() { let b = null; for (const t of this.list) if (!b || t.I > b.I) b = t; return b; }
  // A tornado under supercell c. strong: at least EF2 (the key's one, so there's something to see).
  spawn(c, strong) {
    let p = Math.random() * (strong ? 0.58 : 1), ef = 0;
    if (strong) ef = 2;
    while (ef < EF.length - 1 && p >= EF[ef][0]) p -= EF[ef++][0];
    const wedge = Math.random() < [0, 0.06, 0.2, 0.42, 0.6][ef];
    // A cone is narrow at the ground and flares fast up into the cloud (a trumpet), a wedge is
    // broad all the way and nearly as wide as it is tall. The visible funnel is the core, roughly.
    const rc = wedge ? R(95, 170) * (0.8 + 0.12 * ef) : R(16, 40) + ef * 10;
    const t = {
      c, ef, age: 0, seed: Math.random(), wedge,
      vpk: EF[ef][1] * R(0.92, 1.12),
      rc, rt: rc * (wedge ? R(1.3, 1.7) : R(2.4, 3.6)), k: wedge ? R(1.2, 1.7) : R(2.1, 3.1),
      rd: rc * (wedge ? R(1.3, 1.7) : R(2.1, 3)) + 22, hd: R(70, 130) + ef * 25 + (wedge ? 60 : 0),
      // most come all the way down, some only hang half way with the dust spinning under them
      reach: Math.random() < 0.72 ? 1 : R(0.35, 0.8),
      dirt: R(0.25, 0.85),
      life: R(150, 260) + ef * R(30, 70),
      base: { x: 0, z: 0, y: 0 }, top: { x: 0, z: 0, y: 0 }, vx: 0, vz: 0,
      I: 0, V: 0, Rc: rc, Rt: 0, Rd: 0, Hd: 0, dust: 0, rope: 0, reachNow: 0, wig: 0,
    };
    // A broad one is rarely one vortex: suction vortices go round inside it, small and far more
    // violent than the rest of it. They're where the worst of the damage is.
    t.subN = wedge ? 3 + (Math.random() * 3 | 0) : ef >= 3 && Math.random() < 0.4 ? 2 : 0; t.subA = Math.random() * 6.283;
    // it can't outlive its storm's rotation
    t.life = Math.max(90, Math.min(t.life, c.life - c.fade * 1.5 - c.age - 10));
    this.place(t, 0);
    t.base.x = t.top.x + t.offX; t.base.z = t.top.z + t.offZ;
    this.list.push(t);
    return t;
  }
  // where its top hangs and where its foot wants to be, against the top
  place(t, dt) {
    const c = t.c, W = this.wx, [ox, oz] = W.rainOff(c);
    t.top.x = c.x + ox * 0.18; t.top.z = c.z + oz * 0.18;
    t.top.y = wallFoot(Math.max(W.meso(c), 0.9));
    const sl = Math.hypot(c.vx, c.vz) || 1, hx = c.vx / sl, hz = c.vz / sl, lx = hz, lz = -hx;
    const H = Math.max(120, t.top.y - t.base.y);
    // The foot trails the top a little, and wanders from side to side under it; as it ropes out
    // the storm leaves it behind and to the left, so it leans far over.
    const lag = H * (0.06 + 0.75 * t.rope), side = H * 0.5 * t.rope + (vn(t.age / 48 + t.seed * 31) - 0.5) * H * 0.7;
    t.offX = -hx * lag + lx * side; t.offZ = -hz * lag + lz * side;
  }
  step(t, dt) {
    t.age += dt;
    const a = t.age / t.life, c = t.c;
    // how strong it is now: it spins up, pulses stronger and weaker, and dies away
    t.I = ss(0.03, 0.3, a) * (1 - ss(0.78, 1, a)) * (0.68 + 0.32 * vn(t.age / 17 + t.seed * 50));
    t.V = 14 + (t.vpk - 14) * t.I;
    t.rope = ss(0.68, 0.92, a);
    const grow = ss(0.04, 0.4, a);
    t.Rc = t.rc * (0.4 + 0.6 * grow) * (1 - 0.82 * t.rope) * (0.88 + 0.24 * vn(t.age / 29 + 7 + t.seed * 13));
    t.Rt = t.rt * (0.65 + 0.35 * grow) * (1 - 0.5 * t.rope);
    // dust comes first, before there's any funnel above it
    t.dust = ss(0, 0.05, a) * (1 - ss(0.86, 0.98, a)) * (0.45 + 0.55 * t.I);
    t.Rd = Math.max(t.Rc * 1.15, t.rd * (0.45 + 0.55 * grow) * (1 - 0.7 * t.rope));
    t.Hd = t.hd * (0.6 + 0.4 * t.I) * (1 - 0.45 * t.rope);
    // The funnel lowers out of the cloud, and may draw back up a way and come down again. A rope's
    // condensation thins and breaks (the shader does that), at the very end it goes back up.
    t.reachNow = t.reach * ss(0.06, 0.3, a) * (1 - 0.4 * ss(0.62, 0.9, vn(t.age / 24 + t.seed * 9)) * (1 - t.rope)) * (1 - ss(0.94, 1, a));
    t.wig = 0.015 + 0.13 * t.rope;
    // the suction vortices go round at about half the wind's speed
    t.subA += dt * 0.5 * t.V / (0.7 * t.Rc);
    // the top goes with the storm, the foot follows it as on a string
    this.place(t, dt);
    t.base.x += c.vx * dt + (t.top.x + t.offX - t.base.x) * Math.min(1, dt / 16);
    t.base.z += c.vz * dt + (t.top.z + t.offZ - t.base.z) * Math.min(1, dt / 16);
    t.vx = c.vx; t.vz = c.vz;
    t.base.y = height(t.base.x, t.base.z);
    c.torI = Math.max(c.torI || 0, t.I);
  }
  update(dt, x, z) {
    this.t += dt;
    const W = this.wx;
    for (const c of W.cells) {
      if (!c.sup) continue;
      c.torI = 0;
      const m = W.meso(c);
      // whether this one will put any down is rolled once it rotates; when, nobody knows
      if (!c.plan && m > 0.55) {
        let p = Math.random(), n = 0;
        while (n < ODDS.length - 1 && p >= ODDS[n]) p -= ODDS[n++];
        c.plan = { left: n, wait: R(15, 170) };
      }
      if (c.plan?.left > 0 && m > 0.7 && !this.list.some(t => t.c === c) && (c.plan.wait -= dt) <= 0) {
        c.plan.left--; c.plan.wait = R(100, 260);
        this.spawn(c);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      if (t.age > t.life || !W.cells.includes(t.c)) { this.list.splice(i, 1); continue; }
      this.step(t, dt);
    }
  }
  // Shift+O: a tornado now. Under a supercell already near, else a grown one a couple of km off,
  // coming your way, with its tornado about to touch down.
  force(x, z) {
    const W = this.wx;
    let c = W.cells.filter(k => k.sup && W.meso(k) > 0.5).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    if (!c || Math.hypot(c.x - x, c.z - z) > 9000) {
      c = W.spawn('storm', x, z, 0, undefined, true);
      c.age = c.grow * 1.7;
      W.move(c, 0);
      // put its wall cloud some 2 km ahead of you, passing 0.1 to 0.7 km to one side
      const sl = Math.hypot(c.vx, c.vz) || 1, hx = c.vx / sl, hz = c.vz / sl, d = R(1800, 2600), off = R(100, 700) * (Math.random() < 0.5 ? -1 : 1);
      const [ox, oz] = W.rainOff(c);
      c.x = x - hx * d - hz * off - ox * 0.18; c.z = z - hz * d + hx * off - oz * 0.18;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].c === c) this.list.splice(i, 1);
    c.plan = { left: 0, wait: 0 };
    return this.spawn(c, true);
  }
  // the axis of t at height y: from its foot up to the top, leaning as it does in the shader
  axis(t, y, out) {
    const H = Math.max(60, t.top.y - t.base.y), s = Math.min(1, Math.max(0, (y - t.base.y) / H)), k = Math.pow(s, 0.8 - 0.35 * t.rope);
    out.x = t.base.x + (t.top.x - t.base.x) * k; out.z = t.base.z + (t.top.z - t.base.z) * k;
    return out;
  }
  // The air the tornadoes move at x, y, z, m/s, added to the day's wind. Tangential speed rises
  // through the core and falls off outside it (a modified Rankine vortex), the air along the
  // ground spirals in, and in the core it goes up hard.
  windAt(x, y, z, out) {
    out.x = out.y = out.z = 0; out.core = 0;
    for (const t of this.list) {
      if (t.V <= 0) continue;
      const ax = this.axis(t, y, tmpA), dx = x - ax.x, dz = z - ax.z, r = Math.hypot(dx, dz) || 0.01;
      const Rm = t.Rc, h = y - t.base.y, u = r / Rm;
      if (u > 18) continue;
      const vt = t.V * (u < 1 ? u : Math.pow(1 / u, 0.65)) * Math.exp(-u * u / 196);
      // (near the ground friction slows the spin and the air rushes in nearly as hard as it goes round)
      const inflow = 0.62 * t.V * ss(0.3, 1.2, u) * Math.pow(1 / Math.max(u, 1), 0.6) * Math.exp(-Math.max(h, 0) / 50);
      // The updraft rises right off the ground; higher up it slackens for anything heavy and the
      // spin flings it outwards, so what goes up comes down again some way off.
      const up = 0.9 * t.V * Math.exp(-u * u / 1.5) * ss(-2, 3, h) * (0.3 + 0.7 * Math.exp(-Math.max(0, h - 35) / 60));
      const fling = 0.3 * t.V * ss(25, 90, h) * ss(0.2, 1.1, u) * Math.exp(-u * u / 9);
      // the storm's own motion adds to it near the core: the right side of the track blows hardest
      const tr = Math.exp(-u * u / 16);
      out.x += dz / r * vt + dx / r * (fling - inflow) + t.vx * tr;
      out.z += -dx / r * vt + dz / r * (fling - inflow) + t.vz * tr;
      out.y += up;
      out.core = Math.max(out.core, t.I * Math.exp(-u * u / 4));
      if (t.subN && u < 1.6 && h < 120) for (let k = 0; k < t.subN; k++) {
        const a = t.subA + k * 6.283 / t.subN, sx = dx - Math.cos(a) * 0.7 * Rm, sz = dz - Math.sin(a) * 0.7 * Rm, rs = Math.hypot(sx, sz) || 0.01, us = rs / 16;
        if (us > 6) continue;
        const vs = 0.5 * t.V * (us < 1 ? us : 1 / us) * Math.exp(-h / 90);
        out.x += sz / rs * vs; out.z += -sx / rs * vs;
        out.y += 0.55 * t.V * Math.exp(-us * us) * ss(-2, 3, h);
        out.core = Math.max(out.core, t.I * Math.exp(-us * us / 3));
      }
    }
    return out;
  }
  // how far x, z is from the nearest one's foot, and how strong that is
  near(x, z) {
    let d = Infinity, I = 0;
    for (const t of this.list) { const e = Math.hypot(t.base.x - x, t.base.z - z); if (e < d) { d = e; I = t.I; } }
    return { d, I };
  }
}
const tmpA = { x: 0, z: 0 };

// ---- the picture --------------------------------------------------------------------------------
const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
const FRAG = /* glsl */`
  #include <packing>
  precision highp sampler3D;
  uniform sampler2D tDepth; uniform sampler3D uNoise;
  uniform float uNear, uFar, uFogD, uFogEdge; uniform vec2 uTan; uniform mat3 uCamRot; uniform vec3 uCam;
  uniform vec4 uB;    // foot x, ground y, foot z, the top's height (the wall cloud's foot)
  uniform vec4 uTp;   // top x, top z, the funnel's radius at the ground and at the top
  uniform vec4 uS;    // how far down the funnel reaches 0..1, dust 0..1, rope 0..1, strength 0..1
  uniform vec4 uS2;   // time, how fast it flares (the radius goes as height ^ this), dirt in the funnel, seed
  uniform vec4 uW;    // how far the rope snakes, m, its phase, the debris cloud's radius and height
  uniform vec4 uSub;  // suction vortices: how many, their angle, the ring they go round on
  uniform vec3 uSun, uSunC, uAmb, uHaze, uDustC, uCondC;
  uniform int uSteps;
  varying vec2 vUv;
  ${HAZE}
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
  // The air between, as the scene's own haze has it. Past the drawn land the thick-weather part
  // stops growing: there is nothing out there to hide, and a tornado should show from kilometres.
  vec3 hazed(vec3 L, float T, float d) {
    float de = min(d, uFogEdge);
    return mix(uHaze * (1. - T), L, exp(-uFogD * d * .45) * exp(-uFogD * uFogD * de * de * .6));
  }
  float hg(float mu, float g) { float g2 = g * g; return (1. - g2) / pow(1. + g2 - 2. * g * mu, 1.5); }
  vec2 turn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  // the axis at height s (0 the ground, 1 the top): it leans from the foot up to the top, more as it
  // ropes out, and a rope snakes
  vec2 axisAt(float s) {
    float sc = clamp(s, 0., 1.);
    vec2 c = mix(uB.xz, uTp.xy, pow(sc, .8 - .35 * uS.z));
    float w = uW.x * sc * (1. - sc) * 4.;
    return c + w * vec2(sin(sc * 8.3 + uW.y), sin(sc * 5.7 - uW.y * 1.3 + 1.7));
  }
  // narrow at the ground and flaring up into the cloud
  float radiusAt(float s) {
    return mix(uTp.z, uTp.w, pow(clamp(s, 0., 1.), uS2.y)) * (1. + .25 * smoothstep(.9, 1.15, s));
  }
  // A vortex's noise: turning anticlockwise round its axis at w rad/s and rising at the same time.
  // Read twice, half a period apart, and crossfaded, so it never winds itself into a tight spiral.
  // sc: the size of its features across and along the axis (tall ones make the striations).
  float swirl(vec3 p, vec2 q, float w, float rise, vec2 sc, float off) {
    float n = 0.;
    for (int k = 0; k < 2; k++) {
      float ph = fract(uS2.x / 7. + float(k) * .5), a = w * ph * 7.;
      vec2 r = turn(q, a + p.y * .006);
      vec3 c = vec3(r.x / sc.x, (p.y - rise * ph * 7.) / sc.y, r.y / sc.x) + off + float(k) * .37;
      n += (texture(uNoise, c).r * .6 + texture(uNoise, c * 2.9).g * .28 + texture(uNoise, c * 8.3).g * .12) * (1. - abs(2. * ph - 1.));
    }
    return n;
  }
  void main() {
    gl_FragColor = vec4(0., 0., 0., 1.);
    vec3 rd = normalize(uCamRot * vec3((vUv * 2. - 1.) * uTan, -1.));
    float dp = texture2D(tDepth, vUv).r, far = 1e6;
    if (dp < .99999) { float z = perspectiveDepthToViewZ(dp, uNear, uFar); far = length(vec3((vUv * 2. - 1.) * uTan * -z, z)); }
    // a cylinder round all of it, and the ground and the cloud as its floor and lid
    float gy = uB.y, H = max(uB.w - gy, 60.);
    vec2 mid = (uB.xz + uTp.xy) * .5;
    float Rb = length(uB.xz - uTp.xy) * .5 + max(uTp.w * 2.9, uW.z * 2.7) + uW.x + 10.;
    vec2 oc = uCam.xz - mid;
    float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), c = dot(oc, oc) - Rb * Rb, t0 = 0., t1 = 1e6;
    if (a > 1e-7) { float h = b * b - a * c; if (h < 0.) return; h = sqrt(h); t0 = (-b - h) / a; t1 = (-b + h) / a; }
    else if (c > 0.) return;
    float y0 = gy - 4., y1 = uB.w + H * .14 + 30.;
    if (abs(rd.y) > 1e-5) { float ta = (y0 - uCam.y) / rd.y, tb = (y1 - uCam.y) / rd.y; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
    else if (uCam.y < y0 || uCam.y > y1) return;
    // Land fading into the haze near the edge of the drawn world (HAZE) is mostly sky by now: there
    // the march goes on past it, and the two results are blended by how much of the land still shows.
    float ew = far < 1e5 ? hazeEdge(far, uFogEdge) : 0.;
    t0 = max(t0, 0.); t1 = min(t1, ew > .002 ? 1e6 : far);
    if (t1 <= t0) return;

    float T = 1., t = t0, jit = ign(gl_FragCoord.xy), dsum = 0., wsum = 0., Tc = 1., dc = 0.;
    vec3 L = vec3(0.), Lc = vec3(0.);
    bool cut = far <= t0;
    // backlit, the thin edges glow with the light coming through them
    float fwd = hg(dot(rd, uSun), .62);
    float s0 = 1. - uS.x * 1.06;
    for (int i = 0; i < 200; i++) {
      if (i >= uSteps || t > t1 || T < .02) break;
      // what lies in front of the land: kept for the blend at the end
      if (!cut && t > far) { cut = true; Lc = L; Tc = T; dc = wsum > 0. ? dsum / wsum : t0; }
      vec3 p = uCam + rd * t;
      float s = (p.y - gy) / H, yd = p.y - gy;
      vec2 q = p.xz - axisAt(s), qd = p.xz - axisAt(yd / H * .5);
      float r = length(q), R = radiusAt(s), rr = length(qd);
      float Rd = uW.z * (.8 + .45 * clamp(yd / max(uW.w, 1.), 0., 1.4)), Hd = uW.w;
      // far from both, take long steps (the ray can't come nearer than the gap in one step)
      // (sideways or up and down, whichever is further: the ray is at least that far from it)
      float gapF = max(r - R * 1.35, max(s0 - .05 - s, s - 1.25) * H), gapD = uS.y > 0. ? max(rr - Rd * 1.4, yd - Hd * 1.5) : 1e5;
      float gap = min(gapF, gapD);
      if (gap > 2.) { t += max(gap * .45, 2.); continue; }
      // inside: steps a fraction of what is being crossed, sampled at a different spot in each pixel
      float st = clamp(min(gapF <= 2. ? R : 1e4, gapD <= 2. ? Rd : 1e4) * .1, .6, 14.);
      p = uCam + rd * (t + st * jit);
      s = (p.y - gy) / H; yd = p.y - gy;
      q = p.xz - axisAt(s); qd = p.xz - axisAt(yd / H * .5);
      r = length(q); R = radiusAt(s); rr = length(qd);
      float dens = 0., dust = 0., shell = 1., tex = .5, texD = .5;
      vec3 alb = uCondC;
      // the condensation funnel, from the cloud down as far as it reaches; its tip tapers to a point
      if (s > s0 && s < 1.25 && r < R * 1.4) {
        float tip = smoothstep(s0, s0 + .05 + .16 * (1. - uS.x), s), Rt = R * sqrt(tip) + .4;
        float w = min(2.4, (6. + uS.w * 40.) / max(Rt, 5.));
        float n = swirl(p, q, w, 9., vec2(Rt * 1.1 + 5., 70. + Rt), uS2.w);
        float e = r / Rt + (n - .5) * .5;
        // the same noise shades the skin: streaks going round with it
        tex = n;
        // condensation has a crisp edge: the air either is saturated or it isn't
        // (and up top it thins away into the wall cloud it hangs from, no rim where it meets it)
        dens = (1. - smoothstep(.86, 1., e)) * (1. - smoothstep(.88, 1.15, s + (n - .5) * .2));
        // a rope's condensation breaks up into lengths
        dens *= mix(1., smoothstep(.38, .58, texture(uNoise, vec3(s * 1.3, uS2.w, uS2.x * .012)).r), uS.z * .9);
        shell = smoothstep(.15, 1., r / Rt);
        // low down it takes the colour of what it has picked up
        alb = mix(uCondC, uDustC * 1.1, uS2.z * (1. - smoothstep(0., .5, s)) * smoothstep(0., .3, uS.x - .7));
      }
      // the debris cloud round its foot: a skirt of dust thrown up and out, wider as it rises
      if (uS.y > 0. && yd < Hd * 1.5 && rr < Rd * 1.4) {
        float wd = min(3., (5. + uS.w * 50.) / max(Rd, 8.));
        float nd = swirl(p, qd, wd, 3., vec2(Rd * .5 + 4., Hd * .4 + 6.), uS2.w + .5);
        float e = rr / Rd + (nd - .5) * .95;
        texD = nd;
        // billowing heaps with a fairly crisp edge, thinning upwards
        dust = (1. - smoothstep(.62, .98, e)) * (1. - smoothstep(.3, 1., yd / Hd + (nd - .5) * .8)) * smoothstep(-3., 3., yd) * uS.y;
        // each suction vortex lifts a narrow, dense whirl of its own
        for (int k = 0; k < 5; k++) {
          if (float(k) >= uSub.x) break;
          float a = uSub.y + float(k) * 6.2832 / uSub.x, ds = length(qd - uSub.z * vec2(cos(a), sin(a))) / (12. + .12 * uSub.z) + (nd - .5) * .6;
          float sv = exp(-ds * ds) * (1. - smoothstep(.35, 1.25, yd / Hd + (nd - .5) * .5)) * smoothstep(-3., 3., yd) * uS.y;
          if (sv > dust) { dust = sv; texD = nd * .7; }
        }
      }
      float sigma = dens * .075 + dust * .04;
      if (sigma > .0003) {
        vec3 nrm = vec3(q.x, 0., q.y) / max(r, .01);
        // dust scatters more of the light round it than the funnel's dark condensation does
        float f = dens / max(dens + dust, 1e-4), sh = mix(1.2, shell, f);
        vec3 al = mix(uDustC * 1.6, alb, f);
        float lam = .55 + .45 * dot(nrm, uSun);
        // it stands in the storm's shade: lit from round the horizon, darker inside and low down
        // (lightest half way up: low down it's in the dust's shade, up top in the storm's)
        float lift = mix(.7, 1., smoothstep(0., .4, s)) * mix(1., .55, smoothstep(.6, 1.05, s));
        vec3 S = al * (uAmb * (.04 + .13 * sh) * lift + uSunC * (lam * sh * .2 + fwd * .22 * (1. - .7 * min(dens + dust, 1.))) * lift);
        S *= .55 + .9 * mix(texD, tex, f);
        float k = T * (1. - exp(-sigma * st));
        L += S * k; dsum += t * k; wsum += k;
        T *= exp(-sigma * st);
      }
      t += st;
    }
    float dm = wsum > 0. ? dsum / wsum : t0;
    if (!cut) { Lc = L; Tc = T; dc = dm; }
    gl_FragColor = mix(vec4(hazed(Lc, Tc, dc), Tc), vec4(hazed(L, T, dm), T), ew);
  }`;

export class TornadoView {
  constructor(renderer, pass, noise) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    const v3 = () => ({ value: new THREE.Vector3() }), v4 = () => ({ value: new THREE.Vector4() });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: pass.U.tDepth, uNear: pass.U.uNear, uFar: pass.U.uFar, uTan: pass.U.uTan, uNoise: { value: noise },
        uCamRot: { value: new THREE.Matrix3() }, uCam: v3(), uFogD: LIT.uFogD, uFogEdge: LIT.uFogEdge, uSteps: { value: 64 },
        uB: v4(), uTp: v4(), uS: v4(), uS2: v4(), uW: v4(), uSub: v4(),
        uSun: v3(), uSunC: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
        uDustC: { value: new THREE.Color(0.42, 0.34, 0.24) }, uCondC: { value: new THREE.Color(0.6, 0.62, 0.66) },
      },
    });
    this.quad = new FullScreenQuad(this.mat);
    this.res = 0.5; this.on = false;
  }
  get texture() { return this.rt.texture; }
  setQuality(q) { this.res = q.cloud[0]; this.mat.uniforms.uSteps.value = Math.round(q.cloud[1] * 2.6); }
  // t: the tornado to draw (or none), time in s, and the light it stands in
  update(t, time, light) {
    this.on = !!t;
    if (!t) return;
    const u = this.mat.uniforms;
    u.uB.value.set(t.base.x, t.base.y, t.base.z, t.top.y);
    u.uTp.value.set(t.top.x, t.top.z, t.Rc * (t.wedge ? 1 : 0.85), t.Rt);
    u.uS.value.set(t.reachNow, t.dust, t.rope, t.I);
    u.uS2.value.set(time, t.k, t.dirt, t.seed * 7.3);
    u.uW.value.set((t.top.y - t.base.y) * t.wig, t.age * 0.22, t.Rd, t.Hd);
    u.uSub.value.set(t.subN * ss(0.15, 0.4, t.I), t.subA, 0.7 * t.Rc, 0);
    u.uSun.value.copy(light.dir); u.uSunC.value.copy(light.sun); u.uAmb.value.copy(light.amb); u.uHaze.value.copy(light.haze);
    if (light.soil) u.uDustC.value.setRGB(...light.soil);
  }
  render(camera, w, h) {
    const W = Math.max(1, Math.round(w * this.res)), H = Math.max(1, Math.round(h * this.res));
    if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
    const u = this.mat.uniforms;
    u.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    camera.getWorldPosition(u.uCam.value);
    this.renderer.setRenderTarget(this.rt); this.quad.render(this.renderer);
  }
}

// ---- what it throws about ---------------------------------------------------------------------
// Boards, sheets of roofing and branches torn up round its foot, carried round and up by its wind and
// flung out; a few hundred, only while you are near enough to see them. The dust and the small stuff
// are particles (fx.js), which follow the same wind.
const DEB_N = 220;
export class Debris {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), DEB_N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    const col = new THREE.Color();
    this.p = Array.from({ length: DEB_N }, (_, i) => {
      const kind = i % 3;
      // board, sheet, branch: sizes in metres, and how hard the wind takes it (drag over mass)
      const size = kind === 0 ? [R(1.2, 3), 0.04, R(0.12, 0.25)] : kind === 1 ? [R(0.7, 1.6), 0.02, R(0.6, 1.2)] : [R(0.8, 2.2), R(0.06, 0.14), R(0.06, 0.14)];
      this.mesh.setColorAt(i, kind === 0 ? col.setRGB(0.32, 0.24, 0.16) : kind === 1 ? col.setRGB(0.36, 0.37, 0.38) : col.setRGB(0.2, 0.15, 0.1));
      return { on: false, pos: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), size: new THREE.Vector3(...size), k: kind === 1 ? R(0.05, 0.09) : R(0.012, 0.035) };
    });
    this.mesh.instanceColor.needsUpdate = true;
    this.hide();
    scene.add(this.mesh);
    this.fv = { x: 0, y: 0, z: 0 };
  }
  hide() { const m = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < DEB_N; i++) { this.mesh.setMatrixAt(i, m); this.p[i].on = false; } this.mesh.instanceMatrix.needsUpdate = true; this.shown = false; }
  update(dt, tor, cam) {
    const t = tor.main;
    if (!t || Math.hypot(t.base.x - cam.x, t.base.z - cam.z) > 1600) { if (this.shown) this.hide(); return; }
    this.shown = true;
    const m = tmpM, fv = this.fv;
    // a few pieces picked up each second where its wind is strong enough
    let lift = dt * 40 * t.I * t.dust;
    for (let i = 0; i < DEB_N; i++) {
      const p = this.p[i];
      if (!p.on) {
        if (lift < Math.random()) continue;
        lift -= 1;
        const a = Math.random() * 6.283, r = t.Rc * R(0.6, 2.2), x = t.base.x + Math.cos(a) * r, z = t.base.z + Math.sin(a) * r;
        p.pos.set(x, height(x, z) + 0.3, z); p.v.set(0, R(3, 9), 0); p.w.set(R(-6, 6), R(-6, 6), R(-6, 6)); p.on = true;
      }
      tor.windAt(p.pos.x, p.pos.y, p.pos.z, fv);
      // drag towards the wind, quadratic, then gravity
      const rx = fv.x - p.v.x, ry = fv.y - p.v.y, rz = fv.z - p.v.z, rl = Math.hypot(rx, ry, rz);
      p.v.x += rx * rl * p.k * dt; p.v.y += (ry * rl * p.k - 9.81) * dt; p.v.z += rz * rl * p.k * dt;
      p.pos.addScaledVector(p.v, dt);
      tq2.setFromAxisAngle(tv2.copy(p.w).normalize(), p.w.length() * dt); p.q.premultiply(tq2);
      const g = ground(p.pos.x, p.pos.z, p.pos.y + 1);
      if (p.pos.y < g) {
        p.pos.y = g; p.v.multiplyScalar(0.35); p.w.multiplyScalar(0.5);
        // what lands where the wind can't take it again lies there till it's picked up out of sight
        if (rl < 18) { p.on = false; m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); continue; }
      }
      m.compose(p.pos, p.q, p.size); this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // dust off the ground and the small stuff, as particles, near enough for them to show
  particles(dt, tor, fx, cam) {
    const t = tor.main;
    if (!t || t.dust < 0.05) return;
    const dc = Math.hypot(t.base.x - cam.x, t.base.z - cam.z);
    if (dc > 900) return;
    const tn = fx.tint;
    for (let k = dt * 90 * t.dust * (1 - dc / 900); k > Math.random(); k -= 1) {
      const a = Math.random() * 6.283, r = t.Rd * Math.sqrt(Math.random()) * 1.2, x = t.base.x + Math.cos(a) * r, z = t.base.z + Math.sin(a) * r, y = height(x, z);
      const col = SOIL[surface(x, z).kind] || SOIL[KIND.PATH], big = Math.random() < 0.55;
      // (in the storm's shade: dust lit by the sun would glow)
      if (big) fx.spawn(x, y + R(1, 12), z, 0, R(2, 8), 0, R(3, 7), R(4, 9), R(6, 14), col[0] * tn.r * 0.4, col[1] * tn.g * 0.4, col[2] * tn.b * 0.4, R(0.1, 0.22), -0.4, 0.9, false, true);
      else fx.spawn(x, y + 0.5, z, 0, R(4, 12), 0, R(2, 5), R(0.06, 0.2), 0, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 1, 9.8, 0.35, false, true);
    }
  }
}
const tmpM = new THREE.Matrix4(), tq2 = new THREE.Quaternion(), tv2 = new THREE.Vector3();
