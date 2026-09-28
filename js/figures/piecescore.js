/* ===========================================================================
   The last piece, written out: a score that scrolls past a playhead.

   Four staves: me on top, then the three agents from high to low (agent 3,
   the treble, down to agent 1, the bass), as a score is laid out. A staff
   begins where its voice comes in, so while the piece plays each agent's
   staff arrives at the playhead as the agent does.

   The notation is slide 4's, so the room can already read it:

     prompt        an open notehead, with a hairline while the tone holds
     tool call     a filled notehead on the staff by its pitch, with a
                   hairline for as long as the bowed note is held
     Bash          an x notehead on the middle line: a tick, not a pitch
     stop          a diamond on the middle line, with a hairline: it rings
     notification  the same bell, with a red accent above the staff

   The light is not written on the score; it glows on the page around it
   (lights.js). The legend has an entry for it all the same.

   Two ways to show it:
     scroll   the deck: about a dozen seconds at a time, moving under a
              fixed red playhead, from seek(t) on every frame;
     fit      the presenter's preview (and reduced motion): the whole piece
              across the width at once.

     const score = draw(container, plan, config, { fit });
     score.seek(t);          // played seconds; moves the music (or the playhead)
     score.playing(on);      // shows or hides the playhead
   =========================================================================== */

import { svg, el, line, text } from './svg.js';
import { loadPiece, program } from '../piece.js';

const W = 1488;              // the slide's width inside its padding
const H = 700;
const LEFT = 118;            // staves start after the names
const RIGHT = W - 4;
const GAP = 8;               // between staff lines
const PPS = 100;             // units a second, scrolling
const PLAY_AT = 0.3;         // the playhead, as a fraction of the staves' width
const RING_DRAWN = 4;        // seconds of hairline after a bell

// Where each staff's middle line sits: me, then agent 3, 2, 1 (voice 2, 1, 0).
const ROWS = [
  { name: 'me', y: 70, voice: 'me' },
  { name: 'agent 3', y: 205, voice: 2 },
  { name: 'agent 2', y: 340, voice: 1 },
  { name: 'agent 1', y: 475, voice: 0 },
];
const KEY_Y = 600;           // the legend

/* The degree of the scale a MIDI note is on, counted from `root`:
   0 is the bottom line of the staff, 4 the top line. */
function degreeOf(midi, root, scale) {
  const off = midi - root;
  const octave = Math.floor(off / 12);
  const i = scale.indexOf(((off % 12) + 12) % 12);
  return octave * scale.length + Math.max(i, 0);
}

