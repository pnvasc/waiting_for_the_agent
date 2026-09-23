#!/usr/bin/env python3
"""Cut two stretches out of a Claude Code hook trace, for the polyphony on slide 4.

Each stretch becomes one voice pair — a human and an agent — and the deck plays
the pairs over each other. This script only selects and labels events; all
timing (shortening idle gaps, fitting each voice to the piece's length) and all
sound happen in the browser, in js/timeline.js and js/audio.js, so they can be
tuned without re-running anything.

    python3 trace2poly.py [trace.jsonl] > data/polyphony.json

Event names are shortened to what they are in the music:

    UserPromptSubmit -> prompt   the human speaks
    PreToolUse       -> tool     the agent plays a note (the tool is kept)
    PostToolUse      -> done     the note's quiet release
    Stop             -> stop     a bell: the agent hands the turn back
    Notification     -> notify   a knock: the agent is waiting on me

stdlib only.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# (id, session prefix, label, window start, window end) — local time.
VOICES = [
    ("A", "d4187569", "building this deck", "2026-09-22 14:51:00", "2026-09-22 15:42:00"),
    ("B", "e63e10f2", "Monday evening", "2026-09-21 21:43:00", "2026-09-21 22:24:00"),
]

NAMES = {
    "UserPromptSubmit": "prompt",
    "PreToolUse": "tool",
    "PostToolUse": "done",
    "Stop": "stop",
    "Notification": "notify",
}


def stamp(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").timestamp()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "trace.jsonl"
    events = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    events.sort(key=lambda e: e["t"])

    voices = []
    for vid, prefix, label, start, end in VOICES:
        a, b = stamp(start), stamp(end)
        picked = [e for e in events if e["session"].startswith(prefix) and a <= e["t"] <= b]
        if not picked:
            print(f"# voice {vid}: no events for {prefix} in window", file=sys.stderr)
            continue
        t0 = picked[0]["t"]
        out = []
        for e in picked:
            kind = NAMES.get(e["event"])
            if not kind:
                continue
            item = {"t": round(e["t"] - t0, 2), "e": kind}
            if e.get("tool"):
                item["tool"] = e["tool"]
            out.append(item)
        voices.append({
            "id": vid,
            "session": picked[0]["session"],
            "label": label,
            "start": datetime.fromtimestamp(t0).strftime("%a %H:%M"),
            "events": out,
        })
        span = picked[-1]["t"] - t0
        print(f"# voice {vid}: {len(out):3d} events over {span / 60:5.1f} min ({label})", file=sys.stderr)

    print(json.dumps({
        "source": f"{path}, two stretches cut by trace2poly.py",
        "voices": voices,
    }, indent=1))


if __name__ == "__main__":
    main()
