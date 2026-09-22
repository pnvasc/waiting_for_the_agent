/* ===========================================================================
   Wiring.

   The engine knows nothing about this file; everything here attaches to it
   from outside. That is the seam an audio or replay module uses later:

     window.deck.on('change', fn)   react to where we are
     window.deck.goto(n)            drive the deck from somewhere else
     window.deck.bind(id, fn)       feed a live number into the markup
   =========================================================================== */

import { Deck } from './engine.js';
import { bindKeys, toggleFullscreen } from './keys.js';
import { Elapsed, tick } from './clock.js';
import { createChannel } from './sync.js';
import { load } from './data.js';
import { drawFigures } from './figures/registry.js';

const stage = document.getElementById('stage');
const deck = new Deck(stage);

// hook: the single global the rest of the system talks to.
window.deck = deck;

/* --- figures ---------------------------------------------------------------
   Each region is drawn once, lazily, the first time its slide comes up. The
   table of which figure goes where lives in figures/registry.js, because the
   presenter window draws from the same table into its preview. */

async function drawFiguresFor(slideId) {
  await drawFigures(stage, slideId);
  // A figure drawn after its slide is already up has to catch up on steps.
  applySteps();
}

/* Steps declared inside a figure's SVG are toggled by the engine on render,
   but a lazily drawn figure misses that pass. Re-apply for the current slide. */
function applySteps() {
  const { stepIndex } = deck.state;
  deck.slide.querySelectorAll('[data-step]').forEach((el) => {
    el.classList.toggle('is-shown', Number(el.dataset.step) <= stepIndex);
  });
}

/* --- chrome ---------------------------------------------------------------- */

const elapsed = new Elapsed();
const clockEl = document.getElementById('clock');
const blankEl = document.getElementById('blank');
const hintEl = document.getElementById('keyhint');

tick(clockEl, elapsed);

const state = {
  clock: false,     // off by default, per the brief
  blank: false,
};

function setTheme(name) {
  document.documentElement.dataset.theme = name;
  channel.post({ type: 'theme', name });
}

// index.html?theme=night opens straight into the dark variant, for a room that
// is already dim. D still toggles it from there.
if (new URLSearchParams(location.search).get('theme') === 'night') {
  document.documentElement.dataset.theme = 'night';
}

/* --- presenter sync --------------------------------------------------------- */

let presenterWindow = null;

const channel = createChannel((msg) => {
  if (msg.type === 'hello') publish();
  if (msg.type === 'command') {
    const { name, args } = msg;
    if (name === 'next') advance(() => deck.next());
    if (name === 'prev') advance(() => deck.prev());
    if (name === 'goto') advance(() => deck.goto(args.index, args));
  }
});

function publish() {
  channel.post({
    type: 'state',
    ...deck.state,
    startedAt: elapsed.startedAt,
    theme: document.documentElement.dataset.theme,
  });
}

deck.on('change', (s) => {
  drawFiguresFor(s.id);
  // The key hint belongs to the title slide only, and only in rehearsal.
  hintEl.hidden = s.index !== 0;
  // The blank closing slide carries no chrome at all.
  clockEl.hidden = !state.clock || s.id === 's17';
  publish();
});

/* The clock starts on the first advance, not on load: opening the deck early
   to check the projector should not eat into the twenty minutes. */
function advance(fn) {
  elapsed.start();
  channel.post({ type: 'clock', startedAt: elapsed.startedAt });
  fn();
}

/* --- keys ------------------------------------------------------------------- */

bindKeys({
  next: () => advance(() => deck.next()),
  prev: () => advance(() => deck.prev()),
  first: () => deck.goto(0),
  last: () => deck.goto(deck.total - 1),
  fullscreen: toggleFullscreen,
  blank: () => {
    state.blank = !state.blank;
    blankEl.hidden = !state.blank;
  },
  night: () => {
    setTheme(document.documentElement.dataset.theme === 'night' ? 'day' : 'night');
  },
  clock: () => {
    state.clock = !state.clock;
    clockEl.hidden = !state.clock || deck.state.id === 's17';
  },
  presenter: () => {
    if (presenterWindow && !presenterWindow.closed) {
      presenterWindow.focus();
      return;
    }
    presenterWindow = open('presenter.html', 'wwt-presenter', 'width=1200,height=800');
  },
});

/* --- live values ------------------------------------------------------------
   hook: slide 2's counter. It reads a stub now — the number of seconds since
   the last UserPromptSubmit in data/checks.json's source run — and is meant to
   be replaced by a reader of the live trace:

     deck.bind('seconds-since-prompt', () => liveSecondsSinceLastPrompt());  */

load('checks').then((d) => {
  if (!d?.checks?.length) return;
  const lastGap = Math.round(d.checks[d.checks.length - 1] - d.checks[d.checks.length - 2]);
  deck.bind('seconds-since-prompt', () => lastGap);
});

/* --- catch up ---------------------------------------------------------------
   The engine emitted its first 'change' while it was being constructed, before
   any of the listeners above existed. Run that pass by hand once. This also
   covers a reload onto a deep hash such as #5.2. */

drawFiguresFor(deck.state.id);
hintEl.hidden = deck.state.index !== 0;
publish();
