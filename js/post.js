// The scene pass. The world goes into a target with a readable depth buffer, and everything that
// needs depth happens here: contact shadows, ground mist, sun shafts, soft particles, eye adaptation.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LIT, HAZE } from './flora.js';

const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
const DEPTH = /* glsl */`
  #include <packing>
  uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec2 uTan;
  varying vec2 vUv;
  float zOf(float d) { return perspectiveDepthToViewZ(d, uNear, uFar); }
  vec3 viewAt(vec2 uv, float d) { float z = zOf(d); return vec3((uv * 2. - 1.) * uTan * -z, z); }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }`;
const material = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

// Contact shadows at half size: rays around each pixel look for what stands close to it.
const aoFrag = n => DEPTH + /* glsl */`
  const int N = ${n}; const float R = .9;
  void main() {
    float d = texture2D(tDepth, vUv).r;
    gl_FragColor = vec4(1.);
    if (d > .99999) return;
    vec3 p = viewAt(vUv, d);
    float dist = -p.z;
    if (dist < .9 || dist > 90.) return;
    // The surface's facing from the depth of the neighbouring pixels. Far off, at a grazing angle (a road
    // going down a hill), two neighbours can hold the same depth and the cross product comes out zero:
    // normalising that gives 0 on a PC but NaN on an iPhone, and NaN came out as black smudges. No
    // facing, no contact shadow.
    vec3 dx = dFdx(p), dy = dFdy(p);
    // On an edge where the depth jumps (the crest of a hill, with the road beyond it dropping away) the
    // neighbours belong to two surfaces and the facing comes out wrong: the far road was shaded as if
    // buried, a black band across it. More pixels sit on such edges at a low resolution, which is what
    // a hot phone drops to. No contact shadow on an edge.
    if (max(abs(dx.z), abs(dy.z)) > dist * .04) return;
    vec3 cr = cross(dx, dy);
    float cl = length(cr);
    if (!(cl > 1e-12)) return;
    vec3 n = cr / cl;
    if (dot(n, p) > 0.) n = -n;          // always facing the camera
    // seen almost edge-on (the road far ahead, a slope going away) the facing is unreliable: fade out
    float facing = smoothstep(.06, .22, dot(n, -p / dist));
    float a = ign(gl_FragCoord.xy) * 6.283, occ = 0., reach = R / (dist * 2. * uTan.y);
    for (int i = 0; i < N; i++) {
      float t = (float(i) + .5) / float(N), r = sqrt(t) * reach, b = a + float(i) * 2.399;
      vec2 uv = vUv + vec2(cos(b), sin(b)) * r * vec2(uTan.y / uTan.x, 1.);
      vec3 q = viewAt(uv, texture2D(tDepth, uv).r) - p;
      float l = length(q);
      occ += max(dot(n, q / max(l, .001)) - .12, 0.) * (1. - smoothstep(R * .5, R * 1.6, l));
    }
    float ao = 1. - min(1., occ * 2.1 / float(N)) * (1. - smoothstep(55., 90., dist)) * facing;
    gl_FragColor = vec4(vec3(ao >= 0. && ao <= 1. ? ao : 1.), 1.);   // (a stray NaN fails both tests: no shadow)
  }`;
// a 4x4 box that doesn't blur across depth edges
const BLUR_FRAG = DEPTH + /* glsl */`
  uniform sampler2D tAO; uniform vec2 uTexel;
  void main() {
    float z = zOf(texture2D(tDepth, vUv).r), s = 0., w = 0.;
    for (int y = -1; y <= 2; y++) for (int x = -1; x <= 2; x++) {
      vec2 uv = vUv + (vec2(x, y) - .5) * uTexel;
      float k = 1. - smoothstep(.0, 1., abs(zOf(texture2D(tDepth, uv).r) - z) / (1. + abs(z) * .03));
      s += texture2D(tAO, uv).r * k; w += k;
    }
    // A pixel whose depth matches none of its neighbours (a thin strip of far road just over a hill's crest,
    // common at a low resolution) has no weight to average: that used to come out 0, full shade, a black band.
    gl_FragColor = vec4(vec3(w > .05 ? s / w : 1.), 1.);
  }`;
