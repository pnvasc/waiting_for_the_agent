# /// script
# requires-python = ">=3.12"
# dependencies = ["mido"]
# ///
"""
Build the piece: turn the hook trace and the focus log into events a player
can perform.

    uv run tools/build_piece.py                   everything: pool, stretches, piece, MIDI
    uv run tools/build_piece.py --last-minutes 20 only the last 20 minutes, for the coda

uv reads the block at the top of this file, fetches a suitable Python and
mido, and runs it; nothing needs installing by hand.

The logs
    trace.jsonl   {"t", "event", "session", "tool"}: one line per hook call
    focus.jsonl   {"t", "event": "Focus", "app"}: one line per window switch

What comes out (all under data/)
    stretches/<id>.json  one session's work within one sitting: a voice
    pool.json            every stretch, with its length and event counts
    piece.json           three stretches laid over each other, as if they
                         had happened at the same time: the piece
    piece.mid            the same, as a score: one staff per voice
    piece-live.json      with --last-minutes: the recent stretch, as it was

Everything that is a choice (where a sitting ends, which app counts as being
with the agents, which stretches make the piece, where the light comes from,
how long it plays) is read from piece.config.json.
"""

import argparse
import datetime as dt
import json
import time
from collections import Counter, defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


# --- reading ------------------------------------------------------------------


def read_jsonl(path):
    """All well-formed lines of a JSON-lines file, and how many were not."""
    rows, bad = [], 0
    if not path.exists():
        return rows, bad
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                bad += 1  # a line still being written, or a broken one
    return rows, bad


def stamp(t):
    """Local time of an epoch second, for ids and file names: 2026-09-22T1451."""
    return dt.datetime.fromtimestamp(t).strftime("%Y-%m-%dT%H%M")


def iso(t):
    return dt.datetime.fromtimestamp(t).isoformat(timespec="seconds")


# --- sittings and stretches ----------------------------------------------------


def sittings(trace, focus, gap):
    """Split both logs, merged on one timeline, wherever nothing at all
    happened for longer than `gap` seconds. Returns (start, end) pairs."""
    times = sorted([e["t"] for e in trace] + [e["t"] for e in focus])
    if not times:
        return []
    spans, start, prev = [], times[0], times[0]
    for t in times[1:]:
        if t - prev > gap:
            spans.append((start, prev))
            start = t
        prev = t
    spans.append((start, prev))
    return spans


def stretches(trace, spans):
    """Each session's events within each sitting: one stretch per pair.
    A stretch is one voice: one agent, working, for a while."""
    out = []
    for s0, s1 in spans:
        by_session = defaultdict(list)
        for e in trace:
            if s0 <= e["t"] <= s1:
                by_session[e["session"]].append(e)
        for session, events in by_session.items():
            events.sort(key=lambda e: e["t"])
            out.append({
                "id": f"{stamp(events[0]['t'])}-{session[:8]}",
                "session": session,
                "t0": events[0]["t"],
                "t1": events[-1]["t"],
                "events": events,
            })
    out.sort(key=lambda s: s["t0"])
    return out


# --- one voice ------------------------------------------------------------------


def tool_notes(events, cfg, stats):
    """Pair each PreToolUse with the next PostToolUse of the same tool in the
    same session: one note, from the call to its result. Pairing by tool keeps
    parallel calls from crossing wires. A call whose result never came gets a
    short default length; a result with no call is dropped."""
    default = cfg["build"]["default_duration"]
    longest = cfg["build"]["max_tool_duration"]
    waiting = defaultdict(deque)  # tool -> start times not yet paired
    notes = []
    for e in events:
        tool = e.get("tool") or "?"
        if e["event"] == "PreToolUse":
            waiting[tool].append(e["t"])
        elif e["event"] == "PostToolUse":
            # calls that have waited too long are given up on, not paired
            while waiting[tool] and e["t"] - waiting[tool][0] > longest:
                notes.append((waiting[tool].popleft(), default, tool))
                stats["unmatched_pre"] += 1
            if waiting[tool]:
                start = waiting[tool].popleft()
                notes.append((start, e["t"] - start, tool))
            else:
                stats["unmatched_post"] += 1
    for tool, starts in waiting.items():
        for start in starts:
            notes.append((start, default, tool))
            stats["unmatched_pre"] += 1
    notes.sort()
    return notes


def focus_moves(focus, t0, t1, agent_apps):
    """Departures from the agents' app(s) and returns to them, between t0 and
    t1. Switching between two other apps is neither. App names are not kept:
    only which way I went."""
    before = [e for e in focus if e["t"] < t0]
    here = bool(before) and before[-1]["app"] in agent_apps
    moves = []
    for e in focus:
        if not t0 <= e["t"] <= t1:
            continue
        now = e["app"] in agent_apps
        if now != here:
            moves.append((e["t"], "return" if now else "depart"))
        here = now
    return moves


