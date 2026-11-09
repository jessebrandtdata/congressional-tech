"""Fork-only: cut a built site down to the Bill Delay Tracker page for demo.jessebrandt.com.

  python .github/demo/tracker_only.py apps/site/dist demo-dist

Copies the tracker page, the built scripts and styles, its data and the two icons. In the page, every
link to another page of the site is pointed at the live Congressional Tech site, so the header and
footer still work. The folder's index.html forwards to the tracker. Reads the build and writes a new
folder; the site's source is untouched, so nothing here has to be undone before the upstream PR.
"""
import re
import shutil
import sys
from pathlib import Path

BASE = "/congressional-tech/"
LIVE = "https://civictechdc.github.io/congressional-tech/"
PAGE = "bill-delay"
# what the tracker page loads from its own folder; every other site path is another page
LOCAL = (f"{PAGE}/", "_astro/", "data/bill-delay/", "favicon.svg", "civic-tech-dc.svg")
KEEP = (f"{PAGE}", "_astro", "data/bill-delay", "favicon.svg", "civic-tech-dc.svg")
HREF = re.compile(r'href="' + re.escape(BASE) + r'([^"]*)"')

# Every published page says it is a demo: a banner above the header, "Demo:" before the title, and
# noindex so search engines do not list unreviewed figures as if they were the project's.
BANNER_TEXT = ("DEMO. Work in progress, not an official Civic Tech DC release: figures may contain errors. "
               "See the note at the foot of the page.")
BANNER = ('<div role="note" style="background:#eec05e;color:#1b1b1b;font:600 14px/1.4 \'Source Sans 3\','
          'system-ui,sans-serif;padding:8px 16px;text-align:center">' + BANNER_TEXT + '</div>')
BODY = re.compile(r"<body[^>]*>")
TITLE = re.compile(r"<title>")
HEAD = re.compile(r"<head[^>]*>")

REDIRECT = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Bill Delay Tracker</title>
<meta http-equiv="refresh" content="0; url={PAGE}/">
</head>
<body>
<a href="{PAGE}/">Bill Delay Tracker</a>
</body>
</html>
"""


def point_at_live_site(html):
    """href="/congressional-tech/<path>" for any page but the tracker becomes the live site's address."""
    def swap(m):
        rest = m.group(1)
        return m.group(0) if rest.startswith(LOCAL) else f'href="{LIVE}{rest}"'
    return HREF.sub(swap, html)


def stamp_demo(html):
    """The banner after <body>, "Demo: " in the title, a noindex robots tag in <head>. Each must land once."""
    for pattern, add, where in ((BODY, BANNER, "after"), (TITLE, "Demo: ", "after"),
                                (HEAD, '<meta name="robots" content="noindex">', "after")):
        found = pattern.search(html)
        if not found:
            raise SystemExit(f"the page has no {pattern.pattern}; cannot stamp it as a demo")
        html = html[:found.end()] + add + html[found.end():]
    return html


def main(dist, out):
    dist, out = Path(dist), Path(out)
    page = dist / PAGE / "index.html"
    if not page.exists():
        raise SystemExit(f"{page} not found; build the site first")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in KEEP:
        src = dist / name
        if not src.exists():
            raise SystemExit(f"{src} not found in the build")
        if src.is_dir():
            shutil.copytree(src, out / name)
        else:
            (out / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out / name)
    (out / PAGE / "index.html").write_text(stamp_demo(point_at_live_site(page.read_text())))
    (out / "index.html").write_text(stamp_demo(REDIRECT))
    files = [p for p in out.rglob("*") if p.is_file()]
    print(f"{len(files)} files, {sum(p.stat().st_size for p in files) / 1e6:.1f} MB in {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
