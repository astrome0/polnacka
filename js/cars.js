// Four cars. Bodies are lofted from cross-sections so every panel is a real dense sheet that can
// dent, and each door, hood and bumper is its own mesh that can come off. Model space: +Z is
// forward, Y=0 is the ground at ride height.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dialFace, plateTexture } from './textures.js';

// ---- spec sheets ----------------------------------------------------------------------------
const st = (z, low, mid, w, belt, wb, top, wt) => ({ z, low, mid, w, belt, wb, top, wt });

export const CARS = [
  {
    id: 'rally', name: 'Fénix R5', tag: 'Rallye hatchback', blurb: 'Lehký, 4×4, skáče přes pole jako koza.',
    paint: 0xc8141e, roughness: 0.3, plate: 'PLE 4X4', trim: 0x14161a, kind: 'hatch', hwRoll: true,
    stations: [
      st(-1.96, 0.42, 0.6, 0.6, 0.76, 0.54, 0.8, 0.4), st(-1.92, 0.34, 0.62, 0.8, 0.88, 0.72, 0.96, 0.5), st(-1.78, 0.27, 0.62, 0.86, 0.95, 0.8, 1.13, 0.58),
      st(-1.32, 0.25, 0.62, 0.88, 0.97, 0.82, 1.4, 0.62), st(-0.3, 0.25, 0.62, 0.9, 0.97, 0.83, 1.45, 0.64), st(0.34, 0.25, 0.62, 0.9, 0.96, 0.83, 1.43, 0.63),
      st(1.04, 0.25, 0.62, 0.9, 0.93, 0.82, 0.98, 0.68), st(1.72, 0.26, 0.6, 0.87, 0.8, 0.76, 0.83, 0.62), st(1.92, 0.3, 0.56, 0.77, 0.7, 0.65, 0.72, 0.5), st(1.98, 0.38, 0.54, 0.6, 0.62, 0.5, 0.64, 0.36),
    ],
    marks: { cowl: 1.04, roofF: 0.34, roofR: -1.32, tail: -1.78, doorF: 0.84, doorR: -0.52, bumpF: 1.76, bumpR: -1.8, pillars: [[-0.56, -0.44]], hoodEnd: 1.92 },
    wheel: { r: 0.33, w: 0.26, knobby: true, rim: 0xe6e8ea, spokes: 6 }, axle: { f: 1.28, r: -1.3 }, track: 0.8,
    eye: [0.36, 1.16, -0.3], wheelPos: [0.36, 0.91, 0.24], dashZ: 0.92,
    phys: { mass: 1180, comY: 0.5, I: [1800, 2200, 620], k: 34000, c: 3600, travel: 0.26, torque: 420, redline: 7600, idle: 950, gears: [3.3, 2.2, 1.6, 1.22, 0.96, 0.78], final: 4.1, drive: 'awd', mu: 1.08, nitro: 1.0, brake: 2600, top: 58, offroad: 1 },
  },
  {
    id: 'pickup', name: 'Buvol 4×4', tag: 'Pracovní pickup', blurb: 'Těžký, vysoký a nenechá se zastavit bahnem.',
    paint: 0x2a5d4a, roughness: 0.42, plate: '4B4 HNOJ', trim: 0x24262a, kind: 'pickup',
    stations: [
      st(-2.72, 0.66, 0.92, 0.86, 1.2, 0.84, 1.24, 0.72), st(-2.68, 0.56, 0.95, 0.96, 1.26, 0.94, 1.3, 0.8), st(-2.4, 0.54, 0.96, 1.0, 1.28, 0.98, 1.32, 0.84),
      st(-0.72, 0.54, 0.96, 1.0, 1.28, 0.98, 1.32, 0.84), st(-0.66, 0.54, 0.96, 1.0, 1.3, 0.96, 1.86, 0.74), st(0.1, 0.54, 0.96, 1.0, 1.3, 0.95, 1.92, 0.76), st(0.74, 0.54, 0.96, 1.0, 1.3, 0.95, 1.88, 0.75),
      st(1.46, 0.54, 0.96, 1.0, 1.26, 0.94, 1.36, 0.82), st(2.3, 0.56, 0.94, 0.97, 1.2, 0.9, 1.26, 0.76), st(2.54, 0.6, 0.9, 0.92, 1.1, 0.84, 1.16, 0.66), st(2.6, 0.68, 0.88, 0.8, 1.02, 0.72, 1.06, 0.54),
    ],
    marks: { cowl: 1.46, roofF: 0.74, roofR: -0.66, tail: -0.72, doorF: 1.22, doorR: -0.42, bumpF: 2.34, bumpR: -2.42, pillars: [[-0.48, -0.32]], hoodEnd: 2.54, bed: [-2.5, -0.74] },
    wheel: { r: 0.44, w: 0.32, knobby: true, rim: 0x2c2e33, spokes: 6 }, axle: { f: 1.62, r: -1.62 }, track: 0.9,
    eye: [0.42, 1.62, 0.02], wheelPos: [0.42, 1.27, 0.58], dashZ: 1.28,
    phys: { mass: 2150, comY: 0.84, I: [4800, 5400, 1500], k: 46000, c: 6000, travel: 0.32, torque: 680, redline: 5200, idle: 750, gears: [3.9, 2.4, 1.6, 1.15, 0.86], final: 3.9, drive: 'awd', mu: 1.1, nitro: 0.8, brake: 4600, top: 46, offroad: 1.05 },
  },
  {
    id: 'monster', name: 'Goliáš', tag: 'Monster truck', blurb: 'Přejede cokoliv. Fakt cokoliv. Stromy taky.',
    paint: 0xe07a12, roughness: 0.34, plate: 'NE', trim: 0x16171a, kind: 'pickup', lift: 1.0, scale: 1,
    stations: [
      st(-2.62, 0.62, 0.92, 0.9, 1.2, 0.86, 1.24, 0.72), st(-2.58, 0.54, 0.95, 1.0, 1.26, 0.96, 1.3, 0.8), st(-2.3, 0.52, 0.96, 1.04, 1.28, 1.0, 1.32, 0.84),
      st(-0.72, 0.52, 0.96, 1.04, 1.28, 1.0, 1.32, 0.84), st(-0.66, 0.52, 0.96, 1.04, 1.3, 0.98, 1.82, 0.76), st(0.1, 0.52, 0.96, 1.04, 1.3, 0.97, 1.88, 0.78), st(0.74, 0.52, 0.96, 1.04, 1.3, 0.97, 1.84, 0.77),
      st(1.4, 0.52, 0.96, 1.04, 1.26, 0.96, 1.36, 0.84), st(2.2, 0.54, 0.94, 1.0, 1.2, 0.92, 1.26, 0.78), st(2.44, 0.58, 0.9, 0.94, 1.1, 0.86, 1.16, 0.66), st(2.5, 0.66, 0.88, 0.82, 1.02, 0.72, 1.06, 0.54),
    ],
    marks: { cowl: 1.4, roofF: 0.74, roofR: -0.66, tail: -0.72, doorF: 1.2, doorR: -0.42, bumpF: 2.28, bumpR: -2.34, pillars: [[-0.48, -0.32]], hoodEnd: 2.44, bed: [-2.42, -0.74] },
    wheel: { r: 0.88, w: 0.62, knobby: true, rim: 0xc9ccd0, spokes: 8, big: true }, axle: { f: 1.76, r: -1.76 }, track: 1.26,
    eye: [0.42, 1.62, 0.02], wheelPos: [0.42, 1.27, 0.58], dashZ: 1.26,
    phys: { mass: 4300, comY: 1.5, I: [9800, 11000, 5000], k: 62000, c: 9000, travel: 0.72, torque: 2100, redline: 5400, idle: 760, gears: [3.4, 2.1, 1.4, 1.0], final: 3.9, drive: 'awd', mu: 1.24, nitro: 0.7, brake: 9000, top: 40, offroad: 1.15 },
  },
  {
    id: 'sport', name: 'Střela GT', tag: 'Supersport', blurb: 'Na silnici raketa. V poli naprostá katastrofa.',
    paint: 0x1d4fb4, roughness: 0.18, plate: 'RYCHLE', trim: 0x101114, kind: 'coupe', stripe: 0xf0f1ee,
    stations: [
      st(-2.2, 0.36, 0.56, 0.72, 0.72, 0.62, 0.76, 0.46), st(-2.14, 0.26, 0.58, 0.92, 0.82, 0.84, 0.88, 0.6), st(-1.82, 0.19, 0.6, 1.0, 0.86, 0.9, 0.93, 0.66),
      st(-1.22, 0.17, 0.58, 1.0, 0.84, 0.86, 1.02, 0.58), st(-0.44, 0.17, 0.52, 0.97, 0.8, 0.82, 1.2, 0.56), st(0.12, 0.17, 0.5, 0.95, 0.78, 0.8, 1.17, 0.55),
      st(0.92, 0.17, 0.52, 0.94, 0.72, 0.84, 0.76, 0.72), st(1.72, 0.18, 0.5, 0.96, 0.6, 0.84, 0.63, 0.68), st(2.08, 0.2, 0.42, 0.86, 0.49, 0.72, 0.51, 0.52), st(2.2, 0.26, 0.36, 0.64, 0.38, 0.52, 0.4, 0.36),
    ],
    marks: { cowl: 0.92, roofF: 0.12, roofR: -0.44, tail: -1.82, doorF: 0.66, doorR: -0.6, bumpF: 1.84, bumpR: -1.98, pillars: [], hoodEnd: 2.12, slope: true },
    wheel: { r: 0.345, w: 0.31, rim: 0xb8bcc4, spokes: 5 }, axle: { f: 1.36, r: -1.36 }, track: 0.85,
    eye: [0.38, 0.93, -0.5], wheelPos: [0.38, 0.69, 0.0], dashZ: 0.62,
    phys: { mass: 1420, comY: 0.42, I: [2300, 2900, 620], k: 60000, c: 6000, travel: 0.13, torque: 760, redline: 8200, idle: 1000, gears: [3.1, 2.15, 1.65, 1.3, 1.05, 0.86, 0.7], final: 3.6, drive: 'rwd', mu: 1.32, nitro: 1.2, brake: 5200, top: 96, offroad: 0.56 },
  },
];

