/* ===========================================================================
   The light of the piece: my window switching.

   Every line of focus.jsonl is a moment I switched windows. Each switch is a
   soft glow somewhere on the screen. It comes up quickly, stays while I stay
   in that app (breathing slowly), and fades when I switch again, as the next
   one comes up somewhere else. Fast tabbing flickers; a long stay is one
   slow breath. The light is not tied to the agents: the music is what I was
   waiting on, the light is what I did while I waited. Both run on the same
   clock, so the two rhythms run against each other.

   Safety comes first and is fixed here, not in the config:
     * never more than 3 pulses start in any one second (WCAG 2.3.1): in a
       burst of switches faster than that, one glow stays for the whole
       burst;
     * no glow, and no overlap of glows, ever changes the brightness of the
       page by more than 8% relative luminance. WCAG counts a change of 10%
       or more as a flash; these stay below it, so they are not flashes at
       all, at any rate. Where glows overlap, the brighter wins; they never
       add up;
     * breathing is never faster than 3 times a second;
     * nothing is red, and nothing covers the whole screen.

   Each glow is a disc of light: flat and full in the middle, with an edge
   whose softness is 'edge' in the config (0 is a hard rim). Drawn on a
   384 x 216 canvas that the browser scales up to the screen.

     const lights = new Lights(host, config.light);
     lights.set(pulses(piece.light, 43.5, config.light));
     lights.render(t);              // every frame, t = played seconds
     lights.onPulse = (p) => { … }  // hook: a pulse has just started
     lights.paper = [rgb, rgb];     // on a painted page: its darkest and
                                    // lightest tones (paper.js pageTones)
   =========================================================================== */

const MAX_PER_SECOND = 3;
const MAX_DELTA_L = 0.08;
const MAX_BREATHE_HZ = 3;

const GRID_W = 384;
const GRID_H = 216;

/* --- when: switches become pulses ---------------------------------------------- */

/* A small seeded generator (mulberry32), so a numbered seed puts the glows in
   the same places every time. */
