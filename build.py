"""index.html をビルドする。

  python3 build.py            → index.html（GitHub Pages 用の完全な HTML）
  python3 build.py --artifact → dist/philosophy-akinator.html（Claude のアーティファクト用の断片）

src/ の traits.js・data*.js・engine.js を template.html に埋め込み、1 ファイルにまとめます。
"""
import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
JS_FILES = ["traits.js", "data1.js", "data2.js", "data3.js", "data4.js", "engine.js"]

SITE_URL = "https://xenoah.github.io/owl-of-minerva/"
DESCRIPTION = "梟のミネルヴァが問いを重ねて、古今東西の思想からあなたの思想を言い当てる。思い浮かべた哲学者や学派を当てる推理モードと、思想図鑑つき。"

FAVICON_SVG = (
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
    "<path d='M13 22 L9 4 L27 14 Z M51 22 L55 4 L37 14 Z' fill='#3A4570'/>"
    "<ellipse cx='32' cy='37' rx='25' ry='26' fill='#3A4570'/>"
    "<circle cx='22.5' cy='31' r='10.5' fill='#E7E0CC'/><circle cx='41.5' cy='31' r='10.5' fill='#E7E0CC'/>"
    "<circle cx='22.5' cy='31' r='6.5' fill='#E3A43A'/><circle cx='41.5' cy='31' r='6.5' fill='#E3A43A'/>"
    "<circle cx='22.5' cy='31' r='3.2' fill='#141A33'/><circle cx='41.5' cy='31' r='3.2' fill='#141A33'/>"
    "<path d='M32 35 L28 40 L32 47 L36 40 Z' fill='#8F6212'/></svg>"
)


def body_fragment() -> str:
    js = "\n".join((SRC / f).read_text(encoding="utf8") for f in JS_FILES)
    tpl = (SRC / "template.html").read_text(encoding="utf8")
    return tpl.replace("<!--DATA-->", "<script>\n" + js + "\n</script>")


def full_document(fragment: str) -> str:
    # テンプレートの冒頭（<title>・フォント・<style>）を <head> に、残りを <body> に入れる
    cut = fragment.index("</style>") + len("</style>")
    head_part, body_part = fragment[:cut], fragment[cut:]
    title = re.search(r"<title>(.*?)</title>", head_part).group(1)
    icon = "data:image/svg+xml," + urllib.parse.quote(FAVICON_SVG)
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:url" content="{SITE_URL}">
<meta property="og:image" content="{SITE_URL}apple-touch-icon.png">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="{SITE_URL}">
<meta name="theme-color" content="#E8EAF1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#10152B" media="(prefers-color-scheme: dark)">
<link rel="icon" href="{icon}">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>
[hidden]{{display:none!important}}
html{{-webkit-text-size-adjust:100%}}
body{{margin:0}}
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
</style>
{head_part}
</head>
<body>
<noscript><p style="padding:24px">このページを遊ぶには JavaScript を有効にしてください。</p></noscript>
{body_part.strip()}
</body>
</html>
"""


def validate(js: str) -> None:
    """Node.js があれば、データを読み込んで書き間違い（未知の命題キー・地域コード・重複 ID）を検出する。"""
    import shutil
    import subprocess
    if not shutil.which("node"):
        print("（node が見つからないため、データの検査は省略しました）")
        return
    code = js + "\n;console.log(`OK: 思想 ${PH.length} 件 / 質問 ${ENGINE.Q.length} 問`);"
    r = subprocess.run(["node", "-"], input=code, capture_output=True, text=True)
    if r.returncode != 0:
        msg = [l.strip() for l in r.stderr.splitlines() if l.strip().startswith("Error")]
        sys.exit("データにエラーがあります: " + (msg[0] if msg else r.stderr.strip()))
    print(r.stdout.strip())


if __name__ == "__main__":
    validate("\n".join((SRC / f).read_text(encoding="utf8") for f in JS_FILES))
    frag = body_fragment()
    if "--artifact" in sys.argv:
        out = ROOT / "dist" / "philosophy-akinator.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(frag, encoding="utf8")
    else:
        out = ROOT / "index.html"
        out.write_text(full_document(frag), encoding="utf8")
    print(f"built {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
