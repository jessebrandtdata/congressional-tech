#!/usr/bin/env python3
"""Copy the built data into the site, where the Bill Delay Tracker page reads it.

  python -m bill_delay.site_data --out ../site/public/data/bill-delay

copies <data-dir>/congresses.json (the index the page opens with) and, for every Congress the index
lists, its delays.json (what the page loads when that Congress is picked), stats.json, delays.csv and
awaiting.csv (the downloads), keeping the <congress>/ layout. The output folder is replaced, so a
Congress dropped from the index leaves no stale file behind. Run collect_warehouse.py and delays.py
first; a Congress the index lists without its files is an error, not a gap. Stdlib only.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
INDEX = "congresses.json"
CONGRESS_FILES = ("delays.json", "stats.json", "delays.csv", "awaiting.csv")


def build(data_dir, out):
    """Write the site's copy of the data to out. Returns the number of Congresses copied."""
    index_path = data_dir / INDEX
    if not index_path.exists():
        raise SystemExit(f"{index_path} not found; run delays.py first")
    entries = json.loads(index_path.read_text())["congresses"]
    if not entries:
        raise SystemExit(f"{index_path} lists no Congress")
    for e in entries:
        for name in CONGRESS_FILES:
            if not (data_dir / str(e["congress"]) / name).exists():
                raise SystemExit(f"{data_dir / str(e['congress']) / name} not found; run delays.py for Congress {e['congress']}")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    shutil.copy2(index_path, out / INDEX)
    for e in entries:
        src, dst = data_dir / str(e["congress"]), out / str(e["congress"])
        dst.mkdir()
        for name in CONGRESS_FILES:
            shutil.copy2(src / name, dst / name)
    return len(entries)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=APP / "data")
    ap.add_argument("--out", type=Path, default=APP.parent / "site" / "public" / "data" / "bill-delay")
    a = ap.parse_args()
    n = build(a.data_dir, a.out)
    size = sum(p.stat().st_size for p in a.out.rglob("*") if p.is_file())
    print(f"site data: {n} Congresses, {size / 1e6:.1f} MB in {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
