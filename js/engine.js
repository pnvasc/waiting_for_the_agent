/* ===========================================================================
   The slide engine.

   Small on purpose: it knows about slides, steps, and listeners, and nothing
   else. Keys, the clock, the presenter window and every figure are separate
   modules that attach to the events below. That is what makes it possible to
   add an audio or replay module later without touching this file — such a
   module only needs deck.on('change') and deck.goto().

     next()              advance one step; if the steps are done, one slide
     prev()              the mirror of next()
     goto(i, {step})     jump; step defaults to 0, or to "all shown" going back
     on(evt, fn)         'change' | 'step'; returns an unsubscribe function
     bind(id, fn)        live value hook — see bind() below
     state               { index, total, stepIndex, stepCount, id }

   A slide's step count comes from data-steps on the <section>. Figures listen
   for 'step' and decide for themselves what a given step reveals; the engine
   only counts.
   =========================================================================== */

export class Deck {
  constructor(stage) {
    this.stage = stage;
    this.slides = [...stage.querySelectorAll('.slide')];
    this.index = 0;
    this.stepIndex = 0;

    this._listeners = { change: [], step: [] };
    this._bindings = new Map();

    this._fitToViewport();
    addEventListener('resize', () => this._fitToViewport());

    // Reload lands where you left off — useful when live-editing mid-talk.
    addEventListener('hashchange', () => this._readHash());
    this._readHash({ silent: true });

    this._render({ initial: true });
  }

  /* --- public API -------------------------------------------------------- */

  get total() { return this.slides.length; }

  get slide() { return this.slides[this.index]; }

  get stepCount() { return Number(this.slide.dataset.steps || 0); }

  get state() {
    return {
      index: this.index,
      total: this.total,
      stepIndex: this.stepIndex,
      stepCount: this.stepCount,
      id: this.slide.id,
    };
  }

  next() {
    if (this.stepIndex < this.stepCount) {
      this.stepIndex += 1;
      this._emit('step', this.state);
      this._emit('change', this.state);
      this._writeHash();
      return;
    }
    if (this.index < this.total - 1) this.goto(this.index + 1);
  }

  prev() {
    if (this.stepIndex > 0) {
      this.stepIndex -= 1;
      this._emit('step', this.state);
      this._emit('change', this.state);
      this._writeHash();
      return;
    }
    // Going back into a stepped slide should show it finished, not empty:
    // you are returning to something you already said.
    if (this.index > 0) this.goto(this.index - 1, { step: 'all' });
  }

  goto(i, { step = 0 } = {}) {
    const next = Math.max(0, Math.min(this.total - 1, i));
    const changed = next !== this.index;
    this.index = next;
    this.stepIndex = step === 'all' ? this.stepCount : Math.min(step, this.stepCount);
    this._render({ changed });
    this._writeHash();
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => {
      this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
    };
  }

  /* Bind a live value to an element by id. The function is called on every
     slide change and on an internal tick, and its return value becomes the
     element's text.

     hook: this is where a live "seconds since my last prompt" reader attaches.
     deck.bind('seconds-since-prompt', () => secondsSinceLastPrompt()); */
  bind(id, fn) {
    this._bindings.set(id, fn);
    if (!this._bindTimer) this._bindTimer = setInterval(() => this._applyBindings(), 1000);
    this._applyBindings();
  }

  /* --- internals --------------------------------------------------------- */

  _applyBindings() {
    for (const [id, fn] of this._bindings) {
      const el = document.getElementById(id);
      if (!el) continue;
      const value = fn(this.state);
      if (value != null && el.textContent !== String(value)) el.textContent = String(value);
    }
  }

  _render({ changed = true, initial = false } = {}) {
    this.slides.forEach((s, i) => s.classList.toggle('is-current', i === this.index));

    // Steps are owned by the figures; the engine only exposes the count and
    // the index, and toggles anything in the markup that declares data-step.
    this.slide.querySelectorAll('[data-step]').forEach((el) => {
      el.classList.toggle('is-shown', Number(el.dataset.step) <= this.stepIndex);
    });

    if (changed || initial) this._emit('change', this.state);
    this._emit('step', this.state);
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event] || []) fn(payload);
  }

  /* One transform is the whole responsive strategy: the stage is a fixed
     1600 x 900 canvas and we scale it to fit. Nothing inside ever reflows,
     so the deck looks identical on a laptop and on a hall projector. */
  _fitToViewport() {
    const w = this.stage.offsetWidth;
    const h = this.stage.offsetHeight;
    const k = Math.min(innerWidth / w, innerHeight / h);
    this.stage.style.transform = `scale(${k})`;
  }

  _writeHash() {
    const hash = this.stepCount ? `#${this.index + 1}.${this.stepIndex}` : `#${this.index + 1}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  _readHash({ silent = false } = {}) {
    const m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return;
    const i = Number(m[1]) - 1;
    const step = m[2] ? Number(m[2]) : 0;
    if (silent) {
      this.index = Math.max(0, Math.min(this.slides.length - 1, i));
      this.stepIndex = Math.min(step, this.stepCount);
    } else {
      this.goto(i, { step });
    }
  }
}