def voice(events, focus, t0, t1, origin, cfg, stats):
    """Everything one voice does, in seconds from `origin`. `focus` may be
    empty: in the live piece the switching belongs to the piece, not a voice."""
    rel = lambda t: round(t - origin, 3)
    kinds = {"Stop": "Stop", "Notification": "Notification", "SubagentStop": "SubagentStop"}
    return {
        "notes": [{"t": rel(s), "d": round(d, 3), "tool": tool}
                  for s, d, tool in tool_notes(events, cfg, stats)],
        "summons": [{"t": rel(e["t"]), "kind": kinds[e["event"]]}
                    for e in events if e["event"] in kinds],
        "prompts": [{"t": rel(e["t"])} for e in events if e["event"] == "UserPromptSubmit"],
        "focus": [{"t": rel(t), "kind": k}
                  for t, k in focus_moves(focus, t0, t1, set(cfg["build"]["agent_apps"]))],
    }


def light_stretch(focus, cfg):
    """The stretch of the focus log named in light.stretch, as departures and
    returns in seconds from its start, with its length. Used to lay switching
    from one time over agents from another."""
    st = cfg["light"]["stretch"]
    t0 = dt.datetime.fromisoformat(st["start"]).timestamp()
    t1 = t0 + st["minutes"] * 60
    moves = focus_moves(focus, t0, t1, set(cfg["build"]["agent_apps"]))
    return {"start": iso(t0), "duration": round(t1 - t0, 1),
            "moves": [{"t": round(t - t0, 3), "kind": k} for t, k in moves]}


def counts(v):
    return {k: len(v[k]) for k in ("notes", "summons", "prompts", "focus")}


# --- choosing the three -----------------------------------------------------------


def choose(pool, cfg):
    """The stretches that make the piece. 'auto': the busiest stretch of each
    of the busiest sessions; if there are fewer sessions than voices, more
    stretches of the same sessions stand in as further agents. They are then
    put in the order they really happened, which is the order they enter."""
    want = cfg["choose"]["voices"]
    n = cfg["choose"]["count"]
    if want != "auto":
        by_id = {s["id"]: s for s in pool}
        missing = [i for i in want if i not in by_id]
        if missing:
            raise SystemExit(f"not in the pool: {', '.join(missing)}")
        return [by_id[i] for i in want]

    busiest = sorted(pool, key=lambda s: s["counts"]["notes"], reverse=True)
    picked, sessions = [], set()
    for s in busiest:  # first, one per session
        if s["session"] not in sessions and len(picked) < n:
            picked.append(s)
            sessions.add(s["session"])
    for s in busiest:  # then fill up, if we must
        if s not in picked and len(picked) < n:
            picked.append(s)
    return sorted(picked, key=lambda s: s["t0"])


# --- time: real seconds to played seconds ------------------------------------------


def time_map(times, target, cap):
    """A piecewise-linear map from real seconds to played seconds. Every gap
    between two events longer than `cap` is shortened to `cap`; the result is
    then scaled to `target`. The player (stage 2) uses the same rule."""
    points = sorted(set(times))
    clock, played = 0.0, [0.0]
    for a, b in zip(points, points[1:]):
        clock += min(b - a, cap)
        played.append(clock)
    scale = target / clock if clock else 0.0

    def f(t):
        if t <= points[0]:
            return 0.0
        for i in range(1, len(points)):
            if t <= points[i]:
                a, b = points[i - 1], points[i]
                frac = (t - a) / (b - a) if b > a else 0.0
                return (played[i - 1] + frac * (played[i] - played[i - 1])) * scale
        return played[-1] * scale

    return f


def perform(piece, cfg):
    """Played times for every event, per voice, following the 'time' section.
    Only the MIDI file needs this here; the player does its own."""
    tc = cfg["time"]
    out = []
    for i, v in enumerate(piece["voices"]):
        entry = tc["entries"][i] if piece["kind"] == "overlay" and i < len(tc["entries"]) else 0
        times = ([n["t"] for n in v["notes"]] + [n["t"] + n["d"] for n in v["notes"]]
                 + [s["t"] for s in v["summons"]] + [p["t"] for p in v["prompts"]])
        if not times:
            out.append(None)
            continue
        if tc["mode"] == "realtime":
            f = lambda t, e=entry: e + t - tc["offset"]
        elif piece["kind"] == "live":
            span = piece["duration"] or 1
            f = lambda t: t / span * (tc["target"] - tc.get("tail", 0))
        else:
            g = time_map(times, tc["target"] - entry - tc.get("tail", 0), tc["gap_cap"])
            f = lambda t, g=g, e=entry: e + g(t)
        out.append(f)
    return out


