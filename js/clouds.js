// Real clouds. One field drives them all: the 2D cover map (makeClouds) says where a cloud stands,
// its value how tall it grows, and a small tiling 3D noise carves the billows. The sky raymarches
// that field at reduced size every frame and smooths it over frames; the ground's cloud shadows
// read the same map (CLOUD in flora.js), so a shadow lies under the cloud that casts it. A coarse
// equirect copy goes into the sky texture for water, puddles and the car's reflections.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LIT, CLOUD_TILE } from './flora.js';

// Tiling noise, 32³, two channels: R is value noise rounded off by cells (the billows), G is finer
// cells for the edges.
function noise3D(S) {
  const cells = g => {
    const pts = Float32Array.from({ length: g * g * g * 3 }, Math.random);
    return (x, y, z) => {
      const fx = x * g, fy = y * g, fz = z * g, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      let m = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz, k = ((((cz + g) % g) * g + (cy + g) % g) * g + (cx + g) % g) * 3;
        const ex = cx + pts[k] - fx, ey = cy + pts[k + 1] - fy, ez = cz + pts[k + 2] - fz;
        m = Math.min(m, ex * ex + ey * ey + ez * ez);
      }
      return 1 - Math.min(1, Math.sqrt(m));
    };
  };
  const value = g => {
    const v = Float32Array.from({ length: g * g * g }, Math.random), s = t => t * t * (3 - 2 * t);
    return (x, y, z) => {
      const fx = x * g, fy = y * g, fz = z * g, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), a = s(fx - ix), b = s(fy - iy), c = s(fz - iz);
      const at = (i, j, k) => v[((k % g) * g + j % g) * g + i % g];
      const l = (j, k) => at(ix, j, k) + (at(ix + 1, j, k) - at(ix, j, k)) * a;
      const p = k => l(iy, k) + (l(iy + 1, k) - l(iy, k)) * b;
      return p(iz) + (p(iz + 1) - p(iz)) * c;
    };
  };
  const c4 = cells(4), c8 = cells(8), c16 = cells(16), c32 = cells(32), v4 = value(4), v8 = value(8), v16 = value(16);
  const R = new Float32Array(S * S * S), Gc = new Float32Array(S * S * S);
  for (let z = 0, i = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const px = (x + 0.5) / S, py = (y + 0.5) / S, pz = (z + 0.5) / S;
    const w = c4(px, py, pz) * 0.625 + c8(px, py, pz) * 0.25 + c16(px, py, pz) * 0.125;
    const v = v4(px, py, pz) * 0.55 + v8(px, py, pz) * 0.3 + v16(px, py, pz) * 0.15;
    R[i] = (v + w - 1) / w;
    Gc[i] = c8(px, py, pz) * 0.625 + c16(px, py, pz) * 0.25 + c32(px, py, pz) * 0.125;
  }
  // stretch each channel to the full range, the shader's thresholds assume it
  const span = a => { let lo = Infinity, hi = -Infinity; for (const x of a) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return [lo, hi - lo]; };
  const [rl, rs] = span(R), [gl, gs] = span(Gc), data = new Uint8Array(S * S * S * 2);
  for (let i = 0; i < R.length; i++) { data[i * 2] = (R[i] - rl) / rs * 255; data[i * 2 + 1] = (Gc[i] - gl) / gs * 255; }
  const tex = new THREE.Data3DTexture(data, S, S, S);
  tex.format = THREE.RGFormat; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}

