import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Sky, patchFog } from './sky.js';
import { Clouds } from './clouds.js';
import { Weather } from './weather.js';
import { Tornadoes, TornadoView, Debris } from './tornado.js';
import { Flora, WIND, LIT } from './flora.js';
import { Terrain } from './terrain.js';
import { CARS, buildCar } from './cars.js';
import { Vehicle, stepBale, WEATHER } from './physics.js';
import { Damage } from './damage.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Traffic } from './traffic.js';
import { Race } from './race.js';
import { ScenePass } from './post.js';
import { Walker } from './walk.js';
import { Rain } from './rain.js';
import { Drone } from './drone.js';
import { Deck, DroneHud } from './deck.js';
import { height, ground, surface, isForest, waterAt, KIND, OBJ, CHUNK } from './world.js';

const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// budgets are in megapixels so a 1440p monitor doesn't quietly cost three times a laptop screen
const QUALITY = {
  // phones: a GPU that has to stay cool and a small screen — fewer pixels, short sight, cheap clouds, little traffic
  mobile: { lite: true, mp: 0.5, shadow: 1024, span: 44, far: 4, crops: 0.3, cropDist: 48, bloom: false, treeShadows: false, samples: 0, shadowEvery: 4, traffic: 3, tractors: 1, mirror: 0, mirrorPx: 0, ao: false, shafts: false, adapt: true, rain: 1000, cloud: [0.22, 9] },
  low: { mp: 0.62, shadow: 1280, span: 56, far: 5, crops: 0.5, cropDist: 70, bloom: false, treeShadows: false, samples: 0, shadowEvery: 3, traffic: 6, tractors: 1, mirror: 0, mirrorPx: 0, ao: false, shafts: false, adapt: true, rain: 2400, cloud: [0.34, 14] },
  mid: { mp: 1.05, shadow: 2048, span: 80, far: 6, crops: 0.75, cropDist: 95, bloom: false, treeShadows: true, samples: 0, shadowEvery: 2, traffic: 10, tractors: 2, mirror: 3, mirrorPx: 280, ao: true, shafts: true, adapt: true, rain: 6000, cloud: [0.5, 24] },
  high: { mp: 3.8, shadow: 4096, span: 120, far: 8, crops: 1, cropDist: 130, bloom: true, treeShadows: true, samples: 4, shadowEvery: 1, traffic: 18, tractors: 3, mirror: 1, mirrorPx: 512, ao: true, shafts: true, adapt: true, rain: 10000, cloud: [0.5, 32] },
  // for a real graphics card: full-size shadows, double the AO taps, a mirror every frame, twice the rain
  ultra: { mp: 6.5, shadow: 8192, span: 150, far: 10, crops: 1, cropDist: 170, bloom: true, treeShadows: true, samples: 4, shadowEvery: 1, traffic: 24, tractors: 4, mirror: 1, mirrorPx: 768, ao: true, aoN: 16, shafts: true, adapt: true, rain: 20000, cloud: [0.75, 48] },
};
const probe = document.createElement('canvas').getContext('webgl2'), dbg = probe?.getExtension('WEBGL_debug_renderer_info');
const gpuName = dbg ? probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
const integrated = /Radeon\(TM\) Graphics|Intel|UHD|Iris|Vega|SwiftShader/i.test(gpuName);
const touchDevice = /[?&]mobile=1/.test(location.search) || (!/[?&]pc=1/.test(location.search) && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0); // a phone or tablet (touch.js); ?mobile=1 / ?pc=1 force it
const fastLoad = touchDevice || /[?&]touch=1/.test(location.search); // a phone's processor builds the world slowly: open the menu sooner, the rest streams in
let qName = touchDevice ? 'mobile' : integrated ? 'mid' : 'high';
const QKEY = touchDevice ? 'polnacka-q-mobile' : 'polnacka-q'; // a phone remembers its own choice
try { qName = localStorage.getItem(QKEY) || qName; } catch {}
if (!QUALITY[qName]) qName = 'mid';
let Q = QUALITY[qName];
let drsScale = 1;     // live resolution scale, lowered when frames run long
const ratioFor = () => {
  const native = innerWidth * innerHeight * devicePixelRatio * devicePixelRatio;
  return devicePixelRatio * Math.min(1, Math.sqrt(Q.mp * 1e6 * drsScale / native));
};

patchFog();
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(ratioFor());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.06, 2600);
scene.add(camera);
camera.layers.enable(1);   // layer 1 holds what the mirror leaves out
camera.layers.enable(2);   // layer 2 is particles, drawn after the rest (post.js)

// rear-view mirror: a second, small render of the world behind the car
const mirrorCam = new THREE.PerspectiveCamera(13, 4.08, 0.1, 1100);
mirrorCam.layers.enable(2);
let mirrorRT = null, mirrorMat = null;
function setupMirror() {
  mirrorRT?.dispose(); mirrorRT = null;
  if (!Q.mirror) { mirrorMat = null; return; }
  mirrorRT = new THREE.WebGLRenderTarget(Q.mirrorPx, Math.round(Q.mirrorPx / 4.08), { type: THREE.HalfFloatType });
  mirrorRT.texture.repeat.set(-1, 1); mirrorRT.texture.offset.set(1, 0);   // a mirror swaps left and right
  mirrorMat ||= new THREE.MeshBasicMaterial({ fog: false, color: 0xe6e8ea });
  mirrorMat.map = mirrorRT.texture; mirrorMat.needsUpdate = true;
}

setupMirror();
const rain = new Rain(scene);
rain.setCount(Q.rain);
const hail = new Rain(scene, true);
hail.setCount(Q.rain >> 2);
const sky = new Sky(renderer, scene);
const clouds = new Clouds(renderer, sky);
clouds.setQuality(Q);
const weather = new Weather(sky, clouds.wind);
clouds.wx = weather;
const tornadoes = new Tornadoes(weather);
const shadowSize = () => Math.min(Q.shadow, renderer.capabilities.maxTextureSize);
sky.setShadow(shadowSize(), Q.span);
sky.setEdge(Q.far * CHUNK);
sky.sun.shadow.autoUpdate = false;
// the game starts late in the afternoon, the light the land was first tuned for
const START_HOUR = 17.4;
sky.update(START_HOUR, 0, 0, true);
let env = sky.rebuildEnv();
const flora = new Flora(renderer, scene);
const terrain = new Terrain(scene, flora, Q);
terrain.skyTex = sky.rt.texture;
terrain.cloudHere = sky.cloudHere;
const fx = new FX(scene);
rain.useDepth(fx.mat.uniforms); hail.useDepth(fx.mat.uniforms);
fx.field = (x, y, z, o) => tornadoes.windAt(x, y, z, o);
const debris = new Debris(scene);
const audio = new Audio();
const traffic = new Traffic(scene, fx, audio, terrain, env, Q);
traffic.onCrash = (m, speed) => {
  G.crashes++;
  toast(m.kind === 'tractor' ? 'Traktorista si tě zapamatoval' : ['Tohle pojišťovna nezaplatí', 'Přednost zprava to nebyla', 'Řidič vystoupil a kouká', 'Bonus za bezeškodní jízdu je pryč'][Math.random() * 4 | 0]);
};

