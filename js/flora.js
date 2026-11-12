// Tree, bush and prop models plus far-distance impostors baked from those same models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBark, makeLeafAtlas, makeWood, makeBale, makeRock, makeTiles } from './textures.js';
import { OBJ, noise } from './world.js';

const R = (a, b) => a + Math.random() * (b - a);
export const WIND = { value: 0 };

// Foliage covers most of the screen, so it skips the full light loop: lighting and fog are
// worked out once per vertex here and fed by Sky.apply.
export const LIT = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSkyC: { value: new THREE.Color() }, uGndC: { value: new THREE.Color() },
  uFogCol: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color() }, uFogD: { value: 0.0005 }, uFogEdge: { value: 800 },
  uBeamPos: { value: new THREE.Vector3() }, uBeamDir: { value: new THREE.Vector3(0, 0, 1) }, uBeamI: { value: 0 },
  uCarInv: { value: new THREE.Matrix4() }, uCarBox: { value: new THREE.Vector2(1, 2) },
  uCloudTex: { value: null }, uCloudAmt: { value: 0 }, uCloudP: { value: new THREE.Vector4(0, 0, 0.54, 0.68) }, uWet: { value: 0 }, uRainK: { value: 0 },
  uShadowMap: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 },
  // the weather map round the player (weather.js): origin, 1 / span, any cells at all; the sun's slant
  // through the low lid and how dark its shadow is
  uWxTex: { value: null }, uWxP: { value: new THREE.Vector4(0, 0, 1 / 48000, 0) }, uWxS: { value: new THREE.Vector3(0, 0, 0.85) },
  // the wind map on the same grid (weather.js), and how far the gusts have drifted with the wind
  uWindTex: { value: null }, uWindOff: { value: new THREE.Vector2() },
  // hail on the same grid: r lying on the ground, g falling now
  uIceTex: { value: null },
};
// The cloud cover map repeats every CLOUD_TILE metres. The sky's clouds (clouds.js) stand where it
// is above uCloudP.z..w, so the ground reads the same map for their shadows. uCloudP.xy is the wind's
// drift plus the sun's slant through the cloud layer. Sky.clouds does the same sum for the car.
export const CLOUD_TILE = 8192;
// The haze: how much of the air's colour lies over something d metres off. k is the weather's
// density (sky.js), edge where the drawn land ends. The air builds up from the first metre (exp),
// thick weather closes in fast (exp2), and towards the edge everything fades into the sky behind it,
// so the land doesn't end in a row of crisp, rounded tree crowns against the horizon. The scene's
// fog, the foliage's, the compose pass (post.js) and a tornado's own haze all use these.
export const HAZE = /* glsl */`
  float hazeAir(float d, float k) { return 1. - exp(-k * d * .45) * exp(-k * k * d * d * .6); }
  float hazeEdge(float d, float edge) { return smoothstep(edge * .4, edge * .95, d); }
  float haze(float d, float k, float edge) { return 1. - (1. - hazeAir(d, k)) * (1. - hazeEdge(d, edge)); }`;
export const CLOUD = /* glsl */`
  uniform sampler2D uWxTex, uIceTex; uniform vec4 uWxP; uniform vec3 uWxS;
  float cloudShade(float n) { return 1. - uCloudAmt * smoothstep(uCloudP.z, uCloudP.w, n); }
  vec2 cloudUv(vec2 p) { return (p + uCloudP.xy) / ${CLOUD_TILE}.; }
  vec4 wxAt(vec2 p) { return textureLod(uWxTex, (p - uWxP.xy) * uWxP.z, 0.); }
  // The shade of a rain cell's lid, which stands up the sun's slant from p, and of a storm's anvil,
  // five times as high, so its shadow falls five times as far off.
  float lidShade(vec2 p) {
    if (uWxP.w <= 0.) return 1.;
    float anvil = textureLod(uIceTex, (p + uWxS.xy * 5. - uWxP.xy) * uWxP.z, 0.).b;
    return 1. - uWxS.z * max(smoothstep(.1, .85, wxAt(p + uWxS.xy).r), .6 * smoothstep(.1, .8, anvil));
  }`;
