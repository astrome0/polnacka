// Everyday cars for the traffic. Built by the same lofting as the player's cars (cars.js), then baked:
// every piece is merged by material family into a handful of meshes (one for the paint, one for the
// glass, one matte, one metal, the lamps, the plate) and each wheel into two, so a street full of them
// stays cheap on an integrated GPU. A person (people.js) sits at the wheel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARS, buildCar } from './cars.js';

const st = (z, low, mid, w, belt, wb, top, wt) => ({ z, low, mid, w, belt, wb, top, wt });
const civPhys = (mass, extra = {}) => ({ mass, comY: 0.52, I: [mass * 1.5, mass * 1.85, mass * 0.52], k: mass * 26, c: mass * 2.7, travel: 0.2, torque: 300, redline: 6200, idle: 800, gears: [3.5, 2.1, 1.4, 1.05, 0.85], final: 3.9, drive: 'rwd', mu: 1.0, nitro: 0, brake: 3200, top: 50, offroad: 0.8, mudGrip: 0.3, mudDig: 1.2, mudRes: 1.6, mudSink: 1, ...extra });
const base = { lens: [0.17, 0.065, 0.05], lampX: 0.66, roughness: 0.32, trim: 0x1c1d21, wheel: { r: 0.31, w: 0.21, rim: 0xc4c7cc, spokes: 5 }, track: 0.78 };

// paint each body type is likely to wear
const MODERN = [0xbfc3c8, 0x1f2c44, 0x7c1c1c, 0xe6e6e2, 0x2f3338, 0x38604a, 0xa58a5a, 0x1d4fb4, 0x8a8f96, 0x101114, 0x5a1a2a, 0xd8d4c8];
const OLD = [0xd9c9a0, 0x7a9cb8, 0xe8e2d0, 0xc8501e, 0x5a7a3a, 0xb83a2a, 0xe0b040, 0x3a5a8a];

