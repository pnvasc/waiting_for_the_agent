/* ===========================================================================
   The agent slide — a thread that keeps branching.

   The bread slide is a schedule: one column, each action followed by its
   wait. This slide keeps that vocabulary — activities in ink, the time between
   them in red — and changes only the shape.

   My own thread runs across the page, written on a single ruled line. Every
   switch sprouts a thread of its own. It leaves the main line at a right
   angle, up or down, then turns and runs horizontally, and may turn again: a
   staircase away from where I started. A turn with nothing after it trails
   off, a thread left hanging.

   Text is always horizontal, sitting on its rule. The vertical strokes are
   only hairlines, so nothing has to be read sideways.

   The words live in index.html as a nested list (see the comment above the
   slide there); this file only draws them. Each branch is one step, revealed
   in order.
   =========================================================================== */

import { svg, el, line, awaiting } from './svg.js';

const SEP = 14;        // either side of the dot between two words
const RULE = 10;       // the rule sits this far below the text's baseline
const INSET = 10;      // a branch's text starts this far right of its riser
const TAIL = 12;       // a rule runs this far past its last word
const RISE = 80;       // default length of a turn, if data-rise is absent

/* --- reading the markup ---------------------------------------------------- */

/* The text of an <li> without the text of any list nested inside it. */
function ownText(li) {
  return [...li.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* One <ol> -> a flat list of tokens: activities, durations, turns, switches.
   A switch carries its own branch, read the same way, recursively. */
function readTokens(ol) {
  return [...ol.children].map((li) => {
    if (li.classList.contains('turn')) {
      return { kind: 'turn', rise: Number(li.dataset.rise || RISE) };
    }
    if (li.classList.contains('t')) {
      return { kind: 't', text: li.textContent.trim() };
    }
    const nested = li.querySelector(':scope > ol');
    return {
      kind: 'act',
      text: ownText(li),
      dir: li.dataset.dir === 'down' ? 1 : -1,          // SVG y grows downwards
      branch: nested ? readTokens(nested) : null,
    };
  });
}

/* --- drawing ------------------------------------------------------------------ */

/* Writes one horizontal run of words starting at x on the given baseline,
   separated by dots — "prompt agent 1 · 30 s · accept · …" — and returns where
   it ended. Every activity that sprouts a branch records the point, just after
   the word and before its dot, where its branch will leave. */
function writeRun(parent, tokens, x, baseline, cls) {
  const sprouts = [];
  tokens.forEach((tok, i) => {
    if (i > 0) {
      x += SEP;
      el('text', { x, y: baseline, class: `${cls} sep`, 'text-anchor': 'middle' }, parent)
        .textContent = '·';
      x += SEP;
    }
    const t = el('text', { x, y: baseline, class: tok.kind === 't' ? `${cls} t` : cls }, parent);
    t.textContent = tok.text;
    x += t.getComputedTextLength();
    if (tok.branch) sprouts.push({ x: x + SEP / 2, tok });
  });
  return { end: x, sprouts };
}

/* Draws a branch from a point on its parent's rule. Turns go vertical in the
   branch's direction; whatever follows a turn is written horizontally from
   the top (or bottom) of that turn, on a rule of its own. The next turn
   leaves from the right-hand end of that rule. */
function drawBranch(parent, tokens, x, ruleY, dir) {
  // A branch always leaves its parent vertically, even if the markup forgot
  // to say so.
  if (tokens[0]?.kind !== 'turn') tokens = [{ kind: 'turn', rise: RISE }, ...tokens];

  let px = x;
  let py = ruleY;

  for (let i = 0; i < tokens.length; i += 1) {
    const turn = tokens[i];
    if (turn.kind !== 'turn') continue;

    const ny = py + dir * turn.rise;
    line(parent, px, py, px, ny, 'rule');
    py = ny;

    // Everything up to the next turn is one horizontal run.
    const run = [];
    while (tokens[i + 1] && tokens[i + 1].kind !== 'turn') run.push(tokens[(i += 1)]);
    if (!run.length) continue;                        // a turn that trails off

    const { end } = writeRun(parent, run, px + INSET, py - RULE, 'voice branch');
    line(parent, px, py, end + TAIL, py, 'rule');
    px = end + TAIL;
  }
}

export async function render(container) {
  const source = container.querySelector('ol.sequence');
  if (!source) return awaiting(container, 'no sequence in the markup');

  // Layout depends on measured text widths; a width measured in a fallback
  // font would put every junction in the wrong place.
  await document.fonts.ready;

  const tokens = readTokens(source);
  const root = svg('0 0 10 10');
  container.appendChild(root);

  /* --- the main line: my own thread ----------------------------------------- */

  const { end, sprouts } = writeRun(root, tokens, 0, 0, 'voice');
  line(root, 0, RULE, end + TAIL, RULE, 'rule');

  /* --- the branches ------------------------------------------------------------
     One group per branch, revealed one keypress at a time. Class "agent": they
     arrive on the frame, with no fade. */

  sprouts.forEach(({ x, tok }, i) => {
    const g = el('g', { class: 'agent', 'data-step': i + 1 }, root);
    drawBranch(g, tok.branch, x, RULE, tok.dir);
  });

  /* --- fit -----------------------------------------------------------------------
     Sized to its own contents: 1:1 where it fits, smaller only if it runs wider
     than the slide. Hidden branches still count, so nothing shifts as they
     are revealed. */

  const bb = root.getBBox();
  const pad = 6;
  root.setAttribute('viewBox', `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
  root.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  root.setAttribute('width', bb.width + pad * 2);
  root.setAttribute('height', bb.height + pad * 2);

  return root;
}
