/* ===========================================================================
   The clock of an animated figure.

   An animation runs only while its slide is the current one, and starts over
   from nothing each time the slide comes up, so the room always sees it from
   the beginning. It stops for good once its container leaves the page (the
   presenter window replaces its preview on every change).

     whileShown(container, {
       start() { … },          // back to the beginning
       frame(t, dt) { … },     // t: seconds since the slide came up
       still: 30,              // with reduced motion: draw this moment, once
     });
   =========================================================================== */

export function whileShown(container, { start, frame, still }) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    start();
    frame(still, still);
    return;
  }

  const slide = container.closest('.slide');
  let was = false;
  let begun = 0;
  let last = 0;

  function tick(now) {
    if (!container.isConnected) return;
    const current = !slide || slide.classList.contains('is-current');
    if (current && !was) {                      // the slide has just come up
      start();
      begun = now;
      last = now;
    }
    was = current;
    if (current) {
      const dt = Math.min((now - last) / 1000, 0.1);   // a hidden tab does not jump ahead
      last = now;
      frame((now - begun) / 1000, dt);
    }
    requestAnimationFrame(tick);
  }

  start();
  frame(0, 0);
  requestAnimationFrame(tick);
}
