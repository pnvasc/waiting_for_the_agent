/* ===========================================================================
   Slides 4 and 16 — the score.

   A session with an agent is strictly antiphonal: I call, it answers. Each
   interval between events is one note, so the rhythm of the score is the
   rhythm of the conversation. This is the same mapping trace2score.py uses,
   ported so the deck can draw it:

     interval length  ->  note duration (the ladder below)
     duration rank    ->  pitch: fast is high, slow is low
     agent            ->  treble staff
     me               ->  bass staff
     Notification     ->  an accent on the note that follows (a permission
                          prompt: the moment it stopped and waited for me)

   Accents are the only red here. They are interruptions — a time event — and
   that is what the rubric colour is for.
   =========================================================================== */

import { svg, el, line, text, awaiting } from './svg.js';

/* upper bound in seconds -> name. Identical to LADDER in trace2score.py. */
const LADDER = [
  [3, 'sixteenth'],
  [8, 'eighth'],
  [20, 'quarter'],
  [45, 'half'],
  [120, 'whole'],
  [Infinity, 'breve'],
];

const rank = (s) => LADDER.findIndex(([limit]) => s < limit);

export function render(container, data, options = {}) {
  if (!data || !data.notes?.length) return awaiting(container);

  const { full = false } = options;
  const notes = data.notes;

  const W = 1200;
  const H = full ? 520 : 300;
  const STAFF_GAP = full ? 8 : 5.5;        // distance between staff lines
  const topY = full ? 180 : 96;            // treble staff, middle line
  const botY = full ? 330 : 226;           // bass staff, middle line

  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const left = 96;
  const right = W - 40;

  /* --- horizontal placement ---------------------------------------------
     Two things have to be true at once. A sixteen-minute wait must read as
     longer than a five-second one, so width is proportional to sqrt(seconds)
     rather than to seconds — otherwise one wait eats the system. And the
     burst of sub-second tool events must stay countable, so every note also
     gets a fixed minimum of room before the proportional part is shared out.
     Without the minimum they collapse into a blot. */
  const MIN_STEP = full ? 26 : 20;
  const weights = notes.map((n) => Math.sqrt(Math.max(n.seconds, 0.2)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const available = right - left;
  const flexible = Math.max(available - MIN_STEP * notes.length, 0);

  const xs = [];
  let cursor = left;
  weights.forEach((w) => {
    xs.push(cursor);
    cursor += MIN_STEP + (w / totalWeight) * flexible;
  });

  /* --- staves ------------------------------------------------------------ */

  for (const midY of [topY, botY]) {
    for (let i = -2; i <= 2; i += 1) {
      line(root, left - 48, midY + i * STAFF_GAP, right, midY + i * STAFF_GAP);
    }
  }

  // Voice names where a score would print them, in mono: machine-made labels.
  text(root, left - 56, topY + 4, 'agent', { 'text-anchor': 'end' });
  text(root, left - 56, botY + 4, 'human', { 'text-anchor': 'end' });

  // The brace joining the two staves into one system.
  line(root, left - 48, topY - 2 * STAFF_GAP, left - 48, botY + 2 * STAFF_GAP, 'stroke');

  /* --- notes -------------------------------------------------------------- */

  let prevVoice = null;

  notes.forEach((n, i) => {
    const x = xs[i];
    const r = rank(n.seconds);
    const isAgent = n.voice === 'agent';
    const midY = isAgent ? topY : botY;

    // A bar begins wherever the agent picks the turn back up.
    if (isAgent && prevVoice && prevVoice !== 'agent') {
      line(root, x - 6, topY - 2 * STAFF_GAP, x - 6, botY + 2 * STAFF_GAP);
    }
    prevVoice = n.voice;

    // Pitch: rank 0 (fastest) sits high on the staff, rank 5 low.
    const y = midY - (2 - r * 0.8) * STAFF_GAP;

    const g = el('g', { class: 'agent' }, root);

    const hollow = r >= 3;                              // half and longer
    el('ellipse', {
      cx: x, cy: y, rx: STAFF_GAP * 0.92, ry: STAFF_GAP * 0.68,
      transform: `rotate(-18 ${x} ${y})`,
      class: hollow ? 'stroke' : 'fill',
    }, g);

    if (r <= 4) {                                        // breve carries no stem
      const up = y > midY;
      const sx = x + (up ? STAFF_GAP * 0.86 : -STAFF_GAP * 0.86);
      const sy = y + (up ? -STAFF_GAP * 4.6 : STAFF_GAP * 4.6);
      line(root, sx, y, sx, sy, 'stroke');

      // Flags for the two shortest values: the fast exchanges.
      if (r <= 1) {
        const dir = up ? 1 : -1;
        for (let f = 0; f < 2 - r; f += 1) {
          const fy = sy + dir * f * STAFF_GAP * 1.1;
          el('path', {
            d: `M ${sx} ${fy} q ${STAFF_GAP * 1.6} ${dir * STAFF_GAP * 1.2} ${STAFF_GAP * 0.4} ${dir * STAFF_GAP * 2.6}`,
            class: 'stroke',
          }, root);
        }
      }
    }

    // The interruption mark.
    if (n.accent) {
      const ay = midY - 3.4 * STAFF_GAP;
      el('path', {
        d: `M ${x - STAFF_GAP} ${ay - STAFF_GAP * 0.55} L ${x + STAFF_GAP * 0.8} ${ay} L ${x - STAFF_GAP} ${ay + STAFF_GAP * 0.55}`,
        class: 'mark',
      }, root);
    }
  });

  /* --- caption ------------------------------------------------------------
     What the drawing is, and how long it actually took. The duration is a
     time event, so it is the one red string in the caption. */

  const total = notes.reduce((a, n) => a + n.seconds, 0);
  const minutes = Math.round(total / 60);

  text(root, left - 48, H - 22, data.title || 'Session', {});
  const dur = text(root, right, H - 22, `${notes.length} notes · ${minutes} min`, {
    class: 'rubric', 'text-anchor': 'end',
  });

  return root;
}
