/* ===========================================================================
   Slide 13 — the window-switching timeline.

   One lane per application, one bar per stretch during which that window was
   frontmost. The data is the real focus log: one record per *switch*, so a
   record's dwell is the distance to the next one.

   Three conventions are carried over from plot_focus.py so that swapping in a
   longer processed run does not change what the picture means:

     * a gap over SESSION_GAP is the logger being down, not attention;
     * a single-app stretch longer than DWELL_CAP is away-from-keyboard, and
       only the first DWELL_CAP is credited to that app;
     * very short dwells are still drawn, at a minimum width, or the fastest
       switches — the ones the slide is about — would vanish.

   The red is the 15-second reference: Miller's threshold, drawn to scale
   under the axis so the room can see how little of this hour is 15 seconds.
   =========================================================================== */

import { svg, el, line, text, awaiting } from './svg.js';

const SESSION_GAP = 30 * 60;
const DWELL_CAP = 10 * 60;

const W = 1320;
const H = 400;
const PAD = { top: 18, right: 30, bottom: 104, left: 148 };   // bottom leaves room
                                                              // for the 15 s ruler

export function render(container, data) {
  if (!data || !data.events?.length) return awaiting(container);

  const events = data.events;
  const span = events[events.length - 1].t - events[0].t;
  const t0 = events[0].t;

  /* --- dwells -------------------------------------------------------------- */

  const dwells = [];
  const totals = new Map();

  events.forEach((e, i) => {
    const next = events[i + 1];
    if (!next) return;
    const raw = next.t - e.t;
    if (raw > SESSION_GAP) return;                    // missing data, not attention
    const seconds = Math.min(raw, DWELL_CAP);
    dwells.push({ app: e.app, start: e.t - t0, seconds });
    totals.set(e.app, (totals.get(e.app) || 0) + seconds);
  });

  // Lanes in alphabetical order, not by time spent: the busy apps land wherever
  // their names put them, so the switching reads as scattered, which it was.
  const apps = [...totals.keys()].sort((a, b) => a.localeCompare(b));

  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const x0 = PAD.left;
  const x1 = W - PAD.right;
  const y0 = PAD.top;
  const y1 = H - PAD.bottom;

  const X = (t) => x0 + (t / span) * (x1 - x0);
  const laneH = (y1 - y0) / apps.length;
  const barH = Math.min(laneH * 0.52, 20);

  /* --- lanes --------------------------------------------------------------- */

  apps.forEach((app, i) => {
    const y = y0 + i * laneH + laneH / 2;
    line(root, x0, y, x1, y, 'rule');
    text(root, x0 - 16, y + 5, app, { 'text-anchor': 'end', class: 'label' });
  });

  /* --- bars ---------------------------------------------------------------- */

  const MIN_W = 1.5;    // keep a one-second switch visible

  dwells.forEach((d) => {
    const i = apps.indexOf(d.app);
    const y = y0 + i * laneH + laneH / 2;
    const w = Math.max((d.seconds / span) * (x1 - x0), MIN_W);
    el('rect', {
      x: X(d.start), y: y - barH / 2, width: w, height: barH, class: 'fill',
    }, root);
  });

  /* --- time axis ------------------------------------------------------------ */

  line(root, x0, y1 + 12, x1, y1 + 12);
  for (let m = 0; m * 60 <= span; m += 10) {
    const x = X(m * 60);
    line(root, x, y1 + 12, x, y1 + 19);
    text(root, x, y1 + 40, `${m}`, { 'text-anchor': 'middle' });
  }
  // Under the last tick label rather than beside it: a full hour puts a tick
  // at the very end of the axis.
  text(root, x1, y1 + 62, 'minutes', { class: 'axis', 'text-anchor': 'end' });

  /* --- the 15-second reference ----------------------------------------------
     Drawn at true scale. It is almost nothing, and that is the argument:
     the interval Miller says our attention will not survive is smaller than
     most of the bars above it. */

  // Sits below the tick labels, clear of the lanes, so the bars above it can
  // be compared against it without anything overlapping.
  const refW = Math.max((15 / span) * (x1 - x0), 2);
  const refX = x0;
  const refY = y1 + 58;

  const g = el('g', { class: 'agent' }, root);
  el('rect', { x: refX, y: refY - 5, width: Math.max(refW, 2), height: 10, class: 'mark-fill' }, g);
  el('line', { x1: refX, y1: refY, x2: refX + 26, y2: refY, class: 'mark' }, g);
  text(g, refX + 34, refY + 5, '15 s, to scale', { class: 'rubric' });

  // Count of dwells shorter than the threshold: the number, also red.
  const under = dwells.filter((d) => d.seconds < 15).length;
  text(root, x1, y0 - 2, `${under} of ${dwells.length} stays under 15 s`, {
    class: 'rubric', 'text-anchor': 'end',
  });

  return root;
}
