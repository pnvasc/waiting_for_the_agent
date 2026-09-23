/* ===========================================================================
   The polyphony — two sessions played over each other.

   Everything is synthesised here with Web Audio; there are no samples and
   nothing is loaded. Four instruments, one per kind of event:

     prompt   the human: a soft, breathy, wind-like tone. The same person in
              both sessions, so the same instrument and register; the two
              sessions are told apart by where they sit left and right.
     tool     the agent: a short wooden pluck, marimba-like. Its pitch comes
              from the tool (timeline.js). The two agents are separated by
              register: A in the middle, B two octaves above.
     done     the same pluck, damped and quiet: the tool call returning.
     stop     a bell. The agent hands the turn back to me. Each session's
              bell is pitched in its agent's register.
     notify   a dry wooden knock: the agent is waiting on me.

   Scheduling uses the usual look-ahead pattern: a timer wakes every 25 ms
   and books any note due in the next 120 ms on the audio clock, which is
   sample-accurate. Stopping fades the master out and stops booking.

   Browsers only allow sound after the page has been touched. unlock() is
   called on the first key or click in the deck window; pressing F for
   fullscreen at the start of the talk is enough.
   =========================================================================== */

import { SCALE } from './timeline.js';

/* Per voice: root of the agent's register, the bell's pitch, and pan. */
const VOICE = {
  A: { agentRoot: 293.66, bell: 196.0, pan: -0.35 },     // D4; bell on G3
  B: { agentRoot: 1174.66, bell: 783.99, pan: 0.35 },    // D6; bell on G5
};
const HUMAN_ROOT = 146.83;                                // D3, both sessions

const LOOKAHEAD = 0.12;   // seconds of notes booked ahead of the clock
const TICK = 25;          // how often the booking timer wakes, in ms
const TAIL = 6;           // seconds the bells may ring on after the end

const hz = (root, deg, octave = 0) =>
  root * 2 ** ((SCALE[deg % SCALE.length] + 12 * octave) / 12);

export class Polyphony {
  constructor() {
    this.ctx = null;
    this.onProgress = null;      // hook: called with 0…1 while playing, null when done
    this._timer = null;
    this._raf = null;
  }

  /* --- setup ---------------------------------------------------------------- */

  unlock() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  _build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    // master -> gentle compressor -> speakers, with a reverb send beside it
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.comp.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._room(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet).connect(this.comp);

