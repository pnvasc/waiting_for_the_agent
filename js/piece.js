/* ===========================================================================
   The piece: three agents, me, and my window switching, played together.

   data/piece.json holds the events, in seconds. This module decides when
   each one sounds, in played seconds, and performs it: the sound with
   instruments.js, the light with lights.js, both on the one audio clock.

     const piece = new Piece(config, { lights: element });
     await piece.unlock();                    // after a key press or a click
     piece.play(await loadPiece(config));
     piece.on('summons', (e) => …);           // hook: e.g. advance a slide
     piece.stop();

   Events: 'summons' {voice, kind}, 'prompt' {voice}, 'pulse' {x, y, …},
   'end'. The deck can listen to these without knowing anything else.

   Time (config 'time'):
     compressed  each voice comes in at its entry second and stops its exit
                 seconds before the end, fitted in between, with rests of
                 at most gap_cap seconds.
     realtime    `excerpt` seconds from `offset`, at 1:1.
   =========================================================================== */

import { Instruments } from './instruments.js';
import { Lights, pulses } from './lights.js';

const LOOKAHEAD = 0.15;   // seconds of notes booked ahead of the clock
const TICK = 25;          // how often the booking timer wakes, in ms
const RING = 5;           // seconds the last bells may ring after the end

/* --- loading ------------------------------------------------------------------- */

const get = (path) => fetch(path, { cache: 'no-store' }).then((r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
});

/* The piece to play: data/piece.json, or, if choose.at_play is 'random',
   three voices drawn at random from data/pool.json. The light is always
   piece.json's. */
export async function loadPiece(cfg, base = '') {
  const fixed = await get(`${base}data/piece.json`);
  if (cfg.choose.at_play !== 'random') return fixed;

  const { stretches } = await get(`${base}data/pool.json`);
  const shuffled = [...stretches].sort(() => Math.random() - 0.5);
  const picked = [];
  const sessions = new Set();
  for (const s of shuffled) {
    if (picked.length < cfg.choose.count && !sessions.has(s.session)) { picked.push(s); sessions.add(s.session); }
  }
  for (const s of shuffled) {
    if (picked.length < cfg.choose.count && !picked.includes(s)) picked.push(s);
  }
  picked.sort((a, b) => a.start.localeCompare(b.start));
  const voices = await Promise.all(picked.map((s) => get(`${base}data/${s.file}`)));
  return {
    kind: 'overlay',
    random: true,
    voices: voices.map((v, i) => ({ voice: i + 1, ...v })),
    light: fixed.light,
  };
}

/* --- time: real seconds to played seconds ---------------------------------------- */

/* Seconds to played seconds: rests of at most `cap`, the whole fitted to
   `target` seconds. */
function timeMap(times, target, cap) {
  const points = [...new Set(times)].sort((a, b) => a - b);
  const played = [0];
  let clock = 0;
  for (let i = 1; i < points.length; i += 1) {
    clock += Math.min(points[i] - points[i - 1], cap);
    played.push(clock);
  }
  const scale = clock ? target / clock : 0;
  return (t) => {
    if (t <= points[0]) return 0;
    for (let i = 1; i < points.length; i += 1) {
      if (t <= points[i]) {
        const a = points[i - 1];
        const b = points[i];
        const frac = b > a ? (t - a) / (b - a) : 0;
        return (played[i - 1] + frac * (played[i] - played[i - 1])) * scale;
      }
    }
    return played[played.length - 1] * scale;
  };
}

const pitch = (root, degree, scale) =>
  root + scale[degree % scale.length] + 12 * Math.floor(degree / scale.length);

/* Everything the piece will do, in played seconds, sorted. Also returns how
   long it plays, the light's pulses, and how much each voice is sped up. */
