# Waiting time, waiting for time — slide deck

A 17-slide HTML deck for Agentic Anonymous, KTH. Vanilla HTML, CSS and ES
modules; no framework, no build step, and no network request at runtime.

## Running it

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Press `F` for fullscreen.

`index.html?theme=night` opens straight into the dark variant.
`index.html#7` opens on slide 7; `#5.2` opens slide 5 with two steps revealed.

## Keys

| key | |
|---|---|
| `→` `space` `PageDown` | next step, then next slide |
| `←` `PageUp` `Backspace` | back |
| `Home` `End` | first / last slide |
| `F` | fullscreen |
| `B` | blank the screen (paper by day, black at night) |
| `D` | night variant |
| `C` | elapsed clock in the corner — off by default |
| `P` | presenter window |

The elapsed clock starts on the **first advance**, not on page load.

## Layout

```
index.html          the whole talk: slide markup and speaker notes
presenter.html      second window; parses index.html, holds no copy

css/deck.css        colour, type and motion rules — read this one first
css/slides.css      the few slides that need a layout of their own
css/presenter.css

js/engine.js        Deck: next / prev / goto / on / bind
js/main.js          wiring; nothing else knows about anything else
js/keys.js          the whole key table, in one object
js/clock.js         elapsed time, shared with the presenter
js/sync.js          BroadcastChannel between the two windows
js/data.js          fetch + cache for /data
js/figures/registry.js  which figure goes in which region — both windows use it
js/figures/*.js         one module per drawing; each is render(el, data, opts)

fonts/              EB Garamond + IBM Plex Mono, woff2, local
data/*.json         small real slices of the logs in this directory
```

## The three rules the design follows

**Colour.** Warm paper, near-black ink, and one accent: a liturgical red used
the way rubrics were used in missals — for instructions and time events only,
never decoration. On this deck that means the `[N]` counter, the clock,
durations and rates, the 15-second reference, accents marking an interruption,
and the `[PAULA: …]` placeholders. Nothing else is red.

**Type.** EB Garamond is Paula's voice. IBM Plex Mono is anything a computer
produced: timestamps, log lines, axis and data labels, counters, kickers. If
the string came out of a machine, it is set in mono.

**Motion.** `.human` fades over 900 ms. `.agent` has `transition: none` and is
simply there on the next frame. Slides carry `data-motion="human" | "agent"`
and elements inside them can carry the same classes.

## Extending it

The engine is deliberately small and knows nothing about the rest. Attach from
outside:

```js
deck.on('change', ({ index, id, stepIndex, stepCount }) => { … });
deck.goto(7);
deck.bind('seconds-since-prompt', () => secondsSinceLastPrompt());
```

Every intended extension point is marked `// hook:` in the source.

## Data

`data/*.json` currently hold small **real** slices of the logs sitting in this
directory, marked `"stub": true` and carrying a `"source"` field:

| file | from | used by |
|---|---|---|
| `score.json` | `trace.jsonl`, first 28 intervals, via `trace2score.py`'s mapping | slides 4, 16 |
| `focus.json` | `focus.jsonl`, one continuous 60-minute run | slide 13 |
| `checks.json` | the same run: every switch back to an agent window | slides 2, 7 |

Replacing a stub with a full processed run is a file swap; no code changes.

## Not built yet

Audio, chimes, trace replay, and the data-processing pipeline. The hooks are
in place; nothing is stubbed in their place.

## Still to write

Two visible `[PAULA: …]` placeholders, on slides 11 and 15.
