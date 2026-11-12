// Rain: streaks that fall through a box round the camera. Nothing is simulated on the CPU, the
// vertex shader wraps every streak's position with the clock, so a drop costs one instance.
// The wrap keeps every drop at its place in the world, so you drive through them. Two layers: the
// near box (about 15 m round you) and a far one out to about 40 m, with longer streaks.
import * as THREE from 'three';
import { LIT } from './flora.js';

const MAX = 44000, FAR = 1.2;

// hail: the same machine with white stones, falling faster, short and fat, only in the near box
export class Rain {
  constructor(scene, hail = false) {
    this.hail = hail;
    const g = new THREE.InstancedBufferGeometry();
    // two quads per streak: x is across it, y runs from the head (0) to the tail (1). The middle row
    // is where it's brightest; with only the ends the brightness came out zero everywhere.
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
    const seed = new Float32Array(MAX * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(2, -9, 1) }, uRel: { value: new THREE.Vector3() },
        uTime: { value: 0 }, uAmt: { value: 0 }, uBox: { value: 30 }, uRes: { value: new THREE.Vector2(1, 1) }, uCol: { value: new THREE.Color(0.6, 0.65, 0.7) },
        uCarInv: LIT.uCarInv, uCarBox: LIT.uCarBox, uStreak: { value: hail ? 0.007 : 0.05 }, uNear: { value: 0 }, uPx: { value: hail ? 3.2 : 0.9 },
      },
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform vec3 uCam, uVel, uRel; uniform float uTime, uAmt, uBox, uStreak, uNear, uPx; uniform vec2 uRes; uniform mat4 uCarInv; uniform vec2 uCarBox;
        varying float vA, vZ;
        void main() {
          gl_Position = vec4(2., 2., 2., 1.);
          vA = 0.;
          if (aSeed.w > uAmt) return;
          bool far = float(gl_InstanceID) >= uNear;
          vec3 box = far ? vec3(uBox * 2.8, uBox * 1.2, uBox * 2.8) : vec3(uBox, uBox * .7, uBox);
          // the drop's place in the box, sliding down with the wind and wrapped round the camera
          vec3 rel = mod(aSeed.xyz * box + uVel * uTime * (.85 + .3 * aSeed.w) - uCam, box) - box * .5;
          vec3 wp = uCam + rel;
          // none inside the car: the cabin has a roof
          vec3 lc = (uCarInv * vec4(wp, 1.)).xyz;
          if (abs(lc.x) < uCarBox.x && abs(lc.z) < uCarBox.y && lc.y > -1.5 && lc.y < 3.) return;
          // The streak lies along the drop's fall: down and with the wind, so the rain keeps its own
          // slant whichever way you turn. The car's motion only bends it a little (at half, as the
          // eye really sees it, the rain swung round to face you at every turn).
          vec3 fall = uVel - uRel * .12, dir = normalize(fall);
          vec3 tail = wp - dir * uStreak * length(fall) * (.7 + .6 * aSeed.w) * (far ? 2.2 : 1.);
          vec4 c0 = projectionMatrix * viewMatrix * vec4(wp, 1.), c1 = projectionMatrix * viewMatrix * vec4(tail, 1.);
          if (c0.w < .3 || c1.w < .3) return;
          // the quad is built in the world, across the streak as the camera sees it, and widened so it never gets thinner than a pixel or two
          vec3 cr = cross(wp - tail, wp - cameraPosition);
          float crl = length(cr);
          vec3 side = crl > 1e-4 ? cr / crl : vec3(1., 0., 0.);
          float px = uPx * (.7 + .6 * aSeed.y) + 0.7 * (1. - smoothstep(1., 6., c0.w));
          float wpx = 2. * c0.w / (projectionMatrix[1][1] * uRes.y) * px;
          vec3 pos = mix(wp, tail, position.y) + side * position.x * wpx;
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.);
          vZ = gl_Position.w;
          float r = length(rel.xz);
          float fade = far ? smoothstep(uBox * .3, uBox * .5, r) * (1. - smoothstep(box.x * .3, box.x * .5, r)) * 1.2
                           : smoothstep(1., 4., c0.w) * (1. - smoothstep(uBox * .3, uBox * .5, r));
          // a blurred drop: faint, brightest in the middle of its streak
          vA = fade * (far ? .3 + .25 * aSeed.w : .2 + .25 * aSeed.w) * sin(position.y * 3.14159) * (uPx > 2. ? 2.6 : 1.);
        }`,
      // The streaks go on after the clouds, with the dust (layer 2), or the clouds laid over the sky
      // would hide them there. So they test the scene's depth themselves, like the particles do.
      fragmentShader: /* glsl */`
        #include <packing>
        uniform vec3 uCol; uniform sampler2D uDepth; uniform vec2 uDRes; uniform float uDNear, uDFar, uSoft; varying float vA, vZ;
        void main() {
          if (vA < .005) discard;
          if (uSoft > .5 && -perspectiveDepthToViewZ(texture2D(uDepth, gl_FragCoord.xy * uDRes).r, uDNear, uDFar) < vZ) discard;
          gl_FragColor = vec4(uCol, vA);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.layers.set(2);
    scene.add(this.mesh);
    this.count = 0;
  }
  // n streaks in the near box, and the far layer on top of them
  setCount(n) {
    this.near = Math.min(MAX, n); this.count = Math.min(MAX, Math.round(n * (this.hail ? 1 : 1 + FAR)));
    this.mat.uniforms.uNear.value = this.near;
  }
  setSize(w, h) { this.mat.uniforms.uRes.value.set(w, h); }
  // the scene's depth, shared with the particles (fx.js), which ScenePass keeps up to date
  useDepth(u) { Object.assign(this.mat.uniforms, { uDepth: u.uDepth, uDRes: u.uRes, uDNear: u.uNear, uDFar: u.uFar, uSoft: u.uSoft }); }
  // amt 0..1 chooses how many of the streaks are drawn; wind is the horizontal drift of the drops
  update(dt, camera, camVel, amt, wind, col) {
    const u = this.mat.uniforms;
    this.mesh.visible = amt > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.geometry.instanceCount = this.count;
    u.uTime.value += dt;
    u.uAmt.value = amt;
    u.uCam.value.copy(camera.position);
    // faster than a real drop (about 9 m/s): on screen that read as slow, floating rain. Hail falls
    // faster still and the wind moves it less.
    if (this.hail) u.uVel.value.set(wind.x * 0.6, -26 - amt * 8, wind.z * 0.6);
    else u.uVel.value.set(wind.x, -16 - amt * 5, wind.z);
    u.uRel.value.copy(camVel);
    u.uCol.value.copy(col);
  }
}
