/* ===========================================================================
   The pages.

   Every slide is a page of an old book, and no two pages are the same. Each
   one is painted here, once, from a seed taken from the slide's id, so a
   slide always gets the same page, in rehearsal and on the night, and in
   the presenter's preview too. Nothing is loaded: the deck stays offline.

   What makes a page read as old, and nothing else:
     tone     the cream of --paper, a shade lighter or darker, warmer or
              cooler, from page to page;
     edges    old paper yellows from the outside in: the three outer edges
              are toned darker and warmer than the middle, unevenly;
     gutter   the inner edge falls into the shadow of the binding. Slides
              alternate, as pages do: the first is a right-hand page (gutter
              on the left), the next a left-hand one (gutter on the right);
     mottle   a slow unevenness across the sheet, too broad to read as grain;
     foxing   a few rust-brown freckles, kept to the margins, away from the
              text and the figures.

   Every effect has one number in PAPER below; 0 turns it off. The night
   variant keeps its flat dark paper (css/deck.css).

     paintPages(slides)           // the deck: every slide, the current one first
     pageFor(slide, index)        // a promise of the page's image URL
   =========================================================================== */

export const PAPER = {
  tone: 1,          // how much the cream varies from page to page
  edges: 1,         // toning at the edges
  gutter: 1,        // the binding's shadow
  mottle: 1,        // broad unevenness
  foxing: 1,        // how many freckles (1 is a few; 0 none)
};

// The painting is done at half the stage's size and scaled up: everything on
// a page is soft, and the scaling is what keeps it soft.
const PW = 800;
const PH = 450;

const TONED = [196, 160, 104];    // the colour old paper yellows towards
const SHADOW = [104, 94, 80];     // the binding's shadow: a warm grey
const RUST = [150, 92, 44];       // foxing

/* --- randomness, seeded ------------------------------------------------------- */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* mulberry32: a small generator that gives the same numbers for the same seed. */
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

/* Smooth noise: random values on a coarse grid, blended smoothly between.
   `cells` is how many grid cells span the page's width. Returns a function
   of (x, y) in 0..1, giving -1..1. */
function smoothNoise(rand, cells) {
  const gw = cells + 2;
  const gh = Math.ceil(cells * (PH / PW)) + 2;
  const grid = Array.from({ length: gw * gh }, () => rand() * 2 - 1);
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x * cells;
    const gy = y * cells * (PH / PW);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const u = ease(gx - i);
    const v = ease(gy - j);
    const at = (a, b) => grid[Math.min(b, gh - 1) * gw + Math.min(a, gw - 1)];
    const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
    const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
    return top * (1 - v) + bottom * v;
  };
}

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a, b, t) => a + (b - a) * t;

/* --- one page -------------------------------------------------------------------- */

