// Four cars. Bodies are lofted from cross-sections so every panel is a real dense sheet that can
// dent, and each door, hood and bumper is its own mesh that can come off. Model space: +Z is
// forward, Y=0 is the ground at ride height.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dialFace, plateTexture } from './textures.js';

// ---- spec sheets ----------------------------------------------------------------------------
const st = (z, low, mid, w, belt, wb, top, wt) => ({ z, low, mid, w, belt, wb, top, wt });

export const CARS = [
  {
    id: 'rally', name: 'Fénix R5', tag: 'Rallye hatchback', blurb: 'Lehký, 4×4, skáče přes pole jako koza.',
    paint: 0xc8141e, roughness: 0.3, plate: 'PLE 4X4', trim: 0x14161a, kind: 'hatch', hwRoll: true,
    stations: [
      st(-1.96, 0.42, 0.6, 0.6, 0.76, 0.54, 0.8, 0.4), st(-1.92, 0.34, 0.62, 0.8, 0.88, 0.72, 0.96, 0.5), st(-1.78, 0.27, 0.62, 0.86, 0.95, 0.8, 1.13, 0.58),
      st(-1.32, 0.25, 0.62, 0.88, 0.97, 0.82, 1.4, 0.62), st(-0.3, 0.25, 0.62, 0.9, 0.97, 0.83, 1.45, 0.64), st(0.34, 0.25, 0.62, 0.9, 0.96, 0.83, 1.43, 0.63),
      st(1.04, 0.25, 0.62, 0.9, 0.93, 0.82, 0.98, 0.68), st(1.72, 0.26, 0.6, 0.87, 0.8, 0.76, 0.83, 0.62), st(1.92, 0.3, 0.56, 0.77, 0.7, 0.65, 0.72, 0.5), st(1.98, 0.38, 0.54, 0.6, 0.62, 0.5, 0.64, 0.36),
    ],
    marks: { cowl: 1.04, roofF: 0.34, roofR: -1.32, tail: -1.78, doorF: 0.84, doorR: -0.52, bumpF: 1.76, bumpR: -1.8, pillars: [[-0.56, -0.44]], hoodEnd: 1.92 },
    wheel: { r: 0.33, w: 0.26, knobby: true, rim: 0xe6e8ea, spokes: 6 }, axle: { f: 1.28, r: -1.3 }, track: 0.8,
    eye: [0.36, 1.16, -0.3], wheelPos: [0.36, 0.91, 0.24], dashZ: 0.92,
    phys: { mass: 1180, comY: 0.5, I: [1800, 2200, 620], k: 34000, c: 3600, travel: 0.26, torque: 420, redline: 7600, idle: 950, gears: [3.3, 2.2, 1.6, 1.22, 0.96, 0.78], final: 4.1, drive: 'awd', mu: 1.08, nitro: 1.0, brake: 2600, top: 58, offroad: 1, mudGrip: 0.5, mudDig: 1, mudRes: 1.6, mudSink: 1 },
  },
  {
    id: 'pickup', name: 'Buvol 4×4', tag: 'Pracovní pickup', blurb: 'Těžký, vysoký a nenechá se zastavit bahnem.',
    paint: 0x2a5d4a, roughness: 0.42, plate: '4B4 HNOJ', trim: 0x24262a, kind: 'pickup',
    stations: [
      st(-2.72, 0.66, 0.92, 0.86, 1.2, 0.84, 1.24, 0.72), st(-2.68, 0.56, 0.95, 0.96, 1.26, 0.94, 1.3, 0.8), st(-2.4, 0.54, 0.96, 1.0, 1.28, 0.98, 1.32, 0.84),
      st(-0.72, 0.54, 0.96, 1.0, 1.28, 0.98, 1.32, 0.84), st(-0.66, 0.54, 0.96, 1.0, 1.3, 0.96, 1.86, 0.74), st(0.1, 0.54, 0.96, 1.0, 1.3, 0.95, 1.92, 0.76), st(0.74, 0.54, 0.96, 1.0, 1.3, 0.95, 1.88, 0.75),
      st(1.46, 0.54, 0.96, 1.0, 1.26, 0.94, 1.36, 0.82), st(2.3, 0.56, 0.94, 0.97, 1.2, 0.9, 1.26, 0.76), st(2.54, 0.6, 0.9, 0.92, 1.1, 0.84, 1.16, 0.66), st(2.6, 0.68, 0.88, 0.8, 1.02, 0.72, 1.06, 0.54),
    ],
    marks: { cowl: 1.46, roofF: 0.74, roofR: -0.66, tail: -0.72, doorF: 1.22, doorR: -0.42, bumpF: 2.34, bumpR: -2.42, pillars: [[-0.48, -0.32]], hoodEnd: 2.54, bed: [-2.5, -0.74] },
    wheel: { r: 0.44, w: 0.32, knobby: true, rim: 0x2c2e33, spokes: 6 }, axle: { f: 1.62, r: -1.62 }, track: 0.9,
    eye: [0.42, 1.62, 0.02], wheelPos: [0.42, 1.27, 0.58], dashZ: 1.28,
    phys: { mass: 2150, comY: 0.84, I: [4800, 5400, 1500], k: 46000, c: 6000, travel: 0.32, torque: 680, redline: 5200, idle: 750, gears: [3.9, 2.4, 1.6, 1.15, 0.86], final: 3.9, drive: 'awd', mu: 1.1, nitro: 0.8, brake: 4600, top: 46, offroad: 1.05, mudGrip: 0.55, mudDig: 0.9, mudRes: 1.4, mudSink: 1 },
  },
  {
    id: 'monster', name: 'Goliáš', tag: 'Monster truck', blurb: 'Přejede cokoliv. Fakt cokoliv. Stromy taky.',
    paint: 0xe07a12, roughness: 0.34, plate: 'NE', trim: 0x16171a, kind: 'pickup', lift: 1.0, scale: 1,
    stations: [
      st(-2.62, 0.62, 0.92, 0.9, 1.2, 0.86, 1.24, 0.72), st(-2.58, 0.54, 0.95, 1.0, 1.26, 0.96, 1.3, 0.8), st(-2.3, 0.52, 0.96, 1.04, 1.28, 1.0, 1.32, 0.84),
      st(-0.72, 0.52, 0.96, 1.04, 1.28, 1.0, 1.32, 0.84), st(-0.66, 0.52, 0.96, 1.04, 1.3, 0.98, 1.82, 0.76), st(0.1, 0.52, 0.96, 1.04, 1.3, 0.97, 1.88, 0.78), st(0.74, 0.52, 0.96, 1.04, 1.3, 0.97, 1.84, 0.77),
      st(1.4, 0.52, 0.96, 1.04, 1.26, 0.96, 1.36, 0.84), st(2.2, 0.54, 0.94, 1.0, 1.2, 0.92, 1.26, 0.78), st(2.44, 0.58, 0.9, 0.94, 1.1, 0.86, 1.16, 0.66), st(2.5, 0.66, 0.88, 0.82, 1.02, 0.72, 1.06, 0.54),
    ],
    marks: { cowl: 1.4, roofF: 0.74, roofR: -0.66, tail: -0.72, doorF: 1.2, doorR: -0.42, bumpF: 2.28, bumpR: -2.34, pillars: [[-0.48, -0.32]], hoodEnd: 2.44, bed: [-2.42, -0.74] },
    wheel: { r: 0.88, w: 0.62, knobby: true, rim: 0xc9ccd0, spokes: 8, big: true }, axle: { f: 1.76, r: -1.76 }, track: 1.26,
    eye: [0.42, 1.62, 0.02], wheelPos: [0.42, 1.27, 0.58], dashZ: 1.26,
    phys: { mass: 4300, comY: 1.5, I: [9800, 11000, 5000], k: 62000, c: 9000, travel: 0.72, torque: 2100, redline: 5400, idle: 760, gears: [3.4, 2.1, 1.4, 1.0], final: 3.9, drive: 'awd', mu: 1.24, nitro: 0.7, brake: 9000, top: 40, offroad: 1.15, mudGrip: 0.8, mudDig: 0.8, mudRes: 2.7, mudSink: 0.4 },
  },
  {
    id: 'sport', name: 'Střela GT', tag: 'Supersport', blurb: 'Na silnici raketa. V poli naprostá katastrofa.',
    paint: 0x1d4fb4, roughness: 0.18, plate: 'RYCHLE', trim: 0x101114, kind: 'coupe', stripe: 0xf0f1ee,
    stations: [
      st(-2.2, 0.36, 0.56, 0.72, 0.72, 0.62, 0.76, 0.46), st(-2.14, 0.26, 0.58, 0.92, 0.82, 0.84, 0.88, 0.6), st(-1.82, 0.19, 0.6, 1.0, 0.86, 0.9, 0.93, 0.66),
      st(-1.22, 0.17, 0.58, 1.0, 0.84, 0.86, 1.02, 0.58), st(-0.44, 0.17, 0.52, 0.97, 0.8, 0.82, 1.2, 0.56), st(0.12, 0.17, 0.5, 0.95, 0.78, 0.8, 1.17, 0.55),
      st(0.92, 0.17, 0.52, 0.94, 0.72, 0.84, 0.76, 0.72), st(1.72, 0.18, 0.5, 0.96, 0.6, 0.84, 0.63, 0.68), st(2.08, 0.2, 0.42, 0.86, 0.49, 0.72, 0.51, 0.52), st(2.2, 0.26, 0.36, 0.64, 0.38, 0.52, 0.4, 0.36),
    ],
    marks: { cowl: 0.92, roofF: 0.12, roofR: -0.44, tail: -1.82, doorF: 0.66, doorR: -0.6, bumpF: 1.84, bumpR: -1.98, pillars: [], hoodEnd: 2.12, slope: true },
    wheel: { r: 0.345, w: 0.31, rim: 0xb8bcc4, spokes: 5 }, axle: { f: 1.36, r: -1.36 }, track: 0.85,
    eye: [0.38, 0.93, -0.5], wheelPos: [0.38, 0.69, 0.0], dashZ: 0.62,
    phys: { mass: 1420, comY: 0.42, I: [2300, 2900, 620], k: 60000, c: 6000, travel: 0.13, torque: 760, redline: 8200, idle: 1000, gears: [3.1, 2.15, 1.65, 1.3, 1.05, 0.86, 0.7], final: 3.6, drive: 'rwd', mu: 1.32, nitro: 1.2, brake: 5200, top: 96, offroad: 0.56, mudGrip: 0.05, mudDig: 2.2, mudRes: 2.2, mudSink: 1.5 },
  },
  {
    // an old Land Rover / UAZ-style field car: flat panels, an upright screen, round lamps, the spare on
    // the bonnet and a canvas tilt over the back. Soft springs, weak dampers and a high centre of mass,
    // so it leans and rocks; slow, but the long gears and grip pull it through mud.
    id: 'kamzik', name: 'Kamzík', tag: 'Veterán 4×4', blurb: 'Starý, měkký a houpe se jak loďka. V bahně nemá konkurenci.',
    paint: 0x4f5b3a, roughness: 0.55, plate: 'KMZ 1965', trim: 0x1a1b1d, kind: 'pickup', maxKmh: 140,
    stations: [
      st(-2.0, 0.6, 0.84, 0.78, 1.04, 0.77, 1.06, 0.72), st(-1.97, 0.52, 0.86, 0.84, 1.1, 0.83, 1.12, 0.78), st(-1.8, 0.5, 0.86, 0.85, 1.1, 0.84, 1.12, 0.8),
      st(-0.64, 0.5, 0.86, 0.85, 1.1, 0.84, 1.12, 0.8), st(-0.58, 0.5, 0.86, 0.85, 1.12, 0.83, 1.86, 0.74), st(0.0, 0.5, 0.86, 0.85, 1.12, 0.83, 1.9, 0.75), st(0.5, 0.5, 0.86, 0.85, 1.12, 0.83, 1.88, 0.75),
      st(0.66, 0.5, 0.86, 0.85, 1.12, 0.83, 1.18, 0.76), st(1.6, 0.52, 0.86, 0.84, 1.1, 0.82, 1.16, 0.74), st(1.86, 0.56, 0.84, 0.8, 1.06, 0.78, 1.1, 0.7), st(1.92, 0.62, 0.82, 0.72, 1.0, 0.7, 1.02, 0.6),
    ],
    marks: { cowl: 0.66, glassTo: 0.62, roofF: 0.5, roofR: -0.58, tail: -0.64, doorF: 0.56, doorR: -0.5, bumpF: 1.8, bumpR: -1.9, pillars: [[-0.48, -0.36]], hoodEnd: 1.86, bed: [-1.9, -0.66] },
    wheel: { r: 0.38, w: 0.24, knobby: true, rim: 0xd9d5c8, spokes: 5 }, axle: { f: 1.2, r: -1.2 }, track: 0.74,
    eye: [0.37, 1.5, -0.3], wheelPos: [0.37, 1.18, 0.18], dashZ: 0.66,
    lamps: { y: 0.84, x: 0.6, r: 0.1 }, dashThin: 0.45, grille: { y: 0.84, w: 0.86, h: 0.36 },
    // tuned by driving: 0–50 km/h in ~3.7 s, ~30° of lean in a 60 km/h bend without going over
    phys: { mass: 1550, comY: 0.62, I: [2500, 2900, 900], k: 30000, c: 3200, travel: 0.3, torque: 180, redline: 4600, idle: 700, gears: [4.1, 2.5, 1.55, 1.0], final: 3.9, drive: 'awd', mu: 1.04, nitro: 0.5, brake: 3000, top: 34, offroad: 1.12, mudGrip: 0.9, mudDig: 0.3, mudRes: 0.75, mudSink: 0.6 },
  },
  {
    // an off-road buggy: a low open tub in a tube cage, the engine behind the seats, wheels standing out
    // on long A-arms with coilovers you can watch working. Light, soft and barely damped, so it bobs,
    // pitches and floats over crests. Everything above the tub's belt is open (marks.open).
    id: 'buggy', name: 'Cvrček', tag: 'Terénní bugina', isNew: true, blurb: 'Lehká trubková bugina na dlouhých pérech. Houpe se, skáče a letí přes všechno.',
    paint: 0xf2c21b, roughness: 0.34, plate: 'SKOK 22', trim: 0x1c1d21, kind: 'buggy', open: true, maxKmh: 180, axleInset: 9,
    stations: [
      st(-1.66, 0.5, 0.66, 0.5, 0.9, 0.46, 0.96, 0.36), st(-1.62, 0.44, 0.68, 0.58, 0.96, 0.54, 1.04, 0.44), st(-1.4, 0.4, 0.66, 0.62, 0.96, 0.58, 1.06, 0.48),
      st(-0.62, 0.36, 0.6, 0.62, 0.9, 0.58, 1.02, 0.48), st(-0.56, 0.34, 0.54, 0.62, 0.76, 0.58, 1.62, 0.52), st(0.0, 0.34, 0.54, 0.62, 0.76, 0.58, 1.62, 0.52),
      st(0.56, 0.34, 0.56, 0.62, 0.84, 0.58, 1.6, 0.52), st(0.62, 0.35, 0.58, 0.62, 0.85, 0.56, 0.9, 0.46), st(1.3, 0.37, 0.56, 0.6, 0.78, 0.54, 0.84, 0.42),
      st(1.78, 0.4, 0.52, 0.54, 0.64, 0.48, 0.68, 0.36), st(1.86, 0.44, 0.5, 0.46, 0.58, 0.4, 0.62, 0.3),
    ],
    marks: { open: true, cowl: 0.62, roofF: 0.05, roofR: -0.56, tail: -0.62, doorF: 0.4, doorR: -0.4, bumpF: 1.72, bumpR: -1.5, pillars: [], hoodEnd: 1.8 },
    wheel: { r: 0.4, w: 0.34, knobby: true, rim: 0x2c2e33, spokes: 8 }, axle: { f: 1.42, r: -1.3 }, track: 0.96,
    eye: [0.3, 1.14, -0.3], wheelPos: [0.3, 0.86, 0.12], dashZ: 0.7, dashThin: 0.5,
    lamps: { y: 0.55, x: 0.3, r: 0.075 },
    // one pipe swept up out of the engine cover's back corner, clear of the bumper bar (two centred ones read as eyes)
    exhaust: { x: [0.34], y: 0.8, up: 1.0 },
    // soft springs on long travel with weak dampers: it keeps bobbing after a bump, sits down hard under power
    phys: { mass: 820, comY: 0.55, I: [1100, 1300, 450], k: 14000, c: 1100, travel: 0.42, torque: 330, redline: 7200, idle: 1000, gears: [3.2, 2.2, 1.6, 1.25, 1.0], final: 4.3, drive: 'rwd', mu: 1.12, nitro: 0.9, brake: 2600, top: 44, offroad: 1.18, mudGrip: 0.6, mudDig: 0.8, mudRes: 1.1, mudSink: 0.8 },
  },
  {
    // a farm tractor: big rear wheels with chevron lugs, small steering wheels in front (wheelF, trackF), a tall
    // glass cab over the back axle, the bonnet in front with the stack on it. Heavy and slow, hardly any springs
    // (it bounces on its tyres), a crawler gearbox, rear-wheel drive. buildTractor adds the rest.
    id: 'tractor', name: 'Bohouš', tag: 'Traktor', isNew: true, blurb: 'Pomalý, hlučný a nezastavitelný. V poli doma, na silnici postrach.',
    paint: 0xb8261c, roughness: 0.45, plate: 'TRAKTOR', trim: 0x1a1b1d, kind: 'tractor', maxKmh: 60, noFender: true, hw: 1.14,
    // (the first station, 2 cm behind the cab, is only belt high: the strip of sheet up to the next one is the
    // cab's back wall, and marks.flatRear makes it glass you see into the cab through, like flatFront in front)
    stations: [
      st(-1.5, 1.0, 1.25, 0.52, 1.45, 0.52, 1.48, 0.5),
      st(-1.48, 1.0, 1.25, 0.52, 1.45, 0.52, 2.5, 0.46), st(-1.44, 0.95, 1.25, 0.6, 1.46, 0.6, 2.62, 0.55), st(-1.35, 0.92, 1.25, 0.62, 1.46, 0.63, 2.66, 0.58),
      st(-1, 0.9, 1.25, 0.62, 1.46, 0.63, 2.68, 0.6), st(-0.7, 0.9, 1.25, 0.62, 1.46, 0.63, 2.68, 0.6), st(-0.4, 0.9, 1.25, 0.62, 1.46, 0.63, 2.68, 0.6), st(-0.18, 0.9, 1.25, 0.62, 1.46, 0.63, 2.66, 0.6),
      st(-0.1, 0.82, 1.2, 0.44, 1.5, 0.42, 1.58, 0.34), st(1.3, 0.78, 1.18, 0.44, 1.5, 0.42, 1.58, 0.34), st(1.65, 0.8, 1.15, 0.42, 1.42, 0.38, 1.5, 0.3), st(1.72, 0.85, 1.12, 0.36, 1.34, 0.32, 1.4, 0.24),
    ],
    // (every mark inside the stations' range, or the body grows a wall: tail and bumpR sit on the cab's back, so no boot, no rear bumper)
    marks: { cowl: -0.1, roofF: -0.18, roofR: -1.4, tail: -1.48, doorF: -0.28, doorR: -1.18, bumpF: 1.6, bumpR: -1.48, pillars: [], hoodEnd: 1.66, flatFront: true, flatRear: -1.485 },
    wheel: { r: 0.86, w: 0.46, knobby: true, lugs: true, rim: 0xe9e2cf, spokes: 0 }, wheelF: { r: 0.5, w: 0.3, knobby: true, lugs: true, rim: 0xe9e2cf, spokes: 0 },
    axle: { f: 1.2, r: -1.12 }, track: 0.92, trackF: 0.74,
    // the driver sits high in the middle; the steering wheel stands up from the floor, nearly flat
    eye: [0, 2.2, -0.82], wheelPos: [0, 1.84, -0.46], wheelY: 1.84, wheelTilt: 0.85, dashZ: -0.24, buddy: [0.4, 2.02, -0.56], z0: -0.4,
    lamps: { y: 1.26, x: 0.27, r: 0.07 }, grille: { y: 1.08, w: 0.64, h: 0.44 },
    stack: [0.26, 2.78, 0.72],
    // (the whole tractor sits 0.4 m back on its centre of mass, z0: nearly half its weight on the front wheels,
    // as with real front weights; with the cab over the centre it reared over backwards on every hill)
    // a diesel that tops out at 2400 rpm through a crawler box: about 7 km/h in first, 40 at the top
    // Springs (2026-11-18, Patrik: "moc se houpe, správný traktor neskáče"): with k 70000 it sank 0.137 m
    // of its 0.14 under its own weight, so it rode on the bump stops (55–110 hits in 14 s over a field)
    // and threw itself about. Now it sinks 0.12 of 0.32, the big tyres roll over small bumps (bumpK), and
    // the centre of mass sits at 0.7 (1.0 rolled it over in a 25 km/h slalom on a field). Measured on
    // three fields at 30 km/h: wheels off the ground 4–15 % of the time (was 24–35 %), 0–2 bump stops,
    // vertical shaking 3.5–6.4 m/s² (was 6.8–8.2); slalom at 25 km/h ±0.6 steer: no rollover (max 32°).
    phys: { mass: 3900, comY: 0.7, I: [7400, 8600, 3200], k: 80000, c: 7000, travel: 0.32, bumpK: 0.5, torque: 520, redline: 2400, idle: 780, gears: [6.2, 4.4, 3.1, 2.2, 1.6, 1.15], final: 16.5, drive: 'rwd', mu: 1.15, nitro: 0.6, brake: 9000, top: 12, offroad: 1.3, mudGrip: 1.0, mudDig: 0.2, mudRes: 0.5, mudSink: 0.4 },
  },
];

