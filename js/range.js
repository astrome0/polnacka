// The mountain range seen from afar. The chunks only reach a kilometre or so, and past that the land
// fades into the sky (HAZE in flora.js). The range is four kilometres off and five hundred metres
// high, so one coarse mesh of it stands there from the start. It begins where the drawn land has
// faded out and comes out of the haze over the next few hundred metres, so the two never meet in a
// visible line: near the range the land you drive on is the chunks, beyond them this.
import * as THREE from 'three';
import { height, surface, mountainAt, rangeBox, pineAt, KIND } from './world.js';

const STEP = 45;

export class Range {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.U = { uFade: { value: 900 } };
  }
  // ~13k points of the real land: run it once, after the first frames are out
  build() {
    const B = rangeBox(), nu = Math.ceil(B.lenP * 2 / STEP), nv = Math.ceil(B.lenQ * 2 / STEP);
    const n = (nu + 1) * (nv + 1), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const lin = v => Math.pow(v / 255, 2.2);
    for (let j = 0, k = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
      const p = B.p - B.lenP + i * STEP, q = B.q - B.lenQ + j * STEP;
      const x = B.RC * p - B.RS * q, z = B.RS * p + B.RC * q;
      // the rim sinks below the horizon, so the mesh has no edge to see
      const rim = i === 0 || j === 0 || i === nu || j === nv ? 60 : 0;
      // (a little below the real land: where both are drawn the chunks win)
      pos[k * 3] = x; pos[k * 3 + 1] = height(x, z) - rim - 4; pos[k * 3 + 2] = z;
      const s = surface(x, z);
      let r = lin(s.r), g = lin(s.g), b = lin(s.b);
      // from afar a forest is its crowns, not its floor
      if (s.kind === KIND.FOREST) { const t = 0.8 + ((i * 7 + j * 13) % 5) * 0.06; r = 0.028 * t; g = 0.05 * t; b = 0.026 * t; }
      // and the dwarf pine belt above it a darker, flatter green
      else { const pb = Math.min(1, pineAt(x, z) * 0.75); if (pb > 0) { r += (0.022 - r) * pb; g += (0.04 - g) * pb; b += (0.024 - b) * pb; } }
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
    }
    const idx = new Uint32Array(nu * nv * 6);
    for (let j = 0, o = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.set([a, c, b, b, c, d], o); o += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // bare rock where it's too steep for anything to hold
    const nor = g.attributes.normal.array;
    for (let k = 0; k < n; k++) {
      const steep = Math.min(1, Math.max(0, (0.8 - nor[k * 3 + 1]) / 0.2)) * (mountainAt(pos[k * 3], pos[k * 3 + 2]) > 0 ? 1 : 0);
      col[k * 3] += (0.2 - col[k * 3]) * steep; col[k * 3 + 1] += (0.19 - col[k * 3 + 1]) * steep; col[k * 3 + 2] += (0.17 - col[k * 3 + 2]) * steep;
    }
    g.computeBoundingSphere();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uFade = this.U.uFade;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRw;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRw = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRw; uniform float uFade;')
        .replace('void main() {', 'void main() {\n  float rangeIn = length(vRw.xz - cameraPosition.xz) - uFade;\n  if (rangeIn < 0.) discard;')
        // the air's haze only, over far more than the chunks' edge; and out of the sky where the chunks end
        .replace('#include <fog_fragment>', /* glsl */`
#ifdef USE_FOG
  // (the plain exponential part: the squared term that closes in thick weather would bury it on a clear day)
  float fogAmt = max(1. - exp(-fogNear * vFogDepth * .45), (1. - rangeOn(vRw.xz)) * (1. - smoothstep(0., 520., rangeIn)));
  vec3 fogC = fogColor;
  #if NUM_DIR_LIGHTS > 0
    float fogS = max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0);
    vec3 fogG = directionalLights[0].color;
    fogG = fogG / max(fogG.r, max(fogG.g, fogG.b)) * (fogColor.r + fogColor.g + fogColor.b) * 0.8;
    fogC = mix(fogColor, fogG, pow(fogS, 6.0));
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogAmt);
#endif`);
    };
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  // edge: where the drawn land has faded out into the sky (sky.setEdge)
  update(edge) { this.U.uFade.value = edge * 0.9; }
}
