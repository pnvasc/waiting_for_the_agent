/* ===========================================================================
   Key bindings.

   Kept in one table so the whole control surface can be read at a glance, and
   so the presenter window can reuse the navigation half of it.

     → space PageDown   next step / slide
     ← PageUp Backspace previous
     Home End           first / last
     F                  fullscreen
     B                  blank the screen
     D                  night variant
     C                  elapsed clock in the corner
     P                  presenter window
   =========================================================================== */

export function bindKeys(actions) {
  const table = {
    ArrowRight: 'next',
    ' ': 'next',
    PageDown: 'next',
    ArrowDown: 'next',
    ArrowLeft: 'prev',
    PageUp: 'prev',
    ArrowUp: 'prev',
    Backspace: 'prev',
    Home: 'first',
    End: 'last',
    f: 'fullscreen',
    b: 'blank',
    d: 'night',
    c: 'clock',
    p: 'presenter',
  };

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;       // leave browser shortcuts alone
    const name = table[e.key] || table[e.key.toLowerCase()];
    if (!name) return;
    const fn = actions[name];
    if (!fn) return;
    e.preventDefault();
    fn();
  });
}

/* Fullscreen is its own small mess of vendor behaviour; keep it out of main. */
export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}
