// Step 4b: how a traffic driver sees the road ahead and gets round what blocks it.
// Everything is measured in the driver's road frame: f = metres ahead along the road,
// u = metres right of the road's centre line (own lane at +LANE, the oncoming one at -LANE).
// States (m.st): lane → pass (round a blocker) → lane; back (reverse a few metres for room);
// turn (turn round on the road and go back); gone (given up: re-placed once you can't see it).
import { lineS, OBJ } from './world.js';

export const LANE = 2.1;
const OUT = 5.5;          // how far out a car's outer edge may go when going round something (asphalt ends at 4.5)
const DEC = 5.5;          // braking a driver plans with, m/s²
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const NORMAL = { name: 'normal', gap: 1, look: 1 };

// what lies on and beside the road near this car, in its road frame
const obs = [];
export function sense(T, m, x, z, tx, tz, range, solids) {
  obs.length = 0;
  const dir = m.dir, rx = -tz, rz = tx, th = Math.atan2(tx, tz);
  const add = (ox, oz, hw, hl, head, vx, vz, kind, ref) => {
    const dx = ox - x, dz = oz - z, f = dx * tx + dz * tz;
    if (f < -30 || f > range || Math.abs(dx * rx + dz * rz) > 30) return;
    const u = lineS(ox, oz, m.axis, m.k) * dir;
    if (Math.abs(u) > 10) return;
    const a = head - th, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    obs.push({ x: ox, z: oz, f, u, hf: hl * c + hw * s, hu: hl * s + hw * c, vf: vx * tx + vz * tz, vu: vx * rx + vz * rz, kind, ref, r: Math.max(hw, hl) });
  };
  for (const o of T.movers) {
    if (o === m || o.parked || !o.g.visible || o.carried === 'deck') continue;
    add(o.pos.x, o.pos.z, o.hw, o.hl, o.heading, o.vel.x, o.vel.z, o.crashed ? 'wreck' : o.kind, o);
  }
  const me = T.me;
  if (me?.pos) add(me.pos.x, me.pos.z, me.hw, me.hl, me.heading, me.vel.x, me.vel.z, 'player', me);
  // you on foot (the car you left is `me` above)
  const p = T.playerPos;
  if (p && me?.pos && p !== me.pos) add(p.x, p.z, 0.45, 0.45, 0, 0, 0, 'person', T);
  for (const b of T.others || []) add(b.pos.x, b.pos.z, 1.0, 2.3, b.heading ?? 0, b.vel.x, b.vel.z, 'car', b);
  // drivers who got out to have a word (angry.js)
  for (const a of T.react?.list || []) if (a.pos && a.m.driverOut) add(a.pos.x, a.pos.z, 0.45, 0.45, 0, 0, 0, 'person', a);
  // panels that came off a car
  for (const d of T.debris || []) add(d.mesh.position.x, d.mesh.position.z, d.r || 0.6, d.r || 0.6, 0, 0, 0, 'debris', d);
  // trees, poles, posts, rocks: only the physical cars have them at hand
  if (solids) for (const s of solids) if (!s.dead && s.r > 0.08) add(s.x, s.z, s.r, s.r, 0, 0, 0, 'solid', s);
  return obs;
}

// Something to drive round rather than queue behind: a wreck, a thing lying on the road, someone
// standing about, you parked, a driver who gave up. A car waiting in a queue is just followed.
function passable(o, m) {
  // a car standing nose to nose with us (it turned round, or went round something and got stuck): go round it
  const r = o.ref;
  if (m && r?.dir != null && r.axis === m.axis && r.k === m.k && r.dir !== m.dir && Math.abs(o.vf) < 1 && !r.crashed) return true;
  if (o.kind === 'wreck' || o.kind === 'debris' || o.kind === 'solid' || o.kind === 'person') return true;
  if (o.kind === 'player') return Math.hypot(o.vf, o.vu) < 1;
  if (o.kind === 'tractor') return true;
  return o.ref?.st === 'gone' || (o.ref?.job && o.ref.job.ph !== 'drive' && o.ref.job.ph !== 'leave');   // (the tow truck at work)
}

