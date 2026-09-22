#!/usr/bin/env python3
"""Turn a Claude Code hook trace into a two-voice score.

A session is strictly antiphonal: the human calls (UserPromptSubmit), the agent
answers (Stop). Each *interval between events* becomes one note, so the rhythm
of the score is the rhythm of the conversation. Longer pauses sit lower in the
voice; fast exchanges ring high.

    python3 trace2score.py [trace.jsonl] > score.abc

stdlib only.
"""

import json
import sys
from pathlib import Path

# duration ladder: (upper bound in seconds, note name, ABC length suffix @ L:1/4)
LADDER = [
    (3, "sixteenth", "/4"),
    (8, "eighth", "/2"),
    (20, "quarter", ""),
    (45, "half", "2"),
    (120, "whole", "4"),
    (float("inf"), "breve", "8"),
]

# pitch by duration rank, fast -> slow (high -> low). D pentatonic minor.
AGENT_PITCH = ["a", "g", "f", "d", "c", "A"]
HUMAN_PITCH = ["D", "C", "A,", "G,", "F,", "D,"]


def rank(seconds):
    for i, (limit, _, _) in enumerate(LADDER):
        if seconds < limit:
            return i
    return len(LADDER) - 1


def read_events(path):
    events = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    events.sort(key=lambda e: e["t"])
    return events


def intervals(events):
    """Consecutive event pairs -> (voice, seconds, accented).

    Whoever is *active* owns the interval: the agent from UserPromptSubmit
    until Stop, the human from Stop until the next prompt. A Notification
    fires mid-turn (Claude blocked on a permission prompt); it does not hand
    the turn over, it just accents the note that follows. Keeping it that way
    means the score's total length stays equal to the session's.
    """
    out = []
    active = None
    pending_accent = False
    for a, b in zip(events, events[1:]):
        if a["event"] == "UserPromptSubmit":
            active = "agent"
        elif a["event"] == "Stop":
            active = "human"
        elif a["event"] == "Notification":
            pending_accent = True
        if active is None:
            continue
        out.append((active, b["t"] - a["t"], pending_accent))
        pending_accent = False
    return out


def to_abc(spans, title):
    agent, human, breaks = [], [], []
    prev_voice = None
    for i, (voice, secs, accented) in enumerate(spans):
        # one measure per exchange: a new bar starts when the agent picks up
        if voice == "agent" and prev_voice is not None and prev_voice != "agent":
            breaks.append(i)
        prev_voice = voice

        r = rank(secs)
        suffix = LADDER[r][2]
        mark = "!accent!" if accented else ""
        if voice == "agent":
            agent.append(mark + AGENT_PITCH[r] + suffix)
            human.append("z" + suffix)
        else:
            agent.append("z" + suffix)
            human.append(mark + HUMAN_PITCH[r] + suffix)

    # both voices break at the same indices, so the staves stay aligned
    def bars(seq):
        out, start = [], 0
        for b in breaks + [len(seq)]:
            if b > start:
                out.append(" ".join(seq[start:b]))
            start = b
        return " | ".join(out)

    return "\n".join([
        "X:1",
        f"T:{title}",
        "C:generated from trace.jsonl",
        "M:none",
        "L:1/4",
        "Q:1/4=90",
        "K:Dm",
        "V:1 clef=treble name=\"agent\"",
        "V:2 clef=bass   name=\"human\"",
        "V:1",
        bars(agent),
        "V:2",
        bars(human),
    ])


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "trace.jsonl"
    events = read_events(path)
    spans = intervals(events)

    for voice, secs, accented in spans:
        flag = "  <- notification" if accented else ""
        print(f"# {voice:6} {secs:8.1f}s  {LADDER[rank(secs)][1]}{flag}", file=sys.stderr)
    total = sum(s for _, s, _ in spans)
    print(f"# total  {total:8.1f}s across {len(spans)} notes", file=sys.stderr)
    if events and events[-1]["event"] == "UserPromptSubmit":
        print("# agent    (open)  — session still running", file=sys.stderr)

    print(to_abc(spans, f"Session {events[0]['session'][:8]}" if events else "Empty"))


if __name__ == "__main__":
    main()
