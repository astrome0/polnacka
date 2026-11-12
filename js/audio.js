// All sound is synthesised live: nothing to download.

// One waveform per engine: the firing order is what makes a four sound nothing like a V8.
const ENGINES = {
  // cyl: firing pulses per two revolutions. rough: how uneven those pulses are.
  // formant: exhaust resonance. drive: distortion. turbo: whistle level. crackle: pops on lift-off.
  rally: { cyl: 4, rough: 0.2, formant: 880, q: 1.6, drive: 3.4, turbo: 0.03, crackle: true, gain: 1 },
  pickup: { cyl: 6, rough: 0.34, formant: 400, q: 1.1, drive: 2.2, turbo: 0.012, crackle: false, gain: 1.05 },
  monster: { cyl: 8, rough: 0.72, formant: 260, q: 1, drive: 5, turbo: 0, crackle: false, gain: 1.25 },
  sport: { cyl: 10, rough: 0.12, formant: 1500, q: 2, drive: 2.6, turbo: 0, crackle: true, gain: 0.95 },
};

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.carId = 'rally'; this.inCab = true; this.open = 0; this.lastLoad = 0; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0.62;
    const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
    // everything outside the car passes through the bodywork on its way to your ears
    this.outside = c.createGain();
    this.shell = c.createBiquadFilter(); this.shell.type = 'lowpass'; this.shell.Q.value = 0.5;
    this.outside.connect(this.shell); this.shell.connect(this.master);
    const noiseBuf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = noiseBuf;
    const loopNoise = (type, f, q, gain, out = this.outside) => {
      const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(fl); fl.connect(g); g.connect(out); s.start();
      return { fl, g };
    };
    // engine: custom waveform > drive > exhaust resonance, summed with a dry body
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engCab = c.createBiquadFilter(); this.engCab.type = 'lowpass'; this.engCab.Q.value = 0.4;
    this.eng.connect(this.engCab); this.engCab.connect(this.master);
    this.engIn = c.createGain();
    this.shaper = c.createWaveShaper();
    this.body = c.createBiquadFilter(); this.body.type = 'lowpass'; this.body.Q.value = 0.6;
    this.exhaust = c.createBiquadFilter(); this.exhaust.type = 'peaking'; this.exhaust.gain.value = 9;
    this.engIn.connect(this.shaper); this.shaper.connect(this.exhaust); this.exhaust.connect(this.body); this.body.connect(this.eng);
    this.oscA = c.createOscillator(); this.oscB = c.createOscillator();
    const gb = c.createGain(); gb.gain.value = 0.5;
    this.oscA.connect(this.engIn); this.oscB.connect(gb); gb.connect(this.engIn);
    this.oscA.start(); this.oscB.start();
    this.turbo = c.createOscillator(); this.turbo.type = 'sine'; this.turboG = c.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG); this.turboG.connect(this.eng); this.turbo.start();
    this.intake = loopNoise('bandpass', 700, 1, 0, this.eng);
    this.wind = loopNoise('lowpass', 500, 0.7, 0);
    this.road = loopNoise('lowpass', 220, 0.8, 0);
    this.gravel = loopNoise('bandpass', 2300, 0.7, 0);
    this.skid = loopNoise('bandpass', 1500, 3.5, 0);
    this.crop = loopNoise('highpass', 3600, 0.6, 0);
    this.pass = loopNoise('bandpass', 420, 0.9, 0);
    this.brook = loopNoise('bandpass', 1500, 0.8, 0);
    this.wash = loopNoise('lowpass', 620, 0.7, 0);
    // rain: hiss in the air, a soft body under it, and on the roof a patter that only the cabin hears
    this.rainHiss = loopNoise('highpass', 3200, 0.4, 0);
    this.rainBody = loopNoise('bandpass', 1100, 0.5, 0);
    this.rainRoof = loopNoise('bandpass', 1900, 0.9, 0, this.master);
    // the weather's wind: a low roar, a whistle in the strong gusts, and leaves rustling when there are trees
    this.gale = loopNoise('lowpass', 300, 0.7, 0);
    this.whistle = loopNoise('bandpass', 900, 6, 0);
    this.rustle = loopNoise('highpass', 2400, 0.5, 0);
    // hail hissing and rattling on the ground all round
    this.hailRoar = loopNoise('highpass', 1700, 0.6, 0);
    this.hailBody = loopNoise('bandpass', 700, 0.8, 0);
    // a tornado: the deep rumble of a freight train, a waterfall's roar over it, and close in the hiss of what it carries
    this.torRumble = loopNoise('lowpass', 85, 0.9, 0);
    this.torRoar = loopNoise('bandpass', 340, 0.55, 0);
    this.torHiss = loopNoise('bandpass', 1900, 0.5, 0);
    // the drone: four props buzzing a little out of tune with each other, and the hiss of their wash
    this.droneG = c.createGain(); this.droneG.gain.value = 0;
    const dBand = c.createBiquadFilter(); dBand.type = 'bandpass'; dBand.frequency.value = 900; dBand.Q.value = 0.7;
    this.droneG.connect(this.master); dBand.connect(this.droneG);
    this.droneOsc = [0, 1, 2].map(i => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = 190 + i * 7; g.gain.value = 0.11; o.connect(g); g.connect(dBand); o.start(); return o; });
    this.droneWash = loopNoise('bandpass', 2600, 0.6, 0, this.droneG);
    this.nextBird = 2;
    this.setCar(this.carId); this.setView(this.inCab); this.setMuted(this.muted);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.62; }
  setCar(id) {
    this.carId = id;
    const e = this.prof = ENGINES[id] || ENGINES.rally;
    if (!this.ctx) return;
    const N = 48, re = new Float32Array(N), im = new Float32Array(N), step = e.cyl / 2;
    // harmonics of half engine speed, loudest on the firing frequency and its multiples
    let seed = e.cyl * 7 + 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let h = 1; h < N; h++) {
      const firing = Math.abs(h / step - Math.round(h / step)) < 1e-3;
      const a = (firing ? 1 : e.rough * (0.3 + rnd())) / Math.pow(h / step, 0.8);
      const ph = rnd() * 6.283;
      re[h] = a * Math.cos(ph); im[h] = a * Math.sin(ph);
    }
    const wave = this.ctx.createPeriodicWave(re, im);
    this.oscA.setPeriodicWave(wave); this.oscB.setPeriodicWave(wave);
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * e.drive); }
    this.shaper.curve = curve;
    this.exhaust.frequency.value = e.formant; this.exhaust.Q.value = e.q;
  }
  // in the cockpit you hear the world through the car; broken glass lets it back in
  setView(inCab) { this.inCab = inCab; this.applyShell(); }
  setOpen(x) { this.open = Math.min(1, x); this.applyShell(); }
  applyShell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.open;
    this.shell.frequency.setTargetAtTime(this.inCab ? 650 + o * 9000 : 18000, t, 0.08);
    this.outside.gain.setTargetAtTime(this.inCab ? 0.72 + o * 0.5 : 1, t, 0.08);
    this.engCab.frequency.setTargetAtTime(this.inCab ? 2600 + o * 5000 : 14000, t, 0.08);
  }
  engine(rpm, redline, load, gear) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.prof, r = rpm / redline, f0 = rpm / 120;
    this.oscA.frequency.setTargetAtTime(f0, t, 0.012); this.oscB.frequency.setTargetAtTime(f0 * 1.004, t, 0.012);
    // a big cam loping at idle, smoothing out as the revs rise
    const lope = e.rough > 0.5 ? 1 + 0.16 * Math.sin(t * rpm / 340) * (1 - Math.min(1, r * 2.4)) : 1;
    this.engIn.gain.setTargetAtTime((0.26 + load * 0.5) * lope, t, 0.02);
    this.body.frequency.setTargetAtTime(380 + r * 3400 + load * 1500, t, 0.03);
    this.exhaust.frequency.setTargetAtTime(e.formant * (0.72 + r * 0.9), t, 0.05);
    this.eng.gain.setTargetAtTime(e.gain * (0.1 + 0.15 * load + 0.1 * r), t, 0.03);
    this.turbo.frequency.setTargetAtTime(1800 + r * r * 5200, t, 0.09);
    this.turboG.gain.setTargetAtTime(e.turbo * load * r * r * 2, t, 0.1);
    this.intake.g.gain.setTargetAtTime(load * 0.05 * r, t, 0.05);
    this.intake.fl.frequency.setTargetAtTime(400 + rpm * 0.25, t, 0.05);
    // lifting off from high revs: unburnt fuel popping in the exhaust
    if (e.crackle && this.lastLoad > 0.5 && load < 0.1 && r > 0.55) {
      const n = 3 + Math.random() * 5 | 0;
      for (let i = 0; i < n; i++) setTimeout(() => this.burst(0.05, 700 + Math.random() * 900, 'bandpass', 0.22 + Math.random() * 0.3, 1.4, this.eng), 60 + i * (50 + Math.random() * 70));
    }
    this.lastLoad = load;
  }
  ride(speed, gravel, skid, crop, air, asphalt = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const onG = air ? 0 : 1, gale = 1 + this.open * 1.5;
    this.wind.g.gain.setTargetAtTime(Math.min(0.5, speed * speed * 0.00023 * gale), t, 0.1);
    this.wind.fl.frequency.setTargetAtTime(280 + speed * 22, t, 0.1);
    this.road.g.gain.setTargetAtTime(onG * Math.min(0.55, speed * 0.018) * (0.5 + gravel * 2.5), t, 0.05);
    this.gravel.g.gain.setTargetAtTime(onG * Math.min(0.16, speed * 0.008) * gravel * 4, t, 0.05);
    // tyres squeal on asphalt and only hiss on anything loose
    this.skid.fl.frequency.setTargetAtTime(asphalt ? 1750 + Math.min(500, skid * 30) : 760, t, 0.05);
    this.skid.fl.Q.setTargetAtTime(asphalt ? 12 : 1, t, 0.05);
    this.skid.g.gain.setTargetAtTime(onG * Math.min(asphalt ? 1.5 : 0.24, skid * (asphalt ? 0.2 : 0.03)), t, 0.05);
    this.crop.g.gain.setTargetAtTime(onG * crop * Math.min(0.14, speed * 0.012), t, 0.06);
  }
  // near: a stream within earshot, 0 to 1. wade: the car ploughing through it.
  water(near, wade) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.brook.g.gain.setTargetAtTime(near * 0.07 * (0.8 + 0.2 * Math.sin(t * 1.7)), t, 0.3);
    this.wash.g.gain.setTargetAtTime(Math.min(0.75, wade * 0.8), t, 0.06);
    this.wash.fl.frequency.setTargetAtTime(360 + wade * 900, t, 0.08);
  }
  // speed in m/s with its gusts, gust the gust factor (1 is the mean), trees 0..1 round you
  gusts(speed, gust, trees) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = Math.min(1, speed / 22);
    this.gale.g.gain.setTargetAtTime(Math.min(0.42, s * s * 0.5 + speed * 0.004), t, 0.25);
    this.gale.fl.frequency.setTargetAtTime(220 + speed * 28, t, 0.3);
    const w = Math.max(0, Math.min(1, (speed - 11) / 10)) * Math.max(0, gust - 0.9);
    this.whistle.g.gain.setTargetAtTime(w * 0.09, t, 0.4);
    this.whistle.fl.frequency.setTargetAtTime(700 + speed * 30 + gust * 120, t, 0.5);
    this.rustle.g.gain.setTargetAtTime(trees * Math.min(0.16, 0.012 + speed * 0.009), t, 0.3);
  }
  // far: how loud the tornado is from here, 0..1; close: how much of its wind is on you
  tornado(far, close) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, c = Math.min(1, close), sw = 0.85 + 0.15 * Math.sin(t * 0.7) * Math.sin(t * 1.9);
    this.torRumble.g.gain.setTargetAtTime(Math.min(1.1, far * 1.4 + c * 0.5) * sw, t, 0.5);
    this.torRoar.g.gain.setTargetAtTime(Math.min(0.7, far * far * 0.6 + c * 0.45) * sw, t, 0.5);
    this.torRoar.fl.frequency.setTargetAtTime(260 + far * 140 + c * 250, t, 0.6);
    this.torHiss.g.gain.setTargetAtTime(c * c * 0.35, t, 0.3);
    if (c > 0.25 && Math.random() < c * 0.25) this.burst(0.04 + Math.random() * 0.1, 300 + Math.random() * 2500, 'bandpass', c * (0.1 + Math.random() * 0.3), 2);
  }
  // the drone's props: vol 0..1, rev 0..1.5 how hard they work
  drone(vol, rev) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneG.gain.setTargetAtTime(vol, t, 0.15);
    this.droneOsc.forEach((o, i) => o.frequency.setTargetAtTime((150 + rev * 120) * (1 + i * 0.037), t, 0.12));
    this.droneWash.g.gain.setTargetAtTime(0.5 + rev * 0.4, t, 0.2);
  }
  hail(amt, inCab) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hailRoar.g.gain.setTargetAtTime(amt * 0.3, t, 0.3);
    this.hailBody.g.gain.setTargetAtTime(amt * amt * 0.22, t, 0.3);
  }
  // one stone on the car: a hard metallic tick, straight in the driver's ears from the roof above
  hailTick(inCab) {
    if (!this.ctx) return;
    const f = 2200 + Math.random() * 3200, g = inCab ? 0.18 + Math.random() * 0.3 : 0.07 + Math.random() * 0.1;
    this.burst(0.02 + Math.random() * 0.03, f, 'bandpass', g, 3, inCab ? this.master : this.outside);
    if (inCab && Math.random() < 0.4) this.burst(0.06, 420 + Math.random() * 300, 'bandpass', g * 0.6, 2, this.master);
  }
  rain(amt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainHiss.g.gain.setTargetAtTime(amt * 0.17, t, 0.4);
    this.rainBody.g.gain.setTargetAtTime(amt * amt * 0.13, t, 0.4);
    this.rainRoof.g.gain.setTargetAtTime(this.inCab ? amt * 0.15 * (1 - this.open * 0.8) : 0, t, 0.3);
  }
  // a crack, then a rumble; far away it is only the rumble, and quieter. delay in seconds, like the speed of sound.
  thunder(delay, near, vol = 1) {
    if (!this.ctx) return;
    setTimeout(() => {
      if (near) { this.burst(0.35, 3000, 'highpass', 0.9); this.burst(0.5, 600, 'bandpass', 0.8, 0.6); }
      this.burst(3.2, 70 + Math.random() * 40, 'lowpass', (near ? 1.5 : 0.9) * vol);
      this.burst(2.1, 190, 'lowpass', 0.45 * vol * vol);
      setTimeout(() => this.burst(2.4, 80, 'lowpass', 0.6 * vol), 700 + Math.random() * 900);
    }, delay * 1000);
  }
  tone(f, dur) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain(), o = c.createOscillator();
    o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  splash(a) { if (this.ctx) { this.burst(0.5 + a * 0.5, 820, 'lowpass', 0.28 + a * 0.8); this.burst(0.3, 2400, 'bandpass', 0.12 + a * 0.28, 0.7); } }
  burst(dur, f, type, gain, q = 1, out = this.master) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(), t = c.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 2, dur + 0.05);
  }
  ring(freqs, dur, gain) {
    const c = this.ctx, t = c.currentTime;
    for (const f of freqs) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.frequency.exponentialRampToValueAtTime(f * 0.86, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur * (0.5 + Math.random() * 0.5));
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
    }
  }
  crash(amt, kind) {
    if (!this.ctx) return;
    this.burst(0.18 + amt * 0.5, kind === 'ground' ? 420 : 1100, 'lowpass', 0.3 + amt * 0.8);
    this.burst(0.12, 90, 'lowpass', amt * 1.5);
    if (amt > 0.2 && kind !== 'ground') { this.ring([310 + Math.random() * 200, 690 + Math.random() * 400, 1420 + Math.random() * 600], 0.3 + amt * 0.5, amt * 0.13); this.burst(0.3, 3400, 'highpass', amt * 0.24); }
  }
  clang() { if (this.ctx) { this.ring([240, 512, 1090], 0.5, 0.16); this.burst(0.1, 2200, 'bandpass', 0.3); } }
  // size 1 for the windscreen, less for a side window
  glass(size = 1) {
    if (!this.ctx) return;
    this.burst(0.25 + size * 0.25, 5200, 'highpass', 0.3 + size * 0.35);
    this.burst(0.08, 1800, 'bandpass', 0.5 * size + 0.2, 2);
    const n = 6 + size * 8 | 0;
    for (let i = 0; i < n; i++) setTimeout(() => this.ctx && this.ring([2800 + Math.random() * 4000], 0.14, 0.04), i * 38 + Math.random() * 90);
    // the last crumbs fall onto the sill a moment later
    for (let i = 0; i < 5; i++) setTimeout(() => this.ctx && this.ring([4200 + Math.random() * 3000], 0.06, 0.016), 340 + i * 70 + Math.random() * 60);
  }
  pop() { if (this.ctx) this.burst(0.2, 180, 'lowpass', 1.2); }
  wood() { if (this.ctx) { this.burst(0.3, 800, 'bandpass', 0.8, 2); this.burst(0.5, 200, 'lowpass', 0.7); } }
  thud(a) { if (this.ctx) this.burst(0.16, 130, 'lowpass', a); }
  shift() { if (this.ctx) this.burst(0.05, 260, 'lowpass', 0.14); }
  // something drives by: rumble that swells with closeness and closing speed
  passing(dist, rel) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = Math.min(1, 26 / Math.max(4, dist)) ** 2 * Math.min(1, rel / 30);
    this.pass.g.gain.setTargetAtTime(a * 0.5, t, 0.06);
    this.pass.fl.frequency.setTargetAtTime(280 + rel * 8, t, 0.08);
  }
  beep() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.setValueAtTime(0.06, t + 0.34); g.gain.linearRampToValueAtTime(0, t + 0.4); g.connect(this.outside);
    for (const f of [392, 466]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.4); }
  }
  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornN) {
      const c = this.ctx, g = c.createGain(); g.gain.value = 0.11; g.connect(this.master);
      const o = [420, 505].map(f => { const x = c.createOscillator(); x.type = 'square'; x.frequency.value = f; x.connect(g); x.start(); return x; });
      this.hornN = { o, g };
    } else if (!on && this.hornN) { this.hornN.o.forEach(x => x.stop()); this.hornN = null; }
  }
  // birds in the day, crickets at night
  ambient(dt, night) {
    if (!this.ctx) return;
    this.nextBird -= dt;
    if (this.nextBird > 0) return;
    const c = this.ctx, t0 = c.currentTime;
    this.nextBird = 1.6 + Math.random() * 5;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.outside);
    const o = c.createOscillator(); o.type = 'sine'; o.connect(g);
    const f = night ? 4300 : 2200 + Math.random() * 2400, n = night ? 6 : 2 + Math.random() * 4 | 0;
    let t = t0;
    for (let i = 0; i < n; i++) {
      const d = night ? 0.05 : 0.07 + Math.random() * 0.1;
      o.frequency.setValueAtTime(f * (1 + (night ? 0 : Math.random() * 0.3)), t);
      if (!night) o.frequency.exponentialRampToValueAtTime(f * (0.8 + Math.random() * 0.6), t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(night ? 0.012 : 0.025, t + 0.012); g.gain.linearRampToValueAtTime(0, t + d);
      t += d + (night ? 0.03 : 0.04);
    }
    o.start(t0); o.stop(t + 0.1);
  }
}