const MARCH = /* glsl */`
  precision highp sampler3D;
  uniform sampler2D uMap, uWxTex, uIceTex; uniform sampler3D uNoise;
  uniform vec3 uSun, uLit, uDark, uLitO, uDarkO, uHaze, uDrift, uFlashP; uniform vec2 uOff, uSlab;
  uniform vec4 uShape;   // cloud base, thickness, cover from, cover to
  uniform vec4 uKind;    // overcast 0..1, extinction per metre, cirrus, haze distance
  uniform vec4 uWxP;     // the weather map (weather.js): origin, 1 / span, any cells at all
  uniform float uFlash, uSlab2;   // how far along a ray the march reaches past the cloud base
  #define CB_N 3
  uniform vec4 uCb[CB_N];         // the nearest storms: x, z, radius, strength (0 when there's none)
  uniform vec4 uCbB[CB_N];        // their noise seed, and how far the anvil has grown
  uniform vec4 uCbC[CB_N];        // a supercell's: 1 if it is one, how organised (meso), the tower's turn, the wall cloud's turn
  uniform vec4 uCbM[CB_N];        // and where its wall cloud hangs, x z, and which way its rain lies from there
  uniform vec2 uCbDir;            // the way the wind aloft blows, so the way anvils reach
  const float TILE = ${CLOUD_TILE}.;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
  // Henyey-Greenstein, scaled so that light scattered evenly comes out as 1
  float hg(float mu, float g) { float g2 = g * g; return (1. - g2) / pow(1. + g2 - 2. * g * mu, 1.5); }
  // The cloud body at height h of its layer: cumulus, a cell's lid or a storm's tower.
  // x: density, y: how far up the cloud p is, z: how grey a rain cell makes it, w: storm
  vec4 bodyAt(vec3 p, float h, float lid, float st, float conv, float rain, bool fine) {
    float n = textureLod(uMap, (p.xz + uOff) / TILE, 0.).r;
    // some stretches of sky grow taller clouds than others
    float macro = textureLod(uMap, (p.xz + uOff) / (TILE * 3.3) + .37, 0.).r;
    // heaped cloud keeps its billows, a flat layer turns into an even sheet
    float lo = mix(uShape.z, .2, lid), oc = max(uKind.x, lid * (1. - .8 * conv));
    float cov = mix(smoothstep(lo, lo + .13, n), .72 + .28 * smoothstep(.3, .7, n), oc);
    // A cumulus is as tall as the cover is deep inside it, so it comes out a dome on a flat base.
    // The height follows a much broader ramp than the outline, or the sides stand up as walls.
    float rise = smoothstep(lo - .02, lo + .3, n);
    float top = min(1., mix(rise * rise * (.35 + .9 * macro), .5 + .5 * macro, oc));
    // a cell's cloud heaps up over the rain it drops (drizzle stays a flat layer); a storm's tower is
    // a shape of its own (towerAt). Rounded off fast and kept low, or the heap comes out a tall pyramid.
    top = mix(top, (.3 + .42 * smoothstep(0., .35, rain)) * (.8 + .2 * macro), smoothstep(0., .4, lid));
    if (h > top) return vec4(0.);
    float d = cov * smoothstep(0., .05, h) * (1. - smoothstep(.35, 1., h / max(top, .01)));
    vec3 q = (p + uDrift) / 1900.;
    float e = (1. - texture(uNoise, q).r) * mix(.62, .35, oc);
    d = clamp((d - e) / (1. - e), 0., 1.);
    if (fine && d > 0.) {
      // billows: the cells bite round bumps out of the sides and the top; a cumulus keeps its flat
      // base, a rain cloud's base gets torn into rolls too
      float f = texture(uNoise, q * 4.3).g * .65 + texture(uNoise, q * 11.).g * .35;
      e = (1. - f) * mix(mix(.2, .55, lid * conv), .72, smoothstep(.05, .4, h));
      d = clamp((d - e) / (1. - e), 0., 1.);
    }
    // z: how grey it is; a heaped cloud keeps white tops in the sun
    return vec4(d, h, lid * (1. - .6 * conv * (1. - st)), st);
  }
  // A storm cloud seen whole, worked out from the storm itself (uCb, set by Clouds.update) rather
  // than read off the 500 m weather map, which blurred it into a symmetric cylinder. One shape: a
  // column of heaps leaning a little downwind as it rises, that near the ceiling spreads into the
  // anvil: a cap more downwind than up. Big heaps push the outline in and out everywhere, so no two
  // sides are alike, and only the skin is bitten into cauliflower.
  // u runs along the wind, w across it, h up the cloud from its base (480 m) to the ceiling (4430 m).
  // x: density, y: how much sky light reaches it (the anvil's underside sits in its own shade)
  // xz turned by a; sampling the noise turned by +a makes what it draws turn anticlockwise from above
  vec2 turn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  float skin(vec3 q, float k) { return texture(uNoise, q / (1800. * k)).r * .7 + texture(uNoise, q / (720. * k)).r * .3; }
  vec2 cbAt(vec3 p, vec4 S, vec4 B, vec4 C, bool fine) {
    vec2 o = p.xz - S.xy;
    // (a supercell's tower stands on its high rain-free base, see cloudAt)
    float sup = C.x, b0 = mix(480., 740., sup), r = S.z, h = (p.y - b0) / (4430. - b0);
    if (S.w <= 0. || h < -.02 || h > 1.1 || dot(o, o) > r * r * mix(9., 13., sup)) return vec2(0.);
    float u = dot(o, uCbDir), w = dot(o, vec2(-uCbDir.y, uCbDir.x));
    u -= r * .3 * h * h;
    vec3 q = p + uDrift;
    float n1 = texture(uNoise, q / 2300. + B.x).r, n2 = texture(uNoise, q / 1000. + B.x).g, n3 = sup > 0. ? .5 : texture(uNoise, q / 430.).g;
    // (a supercell's outline only in broad heaps: the small cells grained its whole tower)
    if (sup > 0.) n2 = texture(uNoise, q / 1700. + B.x).r;
    float bump = (n1 - .5) * .55 + (n2 - .5) * .45 + (n3 - .5) * .25;
    // (a supercell's tower stands nearly straight up: narrowing, its top read as a ball)
    float rc = r * (mix(.74, .8, sup) - mix(.14, .06, sup) * h) * (1. + .3 * (n1 - .5));
    // A supercell's updraft is broad and smooth low down, a "mothership" of plates stacked in a
    // corkscrew: bands rising one step per turn round the tower, turning with it (C.z), so the
    // striations seem to wind upwards. Cauliflower only higher up.
    float low = 0., plate = 1.;
    if (sup > 0.) {
      low = sup * (1. - smoothstep(.1, .5, h));
      float ph = (p.y - b0) / 230. + (atan(-w, u) - C.z) / 6.2832 + n2 * .3;
      plate = smoothstep(.05, .35, fract(ph)) * (1. - smoothstep(.55, .95, fract(ph)));
      // (soft plates: hard ones looked like stacked terraces of geometry)
      rc *= 1. + low * (.12 + .04 * plate);
      bump *= 1. - .55 * low;
    }
    float ext = max(u, 0.);
    // The anvil flares out of the tower from about two thirds up. It is only some two and a half
    // times as wide as the tower (a reference photo: a mushroom cap, a little longer downwind), with
    // round billowed edges; its underside rises a little towards the far end. A supercell's
    // reaches further, upwind too (backshear), and its updraft overshoots higher.
    // (a supercell's anvil is a thinner sheet streaming much further downwind: from the side, a
    // mushroom cap read as a bomb cloud)
    // (a supercell's is a thin flat plate: a thick one read as a mushroom cloud)
    float under = mix(.62, .84, sup) + mix(.12, .05, sup) * clamp(ext / (r * 1.3), 0., 1.);
    float a = B.y * smoothstep(under - .02, under + .12, h);
    float nA = texture(uNoise, q / 5000. + B.x * 3.).r;
    // (the supercell's first cap was far too big: from under it, it filled the sky)
    float Ld = r * mix(1.15, 1.6, sup), Lu = r * mix(.6, .35, sup), Lw = r * mix(.8, .55, sup);
    float R = (u > 0. ? mix(rc, rc + Ld, a) : mix(rc, rc + Lu, a)) * (1. + (nA - .5) * .35 * a);
    float Rw = mix(rc, rc + Lw, a) * (1. + (nA - .5) * .3 * a);
    float qn = length(vec2(u / R, w / Rw));
    // a flat-ish ceiling with rounded heaps on it, domed over the tower where the updraft overshoots
    // (smooth noise for the heaps: the cell channel raised them into cones)
    // (a supercell's overshoot is a rounded dome over the updraft: the plain falloff drew it as a cone)
    float ov = length(vec2(u, w)) / rc;
    float top = 1. + mix(.07 * (1. - min(1., ov)), .07 * sqrt(max(0., 1. - ov * ov / .36)), sup) + (texture(uNoise, q / 1700. + B.x).r - .5) * .07 * a;
    // the cap's rim is rounded off, so it doesn't end in a knife edge
    top -= .1 * a * smoothstep(.6, 1., qn);
    float d = smoothstep(1.08, .8, qn + bump * (1. - mix(.3, .85, sup) * a)) * smoothstep(-.02, .03, h) * (1. - smoothstep(top - .04, top, h));
    // (Mammatus pouches under a supercell's anvil were tried and taken out: at this march's
    // resolution they came out as dark holes and a speckle all over the anvil, 2026-11-04.)
    if (fine && d > 0.) {
      // cauliflower bitten into the skin, the anvil's too; the inside stays solid. A supercell's
      // lower tower turns with it, so its skin is read in turned coordinates there.
      // A supercell's skin is soft broad billows read off the smooth channel, the same kind the
      // cumulus round it are made of: the fine cells came out as a speckle on its rising tower
      // that matched none of the other clouds (seen twice).
      float f = sup > 0. ? skin(q, 1.) : texture(uNoise, q / 620.).g * .6 + texture(uNoise, q / 260.).g * .4;
      if (low > .01) {
        vec3 qr = vec3(S.x, 0., S.y) + vec3(turn(o, C.z), p.y).xzy + vec3(0., uDrift.y, 0.);
        f = mix(f, skin(qr + B.x * 1000., 1.), smoothstep(0., .3, low));
      }
      // (a supercell's anvil is a smoother, flatter sheet than an ordinary storm's cap)
      // (and shallower bites: deep ones lay in shade as dark blotches all over it)
      float e = (1. - f) * mix(.55, .32, sup) * (1. - mix(.3, .8, sup) * a) * (1. - .6 * low);
      d = clamp((d - e) / (1. - e), 0., 1.);
      // the grooves between a mothership's plates lie deep in shade
      d *= 1. - .15 * low * (1. - plate);
      // only the downwind edge frays a little into streaks along the wind
      float fib = texture(uNoise, vec3(u / 4200., h * 3.5, w / 380.) + B.x).r;
      d *= mix(1., smoothstep(.3, .7, fib), .5 * a * smoothstep(.75, 1.05, qn) * step(0., u));
    }
    float shade = mix(h * .6, clamp((h - under) / max(1. - under, .1), 0., 1.), a);
    return vec2(d * S.w, shade);
  }
  // A supercell's wall cloud (C.y how organised it is): a lowered block under the rain-free base at
  // M.xy, wider at the top, its sides stepped in ragged tiers, turning once a minute or so (C.w),
  // with shreds of scud torn off round its foot going round with it. x density, y sky light.
  vec2 wallAt(vec3 p, vec4 S, vec4 B, vec4 C, vec4 M, bool fine) {
    float m = C.y, r = S.z;
    if (m <= 0. || S.w <= 0. || p.y > 790.) return vec2(0.);
    vec2 o = p.xz - M.xy;
    float rw = r * (.11 + .08 * m);
    // the tail cloud: a low band reaching from the wall cloud towards the rain (M.zw), feeding into it
    float al = dot(o, M.zw), ac = dot(o, vec2(-M.w, M.z));
    if (dot(o, o) > rw * rw * 2.6 && (al < 0. || al > rw * 3.2 || abs(ac) > rw * .6)) return vec2(0.);
    vec2 ro = turn(o, C.w);
    float n1 = texture(uNoise, vec3(ro.x, p.y * .7, ro.y) / 900. + B.x * 1.7).r;
    // lumps round its sides, so it isn't a lampshade
    float n2 = texture(uNoise, vec3(ro.x, p.y * .5, ro.y) / 380. + B.x * 2.3).r;
    float bot = 730. - 470. * m + (n1 - .5) * 70. + (n2 - .5) * 50.;
    float k = clamp((p.y - bot) / (770. - bot), 0., 1.);
    // nearly straight sides and a flat foot, a little wider where it meets the base
    float rad = rw * (.84 + .16 * k * k) * (1. + (n1 - .5) * .4 + (n2 - .5) * .3);
    // its sides step out in tiers (a bump that is 0 at both ends of each step, or it shows as a seam),
    // and are scored by ledges winding up round it: they turn with it, which is how you see it rotate
    float tf = fract(k * 2.6 + n1 * 1.3 + n2 * .8);
    rad *= 1. + .06 * smoothstep(.15, .45, tf) * (1. - smoothstep(.65, .95, tf));
    float gf = fract((p.y - bot) / 115. + (atan(-o.y, o.x) - C.w) / 6.2832 * 2. + n1 * 1.2 + n2 * .8);
    // (some ledges stand out, others fade into the side)
    float gk = smoothstep(.45, .8, n2 * .7 + n1 * .5);
    float groove = 1. - gk * (1. - smoothstep(.05, .35, gf) * (1. - smoothstep(.55, .95, gf)));
    rad *= 1. + .045 * groove;
    float l = length(o);
    float d = smoothstep(rad * 1.03, rad * .9, l) * smoothstep(bot - 8., bot + 18., p.y);
    // the tail: narrowing and rising as it goes, its foot a little above the wall cloud's
    float ta = clamp(al / (rw * 3.2), 0., 1.), tw = rw * .5 * (1. - .6 * ta), tb = bot + 70. + 200. * ta;
    float tail = step(0., al) * (1. - smoothstep(.75, 1., ta)) * smoothstep(tw, tw * .6, abs(ac)) * smoothstep(tb - 10., tb + 25., p.y);
    d = max(d, tail * .9);
    if (fine) {
      // heaps and rolls on its sides; they bite deepest at the edge, so the outline is crisp but torn
      float f = texture(uNoise, vec3(ro.x, p.y * 1.4, ro.y) / 260. + B.x).g * .6 + texture(uNoise, vec3(ro.x, p.y * 1.8, ro.y) / 110. + B.x).g * .4;
      float edge = smoothstep(rad * .6, rad, l) + 1. - smoothstep(bot, bot + 60., p.y);
      d = clamp((d - (1. - f) * mix(.25, .6, min(edge, 1.))) / .6, 0., 1.);
      d *= 1. - .4 * (1. - groove) * smoothstep(rad * .78, rad, l);
      // scud: shreds round its foot and a little way out, going round with it
      float sc = texture(uNoise, vec3(ro.x, p.y * 2.2, ro.y) / 170. + B.x * 2.).g;
      float band = smoothstep(rad * 1.5, rad * .95, l) * smoothstep(bot - 190., bot - 60., p.y) * (1. - smoothstep(bot + 10., bot + 70., p.y));
      d = max(d, smoothstep(.62, .86, sc) * band * .85);
    }
    return vec2(d * m * S.w, .04 + .12 * k);
  }
  // everything at p: the body, a storm's tower, and its anvil and shelf cloud
  vec4 cloudAt(vec3 p, bool fine) {
    vec2 wuv = (p.xz - uWxP.xy) * uWxP.z;
    vec4 wx = uWxP.w > 0. ? textureLod(uWxTex, wuv, 0.) : vec4(0.);
    float lid = wx.r, st = smoothstep(.5, 1., wx.b), conv = min(1., wx.b * 2.);
    // under a cell the base comes down and the cloud thickens into a lid
    float base = mix(uShape.x, mix(620., 500., st), lid), thick = mix(uShape.y, 1100., lid);
    // A supercell's base is high and flat all over (else its hanging lumps hide the wall cloud from
    // anyone outside), and flattest over the rain-free base round the updraft (rf), where the wall
    // cloud hangs from it.
    float rf = 0., rw = 0.;
    for (int i = 0; i < CB_N; i++) if (uCbC[i].x > 0.) {
      float e = texture(uNoise, vec3((p.xz + uDrift.xz) / 2200., .37)).r - .5, dc = length(p.xz - uCb[i].xy) / uCb[i].z + e * .25;
      rf = max(rf, uCb[i].w * (1. - smoothstep(.3, .62, dc)));
      rw = max(rw, uCb[i].w * (1. - smoothstep(.9, 1.3, dc)));
    }
    base = mix(base, 760., rw);
    rf = max(rf, rw * .75);
    // the underside of a rain cloud isn't flat: it hangs down in lumps and rolls, deepest under a storm
    if (lid > .01) {
      vec2 bq = (p.xz + uOff) / 2600.;
      float lump = textureLod(uMap, bq + .61, 0.).r * .6 + textureLod(uMap, bq * 3.1 + .23, 0.).r * .4;
      float hang = lid * smoothstep(.3, .75, lump) * mix(mix(90., 180., conv), 300., st) * (1. - rf);
      base -= hang; thick += hang;
    }
    float h = (p.y - base) / thick;
    vec4 res = h < 0. || h > 1. ? vec4(0.) : bodyAt(p, h, lid, st, conv, wx.g, fine);
    // the storm clouds themselves: white up high, dark only low down (w)
    for (int i = 0; i < CB_N; i++) {
      vec2 cb = cbAt(p, uCb[i], uCbB[i], uCbC[i], fine);
      if (cb.x > res.x) res = vec4(cb.x, cb.y, 0., 1.);
      // (the wall cloud is dark grey: it hangs in the shade of the whole storm above it, darker than
      // the base round it, which the horizon lights from below; w over 1 darkens it in the march)
      cb = wallAt(p, uCb[i], uCbB[i], uCbC[i], uCbM[i], fine);
      if (cb.x > res.x) res = vec4(cb.x, cb.y, 1., 1.5);
    }
    // the shelf cloud on a storm's gust front: a layer of its own (see weather.js)
    if (uWxP.w > 0. && p.y < 1200.) {
      vec4 ic = textureLod(uIceTex, wuv, 0.);
      if (ic.a > .01) {
        // The shelf cloud: a wedge along the gust front. Its smooth underside is lowest at the
        // leading edge and rises back to the storm's base; its face steps up in tiers.
        vec3 qs = (p + uDrift) / 900.;
        float sn = texture(uNoise, qs).r, sh = ic.a;
        float bot = 300. + 420. * (1. - sh) + 40. * sn, top = 900. + 160. * sn;
        float tiers = .72 + .28 * smoothstep(.25, .75, fract((p.y - bot) / 110. + sn * .6));
        float sd = smoothstep(.02, .25, sh) * smoothstep(bot, bot + 30., p.y) * (1. - smoothstep(top - 250., top, p.y)) * tiers;
        if (fine && sd > 0.) { float f = texture(uNoise, qs * 3.7).g; sd = clamp((sd - (1. - f) * .3 * smoothstep(bot + 60., top, p.y)) / .7, 0., 1.); }
        if (sd > res.x) res = vec4(sd * .9, (p.y - bot) / (top - bot) * .35, .85, .55);
      }
    }
    return res;
  }
  // how much cloud lies between p and the sun, coarse steps out to about 750 m
  float towardSun(vec3 p) {
    float od = 0., s = 50.;
    for (int i = 0; i < 4; i++) { p += uSun * s; od += cloudAt(p - uSun * s * .5, false).x * s; s *= 2.; }
    return od;
  }
  // rgb: light the clouds add along the ray, a: how much of the sky behind still shows
  vec4 marchClouds(vec3 ro, vec3 rd, float jit, int steps) {
    float horizon = smoothstep(.012, .07, rd.y);
    vec3 L = vec3(0.); float T = 1.;
    if (horizon <= 0.) return vec4(0., 0., 0., 1.);
    float mu = dot(rd, uSun);
    float t0 = max((uSlab.x - ro.y) / rd.y, 0.), t1 = (uSlab.y - ro.y) / rd.y;
    t1 = min(t1, min(t0 + uSlab2, uKind.w * 3.));
    if (t1 > t0) {
      // Long steps through empty sky; on meeting cloud, back up and go on in short ones until the
      // ray has been out of it for a while. Even steps over 24 km left a storm grainy.
      float dtB = (t1 - t0) / float(steps), dtS = max(dtB * .28, 35.), dt = dtB, t = t0 + dtB * jit, dsum = 0., wsum = 0., lsum = 0.;
      int miss = 0;
      // a bright forward lobe for the silver edges, a soft back lobe so the far side isn't flat
      float ph = mix(hg(mu, .72), hg(mu, -.2), .5);
      for (int i = 0; i < 160; i++) {
        if (i >= steps * 3 || T < .03 || t > t1) break;
        vec3 p = ro + rd * t;
        vec4 cl = cloudAt(p, true);
        float d = cl.x;
        if (d > .002 && dt > dtS * 1.5) { t -= dt * .75; dt = dtS; miss = 0; continue; }
        if (d <= .002 && dt < dtB && ++miss > 5) dt = dtB;
        if (d > .002) {
          miss = 0;
          float od = towardSun(p) * uKind.y;
          // multiple scattering: deep inside a cloud the light never quite runs out
          float beer = max(exp(-od), .22 * exp(-od * .15));
          // a wall cloud stands in the shade of the whole storm above it, far more cloud than the
          // short march towards the sun can find: backlit, it is a dark shape, not a glowing one
          if (cl.w > 1.) beer *= .18;
          float h = cl.y;
          // a rain cell's lid is grey whatever the sky round it does, and a storm is darker still
          // (a storm tower is dark only low down: its upper part stands brilliant white in the sun)
          float low = cl.w * (1. - smoothstep(.25, .6, h));
          vec3 lit = mix(uLit, uLitO, cl.z * (1. - smoothstep(.3, .7, h) * cl.w)) * (1. - .55 * low), dark = mix(uDark, uDarkO, cl.z) * (1. - .5 * low);
          // lightning lights the cloud round the strike
          vec2 fd = (p.xz - uFlashP.xy) / 2600.;
          // "powder": the thin skin of a heap facing the sun scatters less back at you than its depths,
          // so the clefts between heaps go darker and a cauliflower shows its shape
          float powder = mix(1., 1. - exp(-d * 5.), .55);
          vec3 S = lit * beer * ph * powder + dark * (.25 + .95 * h * h) + vec3(.75, .8, 1.) * uFlash * (1.5 - h) * exp(-dot(fd, fd)) * 2.;
          // under a lid the daylight comes down through it: thin patches of the base glow, thick rolls stay dark
          S += uLitO * cl.z * .2 * (1. - d) * (1. - d);
          float a = T * (1. - exp(-d * uKind.y * dt));
          // (the haze lies low: a storm, and anything as high as an anvil, shows through it from further)
          L += S * a; dsum += t * a; wsum += a; lsum += max(max(cl.z, cl.w), smoothstep(2000., 4000., p.y)) * a;
          T *= exp(-d * uKind.y * dt);
        }
        t += dt;
      }
      // far clouds sink into the haze; a dark storm stands out of it from much further off
      float f = exp(-(wsum > 0. ? dsum / wsum : t0) / (uKind.w * (1. + 1.6 * (wsum > 0. ? lsum / wsum : 0.))));
      L = mix(uHaze * (1. - T), L, f);
    }
    if (uKind.z > 0.) {
      // cirrus: thin streaks high up, behind everything else
      float tc = (7600. - ro.y) / rd.y;
      vec2 pc = ro.xz + rd.xz * tc + uOff * 1.7;
      vec2 a = vec2(pc.x * .8 + pc.y * .6, pc.y * .8 - pc.x * .6);
      float c = textureLod(uMap, a / vec2(30000., 7000.), 0.).r * .75 + textureLod(uMap, a / vec2(9000., 3600.) + .3, 0.).r * .3;
      c = smoothstep(.5, .85, c) * uKind.z * exp(-tc / 60000.) * .32;
      vec3 S = uLit * (.5 + .5 * hg(mu, .6)) + uDark * .5;
      L += T * S * c; T *= 1. - c;
    }
    return vec4(L * horizon, mix(1., T, horizon));
  }`;