# --- MIDI --------------------------------------------------------------------------


def pitch(root, degree, scale):
    return root + scale[degree % len(scale)] + 12 * (degree // len(scale))


def write_midi(piece, cfg, path):
    """One track and channel per agent voice, one for my prompts, so it opens
    in MuseScore as a score with one staff per voice. 60 beats a minute, so a
    beat is a played second."""
    try:
        import mido
    except ImportError:
        print("  mido not available: no MIDI file (run with uv to get it)")
        return

    pc, tc = cfg["pitch"], cfg["time"]
    scale, tpb = pc["scale"], 480
    maps = perform(piece, cfg)
    tick = lambda s: max(0, round(s * tpb))
    limit = tc["excerpt"] if tc["mode"] == "realtime" else float("inf")

    def track(name, channel, program, events):
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=name, time=0))
        tr.append(mido.Message("program_change", channel=channel, program=program, time=0))
        msgs = []
        for start, dur, note, vel in events:
            if 0 <= start <= limit:
                msgs.append((tick(start), 1, note, vel))
                msgs.append((tick(start + max(dur, 0.05)), 0, note, 0))
        msgs.sort()  # at the same tick, note-offs (0) before note-ons (1)
        now = 0
        for t, on, note, vel in msgs:
            kind = "note_on" if on else "note_off"
            tr.append(mido.Message(kind, channel=channel, note=note, velocity=vel, time=t - now))
            now = t
        return tr

    mid = mido.MidiFile(type=1, ticks_per_beat=tpb)
    head = mido.MidiTrack()
    head.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(60), time=0))
    mid.tracks.append(head)

    programs = [42, 41, 40]  # cello, viola, violin: the consort, low to high
    prompts = []
    for i, (v, f) in enumerate(zip(piece["voices"], maps)):
        if f is None:
            continue
        root = pc["voice_roots"][i % len(pc["voice_roots"])]
        events = []
        for n in v["notes"]:
            deg = pc["tool_degrees"].get(n["tool"], pc["other_degree"])
            if deg == "tick":  # a dry tick: short, quiet, at the top of the register
                events.append((f(n["t"]), 0.05, pitch(root, 4, scale), 30))
            else:
                events.append((f(n["t"]), f(n["t"] + n["d"]) - f(n["t"]), pitch(root, deg, scale), 45))
        for s in v["summons"]:
            events.append((f(s["t"]), 1.0, pitch(root, pc["summons_degree"], scale), 110))
        for p in v["prompts"]:
            prompts.append(f(p["t"]))
        mid.tracks.append(track(f"agent {i + 1}", i, programs[i % 3], events))

    prompts.sort()
    walk = pc["prompt_degrees"]
    mine = [(t, 1.2, pitch(pc["prompt_root"], walk[k % len(walk)], scale), 100)
            for k, t in enumerate(prompts)]
    mid.tracks.append(track("me", len(piece["voices"]), 73, mine))  # flute
    mid.save(path)


# --- the whole thing -------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--config", default=ROOT / "piece.config.json", type=Path)
    ap.add_argument("--trace", default=ROOT / "trace.jsonl", type=Path)
    ap.add_argument("--focus", default=ROOT / "focus.jsonl", type=Path)
    ap.add_argument("--last-minutes", type=float, help="build only the last N minutes, to piece-live.json")
    ap.add_argument("--sitting-gap", type=float, help="override build.sitting_gap")
    ap.add_argument("--no-midi", action="store_true")
    args = ap.parse_args()

    began = time.perf_counter()
    cfg = json.loads(args.config.read_text())
    if args.sitting_gap:
        cfg["build"]["sitting_gap"] = args.sitting_gap

    trace, bad_t = read_jsonl(args.trace)
    focus, bad_f = read_jsonl(args.focus)
    trace = [e for e in trace if "t" in e and "event" in e and "session" in e]
    focus = [e for e in focus if "t" in e and "app" in e]
    focus.sort(key=lambda e: e["t"])
    stats = Counter(bad_lines=bad_t + bad_f)
    DATA.mkdir(exist_ok=True)

    if args.last_minutes:
        live(trace, focus, cfg, args, stats)
    else:
        everything(trace, focus, cfg, args, stats)

    print(f"  {', '.join(f'{k} {v}' for k, v in sorted(stats.items()) if v) or 'no problems'}")
    print(f"  done in {time.perf_counter() - began:.2f} s")


