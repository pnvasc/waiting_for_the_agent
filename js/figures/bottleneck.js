/* ===========================================================================
   The bottleneck slide: a queue that I make.

   Lanes come in from the left and narrow to one point, the ring: me. Tasks
   (dots) travel along the lanes and wait their turn where the lanes bend in;
   the ring calls them one at a time, whichever has waited longest, holds
   each for a moment, and lets it out along the one line to the right.

   One lane is fine: its tasks arrive more slowly than I can take them. Then
   I start another activity, and another: a new lane appears every few
   seconds, each bringing its own tasks, while the ring works no faster. The
   queues back up along the lanes towards the edge of the slide. Nothing on
   it is labelled; the sentence above says what it is.

   The same vocabulary as the git-history slide: lanes in ink, tasks as
   filled dots, me as a ring. Lanes appear on the frame (agent motion); the
   dots move at one steady speed, like conveyor belts.

   Runs only while its slide is current, and starts over each time the slide
   comes up. With reduced motion, it is drawn once, already backed up.
   =========================================================================== */

import { svg, el } from './svg.js';
import { whileShown } from './loop.js';

const W = 1300;             // the slide's width inside its padding
const H = 380;
const NECK = { x: 820, y: H / 2 };
const STRAIGHT = 600;       // where the lanes start to bend in to the ring: the gate,
                            // where each lane's queue waits to be called
const LANES = [0, -80, 80, -160, 160];   // offsets from the middle, in order of appearance
const LANE_EVERY = 4;       // seconds between new lanes (I start something new)
const ARRIVE = 3.0;         // mean seconds between tasks, per lane
const SERVE = [1.0, 1.8];   // seconds the ring holds a task, once it is there: shortest, longest
const SPEED = 240;          // units a second, along a lane
const GAP = 19;             // between two waiting tasks
const R = 5;                // task radius
const RING = 9;             // my radius

/* A seeded generator (mulberry32), so every showing is the same showing. */
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The path of a lane: straight in from the left edge, then a bend into the
   ring. The middle lane is straight all the way. */
function lanePath(dy) {
  const y = NECK.y + dy;
  const bend = (NECK.x - STRAIGHT) * 0.5;
  return `M 0 ${y} L ${STRAIGHT} ${y} C ${STRAIGHT + bend} ${y}, ${NECK.x - bend} ${NECK.y}, ${NECK.x} ${NECK.y}`;
}

/* --- the queue, as numbers ---------------------------------------------------- */

class Queue {
  constructor(lanes) {
    this.lanes = lanes;           // [{ path, length, shown, next }]
    this.reset();
  }

  reset() {
    this.t = 0;
    this.rand = generator(9);
    this.tasks = [];              // { lane, s, arrived, state: 'coming' | 'called' | 'serving' | 'leaving' }
    this.busyUntil = 0;
    this.lanes.forEach((lane, i) => {
      lane.opens = i * LANE_EVERY;
      lane.next = lane.opens + (i === 0 ? 0.3 : this.rand() * ARRIVE);
    });
  }

  /* An exponential wait, so arrivals are irregular, like tasks are. */
  wait() {
    return -Math.log(1 - this.rand() * 0.95) * ARRIVE;
  }

  step(dt) {
    this.t += dt;
    const { t } = this;

    this.lanes.forEach((lane, li) => {
      lane.shown = t >= lane.opens;
      if (!lane.shown || t < lane.next) return;
      lane.next = t + this.wait();
      // A full lane takes nothing more: the queue has reached the edge.
      const waiting = this.tasks.filter((k) => k.lane === li && k.state === 'coming').length;
      if ((waiting + 1) * GAP < STRAIGHT) {
        this.tasks.push({ lane: li, s: 0, arrived: t, state: 'coming' });
      }
    });

    // Tasks move along their lanes up to the one in front, or up to the gate.
    this.lanes.forEach((lane, li) => {
      const line = this.tasks.filter((k) => k.lane === li && k.state === 'coming');
      line.sort((a, b) => b.s - a.s);
      line.forEach((k, rank) => {
        const target = STRAIGHT - GAP * rank;
        k.s = Math.min(k.s + SPEED * dt, Math.max(target, k.s));
        k.ready = rank === 0 && k.s >= target - 0.5;
      });
    });

    // The ring calls one task at a time, whichever has waited longest, and
    // is taken up from the call until the task has left it.
    for (const k of this.tasks) {
      if (k.state === 'called') {
        const end = this.lanes[k.lane].length;
        k.s = Math.min(k.s + SPEED * dt, end);
        if (k.s >= end) {
          k.state = 'serving';
          const [lo, hi] = SERVE;
          this.busyUntil = t + lo + this.rand() * (hi - lo);
        }
      } else if (k.state === 'serving' && t >= this.busyUntil) {
        k.state = 'leaving';
      } else if (k.state === 'leaving') {
        k.out = (k.out || 0) + SPEED * dt;      // out along the one line, and gone
      }
    }
    if (!this.tasks.some((k) => k.state === 'called' || k.state === 'serving')) {
      const heads = this.tasks.filter((k) => k.state === 'coming' && k.ready);
      if (heads.length) heads.reduce((a, b) => (a.arrived <= b.arrived ? a : b)).state = 'called';
    }
    this.tasks = this.tasks.filter((k) => !(k.state === 'leaving' && NECK.x + k.out > W));
  }

  place(k) {
    if (k.state === 'leaving') return { x: NECK.x + k.out, y: NECK.y };
    return this.lanes[k.lane].path.getPointAtLength(k.s);
  }
}

/* --- drawing ------------------------------------------------------------------- */

export function render(container) {
  container.innerHTML = '';
  const root = svg(`0 0 ${W} ${H}`);
  container.appendChild(root);

  const lanes = LANES.map((dy) => {
    const path = el('path', { d: lanePath(dy), class: 'lane agent' }, root);
    return { path, length: 0 };
  });
  // The one way out.
  el('line', { x1: NECK.x, y1: NECK.y, x2: W, y2: NECK.y, class: 'lane agent' }, root);

  const dots = el('g', {}, root);
  el('circle', { cx: NECK.x, cy: NECK.y, r: RING, class: 'ring' }, root);
  const held = el('g', {}, root);   // the task in the ring, drawn over it

  const queue = new Queue(lanes);
  const circles = new Map();

  function draw() {
    lanes.forEach((lane) => { lane.path.style.visibility = lane.shown ? 'visible' : 'hidden'; });
    const alive = new Set(queue.tasks);
    for (const [k, c] of circles) {
      if (!alive.has(k)) { c.remove(); circles.delete(k); }
    }
    for (const k of queue.tasks) {
      let c = circles.get(k);
      if (!c) {
        c = el('circle', { r: R, class: 'fill' }, dots);
        circles.set(k, c);
      }
      const parent = k.state === 'serving' ? held : dots;
      if (c.parentNode !== parent) parent.appendChild(c);
      const { x, y } = queue.place(k);
      c.setAttribute('cx', x.toFixed(1));
      c.setAttribute('cy', y.toFixed(1));
    }
  }

  // Lengths can only be measured once the path is in the document.
  lanes.forEach((lane) => { lane.length = lane.path.getTotalLength(); });

  whileShown(container, {
    start: () => queue.reset(),
    frame: (t, dt) => {
      if (t === dt) {                             // reduced motion: already backed up
        for (let i = 0; i < t * 30; i += 1) queue.step(1 / 30);
      } else {
        queue.step(dt);
      }
      draw();
    },
    still: 40,
  });
}
