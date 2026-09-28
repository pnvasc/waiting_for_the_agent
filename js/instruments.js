/* ===========================================================================
   The instruments of the piece.

   Two families, and only two:

     the agents   one bowed timbre for all three, like a consort of viols:
                  one kind of instrument in three sizes. Their tool calls are
                  quiet notes underneath; a shell command is a dry wooden tick
                  in the same register; a summons (Stop, Notification) is a
                  bell in the same register, and it is the loudest thing in
                  the piece.
     me           my prompts: a warm, breathy wind tone, in front.

   And one more, for the bread slide only: a pulse, a soft low felt beat,
   the steady clock that the agents never have.

   Everything is synthesised: no samples, nothing loaded. Every number comes
   from the 'sound' section of piece.config.json and is read when a note is
   made, so a slider on the audition page is heard on the next note. Levels
   are read by mix(), which the page calls when a level changes.

   The signal path:

     each agent: bowed ─┐
                 ticks ─┼─ agent gain ─┐
                 bells ─┘              ├─ master ─ fader ─ limiter ─ ceiling ─ speakers
     prompts ─────────── prompt gain ──┤       └─ (reverb send, into master)
     pulse ───────────── pulse gain ───┘

   Works the same in an OfflineAudioContext, which is how the levels are
   checked without a speaker.
   =========================================================================== */

const dB = (x) => 10 ** (x / 20);

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/* The ceiling's transfer curve: linear below 0.8; above it, a tanh knee
   that approaches 0.98 and never reaches it. */