// The wind at a spot: xy in m/s, z the gust factor (1 is the mean). Gusts are a noise drifting with
// the wind, so they roll across a field as waves; Weather.gust in weather.js is the same sum.
export const WIND_GLSL = /* glsl */`
  uniform sampler2D uWindTex; uniform vec2 uWindOff;
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(wHash(i), wHash(i + vec2(1., 0.)), f.x), mix(wHash(i + vec2(0., 1.)), wHash(i + 1.), f.x), f.y);
  }
  vec3 windAt(vec2 p) {
    vec4 w = textureLod(uWindTex, (p - uWxP.xy) * uWxP.z, 0.);
    vec2 q = p - uWindOff;
    float n = wNoise(q / 70.) * .6 + wNoise((q - uWindOff * .3) / 23.) * .4;
    return vec3((w.xy - .5) * 64., mix(1., .3 + 1.4 * n, .45 + .55 * w.b));
  }`;
export const LIT_VERT = /* glsl */`
  #include <packing>
  uniform vec3 uSunDir, uSunCol, uSkyC, uGndC, uFogCol, uGlowCol, uBeamPos, uBeamDir; uniform float uFogD, uFogEdge, uBeamI;
  ${HAZE}
  uniform sampler2D uCloudTex, uShadowMap; uniform float uCloudAmt, uShadowOn; uniform vec4 uCloudP; uniform mat4 uShadowMat;
  ${CLOUD}
  ${WIND_GLSL}
  varying vec3 vLight, vFogC, vGlow; varying float vFogA, vSunK;
  float litSun = 1., litAmb = .7;   // a shader can change the sun and the sky's share before litVertex
  // how much sun reaches p, read from the shadow map; outside the map it's the given average
  float sunSeen(vec3 p, float avg) {
    if (uShadowOn < .5) return avg;
    vec4 sc = uShadowMat * vec4(p, 1.);
    vec3 q = sc.xyz / sc.w;
    vec2 e = min(q.xy, 1. - q.xy);
    float inside = smoothstep(0., .06, min(e.x, e.y));
    if (inside <= 0. || q.z >= 1.) return avg;
    return mix(avg, step(q.z - .0012, unpackRGBAToDepth(textureLod(uShadowMap, q.xy, 0.))), inside);
  }
  void litVertex(vec3 wp, vec3 n, float glow) {
    vec3 ray = wp - cameraPosition; float dist = length(ray); ray /= dist;
    float s = max(dot(ray, uSunDir), 0.);
    vSunK = litSun * cloudShade(textureLod(uCloudTex, cloudUv(wp.xz), 0.).r) * lidShade(wp.xz);
    // the sky reaches into a crown from all sides, so a leaf facing down isn't left in the dark
    vLight = (mix(uGndC, uSkyC, n.y * .45 + .55) * litAmb + uSunCol * max(dot(n, uSunDir), 0.) * vSunK) / 3.14159;
    // light coming through a leaf: strongest looking towards the sun
    vGlow = uSunCol * glow * s * s * s * vSunK / 3.14159;
    if (uBeamI > 0.) {
      vec3 b = wp - uBeamPos; float bd = length(b);
      vLight += vec3(1., .93, .8) * uBeamI * smoothstep(.76, .95, dot(b / bd, uBeamDir)) / (1. + bd * bd * .012);
    }
    vFogA = haze(dist, uFogD, uFogEdge);
    vFogC = mix(uFogCol, uGlowCol, pow(s, 6.));
  }`;
export const LIT_FRAG = 'varying vec3 vLight, vFogC, vGlow; varying float vFogA, vSunK;';