export function draw(container, plan, cfg, { fit = false } = {}) {
  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const pc = cfg.pitch;
  const total = plan.total ?? plan.played;     // with the exposition, when it is on
  const shift = total - plan.played;             // how much later the piece itself begins
  const pps = fit ? (RIGHT - LEFT) / total : PPS;
  const playX = LEFT + (RIGHT - LEFT) * PLAY_AT;
  const Y = (mid, deg) => mid + (2 - deg) * GAP;
  const rowOf = (voice) => ROWS.find((r) => r.voice === voice);

  // The music lives in one group, clipped to the staves, and slides left.
  const clip = el('clipPath', { id: `clip-${Math.random().toString(36).slice(2)}` }, el('defs', {}, root));
  el('rect', { x: LEFT - 12, y: 0, width: RIGHT - LEFT + 16, height: KEY_Y - 40 }, clip);
  const view = el('g', { 'clip-path': `url(#${clip.id})` }, root);
  const music = el('g', {}, view);
  const X = (t) => t * pps;

  /* --- staves, each from where its voice comes in ------------------------- */

  const entries = cfg.time.entries || [];
  const voices = new Set(plan.events.map((e) => e.voice).filter((v) => v !== undefined));
  const firstAt = {};                            // a voice's first sound (in the exposition, if on)
  for (const e of plan.events) if (e.voice !== undefined && e.kind !== 'prompt') firstAt[e.voice] ??= e.at;
  // The staff lines themselves do not scroll: they are redrawn across the
  // visible width on every frame, from wherever their voice begins. (Long
  // lines moved by a transform are not always repainted by the browser, and
  // a staff looks the same wherever it is anyway.)
  const staffLayer = el('g', {});
  root.insertBefore(staffLayer, view);
  const staves = [];
  const names = [];
  for (const row of ROWS) {
    if (row.voice !== 'me' && !voices.has(row.voice)) continue;
    const from = row.voice === 'me' ? 0
      : Math.min((entries[row.voice] ?? 0) + shift, firstAt[row.voice] ?? Infinity);
    for (let i = -2; i <= 2; i += 1) staves.push({ from, el: line(staffLayer, 0, row.y + i * GAP, 0, row.y + i * GAP) });
    line(music, X(from), row.y - 2 * GAP, X(from), row.y + 2 * GAP, 'stroke');   // where it begins
    const name = text(root, LEFT - 20, row.y + 5, row.name, { 'text-anchor': 'end' });
    names.push({ name, from });
  }

  /* --- notes ------------------------------------------------------------------ */

  const cross = (cx, cy) => {
    line(music, cx - 3.5, cy - 3.5, cx + 3.5, cy + 3.5, 'stroke');
    line(music, cx - 3.5, cy + 3.5, cx + 3.5, cy - 3.5, 'stroke');
  };
  const diamond = (parent, cx, cy) =>
    el('path', { d: `M ${cx - 7} ${cy} L ${cx} ${cy - 7} L ${cx + 7} ${cy} L ${cx} ${cy + 7} Z`, class: 'stroke' }, parent);
  const accent = (parent, cx, cy) =>
    el('path', { d: `M ${cx - 5} ${cy - 3.5} L ${cx + 4} ${cy} L ${cx - 5} ${cy + 3.5}`, class: 'mark' }, parent);
  const hold = (x, y, seconds) => {
    const end = Math.min(x + seconds * pps, X(total) + 40);   // never past the staff's end
    if (end - x > 8) line(music, x + 6, y, end, y, 'rule');
  };

  for (const e of plan.events) {
    const x = X(e.at);
    if (e.kind === 'prompt') {
      const row = rowOf('me');
      const y = Y(row.y, degreeOf(e.midi, pc.prompt_root, pc.scale));
      hold(x, y, cfg.sound.prompts.length);
      el('ellipse', { cx: x, cy: y, rx: 6, ry: 4.4, transform: `rotate(-18 ${x} ${y})`, class: 'stroke' }, music);
      continue;
    }
    const row = rowOf(e.voice);
    if (!row) continue;
    const vroot = pc.voice_roots[e.voice % pc.voice_roots.length];
    if (e.kind === 'note') {
      const y = Y(row.y, degreeOf(e.midi, vroot, pc.scale));
      hold(x, y, e.dur);
      el('ellipse', { cx: x, cy: y, rx: 4, ry: 3, transform: `rotate(-18 ${x} ${y})`, class: 'fill' }, music);
    } else if (e.kind === 'tick') {
      cross(x, row.y);
    } else if (e.kind === 'bell') {
      hold(x, row.y, RING_DRAWN);
      diamond(music, x, row.y);
      if (e.summons === 'Notification') accent(music, x, row.y - 3.8 * GAP);
    }
  }

  /* --- the legend ---------------------------------------------------------------
     Slide 4's, with the light added. */

  const MONO = 9;
  let kx = LEFT;
  const entry = (drawSymbol, label, wide = 18) => {
    drawSymbol(kx + 8, KEY_Y - 5);
    text(root, kx + 8 + wide, KEY_Y, label);
    kx += 8 + wide + label.length * MONO + 44;
  };
  entry((cx, cy) => {
    line(root, cx + 5, cy, cx + 20, cy, 'rule');
    el('ellipse', { cx, cy, rx: 5, ry: 3.6, transform: `rotate(-18 ${cx} ${cy})`, class: 'stroke' }, root);
  }, 'prompt', 32);
  entry((cx, cy) => {
    el('ellipse', { cx, cy, rx: 3.2, ry: 2.4, transform: `rotate(-18 ${cx} ${cy})`, class: 'fill' }, root);
  }, 'tool call');
  entry((cx, cy) => {
    line(root, cx - 3, cy - 3, cx + 3, cy + 3, 'stroke');
    line(root, cx - 3, cy + 3, cx + 3, cy - 3, 'stroke');
  }, 'Bash');
  entry((cx, cy) => diamond(root, cx, cy), 'stop');
  entry((cx, cy) => accent(root, cx, cy), 'notification');
  const glowId = `glow-${Math.random().toString(36).slice(2)}`;
  const grad = el('radialGradient', { id: glowId }, el('defs', {}, root));
  el('stop', { offset: '0.55', 'stop-color': cfg.light.color.day, 'stop-opacity': 0.9 }, grad);
  el('stop', { offset: '1', 'stop-color': cfg.light.color.day, 'stop-opacity': 0 }, grad);
  entry((cx, cy) => el('circle', { cx, cy, r: 9, fill: `url(#${glowId})` }, root), 'window switch', 20);

  /* --- the playhead ------------------------------------------------------------- */

  const head = line(root, playX, ROWS[0].y - 4 * GAP, playX, ROWS[ROWS.length - 1].y + 4 * GAP, 'playhead');
  head.style.visibility = 'hidden';

  /* --- moving it ------------------------------------------------------------------ */

  // Lay the staff lines across the staves, with the music `offset` units right.
  function staffAt(offset) {
    for (const s of staves) {
      const x1 = Math.max(LEFT - 8, offset + X(s.from));
      const x2 = Math.min(RIGHT, offset + X(total) + 40);
      s.el.style.visibility = x2 > x1 ? 'visible' : 'hidden';
      s.el.setAttribute('x1', x1.toFixed(1));
      s.el.setAttribute('x2', x2.toFixed(1));
    }
  }

  function seek(t) {
    if (fit) {
      const x = LEFT + X(Math.min(Math.max(t, 0), total));
      head.setAttribute('x1', x);
      head.setAttribute('x2', x);
      music.setAttribute('transform', `translate(${LEFT} 0)`);
      return;
    }
    music.setAttribute('transform', `translate(${(playX - X(t)).toFixed(1)} 0)`);
    staffAt(playX - X(t));
    // A voice's name shows once its staff has reached the playhead.
    for (const n of names) n.name.style.visibility = t >= n.from ? 'visible' : 'hidden';
  }

  const score = {
    seek,
    playing(on) { head.style.visibility = on ? 'visible' : 'hidden'; },
    fit,
  };
  if (fit) {
    head.setAttribute('x1', LEFT);
    head.setAttribute('x2', LEFT);
    music.setAttribute('transform', `translate(${LEFT} 0)`);
    staffAt(LEFT);
  } else {
    seek(0);
  }
  container.score = score;
  return score;
}

/* For the figure registry: the piece as it will be played, before it is. In
   the deck, the opening seconds at the playhead; in the presenter's preview
   (and with reduced motion), the whole piece. */
export async function render(container) {
  const cfg = await fetch('piece.config.json', { cache: 'no-store' }).then((r) => r.json());
  const piece = await loadPiece(cfg);
  // The piece may already have started and written its own score here.
  if (container.score) return container.score;
  const fit = Boolean(container.closest('.preview'))
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
  return draw(container, program(piece, cfg), cfg, { fit });
}
