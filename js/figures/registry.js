/* ===========================================================================
   Which figure belongs to which reserved region.

   One table, imported by both windows: the deck draws from it, and the
   presenter draws from it into its "now" preview so the preview really is
   what the room is looking at.

   Every entry is (region id, slide id, data file or null, render function),
   and every render function has the same shape — render(container, data) —
   so nothing here needs to know what any figure actually draws.
   =========================================================================== */

import { load } from '../data.js';

import * as box from './box.js';
import * as score from './score.js';
import * as cumulative from './cumulative.js';
import * as focus from './focus.js';
import * as scatter from './scatter.js';
import * as polyphony from './polyphony.js';

export const FIGURES = [
  { region: 'region-scatter', slide: 's3c', data: null, render: scatter.render },
  { region: 'region-score-scene', slide: 's4', data: 'polyphony', render: polyphony.render },
  { region: 'region-box', slide: 's5', data: null, render: box.render },
  {
    region: 'region-box-mini', slide: 's6', data: null,
    render: (c, d) => box.render(c, d, { mini: true, only: 'agent' }),
  },
  { region: 'region-cumulative-record', slide: 's7', data: 'checks', render: cumulative.render },
  { region: 'region-focus-timeline', slide: 's13', data: 'focus', render: focus.render },
  {
    region: 'region-score-talk', slide: 's16', data: 'score',
    render: (c, d) => score.render(c, d, { full: true }),
  },
];

/* Draws every figure belonging to `slideId` inside `root`, which is the live
   stage in the deck window and a cloned preview in the presenter. Regions are
   found by id within `root`, so several copies can coexist on one page. */
export async function drawFigures(root, slideId) {
  for (const fig of FIGURES) {
    if (fig.slide !== slideId) continue;
    const container = root.querySelector(`#${fig.region}`);
    // A region may hold its own source markup (the agent slide keeps its
    // sequence as a list in index.html), so "has children" no longer means
    // "already drawn". Mark it explicitly, before any await, so two quick
    // slide changes cannot draw it twice.
    if (!container || container.dataset.drawn) continue;
    container.dataset.drawn = '1';
    const data = fig.data ? await load(fig.data) : null;
    await fig.render(container, data);            // some renders wait for fonts
  }
}