function paint(canvas, id, index, paperHex) {
  const rand = generator(hash(id));
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(PW, PH);
  const data = image.data;

  // This page's cream: the deck's paper, nudged.
  const base = rgb(paperHex);
  const lift = (rand() * 2 - 1) * 5 * PAPER.tone;       // lighter or darker
  const warm = (rand() * 2 - 1) * 3 * PAPER.tone;       // warmer or cooler
  const cream = [base[0] + lift + warm, base[1] + lift, base[2] + lift - warm * 1.5];

  // How this page has aged: each a little different.
  const edgeWidth = 0.1 + rand() * 0.06;                // how far in the toning reaches
  const edgeDepth = (0.18 + rand() * 0.1) * PAPER.edges;
  const gutterLeft = index % 2 === 0;                   // a right-hand page
  const gutterDepth = (0.3 + rand() * 0.06) * PAPER.gutter;
  const ragged = smoothNoise(rand, 7);                  // unevenness of the toned edge
  const broad = smoothNoise(rand, 3);                   // the mottle
  const fine = smoothNoise(rand, 11);

  // Foxing: freckles in small clusters, in the margins only.
  const spots = [];
  const clusters = Math.round((1 + rand() * 3) * PAPER.foxing);
  for (let c = 0; c < clusters; c += 1) {
    // A place in the outer band: near one of the four edges.
    const side = Math.floor(rand() * 4);
    const along = 0.05 + rand() * 0.9;
    const into = 0.015 + rand() * 0.07;
    const cx = side === 0 ? into : side === 1 ? 1 - into : along;
    const cy = side === 2 ? into * (PW / PH) : side === 3 ? 1 - into * (PW / PH) : along;
    const n = 1 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k += 1) {
      spots.push({
        x: cx + (rand() - 0.5) * 0.04,
        y: cy + (rand() - 0.5) * 0.06,
        r: 0.0015 + rand() ** 2 * 0.006,                // as a fraction of the width
        a: 0.12 + rand() * 0.28,
      });
    }
  }

  const aspect = PW / PH;
  for (let j = 0; j < PH; j += 1) {
    const y = (j + 0.5) / PH;
    for (let i = 0; i < PW; i += 1) {
      const x = (i + 0.5) / PW;

      // Distance to the nearest outer edge, in widths, made uneven. The
      // inner edge, at the binding, was never exposed, so it does not tone.
      const outer = gutterLeft ? 1 - x : x;
      const d = Math.min(outer, y / aspect, (1 - y) / aspect) + ragged(x, y) * 0.018;
      const edge = Math.max(0, 1 - d / edgeWidth) ** 2.2 * edgeDepth;

      // The gutter: a soft shadow that deepens sharply right at the binding.
      const g = gutterLeft ? x : 1 - x;
      const gutter = (Math.exp(-g / 0.012) * 0.55 + Math.exp(-g / 0.06) * 0.45) * gutterDepth;

      const mottle = (broad(x, y) * 0.7 + fine(x, y) * 0.3) * 0.022 * PAPER.mottle;

      let r = cream[0] * (1 + mottle);
      let gC = cream[1] * (1 + mottle);
      let b = cream[2] * (1 + mottle * 1.3);
      r = mix(r, TONED[0], edge);
      gC = mix(gC, TONED[1], edge);
      b = mix(b, TONED[2], edge);
      r = mix(r, SHADOW[0], gutter);
      gC = mix(gC, SHADOW[1], gutter);
      b = mix(b, SHADOW[2], gutter);

      for (const s of spots) {
        const dx = x - s.x;
        const dy = (y - s.y) / aspect;
        const q = (dx * dx + dy * dy) / (s.r * s.r);
        if (q < 4) {
          const f = s.a * Math.exp(-q * 1.4);
          r = mix(r, RUST[0], f);
          gC = mix(gC, RUST[1], f);
          b = mix(b, RUST[2], f);
        }
      }

      // A trace of dither, a fraction of one level, so the gradients do not band.
      const k = (j * PW + i) * 4;
      data[k] = r + rand() - 0.5;
      data[k + 1] = gC + rand() - 0.5;
      data[k + 2] = b + rand() - 0.5;
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return tones(data);
}

/* The page's darkest and lightest tones that cover any real area of it: the
   0.5th and 99.5th percentiles of its brightness, as colours. A freckle or
   the very core of the gutter is too small to count; the toned edges do.
   The light (lights.js) keeps its brightness change safe against both. */
function tones(data) {
  const lin = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const BINS = 1000;
  const count = new Uint32Array(BINS);
  const colour = new Array(BINS);
  const n = data.length / 4;
  for (let k = 0; k < data.length; k += 4) {
    const L = 0.2126 * lin(data[k]) + 0.7152 * lin(data[k + 1]) + 0.0722 * lin(data[k + 2]);
    const bin = Math.min(BINS - 1, Math.floor(L * BINS));
    count[bin] += 1;
    colour[bin] = [data[k], data[k + 1], data[k + 2]];
  }
  const at = (q) => {
    let seen = 0;
    for (let b = 0; b < BINS; b += 1) {
      seen += count[b];
      if (seen >= q * n) return colour[b];
    }
    return colour[BINS - 1];
  };
  return { dark: at(0.005), light: at(0.995) };
}

/* --- pages for slides ---------------------------------------------------------- */

const cache = new Map();
const toneCache = new Map();

/* A promise of the URL of this slide's page. The same slide, at the same
   place in the deck, always gets the same page. */
export function pageFor(slide, index) {
  const key = `${slide.id}:${index}`;
  if (!cache.has(key)) {
    const paperHex = getComputedStyle(document.documentElement).getPropertyValue('--paper-day').trim() || '#efe5cf';
    const canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = PH;
    toneCache.set(key, paint(canvas, slide.id || String(index), index, paperHex));
    cache.set(key, new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/png');
    }));
  }
  return cache.get(key);
}

/* This slide's page's darkest and lightest tones ({dark, light}, as RGB),
   painting the page first if it has not been. */
export function pageTones(slide, index) {
  pageFor(slide, index);
  return toneCache.get(`${slide.id}:${index}`);
}

export async function dress(slide, index) {
  slide.style.backgroundImage = `url(${await pageFor(slide, index)})`;
}

/* The deck: the slide on screen first, then the rest when the browser is
   idle, one at a time, so opening the deck is never held up. */
export function paintPages(slides, current = 0) {
  const order = [current, ...slides.keys()].filter((i, k, all) => all.indexOf(i) === k);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 30));
  const next = () => {
    const i = order.shift();
    if (i === undefined) return;
    dress(slides[i], i).then(() => idle(next));
  };
  next();
}
