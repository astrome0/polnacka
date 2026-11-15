// Bakes chunks off the main thread: heights, normals, albedo, crop tufts, scattered objects.
import { CHUNK, KIND, OBJ, SUN_AZ, height, heightMesh, surface, objects, hash2, noise, roadAt, waterAt, bridges, forestType, forestClearing, trackDist, FOREST } from './world.js';

const SHADE = { [OBJ.BEECH]: [7, 0.45], [OBJ.SPRUCE]: [4.5, 0.42], [OBJ.BIRCH]: [3.8, 0.28], [OBJ.OAK]: [9, 0.5], [OBJ.BUSH]: [3, 0.34], [OBJ.BARN]: [7, 0.4], [OBJ.HOUSE]: [6.5, 0.4], [OBJ.CHURCH]: [10, 0.4] };
// tuft placement per surface: [atlas cell, height, width, chance]
const TUFT = {
  [KIND.WHEAT]: [0, 0.98, 1.05, 1], [KIND.RAPE]: [1, 1.2, 1.15, 1], [KIND.GREEN]: [2, 0.42, 0.95, 1],
  [KIND.MEADOW]: [3, 0.42, 1.0, 0.95], [KIND.STUBBLE]: [6, 0.2, 0.9, 0.85], [KIND.VERGE]: [3, 0.62, 1.0, 1], [KIND.FOREST]: [5, 0.78, 1.35, 0.86], [KIND.BANK]: [3, 0.95, 1.2, 1],
};
// forest undergrowth per forest type (world.js FOREST): [atlas cell, height, width, own colours, weight].
// A null cell leaves the spot bare. Cells 8+ are the forest rows of the atlas.
const FLOOR = [
  // spruce: blueberry carpets, forest grass, some fern, the odd sapling
  [[8, 0.36, 0.95, 1, 44], [11, 0.34, 0.9, 1, 12], [5, 0.7, 1.25, 0, 14], [13, 0.95, 0.62, 1, 4], [14, 0.14, 1.1, 1, 6], [null, 0, 0, 0, 20]],
  // beech and oak: fern, bracken, nettles and bramble where it's lighter, anemones in spring
  [[5, 0.8, 1.35, 0, 26], [12, 1.05, 1.5, 1, 10], [10, 0.9, 0.8, 1, 10], [9, 0.62, 1.45, 1, 11], [15, 0.24, 0.85, 1, 10], [11, 0.32, 0.9, 1, 6], [14, 0.14, 1.1, 1, 6], [13, 0.9, 0.6, 1, 3], [null, 0, 0, 0, 18]],
  // birch grove: tall grass and meadow grass with fern, bramble, blueberry and flowers
  [[7, 0.72, 1.1, 0, 28], [3, 0.46, 1.0, 0, 16], [5, 0.72, 1.25, 0, 12], [9, 0.56, 1.35, 1, 8], [8, 0.34, 0.95, 1, 9], [4, 0.5, 0.95, 1, 5], [15, 0.24, 0.85, 1, 8], [null, 0, 0, 0, 14]],
  // a glade inside any forest: grass and flowers, a little fern and bramble at the edges
  [[3, 0.48, 1.0, 0, 30], [7, 0.75, 1.1, 0, 22], [4, 0.52, 0.95, 1, 18], [15, 0.24, 0.85, 1, 8], [9, 0.56, 1.35, 1, 8], [12, 0.95, 1.4, 1, 6], [null, 0, 0, 0, 8]],
].map(list => { const sum = list.reduce((a, e) => a + e[4], 0); let acc = 0; return list.map(e => ({ cell: e[0], h: e[1], w: e[2], raw: e[3], to: (acc += e[4]) / sum })); });

