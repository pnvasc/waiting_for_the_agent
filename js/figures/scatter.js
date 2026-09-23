/* ===========================================================================
   The agent slide — one thread that keeps leaving and coming back.

   The bread slide is a schedule: one column, each action followed by its
   wait. This slide keeps that vocabulary — activities in ink, the seconds
   between them in red, a dot between every two — and changes only the shape.

   It is a single thread through time, read left to right like a score and
   carried over three lines. My own thread is the main line, level and steady.
   A switch pulls it off at a slant onto a line of its own, which is never
   quite level either: each detour sits at its own height and tilts like a
   see-saw plank. A later switch slants it back, and the main line picks up
   from there. While I am away a faint dotted line carries on underneath:
   agent 1 still working without me. A detour can take detours of its own,
   further out, before finding its way back.

   The disorder is drawn, not random at runtime: every height, tilt and slant
   comes from a seeded generator (data-seed on the list in index.html), so the
   slide looks the same on every load and in the presenter. Change the seed
   for another arrangement of the same words.

   Text stays horizontal on its own plank, so it is readable at any tilt the
   generator allows (a few degrees at most).
   =========================================================================== */

import { svg, el, line, awaiting } from './svg.js';

const SEP = 13;          // either side of the dot between two words
const RULE = 9;          // a rule sits this far below the text's baseline
const INSET = 8;         // text starts this far after a connector lands
const TAIL = 12;         // the main line runs this far past its last word
const LINE_GAP = 72;     // clear space between the lines of the score

// The ranges the generator draws from.
const RISE = [42, 74];   // how far a detour sits from the line it left
const SLANT = [14, 42];  // horizontal travel of a connector, out or back
const TILT = 6;          // most a plank may tilt, in degrees, either way
const CLEAR = 32;        // a plank may never come closer than this to its parent

/* --- a small seeded generator ----------------------------------------------- */

/* mulberry32: four lines, deterministic, good enough for placing lines. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/* One <ol> -> a list of tokens. A switch that holds an <ol> carries that
   detour with it, read the same way. */
function readTokens(ol) {
  return [...ol.children].map((li) => {
    if (li.classList.contains('break')) return { kind: 'break' };
    if (li.classList.contains('t')) return { kind: 't', text: li.textContent.trim() };
    const nested = li.querySelector(':scope > ol');
    return {
      kind: 'act',
      text: ownText(li),
      dir: li.dataset.dir === 'down' ? 1 : li.dataset.dir === 'up' ? -1 : 0,
      detour: nested ? readTokens(nested) : null,
    };
  });
}

