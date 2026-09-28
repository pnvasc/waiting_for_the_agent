/* ===========================================================================
   The last piece, in the deck.

   The slide holds the score (figures/piecescore.js, drawn when the slide
   first comes up). This file plays it: the sound and the light from
   piece.js, with the score scrolling on the same clock.

     S   stop, or play again from the start
     M   mute the sound; the score and the light go on

   It starts by itself as the slide arrives; leaving the slide fades it out. The light glows on the slide's own page, and is kept
   safe against that page's darkest and lightest tones (paper.js).

   hook: window.piece is the player once it exists, so anything can listen:
     window.piece.on('summons', ({ voice, kind }) => …)
     window.piece.on('prompt', ({ voice }) => …)
     window.piece.on('pulse', (p) => …)
     window.piece.on('end', () => …)
   =========================================================================== */

import { Piece, loadPiece } from './piece.js';
import { pageTones } from './paper.js';
import { draw } from './figures/piecescore.js';

const SILENT = { prompts: false, bowed: false, ticks: false, bells: false };

export class Finale {
  constructor(slide, index) {
    this.slide = slide;
    this.index = index;
    this.player = null;
    this.muted = false;
    this.ready = fetch('piece.config.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((cfg) => {
        this.cfg = cfg;
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // With reduced motion there is no light; the sound and score stay.
        this.player = new Piece(cfg, { lights: still ? null : slide });
        if (this.player.lights) {
          const { dark, light } = pageTones(slide, index);
          this.player.lights.paper = [dark, light];
        }
        this.player.on('end', () => this._score()?.playing(false));
        return this.player;
      });
  }

  _score() {
    return this.slide.querySelector('#region-piece')?.score;
  }

  get playing() { return Boolean(this.player?.playing); }

  /* Browsers only start audio after a key or a click: called from one. */
  unlock() {
    this.player?.unlock();
  }

  toggle() {
    if (this.playing) this.stop();
    else this.start();
  }

  /* Play from the start, unless it is already playing or about to. */
  async start() {
    if (this.playing || this._starting) return;
    this._starting = true;
    try {
      await this._start();
    } finally {
      this._starting = false;
    }
  }

  async _start() {
    const player = await this.ready;
    await player.unlock();
    const piece = await loadPiece(this.cfg);
    const plan = player.play(piece);
    player.setHeard(this.muted ? SILENT : {});

    // The slide's score, unless it is not drawn yet (the piece can start
    // before the figure has loaded), or the piece was drawn at random and is
    // not the one on the slide: then write it out from this plan.
    let score = this._score();
    if (!score || this.cfg.choose.at_play === 'random') {
      const fit = score?.fit ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
      score = draw(this.slide.querySelector('#region-piece'), plan, this.cfg, { fit });
    }
    score?.playing(true);
    player.onProgress = (t) => { if (t !== null) score?.seek(t); };
  }

  mute() {
    this.muted = !this.muted;
    this.player?.setHeard(this.muted ? SILENT : {});
  }

  stop() {
    if (!this.player) return;
    this.player.stop(0.6);
    this._score()?.playing(false);
  }
}