export const CIVIL = [
  {
    // a family hatchback: the rally car's shape, plain wheels, no kit
    ...CARS[0], ...base, id: 'civ_hatch', name: 'Hatchback', hwRoll: false, plate: '4P1 2210', wheel: { r: 0.31, w: 0.2, rim: 0xc4c7cc, spokes: 5 }, track: 0.78,
    phys: civPhys(1150), weight: 3, colors: MODERN,
  },
  {
    // a three-box saloon: bonnet, cabin with a B-pillar, a proper boot behind the rear screen
    ...base, id: 'civ_sedan', name: 'Sedan', kind: 'hatch', plate: '2AB 4471', weight: 3, colors: MODERN,
    stations: [
      st(-2.3, 0.42, 0.6, 0.62, 0.82, 0.56, 0.84, 0.42), st(-2.26, 0.34, 0.62, 0.8, 0.9, 0.74, 0.93, 0.56), st(-2.0, 0.28, 0.62, 0.86, 0.94, 0.8, 0.98, 0.62),
      st(-1.4, 0.27, 0.62, 0.88, 0.96, 0.82, 1.0, 0.64), st(-0.85, 0.27, 0.62, 0.9, 0.96, 0.83, 1.38, 0.62), st(0.0, 0.27, 0.62, 0.9, 0.95, 0.83, 1.43, 0.64),
      st(0.8, 0.27, 0.62, 0.9, 0.93, 0.82, 1.0, 0.66), st(1.5, 0.28, 0.6, 0.88, 0.82, 0.78, 0.86, 0.62), st(2.12, 0.3, 0.56, 0.8, 0.72, 0.68, 0.75, 0.52), st(2.3, 0.38, 0.54, 0.62, 0.64, 0.52, 0.66, 0.38),
    ],
    marks: { cowl: 0.85, roofF: 0.2, roofR: -0.78, tail: -1.42, doorF: 0.7, doorR: -1.15, bumpF: 2.12, bumpR: -2.12, pillars: [[-0.32, -0.2]], hoodEnd: 2.25 },
    axle: { f: 1.45, r: -1.38 }, eye: [0.38, 1.12, -0.35], wheelPos: [0.38, 0.88, 0.18], dashZ: 0.85, phys: civPhys(1350),
  },
  {
    // the same saloon stretched into an estate: roof all the way back, a big tailgate window
    ...base, id: 'civ_estate', name: 'Kombi', kind: 'hatch', plate: '6T8 0930', weight: 2, colors: MODERN,
    stations: [
      st(-2.32, 0.42, 0.62, 0.66, 0.88, 0.6, 1.26, 0.5), st(-2.28, 0.34, 0.63, 0.82, 0.93, 0.76, 1.32, 0.56), st(-2.0, 0.28, 0.62, 0.86, 0.95, 0.8, 1.37, 0.6),
      st(-1.4, 0.27, 0.62, 0.88, 0.96, 0.82, 1.4, 0.62), st(-0.85, 0.27, 0.62, 0.9, 0.96, 0.83, 1.41, 0.63), st(0.0, 0.27, 0.62, 0.9, 0.95, 0.83, 1.43, 0.64),
      st(0.8, 0.27, 0.62, 0.9, 0.93, 0.82, 1.0, 0.66), st(1.5, 0.28, 0.6, 0.88, 0.82, 0.78, 0.86, 0.62), st(2.12, 0.3, 0.56, 0.8, 0.72, 0.68, 0.75, 0.52), st(2.3, 0.38, 0.54, 0.62, 0.64, 0.52, 0.66, 0.38),
    ],
    marks: { cowl: 0.85, roofF: 0.2, roofR: -1.95, tail: -2.2, doorF: 0.7, doorR: -1.15, bumpF: 2.12, bumpR: -2.14, pillars: [[-0.32, -0.2], [-1.3, -1.18]], hoodEnd: 2.25 },
    axle: { f: 1.45, r: -1.4 }, eye: [0.38, 1.12, -0.35], wheelPos: [0.38, 0.88, 0.18], dashZ: 0.85, phys: civPhys(1450),
  },
  {
    // an old boxy rear-engined saloon from the seventies: narrow, upright glass, flat sides, thin wheels
    ...base, id: 'civ_old', name: 'Stará škodovka', kind: 'hatch', plate: 'PHA 12-34', weight: 2, colors: OLD, roughness: 0.5, lamps: { y: 0.62, x: 0.5, r: 0.085 },
    wheel: { r: 0.3, w: 0.16, rim: 0xd8d8d2, spokes: 4 }, track: 0.7,
    stations: [
      st(-2.08, 0.4, 0.6, 0.7, 0.84, 0.68, 0.88, 0.56), st(-2.05, 0.33, 0.62, 0.78, 0.9, 0.76, 0.95, 0.66), st(-1.85, 0.3, 0.62, 0.8, 0.92, 0.78, 0.97, 0.7),
      st(-1.35, 0.3, 0.62, 0.8, 0.93, 0.78, 0.98, 0.7), st(-0.88, 0.3, 0.62, 0.8, 0.93, 0.78, 1.38, 0.7), st(0.0, 0.3, 0.62, 0.8, 0.93, 0.78, 1.4, 0.7),
      st(0.72, 0.3, 0.62, 0.8, 0.92, 0.78, 0.98, 0.72), st(1.5, 0.31, 0.6, 0.8, 0.86, 0.77, 0.9, 0.7), st(1.98, 0.33, 0.6, 0.76, 0.8, 0.72, 0.84, 0.64), st(2.05, 0.4, 0.58, 0.68, 0.74, 0.62, 0.76, 0.54),
    ],
    marks: { cowl: 0.76, roofF: 0.4, roofR: -0.82, tail: -1.12, doorF: 0.62, doorR: -0.95, bumpF: 1.92, bumpR: -1.96, pillars: [[-0.24, -0.14]], hoodEnd: 2.0 },
    axle: { f: 1.3, r: -1.25 }, eye: [0.36, 1.13, -0.3], wheelPos: [0.36, 0.9, 0.2], dashZ: 0.78, phys: civPhys(950, { top: 38, torque: 180 }),
  },
  {
    // an SUV: tall, square-shouldered, big wheels
    ...base, id: 'civ_suv', name: 'SUV', kind: 'hatch', plate: '9S3 7712', weight: 2, colors: MODERN, lampY: 1.0,
    wheel: { r: 0.39, w: 0.26, rim: 0x55585e, spokes: 6 }, track: 0.84,
    stations: [
      st(-2.28, 0.6, 0.86, 0.72, 1.1, 0.66, 1.56, 0.56), st(-2.24, 0.48, 0.88, 0.86, 1.16, 0.8, 1.66, 0.64), st(-2.0, 0.44, 0.88, 0.92, 1.18, 0.86, 1.72, 0.68),
      st(-1.4, 0.44, 0.88, 0.94, 1.19, 0.88, 1.76, 0.7), st(-0.85, 0.44, 0.88, 0.95, 1.19, 0.88, 1.77, 0.71), st(0.0, 0.44, 0.88, 0.95, 1.18, 0.88, 1.78, 0.72),
      st(0.85, 0.44, 0.88, 0.95, 1.17, 0.88, 1.28, 0.76), st(1.55, 0.45, 0.86, 0.94, 1.1, 0.86, 1.16, 0.72), st(2.12, 0.47, 0.82, 0.86, 1.0, 0.76, 1.04, 0.6), st(2.28, 0.54, 0.8, 0.7, 0.92, 0.6, 0.94, 0.46),
    ],
    marks: { cowl: 0.9, roofF: 0.3, roofR: -1.95, tail: -2.18, doorF: 0.78, doorR: -1.2, bumpF: 2.12, bumpR: -2.14, pillars: [[-0.32, -0.2], [-1.36, -1.24]], hoodEnd: 2.25 },
    axle: { f: 1.48, r: -1.42 }, eye: [0.4, 1.55, -0.3], wheelPos: [0.4, 1.25, 0.25], dashZ: 0.95, phys: civPhys(1900, { comY: 0.78, travel: 0.26, drive: 'awd', torque: 440, brake: 4000 }),
  },
  {
    // the farm pickup, without the winch and hay
    ...CARS[1], id: 'civ_pickup', name: 'Pickup', plate: '3J6 5520', weight: 2, colors: [0x2a5d4a, 0xe6e6e2, 0x1f2c44, 0x7c1c1c, 0x8a8f96, 0x2f3338],
    wheel: { ...CARS[1].wheel, rim: 0x9a9da3 }, phys: civPhys(2100, { comY: 0.84, travel: 0.3, torque: 460, brake: 4400 }),
  },
  {
    // a panel van: a short bonnet, a raked screen, windows only in the cab doors, the rest is a painted box
    ...base, id: 'civ_van', name: 'Dodávka', kind: 'hatch', plate: '1AV 3307', weight: 2, colors: [0xe8e8e4, 0xd6d9dc, 0x2c5a90, 0xc8141e, 0xe8e8e4, 0x2a5d4a], lampY: 0.74,
    wheel: { r: 0.36, w: 0.23, rim: 0x9a9da3, spokes: 6 }, track: 0.86, noFender: true,
    stations: [
      st(-2.6, 0.42, 0.7, 0.9, 1.15, 0.88, 2.15, 0.84), st(-2.56, 0.38, 0.72, 0.96, 1.18, 0.95, 2.22, 0.9), st(-2.3, 0.36, 0.72, 0.98, 1.2, 0.97, 2.25, 0.92),
      st(-1.0, 0.36, 0.72, 0.98, 1.2, 0.97, 2.26, 0.92), st(0.2, 0.36, 0.72, 0.98, 1.2, 0.97, 2.26, 0.92), st(0.9, 0.36, 0.72, 0.98, 1.2, 0.96, 2.24, 0.9),
      st(1.45, 0.37, 0.72, 0.97, 1.18, 0.94, 1.62, 0.86), st(1.95, 0.38, 0.7, 0.95, 1.08, 0.9, 1.18, 0.84), st(2.45, 0.4, 0.66, 0.9, 0.95, 0.84, 0.98, 0.74), st(2.6, 0.46, 0.62, 0.8, 0.88, 0.72, 0.9, 0.6),
    ],
    marks: { cowl: 1.55, roofF: 0.95, roofR: 0.0, tail: -0.01, doorF: 1.4, doorR: 0.2, bumpF: 2.45, bumpR: -2.45, pillars: [], hoodEnd: 2.55 },
    axle: { f: 1.85, r: -1.75 }, eye: [0.45, 1.75, 0.55], wheelPos: [0.45, 1.4, 0.98], dashZ: 1.45, wheelY: 1.4, wheelTilt: 0.7,
    phys: civPhys(2300, { comY: 0.8, travel: 0.24, top: 40, torque: 420, brake: 4200 }), vmax: 22,
  },
  truckSpec('civ_truck_box', 'Kamion se skříní', 'box'),
  truckSpec('civ_truck_tarp', 'Kamion s plachtou', 'tarp'),
];