/* Rotates point (x, y) about (cx, cy) by deg degrees, as SVG's rotate() does. */
function turn(x, y, cx, cy, deg) {
  const r = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

/* --- drawing ------------------------------------------------------------------ */

export async function render(container) {
  const source = container.querySelector('ol.sequence');
  if (!source) return awaiting(container, 'no sequence in the markup');

  // Layout depends on measured text widths; a width measured in a fallback
  // font would put every junction in the wrong place.
  await document.fonts.ready;

  const rand = seeded(Number(source.dataset.seed || 1));
  const between = ([lo, hi]) => lo + rand() * (hi - lo);

  const root = svg('0 0 10 10');
  container.appendChild(root);

  // One group per line of the score; the second is moved down at the end,
  // once the first one's real depth is known.
  const lines = [el('g', {}, root)];

  /* Writes one stretch of the thread — the main line or a detour — into
     `parent`, starting at x on a level rule at ruleY. (A detour is written
     level too; its group is tilted afterwards.) Returns the x where it ends:
     for a detour, the point where it turns back. */
  function writeLine(parent, tokens, x, ruleY, dir, level) {
    let segStart = x - INSET;
    let first = true;
    const cls = level === 0 ? 'voice' : 'voice branch';

    for (const tok of tokens) {
      // The next line of the score. Only the main line may break.
      if (tok.kind === 'break') {
        line(parent, segStart, ruleY, x + TAIL, ruleY, 'thread');
        parent = el('g', {}, root);
        lines.push(parent);
        x = INSET;
        segStart = 0;
        first = true;
        continue;
      }

      if (!first) {
        x += SEP;
        el('text', { x, y: ruleY - RULE, class: `${cls} sep`, 'text-anchor': 'middle' }, parent)
          .textContent = '·';
        x += SEP;
      }
      first = false;

      const t = el('text', { x, y: ruleY - RULE, class: tok.kind === 't' ? `${cls} t` : cls }, parent);
      t.textContent = tok.text;
      x += t.getComputedTextLength();

      if (!tok.detour) continue;

      /* --- a detour: slant out, along a tilted plank, slant back -------------- */

      const d = level === 0 ? (tok.dir || -1) : dir;   // nested: further out
      const rise = between(RISE);
      const out = { x: x + SEP / 2, y: ruleY };       // leave just after the word
      const land = { x: out.x + between(SLANT), y: ruleY + d * rise };

      line(parent, segStart, ruleY, out.x, ruleY, 'thread');
      line(parent, out.x, out.y, land.x, land.y, 'thread');

      // Write the detour level first, to learn how long it is…
      const plank = el('g', {}, parent);
      const endX = writeLine(plank, tok.detour, land.x + INSET, land.y, d, level + 1);

      // …then tilt it about where it landed. The tilt is limited so the far
      // end can never swing back into the line it left.
      const length = endX - land.x;
      const room = Math.max(rise - CLEAR, 0);
      const maxToward = (Math.asin(Math.min(room / length, 1)) * 180) / Math.PI;
      let tilt = (rand() * 2 - 1) * TILT;
      const toward = tilt * -d > 0;                    // + tilt turns text downwards
      if (toward) tilt = Math.sign(tilt) * Math.min(Math.abs(tilt), maxToward);
      plank.setAttribute('transform', `rotate(${tilt.toFixed(2)} ${land.x} ${land.y})`);

      // Where the plank ends, now that it is tilted, and the slant back.
      const end = turn(endX, land.y, land.x, land.y, tilt);
      const back = { x: end.x + between(SLANT), y: ruleY };
      line(parent, end.x, end.y, back.x, back.y, 'thread');

      // The line I left, carrying on without me.
      line(parent, out.x, ruleY, back.x, ruleY, 'absent');

      x = back.x + INSET;
      segStart = back.x;
      first = true;
    }

    // Close the rule under the last stretch of words.
    const end = level === 0 ? x + TAIL : x + SEP / 2;
    line(parent, segStart, ruleY, end, ruleY, 'thread');
    return end;
  }

  writeLine(lines[0], readTokens(source), INSET, RULE, 0, 0);

  /* --- stack the lines of the score ------------------------------------------
     Each line is as deep as its detours happen to be, so the gap between them
     is measured rather than fixed. */

  // Each line's natural width is kept on the group, which makes it easy to
  // see (in the inspector) which line is too long when moving the breaks.
  for (const g of lines) g.dataset.width = Math.round(g.getBBox().width);

  let bottom = lines[0].getBBox().y + lines[0].getBBox().height;
  for (const g of lines.slice(1)) {
    const bb = g.getBBox();
    const dy = bottom + LINE_GAP - bb.y;
    g.setAttribute('transform', `translate(0 ${dy})`);
    bottom = bb.y + dy + bb.height;
  }

  /* --- fit -----------------------------------------------------------------------
     Sized to its own contents: 1:1 where it fits, smaller only if it runs wider
     than the slide. */

  const bb = root.getBBox();
  const pad = 6;
  root.setAttribute('viewBox', `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
  root.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  root.setAttribute('width', bb.width + pad * 2);
  root.setAttribute('height', bb.height + pad * 2);

  return root;
}
