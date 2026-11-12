// Every texture in the game is drawn here at startup, nothing is downloaded.
import * as THREE from 'three';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const R = (a, b) => a + Math.random() * (b - a);

export function makeDetail() {
  const N = 512, rgba = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4);
  const hgt = new Float32Array(N * N);
  // value noise on a wrapping lattice: the tile repeats with no seam and no stripes
  const lattice = new Float32Array(4096); for (let i = 0; i < 4096; i++) lattice[i] = Math.random();
  const pn = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => lattice[((((a % per) + per) % per) * 131 + (((b % per) + per) % per) * 977 + per * 7) & 4095];
    const p = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx, q = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return p + (q - p) * fy;
  };
  const fb = (u, v, base, oct) => { let s = 0, a = 1, n = 0, per = base; for (let k = 0; k < oct; k++) { s += a * pn(u * per, v * per, per); n += a; a *= 0.55; per *= 2; } return s / n - 0.5; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, n1 = fb(u, v, 8, 5), n2 = fb(u + 0.25, v + 0.5, 4, 4), fine = fb(u, v, 64, 3);
    const p = (j * N + i) * 4;
    hgt[j * N + i] = n1 * 0.7 + fine * 0.6;
    rgba[p] = 128 + n1 * 240 + fine * 90; rgba[p + 1] = 128 + n2 * 300; rgba[p + 2] = 128 + fine * 330; rgba[p + 3] = 255;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const l = hgt[j * N + (i + N - 1) % N], r = hgt[j * N + (i + 1) % N], d = hgt[((j + N - 1) % N) * N + i], u = hgt[((j + 1) % N) * N + i];
    const nx = (l - r) * 7, ny = (d - u) * 7, nl = 1 / Math.sqrt(nx * nx + ny * ny + 1), p = (j * N + i) * 4;
    nrm[p] = (nx * nl * 0.5 + 0.5) * 255; nrm[p + 1] = (ny * nl * 0.5 + 0.5) * 255; nrm[p + 2] = nl * 127 + 128; nrm[p + 3] = 255;
  }
  const mk = data => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
  };
  return { detail: mk(rgba), normal: mk(nrm) };
}