// Sun shafts at quarter size: from each pixel walk towards the sun and count the sky that shows,
// and how much of it the clouds let through, so rays fall through the gaps.
const SHAFT_FRAG = DEPTH + /* glsl */`
  uniform vec2 uSunUv; uniform sampler2D tCloud;
  const int N = 14;
  void main() {
    vec2 step = (uSunUv - vUv) / float(N) * .92;
    vec2 p = vUv + step * ign(gl_FragCoord.xy);
    float s = 0., w = 1.;
    for (int i = 0; i < N; i++) { vec2 q = clamp(p, 0., 1.); s += step(.99995, texture2D(tDepth, q).r) * texture2D(tCloud, q).a * w; p += step; w *= .94; }
    gl_FragColor = vec4(vec3(s / float(N) * (1. - smoothstep(.1, .85, length((uSunUv - vUv) * vec2(uTan.x / uTan.y, 1.))))), 1.);
  }`.replace('vec2 step =', 'vec2 stp =').replace('vUv + step *', 'vUv + stp *').replace('p += step;', 'p += stp;');
const COMPOSE_FRAG = DEPTH + /* glsl */`
  uniform sampler2D tColor, tAO, tShaft, tCloud, tTor, uWxTex, uWindTex, uIceTex;
  uniform mat3 uCamRot; uniform vec3 uCam, uMistCol, uShaftCol, uCurtain, uDustCol, uFogCol; uniform float uAO, uMist, uMistY, uTorOn, uFogD; uniform vec4 uWxP; uniform vec2 uWxOff, uWindOff, uTilt;
  ${HAZE}
  float hash1(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
  float vnoise(float x) { float i = floor(x), f = fract(x); return mix(hash1(i), hash1(i + 1.), f * f * (3. - 2. * f)); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise2(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash2(i), hash2(i + vec2(1., 0.)), f.x), mix(hash2(i + vec2(0., 1.)), hash2(i + 1.), f.x), f.y);
  }
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    float d = texture2D(tDepth, vUv).r;
    // clouds only over the sky: nothing on the ground reaches them
    if (d > .99999) { vec4 cl = texture2D(tCloud, vUv); c = c * cl.a + cl.rgb; }
    if (uAO > .5) {
      // the sky's light is what gets blocked: full sun on a surface mostly survives
      float l = dot(c, vec3(.3, .59, .11));
      c *= mix(texture2D(tAO, vUv).r, 1., smoothstep(.5, 1.8, l) * .6);
    }
    // Under a rain cell's lid the air itself lies in the cloud's shade, so the haze over anything
    // off in that direction is grey, not the bright horizon's colour the scene's fog gave it (it
    // doesn't know the cloud). Only the air's share: the fade into the sky at the land's edge stays.
    // The lid is read at a few spots along the ray. (tornadoFrame in main.js darkens a tornado's own haze the same way.)
    if (uWxP.w > 0. && d < .99999) {
      vec3 vp = viewAt(vUv, d);
      float dist = length(vp), sh = 0.;
      vec3 rd = uCamRot * (vp / dist);
      for (int i = 0; i < 4; i++) sh += textureLod(uWxTex, (uCam.xz + rd.xz * dist * (float(i) + .5) * .25 - uWxP.xy) * uWxP.z, 0.).r;
      c -= hazeAir(dist, uFogD) * smoothstep(.1, .9, sh * .25) * .65 * uFogCol;
      c = max(c, 0.);
    }
    if (uMist > 0.) {
      // mist lying in the low ground, thinning fast with height
      vec3 v = viewAt(vUv, min(d, .9999));
      float dist = min(length(v), 900.);
      vec3 rd = uCamRot * normalize(v);
      float b = .16, h = uCam.y - uMistY, ry = abs(rd.y) < .002 ? .002 : rd.y;
      float m = uMist * exp(-b * h) * (1. - exp(-dist * ry * b)) / ry;
      c = mix(c, uMistCol, 1. - exp(-max(m, 0.)));
    }
    c += uShaftCol * texture2D(tShaft, vUv).r;
    if (uWxP.w > 0.) {
      // Rain shafts under the cells further off. The ray walks the weather map below the cloud base
      // and gathers the rain it passes. Only heavy rain shows as shafts (drizzle is just haze), the
      // shafts break up by a noise that drifts with the clouds, and lighter ones thin out before
      // they reach the ground. Rain close round you is the streaks' and the fog's job.
      // A gust front lifts a low wall of dust off dry land (the wind map's a): gathered the same way,
      // only in the lowest couple of hundred metres, and from much closer.
      vec3 vp = viewAt(vUv, min(d, .9999)), rd = uCamRot * normalize(vp);
      float far = d > .99999 ? 26000. : length(vp);
      if (rd.y > .001) far = min(far, (560. - uCam.y) / rd.y);
      // a different start for every pixel, so the steps never show as rings
      float t = 80. * (1. + .3 * ign(gl_FragCoord.xy)), acc = 0., accD = 0., accH = 0.;
      for (int i = 0; i < 25; i++) {
        if (t > far) break;
        float tn = min(t * 1.3, far);
        vec3 p = uCam + rd * (t + tn) * .5;
        float up = p.y - uMistY;
        if (up < 450.) {
          float dust = textureLod(uWindTex, (p.xz - uWxP.xy) * uWxP.z, 0.).a;
          if (dust > .01) {
            vec2 q = p.xz - uWindOff;
            // billowing: thick low down, its top rising and falling in heaps
            float top = 160. + 290. * vnoise2(q / 380.);
            float puff = smoothstep(.15, .75, vnoise2(q / 140.) * .6 + vnoise2(vec2(q.x / 45., up / 30.)) * .4);
            accD += dust * puff * (1. - smoothstep(top * .35, top, up)) * smoothstep(30., 140., t) * (tn - t);
          }
        }
        // rain falls slanted: what lands here was further upwind the higher up it is
        vec2 ruv = (p.xz + uTilt * p.y - uWxP.xy) * uWxP.z;
        float r = t < 600. ? 0. : textureLod(uWxTex, ruv, 0.).g;
        if (r > .2) {
          float hl = textureLod(uIceTex, ruv, 0.).g;
          vec2 q = p.xz + uWxOff;
          float s = smoothstep(.28, .78, vnoise2(q / 650.) * .62 + vnoise2(q / 190. + 7.) * .38);
          float heavy = smoothstep(.25, .85, r);
          // past the drawn land the ray runs on under the ground: there the shaft reaches the haze line
          if (d > .99999) up = max(up, 170.);
          float bottom = (1. - smoothstep(.5, .9, r)) * 420. * vnoise2(q / 900. + 3.);
          float k = heavy * s * smoothstep(bottom, bottom + 140., up) * (1. - smoothstep(400., 560., p.y));
          float dk = k * smoothstep(600., 1800., t) * (tn - t);
          acc += dk; accH += dk * hl;
        }
        t = tn;
      }
      c = mix(c, uDustCol, clamp(1. - exp(-accD * .0045), 0., .9));
      // fine streaks down the shafts
      float veil = (1. - exp(-acc * .002)) * (.92 + .14 * vnoise(atan(rd.x, rd.z) * 380.));
      // a hail shaft stands out paler and colder than the rain round it
      vec3 cc = mix(uCurtain, uCurtain * 2.4 * vec3(.92, 1., 1.02), clamp(accH / max(acc, 1.), 0., 1.) * .85);
      c = mix(c, cc, clamp(veil, 0., .9));
    }
    // A tornado (tornado.js) was marched against the depth already, so it goes over everything,
    // the mist and the rain shafts behind it included (they are summed out to the sky); its own
    // haze, thicker in rain, stands for the air between.
    if (uTorOn > .5) { vec4 tr = texture2D(tTor, vUv); c = c * tr.a + tr.rgb; }
    gl_FragColor = vec4(c, 1.);
  }`;
