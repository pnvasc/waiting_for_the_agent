/* ===========================================================================
   Presenter window.

   It holds no copy of the talk. It fetches index.html once, parses it, and
   reads the slides and their <aside class="notes"> out of that single file —
   so editing a slide or a note in index.html updates both windows and there
   is nothing to keep in sync by hand.

   Navigation is symmetrical: arrows here post a command to the deck, and the
   deck posts its state back. Either window can lead.

   The previews draw their figures from the same table the deck uses
   (figures/registry.js), so what is shown here is what the room is seeing,
   including the step a stepped slide is currently on.
   =========================================================================== */

import { bindKeys } from './keys.js';
import { createChannel } from './sync.js';
import { Elapsed, tick } from './clock.js';
import { drawFigures } from './figures/registry.js';

const elapsed = new Elapsed();
tick(document.getElementById('p-elapsed'), elapsed);

const ui = {
  index: document.getElementById('p-index'),
  total: document.getElementById('p-total'),
  step: document.getElementById('p-step'),
  id: document.getElementById('p-id'),
  notes: document.getElementById('notes'),
  error: document.getElementById('p-error'),
  current: document.querySelector('#current-preview .stage'),
  next: document.querySelector('#next-preview .stage'),
};

let slides = [];
let last = null;

/* --- load the deck's own markup -------------------------------------------- */

const ready = fetch('index.html')
  .then((r) => r.text())
  .then((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    slides = [...doc.querySelectorAll('#stage .slide')];
    ui.total.textContent = slides.length;
  })
  .catch((err) => {
    ui.error.hidden = false;
    ui.error.textContent = `could not read index.html — ${err.message}`;
  });

/* --- rendering --------------------------------------------------------------- */

function fitPreview(stageEl) {
  const box = stageEl.parentElement.getBoundingClientRect();
  stageEl.style.transform = `scale(${box.width / 1600})`;
}

function showPreview(stageEl, slide, stepIndex) {
  stageEl.innerHTML = '';
  if (!slide) {
    fitPreview(stageEl);
    return;
  }
  const clone = slide.cloneNode(true);
  clone.classList.add('is-current');
  clone.querySelectorAll('.notes').forEach((n) => n.remove());

  // Steps: the "now" preview shows what the room currently sees.
  const wrap = stageEl.parentElement;
  if (stepIndex != null && clone.dataset.steps) {
    wrap.classList.add('stepped');
    clone.querySelectorAll('[data-step]').forEach((el) => {
      el.classList.toggle('is-shown', Number(el.dataset.step) <= stepIndex);
    });
  } else {
    wrap.classList.remove('stepped');
  }

  stageEl.appendChild(clone);
  fitPreview(stageEl);

  // Draw this slide's figures into the clone, from the same table the deck
  // uses, so the preview really is what the room is looking at. Figures that
  // carry steps (slides 5 and the agent slide) only exist once drawn, so the
  // step pass has to run again afterwards.
  drawFigures(clone, clone.id).then(() => {
    if (stepIndex == null || !clone.dataset.steps) return;
    clone.querySelectorAll('[data-step]').forEach((el) => {
      el.classList.toggle('is-shown', Number(el.dataset.step) <= stepIndex);
    });
  });
}

function showNotes(slide) {
  const notes = slide?.querySelector('.notes');
  ui.notes.innerHTML = '';
  if (!notes || !notes.children.length) {
    const none = document.createElement('p');
    none.className = 'none';
    none.textContent = '— no notes —';
    ui.notes.appendChild(none);
    return;
  }
  for (const child of notes.children) ui.notes.appendChild(child.cloneNode(true));
}

async function apply(state) {
  await ready;
  if (!slides.length) return;
  last = state;

  const slide = slides[state.index];
  ui.index.textContent = state.index + 1;
  ui.id.textContent = state.id || '';
  ui.step.textContent = state.stepCount
    ? `step ${state.stepIndex} / ${state.stepCount}`
    : '';

  showPreview(ui.current, slide, state.stepIndex);
  showPreview(ui.next, slides[state.index + 1], null);
  showNotes(slide);

  if (state.startedAt) elapsed.start(state.startedAt);
  if (state.theme) document.documentElement.dataset.theme = state.theme;
}

/* --- channel ------------------------------------------------------------------ */

const channel = createChannel((msg) => {
  if (msg.type === 'state') apply(msg);
  if (msg.type === 'clock' && msg.startedAt) elapsed.start(msg.startedAt);
  if (msg.type === 'theme') document.documentElement.dataset.theme = msg.name;
});

// The presenter may have been opened first; ask who is there.
channel.post({ type: 'hello' });

/* If nothing answers — the deck window is not open yet — show the first slide
   rather than two empty boxes, so the window is still useful while setting up. */
ready.then(() => {
  setTimeout(() => {
    if (!last && slides.length) {
      apply({ index: 0, total: slides.length, stepIndex: 0, stepCount: 0, id: slides[0].id });
    }
  }, 500);
});

const send = (name, args) => channel.post({ type: 'command', name, args });

bindKeys({
  next: () => send('next'),
  prev: () => send('prev'),
  first: () => send('goto', { index: 0 }),
  last: () => send('goto', { index: slides.length - 1 }),
  // F, B, C and P belong to the deck window; night is mirrored so the
  // presenter can be dimmed independently when the room is dark.
  night: () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'night' ? 'day' : 'night';
  },
});

addEventListener('resize', () => {
  fitPreview(ui.current);
  fitPreview(ui.next);
  if (last) apply(last);
});
