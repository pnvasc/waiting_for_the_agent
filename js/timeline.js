/* ===========================================================================
   The polyphony's clock — shared by what you see and what you hear.

   data/polyphony.json holds two stretches of real hook events, in real
   seconds. This turns them into one piece of music, in playback seconds, so
   that the staves on slide 4 (figures/polyphony.js) and the sound
   (audio.js) are placed by the same numbers and cannot drift apart.

   Two decisions live here, both tunable on stage:

     CAP       an idle gap longer than this many real seconds is shortened
               to it. Hours of waiting would otherwise be all silence.
     DURATION  each voice is then fitted to this many playback seconds.
               Each voice gets its own scale: the busy session plays fast,
               the sparse one slow — two melodies set to the same bars.
   =========================================================================== */

export const DURATION = 45;
export const CAP = 45;

/* A pentatonic scale (D minor: D F G A C), as semitones above the root. The
   agent's tools are mapped onto it, so each kind of work has its own pitch. */
export const SCALE = [0, 3, 5, 7, 10];

const TOOL_DEGREE = { Read: 0, Bash: 1, Edit: 2, Write: 3 };

/* Which degree of the scale a tool sounds on. Anything unlisted — Skill,
   WebFetch, AskUserQuestion — shares the top degree. */
export function degree(tool) {
  return TOOL_DEGREE[tool] ?? 4;
}

export function timeline(data, { duration = DURATION, cap = CAP } = {}) {
  const voices = (data?.voices || []).map((v) => {
    // Real time with long gaps shortened…
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

    // …then stretched or squeezed to fill the piece.
    const length = clock || 1;
    for (const e of events) e.at = (e.at / length) * duration * 0.97;

    return { id: v.id, label: v.label, start: v.start, events };
  });

  return { duration, voices };
}