// The tow truck (odtahovka, tow.js): not in the everyday mix, sent out for a wreck that blocks the road.
export const TOW = { ...truckSpec('civ_tow', 'Odtahovka', 'tow'), weight: 0, colors: [0xf2c21b, 0xe07a12, 0xe8e8e4, 0xc8141e], hullZ: [-4.4, 4.32], vmax: 17 };

// A cab-over truck: only the cab is lofted (stations 2.05..4.32); the chassis, the load body behind it,
// mudguards, tank and rear lamps come from extra() as plain pieces baked in with the rest.
function truckSpec(id, name, load) {
  return {
    ...base, id, name, kind: 'hatch', plate: '7T2 ' + (1000 + Math.random() * 8999 | 0), weight: load === 'box' ? 1.2 : 1, noFender: true, axleInset: 0.62,
    colors: [0xe8e8e4, 0xc8141e, 0x1d4fb4, 0x2a5d4a, 0xe07a12, 0x2f3338, 0xf2c21b], lampY: 1.08, lens: [0.22, 0.09, 0.05], lampX: 0.68,
    wheel: { r: 0.52, w: 0.36, rim: 0xb0b4ba, spokes: 8 }, track: 1.02,
    stations: [
      st(2.05, 0.95, 1.4, 1.12, 1.9, 1.1, 2.88, 1.04), st(2.08, 0.92, 1.42, 1.18, 1.92, 1.16, 2.92, 1.1), st(2.3, 0.9, 1.42, 1.2, 1.94, 1.18, 2.95, 1.12),
      st(3.0, 0.9, 1.42, 1.2, 1.94, 1.18, 2.96, 1.12), st(3.4, 0.9, 1.42, 1.2, 1.94, 1.18, 2.96, 1.12), st(3.9, 0.9, 1.42, 1.2, 1.94, 1.18, 2.95, 1.12),
      st(4.12, 0.9, 1.42, 1.2, 1.92, 1.17, 2.9, 1.1), st(4.22, 0.92, 1.4, 1.18, 1.86, 1.14, 2.0, 1.08), st(4.28, 0.95, 1.38, 1.14, 1.82, 1.1, 1.9, 1.0), st(4.32, 1.0, 1.36, 1.05, 1.76, 1.0, 1.82, 0.9),
    ],
    marks: { flatFront: true, cowl: 4.22, roofF: 4.1, roofR: 2.3, tail: 2.29, doorF: 4.0, doorR: 3.1, bumpF: 4.27, bumpR: 2.06,   /* (every mark must lie inside the stations: one outside made the loft extrapolate into a wall) */ pillars: [], hoodEnd: 4.3 },
    axle: { f: 3.45, r: -2.4 }, eye: [0.6, 2.55, 3.5], wheelPos: [0.6, 2.2, 3.95], dashZ: 4.08, wheelY: 2.18, wheelTilt: 1.0, wheelR: 0.23, floorY: 1.5,
    phys: civPhys(9000, { comY: 1.2, travel: 0.22, top: 28, I: [40000, 52000, 12000], torque: 1500, final: 5.2, gears: [6, 3.8, 2.4, 1.6, 1.15, 0.85], redline: 2600, idle: 600, brake: 16000, mu: 0.95 }), vmax: 18, hl: 4.3, hw: 1.25, hullZ: [-3.6, 4.32],
    extra: () => truckLoad(load),
  };
}
function truckLoad(load) {
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z), out = [];
  const add = (geo, color, fam = 'matte') => out.push({ geo, color, fam });
  for (const x of [-0.45, 0.45]) add(B(0.12, 0.24, 7.6, x, 0.82, 0.3), 0x1b1c1f);                 // frame rails
  add(B(2.3, 0.14, 0.2, 0, 0.62, 4.33), 0x22252a);                                                // front bumper
  add(new THREE.CylinderGeometry(0.26, 0.26, 1.0, 16).rotateX(Math.PI / 2).translate(-0.82, 0.78, 1.0), 0xb8bcc2, 'metal');   // fuel tank
  for (const x of [-1, 1]) { add(B(0.5, 0.05, 1.3, x * 1.02, 1.12, -2.4), 0x1b1c1f); add(B(0.04, 0.5, 0.05, x * 1.02, 0.88, -1.78), 0x1b1c1f); }  // mudguards
  const z0 = 1.95, z1 = -3.55, L = z0 - z1, zc = (z0 + z1) / 2;
  if (load !== 'tow') add(B(2.44, 0.16, L, 0, 1.12, zc), 0x2a2c30);                                 // load bed
  if (load === 'tow') {
    // a rollback deck: its own group ('deck'), which tow.js slides back and tips down to the road
    const D = (geo, color, fam = 'matte') => out.push({ geo, color, fam, grp: 'deck' });
    const zf = 2.0, zr = -4.4, DL = zf - zr, dc = (zf + zr) / 2, paint = [0xf2c21b, 0xe07a12, 0xd8d8d4][Math.random() * 3 | 0];
    D(B(2.36, 0.12, DL, 0, 1.2, dc), 0x4a4d52, 'metal');                                            // deck plate
    for (let z = zr + 0.4; z < zf - 0.3; z += 0.55) D(B(2.2, 0.03, 0.05, 0, 1.275, z), 0x6a6d72, 'metal');   // grip strips
    for (const x of [-1, 1]) { D(B(0.1, 0.18, DL, x * 1.16, 1.33, dc), paint); D(B(0.14, 0.08, DL - 0.4, x * 0.5, 1.1, dc), 0x1b1c1f); }   // side rails, runners under
    D(B(2.36, 0.06, 0.45, 0, 1.17, zr + 0.2), 0x3a3d42, 'metal');                                   // the tail lip
    D(B(2.3, 0.95, 0.08, 0, 1.73, zf - 0.04), paint);                                                // headboard
    for (const x of [-1, 1]) D(B(0.08, 1.05, 0.08, x * 1.1, 1.75, zf - 0.04), 0x1b1c1f);
    D(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 14).rotateZ(Math.PI / 2).translate(0, 1.45, zf - 0.35), 0x1b1c1f);   // winch drum
    add(B(1.1, 0.18, 5.6, 0, 1.0, -0.9), 0x1b1c1f);                                                  // subframe on the rails
    add(B(0.16, 0.16, 1.6, 0, 1.0, -2.4), 0x8a8d92, 'metal');                                        // the tilt ram
    for (const x of [-1, 1]) add(B(0.42, 0.42, 1.1, x * 1.0, 0.75, 0.2), 0x2a2c30);                 // tool boxes
    out.push({ geo: B(1.2, 0.12, 0.24, 0, 3.02, 3.3), fam: 'beacon' });                              // the orange light bar
    for (const x of [-1, 1]) out.push({ geo: B(0.24, 0.1, 0.04, x * 0.95, 0.85, -3.62), fam: 'rear' });
    add(B(2.3, 0.12, 0.1, 0, 0.62, -3.62), 0x22252a);
    return out;
  }
  if (load === 'box') {
    const col = [0xeeeeea, 0xe6e6e2, 0xd0d4d8, 0x2c5a90, 0xc8141e][Math.random() * 5 | 0];
    add(B(2.46, 2.2, L, 0, 2.3, zc), col);
    for (const z of [z0 - 0.02, z1 + 0.02]) add(B(2.5, 0.08, 0.06, 0, 3.4, z), 0x9a9da3, 'metal');
    for (const x of [-0.6, 0.6]) add(B(0.03, 2.0, 0.03, x * 0.02, 2.3, z1 - 0.01), 0x55585e);   // the rear doors' seam
    add(B(0.04, 2.0, 0.03, 0, 2.3, z1 - 0.012), 0x55585e);
  } else {
    // drop sides and a canvas tilt over three hoops
    const side = [0x3c4a2c, 0x2a5d4a, 0x55585e, 0x7a5a3a][Math.random() * 4 | 0], canvas = [0x5f6a4a, 0x2c4a6a, 0x6a6458, 0x8a7d5a][Math.random() * 4 | 0];
    for (const x of [-1, 1]) add(B(0.05, 0.5, L, x * 1.21, 1.45, zc), side);
    add(B(2.44, 0.5, 0.05, 0, 1.45, z1), side); add(B(2.44, 0.5, 0.05, 0, 1.45, z0), side);
    const sh = new THREE.Shape(), hx = 1.2, y0 = 1.7, y1 = 3.2, rr = 0.3;
    sh.moveTo(-hx, y0); sh.lineTo(hx, y0); sh.lineTo(hx, y1 - rr); sh.quadraticCurveTo(hx, y1, hx - rr, y1); sh.lineTo(-hx + rr, y1); sh.quadraticCurveTo(-hx, y1, -hx, y1 - rr); sh.closePath();
    add(new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, z1), canvas);
    for (let i = 0; i <= 4; i++) { const z = z1 + 0.05 + (L - 0.1) * i / 4; add(B(2.44, 0.04, 0.05, 0, y1 + 0.005, z), 0x2a2622); for (const x of [-1, 1]) add(B(0.03, 1.5, 0.05, x * 1.205, 2.45, z), 0x2a2622); }
  }
  // rear lamps and a plate on the back of the load
  for (const x of [-1, 1]) out.push({ geo: B(0.28, 0.12, 0.04, x * 0.95, 0.95, z1 - 0.05), fam: 'rear' });
  add(B(2.3, 0.12, 0.1, 0, 0.72, z1 - 0.02), 0x22252a);                                         // under-run bar
  return out;
}

