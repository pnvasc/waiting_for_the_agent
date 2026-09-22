/* ===========================================================================
   Slides 5 and 6 — the box.

   Two axes, four corners:

        legible  │  Tehching Hsieh              Making bread
                 │  (Time Clock Piece)
                 │
                 │  Agent                       Blood test results
      illegible  └────────────────────────────────────────────────
                    short            Length             long

   On slide 5 the corners appear one keypress at a time and the Agent corner
   comes last — and, per the motion rule, abruptly. On slide 6 the same
   drawing returns small, with only the Agent corner on it and two leaders
   reaching to the two axes it fails on.

   No red here. The rubric colour is reserved for time events and marks of
   interruption; a corner of a diagram is neither. The Agent corner earns its
   weight by arriving last, and by being alone on slide 6.
   =========================================================================== */

import { svg, el, line, text } from './svg.js';

/* The two sizes are separate geometries rather than one drawing scaled down:
   at 40% the labels of the full version would be illegible from the back of
   a room. Each size is drawn at roughly the pixel size it will occupy. */
const FULL = {
  W: 1000, H: 620,
  pad: { top: 44, right: 60, bottom: 74, left: 128 },
  inset: { x: 120, y: 86, xr: 92, yt: 66 },
  labelSize: 18, axisSize: 15, dot: 4.5,
};

const MINI = {
  W: 480, H: 430,
  pad: { top: 40, right: 36, bottom: 62, left: 78 },
  inset: { x: 96, y: 78, xr: 80, yt: 60 },
  labelSize: 20, axisSize: 16, dot: 5.5,
};

/* Reveal order matters: the Agent is last, so the room has already agreed
   about the other three by the time it lands. */
const CORNERS = [
  { key: 'hsieh', step: 1, x: 0, y: 1, label: ['Tehching Hsieh', '(Time Clock Piece)'] },
  { key: 'bread', step: 2, x: 1, y: 1, label: ['Making bread'] },
  { key: 'blood', step: 3, x: 1, y: 0, label: ['Blood test results'] },
  { key: 'agent', step: 4, x: 0, y: 0, label: ['Agent'] },
];

export function render(container, _data, options = {}) {
  const { mini = false, only = null } = options;
  const g0 = mini ? MINI : FULL;
  const { W, H, pad, inset } = g0;

  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const x0 = pad.left;
  const x1 = W - pad.right;
  const y0 = H - pad.bottom;      // illegible end (bottom)
  const y1 = pad.top;             // legible end (top)

  /* --- axes ------------------------------------------------------------- */

  line(root, x0, y0, x1, y0);     // Length
  line(root, x0, y0, x0, y1);     // Legibility

  const axis = { class: 'axis', 'font-size': g0.axisSize };

  text(root, (x0 + x1) / 2, y0 + (mini ? 46 : 52), 'Length',
    { ...axis, class: 'axis label', 'font-size': g0.labelSize, 'text-anchor': 'middle' });
  text(root, x0 + 4, y0 + 26, 'short', axis);
  text(root, x1, y0 + 26, 'long', { ...axis, 'text-anchor': 'end' });

  const yMid = (y0 + y1) / 2;
  text(root, 0, 0, 'Legibility', {
    ...axis, class: 'axis label', 'font-size': g0.labelSize, 'text-anchor': 'middle',
    transform: `translate(${x0 - (mini ? 52 : 74)} ${yMid}) rotate(-90)`,
  });
  text(root, 0, 0, 'illegible', {
    ...axis, 'text-anchor': 'start',
    transform: `translate(${x0 - 20} ${y0}) rotate(-90)`,
  });
  text(root, 0, 0, 'legible', {
    ...axis, 'text-anchor': 'end',
    transform: `translate(${x0 - 20} ${y1}) rotate(-90)`,
  });

  /* --- corners ----------------------------------------------------------- */

  // Inset so the marks sit *near* the corners rather than on the axes.
  const cxOf = (side) => (side ? x1 - inset.xr : x0 + inset.x);
  const cyOf = (side) => (side ? y1 + inset.yt : y0 - inset.y);

  for (const corner of CORNERS) {
    if (only && corner.key !== only) continue;

    const cx = cxOf(corner.x);
    const cy = cyOf(corner.y);
    const isAgent = corner.key === 'agent';

    const g = el('g', {
      // Slide 5 reveals by step. On slide 6 there is nothing to reveal.
      'data-step': mini ? null : corner.step,
      // The agent's mark does not ease in. Everything else fades.
      class: isAgent ? 'agent' : 'human',
    }, root);

    el('circle', { cx, cy, r: g0.dot, class: 'fill' }, g);

    const anchor = corner.x ? 'end' : 'start';
    const tx = cx + (corner.x ? -18 : 18);
    corner.label.forEach((ln, i) => {
      text(g, tx, cy + 6 + i * (g0.labelSize + 8), ln, {
        class: 'label', 'font-size': g0.labelSize, 'text-anchor': anchor,
      });
    });
  }

  /* --- slide 6: what the Agent corner is short of --------------------------
     Two dotted leaders from the agent mark down to "short" and across to
     "illegible" — the two failures the statement on the left has just named. */

  if (only === 'agent') {
    const cx = cxOf(0);
    const cy = cyOf(0);
    const g = el('g', { class: 'agent' }, root);
    const leader = { class: 'rule', 'stroke-dasharray': '2 5' };

    el('line', { x1: cx, y1: y0, x2: cx, y2: cy, ...leader }, g);
    el('line', { x1: x0, y1: cy, x2: cx, y2: cy, ...leader }, g);
  }

  return root;
}
