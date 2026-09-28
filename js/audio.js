/* ===========================================================================
   The polyphony — two sessions played together, on slide 4.

   It is played on the instruments of the final piece (instruments.js), with
   the same settings (the 'sound' and 'pitch' sections of piece.config.json),
   so what the room learns here is what it hears at the end:

     prompt   me: a warm, breathy wind tone. The same person in both
              sessions, so the same instrument and register.
     tool     the agent working: a bowed note, held for as long as the tool
              call ran (from the call to its return), its pitch from the tool.
              A shell command is a dry tick instead, not a pitch.
     stop     a bell in the agent's register: it hands the turn back to me.
     notify   the same bell: it is waiting on me. Both are summonses.

   The two agents are the final piece's first and third voices: A low and on
   the left, B two octaves higher and on the right. The final piece adds a
   third agent between them, and the light.

   Times come from timeline.js, which the staves are drawn from too, so the
   sound and the notation cannot drift apart. Notes are booked a little ahead
   of the audio clock, which is sample-accurate. Stopping fades this
   performance out and stops booking.

   Browsers only allow sound after the page has been touched. unlock() is
   called on the first key or click in the deck window; pressing F for
   fullscreen at the start of the talk is enough.
   =========================================================================== */

import { Instruments } from './instruments.js';

const VOICE = { A: 0, B: 2 };   // which of the final piece's agents each session plays as
const LOOKAHEAD = 0.15;         // seconds of notes booked ahead of the clock
const TICK = 25;                // how often the booking timer wakes, in ms
const TAIL = 6;                 // seconds the bells may ring on after the end

const pitch = (root, degree, scale) =>
  root + scale[degree % scale.length] + 12 * Math.floor(degree / scale.length);

/* The timeline's events as the instruments' events: {at, kind, voice, midi, dur}. */
export function score(tl, pc) {
  const out = [];
  for (const v of tl.voices) {
    const voice = VOICE[v.id] ?? 0;
    const root = pc.voice_roots[voice % pc.voice_roots.length];

    // Each call's note lasts until its return: the next 'done' of that tool.
    const open = {};
    const returns = new Map();
    for (const e of v.events) {
      if (e.kind === 'tool') (open[e.tool] ||= []).push(e);
      if (e.kind === 'done' && open[e.tool]?.length) returns.set(open[e.tool].shift(), e.at);
    }

    for (const e of v.events) {
      if (e.kind === 'prompt') {
        out.push({ at: e.at, kind: 'prompt', voice, midi: pitch(pc.prompt_root, e.degree, pc.scale) });
      } else if (e.kind === 'tool' && e.degree === 'tick') {
        out.push({ at: e.at, kind: 'tick', voice, midi: pitch(root, 4, pc.scale) });
      } else if (e.kind === 'tool') {
        const dur = (returns.get(e) ?? e.at) - e.at;    // too short or missing: the instrument's min_length
        out.push({ at: e.at, kind: 'note', voice, midi: pitch(root, e.degree, pc.scale), dur });
      } else if (e.kind === 'stop' || e.kind === 'notify') {
        out.push({ at: e.at, kind: 'bell', voice, midi: pitch(root, pc.summons_degree, pc.scale) });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export class Polyphony {
  constructor() {
    this.ctx = null;
    this.cfg = null;
    this.inst = null;
    this.onProgress = null;      // hook: called with 0…1 while playing, null when done
    this._timer = null;
    this._raf = null;
    this.ready = fetch('piece.config.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((cfg) => { this.cfg = cfg; });
  }

  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  get playing() { return this._timer !== null; }

  play(tl) {
    this.unlock();
    this.stop(0);
    if (!this.cfg) { this.ready.then(() => this.play(tl)); return; }
    const { ctx } = this;

    // A fresh set of instruments for each performance, so a stop can fade
    // this one out while anything still ringing from the last dies away.
    this.inst = new Instruments(ctx, this.cfg.sound);
    const inst = this.inst;
    const queue = score(tl, this.cfg.pitch);
    const start = ctx.currentTime + 0.15;
    let i = 0;

    this._timer = setInterval(() => {
      const horizon = ctx.currentTime + LOOKAHEAD;
      while (i < queue.length && start + queue[i].at < horizon) {
        inst.play(queue[i], start + queue[i].at);
        i += 1;
      }
      if (i >= queue.length && ctx.currentTime > start + tl.duration + TAIL) this.stop(0);
    }, TICK);

    // hook: the playhead on slide 4 follows this.
    const frame = () => {
      const p = (ctx.currentTime - start) / tl.duration;
      if (this.onProgress) this.onProgress(p < 0 ? 0 : p > 1 ? null : p);
      if (p <= 1 && this._timer !== null) this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  /* Fades out over `fade` seconds (0: cut) and stops booking notes. */
  stop(fade = 0.5) {
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    this._timer = null;
    if (this.onProgress) this.onProgress(null);
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