function hasWater(ox, oz) {
  for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) if (waterAt(ox + i * CHUNK / 8, oz + j * CHUNK / 8).on) return true;
  return false;
}
// One sheet per chunk at the level of the nearest stream, kept only where it can show.
function waterSheet(ox, oz, n, h, W, shade, texN) {
  const V = n + 1, cell = CHUNK / n, pos = new Float32Array(V * V * 3), attr = new Float32Array(V * V * 4), sh = new Float32Array(V * V), wet = new Uint8Array(V * V);
  let any = false;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const p = j * V + i, t = waterAt(ox + i * cell, oz + j * cell), y = h[(j + 1) * W + i + 1];
    pos[p * 3] = i * cell; pos[p * 3 + 2] = j * cell;
    sh[p] = shade[Math.min(texN - 1, j * texN / n | 0) * texN + Math.min(texN - 1, i * texN / n | 0)];
    if (!t.on) { pos[p * 3 + 1] = y - 1; attr[p * 4] = -1; continue; }
    // a dip well past the bank is not a pool
    const depth = t.edge > 1.5 ? Math.min(-0.2, t.lvl - y) : t.lvl - y;
    pos[p * 3 + 1] = t.lvl; attr[p * 4] = depth; attr[p * 4 + 1] = t.fx * t.sp; attr[p * 4 + 2] = t.fz * t.sp; attr[p * 4 + 3] = t.foam;
    if (depth > 0) { wet[p] = 1; any = true; }
  }
  if (!any) return null;
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    if (wet[a] || wet[b] || wet[c] || wet[d]) idx.push(a, c, b, b, c, d);
  }
  return { pos, attr, sh, idx: new Uint32Array(idx) };
}
// Bridge slices swept along the road: a concrete trough, asphalt laid in it, steel rails.
function deckMesh(segs) {
  const top = [], con = [], rail = [], topUv = [];
  const quad = (o, a, b, c, d) => o.push(...a, ...c, ...b, ...b, ...c, ...d);
  const at = (s, off, up) => { const t = (off + 5.7) / 11.4, y = s.yl + (s.yr - s.yl) * t; return [s.l[0] + (s.r[0] - s.l[0]) * t, y + up, s.l[1] + (s.r[1] - s.l[1]) * t]; };
  const prism = (o, a, b, list, closed) => {
    for (let i = 0; i + 1 < list.length + (closed ? 1 : 0); i++) {
      const p = list[i], q = list[(i + 1) % list.length];
      quad(o, at(a, p[0], p[1]), at(a, q[0], q[1]), at(b, p[0], p[1]), at(b, q[0], q[1]));
    }
  };
  const SECTION = [[-5.7, -0.75], [-5.7, 0.24], [-5.25, 0.24], [-5.25, 0.03], [5.25, 0.03], [5.25, 0.24], [5.7, 0.24], [5.7, -0.75]];
  const FLAT = [[-5.7, -0.75], [-5.7, 0.03], [5.7, 0.03], [5.7, -0.75]];
  for (const s of segs) {
    const { a, b } = s;
    if (s.wall) {
      // a creek's culvert: the headwall it disappears into, flush with the verge
      const x = s.wall * 6.1;
      prism(con, a, b, [[x - 0.17, -2.6], [x + 0.17, -2.6], [x + 0.17, 0.26], [x - 0.17, 0.26]], true);
      continue;
    }
    prism(con, a, b, s.flat ? FLAT : SECTION, true);
    const w = s.flat ? 5.7 : 5.25, A = at(a, -w, 0.05), B = at(a, w, 0.05), C = at(b, -w, 0.05), D = at(b, w, 0.05);
    quad(top, A, B, C, D);
    // two decks overlap in a junction, so there both are bare asphalt with no paint to fight over
    if (s.flat) topUv.push(0.25, 0.8, 0.25, 0.8, 0.25, 0.8, 0.25, 0.8, 0.25, 0.8, 0.25, 0.8);
    else topUv.push(0, a.along / 12, 0, b.along / 12, 1, a.along / 12, 1, a.along / 12, 0, b.along / 12, 1, b.along / 12);
    for (const sd of [-1, 1]) {
      if (sd < 0 ? s.openL : s.openR) continue;
      const x = sd * 5.47;
      prism(rail, a, b, [[x - 0.03, 0.72], [x + 0.03, 0.72], [x + 0.03, 1.02], [x - 0.03, 1.02]], true);
      const c = { l: a.l, r: a.r, yl: a.yl, yr: a.yr }, e = { l: a.l.map((v, i) => v + (b.l[i] - v) * 0.04), r: a.r.map((v, i) => v + (b.r[i] - v) * 0.04), yl: a.yl, yr: a.yr };
      prism(rail, c, e, [[x - 0.05, 0.2], [x + 0.05, 0.2], [x + 0.05, 1.02], [x - 0.05, 1.02]], true);
    }
    // piers across the stream every few slices
    if (s.pier != null) {
      const top0 = (a.yl + a.yr) / 2 - 0.7, low = s.pier - 0.5, mx = (a.l[0] + a.r[0] + b.l[0] + b.r[0]) / 4, mz = (a.l[1] + a.r[1] + b.l[1] + b.r[1]) / 4;
      const ax = (a.r[0] - a.l[0]) / 11.4, az = (a.r[1] - a.l[1]) / 11.4, fx = (b.l[0] - a.l[0]) / 3, fz = (b.l[1] - a.l[1]) / 3;
      const c = (u, v, y) => [mx + ax * u + fx * v, y, mz + az * u + fz * v];
      for (const [u0, v0, u1, v1] of [[-4.4, 0.4, 4.4, 0.4], [4.4, 0.4, 4.4, -0.4], [4.4, -0.4, -4.4, -0.4], [-4.4, -0.4, -4.4, 0.4]]) quad(con, c(u0, v0, low), c(u1, v1, low), c(u0, v0, top0), c(u1, v1, top0));
    }
  }
  return { top: new Float32Array(top), uv: new Float32Array(topUv), con: new Float32Array(con), rail: new Float32Array(rail) };
}

