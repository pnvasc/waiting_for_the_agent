/* ===========================================================================
   The Godot slide: an arrival that cannot happen.

   A line sets out from the left towards a ring at the right edge. Every few
   seconds it covers half of the distance that is left, so it is fast at
   first, then slower, then barely moving, and it never reaches the ring: a
   last small gap stays open however long the slide is up. Zeno, drawn.

   Nothing is labelled; the sentence above says who is not coming.
   =========================================================================== */

import { svg, el } from './svg.js';
import { whileShown } from './loop.js';

const W = 1300;          // the slide's width inside its padding
const H = 120;
const RING = 9;          // Godot
const HALF = 2.4;        // seconds to cover half of what is left
const NEVER = 12;        // the gap that stays open, in units: small, but always there

export function render(container) {
  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const y = H / 2;
  const ringX = W - RING - 2;
  const goal = ringX - RING;                    // the ring's near edge
  const path = el('line', { x1: 0, y1: y, x2: 0, y2: y, class: 'lane agent' }, root);
  el('circle', { cx: ringX, cy: y, r: RING, class: 'ring' }, root);

  whileShown(container, {
    start: () => path.setAttribute('x2', 0),
    frame: (t) => {
      const left = NEVER + (goal - NEVER) * 2 ** (-t / HALF);
      path.setAttribute('x2', (goal - left).toFixed(2));
    },
    still: 60,
  });
}