function ceilingCurve(n = 4096) {
  const knee = 0.8;
  const top = 0.98;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (top - knee) * Math.tanh((a - knee) / (top - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

export class Instruments {
  constructor(ctx, sound) {
    this.ctx = ctx;
    this.cfg = sound;

    // The limiter is a compressor pushed as far as it goes: hard knee, very
    // high ratio, fast attack. A last safety, not a colour.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;

    // A compressor alone can still overshoot when pushed hard, so the very
    // last stage is a ceiling: straight up to 0.8, then bending smoothly so
    // that nothing can ever come out louder than 0.98. The piece cannot clip,
    // whatever the sliders say.
    this.ceiling = ctx.createWaveShaper();
    this.ceiling.curve = ceilingCurve();
    this.ceiling.oversample = '4x';
    this.limiter.connect(this.ceiling).connect(ctx.destination);

    // The fader belongs to the performance: stop() rides it down to silence.
    this.fader = ctx.createGain();
    this.fader.connect(this.limiter);
    this.master = ctx.createGain();
    this.master.connect(this.fader);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._room(3.4);
    this.wet = ctx.createGain();
    this.reverb.connect(this.wet).connect(this.master);

    // One strip per agent, each with a gain per kind of sound, so the page
    // can solo an agent or silence all the bells.
    this.agents = [0, 1, 2].map(() => {
      const out = ctx.createGain();
      out.connect(this.master);
      const kind = {};
      for (const k of ['bowed', 'ticks', 'bells']) {
        kind[k] = ctx.createGain();
        kind[k].connect(out);
      }
      return { out, kind };
    });
    this.prompts = ctx.createGain();
    this.prompts.connect(this.master);
    this.pulses = ctx.createGain();
    this.pulses.connect(this.master);

    this.noise = this._noise(1);
    this.mix();
  }

  /* --- levels ----------------------------------------------------------------
     `on` says which parts are heard (the page's solo and mute buttons):
     { agents: [true, true, true], bowed, ticks, bells, prompts }. */

  mix(on = {}) {
    const m = this.cfg.mix;
    const lim = this.cfg.limiter;
    const now = this.ctx.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, now, 0.03);
    const heard = (k) => on[k] !== false;

    set(this.master.gain, dB(m.master));
    set(this.wet.gain, dB(m.reverb));
    this.limiter.threshold.value = lim.threshold;
    this.limiter.release.value = lim.release;

    this.agents.forEach((a, i) => {
      set(a.out.gain, on.agents && on.agents[i] === false ? 0 : 1);
      set(a.kind.bowed.gain, heard('bowed') ? dB(m.agents) : 0);
      set(a.kind.ticks.gain, heard('ticks') ? dB(m.ticks) : 0);
      set(a.kind.bells.gain, heard('bells') ? dB(m.bells) : 0);
    });
    set(this.prompts.gain, heard('prompts') ? dB(m.prompts) : 0);
    set(this.pulses.gain, heard('pulse') ? dB(m.pulse ?? -12) : 0);
  }

  /* --- plumbing ------------------------------------------------------------- */

  /* A synthetic room: noise dying away, a little different in each ear. */
  _room(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    return buf;
  }

  _noise(seconds) {
    const { ctx } = this;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* A note's own output: gain, then pan, then into `bus`, with some of it
     sent to the room. */
  _out(bus, pan, send) {
    const { ctx } = this;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(bus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      p.connect(s).connect(this.reverb);
    }
    return g;
  }

  _pan(voice) {
    const pans = this.cfg.pan;
    return pans[voice % pans.length];
  }

  /* --- the agents ------------------------------------------------------------ */

  /* A bowed note: two slightly mistuned sawtooth strings through a low-pass
     filter, a swell in, a little vibrato, and a gentle release. */
  bowed(when, freq, length, voice) {
    const c = this.cfg.agents;
    const { ctx } = this;
    const dur = Math.min(Math.max(length, c.min_length), c.max_length);
    const out = this._out(this.agents[voice].kind.bowed, this._pan(voice), c.reverb_send);

    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(0.5, when + c.attack);
    out.gain.setValueAtTime(0.5, when + Math.max(dur, c.attack));
    out.gain.setTargetAtTime(0, when + Math.max(dur, c.attack), c.release / 3);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * c.brightness;
    filter.Q.value = 0.8;
    filter.connect(out);

    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    vib.frequency.value = c.vibrato_hz;
    depth.gain.value = freq * c.vibrato_depth;
    vib.connect(depth);

    const end = when + dur + c.release * 2;
    for (const detune of [-c.detune, c.detune]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * (1 + detune);
      depth.connect(o.frequency);
      o.connect(filter);
      o.start(when);
      o.stop(end);
    }
    vib.start(when);
    vib.stop(end);
  }

  /* A shell command: a dry tick, a click of noise tuned to the agent's
     register, with a very short tone under it for body. */
  tick(when, freq, voice) {
    const c = this.cfg.ticks;
    const { ctx } = this;
    const out = this._out(this.agents[voice].kind.ticks, this._pan(voice), c.reverb_send);
    out.gain.setValueAtTime(1, when);
    out.gain.exponentialRampToValueAtTime(0.001, when + c.length);

    const src = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    src.buffer = this.noise;
    band.type = 'bandpass';
    band.frequency.value = Math.min(freq * 4, 9000);
    band.Q.value = c.q;
    src.connect(band).connect(out);
    src.start(when, Math.random() * 0.5);
    src.stop(when + c.length + 0.02);

    const o = ctx.createOscillator();
    const a = ctx.createGain();
    o.frequency.value = freq * 2;
    a.gain.value = 0.4;
    o.connect(a).connect(out);
    o.start(when);
    o.stop(when + c.length);
  }

  /* A summons: a bell. The partials of a tuned bell (hum, prime, minor
     third, fifth, octave and above), each ringing for its own time, the
     low ones longest. */
  bell(when, freq, voice) {
    const c = this.cfg.bells;
    const { ctx } = this;
    const out = this._out(this.agents[voice].kind.bells, this._pan(voice) * 0.7, c.reverb_send);
    const partials = [
      [0.5, 0.55, 1], [1, 1.0, 0.8], [1.19, 0.5, 0.62], [1.5, 0.35, 0.52],
      [2, 0.45, 0.45], [2.51, 0.22, 0.32], [2.66, 0.18, 0.28], [3.01, 0.14, 0.22], [4.17, 0.1, 0.17],
    ];
    for (const [ratio, amp, life] of partials) {
      const upper = ratio > 1.5 ? c.brightness : 1;
      const dur = c.ring * life;
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.frequency.value = freq * ratio;
      a.gain.setValueAtTime(0, when);
      a.gain.linearRampToValueAtTime(amp * upper * 0.35, when + 0.003);
      a.gain.exponentialRampToValueAtTime(0.0005, when + dur);
      o.connect(a).connect(out);
      o.start(when);
      o.stop(when + dur + 0.05);
    }
  }

  /* --- me ---------------------------------------------------------------------- */

  /* A prompt: a soft wind tone. Triangle and sine, a slow vibrato, a band of
     breath noise, a swell in and a slower release. */
  wind(when, freq) {
    const c = this.cfg.prompts;
    const { ctx } = this;
    const out = this._out(this.prompts, 0, c.reverb_send);
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(0.6, when + c.attack);
    out.gain.setTargetAtTime(0, when + c.length * 0.55, c.length * 0.2);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = freq * 6;
    tone.connect(out);

    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    vib.frequency.value = c.vibrato_hz;
    depth.gain.value = freq * c.vibrato_depth;
    vib.connect(depth);

    const end = when + c.length + 0.6;
    for (const [type, ratio, amp] of [['triangle', 1, 0.6], ['sine', 2, 0.22]]) {
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * ratio;
      depth.connect(o.frequency);
      a.gain.value = amp;
      o.connect(a).connect(tone);
      o.start(when);
      o.stop(end);
    }

    const air = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const a = ctx.createGain();
    air.buffer = this.noise;
    air.loop = true;
    band.type = 'bandpass';
    band.frequency.value = freq * 3;
    band.Q.value = 1.2;
    a.gain.value = c.breath;
    air.connect(band).connect(a).connect(out);
    air.start(when);
    air.stop(end);
    vib.start(when);
    vib.stop(end);
  }

  /* --- the bread's clock ---------------------------------------------------------- */

  /* A beat: a low sine that falls a little in pitch as it dies, like a
     felt beater on a drum. `accent` (0 to 1) makes the first beat of a bar
     a little stronger. */
  pulse(when, accent = 0) {
    const c = this.cfg.pulse;
    const { ctx } = this;
    const out = this._out(this.pulses, 0, c.reverb_send);
    const level = 0.55 + 0.45 * accent;
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(level, when + 0.006);
    out.gain.exponentialRampToValueAtTime(0.001, when + c.length);

    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(c.pitch * 1.6, when);
    o.frequency.exponentialRampToValueAtTime(c.pitch, when + 0.06);
    o.connect(out);
    o.start(when);
    o.stop(when + c.length + 0.02);
  }

  /* --- one event, whatever it is --------------------------------------------------- */

  play(e, when) {
    switch (e.kind) {
      case 'note': return this.bowed(when, hz(e.midi), e.dur, e.voice);
      case 'tick': return this.tick(when, hz(e.midi), e.voice);
      case 'bell': return this.bell(when, hz(e.midi), e.voice);
      case 'prompt': return this.wind(when, hz(e.midi));
      case 'pulse': return this.pulse(when, e.accent);
      default: return undefined;
    }
  }
}