export function schedule(piece, cfg) {
  const tc = cfg.time;
  const pc = cfg.pitch;
  const compressed = tc.mode !== 'realtime';
  const played = compressed ? tc.target - (tc.tail || 0) : tc.excerpt;
  const events = [];
  const ratios = [];
  const prompts = [];

  piece.voices.forEach((v, i) => {
    const overlay = piece.kind === 'overlay';
    const entry = overlay ? (tc.entries[i] ?? 0) : 0;
    const exit = overlay ? (tc.exits?.[i] ?? 0) : 0;   // seconds before the end it stops
    const times = [
      ...v.notes.flatMap((n) => [n.t, n.t + n.d]),
      ...v.summons.map((s) => s.t),
      ...v.prompts.map((p) => p.t),
    ];
    if (!times.length) return;

    let f;
    if (!compressed) f = (t) => entry + t - tc.offset;
    else if (piece.kind === 'live') f = (t) => (t / (piece.duration || 1)) * played;
    else {
      const g = timeMap(times, played - entry - exit, tc.gap_cap);
      f = (t) => entry + g(t);
    }
    const real = Math.max(...times) - Math.min(...times);
    ratios.push(compressed ? real / Math.max(played - entry - exit, 1) : 1);

    const root = pc.voice_roots[i % pc.voice_roots.length];
    for (const n of v.notes) {
      const deg = pc.tool_degrees[n.tool] ?? pc.other_degree;
      if (deg === 'tick') events.push({ at: f(n.t), kind: 'tick', voice: i, midi: pitch(root, 4, pc.scale) });
      else events.push({ at: f(n.t), kind: 'note', voice: i, midi: pitch(root, deg, pc.scale), dur: f(n.t + n.d) - f(n.t) });
    }
    for (const s of v.summons) {
      events.push({ at: f(s.t), kind: 'bell', voice: i, summons: s.kind, midi: pitch(root, pc.summons_degree, pc.scale) });
    }
    for (const p of v.prompts) prompts.push({ at: f(p.t), voice: i });
  });

  // My prompts walk slowly through the scale, whoever they were addressed to.
  prompts.sort((a, b) => a.at - b.at);
  prompts.forEach((p, k) => {
    const walk = pc.prompt_degrees;
    events.push({ ...p, kind: 'prompt', midi: pitch(pc.prompt_root, walk[k % walk.length], pc.scale) });
  });

  // The light, on the same clock.
  const L = piece.light;
  const light = compressed
    ? L
    : { duration: played, switches: L.switches.map((t) => t - tc.offset).filter((t) => t >= 0 && t < played) };

  return {
    played,
    events: events.filter((e) => e.at >= 0 && e.at <= played).sort((a, b) => a.at - b.at),
    pulses: pulses(light, played, cfg.light),
    ratios,
    lightRatio: compressed ? L.duration / played : 1,
  };
}

/* --- the exposition ---------------------------------------------------------------
   Before the piece, each part alone: one prompt; one agent working, then
   summoning; one pulse of light in silence. Built from the piece's own
   material, then the piece itself is moved later by the same amount. */

function exposition(plan, cfg) {
  const x = cfg.exposition;
  const events = [];
  let t = 0.3;

  const firstPrompt = plan.events.find((e) => e.kind === 'prompt');
  if (firstPrompt) events.push({ ...firstPrompt, at: t });
  t = x.prompt;

  // The middle agent, if there is one: its first few notes, then its bell.
  const voice = Math.min(1, cfg.pitch.voice_roots.length - 1);
  const work = plan.events.filter((e) => e.voice === voice && (e.kind === 'note' || e.kind === 'tick')).slice(0, 8);
  const bell = plan.events.find((e) => e.voice === voice && e.kind === 'bell');
  const room = x.agent * 0.65;
  work.forEach((e, k) => events.push({ ...e, at: t + (k / Math.max(work.length, 1)) * room, dur: Math.min(e.dur ?? 0, 0.5) }));
  if (bell) events.push({ ...bell, at: t + room + 0.2 });
  t += x.agent;

  const pulse = { at: t + 0.2, until: t + x.light - 0.6, weight: 1, x: 0.5, y: 0.5, r: 0.18 };
  t += x.light + x.gap;
  return { length: t, events, pulses: [pulse] };
}

/* --- performing --------------------------------------------------------------------- */