// Where to go round blocker B: the nearest lateral line that clears it, the obstacles that stand
// still beside it, and everything that will be there by the time we're past. Returns
// { u, end } or { why: 'close' | 'traffic' | 'room' }.
function tryPass(m, B, myU, hw, hl, spd) {
  // the stretch we must get through: B and anything standing right behind it in our lane
  let end = B.f + B.hf;
  for (const o of obs) if (o !== B && passable(o, m) && o.f > B.f && o.f - o.hf < end + hl * 2 + 4 && Math.abs(o.u - B.u) < o.hu + B.hu + hw * 2) end = Math.max(end, o.f + o.hf);
  end += hl + 3;
  const lo = Math.min(...[B, ...obs.filter(o => o.f > B.f && o.f - o.hf < end && passable(o, m) && Math.abs(o.u - B.u) < o.hu + B.hu + hw * 2)].map(o => o.u - o.hu));
  const hi = Math.max(...[B, ...obs.filter(o => o.f > B.f && o.f - o.hf < end && passable(o, m) && Math.abs(o.u - B.u) < o.hu + B.hu + hw * 2)].map(o => o.u + o.hu));
  // a metre clear of it where the road allows, at least half a metre (the line a driver takes is never exact)
  const side = (base, s) => { for (const g of [1.0, 0.75, 0.55]) { const u = base + s * (hw + g); if (Math.abs(u) + hw <= OUT) return u; } return null; };
  const cands = [side(lo, -1), side(hi, 1)].filter(u => u != null).sort((a, b) => Math.abs(a - myU) - Math.abs(b - myU));
  if (!cands.length) return { why: 'room' };
  // (time to get by, on the safe side: from a standstill, round it at walking pace, plus a margin)
  const vp = 4.5, T = (end + hl) / vp + 4;
  let why = 'room', need = 0;
  for (const u of cands) {
    // room to swing out before reaching B
    // only pull out with the room for the whole S: starting short ends with the nose on its corner and backing out again
    const free = B.f - B.hf - hl, want = swingRoom(m, u - myU);
    if (free < want) { if (why === 'room') { why = 'close'; need = want + 1; } continue; }
    let ok = true, moving = false;
    for (const o of obs) {
      if (o === B) continue;
      // someone on the far side waiting for the same gap (or already in it): whoever waited longer goes first
      const r = o.ref;
      if (r?.dir != null && r.dir !== m.dir && !r.crashed && o.f > 0 && o.f - o.hf < end + 25 && Math.abs(o.vf) < 4 &&
          (r.st === 'pass' || ((r.blockT || 0) > 0.5 && ((r.blockT || 0) > (m.blockT || 0) + 0.3 || ((r.blockT || 0) > (m.blockT || 0) - 0.3 && r.seed > m.seed))))) {
        ok = false; moving = true; continue;
      }
      const still = Math.abs(o.vf) < 0.8;
      // where it will be while we go by
      const f0 = Math.min(o.f, o.f + o.vf * T) - o.hf, f1 = Math.max(o.f, o.f + o.vf * T) + o.hf;
      if (f1 < -hl - 1 || f0 > end + (still ? 0 : 6)) continue;
      // before B we slide across from our line to u, after it we hold u
      const uLo = o.f < B.f - B.hf ? Math.min(u, myU) : u, uHi = o.f < B.f - B.hf ? Math.max(u, myU) : u;
      const pad = o.kind === 'person' ? 0.9 : 0.35;
      if (o.u + o.hu + pad > uLo - hw && o.u - o.hu - pad < uHi + hw) {
        // behind us and slower than us: they'll wait
        if (o.f < -hl && o.vf < spd + 1) continue;
        ok = false; if (!still) moving = true;
      }
    }
    if (ok) return { u, end };
    if (moving) why = 'traffic';
  }
  return { why, need };
}

