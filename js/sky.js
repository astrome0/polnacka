// Sky is baked once per time of day into an equirect HDR texture without clouds, which the dome
// shows under the raymarched clouds (clouds.js). A copy with a coarse version of those clouds
// (rt) feeds water, puddles and the car's reflections. Fog is patched so distant land melts into the sky.
import * as THREE from 'three';
import { SUN_AZ } from './world.js';
import { LIT, CLOUD_TILE, HAZE } from './flora.js';
import { makeClouds } from './textures.js';

const vec = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const WORLD_UP = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), upward = new THREE.Vector3(), snapped = new THREE.Vector3();

export const PRESETS = [
  { name: 'Zlatá hodina', elev: 7.5, sun: [3.3, 1.75, 0.72], sunI: 3.7, hemiSky: [0.74, 0.72, 0.86], hemiGnd: [0.36, 0.28, 0.18], hemiI: 1.5,
    zenith: [0.13, 0.17, 0.42], horizon: [1.0, 0.68, 0.36], litC: [1.5, 0.82, 0.42], darkC: [0.2, 0.13, 0.25], density: 0.00052, stars: 0, exposure: 1.05, cloud: 0.42, mist: 0.005, shaft: 0.32, key: 0.16 },
  { name: 'Slunečno', elev: 41, sun: [3.0, 2.72, 2.28], sunI: 2.5, hemiSky: [0.66, 0.8, 1.05], hemiGnd: [0.34, 0.34, 0.25], hemiI: 1.6,
    zenith: [0.1, 0.25, 0.62], horizon: [0.68, 0.8, 0.92], litC: [1.5, 1.5, 1.5], darkC: [0.42, 0.47, 0.58], density: 0.00042, stars: 0, exposure: 0.98, cloud: 0.62, mist: 0.001, shaft: 0.16, key: 0.5 },
  { name: 'Podvečer', elev: 1.8, sun: [2.4, 0.74, 0.3], sunI: 2.4, hemiSky: [0.5, 0.48, 0.78], hemiGnd: [0.2, 0.15, 0.17], hemiI: 1.3,
    zenith: [0.05, 0.07, 0.24], horizon: [1.0, 0.42, 0.22], litC: [1.3, 0.45, 0.26], darkC: [0.09, 0.07, 0.17], density: 0.0006, stars: 0.2, exposure: 1.2, cloud: 0.3, mist: 0.007, shaft: 0.4, key: 0.09 },
  { name: 'Noc', elev: 34, sun: [0.46, 0.6, 1.0], sunI: 0.42, hemiSky: [0.12, 0.17, 0.32], hemiGnd: [0.04, 0.05, 0.08], hemiI: 0.7,
    zenith: [0.006, 0.011, 0.032], horizon: [0.028, 0.044, 0.09], litC: [0.14, 0.18, 0.3], darkC: [0.008, 0.012, 0.024], density: 0.0007, stars: 1, exposure: 1.5, cloud: 0.25, mist: 0.004, shaft: 0, key: 0.09 },
];
// the blue hour either side of the night, and a cool pink sunrise with mist in the low ground
const TWILIGHT = { name: 'Soumrak', elev: 0, sun: [0.5, 0.55, 0.9], sunI: 0.08, hemiSky: [0.3, 0.34, 0.55], hemiGnd: [0.08, 0.08, 0.1], hemiI: 0.9,
  zenith: [0.02, 0.035, 0.1], horizon: [0.22, 0.2, 0.32], litC: [0.35, 0.3, 0.45], darkC: [0.05, 0.05, 0.1], density: 0.0007, stars: 0.45, exposure: 1.45, cloud: 0.1, mist: 0.006, shaft: 0, key: 0.09 };
const DAWN = { name: 'Svítání', elev: 1.8, sun: [2.2, 1.0, 0.55], sunI: 2.0, hemiSky: [0.52, 0.52, 0.78], hemiGnd: [0.2, 0.17, 0.18], hemiI: 1.3,
  zenith: [0.06, 0.09, 0.28], horizon: [0.95, 0.58, 0.42], litC: [1.3, 0.6, 0.42], darkC: [0.12, 0.1, 0.2], density: 0.0007, stars: 0.1, exposure: 1.15, cloud: 0.3, mist: 0.012, shaft: 0.4, key: 0.1 };
