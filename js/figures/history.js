/* ===========================================================================
   The agent slide, drawn as a git history.

   The bread slide is a schedule: one column, each action followed by its
   wait. This slide keeps that vocabulary (activities in ink, the seconds
   between them in red) and draws it the way a git network graph draws a
   repository: lanes running left to right, branching off and merging back.

     a lane       something I work in: an agent, email, Teams, the report.
     an agent     is a branch that keeps running while I am elsewhere, so its
                  lane is drawn unbroken from its first commit to its last,
                  and on past the end of the slide if it is still going
                  (data-open). Email, Teams and the report only exist while I
                  am in them: their lanes are drawn only under my visits.
     a commit     each activity, as a dot on the lane it happened in.
     a switch     is a commit too (a ring, not a dot): the point where I leave
                  a lane. It always sits between two tasks, and the curve from
                  it to the next task, on another lane, is me changing
                  windows: a fork or a merge.
     the seconds  sit on the stretch between two commits, in red.

   The words sit above the graph, slanted like the column heads of a ledger,
   each with a dotted leader down to its commit, so the whole sequence can
   still be read left to right as one sentence along the top.

   Commits are evenly spaced, as in git: the order is what is drawn, and the
   seconds say how long each step took.

   Everything is read from the <ol class="history"> in index.html:
     data-lanes     lane names, top to bottom
     data-parallel  lanes that run on their own (the agents)
     data-open      lanes still running when the slide ends
     <li data-lane="…">          an activity on that lane
     <li data-lane="…" class="switch">  leaving that lane
     <li class="t">              the seconds to the next commit
   =========================================================================== */

import { svg, el, line, text, awaiting } from './svg.js';

const W = 1488;          // the slide's width inside its padding
const ANGLE = 45;        // slant of the words above the graph, in degrees
const LANE_GAP = 70;     // between two lanes
const LEAD_GAP = 26;     // between the words' baseline and the first lane
const R = 6;             // commit radius
const OPEN_TAIL = 70;    // a running lane carries on this far, dotted

/* --- reading the markup ----------------------------------------------------- */

const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

function read(source) {
  const commits = [];
  for (const li of source.children) {
    const words = li.textContent.trim();
    if (li.classList.contains('t')) {
      // seconds belong to the stretch after the commit before them
      if (commits.length) commits[commits.length - 1].after = words;
      continue;
    }
    commits.push({ words, lane: li.dataset.lane, isSwitch: li.classList.contains('switch') });
  }
  return commits;
}

/* --- drawing ------------------------------------------------------------------ */

export async function render(container) {
  const source = container.querySelector('ol.history');
  if (!source) return awaiting(container, 'no history in the markup');

  // The words are measured, so the fonts have to be in.
  await document.fonts.ready;

  const lanes = list(source.dataset.lanes);
  const parallel = new Set(list(source.dataset.parallel));
  const open = new Set(list(source.dataset.open));
  const commits = read(source);

  // A switch goes from one task to another. Two in a row, or one at either
  // end, would be a switch with nothing on one side: say so in the console.
  commits.forEach((c, i) => {
    if (!c.isSwitch) return;
    const before = commits[i - 1], after = commits[i + 1];
    if (!before || !after || before.isSwitch || after.isSwitch) {
      console.warn(`history: switch ${i + 1} is not between two tasks`);
    }
  });

  container.querySelector('svg')?.remove();
  const root = svg(`0 0 ${W} 100`);
  container.appendChild(root);

  /* --- the words, measured first ------------------------------------------------
     How tall the slanted words stand sets where the graph begins, and how far
     the last one leans sets how much room is left on the right. */

  const rad = (ANGLE * Math.PI) / 180;
  const words = commits.map((c) => text(root, 0, 0, c.words, { class: 'voice branch' }));
  const longest = Math.max(...words.map((t) => t.getComputedTextLength()));
  const lean = longest * Math.cos(rad);
  const stand = longest * Math.sin(rad);

  const x0 = 20;
  const x1 = W - Math.max(lean, OPEN_TAIL) - 10;
  const step = (x1 - x0) / (commits.length - 1);
  const X = (i) => x0 + i * step;

  const baseline = stand + 10;
  const top = baseline + LEAD_GAP;
  const Y = (lane) => top + lanes.indexOf(lane) * LANE_GAP;

  // Layers, back to front: leaders, lanes, my path, commits, seconds.
  const leaders = el('g', {}, root);
  const lanesG = el('g', {}, root);
  const path = el('g', {}, root);
  const dots = el('g', {}, root);
  const seconds = el('g', {}, root);

  /* --- the words along the top ---------------------------------------------------- */

  commits.forEach((c, i) => {
    const x = X(i);
    words[i].setAttribute('x', x);
    words[i].setAttribute('y', baseline);
    words[i].setAttribute('transform', `rotate(${-ANGLE} ${x} ${baseline})`);
    line(leaders, x, baseline + 8, x, Y(c.lane) - R - 4, 'absent');
  });

  /* --- lanes ---------------------------------------------------------------------
     An agent's lane runs unbroken between its first and last commits: it is
     working whether I am there or not. Any other lane is drawn only between
     two commits I made on it one after the other. */

  for (const lane of lanes) {
    const idx = commits.flatMap((c, i) => (c.lane === lane ? [i] : []));
    if (!idx.length) continue;
    const y = Y(lane);
    if (parallel.has(lane)) {
      // Still running at the end: carry it to the last commit of the whole
      // history, then on past it, dotted.
      const first = X(idx[0]);
      const last = open.has(lane) ? X(commits.length - 1) : X(idx[idx.length - 1]);
      line(lanesG, first, y, last, y, 'lane agent');
      if (open.has(lane)) line(lanesG, last, y, last + OPEN_TAIL, y, 'absent');
    } else {
      idx.forEach((i) => {
        if (commits[i + 1]?.lane === lane) line(lanesG, X(i), y, X(i + 1), y, 'lane');
      });
    }
  }

  /* --- my path from lane to lane: a curve wherever I switch -------------------- */

  commits.forEach((c, i) => {
    const next = commits[i + 1];
    if (!next || next.lane === c.lane) return;
    const ax = X(i), ay = Y(c.lane), bx = X(i + 1), by = Y(next.lane);
    const k = step * 0.55;
    el('path', { d: `M ${ax} ${ay} C ${ax + k} ${ay} ${bx - k} ${by} ${bx} ${by}`, class: 'lane path' }, path);
  });

  /* --- commits ----------------------------------------------------------------- */

  commits.forEach((c, i) => {
    el('circle', { cx: X(i), cy: Y(c.lane), r: R, class: c.isSwitch ? 'ring' : 'fill' }, dots);
  });

  /* --- seconds, on the stretch between two commits --------------------------------
     Set on a small patch of paper so they stay legible where a curve or a lane
     runs through them. */

  commits.forEach((c, i) => {
    const next = commits[i + 1];
    if (!next || !c.after) return;
    const x = (X(i) + X(i + 1)) / 2;
    const same = next.lane === c.lane;
    const y = same ? Y(c.lane) - 11 : (Y(c.lane) + Y(next.lane)) / 2 + 6;
    text(seconds, x, y, c.after, { class: 'voice t halo', 'text-anchor': 'middle' });
  });

  /* --- fit ------------------------------------------------------------------------ */

  const height = top + (lanes.length - 1) * LANE_GAP + 20;
  root.setAttribute('viewBox', `0 0 ${W} ${height}`);
  return root;
}
