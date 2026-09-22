/* ===========================================================================
   Slide 7 — the cumulative record.

   The classic instrument of the operant lab: time on x, total responses on y,
   one step per response. A variable-interval schedule draws a straight,
   unhesitating climb — the animal keeps checking, and the behaviour is very
   hard to extinguish.

   Here a "response" is a switch back to a window with an agent in it, taken
   from the real focus log. The slope is the point; the staircase never flattens.
   =========================================================================== */

import { svg, el, line, text, awaiting } from './svg.js';

const W = 1100;
const H = 380;
const PAD = { top: 26, right: 40, bottom: 56, left: 78 };

export function render(container, data) {
  if (!data || !data.checks?.length) return awaiting(container);

  const checks = data.checks;
  const span = data.span || checks[checks.length - 1];

  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const x0 = PAD.left;
  const x1 = W - PAD.right;
  const y0 = H - PAD.bottom;
  const y1 = PAD.top;

  const X = (t) => x0 + (t / span) * (x1 - x0);
  const Y = (n) => y0 - (n / checks.length) * (y0 - y1);

  /* --- axes --------------------------------------------------------------- */

  line(root, x0, y0, x1, y0);
  line(root, x0, y0, x0, y1);

  // x ticks every ten minutes, because the run is an hour long.
  for (let m = 0; m * 60 <= span; m += 10) {
    const x = X(m * 60);
    line(root, x, y0, x, y0 + 7);
    text(root, x, y0 + 28, String(m), { 'text-anchor': 'middle' });
  }
  text(root, (x0 + x1) / 2, y0 + 50, 'minutes', { class: 'axis', 'text-anchor': 'middle' });

  text(root, 0, 0, 'checks', {
    class: 'axis', 'text-anchor': 'middle',
    transform: `translate(${x0 - 48} ${(y0 + y1) / 2}) rotate(-90)`,
  });
  text(root, x0 - 12, y1 + 6, String(checks.length), { 'text-anchor': 'end' });

  /* --- the staircase -------------------------------------------------------
     Drawn as a true step function: flat while waiting, vertical on the check.
     No smoothing — the flats are the waits and they should be visible. */

  let d = `M ${X(0)} ${Y(0)}`;
  checks.forEach((t, i) => {
    d += ` L ${X(t)} ${Y(i)} L ${X(t)} ${Y(i + 1)}`;
  });
  d += ` L ${X(span)} ${Y(checks.length)}`;
  el('path', { d, class: 'stroke' }, root);

  // A tick on the time axis for each check: the raw event train under the curve.
  checks.forEach((t) => line(root, X(t), y0, X(t), y0 - 8, 'rule'));

  /* --- what the slope is ---------------------------------------------------
     One red label, because a rate is a time fact. It sits top-left, in the
     empty quadrant the staircase leaves behind, so it never crosses the line. */

  const perHour = Math.round((checks.length / span) * 3600);
  const rate = `${perHour} checks/hour${data.stub ? ' · stub' : ''}`;
  text(root, x0 + 18, y1 + 14, rate, { class: 'rubric' });

  return root;
}