const [GOLDEN, SUNNY, DUSK, NIGHT] = PRESETS;
// The day as keyframes, each a look the land was tuned to. Hours; 24 wraps to 0.
// The sun's elevation runs through the keyframes; between dusk and dawn the light comes from the moon.
export const DAY = [
  { h: 0, p: NIGHT }, { h: 4.6, p: NIGHT }, { h: 5.4, p: TWILIGHT, elev: -1 }, { h: 6.2, p: DAWN, elev: 1.8 }, { h: 7.6, p: GOLDEN, elev: 7.5 },
  { h: 10.5, p: SUNNY, elev: 38 }, { h: 15, p: SUNNY, elev: 38 }, { h: 18, p: GOLDEN, elev: 7.5 }, { h: 19.4, p: DUSK, elev: 1.8 }, { h: 20.2, p: TWILIGHT, elev: -1 },
  { h: 21, p: NIGHT }, { h: 24, p: NIGHT },
];
const NIGHT_FROM = 20.2, NIGHT_TO = 5.4;
const isNight = h => h >= NIGHT_FROM || h < NIGHT_TO;
function lerpPreset(a, b, k) {
  const o = { name: k < 0.5 ? a.name : b.name };
  for (const key in a) if (key !== 'name') o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => v + (b[key][i] - v) * k) : a[key] + (b[key] - a[key]) * k;
  return o;
}
// the moon hangs high on the other side of the sky from the evening sun
function lightDir(h, out) {
  if (isNight(h)) {
    const e = 34 * Math.PI / 180, az = SUN_AZ;
    return { dir: out.set(Math.cos(e) * Math.sin(az), Math.sin(e), Math.cos(e) * Math.cos(az)).normalize(), elev: 34, moon: true };
  }
  let i = 2;
  while (DAY[i + 1].h <= h) i++;
  const a = DAY[i], b = DAY[i + 1], k = (h - a.h) / (b.h - a.h);
  // a little higher at noon than the sunny keyframes say
  const elev = a.elev + (b.elev - a.elev) * k + 9 * Math.max(0, Math.sin((h - 10.5) / 4.5 * Math.PI));
  const e = Math.max(1, elev) * Math.PI / 180, az = SUN_AZ + (h - 12.8) * 0.11;
  return { dir: out.set(Math.cos(e) * Math.sin(az), Math.sin(e), Math.cos(e) * Math.cos(az)).normalize(), elev, moon: false };
}

// The scene's fog carries the haze's two numbers (HAZE in flora.js) in three's own fog uniforms:
// the weather's density in fogNear, where the drawn land ends in fogFar. density and edge name them.
export class HazeFog extends THREE.Fog {
  constructor(color, density, edge) { super(color, density, edge); }
  get density() { return this.near; } set density(v) { this.near = v; }
  get edge() { return this.far; } set edge(v) { this.far = v; }
}
export function patchFog() {
  THREE.ShaderChunk.fog_pars_fragment = THREE.ShaderChunk.fog_pars_fragment.replace('#ifdef USE_FOG', '#ifdef USE_FOG\n' + HAZE);
  // sun-aware fog: toward the sun the haze takes the sun's colour, matching the sky's horizon
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  float fogAmt = haze(vFogDepth, fogNear, fogFar);
  vec3 fogC = fogColor;
  #if defined(LAMBERT) || defined(STANDARD)
    #if NUM_DIR_LIGHTS > 0
      float fogS = max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0);
      vec3 fogG = directionalLights[0].color;
      fogG = fogG / max(fogG.r, max(fogG.g, fogG.b)) * (fogColor.r + fogColor.g + fogColor.b) * 0.8;
      fogC = mix(fogColor, fogG, pow(fogS, 6.0));
    #endif
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogAmt);
#endif`;
}

const NOISE = /* glsl */`
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p,int oct){ float a=.5,s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<oct;i++){ s+=a*vn(p); p=m*p+3.1; a*=.5; } return s; }
`;

