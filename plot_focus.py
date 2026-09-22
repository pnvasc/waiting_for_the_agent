#!/usr/bin/env python3
"""Plot the app-focus log written by focus-logger.sh.

focus.jsonl holds one record per *switch* of the frontmost app:

    {"t":1790021666,"event":"Focus","app":"Terminal"}

so each record's dwell time is the distance to the next record. Two things
follow from that, and both are handled explicitly below:

* When the logger is not running (overnight, machine asleep) the gap is not
  attention -- it is missing data. Gaps over SESSION_GAP split the timeline
  into separate panels rather than becoming one enormous bar.
* A very long single-app gap is usually away-from-keyboard with that app
  still frontmost. Only the first DWELL_CAP of such a stretch is credited to
  the app; the remainder is drawn as "unlogged / away".

Usage:
    python plot_focus.py [focus.jsonl] [-o focus.png] [--dark] [--show]
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import median

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

SESSION_GAP = 30 * 60  # logger stopped -> new panel, not a bar
DWELL_CAP = 10 * 60  # longest stretch credited to one app
MIN_DRAW_SEC = 10  # keep one-second switches visible

# Light and dark are each selected, not an automatic flip.
LIGHT = dict(
    surface="#fcfcfb", ink="#0b0b0b", ink2="#52514e", ink3="#78776f",
    grid="#e4e3df", series="#2a78d6", away="#dcdbd6",
)
DARK = dict(
    surface="#1a1a19", ink="#ffffff", ink2="#c3c2b7", ink3="#8a8a80",
    grid="#383835", series="#3987e5", away="#333330",
)


def load_events(path: Path) -> list[dict]:
    events = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        if rec.get("event") == "Focus" and rec.get("app"):
            events.append(rec)
    events.sort(key=lambda r: r["t"])
    return events


def build_segments(events: list[dict]) -> list[list[dict]]:
    """Group focus segments into sessions of continuous logging."""
    sessions: list[list[dict]] = [[]]
    for cur, nxt in zip(events, events[1:]):
        gap = nxt["t"] - cur["t"]
        if gap > SESSION_GAP:  # logger was down: close the session
            sessions[-1].append(
                dict(app=cur["app"], start=cur["t"], dwell=0, away=0)
            )
            sessions.append([])
            continue
        sessions[-1].append(
            dict(
                app=cur["app"],
                start=cur["t"],
                dwell=min(gap, DWELL_CAP),
                away=max(0, gap - DWELL_CAP),
            )
        )
    # The final record is still open (that app is frontmost right now).
    if events:
        sessions[-1].append(
            dict(app=events[-1]["app"], start=events[-1]["t"], dwell=0, away=0)
        )
    return [s for s in sessions if s]


def draw(sessions: list[list[dict]], out: Path, dark: bool, show: bool) -> None:
    c = DARK if dark else LIGHT
    segs = [s for sess in sessions for s in sess]

    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for s in segs:
        totals[s["app"]] += s["dwell"]
        counts[s["app"]] += 1
    apps = sorted(totals, key=lambda a: (totals[a], counts[a]))  # small -> large
    row = {a: i for i, a in enumerate(apps)}

    spans = [sess[-1]["start"] - sess[0]["start"] for sess in sessions]
    floor = 0.07 * sum(spans)  # keep a very short session labelable
    ratios = [max(sp, floor) for sp in spans]

    fig = plt.figure(figsize=(13, 0.40 * len(apps) + 5.6), facecolor=c["surface"])
    gs = fig.add_gridspec(
        2, len(sessions),
        height_ratios=[1.35, 1], width_ratios=ratios,
        left=0.145, right=0.965, top=0.845, bottom=0.09,
        hspace=0.36, wspace=0.07,
    )

    # --- top: the focus trace, one panel per logging session ----------------
    axes = []
    for j, sess in enumerate(sessions):
        ax = fig.add_subplot(gs[0, j], facecolor=c["surface"])
        axes.append(ax)
        t0, t1 = sess[0]["start"], sess[-1]["start"]
        for s in sess:
            left = mdates.date2num(datetime.fromtimestamp(s["start"]))
            width = max(s["dwell"], MIN_DRAW_SEC) / 86400
            ax.barh(row[s["app"]], width, left=left, height=0.5,
                    color=c["series"], linewidth=0)
            if s["away"]:
                a0 = s["start"] + s["dwell"]
                ax.axvspan(
                    mdates.date2num(datetime.fromtimestamp(a0)),
                    mdates.date2num(datetime.fromtimestamp(a0 + s["away"])),
                    color=c["away"], linewidth=0, zorder=0,
                )
        ax.set_xlim(mdates.date2num(datetime.fromtimestamp(t0 - max(30, 0.01 * (t1 - t0)))),
                    mdates.date2num(datetime.fromtimestamp(t1 + max(30, 0.01 * (t1 - t0)))))
        ax.set_ylim(-0.75, len(apps) - 0.25)
        nticks = max(2, min(7, int(ratios[j] / sum(ratios) * 14)))
        ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=2, maxticks=nticks))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))
        ax.grid(axis="x", color=c["grid"], linewidth=0.8, zorder=0)
        ax.set_axisbelow(True)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(c["grid"])
        ax.tick_params(colors=c["ink2"], length=0, labelsize=9)
        day = datetime.fromtimestamp(t0)
        ax.set_xlabel(day.strftime("%a %-d %b"), color=c["ink3"], fontsize=9, labelpad=6)
        if j == 0:
            ax.set_yticks(range(len(apps)), apps, fontsize=10, color=c["ink"])
        else:
            ax.set_yticks([])

    axes[0].set_title(
        "Which app had focus, over time",
        color=c["ink"], fontsize=13, fontweight="semibold", loc="left", pad=10,
    )
    # A single series needs no legend; the second fill only appears when some
    # stretch ran past the cap, and then identity is no longer color-alone.
    if any(s["away"] for s in segs):
        axes[-1].legend(
            handles=[
                Patch(color=c["series"], label="app in focus"),
                Patch(color=c["away"], label=f"no switch for >{DWELL_CAP // 60} min (away?)"),
            ],
            loc="lower right", bbox_to_anchor=(1.0, 1.005), ncol=2,
            frameon=False, fontsize=9, labelcolor=c["ink2"],
            handlelength=0.9, handleheight=0.9, borderaxespad=0,
        )

    # --- bottom: total focus time per app -----------------------------------
    ax = fig.add_subplot(gs[1, :], facecolor=c["surface"])
    mins = [totals[a] / 60 for a in apps]
    ax.barh(range(len(apps)), mins, height=0.55, color=c["series"], linewidth=0)
    for i, (a, m) in enumerate(zip(apps, mins)):
        ax.text(m + max(mins) * 0.012, i, f"{m:.1f} min   ({counts[a]}×)",
                va="center", fontsize=9, color=c["ink2"])
    ax.set_xlim(0, max(mins) * 1.2)
    ax.set_ylim(-0.75, len(apps) - 0.25)
    ax.set_yticks(range(len(apps)), apps, fontsize=10, color=c["ink"])
    ax.grid(axis="x", color=c["grid"], linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(c["grid"])
    ax.tick_params(colors=c["ink2"], length=0, labelsize=9)
    ax.set_xlabel("minutes in focus", color=c["ink3"], fontsize=9, labelpad=6)
    ax.set_title(
        "Total time in focus, and number of times switched to (×)",
        color=c["ink"], fontsize=13, fontweight="semibold", loc="left", pad=10,
    )

    dwells = [s["dwell"] for s in segs if s["dwell"] > 0]
    tracked = sum(totals.values())
    fig.suptitle("Focus trace", x=0.145, y=0.965, ha="left",
                 color=c["ink"], fontsize=18, fontweight="semibold")
    fig.text(
        0.145, 0.905,
        f"{len(segs)} switches across {len(apps)} apps  ·  "
        f"{tracked / 3600:.1f} h of logged focus in {len(sessions)} "
        f"session{'s' if len(sessions) != 1 else ''}  ·  "
        f"median stretch {median(dwells):.0f} s, longest {max(dwells) / 60:.0f} min",
        ha="left", color=c["ink2"], fontsize=10.5,
    )
    fig.text(
        0.145, 0.028,
        "focus.jsonl records only switches, so a record's dwell time is the distance to the next one; "
        f"stretches are credited at most {DWELL_CAP // 60} min.",
        ha="left", color=c["ink3"], fontsize=8.5,
    )

    fig.savefig(out, dpi=200, facecolor=c["surface"])
    print(f"wrote {out}")
    if show:
        matplotlib.use("macosx", force=True)
        plt.show()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("path", nargs="?", default="focus.jsonl", type=Path)
    p.add_argument("-o", "--out", type=Path)
    p.add_argument("--dark", action="store_true", help="render on the dark surface")
    p.add_argument("--show", action="store_true")
    args = p.parse_args()

    events = load_events(args.path)
    if not events:
        raise SystemExit(f"no Focus events in {args.path}")
    out = args.out or args.path.with_name(
        f"{args.path.stem}{'-dark' if args.dark else ''}.png"
    )
    draw(build_segments(events), out, args.dark, args.show)


if __name__ == "__main__":
    main()
