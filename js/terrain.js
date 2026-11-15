// Streams baked chunks around the car, owns the crops, and remembers what was flattened or felled.
import * as THREE from 'three';
import { CHUNK, KIND, OBJ, height } from './world.js';
import { makeDetail, makeCropAtlas, makeDeck } from './textures.js';
import { WIND, LIT, LIT_VERT, LIT_FRAG, CLOUD } from './flora.js';

const key = (x, z) => x + ',' + z;
const HARD = new Set([KIND.PATH, KIND.FORD, KIND.BED]);   // gravel and stone: wheels leave nothing here
// [trunk radius, break impulse (Infinity = never), solid height]
export const SOLID = {
  [OBJ.BEECH]: [0.34, 21000, 30], [OBJ.SPRUCE]: [0.3, 18000, 30], [OBJ.BIRCH]: [0.16, 7000, 20], [OBJ.OAK]: [0.72, Infinity, 20],
  [OBJ.ROCK]: [0.86, Infinity, 1.1], [OBJ.STAND]: [0.8, 5000, 4.5], [OBJ.POLE]: [0.14, 6000, 8], [OBJ.POST]: [0.07, 500, 1.1], [OBJ.RAIL]: [0.2, Infinity, 1.05],
};

export class Terrain {
  constructor(scene, flora, q) {
    this.scene = scene; this.flora = flora; this.q = q;
    this.chunks = new Map(); this.pending = new Map(); this.trample = new Map(); this.broken = new Set();
    this.dirty = new Set(); this.jobId = 0;
    this.workers = []; this.idle = [];
    const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => { this.idle.push(w); this.onBaked(e.data); this.pump(); };
      w.onerror = e => console.error('worker', e.message);
      this.workers.push(w); this.idle.push(w);
    }
    this.queue = [];
    this.groundMat = this.makeGroundMat();
    this.indices = {};
    this.cropBase = this.makeTuftGeometry();
    this.atlas = makeCropAtlas();
    this.tuftGeoTime = WIND;
    this.boxTmp = new THREE.Matrix4();
    this.dyn = [];              // loose bales
    this.wireMat = new THREE.LineBasicMaterial({ color: 0x24262a });
    this.spanIndex = new Map();
    this.onSpawnBale = null;
    this.onRemoveChunk = null;
    this.nearRadius = q.lite ? 1 : 2; // (a phone: only the chunks right round you get the fine mesh)
    this.farRadius = q.far;
    this.sunUniform = { value: new THREE.Vector3() };
    this.wake = { value: new THREE.Vector4() };
    this.cloudHere = { value: 1 };
    this.deckMats = {
      top: new THREE.MeshStandardMaterial({ map: makeDeck(), roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      con: new THREE.MeshStandardMaterial({ color: 0xa7a59c, roughness: 0.9, side: THREE.DoubleSide }),
      rail: new THREE.MeshStandardMaterial({ color: 0x9aa0a5, roughness: 0.42, metalness: 0.65, side: THREE.DoubleSide }),
    };
  }
  setQuality(q) { this.q = q; this.farRadius = q.far; this.nearRadius = q.lite ? 1 : 2; }

  // The sky texture is the same one the dome shows, so the water mirrors the actual clouds.
  // Fresnel does most of the work: looking along a river is a mirror, looking down is glass.
  makeWaterMat(sky) {
    return new THREE.ShaderMaterial({
      uniforms: { ...LIT, uSky: { value: sky }, uNrm: { value: this.detailN }, uDet: { value: this.detail }, uTime: WIND, uWake: this.wake },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: LIT_VERT + /* glsl */`
        attribute vec4 aW; attribute float aShade;
        varying vec3 vP; varying vec4 vW; varying float vS;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.);
          vP = wp.xyz; vW = aW; vS = aShade;
          litVertex(wp.xyz, vec3(0., 1., 0.), 0.);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: LIT_FRAG + /* glsl */`
        uniform sampler2D uSky, uNrm, uDet; uniform float uTime, uRainK; uniform vec3 uSunDir, uSunCol; uniform vec4 uWake;
        uniform mat4 uCarInv; uniform vec2 uCarBox;
        varying vec3 vP; varying vec4 vW; varying float vS;
        const float CYCLE = 2.6;
        // two copies of the ripples slide with the current and swap before they stretch too far
        vec2 flowN(vec2 p, vec2 f, float scale) {
          float a = fract(uTime / CYCLE), b = fract(uTime / CYCLE + .5), k = abs(2. * a - 1.);
          vec2 n1 = texture2D(uNrm, (p - f * a * CYCLE) * scale).xy - .5, n2 = texture2D(uNrm, (p - f * b * CYCLE) * scale + .37).xy - .5;
          return mix(n1, n2, k);
        }
        void main() {
          float depth = vW.x;
          if (depth <= -.2) discard;
          // the doors are shut: no water surface inside the cabin
          vec3 inCar = (uCarInv * vec4(vP, 1.)).xyz;
          if (abs(inCar.x) < uCarBox.x - .1 && abs(inCar.z) < uCarBox.y - .1) discard;
          // just above the waterline the bank is wet and dark
          if (depth <= 0.) { gl_FragColor = vec4(mix(vec3(.018, .016, .012) * vLight, vFogC, vFogA), .42 * smoothstep(-.2, -.02, depth)); return; }
          vec2 p = vP.xz, f = vW.yz;
          float flow = length(f), rush = clamp(vW.w + flow * .1, 0., 1.);
          vec2 n = flowN(p, f, .11) * (.1 + .32 * rush) + flowN(p, f, .37) * (.1 + .3 * rush);
          if (uRainK > .01) {
            // each cell of the grid has a drop landing at its own time and place, spreading as a ring
            for (int k = 0; k < 2; k++) {
              vec2 gq = p * (k == 0 ? 1.3 : 2.7) + float(k) * 17., gi = floor(gq), gf = fract(gq) - .5;
              float gh = fract(sin(dot(gi, vec2(12.9898, 78.233))) * 43758.5453), gt = fract(uTime * (.8 + gh * .5) + gh * 7.);
              vec2 rel = gf - (vec2(fract(gh * 13.7), fract(gh * 91.3)) - .5) * .5;
              float rl = length(rel);
              float ring = (1. - smoothstep(0., .1, abs(rl - gt * .5))) * (1. - gt) * step(gh, uRainK);
              n += rel / max(rl, .001) * ring * .22;
            }
          }
          vec3 N = normalize(vec3(n.x, 1., n.y));
          vec3 V = normalize(cameraPosition - vP);
          vec3 R = reflect(-V, N); R.y = abs(R.y) + .004; R = normalize(R);
          vec3 sky = texture2D(uSky, vec2(atan(R.x, R.z) / 6.28318 + .5, asin(R.y) / 3.14159 + .5)).rgb;
          // the bank and the trees on it take the bottom of the mirror
          float line = .05 + .12 * texture2D(uDet, p * .004).g * (2. - vS) + .5 * (1. - vS);
          sky = mix(sky, vec3(.07, .115, .04) * vLight, smoothstep(line, line * .32, R.y));
          float F = .025 + .975 * pow(1. - max(dot(V, N), 0.), 5.);
          // clear water: the bed shows through the shallows and only depth turns it dark
          float thick = 1. - exp(-depth * .95);
          vec3 body = mix(vec3(.07, .08, .05), vec3(.012, .03, .03), thick) * vLight;
          vec3 col = mix(body, sky, F);
          float a = mix(thick * .92, 1., F * .9);
          col += uSunCol * pow(max(dot(R, uSunDir), 0.), 420.) * 1.6 * vS * vSunK;
          // white water where it runs fast or thin, and around whatever pushes through it
          float wake = 0.;
          if (uWake.w > .01) { float dc = length(p - uWake.xy); wake = uWake.w * smoothstep(uWake.z + 2.4, uWake.z * .6, dc); }
          // the foam is drawn out along the current and gathers in bands across it, the riffles
          vec2 dir = f / max(flow, .01), q = vec2(dot(p, dir), dir.x * p.y - dir.y * p.x);
          float ta = fract(uTime / CYCLE), tb = fract(uTime / CYCLE + .5);
          vec2 u1 = vec2((q.x - flow * ta * CYCLE) * .42, q.y * 1.1), u2 = vec2((q.x - flow * tb * CYCLE) * .42 + .31, q.y * 1.1 + .17);
          float mixK = abs(2. * ta - 1.);
          float streak = mix(texture2D(uDet, u1).r * texture2D(uDet, u1 * .17).b, texture2D(uDet, u2).r * texture2D(uDet, u2 * .17).b, mixK) * 2.;
          float riffle = smoothstep(.46, .66, texture2D(uDet, vec2(q.x * .012, q.y * .004)).g);
          float amt = clamp(vW.w * riffle * 1.3 + wake + (1. - smoothstep(.0, .1, depth)) * .12 * rush, 0., 1.);
          float foam = smoothstep(.62 - amt * .16, .98 - amt * .14, streak) * smoothstep(0., .35, amt) * .6;
          col = mix(col, vec3(.8, .84, .83) * vLight, foam);
          a = max(a, foam);
          a *= smoothstep(0., .06, depth);
          gl_FragColor = vec4(mix(col, vFogC, vFogA), a);
        }`,
    });
  }

  makeGroundMat() {
    const { detail, normal } = makeDetail();
    this.detail = detail; this.detailN = normal;
    normal.repeat.set(CHUNK / 3.2, CHUNK / 3.2);
    return new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.3, 0.3), side: THREE.DoubleSide });
  }
  groundFor(tex, road, mud) {
    const m = this.groundMat.clone();
    m.map = tex;
    const detail = this.detail;
    this.noRoad ||= new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.noMud ||= Object.assign(new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat), { needsUpdate: true });
    m.onBeforeCompile = sh => {
      sh.uniforms.uDetail = { value: detail }; sh.uniforms.uRoad = { value: road || this.noRoad }; sh.uniforms.uRoadOn = { value: road ? 1 : 0 };
      sh.uniforms.uMud = { value: mud || this.noMud }; sh.uniforms.uMudOn = { value: mud ? 1 : 0 };
      sh.uniforms.uCloudTex = LIT.uCloudTex; sh.uniforms.uCloudAmt = LIT.uCloudAmt; sh.uniforms.uCloudP = LIT.uCloudP; sh.uniforms.uCloudHere = this.cloudHere;
      sh.uniforms.uWxTex = LIT.uWxTex; sh.uniforms.uWxP = LIT.uWxP; sh.uniforms.uWxS = LIT.uWxS; sh.uniforms.uIceTex = LIT.uIceTex;
      sh.uniforms.uWet = LIT.uWet; sh.uniforms.uRainK = LIT.uRainK; sh.uniforms.uSkyG = { value: this.skyTex }; sh.uniforms.uTimeG = WIND; sh.uniforms.uSunDirG = LIT.uSunDir; sh.uniforms.uSunColG = LIT.uSunCol;
      sh.vertexShader = 'attribute float aUnder; varying vec3 vW; varying float vUpY, vUnder;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n vW = (modelMatrix * vec4(transformed, 1.)).xyz; vUpY = normal.y; vUnder = aUnder;');
      sh.fragmentShader = 'uniform sampler2D uDetail, uRoad, uCloudTex, uSkyG, uMud; uniform vec4 uCloudP; uniform float uMudOn, uRoadOn, uCloudAmt, uCloudHere, uWet, uRainK, uTimeG; uniform vec3 uSunDirG, uSunColG; varying vec3 vW; varying float vUpY, vUnder;\n' + CLOUD + '\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
        float cloudK = cloudShade(texture2D(uCloudTex, cloudUv(vW.xz)).r) * lidShade(vW.xz) / uCloudHere;
        reflectedLight.directDiffuse *= cloudK; reflectedLight.directSpecular *= cloudK;`).replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
        // worn asphalt catches a low sun, nothing else out here has a sheen
        roughnessFactor = mix(roughnessFactor, .58 + .26 * d1, roadK);
        // rain: everything gets a sheen, and puddles are mirrors
        roughnessFactor = mix(roughnessFactor, mix(.34, .12, roadK), wetD * (1. - steepWet) * .8);
        // mud is wet and greasy: a soft sheen on it, only the dried crust on the ridges stays matt
        roughnessFactor = mix(roughnessFactor, .3 + .18 * d1, mudK * (1. - mudCrust * .85));
        roughnessFactor = mix(roughnessFactor, .03, puddleK);
        roughnessFactor = mix(roughnessFactor, .55, iceK);`).replace('#include <map_fragment>', /* glsl */`
        vec4 sp = texture2D(map, vMapUv);
        vec2 wuv = vMapUv * ${CHUNK}.;
        float d1 = texture2D(uDetail, wuv * .19).r, d2 = texture2D(uDetail, wuv * .034).g, d3 = texture2D(uDetail, wuv * .71).b, roadK = 0., steepWet = 0., puddleK = 0., wetD = wxAt(vW.xz).a * (1. - vUnder);
        // a texture laid from above smears down a steep bank: there it runs along the slope instead
        float steep = 1. - smoothstep(.66, .9, vUpY);
        if (steep > .01) {
          vec2 side = vec2(wuv.x + wuv.y, vW.y * 1.4);
          d1 = mix(d1, texture2D(uDetail, side * .19).r, steep); d3 = mix(d3, texture2D(uDetail, side * .71).b, steep);
        }
        vec3 col = sp.rgb * (.66 + .46 * d1 + .26 * d2 + .16 * (d3 - .5));
        float tr = smoothstep(.05, .75, sp.a);
        vec3 torn = vec3(.082, .058, .038) * (.68 + .85 * d3 + .4 * d1);
        if (uRoadOn > .5) {
          vec4 rd = texture2D(uRoad, vMapUv * ${(128 / 129).toFixed(6)} + ${(0.5 / 129).toFixed(6)});
          float dr = abs(rd.r), aw = fwidth(rd.r) * 1.2 + .012, on = 1. - smoothstep(4.5, 4.62, dr);
          float da = fract(rd.g / 12.), dash = smoothstep(.0, .012, da) * (1. - smoothstep(.42, .432, da));
          float line = max((1. - smoothstep(.055, .055 + aw, dr)) * dash, 1. - smoothstep(.055, .055 + aw, abs(dr - 4.1)));
          col = mix(col, vec3(.74, .74, .71) * (.62 + .5 * d1 + .3 * d3), line * rd.b * on * .9);
          // on asphalt a sliding tyre leaves rubber, not torn soil
          torn = mix(torn, vec3(.009, .009, .01), on); tr *= 1. - on * .25;
          roadK = on * (1. - line * rd.b);
        }
        // Mud (uMud: r cover, g standing water, b rut depth). It's built as a height: clods and churned
        // ridges, the two ruts and every fresh tyre print pressed into it. That height bends the normal
        // (after the normal map, below), so the low sun and the sky pick out the lumps on a greasy sheen,
        // while water lies flat in the low places and mirrors the sky like a rain puddle.
        float mudK = 0., mudH = 0., mudCrust = 0., mudPool = 0.;
        if (uMudOn > .5) {
          vec4 md = texture2D(uMud, vMapUv);
          // (the detail map's blue is gravel grain: mud takes its smooth red channel only)
          float fineM = texture2D(uDetail, wuv * .37 + .31).r, clod = texture2D(uDetail, wuv * .83).r, rut = md.b;
          // a ragged edge: the mud frays out into the track in tongues, it doesn't stop at a line
          mudK = smoothstep(.05, .75, md.r + (clod - .5) * .5 + (fineM - .5) * .25);
          float print = tr * smoothstep(.05, .35, mudK);
          float lump = clod * .65 + fineM * .35, churn = texture2D(uDetail, wuv * 3.7).r;
          mudH = ((lump - .5) * .09 + (churn - .5) * .006 - rut * .2 - print * .08) * mudK;
          mudCrust = smoothstep(.5, .74, lump - rut * .65) * (1. - print) * (1. - md.g);
          vec3 wetM = vec3(.050, .036, .023) * (.72 + .6 * fineM), dryM = vec3(.165, .126, .088) * (.8 + .4 * churn);
          // a tyre print in mud is a wet dark groove, not the dry torn soil of a field
          col = mix(col, mix(wetM, dryM, mudCrust), mudK * .92);
          col *= 1. - .35 * (rut + print) * mudK;
          float pool = clamp(md.g * 1.3 + (d2 - .5) * .55, 0., 1.);
          pool = max(pool, smoothstep(.5, .85, rut) * smoothstep(.4, .62, d2 + .08));
          pool = max(pool, print * smoothstep(.45, .85, rut + md.g) * .7);
          mudPool = smoothstep(.48, .72, pool) * mudK;
          // muddy water is opaque and brown under its reflection
          col = mix(col, vec3(.07, .055, .038) * (.85 + .3 * d1), mudPool * .85);
          tr *= 1. - mudK;
        }
        col = mix(col, torn, tr * .92);
        // wet earth is darker, and rain collects in the flat low places (the broad detail map decides where)
        steepWet = 1. - smoothstep(.9, .985, vUpY);
        float basin = smoothstep(.5, .72, d2 * .65 + texture2D(uDetail, wuv * .012).g * .45);
        puddleK = clamp((wetD - .35) * 1.9, 0., 1.) * basin * (1. - steepWet) * (1. - step(.5, tr)) * (1. - .55 * roadK);
        puddleK = max(puddleK, mudPool * (1. - steepWet));
        col *= 1. - .42 * wetD * (1. - steepWet * .5);
        col = mix(col, col * .45, puddleK);
        // Hail lying on the ground: single stones, 1.3 to 2.7 cm, scattered over cells of 14 cm. At
        // most half the cells hold one, so it never closes into a white sheet. Far off, where a
        // pixel covers many cells, it's their share of the ground instead. None in the water.
        float ice = textureLod(uIceTex, (vW.xz - uWxP.xy) * uWxP.z, 0.).r * (1. - vUnder) * (1. - steep * .6), iceK = 0.;
        if (ice > .01) {
          vec2 hc = vW.xz * 7., hi = floor(hc), hf = fract(hc) - .5;
          float hh = fract(sin(dot(hi, vec2(12.9898, 78.233))) * 43758.5453);
          float rad = .09 + .1 * fract(hh * 7.13), aa = fwidth(hc.x) + fwidth(hc.y);
          float dist = length(hf - (vec2(fract(hh * 13.7), fract(hh * 91.3)) - .5) * .6);
          float stone = step(hh, ice * .5) * (1. - smoothstep(rad - aa * .5, rad + aa * .5, dist));
          iceK = mix(stone, ice * .07, smoothstep(.25, .9, aa));
        }
        puddleK *= 1. - iceK;
        col = mix(col, vec3(.8, .83, .86) * (.92 + .16 * d1), iceK);
        diffuseColor.rgb *= col;`).replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        if (uMudOn > .5) {
          // bump from the mud height (Mikkelsen's surface gradient, in view space; heights are metres).
          // Derivatives are taken outside any per-pixel branch, so they stay valid.
          // mud is smooth between its lumps: the gravelly grain of the ground's normal map goes
          vec3 base = normalize(mix(normal, normalize(vNormal) * faceDirection, clamp(mudK * 1.3, 0., 1.)));
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          vec3 r1 = cross(sY, base), r2 = cross(base, sX);
          float det = dot(sX, r1), hX = dFdx(mudH), hY = dFdy(mudH);
          vec3 bumped = normalize(abs(det) * base - sign(det) * (hX * r1 + hY * r2));
          normal = normalize(mix(base, bumped, clamp(mudK * 1.4, 0., 1.) * (1. - mudPool)));
        }`).replace('#include <opaque_fragment>', /* glsl */`
        {
          // the sky in puddles and on wet tarmac; rings spread from random points while it rains
          vec3 Vw = normalize(cameraPosition - vW);
          vec2 gq = vW.xz * 1.15, gi = floor(gq), gf = fract(gq) - .5;
          float gh = fract(sin(dot(gi, vec2(12.9898, 78.233))) * 43758.5453), gt = fract(uTimeG * (.7 + gh * .5) + gh * 7.);
          float ring = (1. - smoothstep(0., .09, abs(length(gf - (vec2(fract(gh * 13.7), fract(gh * 91.3)) - .5) * .5) - gt * .5))) * (1. - gt) * uRainK * (1. - vUnder);
          vec3 Rw = reflect(-Vw, normalize(vec3(ring * .3 + (d3 - .5) * .03, 1., ring * .2)));
          Rw.y = abs(Rw.y) + .004; Rw = normalize(Rw);
          vec3 skyW = texture2D(uSkyG, vec2(atan(Rw.x, Rw.z) / 6.28318 + .5, asin(Rw.y) / 3.14159 + .5)).rgb;
          float Fw = .03 + .97 * pow(1. - max(Vw.y, 0.), 5.);
          float kW = puddleK * (.3 + .7 * Fw) * (1. + ring * .7) + wetD * (1. - steepWet) * (1. - puddleK) * (roadK * .45 + .06) * Fw;
          // muddy water is no clean mirror: a dimmer, browner sky in it
          kW *= 1. - .48 * mudPool;
          skyW *= mix(vec3(1.), vec3(.78, .66, .5), mudPool);
          outgoingLight += min(skyW, vec3(.9)) * kW * .55 * cloudK;
        }
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'ground';
    return m;
  }
  makeTuftGeometry() {
    const pos = [], uv = [], idx = [];
    const seg = 2;
    for (let k = 0; k < 2; k++) {
      const a = k * 1.571 + 0.3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
      for (let j = 0; j <= seg; j++) { const t = j / seg; pos.push(-cx, t, -cz, cx, t, cz); uv.push(0, t, 1, t); }
      for (let j = 0; j < seg; j++) { const p = b + j * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    return g;
  }
  cropMat(tex) {
    return new THREE.ShaderMaterial({
      uniforms: { ...LIT, uChunk: { value: tex }, uAtlas: { value: this.atlas }, uTime: WIND }, side: THREE.DoubleSide,
      vertexShader: LIT_VERT + /* glsl */`
        attribute vec4 iA; attribute vec4 iB;
        uniform sampler2D uChunk; uniform float uTime; uniform mat4 uCarInv; uniform vec2 uCarBox;
        varying vec2 vTuv; varying vec3 vTint; varying float vRaw, vH, vTr, vWave, vIce;
        void main() {
          vec2 cuv = iA.xz / ${CHUNK}.;
          vec4 ch = textureLod(uChunk, cuv, 0.);
          float tr = smoothstep(.03, .5, ch.a);
          float ang = iB.x * 6.283 / 40.;
          float cs = cos(ang), sn = sin(ang);
          float H = iB.y * (1. - tr * .86), W = iB.z;
          // nothing grows through the floor of the car
          vec3 inCar = (uCarInv * vec4(iA.xyz + vec3(modelMatrix[3][0], 0., modelMatrix[3][2]), 1.)).xyz;
          if (abs(inCar.x) < uCarBox.x && abs(inCar.z) < uCarBox.y) H = 0.;
          // where hail has fallen the crop stands battered, lower
          vec2 wpos = iA.xz + vec2(modelMatrix[3][0], modelMatrix[3][2]);
          vIce = textureLod(uIceTex, (wpos - uWxP.xy) * uWxP.z, 0.).r;
          H *= 1. - .35 * vIce * (iA.w > 40. ? .4 : 1.);
          vec3 p = vec3((position.x * cs - position.z * sn) * W, position.y * H, (position.x * sn + position.z * cs) * W);
          // The wind: each gust lays the stalks over as it passes, so waves roll across a field, and
          // the stalks flutter faster in a stronger wind. Under the trees it hardly reaches.
          vec3 wd = windAt(wpos);
          float sp = length(wd.xy) * wd.z * (iA.w > 40. ? .3 : 1.);
          vec2 wdir = wd.xy / max(length(wd.xy), .01);
          float lean = clamp(sp / 15., 0., .85);
          float flut = sin(uTime * (2.2 + sp * .3) + iA.x * .9 + iA.z * .7 + ang) * (.06 + sp * .012);
          float bend = position.y * position.y * H;
          p.xz += wdir * (lean * .95 + flut) * bend + vec2(-wdir.y, wdir.x) * flut * .4 * bend;
          // laid over, a stalk reaches less high
          p.y -= lean * lean * .4 * position.y * H;
          p.x += sin(ang * 9.) * tr * .6 * position.y;
          p.z += cos(ang * 9.) * tr * .6 * position.y;
          // a bent stalk shows its paler side: that's what makes a gust visible from afar
          vWave = clamp((wd.z - .9) * lean * 1.8, -.3, .8);
          vec4 wp = modelMatrix * vec4(p + iA.xyz, 1.);
          vec2 cellP = vec2(mod(iB.w, 4.), floor(iB.w / 4.));
          vTuv = vec2((cellP.x + .008 + uv.x * .984) / 4., 1. - (cellP.y + .004 + (1. - uv.y) * .992) / 4.);
          vTint = ch.rgb; vRaw = iA.w > 40. ? 1. : 0.; vH = position.y; vTr = tr;
          // A tuft takes the shadow at its foot from the sun's shadow map, as the mean of four reads so
          // it fades at a shadow's edge. Grass in shade still gets the sky, a blade isn't a black card.
          litAmb = .95;
          if (uShadowOn > .5) {
            vec4 sc = uShadowMat * vec4(modelMatrix[3].xyz + iA.xyz + vec3(0., .35, 0.), 1.);
            vec3 q = sc.xyz / sc.w;
            vec2 qe = min(q.xy, 1. - q.xy);
            float qin = smoothstep(.01, .14, min(qe.x, qe.y));   // fade out toward the map's edge, no hard line
            if (qin > 0. && q.z < 1.) {
              float s = 0.;
              s += step(q.z - .0007, unpackRGBAToDepth(textureLod(uShadowMap, q.xy + vec2(.0035, .0012), 0.)));
              s += step(q.z - .0007, unpackRGBAToDepth(textureLod(uShadowMap, q.xy - vec2(.0035, .0012), 0.)));
              s += step(q.z - .0007, unpackRGBAToDepth(textureLod(uShadowMap, q.xy + vec2(-.0012, .0035), 0.)));
              s += step(q.z - .0007, unpackRGBAToDepth(textureLod(uShadowMap, q.xy + vec2(.0012, -.0035), 0.)));
              litSun = mix(1., s * .25, qin);
            }
          }
          litVertex(wp.xyz, vec3(0., 1., 0.), position.y * 1.1);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: LIT_FRAG + /* glsl */`
        uniform sampler2D uAtlas; uniform float uWet; varying vec2 vTuv; varying vec3 vTint; varying float vRaw, vH, vTr, vWave, vIce;
        void main() {
          vec4 tf = texture2D(uAtlas, vTuv);
          if (tf.a < .45) discard;
          vec3 tint = mix(vTint * tf.rgb * 1.32, tf.rgb, vRaw);
          tint *= mix(.5, 1.08, smoothstep(.0, .75, vH));
          tint *= 1. + vWave * .3 * (1. - vRaw) * smoothstep(.2, .8, vH);
          tint = mix(tint, vec3(.12, .09, .05), vTr * .5);
          tint *= 1. - .32 * uWet;
          // battered by hail: torn leaves go a little dull
          tint *= 1. - .15 * vIce;
          gl_FragColor = vec4(mix(tint * (vLight + vGlow), vFogC, vFogA), 1.);
        }`,
    });
  }

  getIndex(n) {
    if (this.indices[n]) return this.indices[n];
    const V = n + 1, idx = [], base = V * V;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * V + i, b = a + 1, c = a + V, d = c + 1; idx.push(a, c, b, b, c, d); }
    // four strips of skirts hanging from the border
    const sk = (k, side) => base + k * 4 + side;
    for (let k = 0; k < n; k++) {
      const q = (a, b, c, d) => idx.push(a, c, b, b, c, d);
      q(sk(k, 0), sk(k + 1, 0), k, k + 1);
      q(n * V + k, n * V + k + 1, sk(k, 1), sk(k + 1, 1));
      q(k * V, (k + 1) * V, sk(k, 2), sk(k + 1, 2));
      q(sk(k, 3), sk(k + 1, 3), k * V + n, (k + 1) * V + n);
    }
    return (this.indices[n] = new THREE.BufferAttribute(new Uint32Array(idx), 1));
  }

