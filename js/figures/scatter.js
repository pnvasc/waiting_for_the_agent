/* ===========================================================================
   The agent slide — a sequence that branches.

   The bread slide is a schedule: one column, top to bottom, every action
   followed by its wait. This slide uses the same vocabulary and the same type,
   and changes only the shape. My own thread runs across the page. Every time I
   switch away, the thing I switch to sprouts its own line at a right angle —
   "as if the activities I engage in while waiting sprout their own timelines
   which stretch out in orthogonal directions."

   The words live in index.html, not here, as a nested list:

     <ol class="sequence">
       <li>prompt agent 1</li>
       <li class="wait">wait</li>                  red: a rubric
       <li class="switch">switch                   red: an interruption
         <ol><li>prompt agent 2</li> …</ol>        the branch it sprouts
       </li>
     </ol>

   so the sequence can be edited without touching code. Each branch is one
   step, revealed in order. If you add or remove a branch, update data-steps
   on the <section> to match.
   =========================================================================== */

import { svg, el, awaiting } from './svg.js';

const SEP = 26;           // space either side of the separating dot
const DROP = 40;          // hairline from the main line down to a branch
const BRANCH_GAP = 14;    // between the hairline's end and the branch text

/* The text of an <li> without the text of any list nested inside it. */
function ownText(li) {
  return [...li.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readSequence(source) {
  return [...source.children].map((li) => {
    const nested = li.querySelector(':scope > ol');
    return {
      text: ownText(li),
      kind: li.classList.contains('wait') ? 'wait'
        : li.classList.contains('switch') ? 'switch'
          : 'do',
      branch: nested ? [...nested.children].map((c) => c.textContent.trim()) : null,
    };
  });
}

export async function render(container) {
  const source = container.querySelector('ol.sequence');
  if (!source) return awaiting(container, 'no sequence in the markup');

  // Layout depends on measured text widths, and a width measured in a
  // fallback font would put every junction in the wrong place.
  await document.fonts.ready;

  const items = readSequence(source);

  const root = svg('0 0 10 10');
  container.appendChild(root);

  /* --- the main line --------------------------------------------------------
     Laid out word by word so that each "switch" knows its own centre: that is
     where its branch hangs. */

  const y = 0;
  let x = 0;

  items.forEach((item, i) => {
    if (i > 0) {
      el('text', { x: x + SEP, y, class: 'voice sep', 'text-anchor': 'middle' }, root)
        .textContent = '·';
      x += SEP * 2;
    }
    const red = item.kind !== 'do';
    const t = el('text', { x, y, class: red ? 'voice rubric' : 'voice' }, root);
    t.textContent = item.text;
    const w = t.getComputedTextLength();
    item.cx = x + w / 2;
    x += w;
  });

  /* --- the branches ----------------------------------------------------------
     One group per branch, revealed one keypress at a time. Class "agent": they
     arrive on the frame, with no fade. The text is rotated a quarter turn so
     it reads top to bottom, like the title on a book's spine. */

  let step = 0;

  for (const item of items) {
    if (!item.branch) continue;
    step += 1;

    const g = el('g', { class: 'agent', 'data-step': step }, root);

    el('line', {
      x1: item.cx, y1: y + 14, x2: item.cx, y2: y + 14 + DROP, class: 'rule',
    }, g);

    const top = y + 14 + DROP + BRANCH_GAP;
    const t = el('text', {
      class: 'voice branch',
      'dominant-baseline': 'central',
      transform: `translate(${item.cx} ${top}) rotate(90)`,
    }, g);

    item.branch.forEach((word, i) => {
      if (i > 0) el('tspan', { class: 'sep' }, t).textContent = '  ·  ';
      el('tspan', {}, t).textContent = word;
    });
  }

  /* --- fit ------------------------------------------------------------------
     The drawing is sized to its own contents, at 1:1 where it fits and
     smaller only if the main line runs wider than the slide. Hidden branches
     still count, so nothing shifts as they are revealed. */

  const bb = root.getBBox();
  const pad = 6;
  root.setAttribute('viewBox', `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
  root.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  root.setAttribute('width', bb.width + pad * 2);
  root.setAttribute('height', bb.height + pad * 2);

  return root;
}
