# Waiting time, waiting for time — slide deck

A 24-slide HTML deck for Agentic Anonymous, KTH, ending in a 45-second piece
of music and light. Vanilla HTML, CSS and ES modules;
no framework, no build step, and no request beyond this directory at runtime.

## Running it

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Press `F` for fullscreen; that first key
press also unlocks the sound.

`index.html?theme=night` opens straight into the dark variant.
`index.html#7` opens on the 7th slide; `#5.2` opens the 5th with two steps
revealed. (The hash counts positions in the deck; the prose below names slides
by their id, `s4`, `s16`, which is what the source uses.)

The server sends no cache headers, so after editing a JS file, hard-reload
(`Cmd+Shift+R`).

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
| `S` | stop / replay the sound on `s3b`, `s4` and the piece on `s16` (all start by themselves) |
| `M` | mute the piece on `s16`; its score and light go on |

The elapsed clock starts on the **first advance**, not on page load.

## What moves and what sounds

- **`s2`** counts the minutes since my last prompt, live, from `trace.jsonl`.
- **`s3b`** plays the bread schedule in strict time (about 20 s): my tone on
  each action, a steady pulse counting out the waits to the end.
  It is read from the list on the slide, so editing the list changes it.
- **`s4`** plays two sessions together (25 s) on the piece's instruments,
  with a playhead crossing the staves.
- **`s9`** runs the queue I make; **`s14b`** draws a line that never reaches
  Godot. Both start over each time their slide comes up.
- **`s7b`** and **`s17`** end on a blinking block cursor.
- **`s16`** is the piece: three agents and me, scrolling past a playhead in
  `s4`'s notation, with my window switching glowing on the page.
- Every slide is its own old-book page, painted in code (`js/paper.js`).

With the system's *reduce motion* setting on, the animations are drawn still,
the cursors stay lit, and the piece plays without light.

## Layout

```
index.html          the whole talk: slide markup and speaker notes
presenter.html      second window; parses index.html, holds no copy

css/deck.css        colour, type and motion rules — read this one first
css/slides.css      the slides that need a layout of their own
css/presenter.css

js/engine.js        Deck: next / prev / goto / on / bind
js/main.js          wiring; nothing else knows about anything else
js/keys.js          the whole key table, in one object
js/clock.js         elapsed time, shared with the presenter
js/sync.js          BroadcastChannel between the two windows
js/data.js          fetch + cache for /data
js/paper.js         the old-book pages, one per slide, seeded by its id

js/bread.js         s3b: the schedule on the slide, played in strict time
js/timeline.js      s4: two sessions onto one clock, for sound and staves
js/audio.js         s4: plays that timeline on the piece's instruments
js/instruments.js   the instruments: bowed strings, tick, bell, wind, pulse; limiter
js/piece.js         the piece: when every event sounds, and performing it
js/lights.js        the piece's light, with the flash-safety limits
js/finale.js        s16: the piece in the deck — start, stop, mute, scroll

js/figures/registry.js  which figure goes in which region — both windows use it
js/figures/*.js         one module per drawing; each is render(el, data)
js/figures/loop.js      the clock for animated figures: runs only while shown

fonts/              EB Garamond + IBM Plex Mono, woff2, local
data/               not in the repository (see below)
```

## The piece

`piece.config.json` holds every musical choice: timing, pitch, levels, the
light, and the bread slide's tempo. Two workbench pages, not slides, for
tuning it:

- `audition.html` — play the piece, solo and mute voices, move every level
  and timbre on a slider, and copy the tuned config back into
  `piece.config.json`. `choose.at_play` there is `"fixed"` (the rehearsed
  piece) or `"random"` (three voices from the pool on every play).
- `lights.html` — the light alone, on the piece's clock.

**Light safety** is fixed in `js/lights.js` and cannot be raised from the
config: at most 3 pulses start in any second, and no glow changes the
brightness of the page by more than 8% relative luminance (WCAG 2.3.1 counts
10% as a flash), measured against the darkest and lightest tones of the page
it glows on.

## The three rules the design follows

**Colour.** Warm paper, near-black ink, and one accent: a liturgical red used
the way rubrics were used in missals — for instructions and time events,
never decoration. On this deck that means the minutes counter, the clock,
durations and rates, the 15-second reference, the playheads, accents marking
an interruption, and — the one exception, so the room can copy it down — the
essay's address on the last slide.

**Type.** EB Garamond is Paula's voice. IBM Plex Mono is anything a computer
produced: timestamps, log lines, axis and data labels, counters, kickers, the
address. If the string came out of a machine, it is set in mono.

**Motion.** `.human` fades over 900 ms. `.agent` has `transition: none` and is
simply there on the next frame. Slides carry `data-motion="human" | "agent"`
and elements inside them can carry the same classes.

## Extending it

The engine is deliberately small and knows nothing about the rest. Attach from
outside:

```js
deck.on('change', ({ index, id, stepIndex, stepCount }) => { … });
deck.goto(7);
deck.bind('minutes-since-prompt', () => minutesSincePrompt());
piece.on('summons', ({ voice, kind }) => { … });   // also 'prompt', 'pulse', 'end'
```

Every intended extension point is marked `// hook:` in the source.

## Data

The deck reads its data from files that are **not in this repository**:
`trace.jsonl` (written by the hooks in `.claude/settings.json`), `focus.jsonl`
(written by `focus-logger.sh`), and the files under `data/`. They are listed
in `.gitignore`. Without them the deck still runs; the figures and pieces that
need them show an empty state or stay silent.

| file | used by |
|---|---|
| `trace.jsonl` | `s2` |
| `data/polyphony.json` | `s4` |
| `data/checks.json` | `s7` |
| `data/focus.json` | `s13` |
| `data/piece.json`, `data/pool.json`, `data/stretches/` | `s16`, `audition.html`, `lights.html` |

## Still to write

Two `[PAULA: …]` placeholders, both in speaker notes: the bread schedule
(`s3b`) and the agent sequence (`s3c`).