// 4×4 atlas of plant tufts. The greys in the top two rows are tinted by the field colour underneath,
// so tufts always match the ground they stand on; the forest rows keep their own colours.
export function makeCropAtlas() {
  const S = 256, [c, x] = canvas(S * 4, S * 4);
  const cell = (i, j, fn) => { x.save(); x.beginPath(); x.rect(i * S, j * S, S, S); x.clip(); x.translate(i * S, j * S); fn(); x.restore(); };
  const blade = (bx, h, lean, w, col) => {
    x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, S);
    x.quadraticCurveTo(bx + lean * 0.3, S - h * 0.6, bx + lean, S - h); x.stroke();
  };
  // wheat: stalks with bearded heads
  cell(0, 0, () => {
    for (let i = 0; i < 64; i++) {
      const bx = R(20, S - 20), h = R(170, 244), lean = R(-24, 24), v = R(150, 225) | 0;
      blade(bx, h, lean, R(1.1, 2), `rgb(${v * 0.82 | 0},${v * 0.82 | 0},${v * 0.7 | 0})`);
      const tx = bx + lean, ty = S - h;
      x.fillStyle = `rgb(${v + 28},${v + 22},${v})`;
      for (let k = 0; k < 9; k++) { x.beginPath(); x.ellipse(tx + (k % 2 ? 2 : -2), ty + k * 3.2, 2.2, 3.2, 0, 0, 7); x.fill(); }
      x.strokeStyle = `rgba(255,250,225,.7)`; x.lineWidth = 0.8;
      for (let k = 0; k < 8; k++) { x.beginPath(); x.moveTo(tx, ty + k * 3); x.lineTo(tx + R(-11, 11), ty - R(4, 20)); x.stroke(); }
    }
  });
  // rapeseed: green stems, yellow heads
  cell(1, 0, () => {
    for (let i = 0; i < 34; i++) blade(R(12, S - 12), R(130, 230), R(-26, 26), R(2, 3.4), `rgb(${R(140, 175) | 0},${R(170, 205) | 0},${R(80, 110) | 0})`);
    for (let i = 0; i < 520; i++) {
      const v = Math.random(); x.fillStyle = v < 0.72 ? '#fff06a' : v < 0.9 ? '#ffe030' : '#c6c858';
      x.beginPath(); x.arc(R(8, S - 8), R(4, 104) * (1 + Math.random() * 0.25), R(1.6, 3.6), 0, 7); x.fill();
    }
  });
  // young cereal and meadow grass
  const grass = n => () => {
    for (let i = 0; i < n; i++) { const v = R(165, 255) | 0; blade(R(6, S - 6), R(90, 246), R(-46, 46), R(1.4, 3), `rgb(${v},${v},${v * 0.86 | 0})`); }
  };
  cell(2, 0, grass(120));
  cell(3, 0, grass(110));
  // flowers keep their own colours
  cell(0, 1, () => {
    for (let i = 0; i < 44; i++) blade(R(10, S - 10), R(90, 220), R(-24, 24), 2, `rgb(${R(70, 100) | 0},${R(120, 150) | 0},60)`);
    const cols = ['#ffffff', '#f5e04a', '#e8527a', '#8d6fe0', '#ff8a2a', '#fff8d8'];
    for (let i = 0; i < 26; i++) {
      const fx = R(14, S - 14), fy = R(20, 150), col = cols[Math.random() * cols.length | 0], r = R(5, 10);
      x.fillStyle = col; for (let p = 0; p < 6; p++) { const a = p * 1.047; x.beginPath(); x.ellipse(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.72, r * 0.42, a, 0, 7); x.fill(); }
      x.fillStyle = '#f2b81e'; x.beginPath(); x.arc(fx, fy, r * 0.5, 0, 7); x.fill();
    }
  });
  // fern
  cell(1, 1, () => {
    for (let f = 0; f < 7; f++) {
      const a = R(-1.1, 1.1), len = R(150, 235);
      for (let t = 0; t < 1; t += 0.05) {
        const px = S / 2 + Math.sin(a) * len * t, py = S - Math.cos(a) * len * t + t * t * 60, w = (1 - t) * 40 + 3;
        x.strokeStyle = `rgb(${R(120, 160) | 0},${R(190, 235) | 0},${R(90, 125) | 0})`; x.lineWidth = 3.4;
        x.beginPath(); x.moveTo(px - w, py - 5); x.lineTo(px, py); x.lineTo(px + w, py - 5); x.stroke();
      }
    }
  });
  // stubble
  cell(2, 1, () => { for (let i = 0; i < 90; i++) { const v = R(190, 255) | 0, bx = R(4, S - 4); blade(bx, R(90, 200), R(-10, 10), R(2.5, 5), `rgb(${v},${v * 0.93 | 0},${v * 0.74 | 0})`); } });
  // tall verge grass with seed heads
  cell(3, 1, () => {
    for (let i = 0; i < 80; i++) {
      const bx = R(8, S - 8), h = R(120, 248), lean = R(-34, 34), v = R(170, 250) | 0;
      blade(bx, h, lean, R(1.6, 3.2), `rgb(${v},${v},${v * 0.8 | 0})`);
      if (i % 3 === 0) { x.fillStyle = `rgb(${v},${v * 0.95 | 0},${v * 0.75 | 0})`; x.beginPath(); x.ellipse(bx + lean, S - h, 3, 13, lean * 0.01, 0, 7); x.fill(); }
    }
  });

  // rows 2 and 3: forest undergrowth, all in its own colours (drawn with the raw flag)
  const leaf = (lx, ly, len, wid, a, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(lx, ly, len, wid, a, 0, 7); x.fill(); };
  const g = (r0, r1, g0, g1, b0, b1) => `rgb(${R(r0, r1) | 0},${R(g0, g1) | 0},${R(b0, b1) | 0})`;
  // blueberry: a low thicket of thin green stems, small oval leaves, a few dark berries
  cell(0, 2, () => {
    for (let i = 0; i < 46; i++) {
      const bx = R(10, S - 10), h = R(70, 150), lean = R(-30, 30);
      blade(bx, h, lean, 1.6, g(70, 100, 110, 140, 40, 60));
      for (let k = 0; k < 7; k++) { const t = R(0.25, 1); leaf(bx + lean * t * t + R(-9, 9), S - h * t, R(5, 8), R(3, 4.5), R(0, 3), g(40, 80, 100, 150, 30, 55)); }
    }
    for (let i = 0; i < 26; i++) { x.fillStyle = Math.random() < 0.7 ? '#1d2440' : '#3a3f6a'; x.beginPath(); x.arc(R(14, S - 14), R(S - 140, S - 40), R(2.4, 3.6), 0, 7); x.fill(); }
  });
  // bramble: arching dark canes with leaves in threes
  cell(1, 2, () => {
    for (let i = 0; i < 9; i++) {
      const bx = R(20, S - 20), h = R(120, 220), lean = R(-110, 110);
      x.strokeStyle = g(80, 105, 50, 70, 50, 65); x.lineWidth = 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx, S); x.quadraticCurveTo(bx + lean * 0.2, S - h, bx + lean, S - h * 0.45); x.stroke();
      for (let k = 1; k < 8; k++) {
        const t = k / 8, px = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * (bx + lean * 0.2) + t * t * (bx + lean), py = (1 - t) * (1 - t) * S + 2 * (1 - t) * t * (S - h) + t * t * (S - h * 0.45);
        const col = g(35, 70, 80, 120, 30, 50), a = R(0, 6.28);
        for (let q = -1; q <= 1; q++) leaf(px + Math.cos(a + q) * 10, py + Math.sin(a + q) * 10, 11, 6, a + q, col);
      }
    }
  });
  // nettles: upright stems with pairs of toothed, pointed leaves
  cell(2, 2, () => {
    for (let i = 0; i < 16; i++) {
      const bx = R(16, S - 16), h = R(150, 240);
      blade(bx, h, R(-10, 10), 2.6, g(70, 95, 100, 130, 45, 60));
      for (let k = 0; k < 6; k++) {
        const y = S - h * (0.3 + k * 0.12), sz = 18 - k * 2.2, col = g(40, 70, 95, 130, 30, 50);
        for (const sd of [-1, 1]) {
          x.fillStyle = col; x.beginPath(); x.moveTo(bx, y);
          for (let p = 0; p <= 6; p++) { const t = p / 6; x.lineTo(bx + sd * (Math.sin(t * Math.PI) * sz * 0.8 + t * sz * 1.1) + (p % 2 ? sd * 2.5 : 0), y - t * sz * 0.5 + (p % 2 ? 2.5 : 0)); }
          x.closePath(); x.fill();
        }
      }
    }
  });
  // forest grass: fine dark blades arching over
  cell(3, 2, () => { for (let i = 0; i < 130; i++) blade(R(30, S - 30), R(60, 170), R(-80, 80), R(1, 2), g(55, 95, 95, 140, 35, 60)); });
  // bracken: one tall stalk with broad, pale fronds
  cell(0, 3, () => {
    for (let f = 0; f < 4; f++) {
      const bx = R(60, S - 60), h = R(170, 240), lean = R(-40, 40);
      blade(bx, h, lean, 3, g(110, 140, 120, 150, 50, 70));
      for (let t = 0.3; t < 1; t += 0.06) {
        const px = bx + lean * t * t, py = S - h * t, w = (1 - t) * 70 + 10, col = g(95, 140, 140, 185, 45, 75);
        for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) leaf(px + sd * w * (k + 0.5) / 6, py + (k / 6) * 10, w / 9, 4, sd * 0.3, col);
      }
    }
  });
  // spruce sapling: a little stem with drooping tiers
  cell(1, 3, () => {
    const bx = S / 2, h = 236;
    blade(bx, h, 0, 4, '#4a3624');
    for (let t = 0.15; t < 1; t += 0.035) {
      const y = S - h * t, w = (1 - t) * 92 + 6;
      for (let k = 0; k < 14; k++) { const sx = R(-w, w); x.strokeStyle = g(30, 55, 65, 95, 35, 55); x.lineWidth = 2; x.beginPath(); x.moveTo(bx, y); x.lineTo(bx + sx, y + Math.abs(sx) * 0.3 + R(0, 6)); x.stroke(); }
    }
  });
  // dead twigs and a few brown leaves lying in a low tangle
  cell(2, 3, () => {
    for (let i = 0; i < 28; i++) {
      const y0 = R(S - 60, S - 4), x0 = R(10, S - 10), len = R(40, 120), a = R(-0.4, 0.4);
      x.strokeStyle = g(70, 100, 52, 72, 34, 46); x.lineWidth = R(1.5, 4); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * len, y0 - Math.sin(a) * len * 0.3); x.stroke();
    }
    for (let i = 0; i < 40; i++) leaf(R(8, S - 8), R(S - 50, S - 4), R(5, 9), R(3, 5), R(0, 3), g(120, 160, 75, 105, 35, 50));
  });
  // wood anemone and sorrel: a low mat of clover-like leaves with white flowers
  cell(3, 3, () => {
    for (let i = 0; i < 60; i++) {
      const bx = R(8, S - 8), h = R(30, 90);
      blade(bx, h, R(-12, 12), 1.4, g(90, 120, 130, 160, 60, 80));
      const col = g(60, 95, 120, 165, 40, 65);
      for (let q = 0; q < 3; q++) leaf(bx + Math.cos(q * 2.1) * 6, S - h + Math.sin(q * 2.1) * 5, 7, 6, q * 2.1, col);
    }
    for (let i = 0; i < 22; i++) {
      const fx = R(14, S - 14), fy = R(S - 110, S - 40);
      x.fillStyle = '#f6f4ee'; for (let p = 0; p < 6; p++) { const a = p * 1.047; leaf(fx + Math.cos(a) * 4.5, fy + Math.sin(a) * 4.5, 4.4, 2.6, a, '#f6f4ee'); }
      x.fillStyle = '#e8c33a'; x.beginPath(); x.arc(fx, fy, 2, 0, 7); x.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// 2×2 foliage atlas: beech spray, spruce bough, birch spray, oak spray.
export function makeLeafAtlas() {
  const S = 512, [c, x] = canvas(S * 2, S * 2);
  const leaf = (px, py, a, l, w, col) => { x.fillStyle = col; x.save(); x.translate(px, py); x.rotate(a); x.beginPath(); x.moveTo(-l, 0); x.quadraticCurveTo(0, -w, l, 0); x.quadraticCurveTo(0, w, -l, 0); x.fill(); x.restore(); };
  // loose clumps of leaves with holes between them, so a card never reads as a disc
  const spray = (ci, cj, n, l, w, cols) => {
    x.save(); x.beginPath(); x.rect(ci * S, cj * S, S, S); x.clip(); x.translate(ci * S, cj * S);
    const clumps = [];
    for (let i = 0; i < 17; i++) { const a = Math.random() * 6.283, r = Math.pow(Math.random(), 0.7) * S * 0.4; clumps.push([S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, R(S * 0.05, S * 0.13)]); }
    for (let i = 0; i < n; i++) {
      const c = clumps[i % clumps.length], a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * c[2];
      leaf(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, Math.random() * 6.283, R(l * 0.8, l * 1.2), R(w * 0.8, w * 1.2), cols[Math.random() * cols.length | 0]);
    }
    x.restore();
  };
  spray(0, 0, 1100, 12, 7, ['#6fae3a', '#86c244', '#5a9a32', '#9fd356', '#4d8a2e']);
  x.save(); x.beginPath(); x.rect(S, 0, S, S); x.clip(); x.translate(S, 0);
  // spruce bough: drooping main rib with needle-covered side twigs
  for (let b = 0; b < 26; b++) {
    const bx = S / 2 + R(-S * 0.46, S * 0.46), by = R(10, S * 0.8);
    x.strokeStyle = '#3d2c1e'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + R(-30, 30), by + R(90, 200)); x.stroke();
    for (let n = 0; n < 150; n++) {
      const t = Math.random(), px = bx + R(-40, 40) * (1 - t * 0.6), py = by + t * 190;
      x.strokeStyle = ['#1f4a2c', '#2b5d35', '#183f27', '#3a7040'][n % 4]; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + R(-13, 13), py + R(4, 15)); x.stroke();
    }
  }
  x.restore();
  spray(0, 1, 1000, 9, 5.5, ['#a4c850', '#8dbb45', '#bcd860', '#79a83e']);
  spray(1, 1, 1100, 13, 8, ['#4f8a2e', '#3f7a2a', '#68a23a', '#346a26', '#7cb244']);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeBark(kind) {
  const W = 256, H = 512, [c, x] = canvas(W, H);
  if (kind === 'birch') {
    x.fillStyle = '#e8e4da'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(30,28,26,${R(.5, .95)})`; x.fillRect(R(0, W), R(0, H), R(12, 60), R(1.5, 6)); }
    for (let i = 0; i < 200; i++) { x.fillStyle = 'rgba(120,112,100,.18)'; x.fillRect(R(0, W), R(0, H), R(4, 26), 1); }
  } else if (kind === 'beech') {
    x.fillStyle = '#8b887c'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) { const v = R(95, 170) | 0; x.fillStyle = `rgba(${v},${v - 4},${v - 14},.32)`; x.beginPath(); x.ellipse(R(0, W), R(0, H), R(4, 26), R(3, 18), 0, 0, 7); x.fill(); }
    for (let i = 0; i < 18; i++) { x.fillStyle = 'rgba(60,92,46,.28)'; x.beginPath(); x.ellipse(R(0, W), R(0, H), R(14, 52), R(20, 80), 0, 0, 7); x.fill(); }
  } else {
    x.fillStyle = '#4a372a'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 620; i++) {
      const v = R(26, 112) | 0; x.strokeStyle = `rgb(${v},${v * 0.76 | 0},${v * 0.58 | 0})`; x.lineWidth = R(1.5, 6);
      const px = R(0, W), py = R(0, H); x.beginPath(); x.moveTo(px, py); x.lineTo(px + R(-9, 9), py + R(14, 70)); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

export function makeWood() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#6d5138'; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 8; k++) {
    const y = k * 32, v = R(0.72, 1.12);
    x.fillStyle = `rgb(${112 * v | 0},${83 * v | 0},${56 * v | 0})`; x.fillRect(0, y, 256, 30);
    for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(40,26,14,${R(.1, .34)})`; x.beginPath(); x.moveTo(0, y + R(0, 30)); x.bezierCurveTo(80, y + R(0, 30), 170, y + R(0, 30), 256, y + R(0, 30)); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function makeBale() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#c8ab62'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { const v = R(130, 240) | 0; x.strokeStyle = `rgba(${v},${v * 0.82 | 0},${v * 0.42 | 0},.6)`; x.lineWidth = R(.8, 2); const px = R(0, 256), py = R(0, 256), a = R(-.45, .45); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 34, py + Math.sin(a) * 34); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function makeTiles() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#6f2f1f'; x.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const v = R(0.74, 1.14), ox = j % 2 ? 11 : 0;
    x.fillStyle = `rgb(${172 * v | 0},${74 * v | 0},${46 * v | 0})`;
    x.beginPath(); x.roundRect(i * 21.4 + ox - 11, j * 21.4 + 1, 20, 20, [0, 0, 8, 8]); x.fill();
    x.fillStyle = 'rgba(40,16,8,.3)'; x.fillRect(i * 21.4 + ox - 11, j * 21.4 + 18, 20, 3);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export function makeRock() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#8c8a82'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) { const v = R(70, 170) | 0; x.fillStyle = `rgba(${v},${v},${v - 6},.28)`; x.beginPath(); x.ellipse(R(0, 256), R(0, 256), R(3, 26), R(2, 16), R(0, 3), 0, 7); x.fill(); }
  for (let i = 0; i < 22; i++) { x.fillStyle = 'rgba(92,120,62,.36)'; x.beginPath(); x.ellipse(R(0, 256), R(0, 256), R(14, 48), R(10, 32), 0, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// Tiling cloud cover for the sky's clouds and their shadows (clouds.js). The values stay readable
// so the car can ask what's overhead.
export function makeClouds() {
  // one tile is CLOUD_TILE (8 km): the coarsest cells are about 1 km, the size of a cumulus
  const N = 512, v = new Float32Array(N * N), rgba = new Uint8Array(N * N * 4);
  for (const [cells, amp] of [[8, 0.5], [16, 0.27], [32, 0.15], [64, 0.08]]) {
    const g = new Float32Array(cells * cells).map(() => Math.random()), step = N / cells;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const fx = i / step, fy = j / step, x0 = Math.floor(fx), y0 = Math.floor(fy), a = fx - x0, b = fy - y0, u = a * a * (3 - 2 * a), w = b * b * (3 - 2 * b);
      const at = (x, y) => g[(y % cells) * cells + (x % cells)];
      v[j * N + i] += amp * (at(x0, y0) * (1 - u) * (1 - w) + at(x0 + 1, y0) * u * (1 - w) + at(x0, y0 + 1) * (1 - u) * w + at(x0 + 1, y0 + 1) * u * w);
    }
  }
  for (let p = 0; p < N * N; p++) { rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = v[p] * 255; rgba[p * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(rgba, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, data: v, N };
}

// Bridge asphalt: repeats every 12 m along the road, with the same lines as the ground shader.
export function makeDeck() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#5f5f61'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2600; i++) { const g = 72 + Math.random() * 46 | 0; x.fillStyle = `rgba(${g},${g},${g + 2},.5)`; x.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  x.fillStyle = '#b9b9b2';
  const px = 256 / 10.5;
  for (const m of [5.25 - 4.1, 5.25 + 4.1]) x.fillRect(m * px - 1.4, 0, 2.8, 512);
  x.fillRect(5.25 * px - 1.4, 0, 2.8, 512 * 0.42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

export function softDot() {
  const [c, x] = canvas(128, 128);
  for (let i = 0; i < 26; i++) {
    const px = 64 + R(-26, 26), py = 64 + R(-26, 26), r = R(16, 40), g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

// Dashboard dial face. Angle convention: 0 of max sits at -135°, max sits at +135°.
export function dialFace(label, max, step, sub, redFrom) {
  const S = 512, [c, x] = canvas(S, S), m = S / 2;
  x.fillStyle = '#0b0c0f'; x.beginPath(); x.arc(m, m, m - 4, 0, 7); x.fill();
  x.strokeStyle = '#51555e'; x.lineWidth = 8; x.beginPath(); x.arc(m, m, m - 8, 0, 7); x.stroke();
  const ang = v => (-225 + (v / max) * 270) * Math.PI / 180;
  if (redFrom != null) { x.strokeStyle = '#d43026'; x.lineWidth = 22; x.beginPath(); x.arc(m, m, m - 42, ang(redFrom), ang(max)); x.stroke(); }
  x.font = '600 46px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f2f4f7';
  for (let v = 0; v <= max + 1e-6; v += sub) {
    const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    x.strokeStyle = '#f2f4f7'; x.lineWidth = major ? 7 : 3;
    x.beginPath(); x.moveTo(m + Math.cos(a) * (m - 24), m + Math.sin(a) * (m - 24)); x.lineTo(m + Math.cos(a) * (m - (major ? 56 : 42)), m + Math.sin(a) * (m - (major ? 56 : 42))); x.stroke();
    if (major) x.fillText(String(Math.round(v)), m + Math.cos(a) * (m - 104), m + Math.sin(a) * (m - 104));
  }
  x.font = '500 30px Arial'; x.fillStyle = '#9aa0ab'; x.fillText(label, m, m + 118);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function plateTexture(text) {
  const [c, x] = canvas(256, 56);
  x.fillStyle = '#f4f5f0'; x.fillRect(0, 0, 256, 56); x.fillStyle = '#1f4ea8'; x.fillRect(0, 0, 22, 56);
  x.fillStyle = '#16181c'; x.font = '700 40px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 140, 29);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
