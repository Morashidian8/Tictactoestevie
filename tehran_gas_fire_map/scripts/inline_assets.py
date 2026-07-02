"""Make the folium map HTML self-contained.

Downloads every external <script src>/<link href> asset and inlines it,
base64-embedding url(...) references inside CSS (fonts, marker sprites)
so the map renders with no CDN access at all. Runs in CI where the
network is open.
"""
import base64
import mimetypes
import pathlib
import re
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent.parent
SRC = HERE / "output" / "tehran_gas_fire_map.html"
UA = {"User-Agent": "tehran-gas-fire-map/1.0 (+github actions)"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def inline_css_urls(css_text: str, base_url: str) -> str:
    def repl(mo):
        ref = mo.group(1).strip("'\" ")
        if ref.startswith("data:"):
            return mo.group(0)
        abs_url = urllib.parse.urljoin(base_url, ref)
        try:
            data = fetch(abs_url)
        except Exception as e:  # noqa: BLE001 - missing font/sprite is non-fatal
            print("  skip", abs_url, e)
            return mo.group(0)
        mt = mimetypes.guess_type(abs_url.split("?")[0])[0] or "application/octet-stream"
        return f"url(data:{mt};base64,{base64.b64encode(data).decode()})"

    return re.sub(r"url\(([^)]+)\)", repl, css_text)


def main():
    html = SRC.read_text()
    urls = sorted(set(re.findall(r'(?:src|href)="(https://[^"]+)"', html)))
    for u in urls:
        print("inline", u)
        body = fetch(u).decode("utf-8", "replace")
        if u.endswith(".js"):
            html = html.replace(f'<script src="{u}"></script>', "<script>\n" + body + "\n</script>")
        else:
            body = inline_css_urls(body, u)
            for pat in (f'<link rel="stylesheet" href="{u}"/>', f'<link rel="stylesheet" href="{u}">'):
                html = html.replace(pat, "<style>\n" + body + "\n</style>")

    left = [u for u in re.findall(r'(?:src|href)="(https://[^"]+\.(?:js|css))"', html)]
    if left:
        raise SystemExit(f"still external: {left}")
    SRC.write_text(html)
    print("done, size:", SRC.stat().st_size)


if __name__ == "__main__":
    main()
