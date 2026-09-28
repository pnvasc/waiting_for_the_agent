/* ===========================================================================
   The polyphony's clock — shared by what you see and what you hear.

   data/polyphony.json holds hook events in seconds. This places them in
   playback seconds, so that the staves on slide 4 (figures/polyphony.js) and
   the sound (audio.js) are placed by the same numbers and cannot drift apart.

   Four settings live here, all tunable on stage:

     CAP       the longest rest, in seconds, between two events.
     DURATION  how many playback seconds each voice fills, from its ENTRY
               second on. Each voice keeps its own tempo: a busy voice plays
               fast, a sparse one slow — two melodies set to the same bars.
     ENTRY     the second at which each session comes in.
     EXIT      how many seconds before the end each session plays its last
               note, so the two do not stop together either.
   =========================================================================== */

export const DURATION = 25;
export const CAP = 45;

/* The second at which each session comes in. B starts 10 seconds after A,
   so the two opening prompts are not heard at the same moment. */
export const ENTRY = { A: 0, B: 10 };
export const EXIT = { A: 0, B: 2.5 };

/* A pentatonic scale (D minor: D F G A C), as semitones above the root. The
   agent's tools are mapped onto it, so each kind of work has its own pitch. */
export const SCALE = [0, 3, 5, 7, 10];

/* The same as 'tool_degrees' in piece.config.json, so slide 4 is written and
   heard exactly as the final piece is: a shell command is not a pitch but a
   dry tick. Keep the two in step. */
const TOOL_DEGREE = { Read: 0, Grep: 0, Glob: 0, Edit: 2, MultiEdit: 2, Write: 3, Bash: 'tick' };

/* Which degree of the scale a tool sounds on, or 'tick'. Anything unlisted —
   Skill, WebFetch, AskUserQuestion — shares the top degree. */
export function degree(tool) {
  return TOOL_DEGREE[tool] ?? 4;
}

export function timeline(data, { duration = DURATION, cap = CAP } = {}) {
  const voices = (data?.voices || []).map((v) => {
    // Rests of at most CAP seconds…
    let clock = 0;
    let prev = null;
    let prompts = 0;
    const events = v.events.map((e) => {
      if (prev !== null) clock += Math.min(e.t - prev, cap);
      prev = e.t;
      const out = { real: e.t, at: clock, kind: e.e, tool: e.tool };
      // The human's prompts walk slowly through the scale, so a later prompt
      // does not repeat the first one's pitch.
      if (e.e === 'prompt') out.degree = [0, 2, 4, 1, 3][prompts++ % 5];
      if (e.e === 'tool' || e.e === 'done') out.degree = degree(e.tool);
      return out;
    });

    // …then fitted to the piece, after the voice's entry.
    const entry = ENTRY[v.id] ?? 0;
    const exit = EXIT[v.id] ?? 0;
    const length = clock || 1;
    for (const e of events) e.at = entry + (e.at / length) * (duration * 0.97 - entry - exit);

    return { id: v.id, label: v.label, start: v.start, events };
  });

  return { duration, voices };
}
