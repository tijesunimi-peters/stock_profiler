#!/usr/bin/env python3
"""Numeric per-element comparison of one ported section against the prototype's capture.

    python3 tools/compare.py <section-id> <ours-text-dump.json> [--open]

<section-id> is the prototype's ("i1".."i7"); the dump is what tools/text.js writes with RE=\\S.
Elements are matched by their whitespace-normalised own text, then every visual property that a
diff threshold can hide is compared: font stack, size, weight, letter-spacing, colour, and box.

Why this exists: an image diff at 32/255 misses a wrong colour token (--ink-muted for --ink-soft
is 15/255) and a UA button background (10-25/255). Both were real defects in §01/§02 that three
passes of eyeballing and one pixel diff did not catch.
"""
import json
import re
import sys
from pathlib import Path

GT = Path(__file__).resolve().parent.parent / "prototype-ground-truth"


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def main():
    sid = sys.argv[1]
    ours_path = sys.argv[2]
    opened = "--open" in sys.argv
    proto = json.load(open(GT / ("literals-open.json" if opened else "literals.json")))[sid]["tree"]
    ours = json.load(open(ours_path))

    pmap = {}
    for n in proto:
        t = norm(n.get("text"))
        if t:
            pmap.setdefault(t, n)
    omap = {}
    for n in ours:
        t = norm("".join(r["t"] for r in n["runs"]))
        if t:
            omap.setdefault(t, n)

    rows = []
    for t, p in pmap.items():
        o = omap.get(t)
        if o is None:
            continue
        c = p["css"]
        m = re.match(r"^(\S+?)/(\S+)\s+(\S+)\s+(.*)$", o["font"])
        osize, olh, oweight, ofam = m.groups()
        checks = [
            ("font-family", c.get("fontFamily"), ofam),
            ("font-size", c.get("fontSize"), osize),
            ("font-weight", c.get("fontWeight"), oweight),
            ("letter-spacing", c.get("letterSpacing"), None if o["ls"] == "normal" else o["ls"]),
            ("color", c.get("color"), o["color"]),
        ]
        for name, pv, ov in checks:
            if pv is None and ov is None:
                continue
            if name == "letter-spacing" and pv is None and ov is None:
                continue
            if pv != ov and not (pv is None and ov is None):
                # a property the prototype does not declare is inherited, not a defect on its own
                if pv is None:
                    continue
                rows.append((t, o.get("cls") or o["tag"], name, pv, ov))
        dw = round(o["w"] - p["w"], 2)
        dh = round(o["h"] - p["h"], 2)
        if abs(dw) > 0.5 or abs(dh) > 0.5:
            rows.append((t, o.get("cls") or o["tag"], "box", f'{p["w"]}x{p["h"]}', f'{o["w"]}x{o["h"]} (dw {dw}, dh {dh})'))

    missing = [t for t in pmap if t not in omap]
    extra = [t for t in omap if t not in pmap]
    print(f"{sid}: prototype {len(pmap)} texts, ours {len(omap)}; matched {len(pmap) - len(missing)}")
    for t in missing:
        print(f"  MISSING  {t[:70]!r}")
    for t in extra:
        print(f"  EXTRA    {t[:70]!r}")
    print(f"-- {len(rows)} property mismatches --")
    for t, cls, name, pv, ov in rows:
        print(f"  {t[:34]!r:38} .{cls[:26]:27} {name:14} proto={pv!s:34} ours={ov}")


if __name__ == "__main__":
    main()