// post: bloom for the sun, then a warm grade and a soft vignette
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
const scenePass = new ScenePass(renderer, scene, camera, fx, Q);
composer.addPass(scenePass);
scenePass.clouds = clouds;
const torView = new TornadoView(renderer, scenePass, clouds.U.uNoise.value);
torView.setQuality(Q);
scenePass.tornado = torView;
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.75, 1.0);
bloom.enabled = Q.bloom; composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFade: { value: 0 }, uUnder: { value: 0 }, uRain: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uFade, uUnder, uRain, uFlash;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec3 x=c.rgb;
      // AgX keeps the highlights but comes out flat: give the picture its contrast and colour here
      float l=dot(x,vec3(.3,.59,.11)); x=mix(vec3(l),x,mix(1.2,.92,uRain)); x+=vec3(.5,.58,.85)*uFlash*.6; x=clamp(x,0.,1.); x=mix(x,x*x*(3.-2.*x),.55);
      x=mix(x,vec3(.06,.13,.11)+x*vec3(.1,.18,.16),uUnder);
      vec2 q=vUv-.5; float v=1.-dot(q,q)*.62; x*=v;
      gl_FragColor=vec4(mix(x,vec3(0.),uFade),1.); }`,
});
composer.addPass(grade);
// foliage edges come from alpha cuts that multisampling can't touch, so this runs whenever samples are off
const fxaa = new ShaderPass(FXAAShader);
fxaa.enabled = Q.samples === 0; composer.addPass(fxaa);
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(ratioFor()); renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(ratioFor()); composer.setSize(innerWidth, innerHeight);
  fxaa.uniforms.resolution.value.set(1 / (innerWidth * ratioFor()), 1 / (innerHeight * ratioFor()));
  rain.setSize(innerWidth * ratioFor(), innerHeight * ratioFor()); hail.setSize(innerWidth * ratioFor(), innerHeight * ratioFor());
}
addEventListener('resize', resize);
resize();

// ---- state ----------------------------------------------------------------------------------
const G = { mode: 'load', adapt: 1, carIdx: 0, car: null, veh: null, dmg: null, cam: 0, crop: 0, felled: 0, airBest: 0, moon: false, lights: false, wipe: 0, ready: false, timeScale: 1, crashes: 0, onFoot: false, bino: 0, binoZoom: 8, hour: START_HOUR, fog: 0, fogGoal: 0, wxT: 2.5, dark: null, rain: 0, lid: 0, wet: 0, storm: false, wx: 0, flash: 0, glassT: 0, bolt: null, windT: 0, trees: 0, hail: 0 };
// The weather of the region: the sky between the cells, and which cells it keeps round you (weather.js).
// Rain itself is only where a cell drops it.
const WEATHERS = [{ name: 'Jasno', rain: 0 }, { name: 'Mlha', rain: 0, fog: 1 }, { name: 'Mrholení', rain: 0.3 }, { name: 'Déšť', rain: 0.68 }, { name: 'Bouřka', rain: 1, storm: true }];
// what the weather tends to do from each hour on, as odds for the WEATHERS above:
// mist in the morning, sun at midday, storms building in the afternoon and evening
const WX_ODDS = [[0, [50, 20, 10, 20, 0]], [4, [35, 55, 10, 0, 0]], [8, [70, 5, 15, 10, 0]], [13, [55, 0, 10, 20, 15]], [17, [45, 0, 10, 20, 25]], [21, [50, 20, 10, 20, 0]]];
const keys = new Set();
const SPAWN = (() => {
  // start at the first gravel road that crosses open farmland near the origin
  for (let r = 0; r < 900; r += 12) for (let a = 0; a < 6.28; a += 0.5) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = surface(x, z);
    if (s.kind === KIND.PATH) {
      const near = [20, -20].map(d => surface(x + d, z).kind).concat([20, -20].map(d => surface(x, z + d).kind));
      if (!near.includes(KIND.FOREST)) return { x, z };
    }
  }
  return { x: 0, z: 0 };
})();

function headingAlongRoad(x, z) {
  // try a ring of directions: the one that stays on the road longest
  let best = 0, bestN = -1;
  for (let a = 0; a < 6.28; a += 0.13) {
    let n = 0;
    for (let d = 3; d < 42; d += 3) if (surface(x + Math.sin(a) * d, z + Math.cos(a) * d).kind === KIND.PATH) n++;
    if (n > bestN) { bestN = n; best = a; }
  }
  return best;
}

function spawnCar(idx, x, z, heading) {
  const old = G.car;
  if (old) { scene.remove(old.root); old.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  if (G.onFoot) getIn(true);
  const spec = CARS[idx];
  const car = buildCar(spec, env);
  const veh = new Vehicle(spec);
  const y = height(x, z) + spec.phys.comY + 0.1;
  veh.place(x, y, z, heading);
  scene.add(car.root);
  if (Q.lite) car.root.traverse(o => { const m = o.material; if (m && m.clearcoat) { m.clearcoat = 0; m.needsUpdate = true; } }); // (a phone: no clearcoat layer)
  G.car = car; G.veh = veh; G.carIdx = idx;
  G.dmg = new Damage(car, veh, fx, audio);
  G.lightsOn = isDark() || G.rain > 0.6;
  veh.solids = []; veh.bales = bales;
  veh.g = G.moon ? 2.2 : 9.81;
  veh.onImpact = (p, dir, s, wp, kind, solid) => G.dmg.impact(p, dir, s, wp, kind);
  veh.onSolid = (s, v, n) => breakSolid(s, n);
  veh.movers = race.active ? race.attach(veh) : traffic.movers;
  veh.onMover = (m, sp, n, wp) => { if (m.kind !== 'bot') traffic.hit(m, sp, n, wp); };
  veh.onShift = () => audio.shift();
  veh.onDrown = () => { toast('Motor se napil vody'); G.dmg.smoke = 1; };
  veh.onBale = (b, closing) => { audio.thud(Math.min(0.5, closing * 0.03)); fx.leaves(b.pos, 18, [0.7, 0.58, 0.3]); G.dmg.dirtyHit = 1; };
  veh.onBottom = rate => audio.thud(Math.min(0.4, rate * 0.04));
  veh.onScrape = (x, y, z, sp) => { if (Math.random() < 0.3) fx.sparks({ x, y, z }, 1.5); };
  updateCabinView();
  if (mirrorMat) car.cab.mirrorPlane.material = mirrorMat;
  audio.setCar(spec.id); audio.setOpen(0);
  syncRoot();
  return car;
}

// ---- the drone (drone.js) and its station (deck.js) -------------------------------------------
const drone = new Drone(scene, { weather, tornadoes, terrain, audio, toast: t => toast(t), air: () => ({ fog: G.fog, rain: G.rain }) });
const droneHud = new DroneHud(drone);
const deckWind = { x: 0, z: 0, speed: 0, gust: 1, turb: 0, out: 0 };
const deck = new Deck(drone, {
  canLaunch() {
    if (race.active) return 'Během závodu dron nevzlétne.';
    if (drone.battery < 0.05) return 'Baterie je skoro prázdná, nech ji chvíli nabít.';
    if (!G.onFoot && G.veh.v.length() > 3) return 'Nejdřív zastav auto.';
    if (G.onFoot && G.knock > 0) return 'Nejdřív se probuď.';
    return null;
  },
  launch() {
    const v = G.veh;
    camera.getWorldDirection(tmpV);
    const yaw = Math.atan2(-tmpV.x, -tmpV.z);
    // off the car's roof, or out of your hands a step ahead of you
    if (G.onFoot) tmpV2.set(walker.pos.x - Math.sin(walker.yaw) * 0.8, walker.pos.y + 1.3, walker.pos.z - Math.cos(walker.yaw) * 0.8);
    else tmpV2.set(0, v.half.yTop + 0.35, 0).applyQuaternion(v.q).add(v.pos);
    drone.launch(tmpV2, yaw);
    head.lookX = 0; head.lookY = 0;
    updateCabinView();
    audio.tone(990, 0.12);
  },
  wind() {
    const f = pilotPos();
    weather.windAt(f.x, f.z, deckWind);
    return { speed: Math.hypot(deckWind.x + torAir.x, deckWind.z + torAir.z), tornado: tornadoes.near(f.x, f.z).d < 3000 };
  },
  close: () => setDeck(false),
  bought: n => { toast(`${n} vylepšena`); audio.tone(1320, 0.2); },
});
function setDeck(on) {
  deck.setOpen(on);
  if (on) { document.exitPointerLock?.(); keys.clear(); } else { lockPointer(); updateCabinView(); }
}
// where the pilot stands: the car, or you on foot
function pilotPos() { return G.onFoot ? walker.pos : G.veh.pos; }
function droneInput() {
  const i = drone.input;
  i.x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  i.z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  i.y = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC') ? 1 : 0);
  // the phone tilted (js/touch.js): sideways slides, leaning flies forward / back; the stick still wins
  const t = window.tilt;
  if (t?.on) { if (!i.x) i.x = -t.steer; if (t.pedals && !i.z) i.z = t.lean; }
  // turbo: W tapped twice, held for as long as W stays down
  if (!keys.has('KeyW')) droneTurbo = false;
  i.turbo = droneTurbo;
}
let droneTurbo = false, lastW = 0;

// rival: a race bot did it, so the tree falls but the bill isn't the player's
function breakSolid(s, n, rival) {
  const o = s.o;
  terrain.fell(s);
  if (o.type === OBJ.POST) { audio.thud(0.25); fx.debris({ x: o.x, y: o.y, z: o.z }, 6); return; }
  if (o.type === OBJ.LOG) { audio.wood(); fx.debris({ x: o.x, y: o.y + 0.3, z: o.z }, 14); if (!rival) toast('Kmen šel stranou'); return; }
  audio.wood();
  fx.leaves({ x: o.x, y: o.y + 1, z: o.z }, 60, o.type === OBJ.SPRUCE ? [0.1, 0.22, 0.12] : [0.28, 0.42, 0.14]);
  const def = flora.types[o.type];
  if (def && !rival) G.felled++;
  if (def) {
    // a real tree topples in the direction it was pushed
    const g = new THREE.Group();
    g.position.set(o.x, o.y, o.z);
    const inner = new THREE.Group(); inner.rotation.y = o.rot; inner.scale.setScalar(o.s); g.add(inner);
    const leaves = new THREE.Mesh(def.leaves, flora.leafMat); leaves.castShadow = true; inner.add(leaves);
    if (def.trunk) { const t = new THREE.Mesh(def.trunk, flora.barkMats[def.bark]); t.castShadow = true; inner.add(t); }
    scene.add(g);
    fx.fallTree(g, n.z * -1 * -1, -n.x * -1 * -1);
    if (!rival) toast(['Dřevorubec roku', 'Lesní správa ti napíše', 'Tenhle tu stál 80 let', 'Padá strom!'][Math.random() * 4 | 0]);
  } else if (!rival) toast('Tohle tu bývalo');
}

// loose bales live here so they can roll around the map
const bales = [];
let baleCull = 0;
const race = new Race(scene, terrain, traffic, fx, audio, bales);
race.onBreak = (s, n) => breakSolid(s, n, true);
race.onResults = () => document.exitPointerLock?.();
const baleGeo = flora.props[OBJ.BALE].parts[0];
terrain.onSpawnBale = (o, c) => {
  const m = new THREE.Mesh(baleGeo[0], baleGeo[1]); m.castShadow = !Q.lite; m.receiveShadow = true;
  const y = o.y + 0.7; m.position.set(o.x, y, o.z); m.rotation.y = o.rot;
  scene.add(m);
  bales.push({ mesh: m, pos: m.position, v: new THREE.Vector3(), w: 0, awake: false, chunk: c, spinAxis: null });
};
terrain.onRemoveChunk = c => {
  for (let i = bales.length - 1; i >= 0; i--) if (bales[i].chunk === c) { scene.remove(bales[i].mesh); bales.splice(i, 1); }
};

// ---- camera ---------------------------------------------------------------------------------
const head = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, lookX: 0, lookY: 0, vLast: new THREE.Vector3() };
const chase = new THREE.Vector3(); let chaseInit = false;
const CAMS = ['Kokpit', 'Kapota', 'Za autem', 'Daleko'];

function updateCabinView() {
  if (!G.car) return;
  const inCab = G.cam === 0 && !G.onFoot && !drone.view;
  for (const m of G.car.cab.driver) m.visible = !G.onFoot;
  G.car.glass.opacity = inCab ? 0.05 : 0.56;
  G.car.glass.envMapIntensity = inCab ? 0.5 : 1.5;
  if (!drone.view) { camera.fov = inCab ? 74 : 66; camera.near = inCab ? 0.06 : 0.2; camera.updateProjectionMatrix(); }
  $('speed').style.display = inCab || G.onFoot ? 'none' : '';
  audio.setView(inCab);
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpQ2 = new THREE.Quaternion();
function updateCamera(dt) {
  const v = G.veh, car = G.car;
  if (G.mode === 'freeze') return;
  if (G.mode === 'menu') {
    // slow orbit round the parked car
    G.orbit = (G.orbit || 0) + dt * 0.14;
    const c = tmpV.copy(v.pos).add(tmpV2.set(0, 0.25, 0));
    const r = 6.2 + (CARS[G.carIdx].id === 'monster' ? 3 : 0), a = G.orbit + 2.5;
    camera.position.set(c.x + Math.sin(a) * r, c.y + 1.6, c.z + Math.cos(a) * r);
    const ground = height(camera.position.x, camera.position.z) + 1.75;
    if (camera.position.y < ground) camera.position.y = ground;
    camera.lookAt(c.x, c.y + 0.1, c.z);
    sky.dome.position.copy(camera.position);
    return;
  }
  if (drone.view) {
    drone.camera(camera, dt);
    const w = waterAt(camera.position.x, camera.position.z);
    grade.uniforms.uUnder.value = w.on && w.edge < 0 && camera.position.y < w.lvl ? 1 : 0;
    return;
  }
  if (G.onFoot) { footCamera(dt); return; }
  // accelerations push the head around inside the cabin
  const acc = tmpV.copy(v.v).sub(head.vLast).divideScalar(Math.max(dt, 1e-3)); head.vLast.copy(v.v);
  tmpQ.copy(v.q).conjugate(); acc.applyQuaternion(tmpQ);
  v.accelZ = acc.z;
  const k = 1 - Math.exp(-dt * 6.5);
  head.x += (clamp(-acc.x * 0.0048, -0.12, 0.12) - head.x) * k;
  head.y += (clamp(-(acc.y) * 0.0034, -0.09, 0.09) - head.y) * k;
  head.z += (clamp(-acc.z * 0.0052, -0.14, 0.14) - head.z) * k;
  const shake = G.dmg.shake, sv = v.v.length();
  const rs = 0.002 * Math.min(1, sv / 20);
  const sx = (Math.random() - 0.5) * (shake * 0.06 + rs), sy = (Math.random() - 0.5) * (shake * 0.06 + rs);
  head.lookX *= 1 - Math.min(1, dt * (G.pointer ? 0.8 : 3)); head.lookY *= 1 - Math.min(1, dt * (G.pointer ? 0.8 : 3));
  if (G.cam === 0 || G.cam === 1) {
    if (G.cam === 0) {
      const eye = car.cab.eye;
      tmpV2.set(eye.x - head.x, eye.y + (car.spec.lift || 0) + head.y + sy, eye.z + head.z + sx);
    } else tmpV2.set(0, car.spec.stations[6].top + 0.12 + (car.spec.lift || 0), car.spec.stations[6].z + 0.5);
    tmpV2.applyQuaternion(tmpQ2.copy(car.root.quaternion).multiply(car.body.quaternion));
    const bodyPos = tmpV.copy(car.root.position).add(tmpV2);
    camera.position.copy(bodyPos);
    const roll = clamp(acc.x * 0.0009, -0.03, 0.03), pitch = clamp(acc.z * 0.0009, -0.03, 0.03);
    tmpE.set(pitch - 0.05 + head.lookY, Math.PI + head.lookX + clamp(v.w.y * 0.03, -0.1, 0.1) * 1, roll + (Math.random() - 0.5) * shake * 0.02);
    camera.quaternion.copy(car.root.quaternion).multiply(car.body.quaternion).multiply(tmpQ.setFromEuler(tmpE));
  } else {
    const dist = G.cam === 2 ? 6.6 : 12, hgt = G.cam === 2 ? 2.4 : 4.6;
    const scale = car.spec.id === 'monster' ? 1.5 : 1;
    const fw = tmpV.set(0, 0, 1).applyQuaternion(v.q); fw.y = 0; fw.normalize();
    const vel = tmpV2.copy(v.v); vel.y = 0;
    if (vel.length() > 2) { const vd = vel.normalize(); fw.lerp(vd, 0.5).normalize(); }
    const a = Math.atan2(fw.x, fw.z) + head.lookX * 1.6;
    const want = new THREE.Vector3(v.pos.x - Math.sin(a) * dist * scale, v.pos.y + hgt * scale, v.pos.z - Math.cos(a) * dist * scale);
    if (!chaseInit) { chase.copy(want); chaseInit = true; }
    chase.lerp(want, 1 - Math.exp(-dt * 7));
    let gh = height(chase.x, chase.z) + 0.9;
    const cw = waterAt(chase.x, chase.z);
    if (cw.on && cw.edge < 0) gh = Math.max(gh, cw.lvl + 0.6);
    if (chase.y < gh) chase.y = gh;
    camera.position.copy(chase);
    camera.position.x += sx; camera.position.y += sy;
    camera.lookAt(v.pos.x, v.pos.y + 0.7 * scale, v.pos.z);
  }
  camera.fov += ((G.cam === 0 ? 74 : 66) + Math.min(12, sv * 0.13) + (v.input.nitro ? 5 : 0) - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
  // a sinking car takes the driver's eyes under with it
  const eyeW = waterAt(camera.position.x, camera.position.z);
  grade.uniforms.uUnder.value = eyeW.on && eyeW.edge < 0 && camera.position.y < eyeW.lvl ? 1 : 0;
}

// on foot: the head on the walker, and the binoculars narrow the view
function footCamera(dt) {
  walker.eye(camera.position);
  tmpE.set(walker.pitch, walker.yaw, 0);
  // a tornado throwing you about turns the whole view with you
  camera.quaternion.setFromEuler(tmpE).premultiply(walker.tumble);
  G.bino += ((G.binoHeld || G.binoOn ? 1 : 0) - G.bino) * Math.min(1, dt * 9);
  const fov = 74 + (74 / G.binoZoom - 74) * G.bino;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  $('bino').style.opacity = clamp((G.bino - 0.15) * 1.6, 0, 1);
  const w = waterAt(camera.position.x, camera.position.z);
  grade.uniforms.uUnder.value = w.on && w.edge < 0 && camera.position.y < w.lvl ? 1 : 0;
}

// ---- syncing the model with the physics ---------------------------------------------------------
function syncRoot() {
  const v = G.veh, c = G.car, s = c.spec;
  c.root.quaternion.copy(v.q);
  tmpV.set(0, -s.phys.comY, 0).applyQuaternion(v.q);
  c.root.position.copy(v.pos).add(tmpV);
  const lift = s.lift || 0;
  v.wheels.forEach((w, i) => {
    const vis = c.wheels[i];
    if (vis.off) return;
    const y = w.m.y + s.phys.comY - w.vis;
    vis.steer.position.y = y;
    vis.steer.rotation.y = w.front ? v.steer + w.bent : w.bent;
    vis.spinner.rotation.x = w.spin;
  });
  const ax = c.root.userData.axles;
  if (ax) {
    ax.f.position.y = (v.wheels[0].m.y + s.phys.comY - (v.wheels[0].vis + v.wheels[1].vis) / 2);
    ax.r.position.y = (v.wheels[2].m.y + s.phys.comY - (v.wheels[2].vis + v.wheels[3].vis) / 2);
    ax.f.rotation.z = Math.atan2(v.wheels[0].vis - v.wheels[1].vis, s.track * 2) * -1;
    ax.r.rotation.z = Math.atan2(v.wheels[2].vis - v.wheels[3].vis, s.track * 2) * -1;
  }
  // the cabin shader traces the sun in hull space
  c.hull.updateWorldMatrix(true, false);
  c.cabU.uCabInv.value.copy(c.hull.matrixWorld).invert();
  LIT.uCarInv.value.copy(c.cabU.uCabInv.value); LIT.uCarBox.value.set(v.half.x + 0.06, v.half.z + 0.06);
  c.cabU.uSunLocal.value.copy(sky.dir).applyQuaternion(tmpQ.copy(v.q).conjugate());
  // cockpit
  const cab = c.cab;
  cab.wheel.rotation.z = -v.steer * 7.5 + (cab.wobble || 0);
  const kmh = Math.abs(v.forwardSpeed) * 3.6;
  const ang = t => THREE.MathUtils.degToRad(135 - clamp(t, 0, 1.03) * 270);
  cab.speedN.rotation.z = ang(kmh / cab.maxKmh);
  cab.rpmN.rotation.z = ang(v.rpm / (cab.rpmMax * 1000));
  const arms = cab.wheelHolder.userData.arms;
  if (arms) for (const a of arms) {
    const h = a.userData.hand; h.getWorldPosition(tmpV);
    c.cab.group.worldToLocal(tmpV);
    const elbow = tmpV2.set(cab.eye.x + a.userData.side * 0.33, cab.eye.y - 0.6, cab.eye.z + 0.06);
    a.position.copy(tmpV).lerp(elbow, 0.5);
    a.quaternion.setFromUnitVectors(tmpQuatUp, tmpV3.copy(elbow).sub(tmpV).normalize());
    a.scale.y = tmpV.distanceTo(elbow);
  }
}
const tmpQuatUp = new THREE.Vector3(0, 1, 0), tmpV3 = new THREE.Vector3();

// ---- per-frame feel: crops, dust, sound ---------------------------------------------------------
let ttl = 0, statT = 0, sunT = 0, sunGoal = 1;
const DUST = { [KIND.PATH]: [0.62, 0.56, 0.45], [KIND.PLOUGH]: [0.32, 0.24, 0.17], [KIND.WHEAT]: [0.7, 0.58, 0.32], [KIND.STUBBLE]: [0.72, 0.62, 0.42], [KIND.RAPE]: [0.5, 0.5, 0.2], [KIND.GREEN]: [0.38, 0.42, 0.22], [KIND.MEADOW]: [0.34, 0.38, 0.2], [KIND.VERGE]: [0.34, 0.38, 0.2], [KIND.FOREST]: [0.26, 0.2, 0.13] };
const CHAFF = { [KIND.WHEAT]: [0.85, 0.68, 0.3], [KIND.RAPE]: [0.9, 0.82, 0.15], [KIND.GREEN]: [0.24, 0.44, 0.12], [KIND.MEADOW]: [0.3, 0.44, 0.16], [KIND.VERGE]: [0.3, 0.44, 0.16], [KIND.STUBBLE]: [0.74, 0.62, 0.36], [KIND.FOREST]: [0.2, 0.3, 0.12] };
const stampAcc = { t: 0 };
function feelFrame(dt) {
  const v = G.veh, c = G.car, speed = v.v.length();
  let gravelAmt = 0, skid = 0, cropAmt = 0, onAsphalt = false, wading = 0;
  stampAcc.t += dt;
  const doStamp = stampAcc.t > 0.033;
  if (doStamp) stampAcc.t = 0;
  v.wheels.forEach(w => {
    if (w.off || !w.contact) return;
    const k = w.surf.kind, slip = Math.hypot(w.slipL, w.slipS), sp = v.v;
    if (w.wd > 0.02) {
      // a tyre in the water throws spray instead of dust, and the car comes out cleaner
      wading = Math.max(wading, w.wd);
      const force = Math.min(1.4, (speed + slip * 0.4) / 12);
      if (force > 0.06) { const n = dt * 150 * force; for (let i = n | 0; i >= 0; i--) if (i || Math.random() < n % 1) fx.splash(w.gx, w.wl + 0.02, w.gz, sp.x, sp.z, force); }
      c.dirt.value = Math.max(0, c.dirt.value - dt * 0.05);
      return;
    }
    skid = Math.max(skid, slip - 1.5);
    gravelAmt += w.surf.rough * 3 + (k === KIND.ROAD ? 0 : k === KIND.PATH ? 0.05 : 0.02);
    if (w.surf.crop > 0.5) cropAmt += 0.25;
    const col = DUST[k] || DUST[KIND.PATH];
    const moving = speed > 2 ? Math.min(1, speed / 16) : 0;
    const asphalt = k === KIND.ROAD || w.surf.panel;
    // a wet surface throws spray off the tyres
    if (G.wet > 0.25 && speed > 5 && Math.random() < dt * 26 * G.wet * Math.min(1, speed / 18)) fx.splash(w.gx, w.gy + 0.04, w.gz, sp.x, sp.z, 0.4 + Math.min(0.8, speed / 30));
    if (asphalt) onAsphalt = true;
    if (asphalt) {
      // weathered concrete keeps a faint print of dust and rubber, asphalt doesn't
      if (w.surf.panel) fx.track(w, w.gx, w.gy, w.gz, v.spec.wheel.w / 2, 0.26); else w.print = null;
      // no dust here: burning rubber when the tyre lets go, and a black mark left behind
      if (slip > 2.6) {
        if (Math.random() < dt * 34) fx.dust(w.gx, w.gy + 0.1, w.gz, sp.x, 0, sp.z, [0.72, 0.72, 0.74], 1.1);
        if (doStamp) terrain.stamp(w.gx, w.gz, 0.3, 210, true);
      }
    } else {
      if (Math.random() < (dt * 40 * moving + slip * dt * 8) * (1 - 0.88 * G.wet)) fx.dust(w.gx, w.gy + 0.08, w.gz, sp.x, 0, sp.z, col, 1 + Math.min(1.2, slip * 0.1));
      // gravel doesn't tear up, it just takes the print of the tyre, deeper when it's spinning
      if (k === KIND.PATH) fx.track(w, w.gx, w.gy, w.gz, v.spec.wheel.w / 2, Math.min(0.6, 0.36 + slip * 0.045)); else w.print = null;
      if (doStamp && speed > 0.8) addCrop(terrain.stamp(w.gx, w.gz, 0.5 + Math.min(0.3, slip * 0.04), 255));
    }
    const ch = CHAFF[k];
    if (ch && speed > 3 && Math.random() < dt * 80 * (k === KIND.WHEAT || k === KIND.RAPE ? 1 : 0.3)) fx.chaff(w.gx, w.gy, w.gz, sp.x, sp.z, ch);
    if ((k === KIND.PLOUGH || k === KIND.FOREST) && slip > 1.5 && Math.random() < dt * 30) fx.clod(w.gx, w.gy + 0.1, w.gz, sp.x, 0, sp.z, [0.1, 0.07, 0.04]);
    // mud reaches the windscreen when you tear through the soft stuff
    if (slip > 3 && (k === KIND.PLOUGH || k === KIND.FOREST) && w.front && Math.random() < dt * 2) G.dmg.mudOnGlass(3);
    c.dirt.value = Math.min(1, c.dirt.value + dt * (k === KIND.PATH ? 0.0035 : 0.012) * Math.min(1.5, speed / 12));
  });
  waterFrame(dt, wading, speed);
  // the bumper flattens whatever stands taller than it
  if (doStamp && speed > 1 && v.pos.y - height(v.pos.x, v.pos.z) < 2.2) {
    const hw = v.half.x * 0.86, fw = tmpV.set(0, 0, v.half.zF * 0.8).applyQuaternion(v.q), rt = tmpV2.set(1, 0, 0).applyQuaternion(v.q);
    for (let i = -2; i <= 2; i++) addCrop(terrain.stamp(v.pos.x + fw.x + rt.x * hw * i / 2, v.pos.z + fw.z + rt.z * hw * i / 2, 0.75, 190));
  }
  // bushes shred
  if (speed > 3) for (const b of terrain.bushesNear(v.pos.x, v.pos.z, 3.2)) {
    if (b.hit && performance.now() - b.hit < 700) continue;
    b.hit = performance.now();
    fx.leaves({ x: b.x, y: b.y, z: b.z }, 42);
    v.v.multiplyScalar(0.93);
    audio.burst?.(0.3, 2600, 'highpass', 0.16);
  }
  // exhausts and engine smoke
  const dmg = G.dmg;
  const engineP = tmpV.set(0, c.spec.stations[6].top - 0.1 + (c.spec.lift || 0) - c.spec.phys.comY, c.spec.axle.f + 0.2).applyQuaternion(v.q).add(v.pos);
  if (dmg.smoke >= 1 && Math.random() < dt * (dmg.smoke * 30)) fx.smoke(engineP.x, engineP.y, engineP.z, v.v.x, v.v.z, dmg.smoke >= 2, dmg.smoke >= 3);
  if (v.input.nitro && v.nitroFuel > 0) {
    const ex = tmpV2.set(0.42, c.spec.stations[0].low + 0.03 + (c.spec.lift || 0) - c.spec.phys.comY, c.spec.stations[0].z - 0.1).applyQuaternion(v.q).add(v.pos);
    fx.flame(ex.x, ex.y, ex.z, -v.v.x * -0.7, -v.v.z * -0.7);
  }
  if (!G.onFoot && Math.random() < dt * 8) { const ex = tmpV2.set(0.42, c.spec.stations[0].low + (c.spec.lift || 0) - c.spec.phys.comY, c.spec.stations[0].z).applyQuaternion(v.q).add(v.pos); fx.exhaust(ex.x, ex.y, ex.z, v.v.x, v.v.z); }

  audio.engine(v.dead || G.onFoot || drone.view ? 0.1 : v.rpm, v.p.redline, v.dead ? 0 : v.input.throttle, v.gear);
  audio.ride(speed, gravelAmt / 2, Math.max(0, skid), Math.min(1, cropAmt), v.air > 0.1, onAsphalt);
  audio.ambient(dt, sky.preset.stars > 0.5);

  // air time counter
  if (v.air > 0.5) G.airNow = v.air;
  if (G.airNow && !v.air) { if (G.airNow > 1) toast(`Letěl jsi ${G.airNow.toFixed(1)} s`); G.airNow = 0; }

  // lights
  const on = G.lightsOn && !G.dmg.beamOut;
  c.beam.intensity = on ? 1500 : 0;
  LIT.uBeamI.value = on ? 1.5 : 0;
  c.beam.getWorldPosition(LIT.uBeamPos.value);
  LIT.uBeamDir.value.set(0, -0.05, 1).applyQuaternion(v.q).normalize();
  for (const l of c.headL) l.material.emissiveIntensity = on ? 3 : 0;
  const brake = v.input.brake > 0.1;
  for (const l of c.tails) l.material.emissiveIntensity = brake ? 3.2 : (G.lightsOn ? 1 : 0);
  // the trees stand between the sun and the cabin when you're in or behind a forest
  sunT -= dt;
  if (sunT <= 0) {
    sunT = 0.2; sunGoal = 1;
    const d = sky.dir, h = Math.hypot(d.x, d.z) || 1, reach = Math.min(44, 24 * h / Math.max(0.05, d.y));
    for (let r = 2; r < reach; r += 6) if (isForest(v.pos.x + d.x / h * r, v.pos.z + d.z / h * r)) { sunGoal = 0; break; }
  }
  c.cabU.uSunVis.value += (sunGoal - c.cabU.uSunVis.value) * Math.min(1, dt * 3);
  // windscreen wipers
  if (G.wipe > 0) { G.wipe -= dt; G.dmg.wipe(Math.min(1, dt * 2)); }
  // wheel feel: bad surface jitters the rim
  c.cab.wobble = (Math.random() - 0.5) * 0.04 * Math.min(1, speed / 12) * (gravelAmt * 2);

  statT += dt;
  if (statT > 0.12) {
    statT = 0;
    $('crop').textContent = Math.round(G.crop * 14).toLocaleString('cs-CZ') + ' Kč';
    $('cash').textContent = Math.round(drone.cash).toLocaleString('cs-CZ') + ' Kč';
    saveStats();
    $('clock').textContent = `${clock()} · ${wxName()}`;
    $('stats').textContent = `${(G.crop / 10000).toFixed(2)} ha${G.felled ? ` · ${G.felled} stromů` : ''}${G.crashes ? ` · ${G.crashes} havárií` : ''}`;
    const kmh = Math.round(Math.abs(v.forwardSpeed) * 3.6);
    $('kmh').textContent = kmh;
    const hp = Math.max(0, Math.round(100 - G.dmg.total * 0.55));
    $('hpn').textContent = hp + ' %';
    $('hp').firstElementChild.style.width = hp + '%';
    $('nos').firstElementChild.style.width = v.nitroFuel * 100 + '%';
    $('dead').classList.toggle('on', !!v.dead);
  }
  ttl -= dt; if (ttl < 0) $('toast').classList.remove('on');
}
let brookT = 0, brook = 0, wasWet = false, dropT = 0;
function waterFrame(dt, wading, speed) {
  const v = G.veh, wet = Math.max(wading, v.wet);
  if (wet > 0.03 && !wasWet) {
    const a = clamp(speed / 22, 0.1, 1);
    audio.splash(a);
    for (let i = 0; i < 90 * a; i++) fx.splash(v.pos.x + (Math.random() - 0.5) * 3, v.pos.y - 0.2, v.pos.z + (Math.random() - 0.5) * 3, v.v.x, v.v.z, 1 + a);
    if (speed > 8) G.dmg.dropsOnGlass(40 * a | 0);
  }
  wasWet = wet > 0.03;
  // the hull pushes a wave ahead of it
  if (v.wet > 0.05 && speed > 1.5) {
    const hw = v.half.x, nose = tmpV.set(0, 0, v.half.zF).applyQuaternion(v.q), rt = tmpV2.set(1, 0, 0).applyQuaternion(v.q), lvl = v.wheels[0].wl;
    for (let i = dt * 70 * Math.min(1, speed / 8); i > Math.random(); i--) { const t = (Math.random() - 0.5) * 2.2 * hw; fx.splash(v.pos.x + nose.x + rt.x * t, lvl, v.pos.z + nose.z + rt.z * t, v.v.x, v.v.z, Math.min(1.4, speed / 10)); }
  }
  G.afloat = v.wet > 0.2 && !v.onGround ? (G.afloat || 0) + dt : 0;
  if (G.afloat > 3) { G.afloat = -6; toast('Plaveš. R tě vytáhne na břeh'); }
  dropT -= dt;
  if (wading > 0.03 && speed > 7 && dropT <= 0) { dropT = 0.14; G.dmg.dropsOnGlass(5); }
  terrain.wake.value.set(v.pos.x, v.pos.z, v.half.z, wet > 0.03 ? Math.min(0.9, 0.2 + speed * 0.05) : 0);
  brookT -= dt;
  if (brookT <= 0) { brookT = 0.25; const f = focus(), w = waterAt(f.x, f.z); brook = w.on ? clamp(1 - w.edge / 10, 0, 1) * (w.kind === 1 ? 0.6 : 1) * (0.5 + w.foam) : 0; }
  audio.water(brook, wet > 0.03 ? Math.min(1, speed / 16 + wet * 0.4) : 0);
}
// ---- out of the car --------------------------------------------------------------------------
const walker = new Walker(), footSolids = [], footIn = { fwd: 0, side: 0, run: false, jump: false };
let footStampT = 0;
function getOut() {
  const v = G.veh;
  if (v.v.length() > 4) { toast('Nejdřív zastav'); return; }
  camera.getWorldDirection(tmpV);
  walker.yaw = Math.atan2(-tmpV.x, -tmpV.z); walker.pitch = 0;
  walker.place(v, G.car.cab.eye.x, terrain.nearby(v.pos.x, v.pos.z, 6, footSolids));
  G.onFoot = true; G.binoOn = false; G.binoHeld = false; G.bino = 0;
  camera.near = 0.1; camera.fov = 74; camera.updateProjectionMatrix();
  updateCabinView(); audio.setView(false);
  audio.thud(0.2);
}
// quiet: the car was replaced under you (repair, a new race), so you're simply back in the seat
function getIn(quiet) {
  if (!quiet && G.knock > 0) return;
  if (quiet) { G.knock = 0; grade.uniforms.uFade.value = 0; }
  if (!quiet && walker.doorDist(G.veh) > 2.2) { toast('Auto je moc daleko'); return; }
  G.onFoot = false; G.bino = 0; G.binoOn = false; G.binoHeld = false;
  $('bino').style.opacity = 0; $('hint').classList.remove('on');
  head.vLast.copy(G.veh.v); head.lookX = 0; head.lookY = 0;
  updateCabinView();
  if (!quiet) audio.thud(0.25);
}
function footFrame(dt) {
  footIn.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  footIn.side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  footIn.run = keys.has('ShiftLeft') || keys.has('ShiftRight'); footIn.jump = keys.has('Space');
  // knocked out: the screen goes dark, and you come round where you landed
  if (G.knock > 0) {
    G.knock -= dt; footIn.fwd = footIn.side = 0; footIn.jump = false;
    grade.uniforms.uFade.value = Math.min(1, G.knock * 1.2);
    if (G.knock <= 0) { grade.uniforms.uFade.value = 0; toast('Probral ses'); }
  }
  const p = walker.pos;
  terrain.nearby(p.x, p.z, 6, footSolids);
  walker.step(dt, footIn, footSolids, G.veh, G.moon ? 2.2 : 9.81, (d, f, t, g, q) => audio.burst(d, f, t, g, q));
  // feet bend the crop they walk through
  footStampT -= dt;
  if (footStampT <= 0 && walker.onGround && walker.forwardSpeed > 0.3) {
    footStampT = 0.12;
    if (surface(p.x, p.z).crop > 0.5) terrain.stamp(p.x, p.z, 0.32, 120);
  }
  $('hint').classList.toggle('on', G.bino < 0.3 && walker.doorDist(G.veh) < 2.2);
}
function addCrop(a) { if (a > 0) { G.crop += a; drone.earn(a * 14); } }
// the bill (crop, trees, crashes) carries over a reload, like the drone's money
const STATS = 'polnacka-stats';
let statsSaved = '';
function saveStats() {
  const s = JSON.stringify({ crop: Math.round(G.crop * 100) / 100, felled: G.felled, crashes: G.crashes });
  if (s === statsSaved) return;
  statsSaved = s;
  try { localStorage.setItem(STATS, s); } catch {}
}
try { const s = JSON.parse(localStorage.getItem(STATS)); if (s) { G.crop = s.crop || 0; G.felled = s.felled || 0; G.crashes = s.crashes || 0; } } catch {}
function toast(t) { $('toast').textContent = t; $('toast').classList.add('on'); ttl = 2.4; }

// ---- input --------------------------------------------------------------------------------
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (G.mode === 'menu') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') pick((G.carIdx + 3) % 4);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') pick((G.carIdx + 1) % 4);
    if (e.code === 'Enter' || e.code === 'Space') start();
    return;
  }
  if (G.mode !== 'play') return;
  // the drone's station: while it's open the game goes on, but the keys are its
  if (e.code === 'KeyU') { setDeck(!deck.open); return; }
  if (deck.open) { if (e.code === 'Escape') setDeck(false); keys.clear(); return; }
  if (drone.view) {
    // flying: the drone has the movement keys, the world keys still work
    if (e.code === 'KeyW') { const now = performance.now(); if (now - lastW < 300) droneTurbo = true; lastW = now; }
    if (e.code === 'KeyV') { droneHud.wipe = 0.3; toast('Čočka otřena'); }
    // by the letter, not the key's place: on a Czech keyboard Y sits where KeyZ is
    if (e.key === 'y' || e.key === 'Y') { drone.homeOn = !drone.homeOn; toast(drone.homeOn ? (G.onFoot ? 'Ukazuju, kde stojíš' : 'Ukazuju auto') : 'Ukazatel vypnut'); }
    if (e.code === 'KeyP') cycleWeather();
    if (e.code === 'KeyO' && e.shiftKey) { const f = focus(); tornadoes.force(f.x, f.z); toast('Tornádo'); }
    else if (e.code === 'KeyO') { const f = focus(); weather.supercell(f.x, f.z); toast('Supercela'); }
    if (e.code === 'KeyT') setHour((G.hour + 2) % 24);
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); toast(audio.muted ? 'Zvuk vypnut' : 'Zvuk zapnut'); }
    if (e.code === 'Escape') toMenu();
    return;
  }
  if (e.code === 'KeyF') { if (G.onFoot) getIn(); else getOut(); }
  if (e.code === 'KeyB' && G.onFoot) G.binoOn = !G.binoOn;
  if (e.code === 'KeyP') cycleWeather();
  if (e.code === 'KeyO' && e.shiftKey) { const f = focus(); tornadoes.force(f.x, f.z); toast('Tornádo'); }
  else if (e.code === 'KeyO') { const f = focus(); weather.supercell(f.x, f.z); toast('Supercela'); }
  if (G.onFoot && ['KeyC', 'KeyJ', 'KeyV', 'KeyL'].includes(e.code)) return;
  if (e.code === 'KeyC') { G.cam = (G.cam + 1) % 4; chaseInit = false; updateCabinView(); toast(CAMS[G.cam]); }
  if (e.code === 'KeyR') repair();
  if (e.code === 'KeyT') setHour((G.hour + 2) % 24);
  if (e.code === 'KeyL') G.lightsOn = !G.lightsOn;
  if (e.code === 'KeyH') audio.horn(true);
  if (e.code === 'KeyV') { G.wipe = 1.6; toast('Stěrače'); }
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); toast(audio.muted ? 'Zvuk vypnut' : 'Zvuk zapnut'); }
  if (e.code === 'KeyG') { G.moon = !G.moon; G.veh.g = G.moon ? 2.2 : 9.81; toast(G.moon ? 'Měsíční gravitace' : 'Zpátky na Zemi'); }
  if (e.code === 'KeyJ' && G.veh.onGround) { G.veh.v.y += G.moon ? 5 : 8; G.veh.v.addScaledVector(tmpV.set(0, 0, 1).applyQuaternion(G.veh.q), 2); }
  if (e.code === 'Escape') toMenu();
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyH') audio.horn(false); });
addEventListener('blur', () => keys.clear());
canvas.addEventListener('mousedown', e => { if (e.button === 2 && G.onFoot) G.binoHeld = true; });
addEventListener('mouseup', e => { if (e.button === 2) G.binoHeld = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (drone.view) { drone.zoomBy(e.deltaY > 0 ? 0.87 : 1.15); return; } if (G.onFoot && G.bino > 0.5) G.binoZoom = clamp(G.binoZoom * (e.deltaY > 0 ? 0.85 : 1.18), 3, 16); });
canvas.addEventListener('click', () => { if (G.mode === 'play' && !deck.open && !document.pointerLockElement) lockPointer(); });
document.addEventListener('pointerlockchange', () => { G.pointer = !!document.pointerLockElement; });
// turning the view: the mouse (pointer locked) and a finger on the touch screen (touch.js) both end up here
function lookBy(mx, my) {
  if (G.mode !== 'play') return;
  if (drone.view) { drone.look(mx, my); return; }
  if (G.onFoot) {
    // through the binoculars the same hand movement turns the view less
    const k = camera.fov / 74;
    walker.yaw -= mx * 0.0022 * k;
    walker.pitch = clamp(walker.pitch - my * 0.0022 * k, -1.5, 1.5);
    return;
  }
  head.lookX = clamp(head.lookX - mx * 0.0022, -2, 2);
  head.lookY = clamp(head.lookY - my * 0.0018, -0.5, 0.5);
}
addEventListener('mousemove', e => {
  if (!document.pointerLockElement) return;
  lookBy(e.movementX, e.movementY);
});

function readInput(dt) {
  const v = G.veh, inp = v.input;
  const up = keys.has('KeyW') || keys.has('ArrowUp'), down = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft'), right = keys.has('KeyD') || keys.has('ArrowRight');
  const pad = navigator.getGamepads?.()[0];
  let steer = (left ? 1 : 0) - (right ? 1 : 0), th = up ? 1 : 0, br = down ? 1 : 0, hand = keys.has('Space');
  let nitro = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (pad) {
    const a = pad.axes[0]; if (Math.abs(a) > 0.12) steer = -a;
    th = Math.max(th, pad.buttons[7]?.value || 0); br = Math.max(br, pad.buttons[6]?.value || 0);
    hand = hand || pad.buttons[0]?.pressed; nitro = nitro || pad.buttons[2]?.pressed;
  }
  const t = window.tilt;                               // phone tilted like a wheel (js/touch.js), analogue −1…1
  if (t?.on) {
    steer = t.steer;
    if (t.pedals) { th = Math.max(th, Math.max(0, t.lean)); br = Math.max(br, Math.max(0, -t.lean)); }
  }
  const spd = v.forwardSpeed;
  v.wantsReverse = false;
  if (v.gear < 0) {
    // in reverse the two pedals swap roles
    v.wantsReverse = br > 0 && !up;
    inp.throttle = br; inp.brake = th;
    if (th > 0 && spd > -0.8) { v.wantsReverse = false; inp.throttle = th; inp.brake = 0; }
  } else {
    if (br > 0 && spd < 0.9) { v.wantsReverse = true; inp.throttle = 0; inp.brake = 0; }
    else { inp.throttle = th; inp.brake = br; }
  }
  inp.steer = steer; inp.hand = hand ? 1 : 0; inp.nitro = nitro ? 1 : 0;
  // on the start line the handbrake stays on until the count ends, and a car you left stays put
  if (race.hold || G.onFoot || drone.view) { inp.throttle = 0; inp.brake = 1; inp.hand = 1; inp.nitro = 0; v.wantsReverse = false; }
  if (G.onFoot) inp.steer = 0;   // A and D walk you sideways, they don't turn the wheels
}

// ---- menu ---------------------------------------------------------------------------------
function buildMenu() {
  const pickEl = $('pick');
  pickEl.innerHTML = CARS.map((c, i) => `<button class="card" data-i="${i}"><em>${c.tag}</em><b>${c.name}</b><p>${c.blurb}</p></button>`).join('');
  pickEl.addEventListener('click', e => { const b = e.target.closest('.card'); if (b) pick(+b.dataset.i); });
  $('go').addEventListener('click', start);
  document.querySelectorAll('#modes [data-race]').forEach(b => b.addEventListener('click', () => {
    G.raceType = b.dataset.race;
    document.querySelectorAll('#modes [data-race]').forEach(o => o.classList.toggle('on', o === b));
    b.blur();
  }));
  $('rNew').addEventListener('click', () => beginRace(race.type, Math.random() * 1e9 | 0));
  $('rAgain').addEventListener('click', () => beginRace(race.type, race.seed, race.from));
  $('rQuit').addEventListener('click', toMenu);
  document.querySelectorAll('#opts [data-q]').forEach(b => b.addEventListener('click', () => setQuality(b.dataset.q)));
  markQ();
}
function markQ() { document.querySelectorAll('#opts [data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === qName)); }
function setQuality(n) {
  qName = n; Q = QUALITY[n];
  try { localStorage.setItem(QKEY, n); } catch {}
  markQ();
  drsScale = 1; resize();
  scenePass.setQuality(Q); clouds.setQuality(Q); torView.setQuality(Q);
  bloom.enabled = Q.bloom; fxaa.enabled = Q.samples === 0;
  sky.setShadow(shadowSize(), Q.span);
  sky.setEdge(Q.far * CHUNK);
  rain.setCount(Q.rain); hail.setCount(Q.rain >> 2);
  terrain.setQuality(Q);
  setupMirror();
  if (G.car) { if (mirrorMat) G.car.cab.mirrorPlane.material = mirrorMat; else repaintMirror(); }
  traffic.count = Q.traffic; traffic.farmers = Q.tractors;
}
function saveMore(stage) {
  if (stage === 1) { sky.sun.castShadow = false; traffic.count = 0; toast('Úsporný režim 1: bez stínů a bez provozu'); }
  else if (stage === 2) { clouds.res *= 0.6; clouds.steps = Math.max(5, clouds.steps - 3); clouds.setQuality({ cloud: [clouds.res, clouds.steps] }); rain.setCount(300); hail.setCount(100); toast('Úsporný režim 2: levnější mraky a déšť'); }
  else { drsScale = 0.4; resize(); toast('Úsporný režim 3: nejnižší rozlišení'); }
}
function repaintMirror() { G.car.cab.mirrorPlane.material = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.03, envMap: env, envMapIntensity: 1.3 }); }
function pick(i) {
  document.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('on', k === i));
  const h = G.home;
  spawnCar(i, h.x, h.z, h.heading);
}
function start() {
  audio.start();
  G.mode = 'play'; $('menu').classList.add('gone'); $('hud').classList.add('on');
  G.cam = 0; updateCabinView();
  head.vLast.copy(G.veh.v);
  lockPointer();
  if (G.raceType) beginRace(G.raceType, Math.random() * 1e9 | 0);
}
// from: where the route search starts, which with the seed fixes the stage
function beginRace(type, seed, from = [G.veh.pos.x, G.veh.pos.z]) {
  const s = race.prepare(type, seed, from[0], from[1]);
  if (!s) { toast('Tady poblíž se trať nenašla, popojeď kousek'); return; }
  if (drone.state !== 'packed') drone.pack();
  spawnCar(G.carIdx, s.x, s.z, s.h);
  head.vLast.copy(G.veh.v); chaseInit = false;
  terrain.update(s.x, s.z, true);
  if (G.mode === 'play') lockPointer();
}
function lockPointer() { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch {} }
function toMenu() {
  // the drone comes home with you, wherever it was
  if (drone.state !== 'packed') drone.pack();
  if (deck.open) deck.setOpen(false);
  droneHud.update(0, camera, { rain: 0 });
  if (G.onFoot) getIn(true);
  race.stop();
  G.mode = 'menu'; $('menu').classList.remove('gone'); $('hud').classList.remove('on');
  G.home = { x: G.veh.pos.x, z: G.veh.pos.z, heading: 2 * Math.atan2(G.veh.q.y, G.veh.q.w) };
  G.cam = 2; updateCabinView();
  document.exitPointerLock?.();
  spawnCar(G.carIdx, G.home.x, G.home.z, G.home.heading);
  keys.clear(); audio.engine(800, 6000, 0, 1); audio.ride(0, 0, 0, 0, false);
}
function repair() {
  const v = G.veh, fwd = tmpV.set(0, 0, 1).applyQuaternion(v.q);
  let heading = Math.atan2(fwd.x, fwd.z);
  const ks = v.nitroFuel, dirt = G.car.dirt.value * 0.4;
  if (race.active) {
    // in a race the marshals put you back on the stage, and that costs time
    const s = race.rescue();
    spawnCar(G.carIdx, s.x, s.z, s.h);
    G.veh.nitroFuel = ks; G.car.dirt.value = dirt; head.vLast.copy(G.veh.v);
    toast('Zpátky na trať, +5 s');
    return;
  }
  // a car in the water gets towed to the nearest bank
  let x = v.pos.x, z = v.pos.z;
  const wet = (px, pz) => { const w = waterAt(px, pz); return w.on && w.edge < 3.5; };
  if (wet(x, z)) search: for (let r = 4; r < 90; r += 3) for (let a = 0; a < 6.28; a += 0.3) {
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (!wet(px, pz)) { x = px; z = pz; break search; }
  }
  spawnCar(G.carIdx, x, z, heading);
  G.veh.nitroFuel = ks; G.car.dirt.value = dirt;
  head.vLast.copy(G.veh.v);
  toast('Opraveno');
}
// T jumps the clock on: the sky is rebaked for the new hour at once
function setHour(h) {
  G.hour = h;
  sky.update(G.hour, G.rain, G.fog, true);
  useEnv(sky.rebuildEnv());
  setAir();
  toast(clock());
}
const isDark = () => sky.preset.stars > 0.3 || sky.elev < 3;
const clock = () => { const m = Math.floor(G.hour * 60) % 1440; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
function setAir() {
  const p = sky.preset, r = G.rain, f = G.fog;
  // rain: the haze lies thick and low, and there are no shafts without a sun; fog fills the hollows and lets the shafts through
  scenePass.mist = p.mist * (1 + 7 * r + 12 * f); scenePass.mistCol.copy(LIT.uFogCol.value).lerp(LIT.uSkyC.value, 0.3);
  scenePass.shaft = p.shaft * (1 - r) * (1 + 0.6 * f); scenePass.sunCol.copy(sky.sun.color); scenePass.sunDir.copy(sky.dir);
}
function useEnv(e) {
  env = e;
  fx.tint.set(sky.sun.color).lerp(new THREE.Color(1, 1, 1), 0.5);
  G.car.paint.envMap = e; G.car.glass.envMap = e; G.car.chrome.envMap = e;
  G.car.root.traverse(o => { if (o.material?.envMap) { o.material.envMap = e; o.material.needsUpdate = true; } });
  traffic.setEnv(e);
}

// ---- weather ----------------------------------------------------------------------------------
const rainCol = new THREE.Color(), rainVel = new THREE.Vector3(), rainWind = { x: 0, z: 0 }, wxTmp = {};
const torAir = { x: 0, y: 0, z: 0, core: 0 }, airHere = { x: 0, z: 0, speed: 0, gust: 1 };
const DUST_AIR = new THREE.Color(0.78, 0.6, 0.42);
function setWeather(i) {
  G.wx = i;
  const w = WEATHERS[i];
  G.fogGoal = w.fog || 0;
  clouds.setWeather(w);
  weather.regime = i;
}
// P picks the next weather by hand and puts it right overhead; it holds for a couple of hours before the sky decides again
function cycleWeather() {
  setWeather((G.wx + 1) % WEATHERS.length); G.wxT = 2;
  const f = focus();
  weather.force(G.wx, f.x, f.z);
  toast(WEATHERS[G.wx].name);
}
// what the weather is where you are, for the clock
function wxName() {
  const h = weather.here;
  if (G.hail > 0.12) return 'Kroupy';
  if (G.rain > 0.08) return G.storm ? 'Bouřka' : G.rain > 0.45 ? 'Déšť' : 'Mrholení';
  if (G.fog > 0.4) return 'Mlha';
  if (tornadoes.near(focus().x, focus().z).d < 12000) return 'Tornádo';
  if (h.superNear < 14000) return 'Supercela';
  if (h.stormNear < 9000) return 'Bouřka v dálce';
  if (G.lid > 0.4) return 'Zataženo';
  return G.wx === 0 ? 'Jasno' : 'Polojasno';
}
// a strike in a storm cell: the cloud lights up round it, the screen only when it's close, and the
// thunder comes as late as sound takes to get here
function strike(x, z) {
  const f = focus(), d = Math.hypot(x - f.x, z - f.z);
  clouds.U.uFlashP.value.set(x, z, 0);
  G.bolt = { t: 0, at: [0, 0.13 + Math.random() * 0.1, 0.34 + Math.random() * 0.2].slice(0, 2 + (Math.random() < 0.4 ? 1 : 0)), k: Math.min(1, 1.8 * Math.exp(-d / 2600)) };
  if (d < 16000) audio.thunder(d / 343, d < 1500, Math.max(0.2, 1 - d / 16000));
}
weather.onBolt = strike;
function nextWeather() {
  let odds = WX_ODDS[0][1];
  for (const [from, o] of WX_ODDS) if (G.hour >= from) odds = o;
  let pick = Math.random() * odds.reduce((a, b) => a + b, 0), i = 0;
  while (pick >= odds[i]) pick -= odds[i++];
  setWeather(i);
  G.wxT = 1.5 + Math.random() * 2.5;
}
function weatherFrame(dt) {
  // the clock: an hour of daylight takes a minute, the night goes by faster
  const night = G.hour >= 20.2 || G.hour < 5.4, dh = dt * (night ? 1 / 24 : 1 / 60);
  G.hour = (G.hour + dh) % 24;
  G.wxT -= dh;
  if (G.wxT <= 0) nextWeather();
  G.fog += Math.max(-dt * 0.03, Math.min(dt * 0.03, G.fogGoal - G.fog));
  // the rain is what the cells drop right here; they move smoothly, this only takes the edge off
  const f = focus();
  weather.update(dt, f.x, f.z, WIND.value);
  tornadoes.update(dt, f.x, f.z);
  WEATHER.vortex = tornadoes.on ? tornadoes : null;
  // a tornado's wind where you are: the rain, the dust and the howl go with it too
  tornadoes.windAt(f.x, f.y + 1.5, f.z, torAir);
  const h = weather.here, wasHeavy = G.rain > 0.6;
  G.rain += (h.rain - G.rain) * Math.min(1, dt * 0.6);
  G.lid += (h.lid - G.lid) * Math.min(1, dt * 0.6);
  G.storm = h.storm > 0.3; G.wet = h.wet;
  if (G.rain > 0.6 && !wasHeavy) G.lightsOn = true;
  LIT.uWet.value = G.wet; LIT.uRainK.value = G.rain; WEATHER.wet = G.wet; WEATHER.ice = h.ice;
  // the lid over the car, up the sun's slant: it's what dims the sun on the car, the houses and trunks
  const S = LIT.uWxS.value, lidSun = Math.max(weather.at(f.x + S.x, f.z + S.y, wxTmp).lid, 0.6 * weather.at(f.x + S.x * 5, f.z + S.y * 5, wxTmp).anvil);
  sky.lidHere = 1 - S.z * THREE.MathUtils.smoothstep(lidSun, 0.1, 0.85);
  sky.update(G.hour, Math.max(G.rain, G.lid * 0.7), G.fog);
  clouds.update(dt, WIND.value, G.rain, G.fog, G.flash, camera.getWorldPosition(tmpV3));
  setAir();
  // the car's reflections follow the sky, but rebuilding them costs a frame, so only when it shows
  if (sky.envStale() > 1) useEnv(sky.rebuildEnv());
  // dusk: windows light up, the traffic switches its lamps on, and so do you
  const dark = isDark();
  if (dark !== G.dark) { G.dark = dark; flora.setNight(dark); traffic.setNight(dark); G.lightsOn = dark || G.rain > 0.6; }
  // lightning (strike above): a flash or two in the cloud
  let flash = 0, near = 0;
  if (G.bolt) {
    G.bolt.t += dt;
    for (const a of G.bolt.at) if (G.bolt.t >= a) flash = Math.max(flash, Math.exp(-(G.bolt.t - a) * 11));
    near = G.bolt.k;
    if (G.bolt.t > 1.4) G.bolt = null;
  }
  G.flash = flash;
  grade.uniforms.uRain.value = G.rain; grade.uniforms.uFlash.value = flash * near;
  audio.rain(G.rain);
  // rain far off hangs under the lid as grey curtains
  scenePass.curtain.setRGB(...sky.over.horizon, THREE.LinearSRGBColorSpace).multiplyScalar(0.3 + flash * near * 3);
  // streaks round the camera, and drops where they land
  rainCol.copy(LIT.uFogCol.value).multiplyScalar(1.7 + flash * near * 4).lerp(LIT.uSkyC.value, 0.25);
  // the drops go with the wind, a little behind it, and always lean its way enough to show it
  const ra = weather.air, rx = ra.x + torAir.x, rz = ra.z + torAir.z, rsp = Math.hypot(rx, rz), rs = Math.max(rsp * 0.85, 2.5 + 3.5 * G.rain) / Math.max(rsp, 0.01);
  rainWind.x = rx * rs; rainWind.z = rz * rs;
  rain.update(dt, camera, drone.view ? drone.v : G.onFoot ? walker.v : G.veh.v, G.rain, rainWind, rainCol);
  windFrame(dt);
  hailFrame(dt, flash * near);
  tornadoFrame(dt);
  if (G.rain > 0.05 && G.mode === 'play') {
    const n = G.rain * dt * (Q.rain > 5000 ? 110 : 60);
    for (let k = n; k > Math.random(); k -= 1) {
      const a = Math.random() * 6.283, d = 1.5 + Math.sqrt(Math.random()) * 9, x = camera.position.x + Math.cos(a) * d, z = camera.position.z + Math.sin(a) * d;
      const w = waterAt(x, z);
      if (w.on && w.edge < 0) continue;
      fx.spawn(x, ground(x, z, camera.position.y) + 0.02, z, (Math.random() - 0.5) * 0.9, 0.9 + Math.random() * 1.3, (Math.random() - 0.5) * 0.9, 0.26, 0.035, 0.05, 0.85, 0.9, 0.95, 0.5, 9.8, 0.4, false);
    }
    // drops on the windscreen, until the wipers sweep them off
    G.glassT -= dt;
    if (!G.onFoot && G.glassT <= 0) { G.glassT = 0.14; G.dmg.dropsOnGlass(Math.round(G.rain * 3 + (Math.random() < G.rain ? 1 : 0))); }
  }
}
// The wind (weather.js) where you are: it leans on the car and on you, carries the dust and smoke,
// howls round the car, and when it's strong it lifts dust off dry tracks and fields and tears
// leaves off the trees. A gust front does all of that at once, before the rain arrives.
function windFrame(dt) {
  const f = focus();
  // the cars read a tornado's wind themselves (WEATHER.vortex); everything else here takes it as it blows where you are
  WEATHER.wind.x = weather.air.x; WEATHER.wind.z = weather.air.z;
  const a = airHere;
  a.x = weather.air.x + torAir.x; a.z = weather.air.z + torAir.z; a.speed = Math.hypot(a.x, a.z); a.gust = weather.air.gust;
  fx.wind.x = a.x; fx.wind.z = a.z;
  // far off: the rain shafts lean with the wind aloft (drops fall about 9 m/s), and a gust front's dust takes the light of the air
  scenePass.tilt.copy(weather.base).multiplyScalar(1.6 / 9);
  scenePass.dustCol.copy(LIT.uFogCol.value).multiply(DUST_AIR);
  // trees round you: their rustle, and the leaves a gale tears off
  G.windT -= dt;
  if (G.windT <= 0) {
    G.windT = 0.5;
    let n = 0;
    for (let k = 0; k < 6; k++) { const an = k * 1.047; if (isForest(f.x + Math.cos(an) * 30, f.z + Math.sin(an) * 30)) n++; }
    G.trees = n / 6;
  }
  audio.gusts(a.speed, a.gust, G.trees || 0);
  if (G.mode !== 'play' || a.speed < 7) return;
  // what the wind picks up arrives from upwind: spawn it there so it blows past you
  const s = a.speed, ux = -a.x / s, uz = -a.z / s;
  const dusty = THREE.MathUtils.smoothstep(s, 8, 18) * (1 - Math.min(1, G.wet * 2.5));
  for (let k = dt * 26 * dusty; k > Math.random(); k -= 1) {
    const d = 4 + Math.random() * 30, side = (Math.random() - 0.5) * 50;
    const x = f.x + ux * d - uz * side, z = f.z + uz * d + ux * side, sf = surface(x, z).kind;
    if (sf === KIND.ROAD || sf === KIND.FOREST || waterAt(x, z).on) continue;
    const col = DUST[sf] || DUST[KIND.PATH];
    fx.dust(x, ground(x, z, f.y + 2) + 0.2, z, a.x, 0, a.z, col, 1.6 + Math.random() * 1.6);
  }
  // leaves torn off in the gusts
  const leafy = (G.trees || 0) * THREE.MathUtils.smoothstep(s, 9, 20);
  for (let k = dt * 14 * leafy; k > Math.random(); k -= 1) {
    const d = 3 + Math.random() * 18, side = (Math.random() - 0.5) * 30;
    tmpV.set(f.x + ux * d - uz * side, f.y + 3 + Math.random() * 6, f.z + uz * d + ux * side);
    fx.leaves(tmpV, 1, Math.random() < 0.5 ? [0.26, 0.42, 0.13] : [0.42, 0.34, 0.12]);
  }
}
// Hail (weather.js keeps where it falls): white stones round the camera, bouncing off the ground
// and off the car, a clatter on the roof, little dents in the panels and chips in the windscreen.
const hailCol = new THREE.Color(), hailUp = new THREE.Vector3(), hailP = new THREE.Vector3();
function hailFrame(dt, flash) {
  G.hail += (weather.here.hail - G.hail) * Math.min(1, dt * 0.8);
  const h = G.hail, play = G.mode === 'play';
  hailCol.copy(LIT.uFogCol.value).multiplyScalar(2.3 + flash * 4).lerp(LIT.uSkyC.value, 0.2);
  hail.update(dt, camera, drone.view ? drone.v : G.onFoot ? walker.v : G.veh.v, h, rainWind, hailCol);
  audio.hail(h, !G.onFoot && !drone.view && G.cam === 0);
  if (h < 0.02 || !play) return;
  const cp = camera.position, t = fx.tint;
  // stones that hit the ground jump back up
  for (let k = h * dt * 160; k > Math.random(); k -= 1) {
    const a = Math.random() * 6.283, d = 1.2 + Math.sqrt(Math.random()) * 10, x = cp.x + Math.cos(a) * d, z = cp.z + Math.sin(a) * d;
    const w = waterAt(x, z);
    if (w.on && w.edge < 0) continue;
    const r = Math.random() - 0.5, s = Math.random() - 0.5, c = 1.5 + Math.random() * 0.3;
    fx.spawn(x, ground(x, z, cp.y) + 0.03, z, r * 2, 1 + Math.random() * 2.8, s * 2, 0.4 + Math.random() * 0.45, 0.012 + Math.random() * 0.012, 0, c * t.r, c * t.g, c * t.b, 1, 9.8, 0.2, false);
  }
  // and off the car: on the roof and the bonnet, where the driver sees and hears them
  const v = G.veh, hf = v.half, size = weather.cellHail();
  for (let k = h * dt * 40; k > Math.random(); k -= 1) {
    hailP.set((Math.random() * 2 - 1) * hf.x * 0.8, hf.yTop + 0.05, hf.zR * 0.8 + Math.random() * (hf.zF - hf.zR) * 0.8).applyQuaternion(v.q).add(v.pos);
    hailUp.set(0, 1, 0).applyQuaternion(v.q);
    const c = 1.6;
    fx.spawn(hailP.x, hailP.y, hailP.z, v.v.x + (Math.random() - 0.5) * 2 + hailUp.x * 2, v.v.y + 1.5 + Math.random() * 2.5, v.v.z + (Math.random() - 0.5) * 2 + hailUp.z * 2, 0.35 + Math.random() * 0.3, 0.012 + Math.random() * 0.01, 0, c * t.r, c * t.g, c * t.b, 1, 9.8, 0.2, false);
    if (!G.onFoot) audio.hailTick(G.cam === 0);
  }
  if (G.onFoot) { for (let k = h * dt * 25; k > Math.random(); k -= 1) audio.hailTick(false); return; }
  // the bigger the stones, the more often one leaves its mark
  if (Math.random() < h * size * dt * 1.6) G.dmg.hailDent(size);
  if (Math.random() < h * size * dt * 0.9) G.dmg.hailChip(size);
}
// A tornado (tornado.js): the light it stands in for its picture, the debris it throws, the swath it
// flattens through the fields, the trees and poles it snaps, the bales it rolls, the boards that hit
// the car, and its roar.
const torLight = { dir: sky.dir, sun: new THREE.Color(), amb: new THREE.Color(), haze: new THREE.Color(), soil: [0.42, 0.34, 0.24] };
const torSolids = [], torV = { x: 0, y: 0, z: 0, core: 0 }, torN = new THREE.Vector3();
let torDmgT = 0, torSaid = null;
function tornadoFrame(dt) {
  const t = tornadoes.main, f = focus();
  torView.update(t, WIND.value, torLight);
  debris.update(dt, tornadoes, camera.position);
  if (!t) { audio.tornado(0, 0); return; }
  if (torSaid !== t && t.reachNow > 0.9 && Math.hypot(t.base.x - f.x, t.base.z - f.z) < 9000) { torSaid = t; toast('Tornádo se dotklo země'); }
  // under the storm little sun gets to it; it is lit by the grey light from round the horizon
  const S = LIT.uWxS.value, lid = Math.max(weather.at(t.base.x + S.x, t.base.z + S.y, wxTmp).lid, 0.8 * wxTmp.anvil);
  torLight.sun.setRGB(...sky.preset.litC, THREE.LinearSRGBColorSpace).multiplyScalar(0.55 * (1 - 0.85 * lid) * Math.min(1, sky.elev / 6 + 0.1));
  torLight.amb.copy(LIT.uFogCol.value).multiplyScalar(1.05);
  // the air between you and it lies in the storm's shade where a lid is over it, as in post.js
  let shade = 0;
  for (let i = 0; i < 4; i++) { const k = (i + 0.5) / 4; shade += weather.at(f.x + (t.base.x - f.x) * k, f.z + (t.base.z - f.z) * k, wxTmp).lid / 4; }
  torLight.haze.copy(scene.fog.color).multiplyScalar(1 - 0.65 * THREE.MathUtils.smoothstep(shade, 0.1, 0.9));
  const soil = DUST[surface(t.base.x, t.base.z).kind] || DUST[KIND.PATH];
  for (let i = 0; i < 3; i++) torLight.soil[i] += (soil[i] * 0.75 - torLight.soil[i]) * Math.min(1, dt * 0.3);
  if (G.mode === 'play') debris.particles(dt, tornadoes, fx, camera.position);
  // its roar: a low rumble heard for kilometres, the roar of a waterfall nearer, and close in the hiss and clatter of what it carries
  const d = Math.hypot(t.base.x - f.x, t.base.z - f.z);
  audio.tornado(t.I * Math.max(0, 1 - d / 6000) ** 2 * (0.4 + 0.6 * t.dust), torAir.core + Math.max(0, 1 - d / (t.Rd * 3)) * t.I);
  if (G.mode !== 'play') return;
  // bales roll and fly with it
  for (const b of bales) {
    if (Math.abs(b.pos.x - t.base.x) > 400 || Math.abs(b.pos.z - t.base.z) > 400) continue;
    tornadoes.windAt(b.pos.x, b.pos.y, b.pos.z, torV);
    const rx = torV.x - b.v.x, ry = torV.y - b.v.y, rz = torV.z - b.v.z, rl = Math.hypot(rx, ry, rz);
    if (rl < 22 && !b.awake) continue;
    b.v.x += rx * rl * 0.005 * dt; b.v.y += ry * rl * 0.005 * dt; b.v.z += rz * rl * 0.005 * dt;
    b.awake = true; b.spinAxis ||= new THREE.Vector3(rx, 0, rz).normalize();
  }
  // boards and branches hitting the car, in the strongest of it
  const v = G.veh;
  tornadoes.windAt(v.pos.x, v.pos.y, v.pos.z, torV);
  const vs = Math.hypot(torV.x, torV.z);
  if (vs > 32 && Math.random() < (vs - 32) / 14 * t.dust * dt) {
    const p = v.hull[Math.random() * v.hull.length | 0];
    G.dmg.impact(p, tmpV.copy(p).negate().normalize(), 6 + Math.random() * 9, tmpV2.copy(p).applyQuaternion(v.q).add(v.pos), 'debris');
  }
  // the swath: crops flattened where its wind tops 30 m/s, trees and poles snapped where it is stronger
  torDmgT -= dt;
  if (torDmgT > 0 || t.V < 28 || t.dust < 0.2 || d > 1800) return;
  torDmgT = 0.1;
  const reach = t.Rc * Math.min(3.2, Math.pow(t.V / 28, 1 / 0.65));
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * 6.283, r = reach * Math.sqrt(Math.random()), x = t.base.x + Math.cos(a) * r, z = t.base.z + Math.sin(a) * r;
    terrain.stamp(x, z, 2 + Math.random() * 3, 255);
  }
  if (t.V < 36) return;
  terrain.nearby(t.base.x, t.base.z, reach * 0.8, torSolids);
  let n = 0;
  for (const s of torSolids) {
    const ty = s.o?.type;
    if (!(ty <= OBJ.OAK || ty === OBJ.POLE || ty === OBJ.POST) || Math.random() > 0.3) continue;
    tornadoes.windAt(s.x, (s.o.y ?? 0) + 4, s.z, torV);
    const sp = Math.hypot(torV.x, torV.z);
    if (sp < (ty === OBJ.POST ? 30 : ty === OBJ.POLE ? 38 : 34)) continue;
    breakSolid(s, torN.set(torV.x / sp, 0, torV.z / sp), true);
    fx.leaves({ x: s.x, y: (s.o.y ?? 0) + 3, z: s.z }, 20);
    if (++n >= 2) break;
  }
}
// thrown to the ground on foot: hard enough and you black out for a few seconds
walker.onLand = speed => {
  audio.thud(Math.min(0.8, speed * 0.03));
  if (speed > 15) G.knock = Math.min(6, 1.5 + (speed - 15) * 0.25);
};
// The eyes settle on the picture: slowly opening in the shade of a forest, faster when it's bright.
function adaptEyes(dt) {
  const p = sky.preset;
  let goal = 1;
  // only a little: a forest is meant to stay darker than the field outside it
  if (Q.adapt) goal = clamp(Math.sqrt(p.key * (1 - 0.55 * G.rain) / Math.max(scenePass.lum, 0.005)), 0.85, 1.2);
  G.adapt += (goal - G.adapt) * (1 - Math.exp(-dt * (goal < G.adapt ? 1.8 : 0.8)));
  renderer.toneMappingExposure = p.exposure * G.adapt;
  // the mist lies in the low ground around you, wherever that is
  scenePass.mistY += (height(focus().x, focus().z) - 1 - scenePass.mistY) * Math.min(1, dt * 0.25);
}

// ---- main loop ----------------------------------------------------------------------------
const STEP = 1 / 120;
let acc = 0, last = performance.now(), slowAvg = 16, frames = 0, autoT = 0;
function stepWorld(dt) {
  const v = G.veh;
  v.solids = terrain.nearby(v.pos.x, v.pos.z, 18, v.solids);
  acc += dt * G.timeScale;
  let n = 0;
  while (acc >= STEP && n++ < 14) { readInput(STEP); v.step(STEP); if (race.active) race.step(STEP); acc -= STEP; }
  if (acc > STEP * 4) acc = 0;
  // a phone: every bale is its own draw call (there can be hundreds), so only the ones near you are drawn
  if (Q.lite && (baleCull = (baleCull + 1) % 10) === 0) { const f = focus(); for (const b of bales) b.mesh.visible = Math.hypot(b.pos.x - f.x, b.pos.z - f.z) < 150; }
  for (const b of bales) if (b.awake) {
    stepBale(b, dt);
    if (b.spinAxis) b.mesh.rotateOnWorldAxis(tmpV.crossVectors(tmpV2.set(0, 1, 0), b.spinAxis).normalize(), b.v.length() / 0.72 * dt);
  }
}
let loadFrames = 0;
// ?fps=1: a small frame counter (for checking a phone)
const fpsEl = /[?&]fps=1/.test(location.search) ? Object.assign(document.body.appendChild(document.createElement('div')), { style: 'position:fixed;left:50%;top:34px;transform:translateX(-50%);z-index:40;font:600 13px system-ui;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none' }) : null;
let fpsN = 0, fpsT = 0, jsMs = 0, perfStage = 0, lowT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = now - last;
  let dt = Math.min(0.05, real / 1000); last = now;
  const jt0 = performance.now();
  tick(dt);
  jsMs += (performance.now() - jt0 - jsMs) * 0.1;
  if (fpsEl) { fpsN++; fpsT += real; if (fpsT > 500) { fpsEl.textContent = `${Math.round(fpsN * 1000 / fpsT)} fps · ${qName} · ${drsScale.toFixed(2)} · js ${jsMs.toFixed(0)} ms${perfStage ? ' · save ' + perfStage : ''}`; fpsN = 0; fpsT = 0; } }
  // behind the loading screen nobody sees the picture: on a phone only draw now and then (shaders still compile), so the world gets built faster
  if (!(fastLoad && G.mode === 'load' && (loadFrames++ % 6))) render();
  // dynamic resolution: drop detail before dropping frames
  if (G.mode === 'play' && real < 200) {
    slowAvg += (real - slowAvg) * 0.04;
    autoT += dt;
    if (autoT > 2) {
      autoT = 0;
      // a phone that stays under ~22 fps even at the lowest resolution: switch costly things off, one step at a time
      if (touchDevice && slowAvg > 45 && drsScale <= 0.5) { if (++lowT >= 2 && perfStage < 3) { lowT = 0; saveMore(++perfStage); } } else lowT = 0;
      if (slowAvg > (touchDevice ? 20 : 26) && drsScale > (touchDevice ? 0.45 : 0.5)) { drsScale *= 0.82; resize(); }
      else if (slowAvg < 15 && drsScale < 1) { drsScale = Math.min(1, drsScale * 1.12); resize(); }
    }
  }
}
function tick(dt) {
  WIND.value += dt;
  if (G.mode === 'play') {
    stepWorld(dt);
    G.dmg.update(dt);
    if (G.veh.pos.y < -900) repair();
    syncRoot();
    if (G.onFoot && !drone.view) footFrame(dt);
    if (drone.view) droneInput();
    drone.update(dt, pilotPos(), !deck.open);
    // in or out of the drone's eyes: the cabin, the HUD and the camera settle back
    if (drone.view !== G.dWas) { G.dWas = drone.view; updateCabinView(); if (!drone.view) { camera.fov = G.onFoot ? 74 : camera.fov; camera.updateProjectionMatrix(); head.vLast.copy(G.veh.v); } }
    deck.update(dt);
    feelFrame(dt);
    traffic.parked = G.onFoot ? G.veh.pos : null;
    traffic.update(dt, G.onFoot ? walker : G.veh);
    race.update(dt, G.veh, camera);
  } else if (G.veh) {
    if (G.mode === 'menu') { const v = G.veh; stepIdle(v, dt); syncRoot(); traffic.update(dt, v); }
  }
  if (G.veh) {
    weatherFrame(dt);
    updateCamera(dt);
    if (G.mode === 'play') droneHud.update(dt, camera, { rain: G.rain, onFoot: G.onFoot });
    const f = focus();
    terrain.update(f.x, f.z);
    // most of the shadow map lies ahead, where you're looking
    camera.getWorldDirection(tmpV); tmpV.y = 0;
    tmpV2.copy(f).addScaledVector(tmpV.normalize(), sky.span * 0.55);
    sky.follow(camera, tmpV2);
    sky.clouds(f.x, f.z);
    adaptEyes(dt);
    fx.update(dt, renderer.domElement.height * 0.55);
  }
  if (G.mode === 'load') {
    terrain.pump();
    const p = terrain.progress();
    $('bar').firstElementChild.style.width = p * 100 + '%';
    if (fastLoad) $('loadTxt').textContent = `Oráme pole… ${Math.round(p * 100)} % · ${Math.round(performance.now() / 1000)} s`; // (shows a slow phone where the time goes)
    if (fastLoad ? terrain.ready(G.home.x, G.home.z, 1) && p > 0.2 : terrain.ready(G.home.x, G.home.z) && p > 0.72) {
      G.mode = 'menu';
      $('loading').classList.add('gone'); $('menu').classList.remove('gone');
    }
  }
}
// where the world gathers round: the car, or you when you've left it
function focus() { return drone.view ? drone.pos : G.onFoot ? walker.pos : G.veh.pos; }
function stepIdle(v, dt) {
  v.solids = terrain.nearby(v.pos.x, v.pos.z, 18, v.solids);
  v.input.throttle = 0; v.input.brake = 1; v.input.steer = 0; v.input.hand = 1; v.input.nitro = 0;
  acc += dt; let n = 0;
  while (acc >= STEP && n++ < 10) { v.step(STEP); acc -= STEP; }
  if (acc > STEP * 4) acc = 0;
}
function renderMirror() {
  const p = G.car.cab.mirrorPlane;
  p.getWorldPosition(mirrorCam.position);
  mirrorCam.quaternion.copy(G.car.root.quaternion);
  mirrorCam.position.addScaledVector(tmpV.set(0, 0, -1).applyQuaternion(mirrorCam.quaternion), 0.05);
  mirrorCam.rotateX(-0.03);
  // in here particles use the plain depth test, the scene's depth belongs to the main view
  fx.mat.uniforms.uSoft.value = 0; fx.mat.depthTest = rain.mat.depthTest = hail.mat.depthTest = true;
  // the mirror has no cloud pass of its own: its dome shows the sky with the coarse clouds in it
  sky.domeMat.uniforms.uTex.value = sky.rt.texture;
  renderer.setRenderTarget(mirrorRT);
  renderer.render(scene, mirrorCam);
  renderer.setRenderTarget(null);
  sky.domeMat.uniforms.uTex.value = sky.clear.texture;
  fx.mat.uniforms.uSoft.value = 1; fx.mat.depthTest = rain.mat.depthTest = hail.mat.depthTest = false;
}
function render() {
  frames++;
  sky.sun.shadow.needsUpdate = false;
  if (Q.mirror && G.mode === 'play' && G.cam === 0 && !G.onFoot && !drone.view && frames % Q.mirror === 0) renderMirror();
  sky.sun.shadow.needsUpdate = frames % Q.shadowEvery === 0;
  // leaves and tufts read the shadow map themselves; it only exists after the first shadow pass
  const sm = sky.sun.shadow.map;
  LIT.uShadowMap.value = sm ? sm.texture : null; LIT.uShadowOn.value = sm ? 1 : 0;
  composer.render();
}

// ---- go -------------------------------------------------------------------------------------
buildMenu();
setAir();
G.home = { x: SPAWN.x, z: SPAWN.z, heading: headingAlongRoad(SPAWN.x, SPAWN.z) };
terrain.ccx = Math.floor(G.home.x / CHUNK); terrain.ccz = Math.floor(G.home.z / CHUNK);
terrain.update(G.home.x, G.home.z, true);
// every load brings its own weather, already settled
nextWeather();
weather.settle(G.wx, G.home.x, G.home.z);
weather.update(0, G.home.x, G.home.z, 0);
G.rain = weather.here.rain; G.lid = weather.here.lid; G.wet = weather.here.wet; G.storm = weather.here.storm > 0.3;
G.fog = G.fogGoal; G.lightsOn = G.rain > 0.6;
clouds.snap();
sky.update(G.hour, G.rain, G.fog, true);
clouds.update(0, WIND.value, G.rain, G.fog, 0, camera.position);
env = sky.rebuildEnv(); traffic.setEnv(env);
setAir();
G.cam = 2;
spawnCar(0, G.home.x, G.home.z, G.home.heading);
document.querySelector('.card').classList.add('on');
requestAnimationFrame(frame);

// test hook: the Browser pane throttles rAF, so tests pump frames by hand
window.game = { saveMore, lookBy, toast, drone, deck, setDeck, clouds, tornadoes, torView, race, beginRace, fxaa, setQuality, scenePass, get mirror() { return { rt: mirrorRT, cam: mirrorCam, mat: mirrorMat, renderMirror, Q }; }, G, keys, tick, render, terrain, walker, getOut, getIn, rain, cycleWeather, weather, traffic, sky, renderer, camera, scene, setHour, setWeather, fx, pick, start, toMenu, THREE };