// how far ahead a car needs to slide across by du metres (an S on its tightest lock: radius from the wheelbase)
function swingRoom(m, du) {
  const a = m.spec?.axle, R = a ? (a.f - a.r) / 0.55 + 0.5 : 5;
  return 2.0 * Math.sqrt(R * Math.abs(du)) + 0.5;
}

// is anything inside the car's footprint pushed a little forward (or back) of where it is now?
function blockedAt(x, z, fx, fz, hw, hl, ahead) {
  const cx = x + fx * ahead, cz = z + fz * ahead;
  for (const o of obs) {
    const dx = o.x - cx, dz = o.z - cz, f = Math.abs(dx * fx + dz * fz), s = Math.abs(dx * -fz + dz * fx);
    const round = o.kind === 'solid' || o.kind === 'debris' || o.kind === 'person', rf = round ? o.r : o.hf, ru = round ? o.r : o.hu;
    if (f < hl + rf + 0.3 && s < hw + ru + 0.3) return true;
  }
  return false;
}

// The driver's decision for this moment. Returns { goal, u } for normal driving, or { ctl } with the
// raw inputs for the manoeuvres a physical car does (reversing, turning round).
// phys: { fx, fz (car's own forward), spd (signed) } or null for a kinematic car.
export function plan(T, m, dt, x, z, tx, tz, goal, phys) {
  const st = m.style || NORMAL, hw = m.hw, hl = m.hl * 0.92, spd = phys ? phys.spd : m.speed, abs = Math.abs(spd);
  const myU = lineS(x, z, m.axis, m.k) * m.dir, home = LANE + T.weave(m);
  // (far enough to see what's coming before pulling out round something: ~10 s at 80 km/h)
  sense(T, m, x, z, tx, tz, 230, phys ? m.veh.solids : null);
  m.st ||= 'lane'; m.stT = (m.stT || 0) + dt;
  const to = (s) => { m.st = s; m.stT = 0; };
  const find = ref => obs.find(o => o.ref === ref);
  let uT = home;

  // ---- manoeuvres of a physical car --------------------------------------------------------------
  if (m.st === 'back') {
    const B = m.pb && find(m.pb), room = B ? B.f - B.hf - hl : 99;
    const done = !phys || (m.need && room > m.need) || m.stT > (m.backT || 4);
    const stuck = phys && blockedAt(x, z, phys.fx, phys.fz, hw, hl, -1.9);
    // backed far enough (try again straight away), or the one behind is too close (count it as no room)
    // (blocked: say so, so the car behind can make room: see 'yield' below)
    if (done || stuck) { to('lane'); m.blockT = 99; if (stuck && !done) { m.backFail = (m.backFail || 0) + 1; m.wantBack = T.t; } }
    else return { ctl: { rev: true, throttle: abs > (m.backV ??= 1.2 + Math.random() * 1.2) ? 0 : 0.5, brake: abs > 2.6 ? 0.5 : 0, steer: clamp(-(home - myU) * 0.25, -0.4, 0.4) * (m.backSteer ?? 1) } };
  }
  if (m.st === 'turn') return turnRound(T, m, dt, x, z, tx, tz, phys, myU);

  // ---- the blocker ahead ---------------------------------------------------------------------------
  if (m.st === 'pass') {
    const B = find(m.pb);
    uT = m.pu;
    const lane = obs.some(o => o !== B && passable(o, m) && o.f + o.hf > -hl - 1.5 && o.f - o.hf < hl + 5 && Math.abs(o.u - home) < o.hu + hw + 0.3);
    if (!B || (B.f + B.hf < -hl - 2 && !lane) || m.stT > 30) { to('lane'); uT = home; m.blockT = 0; }
    else {
      // still clear where we're heading? (something coming the other way that wasn't there before)
      // (only what would really meet us: the start already allowed for anything that was in sight)
      const clash = obs.find(o => o !== B && o.vf < -1 && o.f > 0 && o.f - o.hf + o.vf * 2 < Math.max(0, B.f - B.hf) + 4 && Math.abs(o.u - m.pu) < o.hu + hw + 0.4);
      if (clash && Math.abs(myU - home) < 1.1 && B.f - B.hf - hl > 2) { to('lane'); uT = home; m.blockT = 0; }
      else {
        // slower the tighter it is: walking pace past a wreck with half a metre to spare
        const clear = Math.max(m.pu - hw - (B.u + B.hu), B.u - B.hu - (m.pu + hw));
        goal = Math.min(goal, B.kind === 'person' ? 3 : clamp(2.5 + (clear - 0.3) * 6, 2.5, st.name === 'rusher' ? 10 : 8));
      }
    }
  }
  // what's in front on the line we mean to drive (sliding across from where we are to uT)
  const Ltr = m.st === 'pass' ? 4 + abs * 0.6 : 6 + abs * 0.9;
  const uAt = f => myU + (uT - myU) * clamp(f / Ltr, 0, 1);
  let B = null, Bfree = 1e9;
  // the one we're going round, seen along the way the car actually points: standing still it can only
  // creep with the wheel on full lock until its nose swings clear (a straight-ahead check would freeze it)
  const P = m.st === 'pass' && phys ? find(m.pb) : null;
  if (P) {
    const free = P.f - P.hf - hl, sn = phys.fx * -tz + phys.fz * tx, cs = Math.max(0.3, phys.fx * tx + phys.fz * tz);
    const uP = myU + Math.max(0, free) * sn / cs;
    if (free > -1.2 && Math.abs(P.u - uP) < P.hu + hw + 0.15) goal = Math.min(goal, free > 0.5 ? Math.max(1.3, Math.sqrt(2 * 3 * (free - 0.5))) : 0);
    // nose up against its corner: back off a little and line up again
    m.passStuck = abs < 0.3 ? (m.passStuck || 0) + dt : 0;
    if (m.passStuck > 3) { m.passStuck = 0; to('back'); m.need = Math.max(0, free) + 2.5; m.backSteer = 0; m.backT = 3; return { ctl: { rev: true, throttle: 0.5, brake: 0, steer: 0 } }; }
  }
  for (const o of obs) {
    if (P && o === P) continue;
    const free = o.f - o.hf - hl;
    if (free < -1.2 || free > Bfree) continue;
    const pad = o.kind === 'person' ? 0.9 : o.kind === 'wreck' || o.kind === 'debris' ? 0.5 : 0.3;
    if (Math.abs(o.u - uAt(Math.max(0, free))) < o.hu + hw + pad) { B = o; Bfree = free; }
  }
  // crossing traffic (the other road at a junction, someone pulling across): whoever gets to the
  // crossing point later waits for the other one
  for (const o of obs) {
    if (Math.abs(o.vu) < 2 || o.f < 0 || o.kind === 'solid') continue;
    const lane = uAt(Math.max(0, o.f)), gap = Math.abs(o.u - lane) - (o.hu + hw + 0.6);
    if (gap > 0 && Math.sign(lane - o.u) !== Math.sign(o.vu)) continue;   // moving away from our line
    const tIn = Math.max(0, gap) / Math.abs(o.vu), tOut = (Math.max(0, gap) + 2 * (o.hu + hw + 0.6)) / Math.abs(o.vu);
    const free = o.f - o.hf - hl, tMe = free / Math.max(1, abs);
    if (tMe > tOut + 0.3 || tMe < tIn - 2.5) continue;    // gone by the time we get there / we're through first
    if (tMe < tIn - 0.4 && free > 6) continue;            // we get there first, clearly: keep going
    goal = Math.min(goal, Math.sqrt(2 * DEC * Math.max(0, free - 3)));
  }
  const follow = 6 * st.gap + 1;
  if (B) {
    const pass = passable(B, m);
    if (B.vf > 1.5 && !pass) {
      // someone going our way: keep a gap (a rusher sits on your bumper, granny hangs back)
      goal = Math.min(goal, B.vf * 0.9 + Math.max(0, Bfree - follow) * 0.35);
      const slow = B.vf < abs - 2 && Bfree < 18 && abs > 6;
      if (slow && (B.kind === 'player' || st.honk) && !m.honk && T.hearMe(m) && st.name !== 'granny') { m.honk = st.honk ? 1.4 : 2.5; T.audio.beep?.(); }
    } else if (B.vf < -1) {
      // coming at us in our lane (going round something on its side): brake and give it the verge
      goal = Math.min(goal, Math.sqrt(2 * DEC * Math.max(0, Bfree - 4 - Math.abs(B.vf) * 0.8)));
      if (m.st !== 'pass') uT = Math.min(OUT - hw - 0.2, home + 1.1);
    } else {
      // standing (or crawling): stop short, leaving room to pull out round it if we're going to
      // (behind a wreck: as far back as this car needs to swing out round it on the left)
      // (behind a car waiting to go round something: a little more, so it can back up if it must)
      const stop = pass ? clamp(swingRoom(m, (B.u - B.hu - hw - 1.0) - home) + 1.2, 4, 16) : B.ref?.blockT > 0 ? 5.5 : 3.4;
      goal = Math.min(goal, Math.max(0, B.vf) + Math.sqrt(2 * 3.5 * Math.max(0, Bfree - stop)));
      if (m.st === 'lane' && pass) {
        const near = Bfree < 22 || abs < 2;
        m.blockT = near ? (m.blockT || 0) + dt : 0;
        if (m.blockT > (B.kind === 'person' ? 2.5 : 1.6) * (st.pass ?? 1)) {
          const r = tryPass(m, B, myU, hw, hl, abs); m.why = r.why;
          if (r.u != null) { to('pass'); m.pb = B.ref; m.pu = r.u; m.pend = r.end; uT = r.u; m.backFail = 0; }
          else if (r.why === 'close' && phys && abs < 0.5 && (m.backFail || 0) < 6) { to('back'); m.pb = B.ref; m.need = r.need; m.backSteer = 1; m.backT = 4; }
          else if (r.why === 'room' || (r.why === 'close' && (m.backFail || 0) >= 6)) m.noRoom = (m.noRoom || 0) + dt;
          else if (r.why === 'traffic' && st.honk && !m.honk && m.blockT > 6 && T.hearMe(m)) { m.honk = 3; T.audio.beep?.(); }
        }
      } else if (!pass && abs < 1) {
        m.queueT = (m.queueT || 0) + dt;
        // the car in front is backing up to get round something: make room for it
        m.chainT = phys && m.st === 'lane' && B.ref?.st === 'back' && B.vf < -0.3 && Bfree < 4 ? (m.chainT || 0) + dt : 0;
      if (m.chainT > (m.react2 ??= 0.4 + Math.random() * 1.2)) { to('back'); m.pb = null; m.need = 0; m.backSteer = 0; m.backT = 1 + Math.random() * 1.5; m.chainT = 0; m.react2 = null; }
      }
    }
  } else { m.blockT = 0; m.noRoom = 0; m.queueT = 0; }
  m.honk = Math.max(0, (m.honk || 0) - dt);
  // the road is shut (no room either side), or a queue that doesn't move: turn round and go back
  if (m.st === 'lane' && !m.job && ((m.noRoom || 0) > 15 * (st.pass ?? 1) || (m.queueT || 0) > 70 * (st.pass ?? 1))) {
    m.noRoom = 0; m.queueT = 0;
    if (!phys) { m.dir = -m.dir; m.speed = 0; return { goal: 0, u: LANE }; }
    // only with room to swing across: nothing standing over the other lane just ahead, nothing touching behind
    const boxed = blockedAt(x, z, phys.fx, phys.fz, hw, hl, -1.2) || obs.some(o => o.f > -hl && o.f - o.hf < hl * 2 + 3 && o.u + o.hu > -OUT && o.u - o.hu < home - hw - 0.2 && Math.abs(o.vf) < 1);
    if (boxed) return { goal: Math.min(goal, 0), u: uT };
    to('turn'); m.tp = 0; m.tn = 0; m.th0 = Math.atan2(tx, tz);
    return turnRound(T, m, dt, x, z, tx, tz, phys, myU);
  }
  // wedged (a kerb, a ditch, a tree it slid into): back out with the wheel the other way, three tries
  if (phys) {
    m.wedge = goal > 2 && abs < 0.4 ? (m.wedge || 0) + dt : 0;
    if (m.wedge > 2.5) {
      m.wedge = 0; m.tries = (m.tries || 0) + 1;
      if (m.tries > 3) to('gone');
      else { to('back'); m.pb = null; m.need = 0; m.backSteer = -3; }
    } else if (abs > 4) m.tries = 0;
  }
  // yield: the car just in front (or beside, half way round something) wants to back up and we're in its way
  if (phys && m.st === 'lane' && abs < 1 && !blockedAt(x, z, phys.fx, phys.fz, hw, hl, -1.9)) {
    const y = obs.find(o => o.ref?.wantBack > T.t - 1.2 && o.f > 0 && o.f - o.hf - hl < 4 && Math.abs(o.u - myU) < o.hu + hw + 1.5);
    m.yieldT = y ? (m.yieldT || 0) + dt : 0;
    if (y && m.yieldT > (m.react ??= 0.5 + Math.random() * 1.6)) { to('back'); m.pb = null; m.need = 0; m.backSteer = 0; m.backT = 1.5 + Math.random() * 1.5; m.yieldT = 0; m.react = null; }
  }
  // the passing manoeuvre (and backing) fell through: a fresh start for the next try
  if (m.passStuck && m.st !== 'pass') m.passStuck = 0;
  if (m.st === 'gone') goal = 0;
  m.dbg = B ? B.kind + ' ' + Bfree.toFixed(1) + (m.why ? ' ' + m.why : '') : '';
  return { goal, u: uT };
}