// ---- monotone cubic through key stations -------------------------------------------------------
function pchip(xs, ys) {
  const n = xs.length, m = new Array(n), d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return x => {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Key rows around half a section, bottom centre up to the roof centre.
function sectionKeys(s) {
  const rail = s.belt + (s.top - s.belt) * 0.84;
  return [
    [0, s.low], [s.w * 0.84, s.low], [s.w * 0.985, s.low + (s.mid - s.low) * 0.3], [s.w, s.mid],
    [s.wb, s.belt], [s.wt + (s.wb - s.wt) * 0.14, rail], [s.wt * 0.74, s.top - (s.top - rail) * 0.06], [0, s.top + 0.012],
  ];
}
const ROW_SUB = [3, 1, 2, 3, 4, 2, 3];
const ROWS = ROW_SUB.reduce((a, b) => a + b, 0) + 1;
export const BELT_ROW = ROW_SUB.slice(0, 4).reduce((a, b) => a + b, 0), RAIL_ROW = BELT_ROW + ROW_SUB[4], SILL_ROW = ROW_SUB[0] + ROW_SUB[1];

function ringAt(s) {
  const k = sectionKeys(s), pts = [];
  // catmull through the key points, with a touch of tension so the belt line stays crisp
  for (let i = 0; i < k.length - 1; i++) {
    const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(k.length - 1, i + 2)], n = ROW_SUB[i];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t, T = 0.36;
      const f = (a, b, c, d) => b + (c - a) * T * t + (2 * T * a + (T - 3) * b + (3 - 2 * T) * c - T * d) * t2 + (-T * a + (2 - T) * b + (T - 2) * c + T * d) * t3;
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(k[k.length - 1].slice());
  return pts;
}

function buildGrid(spec) {
  const key = spec.stations, xs = key.map(s => s.z), f = {};
  for (const n of ['low', 'mid', 'w', 'belt', 'wb', 'top', 'wt']) f[n] = pchip(xs, key.map(s => s[n]));
  // dense stations, snapped so every panel edge falls exactly on a grid line
  const marks = spec.marks, zs = new Set(xs.map(z => +z.toFixed(3)));
  const addM = z => z != null && zs.add(+z.toFixed(3));
  for (const k of ['cowl', 'roofF', 'roofR', 'tail', 'doorF', 'doorR', 'bumpF', 'bumpR', 'hoodEnd']) addM(marks[k]);
  (marks.pillars || []).forEach(p => p.forEach(addM)); if (marks.bed) marks.bed.forEach(addM);
  const sorted = [...zs].sort((a, b) => a - b), out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1], n = Math.max(1, Math.ceil((b - a) / 0.085));
    for (let j = 0; j < n; j++) out.push(a + (b - a) * j / n);
  }
  out.push(sorted[sorted.length - 1]);
  const grid = out.map(z => { const s = { z }; for (const n in f) s[n] = f[n](z); return { z, ring: ringAt(s) }; });
  return grid;
}

// ---- cabin light --------------------------------------------------------------------------------
// The cabin is too small for the world shadow map, whose texels are several centimetres wide. So
// each interior fragment traces its way out of a simplified greenhouse: sun that leaves through
// glass lands on it, sun that hits the roof, a pillar or a door does not.
function cabinGLSL(spec) {
  const S = spec.stations, m = spec.marks, n = v => v.toFixed(3), BELT = S[4].belt, TOP = S[4].top - 0.02, H = TOP - BELT;
  const b = (m.pillars || [])[0], BZ = b ? (b[0] + b[1]) / 2 : 99, BH = b ? (b[1] - b[0]) / 2 + 0.01 : 0.01;
  return /* glsl */`
    uniform vec3 uSunLocal; uniform float uSunVis; varying vec3 vCabP;
    float cabEdge(float limit, float v) { return 1. - smoothstep(limit - .012, limit + .012, v); }
    float cabinSun(vec3 p) {
      const float BELT = ${n(BELT)}, TOP = ${n(TOP)}, H = ${n(H)}, WB = ${n(S[4].wb)}, ZC = ${n(m.cowl)}, ZT = ${n(m.tail)};
      const float kx = ${n((S[4].wb - S[4].wt) / H)}, kf = ${n((m.cowl - m.roofF) / H)}, kr = ${n((m.roofR - m.tail) / H)};
      vec3 s = uSunLocal; float sg = s.x < 0. ? -1. : 1., h = p.y - BELT;
      float ty = s.y > .001 ? (TOP - p.y) / s.y : 1e5;
      float dx = sg * s.x + s.y * kx, tx = dx > .001 ? (WB - h * kx - sg * p.x) / dx : 1e5;
      float df = s.z + s.y * kf, tf = df > .001 ? (ZC - h * kf - p.z) / df : 1e5;
      float dr = s.z - s.y * kr, tr = dr < -.001 ? (ZT + h * kr - p.z) / dr : 1e5;
      float t = min(ty, min(tx, min(tf, tr)));
      if (t == ty) return 0.;
      vec3 q = p + s * t;
      float hq = q.y - BELT, open = smoothstep(-.012, .012, hq) * cabEdge(H - .01, hq);
      if (t == tx) {
        open *= cabEdge(ZC - hq * kf - .09, q.z) * cabEdge(-ZT - hq * kr - .07, -q.z);
        open *= 1. - cabEdge(${n(BH)}, abs(q.z - ${n(BZ)}));
      } else open *= cabEdge(WB - hq * kx - .09, abs(q.x));
      return open * uSunVis;
    }
    float cabinOcc(vec3 p) { return mix(.42, .92, smoothstep(${n(BELT - 0.55)}, ${n(BELT + 0.2)}, p.y)); }
  `;
}
const CABIN_VERT = 'uniform mat4 uCabInv; varying vec3 vCabP;\n';
const CABIN_POS = '\n vCabP = (uCabInv * modelMatrix * vec4(transformed, 1.)).xyz;';
// put the sun gate between the light loop and the final mix
const CABIN_LIGHT = /* glsl */`
  float cabS = cabinSun(vCabP), cabO = cabinOcc(vCabP);
  reflectedLight.directDiffuse *= cabS; reflectedLight.directSpecular *= cabS;
  reflectedLight.indirectDiffuse *= cabO; reflectedLight.indirectSpecular *= cabO * .4;`;