const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
// on screen: one ray per pixel at reduced size, a different step offset each frame, blended with
// last frame's result found by the ray's direction (clouds are too far for the camera's own movement to show)
const SCREEN_FRAG = MARCH + /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tHist; uniform mat3 uCamRot, uPrevInv; uniform vec2 uTan, uPrevTan; uniform vec3 uCam; uniform float uFrame, uHistK; uniform int uSteps;
  void main() {
    vec3 rd = normalize(uCamRot * vec3((vUv * 2. - 1.) * uTan, -1.));
    vec4 c = marchClouds(uCam, rd, ign(gl_FragCoord.xy + uFrame * 5.588), uSteps);
    vec3 pv = uPrevInv * rd;
    if (uHistK > 0. && pv.z < 0.) {
      vec2 uv = pv.xy / -pv.z / uPrevTan * .5 + .5;
      if (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) c = mix(c, texture2D(tHist, uv), uHistK);
    }
    gl_FragColor = c;
  }`;
// the same clouds round the whole sky, for the sky texture everything else reflects
const ENV_FRAG = MARCH + /* glsl */`
  varying vec2 vUv;
  uniform vec3 uCam;
  void main() {
    float lon = (vUv.x - .5) * 6.28318, lat = (vUv.y - .5) * 3.14159;
    vec3 rd = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
    gl_FragColor = marchClouds(uCam, rd, ign(gl_FragCoord.xy), 18);
  }`;

const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const tv2 = new THREE.Vector2();

export class Clouds {
  constructor(renderer, sky) {
    this.renderer = renderer; this.sky = sky;
    // the day's character, rolled on every load: which way the wind blows, how high the bases sit, whether there's cirrus
    const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9;
    this.wind = new THREE.Vector2(Math.cos(a) * s, Math.sin(a) * s);
    this.day = { base: 950 + Math.random() * 750, cirrus: Math.random() < 0.3 ? 0 : 0.3 + Math.random() * 0.7 };
    this.goal = { cover: 0.35, overcast: 0, base: this.day.base, thick: 1500, ext: 0.035 };
    this.cur = { ...this.goal };
    this.U = {
      uMap: { value: sky.cloudMap.tex }, uNoise: { value: noise3D(32) },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color() }, uDark: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
      uLitO: { value: new THREE.Color() }, uDarkO: { value: new THREE.Color() },
      uDrift: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector2() }, uSlab: { value: new THREE.Vector2() }, uSlab2: { value: 9000 },
      uShape: { value: new THREE.Vector4() }, uKind: { value: new THREE.Vector4() }, uFlash: { value: 0 }, uFlashP: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
      uWxTex: LIT.uWxTex, uWxP: LIT.uWxP, uIceTex: LIT.uIceTex,
      uCb: { value: [0, 1, 2].map(() => new THREE.Vector4()) }, uCbB: { value: [0, 1, 2].map(() => new THREE.Vector4()) }, uCbDir: { value: new THREE.Vector2(1, 0) },
      uCbC: { value: [0, 1, 2].map(() => new THREE.Vector4()) }, uCbM: { value: [0, 1, 2].map(() => new THREE.Vector4()) },
    };
    this.wx = null;    // the weather cells (weather.js), set by main
    const rt = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.hist = [rt(), rt()]; this.ping = 0; this.frame = 0; this.histOk = false;
    this.screenM = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SCREEN_FRAG, depthTest: false, depthWrite: false, uniforms: {
      ...this.U, tHist: { value: null }, uCamRot: { value: new THREE.Matrix3() }, uPrevInv: { value: new THREE.Matrix3() },
      uTan: { value: new THREE.Vector2(1, 1) }, uPrevTan: { value: new THREE.Vector2(1, 1) }, uFrame: { value: 0 }, uHistK: { value: 0 }, uSteps: { value: 24 },
    } });
    this.envRT = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, depthBuffer: false });
    this.envM = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: ENV_FRAG, depthTest: false, depthWrite: false, uniforms: this.U });
    this.quad = new FullScreenQuad(this.screenM);
    this.res = 0.5; this.envT = 0; this.sunOff = new THREE.Vector2();
  }
  get texture() { return this.hist[this.ping].texture; }
  setQuality(q) { [this.res, this.steps] = q.cloud; this.screenM.uniforms.uSteps.value = this.steps; }
  // the sky between the rain cells for each weather. A clear spell rolls its own amount of cumulus;
  // the lids and the storms themselves come from the cells.
  setWeather(w) {
    const g = this.goal, d = this.day;
    if (w.storm) Object.assign(g, { cover: 0.45 + Math.random() * 0.2, overcast: 0, base: d.base * 0.85, thick: 1000 + Math.random() * 400, ext: 0.035 });
    else if (w.rain > 0.5) Object.assign(g, { cover: 0.45 + Math.random() * 0.25, overcast: 0.2, base: d.base * 0.8, thick: 800, ext: 0.033 });
    else if (w.rain > 0) Object.assign(g, { cover: 0.7, overcast: 0.45, base: 760, thick: 700, ext: 0.028 });
    else if (w.fog) Object.assign(g, { cover: 0.8, overcast: 0.6, base: 760, thick: 700, ext: 0.024 });
    else Object.assign(g, { cover: 0.08 + Math.random() * 0.55, overcast: 0, base: d.base, thick: 550 + Math.random() * 550, ext: 0.035 });
  }
  // straight to the goal, for a fresh load
  snap() { Object.assign(this.cur, this.goal); this.envT = 0; }
  update(dt, t, rain, fog, flash, camPos) {
    const c = this.cur, g = this.goal, k = 1 - Math.exp(-dt / 30), sky = this.sky, U = this.U;
    for (const key in g) c[key] += (g[key] - c[key]) * k;
    const off = U.uOff.value.copy(this.wind).multiplyScalar(-t);
    U.uDrift.value.set(off.x, -t * 2, off.y);
    const lo = 0.76 - 0.52 * c.cover;
    U.uShape.value.set(c.base, c.thick, lo, lo + 0.13);
    // the march covers every layer in sight: the cumulus, and any lid or storm tower below and above it
    const cells = this.wx?.cells ?? [], storm = cells.some(k => k.storm);
    // (a supercell's wall cloud and the scud under it reach down to some 100 m)
    U.uSlab.value.set(cells.length ? Math.min(c.base, cells.some(k => k.sup) ? 60 : 190) : c.base, Math.max(c.base + c.thick, storm ? 4800 : cells.length ? 1720 : 0));
    // the three storms nearest the camera, drawn whole by cbAt
    const W = this.wind, wl = Math.hypot(W.x, W.y) || 1, wx = this.wx;
    U.uCbDir.value.set(W.x / wl, W.y / wl);
    const near = cells.filter(k => k.storm)
      .sort((a, b) => Math.hypot(a.x - camPos.x, a.z - camPos.z) - Math.hypot(b.x - camPos.x, b.z - camPos.z));
    for (let i = 0; i < 3; i++) {
      const k = near[i], A = U.uCb.value[i], B = U.uCbB.value[i], C = U.uCbC.value[i];
      if (!k) { A.set(0, 0, 0, 0); C.set(0, 0, 0, 0); continue; }
      A.set(k.x, k.z, k.r * (1 + k.asp) * 0.5, wx.env(k));
      B.set(k.seed, THREE.MathUtils.smoothstep(k.age, k.grow * 0.7, k.grow * 1.6) * (1 - THREE.MathUtils.smoothstep(k.age, k.life - k.fade * 0.4, k.life)), 0, 0);
      // a supercell's rotation, and its wall cloud just off the updraft's middle towards the rain
      if (!k.sup) { C.set(0, 0, 0, 0); continue; }
      const [ox, oz] = wx.rainOff(k), ol = Math.hypot(ox, oz);
      C.set(1, wx.meso(k), k.spin, k.spinW);
      U.uCbM.value[i].set(k.x + ox * 0.18, k.z + oz * 0.18, ox / ol, oz / ol);
    }
    // a storm's tower and anvil stretch the march over 4 km of height: more steps, or the thin anvil gets lost between them
    this.screenM.uniforms.uSteps.value = Math.round(this.steps * (storm ? 1.5 : 1));
    // and a storm's anvil is seen from 20 km and more, so the march reaches that far
    U.uSlab2.value = storm ? 24000 : 9000;
    U.uKind.value.set(c.overcast, c.ext, this.day.cirrus * (1 - c.overcast) * (1 - fog), 16000 * (1 - 0.6 * rain) * (1 - 0.6 * fog));
    U.uSun.value.copy(sky.dir);
    const p = sky.preset, o = sky.over;
    U.uLit.value.setRGB(...lerp3(p.litC, o.litC, c.overcast * 0.6), THREE.LinearSRGBColorSpace);
    U.uDark.value.setRGB(...lerp3(p.darkC, o.darkC, c.overcast * 0.6), THREE.LinearSRGBColorSpace);
    U.uLitO.value.setRGB(...o.litC, THREE.LinearSRGBColorSpace);
    U.uDarkO.value.setRGB(...o.darkC, THREE.LinearSRGBColorSpace);
    U.uHaze.value.copy(sky.scene.fog.color);
    U.uFlash.value = flash;
    U.uCam.value.copy(camPos);
    // shadows: the cloud over a spot on the ground stands up the sun's slant from it
    const d = sky.dir, H = c.base + c.thick * 0.2;
    this.sunOff.set(d.x, d.z).multiplyScalar(H / Math.max(0.05, d.y));
    if (this.sunOff.length() > 9000) this.sunOff.setLength(9000);
    const slo = lo - 1.4 * c.overcast;
    LIT.uCloudP.value.set(off.x + this.sunOff.x, off.y + this.sunOff.y, slo, slo + 0.13);
    // a rain cell's lid hangs lower, so its shadow sits closer under it
    tv2.set(d.x, d.z).multiplyScalar(850 / Math.max(0.05, d.y));
    if (tv2.length() > 9000) tv2.setLength(9000);
    LIT.uWxS.value.set(tv2.x, tv2.y, 0.85);
    // the coarse copy for reflections now and then, and the sky texture rebuilt with it
    this.envT -= dt;
    if (this.envT <= 0) {
      this.envT = 1.5;
      this.draw(this.envM, this.envRT);
      sky.cloudEnv = this.envRT.texture;
      sky.mixClouds();
    }
  }
  draw(mat, target) {
    const r = this.renderer;
    this.quad.material = mat; r.setRenderTarget(target); this.quad.render(r);
  }
  // the clouds for this frame, from the camera, at this.res of the scene's size
  render(camera, w, h, tan) {
    const W = Math.max(1, Math.round(w * this.res)), H = Math.max(1, Math.round(h * this.res));
    if (this.hist[0].width !== W || this.hist[0].height !== H) { for (const r of this.hist) r.setSize(W, H); this.histOk = false; }
    const u = this.screenM.uniforms, prev = this.hist[this.ping];
    this.ping ^= 1;
    u.tHist.value = prev.texture;
    u.uHistK.value = this.histOk ? 0.86 : 0;
    u.uPrevInv.value.copy(u.uCamRot.value).transpose(); u.uPrevTan.value.copy(u.uTan.value);
    u.uCamRot.value.setFromMatrix4(camera.matrixWorld); u.uTan.value.copy(tan);
    u.uFrame.value = this.frame++ % 64;
    camera.getWorldPosition(this.U.uCam.value);
    this.draw(this.screenM, this.hist[this.ping]);
    this.histOk = true;
  }
}