def everything(trace, focus, cfg, args, stats):
    spans = sittings(trace, focus, cfg["build"]["sitting_gap"])
    print(f"{len(spans)} sittings")

    # every stretch of work is written; the busy ones go in the pool
    folder = DATA / "stretches"
    folder.mkdir(exist_ok=True)
    for old in folder.glob("*.json"):
        old.unlink()
    pool = []
    for s in stretches(trace, spans):
        v = voice(s["events"], focus, s["t0"], s["t1"], s["t0"], cfg, stats)
        if len(v["notes"]) < cfg["build"]["min_tool_calls"]:
            continue
        entry = {"id": s["id"], "file": f"stretches/{s['id']}.json", "session": s["session"],
                 "start": iso(s["t0"]), "t0": s["t0"],
                 "duration": round(s["t1"] - s["t0"], 1), "counts": counts(v)}
        (folder / f"{s['id']}.json").write_text(json.dumps({**entry, **v}, indent=1))
        pool.append({**entry, "voice": v})

    listing = [{k: v for k, v in s.items() if k not in ("voice", "t0")} for s in pool]
    (DATA / "pool.json").write_text(json.dumps({"built": iso(time.time()), "stretches": listing}, indent=2))
    print(f"pool: {len(pool)} stretches")
    for s in listing:
        print(f"  {s['id']}  {s['duration'] / 60:5.1f} min  {s['counts']}")

    chosen = choose(pool, cfg)
    piece = {
        "kind": "overlay",
        "_about": "Real stretches of work from different times, laid over each other as if simultaneous.",
        "built": iso(time.time()),
        "voices": [{"voice": i + 1, "id": s["id"], "session": s["session"], "start": s["start"],
                    "duration": s["duration"], **s["voice"]} for i, s in enumerate(chosen)],
    }
    # Where the light comes from. 'own': each voice's own switching, already
    # in the voices. 'stretch': one stretch of the focus log over everything;
    # the voices keep their own too, so the player can be switched back.
    piece["light"] = cfg["light"]["source"]
    if piece["light"] == "stretch":
        ls = light_stretch(focus, cfg)
        piece["focus"], piece["focus_from"] = ls["moves"], {"start": ls["start"], "duration": ls["duration"]}
    (DATA / "piece.json").write_text(json.dumps(piece, indent=1))
    print(f"piece: {', '.join(s['id'] for s in chosen)}")
    if piece["light"] == "stretch":
        print(f"light: {len(piece['focus'])} switches from {piece['focus_from']['start']}")
    else:
        print(f"light: own, {sum(len(v['focus']) for v in piece['voices'])} switches")
    if not args.no_midi:
        write_midi(piece, cfg, DATA / "piece.mid")


def live(trace, focus, cfg, args, stats):
    """The recent stretch, as it really was: voices on one clock, numbered in
    the order they first appear."""
    t1 = time.time()
    t0 = t1 - args.last_minutes * 60
    recent = sorted((e for e in trace if t0 <= e["t"] <= t1), key=lambda e: e["t"])
    order = list(dict.fromkeys(e["session"] for e in recent))
    voices = []
    for i, session in enumerate(order):
        events = [e for e in recent if e["session"] == session]
        v = voice(events, [], t0, t1, t0, cfg, stats)
        del v["focus"]
        voices.append({"voice": i + 1, "session": session,
                       "entry": round(events[0]["t"] - t0, 3), **v})
    # one window, one me: the switching is the piece's, shared by all voices
    moves = focus_moves(focus, t0, t1, set(cfg["build"]["agent_apps"]))
    piece = {"kind": "live", "built": iso(t1), "start": iso(t0),
             "duration": round(t1 - t0, 1), "voices": voices, "light": "own",
             "focus": [{"t": round(t - t0, 3), "kind": k} for t, k in moves]}
    # No switching logged in the window (the focus logger was not running):
    # lay the chosen old stretch over it instead, if the config says so.
    if not moves and cfg["light"]["live_fallback"]:
        ls = light_stretch(focus, cfg)
        piece["light"] = "stretch"
        piece["focus"], piece["focus_from"] = ls["moves"], {"start": ls["start"], "duration": ls["duration"]}
    (DATA / "piece-live.json").write_text(json.dumps(piece, indent=1))
    print(f"live: last {args.last_minutes:g} min, {len(voices)} voices, "
          f"{sum(len(v['notes']) for v in voices)} notes")
    note = f" (none logged: from {piece['focus_from']['start']})" if piece["light"] == "stretch" else ""
    print(f"light: {len(piece['focus'])} switches{note}")
    if not args.no_midi:
        write_midi(piece, cfg, DATA / "piece-live.mid")


if __name__ == "__main__":
    main()