// ---- baking ---------------------------------------------------------------------------------------
// Material families: everything that isn't paint, glass, a lamp or the plate becomes vertex colour on
// one matte or one metal material, so dozens of trim pieces cost one draw call.
const fam = {};
function family(env) {
  if (fam.matte) return fam;
  fam.matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 });
  fam.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.9, envMap: env, envMapIntensity: 0.9 });
  fam.rubber = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return fam;
}
const C = new THREE.Color();
function prep(mesh, m4, keepUv, colour) {
  let g = mesh.geometry.clone().applyMatrix4(m4);
  if (g.index) g = g.toNonIndexed();
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'aRest', 'aEdge'].includes(n) && !(keepUv && n === 'uv')) g.deleteAttribute(n);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (colour != null) {
    C.copy(colour); const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.groups = [];
  return g;
}

const LOOSE = ['bumperF', 'bumperR', 'hood', 'doorL', 'doorR', 'trunk'];
// shared: { glass, front, rear, trim } from the traffic. Returns the car as from buildCar, baked.
export function buildNpcCar(spec, env, shared) {
  const car = buildCar(spec, env, { npc: true }), F = family(env);
  for (const l of car.headL) l.material = shared.front;
  for (const t of car.tails) t.material = shared.rear;
  const root = car.root; root.updateMatrixWorld(true);
  // which wheel group a mesh belongs to, if any
  const wheelOf = o => { for (const w of car.wheels) { let p = o; while (p) { if (p === w.spinner) return w; p = p.parent; } } return null; };
  const buckets = new Map(), wheelBuckets = new Map();
  const put = (map, key, mat, geo) => { let b = map.get(key); if (!b) map.set(key, b = { mat, list: [] }); b.list.push(geo); };
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const old = [];
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    old.push(o);
    const w = wheelOf(o), mat = o.material;
    const space = w ? m4.copy(w.spinner.matrixWorld).invert().multiply(o.matrixWorld) : m4.copy(rootInv).multiply(o.matrixWorld);
    const map = w ? (wheelBuckets.get(w) || (wheelBuckets.set(w, new Map()), wheelBuckets.get(w))) : buckets;
    // the panels that can come off stay meshes of their own (traffic.js hit → loosen and drop them)
    if (mat === car.paint) return put(map, !w && LOOSE.includes(o.name) ? 'part:' + o.name : 'paint', mat, prep(o, space, false));
    if (mat === car.glass) return put(map, 'glass', shared.glass, prep(o, space, false));
    if (mat === shared.front || mat === shared.rear) return put(map, mat.uuid, mat, prep(o, space, false));
    if (mat.map) return put(map, mat.uuid, mat, prep(o, space, true));
    const metal = (mat.metalness ?? 0) > 0.5, rubber = w && !metal;
    put(map, metal ? 'metal' : rubber ? 'rubber' : 'matte', metal ? F.metal : rubber ? F.rubber : F.matte, prep(o, space, false, mat.color || C.set(0x333333)));
  });
  // the seats and a dash so the cabin isn't empty behind the glass; the driver brings his own wheel
  const S = spec.stations, [ex, ey, ez] = spec.eye, [wx, , wz] = spec.wheelPos, cowl = S.find(q => q.z >= spec.marks.cowl);
  const inner = [new THREE.BoxGeometry(S[4].wb * 1.85, 0.16, 0.42).translate(0, spec.wheelY ? spec.wheelY - 0.18 : cowl.belt - 0.06, spec.dashZ - 0.22)];
  for (const x of [-ex, ex]) inner.push(new THREE.BoxGeometry(0.46, 0.72, 0.12).translate(x, ey - 0.4, ez - 0.32), new THREE.BoxGeometry(0.24, 0.2, 0.1).translate(x, ey - 0.02, ez - 0.36));
  if (spec.kind === 'hatch') inner.push(new THREE.BoxGeometry(1.3, 0.62, 0.12).translate(0, ey - 0.42, ez - 1.0));   // rear bench back
  for (const g of inner) { const mesh = new THREE.Mesh(g); put(buckets, 'matte', F.matte, prep(mesh, m4.identity(), false, C.set(0x2a2c31))); }
  // the truck's chassis and load (truckLoad), baked in like everything else
  const groups = {}, groupBuckets = new Map();
  let beacon = null;
  if (spec.extra) for (const e of spec.extra()) {
    const mesh = new THREE.Mesh(e.geo);
    if (e.grp) {   // a part that moves on its own (the tow truck's deck): kept apart, baked into its own group
      if (!groupBuckets.has(e.grp)) groupBuckets.set(e.grp, new Map());
      put(groupBuckets.get(e.grp), e.fam, e.fam === 'metal' ? F.metal : F.matte, prep(mesh, m4.identity(), false, C.set(e.color)));
      continue;
    }
    if (e.fam === 'beacon') { beacon ||= { mat: new THREE.MeshStandardMaterial({ color: 0xff9a20, roughness: 0.3, emissive: 0xff7010, emissiveIntensity: 0 }), list: [] }; beacon.list.push(prep(mesh, m4.identity(), false)); continue; }
    if (e.fam === 'rear') put(buckets, shared.rear.uuid, shared.rear, prep(mesh, m4.identity(), false));
    else put(buckets, e.fam, e.fam === 'metal' ? F.metal : F.matte, prep(mesh, m4.identity(), false, C.set(e.color)));
  }
  // throw the pieces away, keep the groups that move (body, wheels)
  for (const o of old) { o.geometry.dispose(); o.removeFromParent(); }
  const out = {};
  for (const [key, b] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat);
    mesh.castShadow = key !== 'glass'; mesh.receiveShadow = key === 'paint'; if (key === 'glass') mesh.renderOrder = 5;
    root.add(mesh); out[key] = mesh;
  }
  for (const [name, map] of groupBuckets) {
    const g = groups[name] = new THREE.Group(); g.matrixAutoUpdate = false; root.add(g);
    for (const [, b] of map) { const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  }
  if (beacon) { const mesh = new THREE.Mesh(mergeGeometries(beacon.list), beacon.mat); root.add(mesh); beacon = beacon.mat; }
  for (const [w, map] of wheelBuckets) for (const [, b] of map) { const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat); mesh.castShadow = true; w.spinner.add(mesh); }
  // where the driver sits (people.js Driver)
  const seat = { hip: [ex, ey - 0.66, ez - 0.12], floor: spec.floorY ?? S[4].low + 0.1, foot: spec.dashZ - 0.25, wheel: [wx, spec.wheelY ?? cowl.belt + 0.015 - 0.1, wz], tilt: spec.wheelTilt ?? 0.32, R: spec.wheelR ?? 0.17 };
  // how hard a hit each loose panel takes (in speed² · 0.05) before it drops off
  const HP = { bumperF: 12, bumperR: 12, hood: 22, doorL: 24, doorR: 24, trunk: 18 }, npcParts = [];
  for (const key in out) if (key.startsWith('part:')) {
    const mesh = out[key], name = key.slice(5); mesh.geometry.computeBoundingBox();
    npcParts.push({ name, mesh, hp0: HP[name], hp: HP[name], center: mesh.geometry.boundingBox.getCenter(new THREE.Vector3()), off: false });
  }
  return { ...car, g: root, bodyMesh: out.paint, glassMesh: out.glass, npcParts, seat, groups, beacon };
}