const BAKE_FRAG = /* glsl */`
varying vec2 vUv;
uniform vec3 uSun,uZenith,uHorizon,uGlow; uniform float uStars;
${NOISE}
void main(){
  float lon=(vUv.x-.5)*6.28318, lat=(vUv.y-.5)*3.14159;
  vec3 dir=vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon));
  float s=max(dot(dir,uSun),0.);
  float up=max(dir.y,0.);
  vec3 hz=mix(uHorizon,uGlow,pow(s,6.));
  vec3 c=mix(hz,uZenith,1.-exp(-up*4.2));
  c=mix(c,uHorizon*1.15,exp(-up*16.)*.5);
  c+=uGlow*pow(s,24.)*.5+uGlow*pow(s,5.)*.13*exp(-up*3.);
  if(uStars>0.){
    vec2 q=vec2(atan(dir.x,dir.z)*120.,asin(dir.y)*160.);
    float h=hash(floor(q));
    c+=vec3(.9,.95,1.)*step(.9965,h)*uStars*smoothstep(0.,.2,dir.y)*(.25+.8*hash(floor(q)+3.));
  }
  // far ridge lines sit in the bake so the horizon is never a bare edge
  float az=atan(dir.x,dir.z);
  float ridge=.018+.012*sin(az*3.+1.)+.016*fbm(vec2(az*2.4,1.),5)+.006*fbm(vec2(az*16.,3.),3);
  float ridge2=.009+.012*fbm(vec2(az*4.1+9.,7.),5);
  vec3 fogC=mix(uHorizon,uGlow,pow(s,6.));
  vec3 bluish=mix(fogC,uZenith*1.2+fogC*.25,.55);
  if(dir.y<ridge) c=mix(fogC,bluish,.55);
  if(dir.y<ridge2) c=mix(fogC,bluish,.8);
  if(dir.y<.0) c=fogC;
  gl_FragColor=vec4(c,1.);
}`;