function taper(pts, seg, rOf, uvScale) {
  // a tube through pts, narrowing by rOf(t)
  const n = pts.length, pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    const d = new THREE.Vector3().subVectors(q, o).normalize();
    const a = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, a).normalize(), v = new THREE.Vector3().crossVectors(d, u);
    const r = rOf(t);
    for (let k = 0; k <= seg; k++) {
      const an = k / seg * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
      const nx = u.x * c + v.x * s, ny = u.y * c + v.y * s, nz = u.z * c + v.z * s;
      pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); nor.push(nx, ny, nz); uv.push(k / seg * 2, t * uvScale);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1);   // counter-clockwise seen from outside
  }
  // flat caps on both ends: a felled trunk shows its cut, and a branch isn't a hollow tube
  for (const [i, sign] of [[0, -1], [n - 1, 1]]) {
    const ring = i * (seg + 1), c = pos.length / 3;
    const d = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize().multiplyScalar(sign);
    pos.push(pts[i].x, pts[i].y, pts[i].z); nor.push(d.x, d.y, d.z); uv.push(1, i / (n - 1) * uvScale);
    for (let k = 0; k <= seg; k++) { pos.push(pos[(ring + k) * 3], pos[(ring + k) * 3 + 1], pos[(ring + k) * 3 + 2]); nor.push(d.x, d.y, d.z); uv.push(k / seg * 2, i / (n - 1) * uvScale); }
    for (let k = 0; k < seg; k++) sign > 0 ? idx.push(c, c + 1 + k, c + 2 + k) : idx.push(c, c + 2 + k, c + 1 + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function curve(from, dir, len, n, wander) {
  const pts = [], p = from.clone(), d = dir.clone().normalize();
  for (let i = 0; i < n; i++) {
    pts.push(p.clone());
    d.add(new THREE.Vector3(R(-wander, wander), R(-wander * 0.2, wander * 0.4), R(-wander, wander))).normalize();
    p.addScaledVector(d, len / (n - 1));
  }
  return pts;
}

// Foliage geometry: crossed cards, normals pointing away from the crown centre so a crown is
// shaded as one soft volume instead of a pile of flat leaves.
class Cards {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  add(c, size, cell, crown, shade, tilt = 0, stretch = 1) {
    for (let q = 0; q < 2; q++) {
      const a = R(0, 6.283), e = R(-0.5, 0.5) + tilt;
      const ux = Math.cos(a) * size, uz = Math.sin(a) * size;
      const vx = -Math.sin(a) * Math.sin(e) * size * stretch, vy = Math.cos(e) * size * stretch, vz = Math.cos(a) * Math.sin(e) * size * stretch;
      const nx = c.x - crown.x, ny = (c.y - crown.y) * 1.1 + size * 0.5, nz = c.z - crown.z, l = 1 / (Math.hypot(nx, ny, nz) || 1);
      const u0 = (cell % 2) / 2, v0 = 1 - (Math.floor(cell / 2) + 1) / 2;
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      for (const [s, t, uu, vv] of corners) {
        this.pos.push(c.x + ux * s + vx * t, c.y + vy * t, c.z + uz * s + vz * t);
        this.nor.push(nx * l, ny * l, nz * l);
        this.uv.push(u0 + uu * 0.495 + 0.0025, v0 + vv * 0.495 + 0.0025);
        const sh = shade * (t < 0 ? 0.82 : 1);
        this.col.push(sh, sh, sh);
      }
      const b = this.n; this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); this.n += 4;
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

function crown(cards, c, rx, ry, count, size, cell) {
  for (let i = 0; i < count; i++) {
    const a = R(0, 6.283), y = R(-1, 1), r = Math.sqrt(1 - y * y) * Math.cbrt(R(0.2, 1));
    const p = new THREE.Vector3(c.x + Math.cos(a) * r * rx, c.y + y * ry, c.z + Math.sin(a) * r * rx);
    const depth = Math.hypot((p.x - c.x) / rx, (p.y - c.y) / ry, (p.z - c.z) / rx);
    // deep in the crown and under it little light gets through
    cards.add(p, size * R(0.8, 1.2), cell, c, 0.36 + 0.74 * depth * depth * (0.62 + 0.38 * (y * 0.5 + 0.5)));
  }
}

function tubes(list) { return mergeGeometries(list, false); }

function beech() {
  const h = 25, trunk = curve(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.05, 1, 0), h * 0.78, 9, 0.022);
  const parts = [taper(trunk, 8, t => 0.42 * (1 - t * 0.85) + 0.07 + 0.13 * Math.pow(1 - Math.min(1, t * 8), 2), 7)];
  const c = new Cards();
  for (let i = 0; i < 9; i++) {
    const t = 0.5 + i * 0.055, p = trunk[Math.floor(t * (trunk.length - 1))], a = i * 2.4;
    const end = curve(p, new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)), R(5, 8.5), 5, 0.08);
    parts.push(taper(end, 5, t => 0.12 * (1 - t) + 0.02, 2));
    crown(c, end[4], 3.8, 3, 15, 1.9, 0);
  }
  crown(c, new THREE.Vector3(0, h * 0.84, 0), 4.5, 3.6, 34, 2, 0);
  return { name: 'beech', height: h, trunk: tubes(parts), leaves: c.geometry(), bark: 'beech' };
}
function oak() {
  const h = 17, trunk = curve(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 1, 0), h * 0.4, 6, 0.05);
  const parts = [taper(trunk, 9, t => 0.72 * (1 - t * 0.45) + 0.25 * Math.pow(1 - Math.min(1, t * 6), 2), 3)];
  const c = new Cards(), top = trunk[5];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + R(0, 0.5), end = curve(top, new THREE.Vector3(Math.cos(a), 0.55 + i * 0.05, Math.sin(a)), R(7, 10), 6, 0.1);
    parts.push(taper(end, 6, t => 0.26 * (1 - t) + 0.03, 2));
    crown(c, end[5], 4.8, 3.2, 16, 2.1, 3);
  }
  crown(c, new THREE.Vector3(0, h * 0.75, 0), 8.5, 5.5, 52, 2.2, 3);
  return { name: 'oak', height: h, trunk: tubes(parts), leaves: c.geometry(), bark: 'dark' };
}
function birch() {
  const h = 16, trunk = curve(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.03, 1, 0.02), h * 0.92, 8, 0.03);
  const parts = [taper(trunk, 6, t => 0.19 * (1 - t * 0.85) + 0.02, 3)];
  const c = new Cards();
  for (let i = 0; i < 9; i++) {
    const t = 0.42 + i * 0.058, p = trunk[Math.floor(t * (trunk.length - 1))], a = i * 2.4;
    const end = curve(p, new THREE.Vector3(Math.cos(a), 0.55, Math.sin(a)), R(2.5, 4), 4, 0.1);
    end[3].y -= 0.6;
    parts.push(taper(end, 4, t => 0.04 * (1 - t) + 0.006, 1));
    crown(c, end[3], 1.7, 2.2, 9, 1.15, 2);
  }
  return { name: 'birch', height: h, trunk: tubes(parts), leaves: c.geometry(), bark: 'birch' };
}
function spruce() {
  const h = 27, trunk = curve(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 1, 0), h, 6, 0.004);
  const c = new Cards(), axis = new THREE.Vector3(0, 0, 0);
  const levels = 17;
  for (let l = 0; l < levels; l++) {
    const t = l / (levels - 1), y = h * (0.22 + 0.77 * t), reach = (1 - t) * 4.4 + 0.42, n = Math.round(6 - t * 2);
    axis.set(0, y + 2, 0);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + l * 1.3 + R(-0.2, 0.2);
      c.add(new THREE.Vector3(Math.cos(a) * reach * 0.56, y - reach * 0.13, Math.sin(a) * reach * 0.56), reach * 0.68, 1, axis, 0.52 + 0.6 * t * 0.75 + 0.42, 0.45, 1);
    }
  }
  return { name: 'spruce', height: h, trunk: taper(trunk, 7, t => 0.36 * (1 - t) + 0.03, 8), leaves: c.geometry(), bark: 'dark' };
}
function bush() {
  const c = new Cards(), m = new THREE.Vector3(0, 1.1, 0);
  crown(c, m, 2, 1.25, 22, 0.95, 3);
  crown(c, new THREE.Vector3(0.7, 1.5, 0.4), 1.2, 0.9, 6, 1.0, 0);
  return { name: 'bush', height: 2.8, trunk: null, leaves: c.geometry(), bark: null };
}