export class Piece {
  constructor(cfg, { lights = null } = {}) {
    this.cfg = cfg;
    this.ctx = null;
    this.inst = null;
    this.lights = lights ? new Lights(lights, cfg.light) : null;
    this.heard = {};                // solo and mute, from the page
    this.showLight = true;
    this.plan = null;
    this._timer = null;
    this._raf = null;
    this._listeners = {};
    this.onProgress = null;         // hook: (played seconds, total) every frame
  }

  on(name, fn) {
    (this._listeners[name] ||= []).push(fn);
    return () => { this._listeners[name] = this._listeners[name].filter((f) => f !== fn); };
  }

  _emit(name, detail) {
    for (const fn of this._listeners[name] || []) fn(detail);
  }

  /* Browsers only start audio after the page has been touched: call this
     from a key or click handler. Safe to call again. */
  async unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx.state === 'running';
  }

  get unlocked() { return this.ctx?.state === 'running'; }
  get playing() { return this._timer !== null; }

  /* Played seconds since the piece began (negative during the count-in). */
  now() { return this.ctx && this.plan ? this.ctx.currentTime - this.plan.start : 0; }

  setHeard(on) {
    this.heard = on;
    if (this.inst) this.inst.mix(on);
  }

  play(piece) {
    this.stop(0);
    if (!this.ctx) throw new Error('call unlock() first');

    // A fresh set of instruments for each performance, so stopping can fade
    // this one out while anything still ringing from the last one dies away.
    this.inst = new Instruments(this.ctx, this.cfg.sound);
    this.inst.mix(this.heard);

    const main = schedule(piece, this.cfg);
    let events = main.events;
    let lightPulses = main.pulses;
    let total = main.played;
    if (this.cfg.exposition.on) {
      const x = exposition(main, this.cfg);
      const shift = (list) => list.map((e) => ({ ...e, at: e.at + x.length, ...(e.until ? { until: e.until + x.length } : {}) }));
      events = [...x.events, ...shift(events)];
      lightPulses = [...x.pulses, ...shift(lightPulses)];
      total += x.length;
    }
    this.plan = { ...main, events, total, start: this.ctx.currentTime + 0.12 };
    if (this.lights) this.lights.set(lightPulses);
    if (this.lights) this.lights.onPulse = (p) => this._emit('pulse', p);

    // Book notes a little ahead of the clock, on the clock.
    let booked = 0;
    let fired = 0;
    const { start } = this.plan;
    this._timer = setInterval(() => {
      const horizon = this.ctx.currentTime + LOOKAHEAD;
      while (booked < events.length && start + events[booked].at < horizon) {
        this.inst.play(events[booked], start + events[booked].at);
        booked += 1;
      }
    }, TICK);

    // Every frame: the light, the events the deck may want, the progress.
    const frame = () => {
      const t = this.now();
      if (this.lights) {
        if (this.showLight) this.lights.render(t);
        else this.lights.clear();
      }
      while (fired < events.length && events[fired].at <= t) {
        const e = events[fired];
        if (e.kind === 'bell') this._emit('summons', { voice: e.voice + 1, kind: e.summons });
        if (e.kind === 'prompt') this._emit('prompt', { voice: e.voice + 1 });
        fired += 1;
      }
      if (this.onProgress) this.onProgress(t, total);
      if (t > total + RING) { this.stop(0); this._emit('end'); return; }
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
    return this.plan;
  }

  /* Fades out over `fade` seconds (0: at once) and stops booking notes. */
  stop(fade = 0.4) {
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    this._timer = null;
    if (this.lights) this.lights.clear();
    if (this.onProgress) this.onProgress(null, 0);
    if (!this.inst) return;
    const inst = this.inst;
    const now = this.ctx.currentTime;
    inst.fader.gain.cancelScheduledValues(now);
    inst.fader.gain.setValueAtTime(inst.fader.gain.value, now);
    inst.fader.gain.linearRampToValueAtTime(0, now + Math.max(fade, 0.02));
    setTimeout(() => inst.ceiling.disconnect(), (fade + 0.1) * 1000);
    this.inst = null;
  }
}
