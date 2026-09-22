/* ===========================================================================
   Elapsed time.

   One source of truth, shared with the presenter window so both read the same
   number. The clock starts on the first advance, not on page load, so opening
   the deck early to check the projector does not eat into the twenty minutes.

   The on-slide clock is off by default and toggled with C. The presenter
   window always shows elapsed time.
   =========================================================================== */

export class Elapsed {
  constructor() {
    this.startedAt = null;
  }

  /* Idempotent: the first call wins, later ones are ignored. */
  start(at = Date.now()) {
    if (this.startedAt === null) this.startedAt = at;
    return this.startedAt;
  }

  reset() {
    this.startedAt = null;
  }

  get seconds() {
    return this.startedAt === null ? 0 : Math.floor((Date.now() - this.startedAt) / 1000);
  }

  /* mm:ss, and hh:mm:ss only if the talk really does run over an hour. */
  format() {
    const s = this.seconds;
    const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const hh = Math.floor(s / 3600);
    return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  }
}

/* Drives a DOM node once a second. Returns a stop function. */
export function tick(el, elapsed) {
  const paint = () => { el.textContent = elapsed.format(); };
  paint();
  const id = setInterval(paint, 1000);
  return () => clearInterval(id);
}