// ---- monotone cubic through key stations -------------------------------------------------------
function pchip(xs, ys) {
  const n = xs.length, m = new Array(n), d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return x => {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Key rows around half a section, bottom centre up to the roof centre.
function sectionKeys(s) {
  const rail = s.belt + (s.top - s.belt) * 0.84;
  return [
    [0, s.low], [s.w * 0.84, s.low], [s.w * 0.985, s.low + (s.mid - s.low) * 0.3], [s.w, s.mid],
    [s.wb, s.belt], [s.wt + (s.wb - s.wt) * 0.14, rail], [s.wt * 0.74, s.top - (s.top - rail) * 0.06], [0, s.top + 0.012],
  ];
}
const ROW_SUB = [3, 1, 2, 3, 4, 2, 3];
const ROWS = ROW_SUB.reduce((a, b) => a + b, 0) + 1;
export const BELT_ROW = ROW_SUB.slice(0, 4).reduce((a, b) => a + b, 0), RAIL_ROW = BELT_ROW + ROW_SUB[4], SILL_ROW = ROW_SUB[0] + ROW_SUB[1];

function ringAt(s) {
  const k = sectionKeys(s), pts = [];
  // catmull through the key points, with a touch of tension so the belt line stays crisp
  for (let i = 0; i < k.length - 1; i++) {
    const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(k.length - 1, i + 2)], n = ROW_SUB[i];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t, T = 0.36;
      const f = (a, b, c, d) => b + (c - a) * T * t + (2 * T * a + (T - 3) * b + (3 - 2 * T) * c - T * d) * t2 + (-T * a + (2 - T) * b + (T - 2) * c + T * d) * t3;
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(k[k.length - 1].slice());
  return pts;
}

function buildGrid(spec) {
  const key = spec.stations, xs = key.map(s => s.z), f = {};
  for (const n of ['low', 'mid', 'w', 'belt', 'wb', 'top', 'wt']) f[n] = pchip(xs, key.map(s => s[n]));
  // dense stations, snapped so every panel edge falls exactly on a grid line
  const marks = spec.marks, zs = new Set(xs.map(z => +z.toFixed(3)));
  const addM = z => z != null && zs.add(+z.toFixed(3));
  for (const k of ['cowl', 'glassTo', 'roofF', 'roofR', 'tail', 'doorF', 'doorR', 'bumpF', 'bumpR', 'hoodEnd']) addM(marks[k]);
  (marks.pillars || []).forEach(p => p.forEach(addM)); if (marks.bed) marks.bed.forEach(addM);
  const sorted = [...zs].sort((a, b) => a - b), out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1], n = Math.max(1, Math.ceil((b - a) / 0.085));
    for (let j = 0; j < n; j++) out.push(a + (b - a) * j / n);
  }
  out.push(sorted[sorted.length - 1]);
  const grid = out.map(z => { const s = { z }; for (const n in f) s[n] = f[n](z); return { z, ring: ringAt(s) }; });
  const F = fenderInfo(spec);
  if (F) for (const c of grid) c.ring.forEach((p, k) => { p[1] += bumpAt(F, p[0], c.z, k); });
  return grid;
}

// Fender humps. Where a wheel stands taller than the wing over it (the supercar's low nose) the arch
// cut left a hole in the bonnet the tyre showed through. So the wing outboard of the tyre's inner face
// is raised into a smooth hump over it, and the arch cut (axleInset) stays outboard of the hump's foot.
const MID_ROW = ROW_SUB.slice(0, 3).reduce((a, b) => a + b, 0), fenderMemo = {};
export function fenderInfo(spec) {
  if (spec.id in fenderMemo) return fenderMemo[spec.id];
  let F = null;
  if (!spec.lift && !spec.open && !spec.noFender) {
    const key = spec.stations, xs = key.map(s => s.z), f = {};
    for (const n of ['low', 'mid', 'w', 'belt', 'wb', 'top', 'wt']) f[n] = pchip(xs, key.map(s => s[n]));
    const inset = spec.track - spec.wheel.w / 2 - 0.04, want = spec.wheel.r * 2 + spec.phys.travel * 0.3 + 0.08, bumps = [];
    for (const az of [spec.axle.f, spec.axle.r]) {
      const s = { z: az }; for (const n in f) s[n] = f[n](az);
      const low = Math.min(...ringAt(s).filter((p, k) => k >= BELT_ROW && p[0] >= inset).map(p => p[1]));
      if (low < want) bumps.push([az, want - low]);
    }
    if (bumps.length) F = { inset, bumps };
  }
  return (fenderMemo[spec.id] = F);
}
// k: the row in the section (the flank below the belt rises less, the sill not at all)
export function bumpAt(F, x, z, k = BELT_ROW) {
  if (!F) return 0;
  // fully up a little inboard of the cut: the bonnet's rows are far apart across the car, and a slope
  // that only topped out at the cut dipped into it between them and left a hole you saw out through
  const t = Math.min(1, Math.max(0, (Math.abs(x) - F.inset + 0.24) / 0.18)), across = t * t * (3 - 2 * t);
  const row = Math.min(1, Math.max(0, (k - MID_ROW) / (BELT_ROW - MID_ROW)));
  let y = 0;
  for (const [az, A] of F.bumps) y += A * Math.exp(-(((z - az) / 0.38) ** 2));
  return y * across * row;
}

// ---- cabin light --------------------------------------------------------------------------------
// The cabin is too small for the world shadow map, whose texels are several centimetres wide. So
// each interior fragment traces its way out of a simplified greenhouse: sun that leaves through
// glass lands on it, sun that hits the roof, a pillar or a door does not.
function cabinGLSL(spec) {
  // an open car has no greenhouse: the sun and sky reach everything in it
  if (spec.open) return /* glsl */`
    uniform vec3 uSunLocal; uniform float uSunVis; varying vec3 vCabP;
    float cabinSun(vec3 p) { return uSunVis; }
    float cabinOcc(vec3 p) { return mix(.75, 1.2, smoothstep(.35, .9, p.y)); }
  `;
  const S = spec.stations, m = spec.marks, n = v => v.toFixed(3), BELT = S[4].belt, TOP = S[4].top - 0.02, H = TOP - BELT;
  const b = (m.pillars || [])[0], BZ = b ? (b[0] + b[1]) / 2 : 99, BH = b ? (b[1] - b[0]) / 2 + 0.01 : 0.01;
  return /* glsl */`
    uniform vec3 uSunLocal; uniform float uSunVis; varying vec3 vCabP;
    float cabEdge(float limit, float v) { return 1. - smoothstep(limit - .012, limit + .012, v); }
    float cabinSun(vec3 p) {
      const float BELT = ${n(BELT)}, TOP = ${n(TOP)}, H = ${n(H)}, WB = ${n(S[4].wb)}, ZC = ${n(m.cowl)}, ZT = ${n(m.tail)};
      const float kx = ${n((S[4].wb - S[4].wt) / H)}, kf = ${n((m.cowl - m.roofF) / H)}, kr = ${n((m.roofR - m.tail) / H)};
      vec3 s = uSunLocal; float sg = s.x < 0. ? -1. : 1., h = p.y - BELT;
      float ty = s.y > .001 ? (TOP - p.y) / s.y : 1e5;
      float dx = sg * s.x + s.y * kx, tx = dx > .001 ? (WB - h * kx - sg * p.x) / dx : 1e5;
      float df = s.z + s.y * kf, tf = df > .001 ? (ZC - h * kf - p.z) / df : 1e5;
      float dr = s.z - s.y * kr, tr = dr < -.001 ? (ZT + h * kr - p.z) / dr : 1e5;
      float t = min(ty, min(tx, min(tf, tr)));
      if (t == ty) return 0.;
      vec3 q = p + s * t;
      float hq = q.y - BELT, open = smoothstep(-.012, .012, hq) * cabEdge(H - .01, hq);
      if (t == tx) {
        open *= cabEdge(ZC - hq * kf - .09, q.z) * cabEdge(-ZT - hq * kr - .07, -q.z);
        open *= 1. - cabEdge(${n(BH)}, abs(q.z - ${n(BZ)}));
      } else open *= cabEdge(WB - hq * kx - .09, abs(q.x));
      return open * uSunVis;
    }
    // the cabin gets a good share of the sky's light through its glass: without sun (rain, dusk, trees)
    // the dark trim would otherwise sink to flat black and you couldn't read the dash
    float cabinOcc(vec3 p) { return mix(.62, 1.3, smoothstep(${n(BELT - 0.55)}, ${n(BELT + 0.2)}, p.y)); }
  `;
}
const CABIN_VERT = 'uniform mat4 uCabInv; varying vec3 vCabP;\n';
const CABIN_POS = '\n vCabP = (uCabInv * modelMatrix * vec4(transformed, 1.)).xyz;';
// put the sun gate between the light loop and the final mix
const CABIN_LIGHT = /* glsl */`
  float cabS = cabinSun(vCabP), cabO = cabinOcc(vCabP);
  reflectedLight.directDiffuse *= cabS; reflectedLight.directSpecular *= cabS;
  reflectedLight.indirectDiffuse *= cabO; reflectedLight.indirectSpecular *= cabO * .4;`;