// A three-point turn (more points for a long truck): forward on full left lock towards the far verge,
// back on full right lock towards ours, until the car faces the other way; then it drives back.
function turnRound(T, m, dt, x, z, tx, tz, phys, myU) {
  const { fx, fz, spd } = phys, hw = m.hw, hl = m.hl;
  // angle of the car to the road it came on (0 = as it came, ±π = turned round)
  let th = Math.atan2(fx, fz) - m.th0; th = Math.atan2(Math.sin(th), Math.cos(th));
  if (Math.abs(th) > 2.55) {
    // done: this is now the other way along the same road
    m.dir = -m.dir; m.st = 'lane'; m.stT = 0; m.tn = 0;
    return { ctl: { rev: false, throttle: 0.3, brake: 0, steer: 0 } };
  }
  // wait for a gap in both lanes before starting across
  if (m.tn === 0 && m.tp === 0) {
    const busy = obs.some(o => Math.abs(o.vf) > 1 && Math.abs(o.f + o.vf * 6) < 25 && o.kind !== 'person');
    if (busy) return { ctl: { rev: false, throttle: 0, brake: 1, steer: 0 } };
    m.tp = 1;
  }
  if (m.tn > 9 || m.stT > 60) { m.st = 'gone'; m.stT = 0; return { ctl: { rev: false, throttle: 0, brake: 1, steer: 0 } }; }
  // the nose (going forward) or the tail (backing): how far out on the road it is
  const fwd = m.tp > 0, ex = x + fx * hl * (fwd ? 1 : -1), ez = z + fz * hl * (fwd ? 1 : -1);
  const eU = lineS(ex, ez, m.axis, m.k) * m.dir;
  const edge = fwd ? eU < -(OUT - 0.7) : eU > OUT - 0.7;
  const hit = blockedAt(x, z, fx, fz, hw, hl, fwd ? 0.9 : -0.9);
  if ((edge || hit) && m.stT > 0.6) {
    // stop, then the other way
    if (Math.abs(spd) > 0.3) return { ctl: { rev: !fwd, throttle: 0, brake: 1, steer: fwd ? 1 : -1 } };
    m.tp = -m.tp; m.tn++; m.stT = 0;
  }
  const go = Math.abs(spd) < 2.2 ? 0.45 : 0;
  return { ctl: { rev: m.tp < 0, throttle: go, brake: 0, steer: m.tp > 0 ? 1 : -1 } };
}