export class Sky {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    const mk = () => new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
    // the keyframes either side of the hour (A, B), each baked clear and under rain, are blended by
    // the hour and by the rain into clear, which the dome shows. rt is clear with the coarse clouds on top.
    this.rt = mk(); this.clear = mk(); this.A = { clear: mk(), rain: mk() }; this.B = { clear: mk(), rain: mk() };
    this.cloudEnv = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.cloudEnv.needsUpdate = true;
    this.mixMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: `varying vec2 vUv; uniform sampler2D uSky, uCl;
        void main(){ vec4 c = texture2D(uCl, vUv); gl_FragColor = vec4(texture2D(uSky, vUv).rgb * c.a + c.rgb, 1.); }`,
      uniforms: { uSky: { value: this.clear.texture }, uCl: { value: null } }, depthTest: false, depthWrite: false,
    });
    this.blendMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: `varying vec2 vUv; uniform sampler2D uAc, uAr, uBc, uBr; uniform float uK, uR;
        void main(){ vec3 c = mix(texture2D(uAc, vUv).rgb, texture2D(uBc, vUv).rgb, uK), r = mix(texture2D(uAr, vUv).rgb, texture2D(uBr, vUv).rgb, uK);
          gl_FragColor = vec4(mix(c, r, uR), 1.); }`,
      uniforms: { uAc: { value: null }, uAr: { value: null }, uBc: { value: null }, uBr: { value: null }, uK: { value: 0 }, uR: { value: 0 } }, depthTest: false, depthWrite: false,
    });
    this.rain = 0; this.fog = 0; this.hour = 0; this.seg = -1; this.blendK = -1; this.blendR = -1; this.envHour = 0; this.envAt = 0;
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }', fragmentShader: BAKE_FRAG,
      uniforms: { uSun: { value: new THREE.Vector3() }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uStars: { value: 0 } },
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();

    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }',
      fragmentShader: /* glsl */`varying vec3 vDir; uniform sampler2D uTex; uniform vec3 uSun,uSunC; uniform float uDisc;
        void main(){ vec3 d=normalize(vDir); vec2 uv=vec2(atan(d.x,d.z)/6.28318+.5,asin(clamp(d.y,-1.,1.))/3.14159+.5);
          vec3 c=texture2D(uTex,uv).rgb; float s=max(dot(d,uSun),0.);
          c+=uSunC*smoothstep(uDisc,uDisc+.00035,s)*7.; c+=uSunC*pow(s,1400.)*.9;
          gl_FragColor=vec4(c,1.); }`,
      uniforms: { uTex: { value: this.clear.texture }, uSun: { value: new THREE.Vector3() }, uSunC: { value: new THREE.Color() }, uDisc: { value: 0.99985 } },
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 24), this.domeMat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -10; scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(this.hemi);
    scene.fog = new HazeFog(0xffffff, 0.0005, 800);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.dir = new THREE.Vector3();
    this.cloudMap = makeClouds();
    LIT.uCloudTex.value = this.cloudMap.tex;
    LIT.uShadowMat.value = this.sun.shadow.matrix;
    this.cloudHere = { value: 1 };
    this.lidHere = 1;
  }
  // The car, houses and trunks are lit by the one sun light, so that light dims with the cloud over
  // the car; the ground divides this back out (uCloudHere) and keeps its own clouds.
  clouds(x, z) {
    const { data, N } = this.cloudMap, P = LIT.uCloudP.value;
    const fx = ((x + P.x) / CLOUD_TILE % 1 + 1) % 1 * N, fy = ((z + P.y) / CLOUD_TILE % 1 + 1) % 1 * N, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    const at = (p, q) => data[(q % N) * N + (p % N)];
    const n = (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
    const k = Math.min(1, Math.max(0, (n - P.z) / (P.w - P.z))), c = (1 - LIT.uCloudAmt.value * k * k * (3 - 2 * k)) * this.lidHere;
    this.cloudHere.value = c;
    this.sun.intensity = this.baseI * c;
  }
  // where the drawn land ends, m: the haze fades everything into the sky before it gets there
  setEdge(m) { this.scene.fog.edge = m; LIT.uFogEdge.value = m; }
  setShadow(size, span) {
    const s = this.sun.shadow; s.mapSize.set(size, size); s.map?.dispose(); s.map = null;
    this.span = span;
    const c = s.camera; c.left = -span; c.right = span; c.top = span; c.bottom = -span; c.near = 10; c.far = 900; c.updateProjectionMatrix();
  }
  bake(rt, P, dir) {
    const u = this.bakeMat.uniforms, hz = vec(...P.horizon), sunC = vec(...P.sun), m = Math.max(sunC.r, sunC.g, sunC.b);
    u.uSun.value.copy(dir); u.uZenith.value.copy(vec(...P.zenith)); u.uHorizon.value.copy(hz);
    u.uGlow.value.setRGB(sunC.r / m, sunC.g / m, sunC.b / m).multiplyScalar((hz.r + hz.g + hz.b) * 0.8);
    u.uStars.value = P.stars;
    this.pass(this.bakeMat, rt);
  }
  // rt = the clear sky behind the coarse clouds
  mixClouds() { this.mixMat.uniforms.uCl.value = this.cloudEnv; this.pass(this.mixMat, this.rt); }
  pass(mat, rt) {
    const r = this.renderer, tone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping; this.quad.material = mat;
    r.setRenderTarget(rt); r.render(this.quadScene, this.quadCam); r.setRenderTarget(null);
    r.toneMapping = tone;
  }
  // the same time of day under a lid of cloud: grey, flat, and the sun's colour mostly gone
  overcastOf(p) {
    const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    const L = lum(p.horizon) * 0.62;
    const mix = (grey, c, k) => grey.map((g, i) => g + (c[i] * 0.55 - g) * k);
    const hz = mix([L * 0.92, L * 0.97, L * 1.04], p.horizon, 0.18);
    return { ...p, horizon: hz, zenith: hz.map(x => x * 0.6), litC: hz.map(x => x * 1.22), darkC: hz.map(x => x * 0.5), stars: 0 };
  }
  // which: 'clear', 'rain' or both
  bakeKey(slot, i, which) {
    const key = DAY[i], d = lightDir(key.h % 24, new THREE.Vector3()).dir;
    if (which !== 'rain') this.bake(slot.clear, key.p, d);
    if (which !== 'clear') this.bake(slot.rain, this.overcastOf(key.p), d);
  }
  // the reflections for cars: rebuilt when the sky has changed enough to show
  rebuildEnv() {
    this.rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.env?.dispose();
    this.env = this.pmrem.fromEquirectangular(this.rt.texture);
    this.envAt = this.rain; this.envHour = this.hour;
    return this.env.texture;
  }
  // how far the sky has moved on since the reflections were made: 1 is about time to rebuild
  envStale() {
    let dh = Math.abs(this.hour - this.envHour); dh = Math.min(dh, 24 - dh);
    return dh / 1.4 + Math.abs(this.rain - this.envAt) / 0.3;
  }
  // hour 0..24, rain and fog 0..1. Everything the time and the weather change about light and air.
  update(hour, r, fog, force) {
    this.hour = hour; this.rain = r; this.fog = fog;
    let seg = 0;
    while (DAY[seg + 1].h <= hour) seg++;
    const A = DAY[seg], B = DAY[seg + 1], k = (hour - A.h) / (B.h - A.h);
    if (force || seg !== this.seg) {
      // The next keyframe along only needs its own bakes, and those go in two frames (about 15 ms
      // each on the integrated GPU): the rainy one waits, it barely shows this early in the segment.
      if (!force && seg === this.seg + 1) { const t = this.A; this.A = this.B; this.B = t; this.bakeKey(this.B, seg + 1, 'clear'); this.pending = seg + 1; }
      else { this.bakeKey(this.A, seg); this.bakeKey(this.B, seg + 1); this.pending = -1; }
      this.seg = seg; this.blendK = -1;
      const u = this.blendMat.uniforms;
      u.uAc.value = this.A.clear.texture; u.uAr.value = this.A.rain.texture; u.uBc.value = this.B.clear.texture; u.uBr.value = this.B.rain.texture;
    }
    else if (this.pending >= 0) { this.bakeKey(this.B, this.pending, 'rain'); this.pending = -1; this.blendK = -1; }
    if (Math.abs(k - this.blendK) > 0.003 || Math.abs(r - this.blendR) > 0.012) {
      this.blendK = k; this.blendR = r;
      this.blendMat.uniforms.uK.value = k; this.blendMat.uniforms.uR.value = r;
      this.pass(this.blendMat, this.clear);
      this.mixClouds();
    }
    const p = this.preset = lerpPreset(A.p, B.p, k), o = this.over = this.overcastOf(p);
    const L = lightDir(hour, this.dir);
    this.elev = L.elev; this.moon = L.moon;
    const sunC = vec(...p.sun), m = Math.max(sunC.r, sunC.g, sunC.b);
    const hz = vec(...p.horizon), hzO = vec(...o.horizon);
    // fog hides the sun a little and greys the air a lot. Rain doesn't dim it here: the lid of the
    // cell that drops it does, per spot (lidShade in flora.js, lidHere for the car).
    const dim = 1 - 0.3 * fog;
    this.sun.color.setRGB(sunC.r / m, sunC.g / m, sunC.b / m, THREE.LinearSRGBColorSpace);
    this.baseI = p.sunI * m / 3 * dim;
    this.sun.intensity = this.baseI;
    const hemiK = 1 - 0.22 * r, grey = hzO.clone().multiplyScalar(1.1);
    this.hemi.color.copy(vec(...p.hemiSky)).lerp(grey, r * 0.7);
    this.hemi.groundColor.copy(vec(...p.hemiGnd)).lerp(grey.clone().multiplyScalar(0.3), r * 0.5);
    this.hemi.intensity = p.hemiI * hemiK;
    this.scene.fog.color.copy(hz).lerp(hzO, Math.max(r, fog * 0.6)); this.scene.fog.density = p.density * (1 + 3.2 * r + 4.5 * fog);
    this.domeMat.uniforms.uSun.value.copy(this.dir);
    // the disc fades out just before the light swaps between sun and moon, so the swap never shows
    const disc = L.moon ? 0.14 * Math.min(1, Math.min(Math.abs(hour - NIGHT_FROM), Math.abs(hour + 24 - NIGHT_FROM), Math.abs(hour - NIGHT_TO)) / 0.4) : Math.min(1, Math.max(0, (L.elev + 1) / 3));
    this.domeMat.uniforms.uSunC.value.setRGB(sunC.r / m, sunC.g / m, sunC.b / m).multiplyScalar(disc * (1 - r) * (1 - 0.7 * fog));
    LIT.uCloudAmt.value = p.cloud * (1 - 0.8 * r) * (1 - 0.6 * fog);
    LIT.uSunDir.value.copy(this.dir); LIT.uSunCol.value.copy(this.sun.color).multiplyScalar(this.baseI);
    LIT.uSkyC.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity); LIT.uGndC.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity);
    LIT.uFogCol.value.copy(this.scene.fog.color); LIT.uFogD.value = this.scene.fog.density;
    const glow = vec(sunC.r / m, sunC.g / m, sunC.b / m).multiplyScalar((hz.r + hz.g + hz.b) * 0.8);
    LIT.uGlowCol.value.copy(glow).multiplyScalar((1 - 0.85 * r) * (1 - 0.5 * fog));
  }
  follow(cam, focus) {
    this.dome.position.copy(cam.position ?? cam);
    const span = this.span, d = this.dir;
    // Move the shadow camera in whole texels of its own grid, or shadow edges shimmer and jump as
    // the car creeps along. The axes have to be the camera's: the world's aren't aligned with it.
    const t = span * 2 / this.sun.shadow.mapSize.x;
    right.crossVectors(WORLD_UP, d).normalize(); upward.crossVectors(d, right);
    const u = Math.round(focus.dot(right) / t) * t, v = Math.round(focus.dot(upward) / t) * t, w = focus.dot(d);
    snapped.set(0, 0, 0).addScaledVector(right, u).addScaledVector(upward, v).addScaledVector(d, w);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(d, 400);
  }
}