// ---- materials ------------------------------------------------------------------------------
export function bodyMaterial(color, rough, env, spec, dirt, cabU) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.55, side: THREE.DoubleSide });
  const a = spec.axle, r = spec.wheel.r + 0.06, axY = spec.wheel.r - (spec.lift || 0);
  // livery (tuning.js): painted in rest space, so it stays on a panel that dents or falls off.
  // uLiv: 0 none, 1 racing stripes, 2 side stripe, 3 two-tone. uNum: a start number on the doors.
  const liv = { uLiv: { value: 0 }, uPaint2: { value: new THREE.Color(0xf0f1ee) }, uNumOn: { value: 0 }, uNum: { value: null } };
  m.userData.liv = liv;
  const S4 = spec.stations[4], mk = spec.marks, f = v => v.toFixed(3);
  const LW = f(S4.w), LMID = f(S4.mid), LBELT = f(S4.belt);
  const NZ = f((mk.doorF + mk.doorR) / 2), NY = f((S4.mid + S4.belt) / 2 + 0.02), NS = f((S4.belt - S4.low) * 0.66);
  m.onBeforeCompile = sh => {
    sh.uniforms.uDirt = dirt; Object.assign(sh.uniforms, cabU, liv);
    sh.vertexShader = CABIN_VERT + 'attribute vec3 aRest; attribute float aEdge; varying vec3 vRest; varying float vEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest=aRest; vEdge=aEdge;' + CABIN_POS);
    sh.fragmentShader = cabinGLSL(spec) + /* glsl */`
      varying vec3 vRest; varying float vEdge; uniform float uDirt;
      uniform float uLiv, uNumOn; uniform vec3 uPaint2; uniform sampler2D uNum;
      float dn(vec3 p){ return fract(sin(dot(floor(p),vec3(12.9,78.2,37.7)))*43758.5); }
      float dv(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(dn(i),dn(i+vec3(1,0,0)),f.x),mix(dn(i+vec3(0,1,0)),dn(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(dn(i+vec3(0,0,1)),dn(i+vec3(1,0,1)),f.x),mix(dn(i+vec3(0,1,1)),dn(i+vec3(1,1,1)),f.x),f.y),f.z); }
    ` + sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      if (abs(vRest.x) > ${(spec.axleInset ?? fenderInfo(spec)?.inset ?? 0.42).toFixed(3)} && vRest.y < ${(fenderInfo(spec) ? axY + spec.wheel.r + 0.03 : 99).toFixed(3)} && (length(vRest.zy - vec2(${a.f.toFixed(3)}, ${axY.toFixed(3)})) < ${r.toFixed(3)} || length(vRest.zy - vec2(${a.r.toFixed(3)}, ${axY.toFixed(3)})) < ${r.toFixed(3)})) discard;
      {
        float aw = abs(vRest.x) / ${LW}, lm = 0.;
        if (uLiv > .5 && uLiv < 1.5) lm = step(.06, aw) * step(aw, .22);
        else if (uLiv > 1.5 && uLiv < 2.5) lm = step(.62, aw) * step(${LMID} + (${LBELT} - ${LMID}) * .2, vRest.y) * step(vRest.y, ${LMID} + (${LBELT} - ${LMID}) * .48);
        else if (uLiv > 2.5) lm = step(vRest.y, ${LMID});
        diffuseColor.rgb = mix(diffuseColor.rgb, uPaint2, lm);
        if (uNumOn > .5 && aw > .62) {
          vec2 nuv = vec2((vRest.z - ${NZ}) * -sign(vRest.x), vRest.y - ${NY}) / ${NS} + .5;
          if (nuv.x > 0. && nuv.y > 0. && nuv.x < 1. && nuv.y < 1.) { vec4 nc = texture2D(uNum, nuv); diffuseColor.rgb = mix(diffuseColor.rgb, nc.rgb, nc.a); }
        }
      }
      float seam = smoothstep(.0, .16, vEdge);
      diffuseColor.rgb *= seam * .95 + .05;
      // the inside of the sheet is the headliner and door lining: dark cloth, not bare grey metal
      if (!gl_FrontFacing) diffuseColor.rgb = vec3(${(spec.lining ?? [0.034, 0.032, 0.034]).map(v => v.toFixed(3)).join(',')});
      float dN = dv(vRest*5.)*.55 + dv(vRest*17.)*.3 + dv(vRest*51.)*.15;
      float dirtA = smoothstep(.0,1.,uDirt*1.5 - (vRest.y-.2)*.75 + dN*.55 - .25) * .96;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.075,.052,.03)*(.7+dN*.6), dirtA);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 1., smoothstep(.2,.7,uDirt*1.3-(vRest.y-.3)*.6));\n if (!gl_FrontFacing) roughnessFactor = 1.;   // cloth lining: no mirror sheen of the sunset sky')
      // the inside of the sheet ignores the coarse world shadows and uses the cabin trace instead
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll('receiveShadow', '(receiveShadow && gl_FrontFacing)'))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        if (!gl_FrontFacing) { ${CABIN_LIGHT} clearcoatSpecularDirect *= 0.; clearcoatSpecularIndirect *= 0.; }`);
  };
  m.customProgramCacheKey = () => 'body' + spec.id;
  return m;
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function roundedBox(w, h, d, x, y, z, r0 = 0.03) {
  const s = new THREE.Shape(), a = w / 2, b = h / 2, r = Math.min(r0, a * 0.9, b * 0.9);
  s.moveTo(-a + r, -b); s.lineTo(a - r, -b); s.quadraticCurveTo(a, -b, a, -b + r); s.lineTo(a, b - r); s.quadraticCurveTo(a, b, a - r, b); s.lineTo(-a + r, b); s.quadraticCurveTo(-a, b, -a, b - r); s.lineTo(-a, -b + r); s.quadraticCurveTo(-a, -b, -a + r, -b);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 }).translate(x, y, z - d / 2);
}

function buildWheel(spec, env) {
  const { r, w, knobby, rim, spokes, big, lugs } = spec.wheel, g = new THREE.Group();
  const hw = w / 2, rimR = r * (big ? 0.5 : 0.66);
  const prof = [[rimR, -hw * 0.92], [r * 0.9, -hw], [r * 0.975, -hw * 0.92], [r, -hw * 0.66], [r, hw * 0.66], [r * 0.975, hw * 0.92], [r * 0.9, hw], [rimR, hw * 0.92]];
  const tyreG = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 40); tyreG.rotateZ(Math.PI / 2);
  const parts = [tyreG];
  if (lugs) {
    // a tractor tyre: tall bars set in a chevron, each half slanted the other way, gaps between them
    const n = Math.round(r * 26), k = r * 0.075;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const b = new THREE.BoxGeometry(hw * 0.95, k * 2, r * 0.09);
      b.rotateY(s * 0.55); b.translate(s * hw * 0.46, r + k * 0.6, s * r * 0.06); b.rotateX((i + (s > 0 ? 0.5 : 0)) / n * Math.PI * 2);
      parts.push(b);
    }
  } else if (knobby) {
    const n = big ? 22 : 30, k = big ? 0.075 : 0.02;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const b = new THREE.BoxGeometry(hw * 0.86, k * 1.8, r * 0.1);
      b.translate(s * hw * 0.5, r + k * 0.3, 0); b.rotateY(s * 0.3); b.rotateX((i + (s > 0 ? 0.5 : 0)) / n * Math.PI * 2);
      parts.push(b);
    }
  }
  const tyre = new THREE.Mesh(mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; })), new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.92 }));
  tyre.geometry.computeVertexNormals();
  g.add(tyre);
  const rimMat = new THREE.MeshStandardMaterial({ color: rim, metalness: 0.9, roughness: 0.32, envMap: env }); rimMat.name = 'rim';
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, w * 0.92, 28, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a4c50, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }));
  g.add(barrel);
  const hub = [new THREE.CylinderGeometry(rimR * 0.26, rimR * 0.3, 0.05, 16).rotateZ(Math.PI / 2).translate(hw * 0.76, 0, 0), new THREE.TorusGeometry(rimR, r * 0.03, 8, 32).rotateY(Math.PI / 2).translate(hw * 0.86, 0, 0)];
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * Math.PI * 2, s = new THREE.BoxGeometry(0.02, rimR * 0.98, r * 0.11);
    s.translate(hw * 0.78, rimR * 0.52, 0); s.rotateX(a); hub.push(s);
  }
  const face = new THREE.Mesh(mergeGeometries(hub.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; })), rimMat);
  face.geometry.computeVertexNormals();
  g.add(face);
  // brake disc behind the rim
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.76, rimR * 0.76, 0.03, 24).rotateZ(Math.PI / 2).translate(hw * 0.1, 0, 0), new THREE.MeshStandardMaterial({ color: 0x77797d, metalness: 0.9, roughness: 0.4 })));
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// ---- the body ------------------------------------------------------------------------------
function classify(spec, z, row) {
  const m = spec.marks;
  if (m.open) {
    // a tub: closed up to the belt, open above it between the engine cover and the scuttle
    if (z >= m.bumpF && row < BELT_ROW) return 'bumperF';
    if (z <= m.bumpR && row < BELT_ROW) return 'bumperR';
    // the cockpit's sides are open down to the sill: only the cage frames it (Patrik: "rám je hezčí jen tak")
    if (row >= SILL_ROW && z > m.tail && z < m.cowl) return 'hole';
    if (row >= BELT_ROW + 1 && z > m.cowl && z < m.hoodEnd) return 'hood';
    if (row >= BELT_ROW + 1 && z < m.tail && z > m.bumpR) return 'trunk';
    return 'shell';
  }
  if (m.bed && z > m.bed[0] && z < m.bed[1] && row >= RAIL_ROW - 3) return 'hole';
  if (m.slope) {
    if (row >= BELT_ROW && row < RAIL_ROW - 1 && z > m.roofR - 0.5 && z < m.cowl - 0.12) return 'glass';
    if (row >= RAIL_ROW && z > m.roofF - 0.01 && z < m.cowl) return 'glass';
    if (row >= RAIL_ROW && z > m.tail && z < m.roofR - 0.08) return 'glass';
  } else {
    // the row just under the rail runs up the windscreen edge and is the A-pillar
    // (glassTo: where an upright screen's glass ends; the grid gets a line there, leaving a slim body band under it)
    if (row >= RAIL_ROW && z > m.roofF && z < (m.glassTo ?? m.cowl - 0.04)) return 'glass';
    // a cab-over truck's screen is its whole upright front between the belt and the roof
    if (m.flatFront && row >= BELT_ROW + 1 && z > m.roofF && z < m.cowl) return 'glass';
    // ...and a tractor's back wall (the strip between its first two stations)
    if (m.flatRear != null && row >= BELT_ROW + 1 && z < m.flatRear) return 'glass';
    if (row >= BELT_ROW && row < RAIL_ROW - 1 && z > m.roofR + 0.02 && z < m.cowl - 0.1 && !(m.pillars || []).some(p => z > p[0] && z < p[1])) return 'glass';
    if (row >= BELT_ROW && z > m.tail + 0.02 && z < m.roofR - 0.02 && !m.bed) return 'glass';
  }
  if (z >= m.bumpF && row < RAIL_ROW) return 'bumperF';
  if (z <= m.bumpR && row < RAIL_ROW) return 'bumperR';
  if (z > m.cowl && z < m.hoodEnd && row >= BELT_ROW + 1) return 'hood';
  if (row >= SILL_ROW && row < BELT_ROW && z < m.doorF && z > m.doorR) return 'door';
  if (row >= BELT_ROW + 1 && m.bed == null && z < m.tail + 0.02 && z > m.bumpR) return 'trunk';
  return 'shell';
}

export function buildPanels(spec) {
  const grid = buildGrid(spec), NS = grid.length, buckets = {};
  const vert = (s, r, side) => { const p = grid[s].ring[r]; return [p[0] * side, p[1], grid[s].z]; };
  // smooth normals from the sheet before it is cut into panels
  const nrm = new Map();
  const nkey = (s, r, side) => r === 0 || r === ROWS - 1 ? `${s}:${r}` : `${s}:${r}:${side}`;
  const addN = (k, n) => { const v = nrm.get(k); if (v) v.add(n); else nrm.set(k, n.clone()); };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (const side of [1, -1]) for (let s = 0; s < NS - 1; s++) for (let r = 0; r < ROWS - 1; r++) {
    const a = vert(s, r, side), b = vert(s + 1, r, side), c = vert(s + 1, r + 1, side), d = vert(s, r + 1, side);
    A.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); B.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]);
    N.crossVectors(A, B).multiplyScalar(-side);
    for (const [ss, rr] of [[s, r], [s + 1, r], [s + 1, r + 1], [s, r + 1]]) addN(nkey(ss, rr, side), N);
  }
  for (let s = 0; s < NS - 1; s++) for (let r = 0; r < ROWS - 1; r++) for (const side of [1, -1]) {
    const zm = (grid[s].z + grid[s + 1].z) / 2;
    let name = classify(spec, zm, r);
    if (name === 'hole') continue;
    if (name === 'door') name = side > 0 ? 'doorL' : 'doorR';
    if (name === 'glass') name = r >= RAIL_ROW ? (zm > 0 || spec.marks.slope && zm > spec.marks.roofR ? 'glassF' : 'glassB') : side > 0 ? 'glassL' : 'glassR';
    const bk = buckets[name] ||= { cells: new Set(), list: [] };
    bk.list.push([s, r, side]); bk.cells.add(`${s}:${r}:${side}`);
  }
  const out = {};
  for (const name in buckets) {
    const bk = buckets[name], pos = [], nor = [], edge = [], idx = [], map = new Map();
    const has = (s, r, side) => bk.cells.has(`${s}:${r}:${side}`);
    const open = (s, r, side) => {
      // a corner sits on a panel edge when any of its four cells belongs elsewhere
      if (name === 'shell') return 1;
      for (const [a, b] of [[s, r], [s - 1, r], [s, r - 1], [s - 1, r - 1]]) {
        if (b < 0 || b >= ROWS - 1) continue;
        if (!has(a, b, side)) return 0;
      }
      return 1;
    };
    const vid = (s, r, side) => {
      const k = `${s}:${r}:${side}`;
      let id = map.get(k);
      if (id === undefined) {
        id = pos.length / 3; map.set(k, id);
        const p = vert(s, r, side), n = nrm.get(nkey(s, r, side)).clone().normalize();
        pos.push(...p); nor.push(n.x, n.y, n.z); edge.push(open(s, r, side));
      }
      return id;
    };
    for (const [s, r, side] of bk.list) {
      const a = vid(s, r, side), b = vid(s + 1, r, side), c = vid(s + 1, r + 1, side), d = vid(s, r + 1, side);
      if (side > 0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aRest', new THREE.Float32BufferAttribute(pos.slice(), 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    out[name] = g;
  }
  // close both ends with fans
  const caps = [];
  for (const [s, flip] of [[0, true], [NS - 1, false]]) {
    const ring = grid[s].ring, z = grid[s].z, pos = [0, ring[3][1] * 0 + (ring[0][1] + ring[ROWS - 1][1]) / 2, z], idx = [];
    for (const side of [1, -1]) {
      const b = pos.length / 3;
      for (const p of ring) pos.push(p[0] * side, p[1], z);
      for (let r = 0; r < ROWS - 1; r++) {
        const swap = (side > 0) === flip;
        idx.push(0, b + (swap ? r + 1 : r), b + (swap ? r : r + 1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.setAttribute('aRest', new THREE.Float32BufferAttribute(pos.slice(), 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(1), 1));
    caps.push(g);
  }
  out.shell = mergeGeometries([out.shell, ...caps]);
  return { panels: out, grid };
}

// Lifted lightly away from the body so the lamp sits proud of the sheet without z-fighting.
function lampLens(w, h, d, color, emissive, x, y, z, rotY = 0) {
  const g = new THREE.SphereGeometry(1, 20, 14); g.scale(w, h, d);
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive, emissiveIntensity: 0 }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  return m;
}

export function buildCar(spec, env, opt = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();     // everything that moves with the sprung mass
  root.add(body);
  const lift = spec.lift || 0, axY = spec.wheel.r + lift;
  const dirt = { value: 0 };
  const cabU = { uCabInv: { value: new THREE.Matrix4() }, uSunLocal: { value: new THREE.Vector3(0, 1, 0) }, uSunVis: { value: 1 } };
  const paint = bodyMaterial(spec.paint, spec.roughness, env, spec, dirt, cabU);
  const { panels, grid } = buildPanels(spec);
  const hull = new THREE.Group(); hull.position.y = lift; body.add(hull);

  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.06, metalness: 0, envMap: env, envMapIntensity: 1.5, transparent: true, opacity: 0.56, side: THREE.DoubleSide, clearcoat: 1, depthWrite: false });
  const parts = {};
  for (const name in panels) {
    if (name.startsWith('glass')) continue;
    const m = new THREE.Mesh(panels[name], paint);
    m.castShadow = true; m.receiveShadow = true; m.name = name;
    hull.add(m); parts[name] = { mesh: m, hp: { hood: 30, doorL: 34, doorR: 34, bumperF: 16, bumperR: 16, trunk: 26, shell: 1e9 }[name] ?? 30, off: false };
  }
  const panes = {};
  for (const name in panels) if (name.startsWith('glass')) {
    const pane = new THREE.Mesh(panels[name], glass); pane.renderOrder = 5; hull.add(pane); panes[name] = { mesh: pane, hp: name === 'glassF' ? 1e9 : 15, off: false };
  }

  // ---- trim ---------------------------------------------------------------------------------
  const m = spec.marks, S = spec.stations, top = S[S.length - 1], tail = S[0];
  const trimM = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.62, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.14, envMap: env });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.85 });
  const zF = S[S.length - 2].z, zR = S[1].z, wF = S[S.length - 3].w;
  const belowY = spec.kind === 'pickup' ? 0.62 : 0.3;

  // inner tub: when a panel is gone there is dark metal behind it, not sky
  const noseTop = S.find(s => s.z >= m.bumpF).top - 0.1, tailTop = S[4].belt - 0.34;
  hull.add(new THREE.Mesh(box(wF * 1.8, noseTop - S[4].low, zF - m.cowl - 0.14, 0, (noseTop + S[4].low) / 2, (zF + m.cowl) / 2 + 0.06), darkM));
  hull.add(new THREE.Mesh(box(wF * 1.8, tailTop - S[4].low, m.doorR - zR - 0.5, 0, (tailTop + S[4].low) / 2, (m.doorR + zR) / 2 - 0.05), darkM));

  // wheel wells
  // (under a fender hump the driver looks down over its crest into the arch: there the tube's outside
  // has to be drawn too, or that view goes straight through to the ground)
  const wellSide = fenderInfo(spec) ? THREE.DoubleSide : THREE.BackSide;
  for (const z of [spec.axle.f, spec.axle.r]) for (const s of [-1, 1]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheel.r + 0.05, spec.wheel.r + 0.05, 0.42, 22, 1, true, -0.1, Math.PI + 0.2).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: wellSide }));
    // the tube's outer rim has to stay inside the body, or it shows as a black flange where the flank curves in
    well.position.set(s * Math.min(spec.track + 0.02, S[4].w - 0.23), axY, z); if (!lift && !spec.open && spec.kind !== 'tractor') hull.add(well);
    if (spec.kind !== 'coupe' && spec.kind !== 'tractor' && !lift && !spec.open) { // plastic arch
      const arch = new THREE.Mesh(new THREE.TorusGeometry(spec.wheel.r + 0.08, 0.05, 8, 26, Math.PI * 1.05).rotateY(Math.PI / 2).rotateX(-0.04), trimM);
      arch.position.set(s * (S[4].w + 0.02), spec.wheel.r, z); arch.scale.x = 0.7; hull.add(arch);
    }
  }

  // lights
  const FB = fenderInfo(spec);
  const lampY = (spec.lampY ?? (spec.kind === 'coupe' ? 0.55 : spec.kind === 'pickup' ? 1.06 : 0.71)) + bumpAt(FB, wF * (spec.kind === 'coupe' ? 0.76 : 0.72), zF - (spec.kind === 'coupe' ? 0.38 : 0.11)), lampZ = zF - (spec.kind === 'coupe' ? 0.38 : 0.11), lampX = wF * (spec.lampX ?? (spec.kind === 'coupe' ? 0.76 : 0.72));
  const headL = [], tails = [];
  for (const s of [-1, 1]) {
    const L = spec.lamps;   // a car of its own: round lamps in chrome rings, set into the flat front
    const lamp = L ? lampLens(L.r, L.r, 0.05, 0xf4f6fa, 0xfff0d0, s * L.x, L.y, top.z + 0.012)
      : spec.kind === 'pickup'
      ? lampLens(0.2, 0.13, 0.09, 0xf4f6fa, 0xfff0d0, s * lampX, lampY, lampZ)
      : lampLens(...(spec.lens || [0.24, 0.1, 0.12]), 0xf4f6fa, 0xfff0d0, s * lampX, lampY, lampZ, -s * 0.45);   // (spec.lens: flatter lenses on the everyday cars)
    hull.add(lamp); headL.push(lamp);
    if (L) hull.add(new THREE.Mesh(new THREE.TorusGeometry(L.r + 0.012, 0.016, 8, 28).translate(s * L.x, L.y, top.z + 0.014), chrome));
    // (round lamps get small round tail lights set into the rear panel, not lenses over the corners)
    const tl = L ? lampLens(0.055, 0.055, 0.025, 0x8a0a0a, 0xff1408, s * tail.w * 0.78, tail.mid + 0.02, tail.z - 0.008)
      : lampLens(0.18, 0.07, 0.04, 0x8a0a0a, 0xff1408, s * tail.w * 1.02, spec.kind === 'pickup' ? 1.02 : tail.mid + 0.2, zR + (spec.kind === 'coupe' ? -0.02 : -0.02));
    hull.add(tl); tails.push(tl);
    // (not the tractor: its tail lamps move to the fenders, and the empty rings stayed on its back)
    if (L && spec.kind !== 'tractor') hull.add(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.01, 6, 20).translate(s * tail.w * 0.78, tail.mid + 0.02, tail.z - 0.01), chrome));
  }
  // grille, plate, intakes
  // the supercar's nose face is only a hand high: its intake and plate share it, nothing hangs below
  const coupe = spec.kind === 'coupe';
  const GR = spec.grille;
  const grilleY = GR ? GR.y : spec.kind === 'pickup' ? 0.92 : coupe ? top.low + (top.mid - top.low) * 0.55 : 0.5;
  const grille = new THREE.Group();
  const gw = GR ? GR.w : coupe ? top.w * 1.5 : wF * 0.98, gh = GR ? GR.h : spec.kind === 'pickup' ? 0.26 : coupe ? (top.mid - top.low) * 0.8 : 0.14;
  grille.add(new THREE.Mesh(box(gw, gh, 0.03, 0, grilleY, top.z - (coupe ? 0.008 : 0.02)), darkM));
  for (let i = 0, n = coupe ? 3 : GR ? 7 : 4; i < n; i++) grille.add(new THREE.Mesh(box(gw * 0.96, 0.012, 0.015, 0, grilleY - gh * 0.43 + i * gh * 0.86 / (n - 1), top.z + (coupe ? 0.01 : 0.002)), trimM));
  if (!spec.open) hull.add(grille);
  const plate = plateTexture(spec.plate);
  const plateM = new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateM); pf.position.set(0, coupe ? grilleY : grilleY - (spec.kind === 'pickup' ? 0.24 : 0.14), top.z + (coupe ? 0.018 : 0.014)); hull.add(pf);  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateM); pr.position.set(0, tail.mid, tail.z - 0.012); pr.rotation.y = Math.PI; hull.add(pr);

  // mirrors, handles
  const mirrorZ = m.cowl - 0.06, mirrorY = S.find(s => s.z >= m.cowl).belt + 0.05 + bumpAt(FB, S[4].wb, m.cowl - 0.06);
  if (!spec.open) for (const s of [-1, 1]) {
    const mir = new THREE.Mesh(roundedBox(0.22, 0.13, 0.07, s * (S[4].wb + 0.1), mirrorY, mirrorZ), trimM); hull.add(mir);
    const arm = new THREE.Mesh(box(0.13, 0.03, 0.05, s * (S[4].wb + 0.02), mirrorY - 0.03, mirrorZ), trimM); hull.add(arm);
    const handle = new THREE.Mesh(box(0.025, 0.03, 0.14, s * (S[4].w * 0.985), S[4].mid + (S[4].belt - S[4].mid) * 0.72, m.doorR + 0.16), chrome); hull.add(handle);
    handle.userData.door = s > 0 ? 'doorL' : 'doorR';
  }
  // wiper
  if (!spec.open) for (const s of [-0.24, 0.3]) {
    const y = S.find(q => q.z >= m.cowl).top + 0.03;
    const wiper = new THREE.Mesh(box(0.42, 0.012, 0.016, s, y, m.cowl - 0.05), darkM); wiper.rotation.z = 0.02; hull.add(wiper);
  }
  // exhaust
  const exh = spec.kind === 'coupe' ? [-0.38, -0.25, 0.25, 0.38] : [0.42];
  if (spec.exhaust) for (const x of spec.exhaust.x) {
    const E = spec.exhaust, pipe = new THREE.Group(); pipe.position.set(x, E.y, tail.z + 0.03); pipe.rotation.x = E.up; hull.add(pipe);
    pipe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.26, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.1), chrome));
    pipe.add(new THREE.Mesh(new THREE.CircleGeometry(0.036, 12).rotateY(Math.PI).translate(0, 0, -0.22), darkM));
  }
  else for (const x of exh) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 14, 1, true).rotateX(Math.PI / 2), chrome);
    p.position.set(x, (tail.low + 0.03), tail.z + 0.05); hull.add(p);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12).rotateY(Math.PI), darkM); d.position.set(x, tail.low + 0.03, tail.z - 0.05); hull.add(d);
  }

  // per-kind dressing
  if (spec.id === 'rally') {
    const rack = new THREE.Mesh(box(1.1, 0.04, 0.7, 0, S[4].top + 0.08, -0.4), trimM); hull.add(rack);
    for (const x of [-0.45, 0.45]) for (const z of [-0.65, -0.15]) hull.add(new THREE.Mesh(box(0.04, 0.09, 0.04, x, S[4].top + 0.03, z), trimM));
    hull.add(new THREE.Mesh(box(1.3, 0.04, 0.34, 0, S[1].top + 0.15, S[1].z + 0.14), trimM));
    const wg = new THREE.Mesh(box(0.05, 0.16, 0.3, 0.58, S[1].top + 0.06, S[1].z + 0.14), trimM); hull.add(wg, wg.clone().translateX(-1.16));
    // spare wheel strapped on the rack
    const sp = buildWheel({ ...spec, wheel: { ...spec.wheel, r: 0.3, spokes: 5 } }, env); sp.rotation.z = Math.PI / 2; sp.position.set(0, S[4].top + 0.24, -0.4); hull.add(sp);
    if (spec.roofBar ?? true) {   // the rally car's own lamp pod is its light bar
      for (const s of [-0.4, -0.13, 0.13, 0.4]) { const l = lampLens(0.08, 0.08, 0.05, 0xf8f8ee, 0xfff0d0, s, S[5].top + 0.14, 0.46); hull.add(l); headL.push(l); }
      hull.add(new THREE.Mesh(box(1.05, 0.03, 0.03, 0, S[5].top + 0.08, 0.42), trimM));
    }
  }
  if (spec.kind === 'pickup') {
    const [b0, b1] = m.bed;
    const wy = S[3].belt, wx = S[3].w;
    const bed = new THREE.Group();
    const bedM = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 });
    bed.add(new THREE.Mesh(box(wx * 1.88, 0.03, b1 - b0, 0, 0.82, (b0 + b1) / 2), bedM));
    for (let i = 0; i < 8; i++) bed.add(new THREE.Mesh(box(0.05, 0.03, b1 - b0 - 0.04, -wx * 0.8 + i * wx * 0.228, 0.85, (b0 + b1) / 2), bedM));
    bed.add(new THREE.Mesh(box(0.03, wy - 0.82, b1 - b0, wx * 0.94, (wy + 0.82) / 2, (b0 + b1) / 2), bedM));
    bed.add(new THREE.Mesh(box(0.03, wy - 0.82, b1 - b0, -wx * 0.94, (wy + 0.82) / 2, (b0 + b1) / 2), bedM));
    bed.add(new THREE.Mesh(box(wx * 1.88, wy - 0.82, 0.03, 0, (wy + 0.82) / 2, b1), bedM));
    bed.add(new THREE.Mesh(box(wx * 1.88, wy - 0.82, 0.03, 0, (wy + 0.82) / 2, b0), bedM));
    bed.traverse(o => { o.castShadow = true; });
    hull.add(bed);
    // bull bar, step rails (the old field car has a plain steel bumper instead, built below)
    if (spec.id !== 'kamzik') hull.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 8, 22, Math.PI).translate(0, 0.72, top.z + 0.1), trimM));
    if (spec.id !== 'kamzik') for (const s of [-1, 1]) hull.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 8).rotateX(Math.PI / 2).translate(s * (S[4].w + 0.08), 0.58, 0.3), trimM));
    if (spec.id === 'pickup') { // winch
      hull.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 14).rotateZ(Math.PI / 2).translate(0, 0.76, top.z + 0.02), chrome));
      // a load of hay bales in the back
      const hay = new THREE.Mesh(box(1.1, 0.34, 0.8, -0.1, 1.02, -1.6), new THREE.MeshStandardMaterial({ color: 0xc9ab62, roughness: 1 })); hay.rotation.y = 0.1; hay.castShadow = true; hull.add(hay);
    }
  }
  if (spec.id === 'kamzik') {
    // plain steel bumpers, the front one carries the plate
    hull.add(new THREE.Mesh(box(1.74, 0.13, 0.12, 0, 0.58, top.z + 0.12), trimM));
    for (const s of [-0.5, 0.5]) hull.add(new THREE.Mesh(box(0.08, 0.08, 0.16, s, 0.6, top.z + 0.02), trimM));
    pf.position.set(0, 0.58, top.z + 0.185);
    hull.add(new THREE.Mesh(box(1.5, 0.11, 0.1, 0, 0.6, tail.z - 0.07), trimM));
    // the spare rides on the bonnet; it's fixed to the bonnet so it leaves with it
    const sp = buildWheel(spec, env); sp.rotation.z = Math.PI / 2;
    sp.position.set(0, S[8].top + spec.wheel.w / 2 + 0.005, 1.18);
    (parts.hood?.mesh || hull).add(sp);
    // canvas tilt over the bed: a hooped cover that sags a little between its hoops, rolled flap at the back
    const [b0, b1] = m.bed, L = b1 - b0 + 0.03, hx = S[3].w * 0.95, y0 = S[3].belt - 0.01, y1 = S[4].top - 0.08, rr = 0.14;
    const sh = new THREE.Shape();
    sh.moveTo(-hx, y0); sh.lineTo(hx, y0); sh.lineTo(hx, y1 - rr); sh.quadraticCurveTo(hx, y1, hx - rr, y1);
    sh.lineTo(-hx + rr, y1); sh.quadraticCurveTo(-hx, y1, -hx, y1 - rr); sh.closePath();
    const tg = new THREE.ExtrudeGeometry(sh, { depth: L, steps: 30, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, b0 - 0.02);
    const tp = tg.attributes.position, hoops = 3;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), u = (z - b0 + 0.02) / L;
      const sag = Math.sin(u * hoops * Math.PI) ** 2 * 0.03;
      const roof = Math.max(0, (y - (y1 - 0.25)) / 0.25), side = Math.max(0, (Math.abs(x) - (hx - 0.2)) / 0.2);
      tp.setY(i, y - sag * roof * (1 - side * 0.6)); tp.setX(i, x - Math.sign(x) * sag * side * 0.5 * (1 - roof));
    }
    tg.computeVertexNormals();
    const canvasM = new THREE.MeshStandardMaterial({ color: 0x8b8466, roughness: 1, side: THREE.DoubleSide });
    const tilt = new THREE.Mesh(tg, canvasM); tilt.castShadow = true; tilt.receiveShadow = true; hull.add(tilt);
    // hoops show as stitched seams, the rolled-up flap hangs over the tailgate
    const seamM = new THREE.MeshStandardMaterial({ color: 0x6c6650, roughness: 1 });
    for (let k = 0; k <= hoops; k++) {
      const z = b0 - 0.02 + L * k / hoops, seam = new THREE.Shape();
      seam.moveTo(-hx - 0.012, y0 + 0.02); seam.lineTo(-hx - 0.012, y1 - rr); seam.quadraticCurveTo(-hx - 0.012, y1 + 0.012, -hx + rr, y1 + 0.012);
      seam.lineTo(hx - rr, y1 + 0.012); seam.quadraticCurveTo(hx + 0.012, y1 + 0.012, hx + 0.012, y1 - rr); seam.lineTo(hx + 0.012, y0 + 0.02);
      const pts = seam.getPoints(8).map(p => new THREE.Vector3(p.x, p.y, z));
      hull.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.012, 6), seamM));
    }
    hull.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, hx * 1.9, 12).rotateZ(Math.PI / 2).translate(0, y1 - 0.12, b0 - 0.06), canvasM));
    for (const s of [-0.5, 0.5]) hull.add(new THREE.Mesh(box(0.04, 0.2, 0.012, s * hx, y1 - 0.18, b0 - 0.115), seamM));
  }
  // light bar on the roof: the pickup's own, or any car's from the tuning
  if ((spec.roofBar ?? spec.id === 'pickup') && spec.id !== 'rally') {
    // (the buggy's sits on the cage's front cross bar, wide enough to reach both roof rails)
    const zb = m.open ? m.roofF - 0.02 : m.roofF - 0.24, ring = grid.reduce((a, b) => (Math.abs(b.z - zb) < Math.abs(a.z - zb) ? b : a)).ring;
    const yb = m.open ? S[4].top + 0.035 : ring[ring.length - 1][1] + 0.05, wb = m.open ? 0.96 : Math.min(1.1, S[4].wt * 1.5);
    hull.add(new THREE.Mesh(box(wb, 0.06, 0.08, 0, yb, zb), trimM));
    // (lamps ride on top of the bar: set at the bar's height their lower halves hung through the roof into the cabin)
    for (const s of [-0.345, -0.118, 0.118, 0.345]) { const l = lampLens(0.09, 0.07, 0.04, 0xf8f8ee, 0xfff0d0, s * wb, yb + 0.07, zb + 0.06); hull.add(l); headL.push(l); }
  }
  if (spec.id === 'sport') {
    // rear wing and splitter
    const y = S[2].top + 0.2;
    hull.add(new THREE.Mesh(roundedBox(1.72, 0.03, 0.32, 0, y, S[1].z + 0.28, 0.012), trimM));
    for (const s of [-0.84, 0.84]) hull.add(new THREE.Mesh(box(0.02, 0.1, 0.34, s, y - 0.01, S[1].z + 0.28), trimM));
    for (const s of [-0.5, 0.5]) hull.add(new THREE.Mesh(box(0.05, 0.2, 0.09, s, y - 0.11, S[1].z + 0.3), trimM));
    // the splitter is a lip under the nose: its outline follows the nose in plan and pokes out only a
    // few centimetres, a plain plank stood out in the air past the rounded corners
    {
      const nose = grid.filter(c => c.z >= spec.axle.f + 0.3), yS = Math.min(...nose.map(c => c.ring[0][1])) - 0.012;
      const wAt = c => Math.max(...c.ring.filter(p => p[1] < c.ring[0][1] + 0.1).map(p => p[0]));
      const sh = new THREE.Shape(), last = nose[nose.length - 1];
      sh.moveTo(-wAt(nose[0]) * 0.97, nose[0].z);
      for (const c of nose) sh.lineTo(-wAt(c) * 0.99 - 0.02, c.z + 0.02);
      sh.lineTo(-wAt(last) * 0.8, last.z + 0.05); sh.lineTo(wAt(last) * 0.8, last.z + 0.05);
      for (let i = nose.length - 1; i >= 0; i--) sh.lineTo(wAt(nose[i]) * 0.99 + 0.02, nose[i].z + 0.02);
      sh.lineTo(wAt(nose[0]) * 0.97, nose[0].z); sh.closePath();
      // shape y → model z: rotateX(+90°) sends y to z and the extrusion downwards
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, yS + 0.009, 0);
      hull.add(new THREE.Mesh(sg, trimM));
    }
    for (const s of [-1, 1]) hull.add(new THREE.Mesh(box(0.05, 0.17, 0.92, s * 0.97, 0.45, -0.72), darkM));
    for (const s of [-1, 1]) hull.add(new THREE.Mesh(box(0.05, 0.04, 2.1, s * 0.965, 0.2, 0.05), trimM));
    // centre stripes painted on
    hull.add(new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), trimM));
  }

  // underside: frame for trucks, a flat tray otherwise
  const under = new THREE.Group();   // no lift here: the hull it joins is already raised
  under.add(new THREE.Mesh(box(spec.kind === 'tractor' ? 0.8 : 1.3, 0.06, zF - zR - 0.6, 0, S[4].low - 0.02, (zF + zR) / 2), darkM));
  hull.add(under);

  // ---- wheels -------------------------------------------------------------------------------
  const wheelProto = buildWheel(spec, env), wheelProtoF = spec.wheelF ? buildWheel({ ...spec, wheel: spec.wheelF }, env) : wheelProto;
  const wheels = [];
  for (const [zp, sx, front] of [[spec.axle.f, 1, 1], [spec.axle.f, -1, 1], [spec.axle.r, 1, 0], [spec.axle.r, -1, 0]]) {
    const steer = new THREE.Group(); steer.position.set(sx * (front ? spec.trackF ?? spec.track : spec.track), front ? spec.wheelF?.r ?? spec.wheel.r : spec.wheel.r, zp);
    const spin = (front ? wheelProtoF : wheelProto).clone(); if (sx < 0) spin.rotation.y = Math.PI;
    const spinner = new THREE.Group(); spinner.add(spin); steer.add(spinner); root.add(steer);
    wheels.push({ steer, spinner, front: !!front, sx, z: zp, off: false });
  }
  if (lift) {
    // exposed axles, links and coilovers on the monster truck
    const steelM = new THREE.MeshStandardMaterial({ color: 0x8f949c, metalness: 0.85, roughness: 0.35, envMap: env }), coilM = new THREE.MeshStandardMaterial({ color: 0xd8c021, roughness: 0.5, metalness: 0.4 });
    const ax = {};
    for (const [key, z] of [['f', spec.axle.f], ['r', spec.axle.r]]) {
      const a = new THREE.Group(); a.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, spec.track * 2, 12).rotateZ(Math.PI / 2), steelM));
      a.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), steelM));
      a.position.set(0, spec.wheel.r, z); root.add(a); ax[key] = a;
      a.traverse(o => { o.castShadow = true; });
    }
    const frame = new THREE.Group();
    for (const s of [-0.5, 0.5]) frame.add(new THREE.Mesh(box(0.14, 0.2, 5.4, s, 0, 0), darkM));
    for (const z of [-2, -0.6, 0.8, 2]) frame.add(new THREE.Mesh(box(1, 0.1, 0.1, 0, 0, z), darkM));
    frame.position.y = 1.32; frame.traverse(o => { o.castShadow = true; }); body.add(frame);
    root.userData.axles = ax;
    root.userData.coilM = coilM;
  }

  const links = spec.open ? buildBuggy(spec, env, root, hull, wheels, pf, trimM, chrome, headL) : null;
  if (spec.kind === 'tractor') buildTractor(spec, env, hull, wheels, pf, paint, trimM, chrome, darkM, headL, tails);

  // an NPC car (opt.npc) has no cockpit and no beam: a person sits in it instead, and every extra
  // light would recompile every material in the scene
  if (opt.npc) return { spec, root, body, hull, cabU, paint, glass, panes, parts, wheels, cab: null, headL, tails, dirt, beam: null, chrome, trimM, grid };

  // ---- cockpit -------------------------------------------------------------------------------
  const cab = buildCockpit(spec, env, grid, cabU);
  cab.group.position.y = lift; body.add(cab.group);

  // headlight beam used at dusk and night
  const beam = new THREE.SpotLight(0xfff0d4, 0, 130, 0.56, 0.5, 1.2);
  beam.position.set(0, lampY + lift, zF - 0.1); beam.target.position.set(0, -0.1 + lift, zF + 20);
  body.add(beam, beam.target);

  const updateLinks = links ? () => {
    for (const L of links) {
      const w = wheels[L.w];
      L.mesh.visible = !w.off;
      if (w.off) continue;
      stretch(L.mesh, L.a, lB.copy(w.steer.position).add(L.off));
    }
  } : null;
  return { spec, root, body, hull, cabU, paint, glass, panes, parts, wheels, cab, headL, tails, dirt, beam, chrome, trimM, updateLinks };
}

// a unit-length mesh along +Y stretched from a to b
const lB = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), lD = new THREE.Vector3();
function stretch(mesh, a, b) {
  lD.subVectors(b, a); const l = lD.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(lD, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, lD.divideScalar(l));
  mesh.scale.y = l;
}

// A wheel to the height its suspension puts it at (y, in the car's frame). Up to vis.maxY (the tractor's
// rear wheels, under fixed fenders) it just moves; above it the tyre squashes instead: its top stays at
// maxY + r and its bottom stays on the ground (y - r). vis.y keeps the physics' own height (multiplayer sends it).
export function placeWheel(vis, y) {
  vis.y = y;
  const M = vis.maxY, st = vis.steer;
  let k = 1;
  if (M === undefined || y <= M) st.position.y = y;
  else { k = Math.max(0.6, 1 - (y - M) / (2 * vis.r)); st.position.y = M + vis.r * (1 - k); }
  st.scale.y = k;
  // a mudguard that turns with the wheel but stays at its height on the body (the tractor's front ones)
  if (vis.guard) { vis.guard.position.y = (vis.guardY - st.position.y) / k; vis.guard.scale.y = 1 / k; }
}

// ---- the tractor: rear fenders, front mudguards, stack, weights, roof, beacon, steps, linkage -------
// Everything here hangs on the hull (it rides on the body), the front mudguards on the steering groups
// (they turn with the wheels). Fenders take the body paint (with the attributes its shader reads), so
// the garage repaints them with the rest.
function buildTractor(spec, env, hull, wheels, pf, paint, trimM, chrome, darkM, headL, tails) {
  const o = spec.z0 || 0, S = spec.stations, R = spec.wheel.r, W = spec.wheel.w, RF = spec.wheelF.r, WF = spec.wheelF.w, top = S[S.length - 1];
  const add = (geo, mat, parent = hull, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  const painted = g => { const p = g.attributes.position; g.setAttribute('aRest', new THREE.Float32BufferAttribute(p.array.slice(), 3)); g.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(1), 1)); return g; };
  const cream = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.5 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.55, metalness: 0.5, envMap: env, envMapIntensity: 0.5 });
  // a curved sheet over a wheel: a ring sector (r0..r1, angles a0..a1 from the front, upwards) w wide,
  // built in the YZ plane and stood across X
  const arc = (r0, r1, a0, a1, w) => {
    const sh = new THREE.Shape(), n = 24;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const p = [-r1 * Math.cos(a), r1 * Math.sin(a)]; i ? sh.lineTo(...p) : sh.moveTo(...p); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; sh.lineTo(-r0 * Math.cos(a), r0 * Math.sin(a)); }
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 1 }).rotateY(Math.PI / 2).translate(-w / 2, 0, 0);
  };
  // Rear fenders: a wide sheet over each big wheel, clear of its lugs (the chevron bars stand out to
  // 1.12 R, buildWheel). Bolted to the body over where the hub sits at rest: they don't ride up and down
  // with the wheel (Patrik, 2026-11-18). The suspension lifts the wheel up to 0.29 m above that, so the
  // wheel stops 3 cm up (maxY) and its tyre squashes from there on (placeWheel): the lugs never come
  // through the sheet and there is no gap a hand wide either. No raised lip along the edge (Patrik: "ta
  // vyvýšenina"), and it ends level with the hub behind the wheel instead of hanging down towards the ground.
  const LUG = 1.12, RIN = R * LUG + 0.06, RINF = RF * LUG + 0.07;
  for (const t of tails) t.visible = false;      // (the body's own tail lamps sit too low and too close; ours go on the fenders)
  for (const w of wheels.filter(w => !w.front)) {
    const s = Math.sign(w.steer.position.x) || 1;
    const at = new THREE.Group(); at.position.set(w.steer.position.x, R - (spec.lift || 0), w.steer.position.z); hull.add(at);
    add(painted(arc(RIN, RIN + 0.035, -0.06, Math.PI + 0.04, W + 0.14)), paint, at);
    // tail lamps on the fender's back, 0.5 m above the hub
    const tl = lampLens(0.06, 0.06, 0.03, 0x8a0a0a, 0xff1408, s * 0.08, 0.5, -Math.sqrt((RIN + 0.035) ** 2 - 0.25) - 0.025); at.add(tl); tails.push(tl);
    w.r = R; w.maxY = R + 0.03;
  }
  // the cab's side walls down to the floor, and a little seat on the left one (the buddy seat)
  // (from in front of the axle to the cab's back wall, not 0.4 m past it: Patrik's "plíšky až moc dozadu")
  for (const s of [-1, 1]) { const z0w = spec.axle.r + 0.7, z1w = S[0].z + 0.02; add(box(0.03, 0.5, z0w - z1w, s * (spec.track - W / 2 - 0.09), S[4].low + 0.5, (z0w + z1w) / 2), iron); }
  add(roundedBox(0.34, 0.08, 0.32, spec.buddy[0], spec.buddy[1] - 0.72, spec.buddy[2] - 0.02, 0.03), new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.9 }));
  // front mudguards ride on the steering, so they turn with the wheels, but not up and down with them
  // (Patrik): placeWheel holds them at the hub's rest height (guardY) and the wheel stops 4 cm up, like the rear
  for (const w of wheels.filter(w => w.front)) {
    w.guard = add(painted(arc(RINF, RINF + 0.025, 0.15, Math.PI * 0.62, WF + 0.1)), paint, w.steer); w.guard.position.x = 0;
    w.guardY = RF; w.r = RF; w.maxY = RF + 0.04;
  }
  // the front axle beam and its pivot; the rear axle trumpets from each hub in towards the body (on the wheel)
  add(box(spec.trackF * 2 - WF - 0.06, 0.12, 0.14, 0, RF, spec.axle.f), iron);
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 14).rotateX(Math.PI / 2).translate(0, RF + 0.08, spec.axle.f), iron);
  for (const w of wheels.filter(w => !w.front)) {
    const s = Math.sign(w.steer.position.x) || 1, len = spec.track - W / 2 - 0.12;
    add(new THREE.CylinderGeometry(0.075, 0.11, len, 14).rotateZ(Math.PI / 2).translate(-s * (W / 2 + len / 2), 0, 0), iron, w.steer);
  }
  // frame rails under the bonnet down to the axle, the sump between them
  for (const s of [-1, 1]) add(box(0.08, 0.22, 2.0, s * 0.3, 0.72, 1.1 + o), iron);
  add(box(0.5, 0.26, 1.1, 0, 0.66, 0.8 + o), iron);
  // front weights: a stack of grey cast-iron slabs on a carrier, gaps between them, the plate on the lowest
  // one (in darkM the stack read as one black block, Patrik)
  add(box(0.5, 0.06, 0.34, 0, 0.66, top.z + 0.14), iron);
  const castM = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.62, metalness: 0.35, envMap: env, envMapIntensity: 0.6 });
  for (let i = 0; i < 5; i++) {
    add(roundedBox(0.92, 0.088, 0.22, 0, 0.74 + i * 0.105, top.z + 0.2, 0.025), castM);
    if (i) add(box(0.12, 0.05, 0.03, 0, 0.74 + i * 0.105, top.z + 0.315), iron);      // the cast handle in each slab's face (not the lowest: the plate is there)
  }
  pf.position.set(0, 0.74, top.z + 0.315);
  // the stack: up from the bonnet, a silencer on it, a flap that the exhaust lifts (just bent, here)
  const [sx, sy, sz] = spec.stack, hood = S[8].top;
  add(new THREE.CylinderGeometry(0.045, 0.045, sy - hood, 12).translate(sx, (sy + hood) / 2, sz), darkM);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 14).translate(sx, hood + 0.55, sz), darkM);
  add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 12).translate(0, 0.02, -0.04).rotateX(-0.55).translate(sx, sy, sz), darkM);
  // the air pre-cleaner on the other side: a short pipe with a domed bowl
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 10).translate(-sx, hood + 0.15, sz - 0.1), darkM);
  add(new THREE.SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(-sx, hood + 0.3, sz - 0.1), chrome);
  // cab: a cream roof that overhangs the glass, slim black corner posts, a door handle, a dark rear window
  const roofY = S[4].top + 0.02;
  add(roundedBox(1.46, 0.1, 1.5, 0, roofY + 0.05, -0.38 + o, 0.04), cream);
  for (const [x, z] of [[0.6, 0.22], [-0.6, 0.22], [0.6, -1.0], [-0.6, -1.0]]) add(box(0.05, roofY - S[4].belt, 0.05, x, (roofY + S[4].belt) / 2, z + o), iron);
  add(box(0.02, 0.03, 0.16, 0.635, 1.9, o), chrome);
  // the rear window is the body's own glass now (marks.flatRear, the strip between the first two stations,
  // Patrik: "udělat reálné okno oknem"); here only its black frame and the bar across its lower part
  const rw = 1.0, rh = 1.0, ry = 1.98, rz = S[0].z - 0.02;
  for (const [w, h, x, y] of [[rw + 0.06, 0.05, 0, ry + rh / 2], [rw + 0.06, 0.05, 0, ry - rh / 2], [0.05, rh, -rw / 2, ry], [0.05, rh, rw / 2, ry], [rw, 0.04, 0, 1.66]]) add(box(w, h, 0.03, x, y, rz), iron);
  // under the cab's back, between the fenders: a plate in the body colour down over the transmission housing
  // (there was a hole round the plate panel, then a grey plate; Patrik: red over all of it). Not the body
  // paint itself: its shader cuts away everything near the rear wheels, which is why the panel was narrow.
  // Its colour IS the paint's Color object, so the garage repaints it too. Just in front of the body's end
  // (the plate number stays on top), just behind the housing's back face.
  const backM = new THREE.MeshStandardMaterial({ roughness: spec.roughness ?? 0.45, metalness: 0.1, envMap: env, envMapIntensity: 0.6 });
  backM.color = paint.color;
  add(box((spec.track - W / 2 - 0.08) * 2, S[0].belt - 0.5, 0.03, 0, (S[0].belt + 0.5) / 2, S[0].z + 0.012), backM);
  // work lamps on the roof's front edge (part of the headlights), the orange beacon on the back corner
  for (const s of [-1, 1]) {
    add(box(0.12, 0.08, 0.06, s * 0.55, roofY + 0.16, 0.3 + o), iron);
    const l = lampLens(0.05, 0.035, 0.03, 0xf8f8ee, 0xfff0d0, s * 0.55, roofY + 0.16, 0.34 + o); hull.add(l); headL.push(l);
  }
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.04, 14).translate(-0.55, roofY + 0.12, -0.95 + o), iron);
  add(new THREE.SphereGeometry(0.06, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.4, 1).translate(-0.55, roofY + 0.14, -0.95 + o), new THREE.MeshStandardMaterial({ color: 0xff8a1a, roughness: 0.2, emissive: 0xff6a00, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }));
  // steps up to the door (on the driver's left, in front of the big wheel), with a grab handle
  for (let i = 0; i < 3; i++) add(box(0.26, 0.03, 0.18, 0.74, 0.42 + i * 0.32, 0.32 + o), iron);
  add(box(0.02, 0.86, 0.02, 0.86, 0.85, 0.42 + o), iron);
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 8).translate(0.66, 1.75, 0.26 + o), chrome);
  // three-point linkage at the back, every piece joined to something (Patrik: the old bars floated behind
  // it and a pin stood on a plate on the ground): two lower arms from the axle housing back and apart, the
  // top link from the back of the body, a drawbar under the middle with its hitch pin on the end
  const rod = (a, b, t) => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = add(box(t, t, d.length(), 0, 0, 0), iron);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); return m;
  };
  // (all of it hangs on the transmission housing: the block under the cab between the rear wheels, which
  // the arms seemed to float without; shorter, ending a hand behind the body, well off the ground)
  const rear = S[0].z;
  add(box(0.62, 0.48, 0.6, 0, 0.8, rear + 0.34), iron);                         // transmission housing (its back behind the red plate)
  for (const s of [-1, 1]) {
    rod([s * 0.27, 0.62, rear + 0.08], [s * 0.4, 0.6, rear - 0.42], 0.065);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12).rotateZ(Math.PI / 2).translate(s * 0.4, 0.6, rear - 0.42), iron);   // ball ends
  }
  rod([0, 1.12, rear + 0.02], [0, 1.06, rear - 0.36], 0.06);
  add(box(0.16, 0.12, 0.12, 0, 1.12, rear - 0.02), iron);                       // the top link's bracket on the body
  rod([0, 0.68, rear + 0.05], [0, 0.66, rear - 0.3], 0.09);                     // drawbar
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10).translate(0, 0.74, rear - 0.27), chrome);
  add(new THREE.SphereGeometry(0.035, 10, 8).translate(0, 0.82, rear - 0.27), chrome);
}

// ---- the buggy's tube cage, light pod, spare and the suspension you can see -----------------------
// Returns the links (arms, coilovers) that follow the wheels; updateLinks moves them every frame.
function buildBuggy(spec, env, root, hull, wheels, pf, trimM, chrome, headL) {
  const S = spec.stations, cageM = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.42, metalness: 0.55, envMap: env, envMapIntensity: 0.6 });
  const R = 0.024, top = S[4].top, hx = 0.5, zA = 0.05, zM = -0.56;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // tubes bent through their points, round caps at the ends
  const tube = (pts, r = R, mat = cageM) => {
    const c = new THREE.CatmullRomCurve3(pts.map(p => V(...p)), false, 'catmullrom', 0.05);
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(4, pts.length * 10), r, 8), mat); m.castShadow = true; hull.add(m);
    for (const p of [pts[0], pts[pts.length - 1]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), mat); e.position.set(...p); hull.add(e); }
    return c;
  };
  // where a tube's bend passes nearest a point: other tubes are welded on there, so every joint meets
  const onCurve = (c, x, y, z) => { const q = V(x, y, z); let best = null, bd = 1e9; for (const p of c.getSpacedPoints(400)) { const d = p.distanceToSquared(q); if (d < bd) { bd = d; best = p; } } return best.toArray(); };
  const cowlY = S[7].belt, beltY = S[4].belt;
  // main hoop behind the seats, the front hoop up the screen line, the roof rails between
  const mainH = tube([[-0.6, beltY - 0.02, zM], [-hx - 0.04, top - 0.25, zM], [-hx + 0.08, top, zM], [hx - 0.08, top, zM], [hx + 0.04, top - 0.25, zM], [0.6, beltY - 0.02, zM]]);
  const frontH = tube([[-0.58, cowlY - 0.01, 0.6], [-hx - 0.02, top - 0.3, zA + 0.24], [-hx + 0.08, top - 0.02, zA], [hx - 0.08, top - 0.02, zA], [hx + 0.02, top - 0.3, zA + 0.24], [0.58, cowlY - 0.01, 0.6]]);
  for (const s of [-1, 1]) {
    // the roof rail runs corner to corner: from the front hoop's bend to the main hoop's
    const cF = onCurve(frontH, s * hx, top, zA), cM = onCurve(mainH, s * hx, top, zM);
    tube([cF, cM]);
    // elbow bar along the tub, the X brace in the main hoop, braces down to the back and the nose
    tube([[s * 0.6, beltY + 0.08, 0.58], [s * 0.64, beltY + 0.1, 0], [s * 0.6, beltY + 0.06, zM]]);
    tube([cM, [s * 0.42, 1.12, -1.2], [s * 0.4, S[1].belt + 0.03, -1.58]]);
    tube([[s * 0.56, cowlY, 0.62], [s * 0.44, 0.66, 1.4], [s * 0.36, 0.37, 1.9]]);
  }
  tube([onCurve(mainH, 0.6, beltY + 0.06, zM), onCurve(mainH, -hx, top, zM)]);
  // open sides: a sill rail along the floor edge and a diagonal up to the elbow bar, posts at both ends
  const sillY = S[4].low + 0.14;
  for (const s of [-1, 1]) {
    tube([[s * 0.6, sillY, 0.6], [s * 0.62, sillY, -0.6]], 0.026);
    tube([[s * 0.61, sillY + 0.02, 0.45], [s * 0.63, beltY + 0.07, -0.45]], 0.02);
    tube([[s * 0.6, sillY, 0.6], [s * 0.58, cowlY - 0.01, 0.6]], 0.022);
    tube([[s * 0.62, sillY, -0.6], [s * 0.6, beltY - 0.02, zM - 0.02]], 0.022);
  }
  // bulkheads close the bonnet and the engine cover where the open cockpit meets them
  const plate = (z, yTop) => { const p = new THREE.Mesh(box(1.2, yTop - S[4].low - 0.04, 0.02, 0, (yTop + S[4].low) / 2, z), trimM); p.receiveShadow = true; hull.add(p); };
  plate(spec.marks.cowl + 0.01, cowlY - 0.02); plate(spec.marks.tail - 0.01, S[3].belt - 0.02);
  for (const [z, st] of [[spec.marks.cowl + 0.01, S[7]], [spec.marks.tail - 0.01, S[3]]]) {
    const p = new THREE.Mesh(box(st.wt * 1.9, st.top - st.belt + 0.02, 0.02, 0, (st.top + st.belt) / 2 - 0.02, z), trimM); hull.add(p);
  }
  tube([[-0.36, 0.37, 1.9], [0, 0.35, 1.97], [0.36, 0.37, 1.9]], 0.03);              // nose bar, under the plate
  tube([[-0.4, S[1].belt + 0.03, -1.58], [0, S[1].belt + 0.05, -1.66], [0.4, S[1].belt + 0.03, -1.58]], 0.03);
  tube([[-0.5, 0.52, -1.7], [0, 0.5, -1.74], [0.5, 0.52, -1.7]], 0.032);            // rear bumper bar
  for (const s of [-1, 1]) tube([[s * 0.5, 0.52, -1.7], [s * 0.5, 0.6, -1.52]], 0.028);
  // plate on the nose bar
  pf.position.set(0, 0.47, 1.87);
  // spare wheel stood up behind the main hoop, strapped on the engine cover
  const sp = buildWheelSpare(spec, env); sp.position.set(0, S[2].top + spec.wheel.r * 0.86, -1.0); sp.rotation.set(-0.3, Math.PI / 2, 0); hull.add(sp);
  tube([[0, S[2].top + 0.02, -1.25], [0, S[2].top + spec.wheel.r * 1.4, -0.95]], 0.012, trimM);
  // whip flag on the back corner, so others see you over a crest
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 1.9, 6).translate(0, 0.95, 0), trimM); whip.position.set(-0.46, top - 0.02, zM); whip.rotation.z = 0.06; hull.add(whip);
  const flagS = new THREE.Shape(); flagS.moveTo(0, 0); flagS.lineTo(-0.36, -0.1); flagS.lineTo(0, -0.22); flagS.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagS), new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x3a0e00 }));
  flag.rotation.y = Math.PI / 2; flag.position.set(0, 1.88, 0); whip.add(flag);
  // the rear-view mirror hangs off the front cross bar
  const mir = new THREE.Mesh(roundedBox(0.2, 0.06, 0.03, 0, top - 0.1, zA - 0.01), trimM); hull.add(mir);

  // ---- suspension: double A-arms and a coilover to each wheel --------------------------------
  const armM = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.35, envMap: env });
  const coilM = new THREE.MeshStandardMaterial({ color: 0xb8261a, roughness: 0.45, metalness: 0.4 });
  const shockM = new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 0.95, roughness: 0.2, envMap: env });
  // unit-length pieces centred on Y: stretch() sets their middle, direction and length
  const rodG = r => new THREE.CylinderGeometry(r, r, 1, 8);
  const helix = (() => {   // the spring stretches and squeezes with its link, coils and all
    const pts = [], n = 9;
    for (let i = 0; i <= n * 16; i++) { const t = i / (n * 16), a = t * n * Math.PI * 2; pts.push(V(Math.cos(a) * 0.055, t - 0.5, Math.sin(a) * 0.055)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 16, 0.011, 5);
  })();
  const links = [];
  const add = (geo, mat, w, a, off) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; root.add(mesh);
    links.push({ mesh, w, a, off });
  };
  wheels.forEach((wh, i) => {
    const s = wh.sx, z = wh.z, inX = s * 0.4, hubX = -s * (spec.wheel.w / 2 + 0.04), footX = -s * (spec.wheel.w / 2 + 0.2);
    const up = new THREE.Mesh(box(0.05, 0.3, 0.09, hubX, 0.01, 0), armM); up.castShadow = true; wh.steer.add(up);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, spec.wheel.w / 2 + 0.04, 10).rotateZ(Math.PI / 2).translate(hubX / 2, 0, 0), armM); wh.steer.add(stub);
    for (const [y0, dy, r] of [[0.36, -0.1, 0.02], [0.64, 0.12, 0.018]])   // lower and upper arm, two legs each
      for (const dz of [-0.2, 0.2]) add(rodG(r), armM, i, V(inX, y0, z + dz), V(hubX, dy, 0));
    // coilover: body mount up by the cage, foot on the lower arm near the hub
    // (the tops tuck under the bonnet and the engine cover: standing proud of them they read as traffic cones)
    const topY = wh.front ? 0.74 : 0.86;
    add(rodG(0.026), shockM, i, V(s * 0.44, topY + 0.02, z - 0.06), V(footX, -0.06, -0.06));
    add(helix, coilM, i, V(s * 0.44, topY, z - 0.06), V(footX, -0.02, -0.06));
  });
  return links;
}

function buildWheelSpare(spec, env) {
  const g = buildWheel(spec, env); g.scale.setScalar(0.92); return g;
}

function buildCockpit(spec, env, grid, cabU) {
  const g = new THREE.Group(), [ex, ey, ez] = spec.eye, [wx, wy, wz] = spec.wheelPos, dz = spec.dashZ;
  const S = spec.stations, section = S.find(s => s.z >= spec.marks.cowl), halfW = spec.open ? 0.42 : S[4].wb * 0.98;   // (the buggy's bonnet falls away at the sides: a full-width dash poked through it)
  const dashTop = section.belt + 0.015, sport = spec.id === 'sport', rally = spec.id === 'rally';
  const trim = (color, rough = 0.85) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, cabU);
      sh.vertexShader = CABIN_VERT + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + CABIN_POS);
      sh.fragmentShader = cabinGLSL(spec) + sh.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + CABIN_LIGHT);
    };
    m.customProgramCacheKey = () => 'cabin' + spec.id;
    return m;
  };
  const darkM = trim(0x14151a), chrome = trim(0xa4a7ad, 0.4);
  const dashM = trim(sport ? 0x3e4049 : 0x52555e), softM = trim(sport ? 0x8a2420 : 0x62656e);

  // dash: a curved extrusion across the car, seen from the driver's seat
  const sh = new THREE.Shape();
  sh.moveTo(0.22, 0); sh.lineTo(0.22, -0.32); sh.quadraticCurveTo(0.1, -0.4, -0.08, -0.38);
  sh.lineTo(-0.34, -0.3); sh.quadraticCurveTo(-0.44, -0.26, -0.43, -0.18);
  sh.quadraticCurveTo(-0.4, -0.04, -0.2, 0); sh.closePath();
  const dash = new THREE.ExtrudeGeometry(sh, { depth: halfW * 2, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 10 });
  dash.rotateY(-Math.PI / 2); dash.translate(halfW, dashTop, dz);
  // an old car's dash is a thin steel shelf: squash it from the top down so it doesn't wall off the bonnet
  if (spec.dashThin) dash.translate(0, -dashTop, 0).scale(1, spec.dashThin, 1).translate(0, dashTop - 0.03, 0);
  const dashMesh = new THREE.Mesh(dash, dashM); dashMesh.castShadow = false; g.add(dashMesh);

  // the gauges sit in the gap between the wheel's hub and the top of its rim, as seen from the seat
  const wheelY = spec.wheelY ?? dashTop - 0.1, R0 = rally ? 0.165 : sport ? 0.17 : spec.kind === 'tractor' ? 0.21 : 0.19, dialZ = dz - 0.445;
  const dep = (dialZ - ez) / (wz - ez), dialY = Math.min(dashTop - 0.02, (ey - (ey - wheelY - 0.05) * dep + ey - (ey - wheelY - R0) * dep) / 2);
  const bn = new THREE.CylinderGeometry(0.19, 0.2, 0.16, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  bn.scale(1.25, 0.62, 1); bn.translate(wx, dialY + 0.015, dialZ - 0.01);
  const binM = trim(0x24262c); binM.side = THREE.DoubleSide; g.add(new THREE.Mesh(bn, binM));
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.2).rotateY(Math.PI).translate(wx, dialY - 0.02, dialZ + 0.012), trim(0x101114, 0.9)); g.add(backing);

  const maxKmh = spec.maxKmh ?? (sport ? 360 : spec.id === 'monster' ? 180 : 240);
  const rpmMax = Math.ceil(spec.phys.redline / 1000) + 1;
  const dial = (tex, x) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.078, 40), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true })); d.position.set(x, dialY, dialZ); d.rotation.y = Math.PI; g.add(d);
    const pivot = new THREE.Group(); pivot.position.copy(d.position); pivot.rotation.copy(d.rotation); pivot.translateZ(0.006);
    const n = new THREE.Mesh(box(0.005, 0.068, 0.001, 0, 0.03, 0), new THREE.MeshBasicMaterial({ color: 0xff4830 })); pivot.add(n);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.011, 14), new THREE.MeshBasicMaterial({ color: 0x24262a })); cap.position.z = 0.002; pivot.add(cap);
    g.add(pivot); return pivot;
  };
  const speedN = dial(dialFace('km/h', maxKmh, maxKmh >= 300 ? 60 : 40, maxKmh >= 300 ? 20 : 10), wx + 0.09);
  const rpmN = dial(dialFace('x1000 ot', rpmMax, 1, 0.5, spec.phys.redline / 1000), wx - 0.09);

  // centre stack
  const cx = wx > 0 ? 0 : 0;
  g.add(new THREE.Mesh(roundedBox(0.3, 0.2, 0.05, cx, dashTop - 0.22, dz - 0.425), trim(0x141518, 0.5)));
  for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).rotateX(Math.PI / 2).translate(cx - 0.08 + i * 0.08, dashTop - 0.24, dz - 0.46), chrome));
  for (const x of [cx - 0.1, cx + 0.1]) g.add(new THREE.Mesh(box(0.11, 0.04, 0.02, x, dashTop - 0.095, dz - 0.425), darkM));
  const console = new THREE.Mesh(roundedBox(0.24, 0.18, 0.9, cx, dashTop - 0.5, dz - 0.72), softM); g.add(console);
  const shifter = new THREE.Group();
  shifter.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.16, 8).translate(0, 0.08, 0), chrome));
  shifter.add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10).translate(0, 0.17, 0), darkM));
  shifter.position.set(cx, dashTop - 0.41, dz - 0.82); shifter.rotation.x = -0.2; g.add(shifter);

  // steering wheel
  const wheel = new THREE.Group(), R = R0;
  const rim = new THREE.TorusGeometry(R, 0.016, 12, 44);
  wheel.add(new THREE.Mesh(rim, trim(0x2a2b30, 0.7)));
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.032, 18).rotateX(Math.PI / 2), trim(0x303238, 0.6)));
  for (const a of [Math.PI / 2 * 3, 0.2, Math.PI - 0.2]) {
    const s = new THREE.Mesh(box(R - 0.04, 0.03, 0.012, R / 2, 0, 0), trim(rally ? 0x9aa0a8 : 0x3a3c42, 0.5)); s.rotation.z = a; wheel.add(s);
  }
  // rim marker at twelve o'clock, helps feel the angle
  const mark = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0172, 8, 8, 0.12).rotateZ(Math.PI / 2 - 0.06), trim(rally ? 0xe8c820 : 0xc33028, 0.6)); wheel.add(mark);
  const tilt = spec.wheelTilt ?? 0.32;
  const wheelHolder = new THREE.Group(); wheelHolder.position.set(wx, wheelY, wz); wheelHolder.rotation.x = tilt; wheelHolder.add(wheel); g.add(wheelHolder);
  // (a tractor's column stands up out of the floor, a car's comes out of the dash)
  const colL = spec.wheelY ? 0.55 : 0.36;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.04, colL, 12).rotateX(Math.PI / 2 + tilt)
    .translate(wx, spec.wheelY ? wheelY - Math.sin(tilt) * colL / 2 : wheelY + 0.06, spec.wheelY ? wz + Math.cos(tilt) * colL / 2 : wz + 0.2), trim(0x1d1e22, 0.7)); g.add(column);

  // airbag: packed in the hub until a hard frontal hit, then fires and sags
  const bagG = new THREE.SphereGeometry(1, 44, 30), bp = bagG.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), a = Math.atan2(y, x), r = Math.hypot(x, y);
    const k = 1 + r * (0.05 * Math.sin(a * 11 + z * 3) + 0.03 * Math.sin(a * 23 + r * 7));
    bp.setXYZ(i, x * k, y * k, z * k);
  }
  bagG.computeVertexNormals();
  const bag = new THREE.Mesh(bagG, trim(0xe6e2d8, 1)); bag.visible = false; wheelHolder.add(bag);

  // hands in driving gloves, at quarter to three; driver collects the body so it can step out
  const driver = [];
  const glove = trim(0x3a3532, 0.85);
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), glove); palm.scale.set(0.95, 1.2, 0.8); h.add(palm);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.04, 4, 8), glove); f.position.set(s * -0.03, 0.03 - i * 0.024, -0.018); f.rotation.z = Math.PI / 2; h.add(f); }
    h.position.set(s * R, 0.02, -0.012); wheel.add(h); driver.push(h);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.027, 1, 12), trim(rally ? 0x6e2420 : 0x39404e, 0.95));
    arm.userData = { hand: h, side: s }; g.add(arm); driver.push(arm); wheelHolder.userData.arms = [...(wheelHolder.userData.arms || []), arm];
  }

  // the rest of the driver, only drawn from outside (the cockpit camera sits in its head): torso, head,
  // and a helmet in the open buggy. Layer 1, so the rear-view mirror doesn't see the back of it.
  const outside = [];
  {
    const shirt = trim(rally ? 0x6e2420 : 0x39404e, 0.95), skin = trim(0xc99a7a, 0.7);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), shirt);
    torso.scale.set(1.15, 1, 0.75); torso.position.set(ex, ey - 0.4, ez - 0.1); torso.rotation.x = -0.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), spec.open ? trim(0xeeeeea, 0.3) : skin);
    head.position.set(ex, ey + 0.02, ez - 0.04); if (spec.open) head.scale.setScalar(1.22);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10), skin); neck.position.set(ex, ey - 0.1, ez - 0.06);
    const parts = [torso, head, neck];
    if (spec.open) {   // visor
      const vis = new THREE.Mesh(new THREE.SphereGeometry(0.129, 16, 8, -1.1, 2.2, 1.1, 0.75), trim(0x15171c, 0.1));
      vis.rotation.y = 0; vis.position.copy(head.position); parts.push(vis);
    }
    for (const s of [-1, 1]) {   // upper arms down from the shoulders to the elbows the forearms reach
      const a = new THREE.Vector3(ex + s * 0.2, ey - 0.26, ez - 0.08), b = new THREE.Vector3(ex + s * 0.33, ey - 0.6, ez + 0.06), d = b.clone().sub(a);
      const u = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, d.length(), 10), shirt);
      u.position.copy(a).addScaledVector(d, 0.5); u.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parts.push(u);
    }
    for (const p of parts) { p.layers.set(1); p.visible = false; g.add(p); outside.push(p); }
  }

  // the footwell: carpet, pedals and the driver's legs
  const floorY = S[4].low + 0.09;
  g.add(new THREE.Mesh(box(S[4].w * 1.86, 0.02, spec.marks.cowl - spec.marks.doorR - 0.1, 0, floorY, (spec.marks.cowl + spec.marks.doorR) / 2), trim(0x35363b, 1)));
  g.add(new THREE.Mesh(box(S[4].w * 1.86, dashTop - 0.3 - floorY, 0.03, 0, (dashTop - 0.3 + floorY) / 2, dz + 0.12), trim(0x2b2c31, 1)));
  const limb = (a, b, r0, r1, mat) => {
    const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), l = d.length();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, l, 12), mat); c.position.copy(A).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(c); driver.push(c);
  };
  const legM = trim(0x33363e, 0.95), shoeM = trim(0x26262a, 0.8), pedalZ = dz - 0.2;
  [[ex - 0.12, 0, 0.12], [ex + 0.08, 1, 0.1], [ex + 0.2, 2, 0.1]].forEach(([x, , w]) => {
    const pad = new THREE.Mesh(box(w * 0.7, 0.11, 0.02, x, floorY + 0.15, pedalZ), chrome); pad.rotation.x = -0.25; g.add(pad);
  });
  for (const s of [-1, 1]) {
    const hipX = ex + s * 0.1, kneeX = ex + s * 0.14, footX = ex + (s < 0 ? -0.12 : 0.15);
    // (sitting low on the floor of an open car the legs lie out flat under the wheel, knees barely up)
    const hip = [hipX, ey - 0.6, ez + 0.1], knee = [kneeX, Math.max(ey - 0.56, floorY + (spec.open ? 0.12 : 0.34)), (ez + pedalZ) / 2 + 0.06], ankle = [footX, floorY + 0.1, pedalZ - 0.17];
    limb(hip, knee, 0.082, 0.06, legM); limb(knee, ankle, 0.056, 0.042, legM);
    limb(ankle, [footX, floorY + 0.09, pedalZ - 0.01], 0.04, 0.034, shoeM);
  }
  if (spec.kind === 'hatch') {   // rear bench
    g.add(new THREE.Mesh(roundedBox(1.4, 0.14, 0.5, 0, S[4].low + 0.26, -1.06, 0.05), softM));
    g.add(new THREE.Mesh(roundedBox(1.4, 0.5, 0.1, 0, S[4].low + 0.54, -1.3, 0.05), softM));
  }

  // seats, plus a roof cage where it fits the car
  if (rally || spec.id === 'monster') {
    const bar = trim(rally ? 0xc4b41c : 0x9ca0a8, 0.45);
    const tube = (a, b, r = 0.015) => {
      const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), l = v.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), bar); c.position.set(...a).addScaledVector(v, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(c);
    };
    const top = S[4].belt + (S[4].top - S[4].belt) * 0.84 - 0.03, w = S[4].wt * 0.98, w2 = S[4].wb * 0.97, fz = spec.marks.roofF - 0.02, rz = -0.56;
    for (const s of [-1, 1]) { tube([s * w, top, fz], [s * w, top, rz]); tube([s * w, top, rz], [s * w2, S[4].belt - 0.32, rz]); }
    tube([-w, top, rz], [w, top, rz]);
  }
  const near = z => grid.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
  let mirrorPlane;
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.03, envMap: env, envMapIntensity: 1.3 });
  if (spec.open) {
    // no roof: the mirror's glass sits in the housing on the cage's front bar (buildBuggy)
    mirrorPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.045).rotateY(Math.PI), mirrorMat);
    mirrorPlane.position.set(0, S[4].top - 0.1, 0.05 - 0.027); g.add(mirrorPlane);
  } else {
  // visors and rear-view mirror
  // header rail: a moulded frame across the top of the screen, pillar to pillar. Cut from the same
  // grid as the body so it sits exactly under the glass, and it carries the visors and the mirror.
  const crownY = z => { const r = near(z).ring; return r[r.length - 1][1]; };
  // (only cells up at roof height: on an upright screen the band ahead of the roof line IS the glass)
  const zH = spec.marks.roofF, headerM = trim(0x7c7e84), frame = grid.filter(c => c.z >= zH - 0.12 && c.z <= zH + 0.2 && crownY(c.z) > crownY(zH) - 0.18);
  headerM.side = THREE.DoubleSide;
  const across = [];
  for (let r = RAIL_ROW - 1; r < ROWS - 1; r++) across.push([r, -1]);
  for (let r = ROWS - 1; r >= RAIL_ROW - 1; r--) across.push([r, 1]);
  const hp = [], hi = [], W = across.length;
  for (const c of frame) for (const [r, sd] of across) hp.push(c.ring[r][0] * sd * 0.985, c.ring[r][1] - 0.014, c.z);
  for (let a = 0; a < frame.length - 1; a++) for (let b = 0; b < W - 1; b++) { const q = a * W + b; hi.push(q, q + 1, q + W, q + 1, q + W + 1, q + W); }
  const headerG = new THREE.BufferGeometry(); headerG.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); headerG.setIndex(hi); headerG.computeVertexNormals();
  g.add(new THREE.Mesh(headerG, headerM));
  const edge = (frame.length - 1) * W;
  for (let b = 0; b < W - 1; b++) {
    const P = k => [hp[(edge + k) * 3], hp[(edge + k) * 3 + 1], hp[(edge + k) * 3 + 2]];
    limb(P(b), P(b + 1), 0.015, 0.015, headerM);
  }
  // visors fold flat against the roof lining, a little behind the rail: same cloth as the lining so
  // they read as part of the roof, with a stitched rim, a pivot rod and a pocket strap for papers
  const zV = zH - 0.1, visorTilt = Math.atan2(crownY(zV - 0.1) - crownY(zV + 0.1), 0.2);
  const visorM = trim(0x9a978f, 0.95), rimM = trim(0x2a2b2f, 0.9);
  // a flat plate with rounded corners in plan (roundedBox rounds the thin edge instead)
  const plate = (w, d, t, r, y) => {
    const a = w / 2, b = d / 2, sh = new THREE.Shape();
    sh.moveTo(-a + r, -b); sh.lineTo(a - r, -b); sh.quadraticCurveTo(a, -b, a, -b + r); sh.lineTo(a, b - r); sh.quadraticCurveTo(a, b, a - r, b);
    sh.lineTo(-a + r, b); sh.quadraticCurveTo(-a, b, -a, b - r); sh.lineTo(-a, -b + r); sh.quadraticCurveTo(-a, -b, -a + r, -b);
    return new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2).translate(0, y, 0);
  };
  for (const s of [-1, 1]) {
    const v = new THREE.Group();
    v.add(new THREE.Mesh(plate(0.3, 0.19, 0.012, 0.045, 0), visorM));
    v.add(new THREE.Mesh(plate(0.314, 0.204, 0.008, 0.052, -0.004), rimM));
    v.add(new THREE.Mesh(plate(0.2, 0.012, 0.004, 0.004, 0.012).translate(0, 0, -0.05), rimM));
    v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 8).rotateZ(Math.PI / 2).translate(-s * 0.15, 0.004, 0.105), chrome));
    v.position.set(s * 0.27, crownY(zV) - 0.04, zV); v.rotation.x = visorTilt; g.add(v);
  }
  // mirror hangs from the rail on a short stalk
  // on an upright screen there is no roof ahead of the rail to hang it from: it goes just behind the rail
  let zM = zH + 0.17; if (crownY(zM) < crownY(zH) - 0.18) zM = zH - 0.05;
  const mY = crownY(zM) - 0.016;
  g.add(new THREE.Mesh(roundedBox(0.09, 0.03, 0.05, 0, mY - 0.012, zM, 0.012), headerM));
  g.add(new THREE.Mesh(box(0.016, 0.05, 0.016, 0, mY - 0.045, zM), darkM));
  g.add(new THREE.Mesh(roundedBox(0.23, 0.066, 0.026, 0, mY - 0.095, zM), trim(0x202228)));
  mirrorPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.212, 0.052).rotateY(Math.PI), mirrorMat);
  mirrorPlane.position.set(0, mY - 0.095, zM - 0.0145); g.add(mirrorPlane);
  // A-pillar trim follows the sheet: built from the same grid so it covers the pillar exactly. Kept
  // fully inside the glass; on the supercar it's dark, its red leather read as paint from outside.
  const pillarM = sport ? trim(0x1c1d22, 0.8) : softM;
  for (const side of [-1, 1]) {
    const ring = n => { const c = near(n).ring, p = c[RAIL_ROW - 1], q = c[RAIL_ROW]; return [p[0] * side, (p[1] + q[1]) / 2, n]; };
    const pts = [], N = 12, z0 = spec.marks.cowl - 0.1, z1 = spec.marks.slope ? spec.marks.roofR - 0.5 : Math.max(spec.marks.doorR, spec.marks.roofR + 0.1);
    for (let i = 0; i <= N; i++) pts.push(ring(z0 + (z1 - z0) * i / N));
    for (let i = 0; i < N; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
      const d = new THREE.Vector3(bx - ax, by - ay, bz - az), l = d.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, l + 0.012, 10), pillarM);
      c.position.set((ax + bx) / 2 - side * 0.03, (ay + by) / 2 - 0.012, (az + bz) / 2);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); c.scale.set(0.7, 1, 1.25); g.add(c);
    }
    // soft round ends instead of a flat cut
    for (const [px, py, pz] of [pts[0], pts[N]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), pillarM); e.position.set(px - side * 0.03, py - 0.012, pz); e.scale.set(0.7, 1, 1.25); g.add(e); }
  }
  }

  // door cards, so the side of the view is not bare sheet metal. They're placed against the sheet as
  // it really runs: a flank that tucks in towards the belt (the supercar's) let fixed ones poke out.
  const flankX = (z, y) => {
    const r = near(z).ring; let x = 0;
    for (let k = 0; k < RAIL_ROW; k++) {
      const a = r[k], b = r[k + 1];
      if (a[1] !== b[1] && (a[1] - y) * (b[1] - y) <= 0) x = Math.max(x, a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
    }
    return x || S[4].w;
  };
  const flankMin = (z0, z1, y0, y1) => {
    let x = 9;
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 6; j++) x = Math.min(x, flankX(z0 + (z1 - z0) * i / 10, y0 + (y1 - y0) * j / 6));
    return x;
  };
  const beltY = z => near(z).ring[BELT_ROW][1];
  const rod = (a, b, r, mat) => {
    const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), l = d.length();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l + 0.004, 8), mat); c.position.copy(A).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(c);
  };
  if (!spec.open) {
    const zc = (ez + dz) * 0.28, z0 = zc - 0.6, z1 = zc + 0.6, bot = S[4].belt - 0.52;
    let bMin = 9; for (let i = 0; i <= 10; i++) bMin = Math.min(bMin, beltY(z0 + 1.2 * i / 10));
    const topC = Math.min(S[4].belt - 0.02, bMin - 0.03), cx = flankMin(z0, z1, bot, topC) - 0.045;
    const zr = ez + 0.02, ry = S[4].belt - 0.2, rx = flankMin(zr - 0.25, zr + 0.25, ry - 0.025, ry + 0.025) - 0.09;
    // the sill trim follows the belt line from the door's back edge up to the screen
    // (on the supercar the belt runs on, past the seats, to the rear deck: the rod is pulled out to there)
    const zBack = spec.marks.slope ? spec.marks.tail + 0.3 : spec.marks.doorR;
    const sill = grid.filter(c => c.z >= zBack && c.z <= spec.marks.cowl - 0.04);
    for (const s of [-1, 1]) {
      g.add(new THREE.Mesh(roundedBox(0.04, topC - bot, 1.2, s * cx, (topC + bot) / 2, zc), softM));
      g.add(new THREE.Mesh(roundedBox(0.09, 0.05, 0.5, s * rx, ry, zr), trim(0x2f3137, 0.8)));
      const P = c => { const p = c.ring[BELT_ROW]; return [s * (p[0] - 0.035), p[1] - 0.01, c.z]; };
      for (let i = 0; i < sill.length - 1; i++) rod(P(sill[i]), P(sill[i + 1]), 0.014, darkM);
      // round caps so no end of a rod is ever a bare cut
      for (const c of [sill[0], sill[sill.length - 1]]) { const p = P(c); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6).translate(...p), darkM)); }
    }
  }
  // seat backs visible in exterior views through the glass
  for (const s of [-1, 1]) {
    const seat = new THREE.Group();
    seat.add(new THREE.Mesh(roundedBox(0.46, 0.14, 0.5, 0, 0, 0, 0.05), softM));
    const back = new THREE.Mesh(roundedBox(0.46, 0.72, 0.12, 0, 0.36, -0.25, 0.05), softM); back.rotation.x = -0.14; seat.add(back);
    seat.add(new THREE.Mesh(roundedBox(0.22, 0.2, 0.09, 0, 0.8, -0.32, 0.03), softM));
    seat.position.set(s * ex, ey - 0.74, ez - 0.02); seat.traverse(o => o.layers.set(1)); g.add(seat);   // layer 1: left out of the mirror
  }

  // cracks, mud and wiper clear patches are painted on this sheet, just inside the screen
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d'), crackTex = new THREE.CanvasTexture(cv); crackTex.colorSpace = THREE.SRGBColorSpace;
  const cz = spec.marks.cowl, fz = spec.marks.roofF, b0 = S.find(s => s.z >= cz).belt + 0.09, t0 = S.find(s => s.z >= fz).top - 0.08;
  const len = Math.hypot(cz - fz, t0 - b0), wsW = S[5].wb * 1.74;
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(wsW, len), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1, fog: false }));
  ws.position.set(0, (b0 + t0) / 2, (cz + fz) / 2 - 0.035); ws.rotation.x = -Math.atan2(cz - fz, t0 - b0) + 0; ws.rotation.order = 'YXZ'; ws.rotation.y = Math.PI;
  ws.rotation.x = Math.atan2(cz - fz, t0 - b0); ws.renderOrder = 6;
  g.add(ws); if (spec.open) ws.visible = false;   // no screen: the sheet stays only so the damage code has one
  // water drops live on their own sheet, so they can run off without taking the cracks along
  const dropCv = document.createElement('canvas'); dropCv.width = 512; dropCv.height = 256;
  const dropCtx = dropCv.getContext('2d'), dropTex = new THREE.CanvasTexture(dropCv); dropTex.colorSpace = THREE.SRGBColorSpace;
  const drops = new THREE.Mesh(ws.geometry, new THREE.MeshBasicMaterial({ map: dropTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  drops.position.z = 0.002; drops.renderOrder = 7; ws.add(drops);

  return { group: g, wheel, wheelHolder, speedN, rpmN, shifter, maxKmh, rpmMax, ws, crackCtx: ctx, crackCv: cv, crackTex, dropCv, dropCtx, dropTex, mirrorPlane, bag, driver, outside, eye: new THREE.Vector3(ex, ey, ez), R };
}
