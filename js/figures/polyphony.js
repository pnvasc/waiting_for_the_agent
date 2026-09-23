/* ===========================================================================
   Slide 4 — the polyphony, written out.

   Four staves, two systems: me and agent A, me and agent B. The two sessions
   were not simultaneous, but they are presented as if they were: no dates or
   times are shown, only A and B. Time runs left to right on the same clock
   the sound uses (timeline.js), so a note is drawn where it is heard.

   It is a graphic score rather than engraved notation — there are too many
   notes for stems and beams to stay readable — but it keeps the conventions
   a reader of scores will recognise:

     prompt   an open notehead, with a hairline for how long the tone holds
     tool     a small filled notehead, placed on the staff by its pitch
     stop     a diamond notehead (the bell), with a long hairline: it rings
     notify   a red accent above the agent's staff: an interruption

   A red playhead crosses all four staves while it plays. It is drawn here and
   moved from main.js, which hears the audio clock.
   =========================================================================== */

import { svg, el, line, text, awaiting } from './svg.js';
import { timeline } from '../timeline.js';

const W = 1300;
const H = 330;
const LEFT = 132;          // staves start after the labels
const RIGHT = W - 16;
const GAP = 5.5;           // between staff lines

// middle line of each staff, top to bottom
const STAVES = [
  { voice: 'A', part: 'human', y: 44 },
  { voice: 'A', part: 'agent', y: 104 },
  { voice: 'B', part: 'human', y: 204 },
  { voice: 'B', part: 'agent', y: 264 },
];

export function render(container, data) {
  const tl = timeline(data);
  if (!tl.voices.length) return awaiting(container);

  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const X = (at) => LEFT + (at / tl.duration) * (RIGHT - LEFT);
  // degree 0 sits on the bottom line, 4 on the top line
  const Y = (mid, deg) => mid + (2 - deg) * GAP;

  /* --- staves, labels, and the brace for each pair ----------------------- */

  for (const s of STAVES) {
    for (let i = -2; i <= 2; i += 1) line(root, LEFT - 8, s.y + i * GAP, RIGHT, s.y + i * GAP);
    text(root, LEFT - 20, s.y + 5, s.part, { 'text-anchor': 'end' });
  }

  for (const v of tl.voices) {
    const pair = STAVES.filter((s) => s.voice === v.id);
    if (pair.length < 2) continue;
    const top = pair[0].y - 2 * GAP;
    const bottom = pair[1].y + 2 * GAP;
    line(root, LEFT - 8, top, LEFT - 8, bottom, 'stroke');
    // which pair this is, in the margin above it — a letter, and no date, so
    // the two read as happening at the same time
    text(root, LEFT - 8, top - 12, v.id, { class: 'axis' });
  }

  /* --- notes ---------------------------------------------------------------- */

  for (const v of tl.voices) {
    const human = STAVES.find((s) => s.voice === v.id && s.part === 'human');
    const agent = STAVES.find((s) => s.voice === v.id && s.part === 'agent');

    for (const e of v.events) {
      const x = X(e.at);

      if (e.kind === 'prompt') {
        const y = Y(human.y, e.degree);
        line(root, x + 5, y, X(e.at + 1.8), y, 'rule');            // the held tone
        el('ellipse', { cx: x, cy: y, rx: 5, ry: 3.6, transform: `rotate(-18 ${x} ${y})`, class: 'stroke' }, root);
      }

      if (e.kind === 'tool') {
        const y = Y(agent.y, e.degree);
        el('ellipse', { cx: x, cy: y, rx: 3.2, ry: 2.4, transform: `rotate(-18 ${x} ${y})`, class: 'fill' }, root);
      }

      if (e.kind === 'stop') {
        const y = agent.y;
        line(root, x + 6, y, Math.min(X(e.at + 5), RIGHT), y, 'rule');   // it rings on
        el('path', { d: `M ${x - 6} ${y} L ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} Z`, class: 'stroke' }, root);
      }

      if (e.kind === 'notify') {
        const y = agent.y - 3.6 * GAP;
        el('path', { d: `M ${x - 4} ${y - 3} L ${x + 3} ${y} L ${x - 4} ${y + 3}`, class: 'mark' }, root);
      }
    }
  }

  /* --- the playhead -----------------------------------------------------------
     Hidden until the sound starts. main.js moves it: it stores where the
     staves begin and end so it can be placed by a fraction of the piece. */

  el('line', {
    class: 'playhead',
    x1: LEFT, x2: LEFT, y1: STAVES[0].y - 2 * GAP - 6, y2: STAVES[3].y + 2 * GAP + 6,
    'data-x0': LEFT, 'data-x1': RIGHT, opacity: 0,
  }, root);

  return root;
}