function generator(seed) {
  let a = (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The switches of `light` ({duration, switches: [seconds]}) placed in
   `played` seconds, at most three starting in any second, and each given a
   place and a size. Returns [{at, until, weight, x, y, r}], x and y as fractions of
   the screen, r as a fraction of its height. */
export function pulses(light, played, cfg) {
  const scale = played / (light.duration || 1);
  const starts = light.switches.map((t) => t * scale);
  const rand = generator(cfg.seed);
  const [small, large] = cfg.size;

  const out = [];
  starts.forEach((at, i) => {
    const next = i + 1 < starts.length ? starts[i + 1] : played;
    // How many pulses have already started in the last second?
    const recent = out.filter((p) => p.at > at - 1).length;
    if (recent >= MAX_PER_SECOND) {
      // Too fast for a new glow: the last one stays on through this switch.
      const last = out[out.length - 1];
      last.weight += 1;
      last.until = next;
      return;
    }
    out.push({
      at,
      until: next,          // it stays until I switch again
      weight: 1,            // how many switches it stands for
      x: 0.08 + rand() * 0.84,
      y: 0.1 + rand() * 0.8,
      r: (small + rand() * (large - small)) / 2,
    });
  });
  return out;
}

/* --- how bright: kept below a flash ------------------------------------------- */

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* WCAG relative luminance of an sRGB colour. */
function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/* The most opaque the glow colour may be over this paper before the change
   in luminance would reach MAX_DELTA_L. Found by halving the interval. */
function safeAlpha(glow, paper) {
  const base = luminance(paper);
  const mixed = (a) => luminance(glow.map((c, i) => a * c + (1 - a) * paper[i]));
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k += 1) {
    const mid = (lo + hi) / 2;
    if (Math.abs(mixed(mid) - base) <= MAX_DELTA_L) lo = mid;
    else hi = mid;
  }
  return lo;
}

/* --- drawing -------------------------------------------------------------------- */

export class Lights {
  constructor(host, cfg) {
    this.cfg = cfg;
    this.list = [];
    this.onPulse = null;    // hook: called once as each pulse starts
    this._fired = 0;
    this.paper = null;      // the day page's tones, if it is not flat --paper

    this.canvas = document.createElement('canvas');
    this.canvas.width = GRID_W;
    this.canvas.height = GRID_H;
    this.canvas.className = 'lights';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.image = this.ctx.createImageData(GRID_W, GRID_H);
  }

  set(list) {
    this.list = list;
    this._fired = 0;
    this.clear();
  }

  clear() {
    this.ctx.clearRect(0, 0, GRID_W, GRID_H);
  }

  /* The colour and the most it may show, for the current theme. Read on
     every frame so D (night) takes effect at once. On a painted page the glow
     must be safe over every tone of it, so the most it may show is the least
     of what each tone allows. */
  _ink() {
    const night = document.documentElement.dataset.theme === 'night';
    const paperHex = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    const glow = rgb(night ? this.cfg.color.night : this.cfg.color.day);
    const papers = !night && this.paper ? this.paper : [rgb(paperHex || '#efe5cf')];
    const key = `${night}${paperHex}${JSON.stringify(papers)}`;
    if (this._key !== key) {
      this._key = key;
      this._alpha = Math.min(...papers.map((p) => safeAlpha(glow, p)));
    }
    return { glow, alpha: this._alpha * Math.min(Math.max(this.cfg.strength, 0), 1) };
  }

  /* How strongly a pulse shows at played second t, 0 to 1. */
  _envelope(p, t) {
    const { attack, release, hold_max: holdMax, breathe_depth: depth } = this.cfg;
    const hz = Math.min(this.cfg.breathe_hz, MAX_BREATHE_HZ);
    const end = Math.min(p.until, p.at + holdMax);            // when it starts to fade
    if (t < p.at) return 0;
    if (t < p.at + attack) return (t - p.at) / attack;
    if (t < end) {
      const breath = 1 - depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * hz * (t - p.at - attack)));
      return breath;
    }
    const fade = 1 - (t - end) / release;
    if (fade <= 0) return 0;
    // fade from wherever the breath had got to
    const from = 1 - depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * hz * (end - p.at - attack)));
    return from * fade;
  }

  render(t) {
    // Tell whoever is listening about pulses that have just started.
    while (this._fired < this.list.length && this.list[this._fired].at <= t) {
      if (this.onPulse) this.onPulse(this.list[this._fired]);
      this._fired += 1;
    }

    const live = [];
    for (const p of this.list) {
      const e = this._envelope(p, t);
      if (e > 0.002) live.push({ p, e });
    }
    if (!live.length) { this.clear(); return; }

    const { glow, alpha } = this._ink();
    const data = this.image.data;
    const level = this._level || (this._level = new Float32Array(GRID_W * GRID_H));
    level.fill(0);
    const edge = Math.min(Math.max(this.cfg.edge ?? 0.2, 0), 1);

    for (const { p, e } of live) {
      // Only the pixels this disc can reach.
      const rx = p.r * GRID_H;                     // radius in pixels (r is a fraction of the height)
      const cx = p.x * GRID_W;
      const cy = p.y * GRID_H;
      // The soft rim, as a fraction of the radius: at least a pixel and a
      // half, so even a hard edge is smooth and not jagged.
      const soft = Math.max(edge, 1.5 / rx);
      const i0 = Math.max(0, Math.floor(cx - rx));
      const i1 = Math.min(GRID_W - 1, Math.ceil(cx + rx));
      const j0 = Math.max(0, Math.floor(cy - rx));
      const j1 = Math.min(GRID_H - 1, Math.ceil(cy + rx));
      for (let j = j0; j <= j1; j += 1) {
        const dy = j + 0.5 - cy;
        for (let i = i0; i <= i1; i += 1) {
          const dx = i + 0.5 - cx;
          const d = Math.sqrt(dx * dx + dy * dy) / rx;      // 0 at the centre, 1 at the rim
          if (d >= 1) continue;
          let v = 1;
          if (d > 1 - soft) {
            const u = (1 - d) / soft;                        // 0 at the rim, 1 where the rim begins
            v = u * u * (3 - 2 * u);
          }
          // The brightest glow at this point wins; glows never add up.
          const k = j * GRID_W + i;
          if (e * v > level[k]) level[k] = e * v;
        }
      }
    }

    for (let k = 0; k < level.length; k += 1) {
      data[k * 4] = glow[0];
      data[k * 4 + 1] = glow[1];
      data[k * 4 + 2] = glow[2];
      data[k * 4 + 3] = Math.round(level[k] * alpha * 255);
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

/* For checking: the most pulses that start in any one second. Always <= 3. */
export function busiestSecond(list) {
  let most = 0;
  for (const p of list) {
    most = Math.max(most, list.filter((q) => q.at >= p.at && q.at < p.at + 1).length);
  }
  return most;
}