  request(cx, cz, near, pri) {
    const k = key(cx, cz), p = this.pending.get(k);
    if (p && p.near === near) { p.pri = pri; return; }
    if (p && !p.sent) { this.queue = this.queue.filter(j => j !== p); }
    const job = { cx, cz, near, pri, k, sent: false, id: ++this.jobId };
    this.pending.set(k, job); this.queue.push(job);
  }
  pump() {
    if (!this.idle.length || !this.queue.length) return;
    this.queue.sort((a, b) => a.pri - b.pri);
    while (this.idle.length && this.queue.length) {
      const job = this.queue.shift(); job.sent = true;
      this.idle.pop().postMessage({ id: job.id, cx: job.cx, cz: job.cz, near: job.near, lite: !!this.q.lite });
    }
  }
  onBaked(d) {
    const k = key(d.cx, d.cz), job = this.pending.get(k);
    if (job && job.id === d.id) this.pending.delete(k);
    const dist = Math.max(Math.abs(d.cx - this.ccx), Math.abs(d.cz - this.ccz));
    if (dist > this.farRadius + 1) return;
    let c = this.chunks.get(k);
    if (!c) { c = { cx: d.cx, cz: d.cz, k, tree: null, obj: null, patches: [] }; this.chunks.set(k, c); }
    this.disposeSurface(c);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    // which ground vertices lie under a stream: rain wets the bed, but no puddle or ring is drawn through the water
    const under = new Float32Array(d.pos.length / 3);
    if (d.water) for (let p = 0, n = (d.gridN + 1) * (d.gridN + 1); p < n; p++) under[p] = d.water.attr[p * 4] > 0.03 ? 1 : 0;
    g.setAttribute('aUnder', new THREE.BufferAttribute(under, 1));
    g.setIndex(this.getIndex(d.gridN));
    const mid = ((d.gridN + 1) * (d.gridN + 1) - 1) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK / 2, d.pos[mid * 3 + 1], CHUNK / 2), CHUNK * 1.1);

    if (d.near) {
      const tr = this.trample.get(k);
      if (tr) for (let p = 0; p < d.texN * d.texN; p++) d.tex[p * 4 + 3] = tr[p];
    }
    const tex = new THREE.DataTexture(d.tex, d.texN, d.texN, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true; tex.anisotropy = d.near ? 8 : 4; tex.needsUpdate = true;
    let road = null;
    if (d.road) {
      road = new THREE.DataTexture(d.road, 129, 129, THREE.RGBAFormat, THREE.FloatType);
      road.magFilter = road.minFilter = THREE.LinearFilter; road.needsUpdate = true;
    }
    c.road = road;
    let mudTex = null;
    if (d.mud) {
      mudTex = new THREE.DataTexture(d.mud, d.texN, d.texN, THREE.RGBAFormat);
      mudTex.magFilter = THREE.LinearFilter; mudTex.minFilter = THREE.LinearMipmapLinearFilter; mudTex.generateMipmaps = true; mudTex.needsUpdate = true;
    }
    c.mudTex = mudTex;
    const mesh = new THREE.Mesh(g, this.groundFor(tex, road, mudTex));
    mesh.position.set(d.cx * CHUNK, 0, d.cz * CHUNK); mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.scene.add(mesh);
    c.mesh = mesh; c.tex = tex; c.near = d.near; c.texN = d.texN; c.kinds = d.kinds; c.data = d.tex;

    if (d.patches) {
      c.mat = this.cropMat(tex);
      c.patches = d.patches.filter(p => p.data.length).map(p => {
        const n = p.data.length / 8, ig = new THREE.InstancedBufferGeometry();
        ig.index = this.cropBase.index;
        ig.setAttribute('position', this.cropBase.attributes.position);
        ig.setAttribute('uv', this.cropBase.attributes.uv);
        ig.setAttribute('normal', this.cropBase.attributes.normal);
        const buf = new THREE.InstancedInterleavedBuffer(p.data, 8);
        ig.setAttribute('iA', new THREE.InterleavedBufferAttribute(buf, 4, 0));
        ig.setAttribute('iB', new THREE.InterleavedBufferAttribute(buf, 4, 4));
        ig.instanceCount = n;
        ig.boundingSphere = new THREE.Sphere(new THREE.Vector3(p.x, p.data[1], p.z), 46);
        const m = new THREE.Mesh(ig, c.mat);
        m.position.set(d.cx * CHUNK, 0, d.cz * CHUNK); m.matrixAutoUpdate = false; m.updateMatrix();
        m.userData = { n, x: p.x + d.cx * CHUNK, z: p.z + d.cz * CHUNK };
        m.layers.set(1);     // main camera only: the mirror skips tufts
        return m;
      });
      for (const m of c.patches) this.scene.add(m);
    }
    if (d.water) {
      const w = d.water, wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(w.pos, 3));
      wg.setAttribute('aW', new THREE.BufferAttribute(w.attr, 4));
      wg.setAttribute('aShade', new THREE.BufferAttribute(w.sh, 1));
      wg.setIndex(new THREE.BufferAttribute(w.idx, 1));
      wg.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK / 2, w.pos[w.idx[0] * 3 + 1], CHUNK / 2), CHUNK * 1.1);
      this.waterMat ||= this.makeWaterMat(this.skyTex);
      const wm = new THREE.Mesh(wg, this.waterMat);
      wm.position.set(d.cx * CHUNK, 0, d.cz * CHUNK); wm.matrixAutoUpdate = false; wm.updateMatrix();
      wm.renderOrder = -1;    // behind the windscreen, which is drawn with the other see-through things
      this.scene.add(wm); c.water = wm;
    }
    if (d.details) this.placeDetails(c, d.details);
    if (!c.obj) { this.placeObjects(c, d.objects); if (d.deck) this.placeDeck(c, d.deck); }
    // fallen trunks are a mesh each, so they only show in the chunks round the car
    else for (const g of c.props) if (g.userData.log) g.visible = !!c.near;
  }
  placeDeck(c, d) {
    const add = (pos, mat, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false; this.scene.add(m); return m;
    };
    // a culvert is only concrete, so a chunk may have no asphalt or rails at all
    c.deck = [[d.top, this.deckMats.top, d.uv], [d.con, this.deckMats.con], [d.rail, this.deckMats.rail]].filter(p => p[0].length).map(p => add(...p));
  }
  disposeSurface(c) {
    if (c.water) { this.scene.remove(c.water); c.water.geometry.dispose(); c.water = null; }
    if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose(); c.tex.dispose(); c.road?.dispose(); c.mudTex?.dispose(); c.mudTex = null; c.mesh = null; }
    for (const m of c.patches) { this.scene.remove(m); m.geometry.dispose(); }
    for (const m of c.details || []) { this.scene.remove(m); m.dispose(); }
    c.details = null;
    c.patches = []; c.mat?.dispose(); c.mat = null;
  }

  // Mushrooms, cones and stumps from the worker: [x, y, z, kind, rotation, scale] per item.
  // kinds: 0 bolete, 1 fly agaric, 2 cone, 4 stump. One instanced mesh per part, near chunks only.
  detailParts() {
    if (this.detail3) return this.detail3;
    const lam = (o) => new THREE.MeshLambertMaterial(o);
    const stem = new THREE.CylinderGeometry(0.03, 0.045, 0.1, 8).translate(0, 0.05, 0);
    const cap = new THREE.SphereGeometry(0.075, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.095, 0);
    // a fly agaric's cap: red with white flecks
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = '#c4231a'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 46; i++) { x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 100, 2 + Math.random() * 3.5, 0, 7); x.fill(); }
    const fly = new THREE.CanvasTexture(cv); fly.colorSpace = THREE.SRGBColorSpace;
    const cone = new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1, 2.4).translate(0, 0.025, 0);
    const stump = new THREE.CylinderGeometry(0.26, 0.34, 0.42, 12).translate(0, 0.19, 0);
    this.detail3 = {
      stem: [stem, lam({ color: 0xe6dcc6 })], bolete: [cap, lam({ color: 0xffffff })], fly: [cap, lam({ map: fly })],
      cone: [cone, lam({ color: 0x6a4428 })], stump: [stump, this.flora.barkMats.dark],
    };
    return this.detail3;
  }
  placeDetails(c, arr) {
    const P = this.detailParts(), n = arr.length / 6, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), at = new THREE.Vector3();
    const ox = c.cx * CHUNK, oz = c.cz * CHUNK, col = new THREE.Color();
    const groups = { stem: [], bolete: [], fly: [], cone: [], stump: [] };
    for (let i = 0; i < n; i++) {
      const k = arr[i * 6 + 3];
      if (k === 4) groups.stump.push(i); else if (k === 2) groups.cone.push(i);
      else { groups.stem.push(i); groups[k === 1 ? 'fly' : 'bolete'].push(i); }
    }
    c.details = [];
    for (const name in groups) {
      const list = groups[name]; if (!list.length) continue;
      const [geo, mat] = P[name], im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((i, j) => {
        const s = arr[i * 6 + 5], rot = arr[i * 6 + 4], fat = name === 'stem' && arr[i * 6 + 3] === 0 ? 1.6 : 1;
        // cones lie on their side, everything else stands
        e.set(name === 'cone' ? Math.PI / 2 * 0.1 : 0, rot, 0); q.setFromEuler(e);
        at.set(arr[i * 6] + ox, arr[i * 6 + 1] - (name === 'stump' ? 0.05 : 0.01), arr[i * 6 + 2] + oz);
        im.setMatrixAt(j, m4.compose(at, q, sc.set(s * fat, s, s * fat)));
        // boletes in browns from chestnut to pale
        if (name === 'bolete') im.setColorAt(j, col.setHSL(0.065 + Math.sin(i) * 0.015, 0.55, 0.07 + (Math.sin(i * 7.1) * 0.5 + 0.5) * 0.1));
      });
      im.castShadow = name === 'stump'; im.receiveShadow = true;
      this.scene.add(im); c.details.push(im);
    }
  }
  placeObjects(c, list) {
    c.obj = list.map((o, i) => ({ ...o, id: c.k + ':' + i, chunk: c }));
    c.obj = c.obj.filter(o => !this.broken.has(o.id));
    c.solids = []; c.bushes = [];
    const fl = this.flora, far = [], posts = [], houses = [];
    c.props = [];
    const dummy = new THREE.Object3D();
    for (const o of c.obj) {
      const def = fl.types[o.type];
      if (def) far.push(o);
      else if (o.type === OBJ.POST) posts.push(o);
      else if (o.type === OBJ.HOUSE) houses.push(o);
      else if (o.type === OBJ.BALE) { this.onSpawnBale?.(o, c); continue; }
      else if (o.type === OBJ.RAIL) { /* collision only: the rail itself is part of the deck mesh */ }
      else {
        const prop = fl.props[o.type];
        const g = new THREE.Group();
        const scale = o.type === OBJ.ROCK ? o.s * 1.1 : o.type === OBJ.LOG ? o.s : 1;
        g.position.set(o.x, o.y - (o.type === OBJ.ROCK ? 0.2 : o.type === OBJ.BARN ? 0.3 : 0), o.z); g.rotation.y = o.rot; g.scale.setScalar(scale);
        if (o.type === OBJ.LOG) {
          // a trunk lies along the slope, so both ends touch the ground
          const half = prop.length * o.s / 2, ex = Math.cos(o.rot) * half, ez = -Math.sin(o.rot) * half;
          const hA = height(o.x + ex, o.z + ez), hB = height(o.x - ex, o.z - ez);
          g.position.y = (hA + hB) / 2 - 0.06; g.rotation.z = Math.atan2(hA - hB, half * 2);
          g.userData.log = true; g.visible = !!c.near;
        }
        for (const [geo, mat] of prop.parts) { const m = new THREE.Mesh(geo, mat); m.castShadow = !this.q.lite || o.type === OBJ.BARN; m.receiveShadow = true; g.add(m); }
        this.scene.add(g); c.props.push(g); o.mesh = g;
      }
      if (o.type === OBJ.CHURCH) {
        const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
        for (const t of [-6.8, -2, 2.5]) c.solids.push({ x: o.x + sa * t, z: o.z + ca * t, r: t < -6 ? 2.6 : 3.8, str: Infinity, top: o.y + 18, o });
      } else if (o.type === OBJ.HOUSE) {
        const ca = Math.cos(o.rot) * o.s, sa = Math.sin(o.rot) * o.s;
        for (const t of [-2.9, 0, 2.9]) c.solids.push({ x: o.x + ca * t, z: o.z - sa * t, r: 3.6 * o.s, str: Infinity, top: o.y + 6, o });
      } else if (o.type === OBJ.LOG) {
        const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
        for (const t of [-1.9, 0, 1.9]) c.solids.push({ x: o.x + ca * t * o.s, z: o.z - sa * t * o.s, r: 0.36 * o.s, str: 9000, top: o.y + 0.6, o });
      } else if (o.type === OBJ.BARN) {
        const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
        for (const t of [-2.9, 0, 2.9]) c.solids.push({ x: o.x + ca * t, z: o.z - sa * t, r: 3.5, str: Infinity, top: o.y + 7, o });
      } else if (SOLID[o.type]) {
        const [r, str, top] = SOLID[o.type];
        c.solids.push({ x: o.x, z: o.z, r: r * (o.type === OBJ.ROCK ? o.s * 1.1 : o.s), str, top: o.y + top, o });
      } else if (o.type === OBJ.BUSH) c.bushes.push(o);
    }
    // wires sag between each pole and the next, which may stand in the neighbouring chunk
    const spans = c.obj.filter(o => o.type === OBJ.POLE && o.wire);
    if (spans.length) {
      const SEG = 8, pos = new Float32Array(spans.length * 2 * SEG * 6);
      let w = 0;
      spans.forEach((o, i) => {
        const ax = Math.cos(o.rot) * 0.8, az = -Math.sin(o.rot) * 0.8, [nx, ny, nz] = o.wire;
        const point = (sd, t) => {
          const sag = 4 * t * (1 - t) * 0.75;
          return [o.x + (nx - o.x) * t + ax * sd, o.y + (ny - o.y) * t + 8.2 - sag, o.z + (nz - o.z) * t + az * sd];
        };
        this.spanIndex.set(o.key, { c, start: i * 2 * SEG * 2, count: 2 * SEG * 2 });
        for (const sd of [-1, 1]) for (let k = 0; k < SEG; k++) { pos.set(point(sd, k / SEG), w); pos.set(point(sd, (k + 1) / SEG), w + 3); w += 6; }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      c.wires = new THREE.LineSegments(g, this.wireMat); c.wires.frustumCulled = false; this.scene.add(c.wires);
    }
    if (houses.length) {
      const h = fl.house, plaster = [0xf3ead8, 0xe8d6a6, 0xf0efe8, 0xdcc8a0, 0xeec9a0, 0xd8dcd0], col = new THREE.Color();
      c.houseMeshes = [[h.wall, h.wallM], [h.roof, h.roofM], [h.trim, h.trimM], [h.glass, h.glassM]].map(([geo, mat], k) => {
        const im = new THREE.InstancedMesh(geo, mat, houses.length);
        houses.forEach((o, i) => {
          dummy.position.set(o.x, o.y - 0.25, o.z); dummy.rotation.set(0, o.rot, 0); dummy.scale.setScalar(o.s); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (k === 0) im.setColorAt(i, col.set(plaster[(o.tint * 60 | 0) % plaster.length]));
        });
        im.castShadow = k < 2; im.receiveShadow = k === 0; this.scene.add(im); return im;
      });
    }
    // hundreds of these line the roads, so they share one draw call per chunk
    if (posts.length) {
      c.postMeshes = fl.props[OBJ.POST].parts.map(([geo, mat]) => {
        const im = new THREE.InstancedMesh(geo, mat, posts.length);
        posts.forEach((o, i) => {
          dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, o.rot, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix); o.postIndex = i;
        });
        this.scene.add(im); return im;
      });
    }
    if (far.length) {
      const im = new THREE.InstancedMesh(fl.farGeo.clone(), fl.farMat, far.length), cols = new Float32Array(far.length);
      far.forEach((o, i) => {
        const def = fl.types[o.type];
        dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, o.rot, 0);
        const sc = o.s * def.farWidth; dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix); cols[i] = def.atlas; o.farIndex = i;
      });
      im.geometry.setAttribute('iCol', new THREE.InstancedBufferAttribute(cols, 1));
      im.customDepthMaterial = fl.farDepth;
      this.scene.add(im); c.far = im; c.treeList = far;
    }
  }
  // close trees get the real model
  setTreeDetail(c, on) {
    if (on === !!c.tree) return;
    if (!c.treeList?.length) return;
    if (!on) { for (const m of c.tree) { this.scene.remove(m); m.dispose(); } c.tree = null; c.far.visible = true; return; }
    const groups = {}, dummy = new THREE.Object3D();
    for (const o of c.treeList) if (!o.down) (groups[o.type] ||= []).push(o);
    c.tree = [];
    const shadow = this.q.treeShadows;
    for (const t in groups) {
      const def = this.flora.types[t], list = groups[t];
      const set = (im, mesh) => {
        list.forEach((o, i) => {
          dummy.position.set(o.x, o.y, o.z); dummy.rotation.set(0, o.rot, 0); dummy.scale.setScalar(o.s); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix); o.nearIndex = i;
          if (mesh === 'leaf') im.setColorAt(i, new THREE.Color().setHSL(0.26 + (o.s * 17 % 1) * 0.06 - 0.03, 0.08, 0.7 + (o.rot % 1) * 0.3).lerp(new THREE.Color(1, 1, 1), 0.6));
        });
        im.castShadow = shadow; im.receiveShadow = mesh !== 'leaf'; this.scene.add(im); c.tree.push(im);
      };
      set(new THREE.InstancedMesh(def.leaves, this.flora.leafMat, list.length), 'leaf');
      if (def.trunk) { const im = new THREE.InstancedMesh(def.trunk, this.flora.barkMats[def.bark], list.length); im.userData.type = t; set(im, 'trunk'); }
    }
    c.far.visible = false;
  }
  rebuildTrees(c) { const on = !!c.tree; if (on) { this.setTreeDetail(c, false); this.setTreeDetail(c, true); } }

  removeChunk(c) {
    this.disposeSurface(c);
    for (const g of c.props || []) this.scene.remove(g);
    for (const m of c.deck || []) { this.scene.remove(m); m.geometry.dispose(); }
    if (c.wires) { this.scene.remove(c.wires); c.wires.geometry.dispose(); for (const [k, v] of this.spanIndex) if (v.c === c) this.spanIndex.delete(k); }
    if (c.tree) this.setTreeDetail(c, false);
    for (const im of [...(c.postMeshes || []), ...(c.houseMeshes || [])]) { this.scene.remove(im); im.dispose(); }
    if (c.far) { this.scene.remove(c.far); c.far.geometry.dispose(); c.far.dispose(); }
    this.onRemoveChunk?.(c);
    this.chunks.delete(c.k);
  }

  update(x, z, force) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.ccx = cx; this.ccz = cz;
    this.frame = (this.frame || 0) + 1;
    if (force || this.frame % 12 === 0 || cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx; this.lastCz = cz;
      const R = this.farRadius;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.6) * (R + 0.6)) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dz)), near = d <= this.nearRadius;
        const kx = cx + dx, kz = cz + dz, c = this.chunks.get(key(kx, kz));
        if (!c || !c.mesh) this.request(kx, kz, near, d);
        else if (near && !c.near) this.request(kx, kz, true, d - 100);
        else if (!near && c.near && d > this.nearRadius + 1) this.request(kx, kz, false, d + 40);
      }
      for (const c of [...this.chunks.values()]) {
        const d = Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz));
        if (d > R + 2) this.removeChunk(c);
        else {
          // full tree models only in the chunks right around the car: they cost more than the rest of the world
          const cd = Math.hypot((c.cx + 0.5) * CHUNK - x, (c.cz + 0.5) * CHUNK - z);
          this.setTreeDetail(c, cd < (this.q.lite ? (c.tree ? 80 : 65) : (c.tree ? 135 : 112))); // (a phone: full trees only close by)
          if (c.far) c.far.castShadow = this.q.treeShadows && cd < 280;
        }
      }
      this.pump();
    }
    // draw fewer tufts the further a patch is
    const qd = this.q.crops, maxD = this.q.cropDist;
    for (const c of this.chunks.values()) for (const m of c.patches) {
      const dx = m.userData.x - x, dz = m.userData.z - z, dist = Math.hypot(dx, dz);
      if (dist > maxD) { m.visible = false; continue; }
      m.visible = true;
      const t = dist < 38 ? 1 : dist < 75 ? 0.55 : 0.28;
      m.geometry.instanceCount = Math.floor(m.userData.n * t * qd);
    }
    // a phone: rocks, stands and poles each cost a draw call, so only the ones close by are drawn
    if (this.q.lite && this.frame % 10 === 0) for (const c of this.chunks.values()) for (const g of c.props) {
      g.visible = (!g.userData.log || !!c.near) && Math.hypot(g.position.x - x, g.position.z - z) < 140;
    }
    if (this.frame % 5 === 0 && this.dirty.size) {
      for (const c of this.dirty) if (c.tex) c.tex.needsUpdate = true;
      this.dirty.clear();
    }
  }
  ready(x, z, r = 2) {
    r = Math.min(r, this.nearRadius);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const c = this.chunks.get(key(cx + dx, cz + dz)); if (!c || !c.mesh || !c.near) return false; }
    return true;
  }
  progress() { const R = this.farRadius, total = Math.PI * (R + 0.6) * (R + 0.6); return Math.min(1, this.chunks.size / total); }

  // Flatten crops and tear up the ground around (x,z). Returns m² of living crop destroyed.
  // Only soft ground takes that. rubber: a sliding tyre, which marks asphalt and concrete instead.
  // mud: a tyre in mud presses a print even into a track (the shader draws it as a wet groove there)
  stamp(x, z, radius, power = 255, rubber = false, mud = false) {
    const size = 256, d = CHUNK / size, rp = radius / d;
    let killed = 0;
    const c0x = Math.floor((x - radius) / CHUNK), c1x = Math.floor((x + radius) / CHUNK), c0z = Math.floor((z - radius) / CHUNK), c1z = Math.floor((z + radius) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = this.chunks.get(key(cx, cz));
      if (!c || !c.near || c.texN !== size) continue;
      let tr = this.trample.get(c.k);
      if (!tr) { tr = new Uint8Array(size * size); this.trample.set(c.k, tr); }
      const px = (x - cx * CHUNK) / d, pz = (z - cz * CHUNK) / d;
      const i0 = Math.max(0, Math.floor(px - rp)), i1 = Math.min(size - 1, Math.ceil(px + rp));
      const j0 = Math.max(0, Math.floor(pz - rp)), j1 = Math.min(size - 1, Math.ceil(pz + rp));
      let changed = false;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dd = Math.hypot(i + 0.5 - px, j + 0.5 - pz) / rp;
        if (dd > 1) continue;
        const p = j * size + i, v = Math.min(255, power * (1 - dd * dd) * 1.4 + (power >> 2)), k = c.kinds[p];
        if (rubber ? k !== KIND.ROAD && k !== KIND.PANEL : (HARD.has(k) && !(mud && k === KIND.PATH)) || k === KIND.ROAD || k === KIND.PANEL) continue;
        if (k === KIND.PANEL) {
          // the ground shader only knows rubber on asphalt, so here the mark goes into the colour itself
          for (let q = 0; q < 3; q++) c.data[p * 4 + q] = Math.max(34, c.data[p * 4 + q] * 0.86);
          changed = true;
          continue;
        }
        if (v > tr[p]) {
          if (tr[p] < 90 && v >= 90 && (k === KIND.WHEAT || k === KIND.RAPE || k === KIND.GREEN)) killed += d * d;
          tr[p] = v; c.data[p * 4 + 3] = v; changed = true;
        }
      }
      if (changed) this.dirty.add(c);
    }
    return killed;
  }
  nearby(x, z, rad, solids) {
    solids.length = 0;
    const c0x = Math.floor((x - rad) / CHUNK), c1x = Math.floor((x + rad) / CHUNK), c0z = Math.floor((z - rad) / CHUNK), c1z = Math.floor((z + rad) / CHUNK);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = this.chunks.get(key(cx, cz));
      if (!c?.solids) continue;
      for (const s of c.solids) if (!s.dead) { const dx = s.x - x, dz = s.z - z; if (dx * dx + dz * dz < rad * rad) solids.push(s); }
    }
    return solids;
  }
  bushesNear(x, z, rad) {
    const c = this.chunks.get(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK))), out = [];
    if (c?.bushes) for (const b of c.bushes) { const dx = b.x - x, dz = b.z - z; if (dx * dx + dz * dz < rad * rad) out.push(b); }
    return out;
  }
  // remove one standing thing from the instances and collision lists
  fell(solid) {
    const o = solid.o, c = o.chunk;
    solid.dead = true; o.down = true; this.broken.add(o.id);
    if (c?.solids) for (const s of c.solids) if (s.o === o) s.dead = true;
    if (o.type === OBJ.POLE) for (const key of [o.key, o.prev]) {
      // the lines come down with the pole
      const span = this.spanIndex.get(key);
      if (span) { span.c.wires.geometry.attributes.position.array.fill(0, span.start * 3, (span.start + span.count) * 3); span.c.wires.geometry.attributes.position.needsUpdate = true; this.spanIndex.delete(key); }
    }
    if (o.mesh) { this.scene.remove(o.mesh); return; }
    if (o.postIndex != null) {
      for (const im of c.postMeshes) { im.setMatrixAt(o.postIndex, new THREE.Matrix4().makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true; }
      return;
    }
    if (c.far && o.farIndex != null) {
      const m = new THREE.Matrix4().makeScale(0, 0, 0);
      c.far.setMatrixAt(o.farIndex, m); c.far.instanceMatrix.needsUpdate = true;
    }
    this.rebuildTrees(c);
  }
}