const LUM_FRAG = /* glsl */`
  uniform sampler2D tColor; varying vec2 vUv;
  void main() {
    float s = 0.;
    for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) {
      // the upper middle of the screen: that's the road ahead, also from the driver's seat
      vec3 c = texture2D(tColor, vec2(.28 + vUv.x * .44, .42 + vUv.y * .4) + (vec2(x, y) - 1.) * .035).rgb;
      s += dot(c, vec3(.3, .59, .11));
    }
    gl_FragColor = vec4(vec3(sqrt(clamp(s / 9. * .5, 0., 1.))), 1.);
  }`;

export class ScenePass extends Pass {
  constructor(renderer, scene, camera, fx, q) {
    super();
    Object.assign(this, { renderer, scene, camera, fx });
    this.needsSwap = true;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.samples, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
    this.aoRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    this.ao2RT = this.aoRT.clone();
    this.shaftRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    this.lumRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.U = { tDepth: { value: this.rt.depthTexture }, uNear: { value: 0.1 }, uFar: { value: 2600 }, uTan: { value: new THREE.Vector2(1, 1) } };
    this.aoM = material(aoFrag(q.aoN || 9), { ...this.U });
    this.blurM = material(BLUR_FRAG, { ...this.U, tAO: { value: this.aoRT.texture }, uTexel: { value: new THREE.Vector2() } });
    // no clouds yet: the sky shows through everywhere
    this.noCloud = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.noCloud.needsUpdate = true;
    this.shaftM = material(SHAFT_FRAG, { ...this.U, uSunUv: { value: new THREE.Vector2() }, tCloud: { value: this.noCloud } });
    this.compM = material(COMPOSE_FRAG, {
      ...this.U, tColor: { value: this.rt.texture }, tAO: { value: this.ao2RT.texture }, tShaft: { value: this.shaftRT.texture }, tCloud: { value: this.noCloud },
      tTor: { value: this.noCloud }, uTorOn: { value: 0 }, uFogCol: LIT.uFogCol, uFogD: LIT.uFogD,
      uCamRot: { value: new THREE.Matrix3() }, uCam: { value: new THREE.Vector3() }, uMistCol: { value: new THREE.Color() }, uShaftCol: { value: new THREE.Color() },
      uAO: { value: 1 }, uMist: { value: 0 }, uMistY: { value: 0 },
      uWxTex: LIT.uWxTex, uWxP: LIT.uWxP, uCurtain: { value: new THREE.Color() }, uWxOff: { value: new THREE.Vector2() },
      uWindTex: LIT.uWindTex, uWindOff: LIT.uWindOff, uIceTex: LIT.uIceTex, uTilt: { value: new THREE.Vector2() }, uDustCol: { value: new THREE.Color() },
    });
    this.curtain = this.compM.uniforms.uCurtain.value;
    this.dustCol = this.compM.uniforms.uDustCol.value; this.tilt = this.compM.uniforms.uTilt.value;
    this.lumM = material(LUM_FRAG, { tColor: { value: this.rt.texture } });
    this.quad = new FullScreenQuad(this.aoM);
    this.fx.mat.uniforms.uDepth.value = this.rt.depthTexture;
    this.q = q; this.sunV = new THREE.Vector3(); this.frame = 0;
    this.mist = 0; this.mistCol = new THREE.Color(); this.sunCol = new THREE.Color(); this.sunDir = new THREE.Vector3(0, 1, 0); this.shaft = 0;
    this.lum = 0.4; this.lumData = new Uint8Array(4 * 16);
  }
  setQuality(q) {
    this.q = q;
    if ((q.aoN || 9) !== this.aoN) { this.aoM.dispose(); this.aoM = material(aoFrag(q.aoN || 9), { ...this.U }); this.aoN = q.aoN || 9; }
    if (this.rt.samples !== q.samples) { this.rt.samples = q.samples; this.rt.dispose(); }
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.aoRT.setSize(hw, hh); this.ao2RT.setSize(hw, hh); this.shaftRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.blurM.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    this.fx.mat.uniforms.uRes.value.set(1 / w, 1 / h);
  }
  draw(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.quad.render(this.renderer); }
  // Reads the brightness of the picture without stalling: the GPU fills a buffer and we collect it later.
  measure(gl) {
    if (this.sync) {
      const st = gl.clientWaitSync(this.sync, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return;
      gl.deleteSync(this.sync); this.sync = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.lumData); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      let s = 0;
      for (let i = 0; i < 16; i++) { const v = this.lumData[i * 4] / 255; s += v * v * 2; }
      this.lum = s / 16;
    }
    if (this.frame % 12) return;
    this.draw(this.lumM, this.lumRT);
    this.pbo ||= gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 64, gl.STREAM_READ);
    gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }
  render(renderer, writeBuffer) {
    const { scene, camera, q } = this, gl = renderer.getContext(), U = this.U;
    this.frame++;
    camera.updateMatrixWorld();
    // The camera sees layers 0, 1 and 2 (main.js). It is put back to exactly that, never to a saved copy:
    // once a draw failed half way (it happened on an iPhone) a saved mask was the broken one, and from then
    // on the camera saw only particles: no ground, no car, just the clouds and the haze over everything.
    const mask = MAIN_LAYERS;
    camera.layers.disable(2);            // particles come after, with the depth buffer in hand
    try { renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, camera); }
    finally { camera.layers.mask = mask; }

    U.uNear.value = camera.near; U.uFar.value = camera.far;
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    U.uTan.value.set(ty * camera.aspect, ty);
    const C = this.compM.uniforms;
    if (q.ao) { this.draw(this.aoM, this.aoRT); this.draw(this.blurM, this.ao2RT); }
    C.uAO.value = q.ao ? 1 : 0;
    if (this.clouds) {
      this.clouds.render(camera, this.rt.width, this.rt.height, U.uTan.value);
      C.tCloud.value = this.shaftM.uniforms.tCloud.value = this.clouds.texture;
      C.uWxOff.value.copy(this.clouds.U.uOff.value);
    }
    C.uTorOn.value = 0;
    if (this.tornado?.on) { this.tornado.render(camera, this.rt.width, this.rt.height); C.tTor.value = this.tornado.texture; C.uTorOn.value = 1; }
    C.uCamRot.value.setFromMatrix4(camera.matrixWorld); C.uCam.value.copy(camera.position);
    C.uMist.value = this.mist; C.uMistCol.value.copy(this.mistCol); C.uMistY.value = this.mistY || 0;
    // the shafts only exist with the sun in front of us
    C.uShaftCol.value.setRGB(0, 0, 0);
    if (q.shafts) {
      const s = this.sunV.copy(this.sunDir).multiplyScalar(1000).add(camera.position).project(camera), front = this.sunDir.dot(camera.getWorldDirection(tv));
      const vis = (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(s.x), Math.abs(s.y)), 1.0, 1.7)) * THREE.MathUtils.smoothstep(front, 0.1, 0.5);
      if (vis > 0.01 && this.shaft > 0) {
        this.shaftM.uniforms.uSunUv.value.set(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5);
        this.draw(this.shaftM, this.shaftRT);
        C.uShaftCol.value.copy(this.sunCol).multiplyScalar(this.shaft * vis);
      }
    }
    if (!q.shafts || C.uShaftCol.value.r === 0) { renderer.setRenderTarget(this.shaftRT); renderer.clear(); }
    this.draw(this.compM, writeBuffer);
    // dust and smoke go on top, fading out where they would cut into the ground or a car
    const auto = renderer.autoClear, sh = renderer.shadowMap.autoUpdate, fx = this.fx;
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
    fx.mat.uniforms.uNear.value = camera.near; fx.mat.uniforms.uFar.value = camera.far;
    camera.layers.set(2);
    try { renderer.setRenderTarget(writeBuffer); renderer.render(scene, camera); }
    finally { camera.layers.mask = mask; renderer.autoClear = auto; renderer.shadowMap.autoUpdate = sh; }
    if (q.adapt) { this.lumM.uniforms.tColor.value = this.rt.texture; this.measure(gl); }
  }
  dispose() { for (const r of [this.rt, this.aoRT, this.ao2RT, this.shaftRT, this.lumRT]) r.dispose(); this.quad.dispose(); }
}
const tv = new THREE.Vector3();
const MAIN_LAYERS = (1 << 0) | (1 << 1) | (1 << 2);   // the main camera's layers: everything, tufts, particles