function bake(cx, cz, near, lite) {
  const ox = cx * CHUNK, oz = cz * CHUNK, wet = hasWater(ox, oz);
  // narrow streams need a finer mesh than open fields do
  const gridN = near ? (wet && !lite ? 128 : 64) : (wet ? 32 : 16), texN = near ? 256 : 64; // (a phone: no extra-fine mesh along streams)
  const cell = CHUNK / gridN;
  const V = gridN + 1, total = V * V + 4 * V;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  // one extra ring of samples outside the chunk keeps normals continuous over the borders
  const W = V + 2, h = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) h[j * W + i] = heightMesh(ox + (i - 1) * cell, oz + (j - 1) * cell);
  let n = 0;
  const vert = (i, j, drop) => {
    const y = h[(j + 1) * W + i + 1];
    const dx = h[(j + 1) * W + i + 2] - h[(j + 1) * W + i], dz = h[(j + 2) * W + i + 1] - h[j * W + i + 1];
    const l = 1 / Math.sqrt(dx * dx + dz * dz + 4 * cell * cell);
    pos[n * 3] = i * cell; pos[n * 3 + 1] = y - drop; pos[n * 3 + 2] = j * cell;
    nor[n * 3] = -dx * l; nor[n * 3 + 1] = 2 * cell * l; nor[n * 3 + 2] = -dz * l;
    uv[n * 2] = i / gridN; uv[n * 2 + 1] = j / gridN; n++;
  };
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) vert(i, j, 0);
  for (let k = 0; k < V; k++) { vert(k, 0, 5); vert(k, gridN, 5); vert(0, k, 5); vert(gridN, k, 5); }

  const tex = new Uint8Array(texN * texN * 4), kinds = new Uint8Array(texN * texN), crops = new Uint8Array(texN * texN);
  // mud for the ground shader (near chunks only): r cover, g standing water, b rut depth
  const mudT = near ? new Uint8Array(texN * texN * 4) : null;
  let anyMud = false;
  const d = CHUNK / texN;
  for (let j = 0; j < texN; j++) for (let i = 0; i < texN; i++) {
    const s = surface(ox + (i + 0.5) * d, oz + (j + 0.5) * d, true), p = j * texN + i;
    if (mudT && s.mudV > 0.01) { anyMud = true; mudT[p * 4] = s.mudV * 255; mudT[p * 4 + 1] = s.pud * 255; mudT[p * 4 + 2] = s.rut * 255; }
    tex[p * 4] = Math.min(255, s.r); tex[p * 4 + 1] = Math.min(255, s.g); tex[p * 4 + 2] = Math.min(255, s.b); tex[p * 4 + 3] = 0;
    kinds[p] = s.panel && s.kind === KIND.PATH ? KIND.PANEL : s.kind; crops[p] = s.crop > 0.5 ? 1 : 0;
  }

  // soft shade from standing things, stretched away from the low sun
  const all = objects(cx, cz, 26), sx = -Math.sin(SUN_AZ), sz = -Math.cos(SUN_AZ);
  const shade = new Float32Array(texN * texN).fill(1);
  for (const o of all) {
    const def = SHADE[o.type]; if (!def) continue;
    const r = def[0] * o.s, len = r * 1.6;
    const px = (o.x + sx * len * 0.7 - ox) / d, pz = (o.z + sz * len * 0.7 - oz) / d, R = (r + len) / d;
    const i0 = Math.max(0, Math.floor(px - R)), i1 = Math.min(texN - 1, Math.ceil(px + R));
    const j0 = Math.max(0, Math.floor(pz - R)), j1 = Math.min(texN - 1, Math.ceil(pz + R));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ax = (i - px) * d, az = (j - pz) * d;
      const al = ax * sx + az * sz, ac = ax * sz - az * sx;
      const q = (al * al) / ((r + len * 0.7) * (r + len * 0.7)) + (ac * ac) / (r * r);
      if (q < 1) shade[j * texN + i] *= 1 - def[1] * (1 - q) * (1 - q);
    }
  }
  for (let p = 0; p < texN * texN; p++) {
    const v = Math.max(0.62, shade[p]);
    tex[p * 4] *= v; tex[p * 4 + 1] *= v; tex[p * 4 + 2] *= v;
  }

  const msg = { pos, nor, uv, tex, kinds, near, gridN, texN };
  const list = [pos.buffer, nor.buffer, uv.buffer, tex.buffer, kinds.buffer];
  if (anyMud) { msg.mud = mudT; list.push(mudT.buffer); }
  if (wet) {
    const sheet = waterSheet(ox, oz, gridN, h, W, shade, texN);
    if (sheet) { msg.water = sheet; list.push(sheet.pos.buffer, sheet.attr.buffer, sheet.sh.buffer, sheet.idx.buffer); }
    const segs = bridges(cx, cz);
    if (segs.length) {
      msg.deck = deckMesh(segs);
      list.push(msg.deck.top.buffer, msg.deck.uv.buffer, msg.deck.con.buffer, msg.deck.rail.buffer);
      // the rails stop a car like a row of very short posts
      for (const s of segs) if (!s.wall) for (const sd of [0, 1]) for (const t of [0.25, 0.75]) {
        if (sd ? s.openR : s.openL) continue;
        const q = sd ? [s.a.r, s.b.r] : [s.a.l, s.b.l], back = sd ? [s.a.l, s.b.l] : [s.a.r, s.b.r], k = 0.2 / 11.4;
        const x = q[0][0] + (q[1][0] - q[0][0]) * t, z = q[0][1] + (q[1][1] - q[0][1]) * t;
        all.push({ type: OBJ.RAIL, x: x + (back[0][0] - q[0][0]) * k, z: z + (back[0][1] - q[0][1]) * k, s: 1, rot: 0, own: true });
      }
    }
  }
  msg.objects = all.filter(o => o.own).map(o => ({ type: o.type, x: o.x, z: o.z, s: o.s, rot: o.rot, tint: o.tint, key: o.key, prev: o.prev, wire: o.wire && [o.wire[0], height(o.wire[0], o.wire[1]), o.wire[1]], y: height(o.x, o.z) }));

  if (near) {
    // distance field for the road paint: it interpolates to a sharp line at any resolution
    const RN = 129, field = new Float32Array(RN * RN * 4), o = {};
    let any = false;
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
      roadAt(ox + i, oz + j, o);
      const p = (j * RN + i) * 4, c = Math.min(1, Math.max(0, (o.cross - 5.5) / 2));
      field[p] = Math.max(-30, Math.min(30, o.d)); field[p + 1] = o.along; field[p + 3] = 1;
      // the signed distance flips where the nearest road changes, so paint is only allowed close to one
      field[p + 2] = Math.abs(o.d) < 7 ? c * c * (3 - 2 * c) : 0;
      if (Math.abs(o.d) < 10) any = true;
      // under a bridge the stream bed gets no road lines
      if (wet && Math.abs(o.d) < 7) { const t = waterAt(ox + i, oz + j); if (t.on && t.kind === 1 && t.edge < 7) field[p] = 30; }
    }
    if (any) { msg.road = field; list.push(field.buffer); }

    // Small things on the forest floor: stumps anywhere, mushrooms in a band beside the tracks,
    // cones under the spruces. [x, y, z, kind, rotation, scale]; kinds are DETAIL in terrain.js.
    // bare: 1.6 m cells where mushrooms stand, kept free of undergrowth so they can be seen
    const det = [], stumps = [], bare = new Set();
    for (let j = 0.8; j < CHUNK; j += 1.6) for (let i = 0.8; i < CHUNK; i += 1.6) {
      const tx = Math.min(texN - 1, i / d | 0), tz = Math.min(texN - 1, j / d | 0);
      if (kinds[tz * texN + tx] !== KIND.FOREST) continue;
      const wx = ox + i, wz = oz + j, hr = hash2(Math.floor(wx / 1.6) + 4417, Math.floor(wz / 1.6) - 991), hs = hash2(Math.floor(wx / 1.6) - 71, Math.floor(wz / 1.6) + 3301);
      const px = i + (hs - 0.5) * 1.2, pz = j + (hr - 0.5) * 1.2, y = sampleH(h, W, px, pz, CHUNK / gridN), rot = hs * 6.283;
      if (hr < 0.0035) { det.push(px, y, pz, 4, rot, 0.8 + hs * 0.5); stumps.push(px, pz); continue; }
      const td = trackDist(wx, wz), ft = forestType(wx, wz);
      // mushrooms come up in clusters, a few metres off the track where people would find them
      if (td > 2.6 && td < 10 && hr < 0.1 && noise(wx * 0.15 + 5, wz * 0.15 - 2) > 0.1) {
        const fly = ft === FOREST.BROAD ? 0.15 : 0.4;
        bare.add(Math.floor(i / 1.6) * 1000 + Math.floor(j / 1.6));
        for (let k = 0, n = 1 + (hs * 3 | 0); k < n; k++) det.push(px + (hash2(k, i) - 0.5) * 0.7, y, pz + (hash2(j, k) - 0.5) * 0.7, hs < fly ? 1 : 0, rot + k, 1.25 + hash2(k + 5, j) * 0.8);
        continue;
      }
      if (ft === FOREST.SPRUCE && td < 16 && hr < 0.1) for (let k = 0; k < 3; k++) det.push(px + (hash2(k, j) - 0.5) * 1.2, y, pz + (hash2(i, k) - 0.5) * 1.2, 2, rot + k * 2.1, 1.2 + hash2(k, i + j) * 0.5);
    }
    if (det.length) { msg.details = new Float32Array(det); list.push(msg.details.buffer); }

    const patches = [], PN = 4, PS = CHUNK / PN, step = 0.56;
    for (let pj = 0; pj < PN; pj++) for (let pi = 0; pi < PN; pi++) {
      const a = [];
      const N = Math.round(PS / step);
      for (let jj = 0; jj < N; jj++) for (let ii = 0; ii < N; ii++) {
        const gx = pi * PS + (ii + hash2(ii + pi * 99 + cx * 1000, jj + pj * 77 + cz * 1000)) * step;
        const gz = pj * PS + (jj + hash2(jj + pi * 31 + cx * 777, ii + pj * 53 - cz * 555)) * step;
        const tx = Math.min(texN - 1, gx / d | 0), tz = Math.min(texN - 1, gz / d | 0), p = tz * texN + tx;
        if (!crops[p]) continue;
        const t = TUFT[kinds[p]]; if (!t) continue;
        const r = hash2(ii * 3 + 5 + pi * 41, jj * 7 + pj * 13 + cx - cz);
        if (r > t[3]) continue;
        let cell = t[0], hgt = t[1], wid = t[2], raw = 0;
        if (kinds[p] === KIND.FOREST) {
          if (bare.has(Math.floor(gx / 1.6) * 1000 + Math.floor(gz / 1.6))) continue;
          // plants grow in carpets: a slow noise picks the species, a little jitter blurs the borders
          const wx = ox + gx, wz = oz + gz, list = FLOOR[forestClearing(wx, wz) > 0.26 ? 3 : forestType(wx, wz)];
          const u = Math.min(0.999, Math.max(0, noise(wx * 0.085 + 7, wz * 0.085 - 3) * 0.75 + 0.5 + (hash2(ii * 13 + pi, jj * 17 + pj) - 0.5) * 0.22));
          const e = list.find(f => u < f.to) || list[list.length - 1];
          if (e.cell == null) continue;
          cell = e.cell; hgt = e.h; wid = e.w; raw = e.raw;
        }
        // wild flowers in the meadows and along the margins
        else if ((kinds[p] === KIND.MEADOW || kinds[p] === KIND.VERGE) && r < 0.09) { cell = 4; raw = 1; hgt *= 1.25; }
        else if ((kinds[p] === KIND.VERGE || kinds[p] === KIND.BANK) && r < 0.2) { cell = 7; raw = 0; hgt *= 1.3; }
        // now and then a tuft that got away: taller, some of it gone to seed
        else if (kinds[p] === KIND.MEADOW || kinds[p] === KIND.VERGE || kinds[p] === KIND.GREEN) {
          const q = hash2(ii * 29 + pi * 7 + cx, jj * 31 + pj * 3 - cz);
          if (q < (kinds[p] === KIND.GREEN ? 0.04 : 0.16)) { hgt *= 1.5 + q * 6; if (kinds[p] !== KIND.GREEN && q < 0.07) cell = 7; }
          // and the meadow itself stands in uneven patches, a few metres across
          else if (kinds[p] !== KIND.GREEN) hgt *= 0.75 + 0.5 * Math.min(1, Math.max(0, noise((ox + gx) * 0.18 + 3, (oz + gz) * 0.18) + 0.5));
        }
        // iA = xyz + raw-colour flag, iB = rotation seed, height, width, atlas cell
        a.push(gx, sampleH(h, W, gx, gz, CHUNK / gridN), gz, raw ? 99 : 0, r * 40, hgt * (0.82 + r * 0.45), wid * (0.8 + r * 0.5), cell);
      }
      // fern grows up round the stumps
      for (let s = 0; s < stumps.length; s += 2) {
        const sx = stumps[s], sz = stumps[s + 1];
        if (sx < pi * PS || sx >= (pi + 1) * PS || sz < pj * PS || sz >= (pj + 1) * PS) continue;
        for (let k = 0; k < 6; k++) {
          const ang = k * 1.047 + hash2(k, s), rr = 0.45 + hash2(s, k) * 0.45, fx = sx + Math.cos(ang) * rr, fz = sz + Math.sin(ang) * rr;
          const q = hash2(k + 9, s + 3);
          a.push(fx, sampleH(h, W, fx, fz, CHUNK / gridN), fz, 0, q * 40, 0.7 + q * 0.3, 1.2 + q * 0.3, 5);
        }
      }
      // shuffle so a shorter draw count thins the patch evenly
      const cnt = a.length / 8;
      for (let k = cnt - 1; k > 0; k--) {
        const m = Math.floor(hash2(k, pi * 7 + pj) * (k + 1));
        for (let q = 0; q < 8; q++) { const t = a[k * 8 + q]; a[k * 8 + q] = a[m * 8 + q]; a[m * 8 + q] = t; }
      }
      const f = new Float32Array(a);
      patches.push({ data: f, x: pi * PS + PS / 2, z: pj * PS + PS / 2 });
      list.push(f.buffer);
    }
    msg.patches = patches;
  }
  return { msg, list };
}
function sampleH(h, W, x, z, c) {
  const fx = x / c + 1, fz = z / c + 1, i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
  const v = (ii, jj) => h[Math.min(W - 1, jj) * W + Math.min(W - 1, ii)];
  return (v(i, j) * (1 - a) + v(i + 1, j) * a) * (1 - b) + (v(i, j + 1) * (1 - a) + v(i + 1, j + 1) * a) * b;
}

self.onmessage = e => {
  const { id, cx, cz, near, lite } = e.data;
  const { msg, list } = bake(cx, cz, near, lite);
  self.postMessage({ id, cx, cz, ...msg }, list);
};
