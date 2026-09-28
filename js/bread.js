/* ===========================================================================
   The bread slide, played: a schedule is a rhythm.

   The music is read from the slide itself (the <ol class="schedule">): each
   action is my wind tone, on the beat; each wait is counted out by a steady
   pulse, one beat for every quarter of an hour, until the last wait is over
   and the bread is done. Nothing is irregular, so everything can be
   foreseen: that is the point, against the agents' piece on s4.

   Edit the schedule on the slide and the music follows. The numbers (tempo,
   minutes a beat stands for, the longest wait in beats)
   are the 'bread' section of piece.config.json; the sounds are the piece's
   instruments, so this is the same world as s4 and s16.

   While it plays, a small red mark sits by the action being sounded.

     const bread = new Bread(slide);
     bread.unlock();       // from a key or a click
     bread.play();  bread.stop();  bread.playing
   =========================================================================== */

import { Instruments } from './instruments.js';

const pitch = (root, degree, scale) =>
  root + scale[degree % scale.length] + 12 * Math.floor(degree / scale.length);

/* "wait 12 hours", "wait half an hour", "wait 45 minutes" -> minutes. */
function minutes(words) {
  const m = words.match(/(half an|an|a|\d+(?:\.\d+)?)\s+(hour|minute)/i);
  if (!m) return 0;
  const n = { 'half an': 0.5, an: 1, a: 1 }[m[1].toLowerCase()] ?? Number(m[1]);
  return m[2].toLowerCase() === 'hour' ? n * 60 : n;
}

/* The schedule as events, in beats: {beat, kind, midi?, accent?, line?}. */
export function score(list, cfg) {
  const b = cfg.bread;
  const pc = cfg.pitch;
  const steps = [...list.querySelectorAll('li')].map((li) => ({
    li,
    action: li.querySelector('.do')?.textContent.trim() ?? '',
    wait: minutes(li.querySelector('.wait')?.textContent ?? ''),
  }));

  // Each kind of action has its own note, in the order they first come:
  // the four folds are one note, four times.
  const names = [...new Set(steps.map((s) => s.action))];
  const events = [];
  let beat = 0;
  steps.forEach((s, i) => {
    const degree = names.indexOf(s.action);
    events.push({ beat, kind: 'prompt', midi: pitch(pc.prompt_root, degree, pc.scale), line: i });
    beat += Math.max(1, Math.min(Math.round(s.wait / b.minutes_per_beat), b.longest_wait));
  });

  // The pulse counts every beat, to the end of the last wait.
  for (let k = 0; k <= beat; k += 1) {
    events.push({ beat: k, kind: 'pulse', accent: k % b.beats_per_bar === 0 ? 1 : 0 });
  }
  return { events, beats: beat, steps };
}

export class Bread {
  constructor(slide) {
    this.slide = slide;
    this.list = slide.querySelector('.schedule');
    this.ctx = null;
    this.inst = null;
    this._raf = null;
    this.ready = fetch('piece.config.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((cfg) => { this.cfg = cfg; });
  }

  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  get playing() { return this._raf !== null; }

  async play() {
    this.stop(0);
    await this.ready;
    this.unlock();
    const { ctx, cfg } = this;
    const { events, beats, steps } = score(this.list, cfg);
    const spb = 60 / cfg.bread.bpm;

    // A fresh set of instruments for each playing, so a stop can fade it.
    this.inst = new Instruments(ctx, cfg.sound);
    const start = ctx.currentTime + 0.3;
    for (const e of events) this.inst.play(e, start + e.beat * spb);

    // The mark follows the action being sounded, until the last beat.
    const lines = events.filter((e) => e.line !== undefined);
    const end = start + beats * spb;
    const frame = () => {
      const now = ctx.currentTime;
      let current = -1;
      for (const e of lines) if (start + e.beat * spb <= now) current = e.line;
      steps.forEach((s, i) => s.li.classList.toggle('now', i === current && now < end));
      if (now < end + 0.1) this._raf = requestAnimationFrame(frame);
      else this._done();
    };
    this._raf = requestAnimationFrame(frame);
  }

  _done() {
    cancelAnimationFrame(this._raf);
    this._raf = null;
    this.list.querySelectorAll('li.now').forEach((li) => li.classList.remove('now'));
  }

  /* Fades out over `fade` seconds and takes the mark away. */
  stop(fade = 0.5) {
    this._done();
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
