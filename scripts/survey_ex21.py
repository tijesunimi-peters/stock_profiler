"""Survey real EX-21 exhibits: does the parser cope, and who publishes ownership?

`sec/exhibits.py` is the one place this codebase parses a filing document, and EX-21 has no schema
— every filer lays it out differently. So its coverage is a MEASUREMENT, not a claim, and this is
what measures it. Re-run it after any change to the parser, and before trusting it on a new
population.

Result 2026-08-02, twelve large filers:

    parsed            11 / 12
    publish ownership  2 / 11   (Walmart "100%", Exxon "50" / "69.6")
    unparsed           1 / 12   (Target files EX-21 as running prose, not a table)

Target is the useful failure: it returns `status="na"` with a reason rather than a guess, which is
the behaviour the exception was granted on. Extending the parser to read prose would raise
coverage and lower trust — a list guessed out of a paragraph is indistinguishable, to a reader,
from one read off a table.

    python scripts/survey_ex21.py       # needs SEC_USER_AGENT in .env
"""
import sys, time, urllib.request, json, re
sys.path.insert(0, "src")
from secfin.sec.exhibits import find_ex21_filename, parse_ex21

UA = [l.split("=",1)[1].strip() for l in open(".env") if l.startswith("SEC_USER_AGENT=")][0]
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    time.sleep(0.2)                      # stay well inside SEC's fair-access limit
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")

FILERS = {
    "AAPL": 320193, "MSFT": 789019, "JPM": 19617, "KO": 21344, "INTC": 50863,
    "WMT": 104169, "XOM": 34088, "PG": 80424, "GE": 40545, "T": 732717,
    "BRK.A": 1067983, "TGT": 27419,
}
rows = []
for tk, cik in FILERS.items():
    try:
        subs = json.loads(get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))
        rec = subs["filings"]["recent"]
        i = next(i for i, f in enumerate(rec["form"]) if f == "10-K")
        acc = rec["accessionNumber"][i]
        base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-','')}"
        name = find_ex21_filename(get(f"{base}/{acc}-index-headers.html"))
        if not name:
            rows.append((tk, "no EX-21", 0, False, "")); continue
        r = parse_ex21(get(f"{base}/{name}"))
        sample = r.subsidiaries[0].ownership if (r.has_ownership and r.subsidiaries) else ""
        rows.append((tk, r.status, len(r.subsidiaries), r.has_ownership, sample or ""))
    except Exception as e:
        rows.append((tk, f"error: {type(e).__name__}", 0, False, ""))

print(f"{'filer':8} {'status':10} {'subs':>5}  ownership  sample")
for tk, st, n, own, s in rows:
    print(f"  {tk:6} {st:10} {n:>5}  {'YES' if own else 'no ':9} {s}")
ok = [r for r in rows if r[1] == "ok"]
print(f"\n  parsed: {len(ok)}/{len(rows)}   publish ownership: {sum(1 for r in ok if r[3])}/{len(ok)}")