export class Flora {
  constructor(renderer, scene) {
    this.leafTex = makeLeafAtlas();
    this.leafMat = new THREE.ShaderMaterial({
      uniforms: { ...LIT, uMap: { value: this.leafTex }, uTime: WIND }, side: THREE.DoubleSide,
      vertexShader: LIT_VERT + /* glsl */`
        attribute vec3 color; uniform float uTime; varying vec2 vUv2; varying vec3 vCol;
        void main() {
          vec3 p = position;
          float hk = smoothstep(1., 14., p.y);
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3][0] * .08 + instanceMatrix[3][2] * .11;
            mat4 M = modelMatrix * instanceMatrix;
          #else
            float ph = 0.; mat4 M = modelMatrix;
          #endif
          // The wind where the tree stands: the crown leans away from it as each gust goes through,
          // and sways and flutters harder and faster the more it blows
          vec3 wd = windAt(M[3].xz);
          float sp = length(wd.xy) * wd.z;
          vec2 wdir = wd.xy / max(length(wd.xy), .01);
          float swayA = (.2 + sp * .028) * hk, f = 1. + sp * .07;
          p.x += sin(uTime * 1.3 * f + ph + p.y * .25) * swayA + sin(uTime * 3.1 * f + p.x * 1.2 + p.z) * swayA * (.25 + sp * .02);
          p.z += cos(uTime * 1.05 * f + ph) * swayA * .7;
          vec4 wp = M * vec4(p, 1.);
          wp.xz += wdir * min(sp * sp * .004, 1.6) * hk;
          vCol = color;
          #ifdef USE_INSTANCING_COLOR
            vCol *= instanceColor;
          #endif
          // leaves sit in each other's shadow, and in the next tree's: that's what gives a crown its depth
          litSun = sunSeen(wp.xyz, .55);
          litVertex(wp.xyz, normalize(mat3(M) * normal), .55);
          vUv2 = uv; gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: LIT_FRAG + /* glsl */`
        uniform sampler2D uMap; varying vec2 vUv2; varying vec3 vCol;
        void main() {
          vec4 t = texture2D(uMap, vUv2); if (t.a < .5) discard;
          vec3 c = t.rgb * vCol;
          // thin leaves let the sun through and turn it yellow-green
          gl_FragColor = vec4(mix(c * vLight + c * vec3(1.5, 1.7, .55) * vGlow, vFogC, vFogA), 1.);
        }`,
    });
    // the shadow pass reads these two to cut the leaf outline
    this.leafMat.map = this.leafTex; this.leafMat.alphaTest = 0.5;
    this.barks = { beech: makeBark('beech'), birch: makeBark('birch'), dark: makeBark('dark') };
    this.barkMats = {};
    for (const k in this.barks) this.barkMats[k] = new THREE.MeshLambertMaterial({ map: this.barks[k] });
    this.types = { [OBJ.BEECH]: beech(), [OBJ.SPRUCE]: spruce(), [OBJ.BIRCH]: birch(), [OBJ.OAK]: oak(), [OBJ.BUSH]: bush() };
    this.bake(renderer);
    this.props = this.buildProps();
  }
  // render each model from the side into an atlas, used as crossed cards far away
  bake(renderer) {
    const S = 512, order = [OBJ.BEECH, OBJ.SPRUCE, OBJ.BIRCH, OBJ.OAK, OBJ.BUSH], cols = 5;
    const rt = new THREE.WebGLRenderTarget(S * cols, S, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 4 });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 2.5));
    const lm = new THREE.MeshBasicMaterial({ map: this.leafTex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
    const old = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x4f7030, 0); renderer.clear();
    const tone = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    order.forEach((t, i) => {
      const def = this.types[t], group = new THREE.Group();
      group.add(new THREE.Mesh(def.leaves, lm));
      if (def.trunk) group.add(new THREE.Mesh(def.trunk, new THREE.MeshBasicMaterial({ map: this.barks[def.bark], color: 0x999999 })));
      scene.add(group);
      const half = def.height * 0.56;
      const cam = new THREE.OrthographicCamera(-half, half, half * 1.92, -half * 0.08, 0.1, 100);
      cam.position.set(0, 0, 40);
      rt.viewport.set(i * S, 0, S, S); rt.scissor.set(i * S, 0, S, S); rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      scene.remove(group);
      def.farWidth = half * 2; def.farHeight = half * 2; def.atlas = i;
    });
    renderer.toneMapping = tone; rt.scissorTest = false;
    renderer.setRenderTarget(old); renderer.setClearColor(0x000000, 1);
    // tiny card pair, with the atlas column supplied per instance
    const q = new THREE.BufferGeometry(), pos = [], nor = [], uv = [], idx = [];
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + 0.4, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
      pos.push(-cx, -0.04, -cz, cx, -0.04, cz, cx, 0.96, cz, -cx, 0.96, -cz);
      for (let i = 0; i < 4; i++) nor.push(0.2, 0.9, 0.2);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    q.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); q.setIndex(idx);
    this.farGeo = q;
    this.farMat = new THREE.ShaderMaterial({
      uniforms: { ...LIT, uMap: { value: rt.texture } }, side: THREE.DoubleSide,
      vertexShader: LIT_VERT + /* glsl */`
        attribute float iCol; varying vec2 vUv2;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.);
          // a crown shows the viewer its near side, so a card has to be lit like that side. A fixed
          // normal made distant trees change brightness the moment they swapped to the real model.
          vec3 V = cameraPosition - wp.xyz;
          litSun = .55;
          litVertex(wp.xyz, normalize(vec3(V.x, length(V.xz) * .62, V.z)), .45);
          vUv2 = vec2((uv.x + iCol) / 5., uv.y); gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: LIT_FRAG + /* glsl */`
        uniform sampler2D uMap; varying vec2 vUv2;
        void main() {
          vec4 t = texture2D(uMap, vUv2); if (t.a < .42) discard;
          vec3 c = t.rgb * .62;
          gl_FragColor = vec4(mix(c * vLight + c * vec3(1.5, 1.7, .55) * vGlow, vFogC, vFogA), 1.);
        }`,
    });
    // cards cast shadows too, so a forest's shadow doesn't appear as the real trees swap in
    this.farDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    this.farDepth.onBeforeCompile = sh => {
      sh.uniforms.uCards = { value: rt.texture };
      sh.vertexShader = 'attribute float iCol; varying vec2 vCard;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCard = vec2((uv.x + iCol) / 5., uv.y);');
      sh.fragmentShader = 'uniform sampler2D uCards; varying vec2 vCard;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'if (texture2D(uCards, vCard).a < .42) discard;');
    };
  }
  setNight(n) { this.house.glassM.color.set(n ? 0xffc46a : 0x20262c); }
  buildProps() {
    const wood = new THREE.MeshLambertMaterial({ map: makeWood() });
    const darkWood = new THREE.MeshLambertMaterial({ map: wood.map, color: 0x8a7a68 });
    const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); return g; };
    // round bale
    const baleTex = makeBale();
    const baleGeo = new THREE.CylinderGeometry(0.72, 0.72, 1.2, 22, 1); baleGeo.rotateZ(Math.PI / 2);
    const bale = new THREE.MeshLambertMaterial({ map: baleTex });
    // rock: a noisy sphere
    const rockGeo = new THREE.IcosahedronGeometry(1, 3), rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(rp, i), k = 0.72 + 0.5 * (noise(v.x * 1.6 + 3, v.y * 1.6 + v.z) + 0.5);
      rp.setXYZ(i, v.x * k * 1.15, v.y * k * 0.72 + 0.1, v.z * k);
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.MeshLambertMaterial({ map: makeRock() });
    // hay barn with a gabled roof
    const barnParts = [box(9, 4, 6, 0, 2, 0)];
    const roof = new THREE.BufferGeometry();
    const rv = [-4.9, 3.8, -3.5, 4.9, 3.8, -3.5, 4.9, 6.2, 0, -4.9, 6.2, 0, -4.9, 6.2, 0, 4.9, 6.2, 0, 4.9, 3.8, 3.5, -4.9, 3.8, 3.5];
    roof.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)); roof.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]); roof.computeVertexNormals();
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute([-4.5, 4, -3, -4.5, 4, 3, -4.5, 6, 0, 4.5, 4, 3, 4.5, 4, -3, 4.5, 6, 0], 3)); gable.computeVertexNormals();
    // deerstand: ladder, four legs and a cabin
    const legs = [], o = 0.85;
    for (const [x, z] of [[-o, -o], [o, -o], [o, o], [-o, o]]) legs.push(box(0.14, 3.2, 0.14, x, 1.6, z));
    legs.push(box(2, 0.1, 2, 0, 3.2, 0), box(2, 1, 0.06, 0, 3.7, -1), box(2, 0.56, 0.06, 0, 3.54, 1), box(0.06, 1, 2, -1, 3.7, 0), box(0.06, 1, 2, 1, 3.7, 0), box(2.3, 0.08, 2.4, 0, 4.4, 0));
    for (let i = 0; i < 7; i++) legs.push(box(0.76, 0.06, 0.08, 0, 0.42 + i * 0.44, 1.5 - i * 0.07));
    legs.push(box(0.08, 3.3, 0.08, -0.38, 1.6, 1.3), box(0.08, 3.3, 0.08, 0.38, 1.6, 1.3));
    const pole = [new THREE.CylinderGeometry(0.1, 0.14, 8.5, 8).translate(0, 4.25, 0), box(1.8, 0.1, 0.1, 0, 8, 0), box(0.06, 0.2, 0.06, -0.8, 8.1, 0), box(0.06, 0.2, 0.06, 0.8, 8.1, 0)];
    // village house: plastered walls, tiled gable roof, windows that light up after dark
    const tile = makeTiles();
    const prism = (w, d, h0, h1, over) => {
      const g = new THREE.BufferGeometry(), x = w / 2 + over, z = d / 2 + over * 0.7;
      const v = [-x, h0, -z, x, h0, -z, x, h1, 0, -x, h1, 0, -x, h1, 0, x, h1, 0, x, h0, z, -x, h0, z];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / 2, 0, w / 2, 2.2, 0, 2.2, 0, 2.2, w / 2, 2.2, w / 2, 0, 0, 0], 2));
      g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]); g.computeVertexNormals(); return g;
    };
    const flatBox = (...a) => { const g = box(...a).toNonIndexed(); g.deleteAttribute('uv'); return g; };
    const tri = (w, d, y0, y1) => {
      const g = new THREE.BufferGeometry(), x = w / 2, z = d / 2;
      g.setAttribute('position', new THREE.Float32BufferAttribute([-x, y0, -z, -x, y0, z, -x, y1, 0, x, y0, z, x, y0, -z, x, y1, 0], 3)); g.computeVertexNormals(); return g;
    };
    const wallG = mergeGeometries([flatBox(10, 3, 7, 0, 1.5, 0), tri(10, 7, 3, 5.2)]);
    wallG.computeVertexNormals();
    const glassB = [], frames = [];
    const win = (x, y, z, w, h, side) => {
      const d = 0.05;
      glassB.push(side ? flatBox(d, h, w, x, y, z) : flatBox(w, h, d, x, y, z));
      frames.push(side ? flatBox(d * 0.8, h + 0.16, w + 0.16, x - Math.sign(x) * 0.01, y, z) : flatBox(w + 0.16, h + 0.16, d * 0.8, x, y, z - Math.sign(z) * 0.01));
      frames.push(side ? flatBox(d * 1.4, 0.05, w, x, y, z) : flatBox(w, 0.05, d * 1.4, x, y, z));
    };
    for (const x of [-3.6, -1.4, 3.4]) { win(x, 1.75, 3.52, 1.1, 1.3, false); win(x, 1.75, -3.52, 1.1, 1.3, false); }
    win(1, 1.75, -3.52, 1.1, 1.3, false);
    for (const z of [-1.5, 1.5]) { win(5.02, 1.75, z, 1.1, 1.3, true); win(-5.02, 1.75, z, 1.1, 1.3, true); }
    win(5.02, 3.9, 0, 0.9, 0.9, true); win(-5.02, 3.9, 0, 0.9, 0.9, true);
    const trimG = mergeGeometries([...frames, flatBox(10.04, 0.55, 7.04, 0, 0.27, 0), flatBox(1.2, 2.2, 0.08, 1, 1.1, 3.52), flatBox(0.7, 1.5, 0.7, -2.6, 5.4, 0.8), flatBox(2.2, 0.08, 1.2, 1, 2.45, 3.9)]);
    trimG.computeVertexNormals();
    this.house = {
      wall: wallG, wallM: new THREE.MeshLambertMaterial({ color: 0xffffff }), roof: prism(10, 7, 2.95, 5.28, 0.42), roofM: new THREE.MeshLambertMaterial({ map: tile, side: THREE.DoubleSide }),
      trim: trimG, trimM: new THREE.MeshLambertMaterial({ color: 0xcfcbc2 }), glass: mergeGeometries(glassB), glassM: new THREE.MeshBasicMaterial({ color: 0x20262c }),
    };
    // village church
    const tower = flatBox(3.6, 11, 3.6, 0, 5.5, -6.8), nave = flatBox(7, 6, 11, 0, 3, 0);
    const spire = new THREE.ConeGeometry(2.75, 6.5, 4).rotateY(Math.PI / 4).translate(0, 14.2, -6.8).toNonIndexed(); spire.deleteAttribute('uv');
    const crossG = mergeGeometries([flatBox(0.1, 1.1, 0.1, 0, 17.9, -6.8), flatBox(0.6, 0.1, 0.1, 0, 18, -6.8)]);
    const naveRoof = prism(7, 11, 5.95, 9, 0.3).rotateY(Math.PI / 2);
    const rs = naveRoof.attributes.position; // the prism was authored along x; the nave runs along z
    for (let i = 0; i < rs.count; i++) rs.setX(i, rs.getX(i) * 0.636), rs.setZ(i, rs.getZ(i) * 1.571);
    naveRoof.computeVertexNormals();
    const churchGlass = []; for (const z of [-3, 0, 3]) for (const x of [-3.52, 3.52]) churchGlass.push(flatBox(0.05, 2.6, 1, x, 3.2, z));
    // fallen trunk, 5.2 m along local x, resting on the ground
    const logParts = [new THREE.CylinderGeometry(0.22, 0.3, 5.2, 12, 1).rotateZ(Math.PI / 2).translate(0, 0.24, 0)];
    for (const [px, a, l] of [[-0.9, 0.7, 0.8], [1.2, -0.9, 0.55]]) logParts.push(new THREE.CylinderGeometry(0.04, 0.08, l, 6, 1).translate(0, l / 2, 0).rotateZ(a).translate(px, 0.4, 0.1));
    const logGeo = mergeGeometries(logParts);
    // roadside marker post: white with a black band
    const post = [box(0.1, 0.72, 0.07, 0, 0.36, 0), box(0.1, 0.1, 0.07, 0, 0.98, 0)];
    return {
      [OBJ.POST]: { parts: [[mergeGeometries(post), new THREE.MeshLambertMaterial({ color: 0xe9e9e2 })], [box(0.102, 0.18, 0.072, 0, 0.82, 0), new THREE.MeshLambertMaterial({ color: 0x17171a })]] },
      [OBJ.CHURCH]: { parts: [[mergeGeometries([tower, nave]), new THREE.MeshLambertMaterial({ color: 0xf2eee3 })], [naveRoof, this.house.roofM], [spire, new THREE.MeshLambertMaterial({ color: 0x4e7a70 })], [crossG, new THREE.MeshLambertMaterial({ color: 0xc8a43c })], [mergeGeometries(churchGlass), this.house.glassM]] },
      [OBJ.BALE]: { parts: [[baleGeo, bale]] },
      [OBJ.LOG]: { parts: [[logGeo, this.barkMats.dark]], length: 5.2 },
      [OBJ.ROCK]: { parts: [[rockGeo, rock]] },
      [OBJ.BARN]: { parts: [[mergeGeometries(barnParts), wood], [roof, new THREE.MeshLambertMaterial({ color: 0x6d4a3a, side: THREE.DoubleSide })], [gable, darkWood]] },
      [OBJ.STAND]: { parts: [[mergeGeometries(legs), wood]] },
      [OBJ.POLE]: { parts: [[mergeGeometries(pole), darkWood]] },
    };
  }
}