// ---- materials ------------------------------------------------------------------------------
export function bodyMaterial(color, rough, env, spec, dirt, cabU) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.55, side: THREE.DoubleSide });
  const a = spec.axle, r = spec.wheel.r + 0.06, axY = spec.wheel.r - (spec.lift || 0);
  m.onBeforeCompile = sh => {
    sh.uniforms.uDirt = dirt; Object.assign(sh.uniforms, cabU);
    sh.vertexShader = CABIN_VERT + 'attribute vec3 aRest; attribute float aEdge; varying vec3 vRest; varying float vEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest=aRest; vEdge=aEdge;' + CABIN_POS);
    sh.fragmentShader = cabinGLSL(spec) + /* glsl */`
      varying vec3 vRest; varying float vEdge; uniform float uDirt;
      float dn(vec3 p){ return fract(sin(dot(floor(p),vec3(12.9,78.2,37.7)))*43758.5); }
      float dv(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(dn(i),dn(i+vec3(1,0,0)),f.x),mix(dn(i+vec3(0,1,0)),dn(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(dn(i+vec3(0,0,1)),dn(i+vec3(1,0,1)),f.x),mix(dn(i+vec3(0,1,1)),dn(i+vec3(1,1,1)),f.x),f.y),f.z); }
    ` + sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      if (abs(vRest.x) > ${(spec.axleInset ?? 0.42).toFixed(3)} && (length(vRest.zy - vec2(${a.f.toFixed(3)}, ${axY.toFixed(3)})) < ${r.toFixed(3)} || length(vRest.zy - vec2(${a.r.toFixed(3)}, ${axY.toFixed(3)})) < ${r.toFixed(3)})) discard;
      float seam = smoothstep(.0, .16, vEdge);
      diffuseColor.rgb *= seam * .95 + .05;
      if (!gl_FrontFacing) diffuseColor.rgb = vec3(.3,.3,.31);
      float dN = dv(vRest*5.)*.55 + dv(vRest*17.)*.3 + dv(vRest*51.)*.15;
      float dirtA = smoothstep(.0,1.,uDirt*1.5 - (vRest.y-.2)*.75 + dN*.55 - .25) * .96;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.075,.052,.03)*(.7+dN*.6), dirtA);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 1., smoothstep(.2,.7,uDirt*1.3-(vRest.y-.3)*.6));')
      // the inside of the sheet ignores the coarse world shadows and uses the cabin trace instead
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll('receiveShadow', '(receiveShadow && gl_FrontFacing)'))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        if (!gl_FrontFacing) { ${CABIN_LIGHT} clearcoatSpecularDirect *= 0.; clearcoatSpecularIndirect *= 0.; }`);
  };
  m.customProgramCacheKey = () => 'body' + spec.id;
  return m;
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function roundedBox(w, h, d, x, y, z, r0 = 0.03) {
  const s = new THREE.Shape(), a = w / 2, b = h / 2, r = Math.min(r0, a * 0.9, b * 0.9);
  s.moveTo(-a + r, -b); s.lineTo(a - r, -b); s.quadraticCurveTo(a, -b, a, -b + r); s.lineTo(a, b - r); s.quadraticCurveTo(a, b, a - r, b); s.lineTo(-a + r, b); s.quadraticCurveTo(-a, b, -a, b - r); s.lineTo(-a, -b + r); s.quadraticCurveTo(-a, -b, -a + r, -b);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 }).translate(x, y, z - d / 2);
}

function buildWheel(spec, env) {
  const { r, w, knobby, rim, spokes, big } = spec.wheel, g = new THREE.Group();
  const hw = w / 2, rimR = r * (big ? 0.5 : 0.66);
  const prof = [[rimR, -hw * 0.92], [r * 0.9, -hw], [r * 0.975, -hw * 0.92], [r, -hw * 0.66], [r, hw * 0.66], [r * 0.975, hw * 0.92], [r * 0.9, hw], [rimR, hw * 0.92]];
  const tyreG = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 40); tyreG.rotateZ(Math.PI / 2);
  const parts = [tyreG];
  if (knobby) {
    const n = big ? 22 : 30, k = big ? 0.075 : 0.02;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const b = new THREE.BoxGeometry(hw * 0.86, k * 1.8, r * 0.1);
      b.translate(s * hw * 0.5, r + k * 0.3, 0); b.rotateY(s * 0.3); b.rotateX((i + (s > 0 ? 0.5 : 0)) / n * Math.PI * 2);
      parts.push(b);
    }
  }
  const tyre = new THREE.Mesh(mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; })), new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.92 }));
  tyre.geometry.computeVertexNormals();
  g.add(tyre);
  const rimMat = new THREE.MeshStandardMaterial({ color: rim, metalness: 0.9, roughness: 0.32, envMap: env });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, w * 0.92, 28, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a4c50, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }));
  g.add(barrel);
  const hub = [new THREE.CylinderGeometry(rimR * 0.26, rimR * 0.3, 0.05, 16).rotateZ(Math.PI / 2).translate(hw * 0.76, 0, 0), new THREE.TorusGeometry(rimR, r * 0.03, 8, 32).rotateY(Math.PI / 2).translate(hw * 0.86, 0, 0)];
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * Math.PI * 2, s = new THREE.BoxGeometry(0.02, rimR * 0.98, r * 0.11);
    s.translate(hw * 0.78, rimR * 0.52, 0); s.rotateX(a); hub.push(s);
  }
  const face = new THREE.Mesh(mergeGeometries(hub.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; })), rimMat);
  face.geometry.computeVertexNormals();
  g.add(face);
  // brake disc behind the rim
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.76, rimR * 0.76, 0.03, 24).rotateZ(Math.PI / 2).translate(hw * 0.1, 0, 0), new THREE.MeshStandardMaterial({ color: 0x77797d, metalness: 0.9, roughness: 0.4 })));
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// ---- the body ------------------------------------------------------------------------------
function classify(spec, z, row) {
  const m = spec.marks;
  if (m.bed && z > m.bed[0] && z < m.bed[1] && row >= RAIL_ROW - 3) return 'hole';
  if (m.slope) {
    if (row >= BELT_ROW && row < RAIL_ROW - 1 && z > m.roofR - 0.5 && z < m.cowl - 0.12) return 'glass';
    if (row >= RAIL_ROW && z > m.roofF - 0.01 && z < m.cowl) return 'glass';
    if (row >= RAIL_ROW && z > m.tail && z < m.roofR - 0.08) return 'glass';
  } else {
    // the row just under the rail runs up the windscreen edge and is the A-pillar
    if (row >= RAIL_ROW && z > m.roofF && z < m.cowl - 0.04) return 'glass';
    if (row >= BELT_ROW && row < RAIL_ROW - 1 && z > m.roofR + 0.02 && z < m.cowl - 0.1 && !(m.pillars || []).some(p => z > p[0] && z < p[1])) return 'glass';
    if (row >= BELT_ROW && z > m.tail + 0.02 && z < m.roofR - 0.02 && !m.bed) return 'glass';
  }
  if (z >= m.bumpF && row < RAIL_ROW) return 'bumperF';
  if (z <= m.bumpR && row < RAIL_ROW) return 'bumperR';
  if (z > m.cowl && z < m.hoodEnd && row >= BELT_ROW + 1) return 'hood';
  if (row >= SILL_ROW && row < BELT_ROW && z < m.doorF && z > m.doorR) return 'door';
  if (row >= BELT_ROW + 1 && m.bed == null && z < m.tail + 0.02 && z > m.bumpR) return 'trunk';
  return 'shell';
}

export function buildPanels(spec) {
  const grid = buildGrid(spec), NS = grid.length, buckets = {};
  const vert = (s, r, side) => { const p = grid[s].ring[r]; return [p[0] * side, p[1], grid[s].z]; };
  // smooth normals from the sheet before it is cut into panels
  const nrm = new Map();
  const nkey = (s, r, side) => r === 0 || r === ROWS - 1 ? `${s}:${r}` : `${s}:${r}:${side}`;
  const addN = (k, n) => { const v = nrm.get(k); if (v) v.add(n); else nrm.set(k, n.clone()); };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (const side of [1, -1]) for (let s = 0; s < NS - 1; s++) for (let r = 0; r < ROWS - 1; r++) {
    const a = vert(s, r, side), b = vert(s + 1, r, side), c = vert(s + 1, r + 1, side), d = vert(s, r + 1, side);
    A.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); B.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]);
    N.crossVectors(A, B).multiplyScalar(-side);
    for (const [ss, rr] of [[s, r], [s + 1, r], [s + 1, r + 1], [s, r + 1]]) addN(nkey(ss, rr, side), N);
  }
  for (let s = 0; s < NS - 1; s++) for (let r = 0; r < ROWS - 1; r++) for (const side of [1, -1]) {
    const zm = (grid[s].z + grid[s + 1].z) / 2;
    let name = classify(spec, zm, r);
    if (name === 'hole') continue;
    if (name === 'door') name = side > 0 ? 'doorL' : 'doorR';
    if (name === 'glass') name = r >= RAIL_ROW ? (zm > 0 || spec.marks.slope && zm > spec.marks.roofR ? 'glassF' : 'glassB') : side > 0 ? 'glassL' : 'glassR';
    const bk = buckets[name] ||= { cells: new Set(), list: [] };
    bk.list.push([s, r, side]); bk.cells.add(`${s}:${r}:${side}`);
  }
  const out = {};
  for (const name in buckets) {
    const bk = buckets[name], pos = [], nor = [], edge = [], idx = [], map = new Map();
    const has = (s, r, side) => bk.cells.has(`${s}:${r}:${side}`);
    const open = (s, r, side) => {
      // a corner sits on a panel edge when any of its four cells belongs elsewhere
      if (name === 'shell') return 1;
      for (const [a, b] of [[s, r], [s - 1, r], [s, r - 1], [s - 1, r - 1]]) {
        if (b < 0 || b >= ROWS - 1) continue;
        if (!has(a, b, side)) return 0;
      }
      return 1;
    };
    const vid = (s, r, side) => {
      const k = `${s}:${r}:${side}`;
      let id = map.get(k);
      if (id === undefined) {
        id = pos.length / 3; map.set(k, id);
        const p = vert(s, r, side), n = nrm.get(nkey(s, r, side)).clone().normalize();
        pos.push(...p); nor.push(n.x, n.y, n.z); edge.push(open(s, r, side));
      }
      return id;
    };
    for (const [s, r, side] of bk.list) {
      const a = vid(s, r, side), b = vid(s + 1, r, side), c = vid(s + 1, r + 1, side), d = vid(s, r + 1, side);
      if (side > 0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aRest', new THREE.Float32BufferAttribute(pos.slice(), 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    out[name] = g;
  }
  // close both ends with fans
  const caps = [];
  for (const [s, flip] of [[0, true], [NS - 1, false]]) {
    const ring = grid[s].ring, z = grid[s].z, pos = [0, ring[3][1] * 0 + (ring[0][1] + ring[ROWS - 1][1]) / 2, z], idx = [];
    for (const side of [1, -1]) {
      const b = pos.length / 3;
      for (const p of ring) pos.push(p[0] * side, p[1], z);
      for (let r = 0; r < ROWS - 1; r++) {
        const swap = (side > 0) === flip;
        idx.push(0, b + (swap ? r + 1 : r), b + (swap ? r : r + 1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.setAttribute('aRest', new THREE.Float32BufferAttribute(pos.slice(), 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(1), 1));
    caps.push(g);
  }
  out.shell = mergeGeometries([out.shell, ...caps]);
  return { panels: out, grid };
}

// Lifted lightly away from the body so the lamp sits proud of the sheet without z-fighting.
function lampLens(w, h, d, color, emissive, x, y, z, rotY = 0) {
  const g = new THREE.SphereGeometry(1, 20, 14); g.scale(w, h, d);
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive, emissiveIntensity: 0 }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  return m;
}

export function buildCar(spec, env) {
  const root = new THREE.Group();
  const body = new THREE.Group();     // everything that moves with the sprung mass
  root.add(body);
  const lift = spec.lift || 0, axY = spec.wheel.r + lift;
  const dirt = { value: 0 };
  const cabU = { uCabInv: { value: new THREE.Matrix4() }, uSunLocal: { value: new THREE.Vector3(0, 1, 0) }, uSunVis: { value: 1 } };
  const paint = bodyMaterial(spec.paint, spec.roughness, env, spec, dirt, cabU);
  const { panels, grid } = buildPanels(spec);
  const hull = new THREE.Group(); hull.position.y = lift; body.add(hull);

  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.06, metalness: 0, envMap: env, envMapIntensity: 1.5, transparent: true, opacity: 0.56, side: THREE.DoubleSide, clearcoat: 1, depthWrite: false });
  const parts = {};
  for (const name in panels) {
    if (name.startsWith('glass')) continue;
    const m = new THREE.Mesh(panels[name], paint);
    m.castShadow = true; m.receiveShadow = true; m.name = name;
    hull.add(m); parts[name] = { mesh: m, hp: { hood: 30, doorL: 34, doorR: 34, bumperF: 16, bumperR: 16, trunk: 26, shell: 1e9 }[name] ?? 30, off: false };
  }
  const panes = {};
  for (const name in panels) if (name.startsWith('glass')) {
    const pane = new THREE.Mesh(panels[name], glass); pane.renderOrder = 5; hull.add(pane); panes[name] = { mesh: pane, hp: name === 'glassF' ? 1e9 : 15, off: false };
  }

  // ---- trim ---------------------------------------------------------------------------------
  const m = spec.marks, S = spec.stations, top = S[S.length - 1], tail = S[0];
  const trimM = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.62, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.14, envMap: env });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.85 });
  const zF = S[S.length - 2].z, zR = S[1].z, wF = S[S.length - 3].w;
  const belowY = spec.kind === 'pickup' ? 0.62 : 0.3;

  // inner tub: when a panel is gone there is dark metal behind it, not sky
  const noseTop = S.find(s => s.z >= m.bumpF).top - 0.1, tailTop = S[4].belt - 0.34;
  hull.add(new THREE.Mesh(box(wF * 1.8, noseTop - S[4].low, zF - m.cowl - 0.14, 0, (noseTop + S[4].low) / 2, (zF + m.cowl) / 2 + 0.06), darkM));
  hull.add(new THREE.Mesh(box(wF * 1.8, tailTop - S[4].low, m.doorR - zR - 0.5, 0, (tailTop + S[4].low) / 2, (m.doorR + zR) / 2 - 0.05), darkM));

  // wheel wells
  for (const z of [spec.axle.f, spec.axle.r]) for (const s of [-1, 1]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheel.r + 0.05, spec.wheel.r + 0.05, 0.42, 22, 1, true, -0.1, Math.PI + 0.2).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.BackSide }));
    // the tube's outer rim has to stay inside the body, or it shows as a black flange where the flank curves in
    well.position.set(s * Math.min(spec.track + 0.02, S[4].w - 0.23), axY, z); if (!lift) hull.add(well);
    if (spec.kind !== 'coupe' && !lift) { // plastic arch
      const arch = new THREE.Mesh(new THREE.TorusGeometry(spec.wheel.r + 0.08, 0.05, 8, 26, Math.PI * 1.05).rotateY(Math.PI / 2).rotateX(-0.04), trimM);
      arch.position.set(s * (S[4].w + 0.02), spec.wheel.r, z); arch.scale.x = 0.7; hull.add(arch);
    }
  }

  // lights
  const lampY = spec.kind === 'coupe' ? 0.55 : spec.kind === 'pickup' ? 1.06 : 0.71, lampZ = zF - (spec.kind === 'coupe' ? 0.38 : 0.11), lampX = wF * (spec.kind === 'coupe' ? 0.76 : 0.72);
  const headL = [], tails = [];
  for (const s of [-1, 1]) {
    const lamp = spec.kind === 'pickup'
      ? lampLens(0.2, 0.13, 0.09, 0xf4f6fa, 0xfff0d0, s * lampX, lampY, lampZ)
      : lampLens(0.24, 0.1, 0.12, 0xf4f6fa, 0xfff0d0, s * lampX, lampY, lampZ, -s * 0.45);
    hull.add(lamp); headL.push(lamp);
    const tl = lampLens(0.18, 0.07, 0.04, 0x8a0a0a, 0xff1408, s * tail.w * 1.02, spec.kind === 'pickup' ? 1.02 : tail.mid + 0.2, zR + (spec.kind === 'coupe' ? -0.02 : -0.02));
    hull.add(tl); tails.push(tl);
  }
  // grille, plate, intakes
  const grilleY = spec.kind === 'pickup' ? 0.92 : spec.kind === 'coupe' ? 0.3 : 0.5;
  const grille = new THREE.Group();
  const gw = wF * (spec.kind === 'coupe' ? 1.1 : 0.98);
  grille.add(new THREE.Mesh(box(gw, spec.kind === 'pickup' ? 0.26 : 0.14, 0.03, 0, grilleY, top.z - 0.02), darkM));
  for (let i = 0; i < 4; i++) grille.add(new THREE.Mesh(box(gw * 0.96, 0.012, 0.015, 0, grilleY - 0.06 + i * 0.04, top.z + 0.002), trimM));
  hull.add(grille);
  const plate = plateTexture(spec.plate);
  const plateM = new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateM); pf.position.set(0, grilleY - (spec.kind === 'pickup' ? 0.24 : 0.14), top.z + 0.014); hull.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateM); pr.position.set(0, tail.mid, tail.z - 0.012); pr.rotation.y = Math.PI; hull.add(pr);

  // mirrors, handles
  const mirrorZ = m.cowl - 0.06, mirrorY = S.find(s => s.z >= m.cowl).belt + 0.05;
  for (const s of [-1, 1]) {
    const mir = new THREE.Mesh(roundedBox(0.22, 0.13, 0.07, s * (S[4].wb + 0.1), mirrorY, mirrorZ), trimM); hull.add(mir);
    const arm = new THREE.Mesh(box(0.13, 0.03, 0.05, s * (S[4].wb + 0.02), mirrorY - 0.03, mirrorZ), trimM); hull.add(arm);
    const handle = new THREE.Mesh(box(0.025, 0.03, 0.14, s * (S[4].w * 0.985), S[4].mid + (S[4].belt - S[4].mid) * 0.72, m.doorR + 0.16), chrome); hull.add(handle);
    handle.userData.door = s > 0 ? 'doorL' : 'doorR';
  }
  // wiper
  for (const s of [-0.24, 0.3]) {
    const y = S.find(q => q.z >= m.cowl).top + 0.03;
    const wiper = new THREE.Mesh(box(0.42, 0.012, 0.016, s, y, m.cowl - 0.05), darkM); wiper.rotation.z = 0.02; hull.add(wiper);
  }
  // exhaust
  const exh = spec.kind === 'coupe' ? [-0.38, -0.25, 0.25, 0.38] : [0.42];
  for (const x of exh) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 14, 1, true).rotateX(Math.PI / 2), chrome);
    p.position.set(x, (tail.low + 0.03), tail.z + 0.05); hull.add(p);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12).rotateY(Math.PI), darkM); d.position.set(x, tail.low + 0.03, tail.z - 0.05); hull.add(d);
  }

  // per-kind dressing
  if (spec.id === 'rally') {
    const rack = new THREE.Mesh(box(1.1, 0.04, 0.7, 0, S[4].top + 0.08, -0.4), trimM); hull.add(rack);
    for (const x of [-0.45, 0.45]) for (const z of [-0.65, -0.15]) hull.add(new THREE.Mesh(box(0.04, 0.09, 0.04, x, S[4].top + 0.03, z), trimM));
    hull.add(new THREE.Mesh(box(1.3, 0.04, 0.34, 0, S[1].top + 0.15, S[1].z + 0.14), trimM));
    const wg = new THREE.Mesh(box(0.05, 0.16, 0.3, 0.58, S[1].top + 0.06, S[1].z + 0.14), trimM); hull.add(wg, wg.clone().translateX(-1.16));
    // spare wheel strapped on the rack
    const sp = buildWheel({ ...spec, wheel: { ...spec.wheel, r: 0.3, spokes: 5 } }, env); sp.rotation.z = Math.PI / 2; sp.position.set(0, S[4].top + 0.24, -0.4); hull.add(sp);
    for (const s of [-0.4, -0.13, 0.13, 0.4]) { const l = lampLens(0.08, 0.08, 0.05, 0xf8f8ee, 0xfff0d0, s, S[5].top + 0.14, 0.46); hull.add(l); headL.push(l); }
    hull.add(new THREE.Mesh(box(1.05, 0.03, 0.03, 0, S[5].top + 0.08, 0.42), trimM));
  }
  if (spec.kind === 'pickup') {
    const [b0, b1] = m.bed;
    const wy = S[3].belt, wx = S[3].w;
    const bed = new THREE.Group();
    const bedM = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 });
    bed.add(new THREE.Mesh(box(wx * 1.88, 0.03, b1 - b0, 0, 0.82, (b0 + b1) / 2), bedM));
    for (let i = 0; i < 8; i++) bed.add(new THREE.Mesh(box(0.05, 0.03, b1 - b0 - 0.04, -wx * 0.8 + i * wx * 0.228, 0.85, (b0 + b1) / 2), bedM));
    bed.add(new THREE.Mesh(box(0.03, wy - 0.82, b1 - b0, wx * 0.94, (wy + 0.82) / 2, (b0 + b1) / 2), bedM));
    bed.add(new THREE.Mesh(box(0.03, wy - 0.82, b1 - b0, -wx * 0.94, (wy + 0.82) / 2, (b0 + b1) / 2), bedM));
    bed.add(new THREE.Mesh(box(wx * 1.88, wy - 0.82, 0.03, 0, (wy + 0.82) / 2, b1), bedM));
    bed.add(new THREE.Mesh(box(wx * 1.88, wy - 0.82, 0.03, 0, (wy + 0.82) / 2, b0), bedM));
    bed.traverse(o => { o.castShadow = true; });
    hull.add(bed);
    // bull bar, step rails
    hull.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 8, 22, Math.PI).translate(0, 0.72, top.z + 0.1), trimM));
    for (const s of [-1, 1]) hull.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 8).rotateX(Math.PI / 2).translate(s * (S[4].w + 0.08), 0.58, 0.3), trimM));
    if (spec.id === 'pickup') { // winch and roof lights
      hull.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 14).rotateZ(Math.PI / 2).translate(0, 0.76, top.z + 0.02), chrome));
      hull.add(new THREE.Mesh(box(1.1, 0.06, 0.08, 0, S[5].top + 0.06, 0.5), trimM));
      for (const s of [-0.38, -0.13, 0.13, 0.38]) { const l = lampLens(0.09, 0.07, 0.04, 0xf8f8ee, 0xfff0d0, s, S[5].top + 0.06, 0.56); hull.add(l); headL.push(l); }
      // a load of hay bales in the back
      const hay = new THREE.Mesh(box(1.1, 0.34, 0.8, -0.1, 1.02, -1.6), new THREE.MeshStandardMaterial({ color: 0xc9ab62, roughness: 1 })); hay.rotation.y = 0.1; hay.castShadow = true; hull.add(hay);
    }
  }
  if (spec.id === 'sport') {
    // rear wing and splitter
    const y = S[2].top + 0.2;
    hull.add(new THREE.Mesh(roundedBox(1.72, 0.03, 0.32, 0, y, S[1].z + 0.28, 0.012), trimM));
    for (const s of [-0.84, 0.84]) hull.add(new THREE.Mesh(box(0.02, 0.1, 0.34, s, y - 0.01, S[1].z + 0.28), trimM));
    for (const s of [-0.5, 0.5]) hull.add(new THREE.Mesh(box(0.05, 0.2, 0.09, s, y - 0.11, S[1].z + 0.3), trimM));
    hull.add(new THREE.Mesh(box(1.78, 0.02, 0.2, 0, 0.2, top.z - 0.1), trimM));
    for (const s of [-1, 1]) hull.add(new THREE.Mesh(box(0.05, 0.17, 0.92, s * 0.97, 0.45, -0.72), darkM));
    for (const s of [-1, 1]) hull.add(new THREE.Mesh(box(0.05, 0.04, 2.1, s * 0.965, 0.2, 0.05), trimM));
    // centre stripes painted on
    hull.add(new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), trimM));
  }

  // underside: frame for trucks, a flat tray otherwise
  const under = new THREE.Group(); under.position.y = lift;
  under.add(new THREE.Mesh(box(1.3, 0.06, zF - zR - 0.6, 0, S[4].low - 0.02, (zF + zR) / 2), darkM));
  hull.add(under);

  // ---- wheels -------------------------------------------------------------------------------
  const wheelProto = buildWheel(spec, env);
  const wheels = [];
  for (const [zp, sx, front] of [[spec.axle.f, 1, 1], [spec.axle.f, -1, 1], [spec.axle.r, 1, 0], [spec.axle.r, -1, 0]]) {
    const steer = new THREE.Group(); steer.position.set(sx * spec.track, spec.wheel.r, zp);
    const spin = wheelProto.clone(); if (sx < 0) spin.rotation.y = Math.PI;
    const spinner = new THREE.Group(); spinner.add(spin); steer.add(spinner); root.add(steer);
    wheels.push({ steer, spinner, front: !!front, sx, z: zp, off: false });
  }
  if (lift) {
    // exposed axles, links and coilovers on the monster truck
    const steelM = new THREE.MeshStandardMaterial({ color: 0x8f949c, metalness: 0.85, roughness: 0.35, envMap: env }), coilM = new THREE.MeshStandardMaterial({ color: 0xd8c021, roughness: 0.5, metalness: 0.4 });
    const ax = {};
    for (const [key, z] of [['f', spec.axle.f], ['r', spec.axle.r]]) {
      const a = new THREE.Group(); a.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, spec.track * 2, 12).rotateZ(Math.PI / 2), steelM));
      a.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), steelM));
      a.position.set(0, spec.wheel.r, z); root.add(a); ax[key] = a;
      a.traverse(o => { o.castShadow = true; });
    }
    const frame = new THREE.Group();
    for (const s of [-0.5, 0.5]) frame.add(new THREE.Mesh(box(0.14, 0.2, 5.4, s, 0, 0), darkM));
    for (const z of [-2, -0.6, 0.8, 2]) frame.add(new THREE.Mesh(box(1, 0.1, 0.1, 0, 0, z), darkM));
    frame.position.y = 1.32; frame.traverse(o => { o.castShadow = true; }); body.add(frame);
    root.userData.axles = ax;
    root.userData.coilM = coilM;
  }

  // ---- cockpit -------------------------------------------------------------------------------
  const cab = buildCockpit(spec, env, grid, cabU);
  cab.group.position.y = lift; body.add(cab.group);

  // headlight beam used at dusk and night
  const beam = new THREE.SpotLight(0xfff0d4, 0, 130, 0.56, 0.5, 1.2);
  beam.position.set(0, lampY + lift, zF - 0.1); beam.target.position.set(0, -0.1 + lift, zF + 20);
  body.add(beam, beam.target);

  return { spec, root, body, hull, cabU, paint, glass, panes, parts, wheels, cab, headL, tails, dirt, beam, chrome, trimM };
}

function buildCockpit(spec, env, grid, cabU) {
  const g = new THREE.Group(), [ex, ey, ez] = spec.eye, [wx, wy, wz] = spec.wheelPos, dz = spec.dashZ;
  const S = spec.stations, section = S.find(s => s.z >= spec.marks.cowl), halfW = S[4].wb * 0.98;
  const dashTop = section.belt + 0.015, sport = spec.id === 'sport', rally = spec.id === 'rally';
  const trim = (color, rough = 0.85) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, cabU);
      sh.vertexShader = CABIN_VERT + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + CABIN_POS);
      sh.fragmentShader = cabinGLSL(spec) + sh.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + CABIN_LIGHT);
    };
    m.customProgramCacheKey = () => 'cabin' + spec.id;
    return m;
  };
  const darkM = trim(0x14151a), chrome = trim(0xa4a7ad, 0.4);
  const dashM = trim(sport ? 0x34363d : 0x4c4f57), softM = trim(sport ? 0x8a2420 : 0x62656e);

  // dash: a curved extrusion across the car, seen from the driver's seat
  const sh = new THREE.Shape();
  sh.moveTo(0.22, 0); sh.lineTo(0.22, -0.32); sh.quadraticCurveTo(0.1, -0.4, -0.08, -0.38);
  sh.lineTo(-0.34, -0.3); sh.quadraticCurveTo(-0.44, -0.26, -0.43, -0.18);
  sh.quadraticCurveTo(-0.4, -0.04, -0.2, 0); sh.closePath();
  const dash = new THREE.ExtrudeGeometry(sh, { depth: halfW * 2, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 10 });
  dash.rotateY(-Math.PI / 2); dash.translate(halfW, dashTop, dz);
  const dashMesh = new THREE.Mesh(dash, dashM); dashMesh.castShadow = false; g.add(dashMesh);

  // the gauges sit in the gap between the wheel's hub and the top of its rim, as seen from the seat
  const wheelY = dashTop - 0.1, R0 = rally ? 0.165 : sport ? 0.17 : 0.19, dialZ = dz - 0.445;
  const dep = (dialZ - ez) / (wz - ez), dialY = Math.min(dashTop - 0.02, (ey - (ey - wheelY - 0.05) * dep + ey - (ey - wheelY - R0) * dep) / 2);
  const bn = new THREE.CylinderGeometry(0.19, 0.2, 0.16, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  bn.scale(1.25, 0.62, 1); bn.translate(wx, dialY + 0.015, dialZ - 0.01);
  const binM = trim(0x24262c); binM.side = THREE.DoubleSide; g.add(new THREE.Mesh(bn, binM));
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.2).rotateY(Math.PI).translate(wx, dialY - 0.02, dialZ + 0.012), trim(0x101114, 0.9)); g.add(backing);

  const maxKmh = sport ? 360 : spec.id === 'monster' ? 180 : 240;
  const rpmMax = Math.ceil(spec.phys.redline / 1000) + 1;
  const dial = (tex, x) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.078, 40), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true })); d.position.set(x, dialY, dialZ); d.rotation.y = Math.PI; g.add(d);
    const pivot = new THREE.Group(); pivot.position.copy(d.position); pivot.rotation.copy(d.rotation); pivot.translateZ(0.006);
    const n = new THREE.Mesh(box(0.005, 0.068, 0.001, 0, 0.03, 0), new THREE.MeshBasicMaterial({ color: 0xff4830 })); pivot.add(n);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.011, 14), new THREE.MeshBasicMaterial({ color: 0x24262a })); cap.position.z = 0.002; pivot.add(cap);
    g.add(pivot); return pivot;
  };
  const speedN = dial(dialFace('km/h', maxKmh, maxKmh >= 300 ? 60 : 40, maxKmh >= 300 ? 20 : 10), wx + 0.09);
  const rpmN = dial(dialFace('x1000 ot', rpmMax, 1, 0.5, spec.phys.redline / 1000), wx - 0.09);

  // centre stack
  const cx = wx > 0 ? 0 : 0;
  g.add(new THREE.Mesh(roundedBox(0.3, 0.2, 0.05, cx, dashTop - 0.22, dz - 0.425), trim(0x141518, 0.5)));
  for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).rotateX(Math.PI / 2).translate(cx - 0.08 + i * 0.08, dashTop - 0.24, dz - 0.46), chrome));
  for (const x of [cx - 0.1, cx + 0.1]) g.add(new THREE.Mesh(box(0.11, 0.04, 0.02, x, dashTop - 0.095, dz - 0.425), darkM));
  const console = new THREE.Mesh(roundedBox(0.24, 0.18, 0.9, cx, dashTop - 0.5, dz - 0.72), softM); g.add(console);
  const shifter = new THREE.Group();
  shifter.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.16, 8).translate(0, 0.08, 0), chrome));
  shifter.add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10).translate(0, 0.17, 0), darkM));
  shifter.position.set(cx, dashTop - 0.41, dz - 0.82); shifter.rotation.x = -0.2; g.add(shifter);

  // steering wheel
  const wheel = new THREE.Group(), R = R0;
  const rim = new THREE.TorusGeometry(R, 0.016, 12, 44);
  wheel.add(new THREE.Mesh(rim, trim(0x2a2b30, 0.7)));
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.032, 18).rotateX(Math.PI / 2), trim(0x303238, 0.6)));
  for (const a of [Math.PI / 2 * 3, 0.2, Math.PI - 0.2]) {
    const s = new THREE.Mesh(box(R - 0.04, 0.03, 0.012, R / 2, 0, 0), trim(rally ? 0x9aa0a8 : 0x3a3c42, 0.5)); s.rotation.z = a; wheel.add(s);
  }
  // rim marker at twelve o'clock, helps feel the angle
  const mark = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0172, 8, 8, 0.12).rotateZ(Math.PI / 2 - 0.06), trim(rally ? 0xe8c820 : 0xc33028, 0.6)); wheel.add(mark);
  const wheelHolder = new THREE.Group(); wheelHolder.position.set(wx, wheelY, wz); wheelHolder.rotation.x = 0.32; wheelHolder.add(wheel); g.add(wheelHolder);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.04, 0.36, 12).rotateX(Math.PI / 2 + 0.32).translate(wx, wheelY + 0.06, wz + 0.2), trim(0x1d1e22, 0.7)); g.add(column);

  // airbag: packed in the hub until a hard frontal hit, then fires and sags
  const bagG = new THREE.SphereGeometry(1, 44, 30), bp = bagG.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), a = Math.atan2(y, x), r = Math.hypot(x, y);
    const k = 1 + r * (0.05 * Math.sin(a * 11 + z * 3) + 0.03 * Math.sin(a * 23 + r * 7));
    bp.setXYZ(i, x * k, y * k, z * k);
  }
  bagG.computeVertexNormals();
  const bag = new THREE.Mesh(bagG, trim(0xe6e2d8, 1)); bag.visible = false; wheelHolder.add(bag);

  // hands in driving gloves, at quarter to three; driver collects the body so it can step out
  const driver = [];
  const glove = trim(0x3a3532, 0.85);
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), glove); palm.scale.set(0.95, 1.2, 0.8); h.add(palm);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.04, 4, 8), glove); f.position.set(s * -0.03, 0.03 - i * 0.024, -0.018); f.rotation.z = Math.PI / 2; h.add(f); }
    h.position.set(s * R, 0.02, -0.012); wheel.add(h); driver.push(h);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.027, 1, 12), trim(rally ? 0x6e2420 : 0x39404e, 0.95));
    arm.userData = { hand: h, side: s }; g.add(arm); driver.push(arm); wheelHolder.userData.arms = [...(wheelHolder.userData.arms || []), arm];
  }

  // the footwell: carpet, pedals and the driver's legs
  const floorY = S[4].low + 0.09;
  g.add(new THREE.Mesh(box(S[4].w * 1.86, 0.02, spec.marks.cowl - spec.marks.doorR - 0.1, 0, floorY, (spec.marks.cowl + spec.marks.doorR) / 2), trim(0x35363b, 1)));
  g.add(new THREE.Mesh(box(S[4].w * 1.86, dashTop - 0.3 - floorY, 0.03, 0, (dashTop - 0.3 + floorY) / 2, dz + 0.12), trim(0x2b2c31, 1)));
  const limb = (a, b, r0, r1, mat) => {
    const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), l = d.length();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, l, 12), mat); c.position.copy(A).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(c); driver.push(c);
  };
  const legM = trim(0x33363e, 0.95), shoeM = trim(0x26262a, 0.8), pedalZ = dz - 0.2;
  [[ex - 0.12, 0, 0.12], [ex + 0.08, 1, 0.1], [ex + 0.2, 2, 0.1]].forEach(([x, , w]) => {
    const pad = new THREE.Mesh(box(w * 0.7, 0.11, 0.02, x, floorY + 0.15, pedalZ), chrome); pad.rotation.x = -0.25; g.add(pad);
  });
  for (const s of [-1, 1]) {
    const hipX = ex + s * 0.1, kneeX = ex + s * 0.14, footX = ex + (s < 0 ? -0.12 : 0.15);
    const hip = [hipX, ey - 0.6, ez + 0.1], knee = [kneeX, Math.max(ey - 0.56, floorY + 0.34), (ez + pedalZ) / 2 + 0.06], ankle = [footX, floorY + 0.1, pedalZ - 0.17];
    limb(hip, knee, 0.082, 0.06, legM); limb(knee, ankle, 0.056, 0.042, legM);
    limb(ankle, [footX, floorY + 0.09, pedalZ - 0.01], 0.04, 0.034, shoeM);
  }
  if (spec.kind === 'hatch') {   // rear bench
    g.add(new THREE.Mesh(roundedBox(1.4, 0.14, 0.5, 0, S[4].low + 0.26, -1.06, 0.05), softM));
    g.add(new THREE.Mesh(roundedBox(1.4, 0.5, 0.1, 0, S[4].low + 0.54, -1.3, 0.05), softM));
  }

  // seats, plus a roof cage where it fits the car
  if (rally || spec.id === 'monster') {
    const bar = trim(rally ? 0xc4b41c : 0x9ca0a8, 0.45);
    const tube = (a, b, r = 0.015) => {
      const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), l = v.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), bar); c.position.set(...a).addScaledVector(v, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(c);
    };
    const top = S[4].belt + (S[4].top - S[4].belt) * 0.84 - 0.03, w = S[4].wt * 0.98, w2 = S[4].wb * 0.97, fz = spec.marks.roofF - 0.02, rz = -0.56;
    for (const s of [-1, 1]) { tube([s * w, top, fz], [s * w, top, rz]); tube([s * w, top, rz], [s * w2, S[4].belt - 0.32, rz]); }
    tube([-w, top, rz], [w, top, rz]);
  }
  // visors and rear-view mirror
  // header rail: a moulded frame across the top of the screen, pillar to pillar. Cut from the same
  // grid as the body so it sits exactly under the glass, and it carries the visors and the mirror.
  const near = z => grid.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
  const crownY = z => { const r = near(z).ring; return r[r.length - 1][1]; };
  const zH = spec.marks.roofF, headerM = trim(0x7c7e84), frame = grid.filter(c => c.z >= zH - 0.12 && c.z <= zH + 0.2);
  headerM.side = THREE.DoubleSide;
  const across = [];
  for (let r = RAIL_ROW - 1; r < ROWS - 1; r++) across.push([r, -1]);
  for (let r = ROWS - 1; r >= RAIL_ROW - 1; r--) across.push([r, 1]);
  const hp = [], hi = [], W = across.length;
  for (const c of frame) for (const [r, sd] of across) hp.push(c.ring[r][0] * sd * 0.985, c.ring[r][1] - 0.014, c.z);
  for (let a = 0; a < frame.length - 1; a++) for (let b = 0; b < W - 1; b++) { const q = a * W + b; hi.push(q, q + 1, q + W, q + 1, q + W + 1, q + W); }
  const headerG = new THREE.BufferGeometry(); headerG.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); headerG.setIndex(hi); headerG.computeVertexNormals();
  g.add(new THREE.Mesh(headerG, headerM));
  const edge = (frame.length - 1) * W;
  for (let b = 0; b < W - 1; b++) {
    const P = k => [hp[(edge + k) * 3], hp[(edge + k) * 3 + 1], hp[(edge + k) * 3 + 2]];
    limb(P(b), P(b + 1), 0.015, 0.015, headerM);
  }
  // visors fold flat against that rail
  const zV = zH + 0.07, visorTilt = Math.atan2(crownY(zV - 0.06) - crownY(zV + 0.06), 0.12);
  for (const s of [-1, 1]) {
    const v = new THREE.Mesh(roundedBox(0.34, 0.016, 0.11, 0, 0, 0), softM);
    v.position.set(s * 0.3, crownY(zV) - 0.034, zV); v.rotation.x = visorTilt; g.add(v);
  }
  // mirror hangs from the rail on a short stalk
  const zM = zH + 0.17, mY = crownY(zM) - 0.016;
  g.add(new THREE.Mesh(roundedBox(0.09, 0.03, 0.05, 0, mY - 0.012, zM, 0.012), headerM));
  g.add(new THREE.Mesh(box(0.016, 0.05, 0.016, 0, mY - 0.045, zM), darkM));
  g.add(new THREE.Mesh(roundedBox(0.23, 0.066, 0.026, 0, mY - 0.095, zM), trim(0x202228)));
  const mirrorPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.212, 0.052).rotateY(Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.03, envMap: env, envMapIntensity: 1.3 }));
  mirrorPlane.position.set(0, mY - 0.095, zM - 0.0145); g.add(mirrorPlane);
  // A-pillar trim follows the sheet: built from the same grid so it covers the pillar exactly
  for (const side of [-1, 1]) {
    const ring = n => { const c = near(n).ring, p = c[RAIL_ROW - 1], q = c[RAIL_ROW]; return [p[0] * side, (p[1] + q[1]) / 2, n]; };
    const pts = [], N = 12, z0 = spec.marks.cowl - 0.1, z1 = Math.max(spec.marks.doorR, spec.marks.roofR + 0.1);
    for (let i = 0; i <= N; i++) pts.push(ring(z0 + (z1 - z0) * i / N));
    for (let i = 0; i < N; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
      const d = new THREE.Vector3(bx - ax, by - ay, bz - az), l = d.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, l + 0.012, 10), softM);
      c.position.set((ax + bx) / 2 - side * 0.012, (ay + by) / 2 - 0.008, (az + bz) / 2);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); c.scale.set(0.7, 1, 1.25); g.add(c);
    }
  }

  // door cards, so the side of the view is not bare sheet metal
  for (const s of [-1, 1]) {
    const card = new THREE.Mesh(roundedBox(0.04, 0.5, 1.2, s * (S[4].w - 0.1), S[4].belt - 0.27, 0.0 + (ez + dz) * 0.28), softM); g.add(card);
    g.add(new THREE.Mesh(box(0.05, 0.016, 1.9, s * (S[4].wb - 0.015), S[4].belt + 0.002, 0.0 + (ez + dz) * 0.2), darkM));
    const rest = new THREE.Mesh(roundedBox(0.09, 0.05, 0.5, s * (S[4].w - 0.13), S[4].belt - 0.2, ez + 0.02), trim(0x2f3137, 0.8)); g.add(rest);
  }
  // seat backs visible in exterior views through the glass
  for (const s of [-1, 1]) {
    const seat = new THREE.Group();
    seat.add(new THREE.Mesh(roundedBox(0.46, 0.14, 0.5, 0, 0, 0, 0.05), softM));
    const back = new THREE.Mesh(roundedBox(0.46, 0.72, 0.12, 0, 0.36, -0.25, 0.05), softM); back.rotation.x = -0.14; seat.add(back);
    seat.add(new THREE.Mesh(roundedBox(0.22, 0.2, 0.09, 0, 0.8, -0.32, 0.03), softM));
    seat.position.set(s * ex, ey - 0.74, ez - 0.02); seat.traverse(o => o.layers.set(1)); g.add(seat);   // layer 1: left out of the mirror
  }

  // cracks, mud and wiper clear patches are painted on this sheet, just inside the screen
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d'), crackTex = new THREE.CanvasTexture(cv); crackTex.colorSpace = THREE.SRGBColorSpace;
  const cz = spec.marks.cowl, fz = spec.marks.roofF, b0 = S.find(s => s.z >= cz).belt + 0.09, t0 = S.find(s => s.z >= fz).top - 0.08;
  const len = Math.hypot(cz - fz, t0 - b0), wsW = S[5].wb * 1.74;
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(wsW, len), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1, fog: false }));
  ws.position.set(0, (b0 + t0) / 2, (cz + fz) / 2 - 0.035); ws.rotation.x = -Math.atan2(cz - fz, t0 - b0) + 0; ws.rotation.order = 'YXZ'; ws.rotation.y = Math.PI;
  ws.rotation.x = Math.atan2(cz - fz, t0 - b0); ws.renderOrder = 6;
  g.add(ws);
  // water drops live on their own sheet, so they can run off without taking the cracks along
  const dropCv = document.createElement('canvas'); dropCv.width = 512; dropCv.height = 256;
  const dropCtx = dropCv.getContext('2d'), dropTex = new THREE.CanvasTexture(dropCv); dropTex.colorSpace = THREE.SRGBColorSpace;
  const drops = new THREE.Mesh(ws.geometry, new THREE.MeshBasicMaterial({ map: dropTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  drops.position.z = 0.002; drops.renderOrder = 7; ws.add(drops);

  return { group: g, wheel, wheelHolder, speedN, rpmN, shifter, maxKmh, rpmMax, ws, crackCtx: ctx, crackCv: cv, crackTex, dropCv, dropCtx, dropTex, mirrorPlane, bag, driver, eye: new THREE.Vector3(ex, ey, ez), R };
}