    this.noise = this._noiseBuffer(1);
  }

  /* A synthetic room: two channels of noise dying away exponentially. */
  _room(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const { ctx } = this;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* A fresh output for one note: its own gain and pan, into the master bus
     and (by `send`) into the reverb. */
  _out(when, pan, send) {
    const { ctx } = this;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.bus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      p.connect(s).connect(this.reverb);
    }
    return g;
  }

  /* --- the instruments ------------------------------------------------------ */

  /* Agent: marimba-like. A fundamental and a partial near four times it,
     which dies away faster: the wooden click at the start of the note. */
  pluck(when, freq, pan, level = 0.16, length = 0.55) {
    const { ctx } = this;
    const out = this._out(when, pan, 0.18);
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(level, when + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0008, when + length);

    [[1, 1, length], [3.93, 0.35, length * 0.3]].forEach(([ratio, amp, dur]) => {
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.frequency.value = freq * ratio;
      a.gain.setValueAtTime(amp, when);
      a.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(a).connect(out);
      o.start(when);
      o.stop(when + length + 0.05);
    });
  }

  /* Human: a soft wind tone. Triangle and sine, a slow vibrato, a little
     band of breath noise, a slow swell and a slower release. */
  breath(when, freq, pan, level = 0.2, length = 1.8) {
    const { ctx } = this;
    const out = this._out(when, pan, 0.35);
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(level, when + 0.22);
    out.gain.setTargetAtTime(0, when + length * 0.55, length * 0.22);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = freq * 6;
    tone.connect(out);

    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    vib.frequency.value = 4.8;
    depth.gain.value = freq * 0.004;
    vib.connect(depth);

    [['triangle', 1, 0.6], ['sine', 2, 0.25]].forEach(([type, ratio, amp]) => {
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * ratio;
      depth.connect(o.frequency);
      a.gain.value = amp;
      o.connect(a).connect(tone);
      o.start(when);
      o.stop(when + length + 0.5);
    });

    const air = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const a = ctx.createGain();
    air.buffer = this.noise;
    air.loop = true;
    band.type = 'bandpass';
    band.frequency.value = freq * 3;
    band.Q.value = 1.2;
    a.gain.value = 0.08;
    air.connect(band).connect(a).connect(out);
    air.start(when);
    air.stop(when + length + 0.5);

    vib.start(when);
    vib.stop(when + length + 0.5);
  }

  /* Stop: a bell. Additive, with the partials of a tuned church bell — hum,
     prime, minor third, fifth, octave and upper partials — each ringing for
     its own time, the low ones longest. */
  bell(when, freq, pan, level = 0.14) {
    const { ctx } = this;
    const out = this._out(when, pan, 0.55);
    out.gain.value = level;

    const partials = [
      [0.5, 0.55, 5.5], [1, 1.0, 4.2], [1.19, 0.5, 3.4], [1.5, 0.35, 2.8],
      [2, 0.45, 2.4], [2.51, 0.22, 1.7], [2.66, 0.18, 1.5], [3.01, 0.14, 1.2], [4.17, 0.1, 0.9],
    ];
    for (const [ratio, amp, dur] of partials) {
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.frequency.value = freq * ratio;
      a.gain.setValueAtTime(0, when);
      a.gain.linearRampToValueAtTime(amp, when + 0.003);
      a.gain.exponentialRampToValueAtTime(0.0005, when + dur);
      o.connect(a).connect(out);
      o.start(when);
      o.stop(when + dur + 0.05);
    }
  }

  /* Notify: a dry knock — a short burst of noise through a narrow band, and
     a very short low tone under it for body. */
  knock(when, pan, level = 0.22) {
    const { ctx } = this;
    const out = this._out(when, pan, 0.08);
    out.gain.setValueAtTime(level, when);
    out.gain.exponentialRampToValueAtTime(0.001, when + 0.07);

    const src = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    src.buffer = this.noise;
    band.type = 'bandpass';
    band.frequency.value = 1150;
    band.Q.value = 5;
    src.connect(band).connect(out);
    src.start(when, Math.random() * 0.5);
    src.stop(when + 0.08);

    const o = ctx.createOscillator();
    o.frequency.value = 420;
    o.connect(out);
    o.start(when);
    o.stop(when + 0.05);
  }

  /* --- what each event sounds like --------------------------------------------- */

  _sound(ev, voiceId, when) {
    const v = VOICE[voiceId] || VOICE.A;
    switch (ev.kind) {
      case 'prompt': return this.breath(when, hz(HUMAN_ROOT, ev.degree), v.pan * 1.4);
      case 'tool':   return this.pluck(when, hz(v.agentRoot, ev.degree), v.pan);
      case 'done':   return this.pluck(when, hz(v.agentRoot, ev.degree), v.pan, 0.05, 0.14);
      case 'stop':   return this.bell(when, v.bell, v.pan * 0.6);
      case 'notify': return this.knock(when, v.pan);
      default:       return undefined;
    }
  }

  /* --- playback ------------------------------------------------------------------- */

  get playing() { return this._timer !== null; }

  play(tl) {
    this.unlock();
    this.stop(0);
    const { ctx } = this;

    // A fresh master for each performance, so a stop can fade just this one.
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.comp);

    const queue = tl.voices
      .flatMap((v) => v.events.map((e) => ({ e, v: v.id })))
      .sort((a, b) => a.e.at - b.e.at);

    const start = ctx.currentTime + 0.15;
    let i = 0;

    this._timer = setInterval(() => {
      const horizon = ctx.currentTime + LOOKAHEAD;
      while (i < queue.length && start + queue[i].e.at < horizon) {
        this._sound(queue[i].e, queue[i].v, start + queue[i].e.at);
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
    if (!this.bus) return;
    const bus = this.bus;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + Math.max(fade, 0.02));
    setTimeout(() => bus.disconnect(), (fade + 0.1) * 1000);
    this.bus = null;
  }
}
