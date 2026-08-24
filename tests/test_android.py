"""
test_android.py — the packaged Android app's resources, checked without an Android SDK.

The APK cannot be built here, but almost everything that goes wrong with it is a file
being absent, the wrong size, or the wrong colour — and all three are checkable. The
specific failure this suite exists to prevent: `cap add android` writes Capacitor's
template logo into android/, that folder is gitignored, and so the app shipped with a
stranger's icon on a white square. Nothing failed. It just looked wrong on the phone.

There is a small PNG reader below rather than a Pillow dependency, for the same reason
tests/faketk.py exists: the suites have to run on a clean checkout with nothing but
Python, and a real narrow implementation fails honestly where a mock would not.
"""

from __future__ import annotations

import json
import math
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android-res"

# One name, in one place. It is the Gradle output's published filename, the entry re-included
# in .gitignore, and the tail of the permanent /releases/latest/download/ URL in README, and
# section [14] checks that all of them still agree.
APK_NAME = "follow-desk-debug.apk"

ok = fail = 0


def check(label, cond):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {label}")
    else:
        fail += 1
        print(f"  FAIL  {label}")


# ---------------------------------------------------------------------------
# A PNG reader for exactly the files tools/make_android_icons.py writes:
# 8-bit RGBA, not interlaced. Anything else raises instead of guessing.
# ---------------------------------------------------------------------------
def read_png(path: Path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} is not a PNG")
    pos, chunks, head = 8, [], None
    while pos < len(raw):
        (length,) = struct.unpack(">I", raw[pos:pos + 4])
        kind = raw[pos + 4:pos + 8]
        body = raw[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            head = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            chunks.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + length
    width, height, depth, colour, _comp, _filt, interlace = head
    if (depth, colour, interlace) != (8, 6, 0):
        raise ValueError(f"{path.name}: expected 8-bit RGBA, got depth {depth} "
                         f"colour type {colour} interlace {interlace}")

    data = zlib.decompress(b"".join(chunks))
    stride = width * 4
    rows, previous, at = [], bytearray(stride), 0
    for _ in range(height):
        kind = data[at]
        at += 1
        line = bytearray(data[at:at + stride])
        at += stride
        if kind == 1:                                   # Sub
            for x in range(4, stride):
                line[x] = (line[x] + line[x - 4]) & 0xFF
        elif kind == 2:                                 # Up
            for x in range(stride):
                line[x] = (line[x] + previous[x]) & 0xFF
        elif kind == 3:                                 # Average
            for x in range(stride):
                left = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + ((left + previous[x]) >> 1)) & 0xFF
        elif kind == 4:                                 # Paeth
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                b = previous[x]
                c = previous[x - 4] if x >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                nearest = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + nearest) & 0xFF
        elif kind != 0:
            raise ValueError(f"{path.name}: unknown row filter {kind}")
        rows.append(bytes(line))
        previous = line
    return width, height, rows


def pixel(rows, x, y):
    row = rows[y]
    return tuple(row[x * 4:x * 4 + 4])


def close_to(pixel_value, rgb, tolerance=12):
    """Downsampling moves colours a little, so exact equality would be a false alarm."""
    if pixel_value[3] < 250:
        return False
    return all(abs(pixel_value[i] - rgb[i]) <= tolerance for i in range(3))


def count_near(rows, rgb, tolerance=14):
    hits = 0
    for row in rows:
        for x in range(0, len(row), 4):
            if row[x + 3] < 250:
                continue
            if (abs(row[x] - rgb[0]) <= tolerance
                    and abs(row[x + 1] - rgb[1]) <= tolerance
                    and abs(row[x + 2] - rgb[2]) <= tolerance):
                hits += 1
    return hits


# The palette, read from the stylesheet rather than repeated here: the icon and the
# interface have to be the same colours, and a test that hardcodes them cannot notice
# when they stop being.
CSS = (ROOT / "web" / "app.css").read_text(encoding="utf-8")


def css_colour(name, block=":root"):
    """Read one custom property, from the block that declares it.

    The block argument is not decoration. Every token in this stylesheet is declared
    twice — once in :root for the light theme, once in [data-theme="dark"] — and a
    plain search over the whole file always returns whichever comes first, which is
    the light one. Asking for a dark colour without naming its block would silently
    hand back the light value and the test would pass while the phone looked wrong.
    """
    start = CSS.find(f"{block} {{")
    if start == -1:
        raise AssertionError(f"{block} is not a block in web/app.css any more")
    end = CSS.find("}", start)
    found = re.search(rf"--{name}:\s*#([0-9A-Fa-f]{{6}})", CSS[start:end])
    if not found:
        raise AssertionError(f"--{name} is not declared in {block} in web/app.css any more")
    value = found.group(1)
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def hex6(rgb):
    return "#%02X%02X%02X" % rgb


DESK = css_colour("desk")
CARD = css_colour("card")
STAMP = css_colour("stamp")
DESK_NIGHT = css_colour("desk", '[data-theme="dark"]')

DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}

# ===========================================================================
print("\n[1] The launcher icons exist at every density Android asks for")
for density, factor in DENSITIES.items():
    folder = RES / f"mipmap-{density}"
    for name, dp in (("ic_launcher.png", 48), ("ic_launcher_round.png", 48),
                     ("ic_launcher_foreground.png", 108)):
        path = folder / name
        if not path.exists():
            check(f"{density}/{name} exists", False)
            continue
        width, height, _rows = read_png(path)
        expected = round(dp * factor)
        check(f"{density}/{name} is {expected}x{expected}",
              (width, height) == (expected, expected))

print("\n[2] They are this app's icon, not Capacitor's template logo")
# The template logo has none of these colours in it, which is the whole point: this is
# the check that would have caught the icon nobody looked at.
_w, _h, legacy = read_png(RES / "mipmap-xxxhdpi" / "ic_launcher.png")
check("the desk colour is the ground", close_to(pixel(legacy, 96, 6), DESK))
check("the corner is transparent, so the square is rounded",
      pixel(legacy, 0, 0)[3] == 0)
check("there is bond-paper card in the middle", close_to(pixel(legacy, 96, 96), CARD))
check("the stamp is on it", count_near(legacy, STAMP) > 200)
check("the card covers a serious part of the icon", count_near(legacy, CARD) > 192 * 192 * 0.2)

_w, _h, rounded = read_png(RES / "mipmap-xxxhdpi" / "ic_launcher_round.png")
check("the round icon keeps the stamp", count_near(rounded, STAMP) > 200)
# ic_launcher_round is for launchers that ask for a circle and do no masking of their own,
# so the file itself has to be one. Not tested by sampling the middle of the left edge: a
# circle inscribed in its square *touches* the edge midpoints, so that pixel is opaque in
# both icons and would prove nothing. What separates them is the corner area and the
# geometry of the boundary.
transparent = sum(1 for row in rounded for x in range(0, len(row), 4) if row[x + 3] == 0)
squircle = sum(1 for row in legacy for x in range(0, len(row), 4) if row[x + 3] == 0)
check("the round icon is cut to a circle, not merely corner-rounded",
      0.16 < transparent / (192 * 192) < 0.24 and squircle / (192 * 192) < 0.05)
inside = outside = 0
for degrees in (45, 135, 225, 315):
    angle = math.radians(degrees)
    for fraction, target in ((0.97, "in"), (1.03, "out")):
        x = min(max(round(95.5 + fraction * 96 * math.cos(angle)), 0), 191)
        y = min(max(round(95.5 + fraction * 96 * math.sin(angle)), 0), 191)
        opaque = pixel(rounded, x, y)[3] == 255
        if target == "in" and opaque:
            inside += 1
        if target == "out" and not opaque:
            outside += 1
check("its edge follows a circle of the full width, on all four diagonals",
      inside == 4 and outside == 4)
check("the circle is centred, so the mark is not clipped off one side",
      close_to(pixel(rounded, 96, 6), DESK) and close_to(pixel(rounded, 96, 186), DESK))

_w, _h, adaptive = read_png(RES / "mipmap-xxxhdpi" / "ic_launcher_foreground.png")
check("the adaptive foreground has no ground of its own",
      pixel(adaptive, 4, 4)[3] == 0)
check("the adaptive foreground still carries the stamp", count_near(adaptive, STAMP) > 200)

# 108dp canvas, 66dp keyline: content outside the middle 72dp is cropped by some
# launcher masks, so anything painted in the outer margin is content you may lose.
margin = round(432 * (108 - 72) / 108 / 2)      # the 18dp band on each side
edge_pixels = [pixel(adaptive, x, y)
               for y in list(range(margin)) + list(range(432 - margin, 432))
               for x in range(0, 432, 8)]
check("nothing is painted where a circular mask would cut it",
      all(p[3] == 0 for p in edge_pixels))
check("but the mark is big enough to read",
      count_near(adaptive, CARD) > 432 * 432 * 0.15)

print("\n[3] The adaptive icon's background is the app's own colour")
background = (RES / "values" / "ic_launcher_background.xml").read_text(encoding="utf-8")
found = re.search(r'name="ic_launcher_background">#([0-9A-Fa-f]{6})<', background)
check("ic_launcher_background is declared", found is not None)
check("and it is --desk from web/app.css, not the template's white",
      found and tuple(int(found.group(1)[i:i + 2], 16) for i in (0, 2, 4)) == DESK)

print("\n[4] The launch screen")
splash = (RES / "drawable" / "splash.xml").read_text(encoding="utf-8")
check("splash.xml is a layer-list, so it is never stretched",
      "<layer-list" in splash)
check("it opens on the same colour as the app", hex6(DESK) in splash.upper())
for reference in re.findall(r'@(mipmap|drawable|color)/(\w+)', splash):
    kind, name = reference
    if kind == "mipmap":
        exists = all((RES / f"mipmap-{d}" / f"{name}.png").exists() for d in DENSITIES)
        check(f"@mipmap/{name} exists at every density", exists)

print("\n[4b] Night launch screen")
night_splash = (RES / "drawable-night" / "splash.xml").read_text(encoding="utf-8")
check("drawable-night/splash.xml exists", "<layer-list" in night_splash)
# Read from [data-theme="dark"], not written here as a literal: the night splash and the
# dark interface are the same surface, and a hardcoded hex in this file would keep passing
# after someone changed the theme.
check("night splash uses the dark desk colour from web/app.css",
      hex6(DESK_NIGHT) in night_splash.upper())
check("and not the light one, which is the whole reason this file exists",
      DESK_NIGHT != DESK and hex6(DESK) not in night_splash.upper())
night_styles = (RES / "values-night" / "styles.xml").read_text(encoding="utf-8")
check("values-night/styles.xml exists", "<resources>" in night_styles)
check("night styles keep the launch theme", "AppTheme.NoActionBarLaunch" in night_styles)

print("\n[4c] All tracked XML resources are well-formed")
xml_files = sorted(RES.rglob("*.xml"))
for path in xml_files:
    try:
        ET.parse(path)
        check(f"{path.relative_to(RES)} parses", True)
    except ET.ParseError as e:
        check(f"{path.relative_to(RES)} parses", False)
        print(f"        {e}")

print("\n[5] The copier is wired into every path that touches android/")
scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
check("android:res runs the copier", "apply-android-res.mjs" in scripts.get("android:res", ""))
check("tools/apply-android-res.mjs is there", (ROOT / "tools" / "apply-android-res.mjs").exists())
for name in ("android:init", "android:sync", "android:apk", "android:apk:unix"):
    check(f"{name} applies the icons too", "android:res" in scripts.get(name, ""))

print("\n[6] git keeps the icons and throws away the build")
gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
rules = [line.strip() for line in gitignore if line.strip() and not line.startswith("#")]
check("android/ is ignored", "android/" in rules)
check("dist/ contents are ignored", "dist/*" in rules)
check("built APKs are ignored", "*.apk" in rules)
check("signing secrets are ignored", "keystore.properties" in rules and "*.jks" in rules)
# Reading the rules as text is not enough here, because the released APK is deliberately
# re-included and the interaction is subtle: `dist/*` rather than `dist/` above, because git
# cannot re-include a file whose parent directory is excluded, and the `!` line last, because
# the last matching pattern wins. Ask git itself instead. Note the absence of -v: with -v,
# check-ignore exits 0 whenever *any* pattern matched, negation included, so the verbose form
# would report the committed APK as ignored and this check could never fail.
def ignored_by_git(relative: str) -> bool:
    return subprocess.run(["git", "check-ignore", "-q", relative],
                          cwd=str(ROOT)).returncode == 0


if (ROOT / ".git").exists():
    check("the released APK escapes those rules, so a clone carries it",
          not ignored_by_git("dist/follow-desk-debug.apk"))
    check("every other build output in dist/ is still ignored",
          ignored_by_git("dist/app-debug.apk") and ignored_by_git("dist/output-metadata.json"))
    check("an APK anywhere else is still ignored", ignored_by_git("follow-desk-debug.apk"))
else:
    print("  (no .git here, so the check-ignore checks are skipped)")
# The trap: ignoring android/ is right, and ignoring android-res/ would silently undo
# this whole suite for anyone who cloned the repo.
check("android-res/ is NOT ignored",
      not any(rule.strip("/") == "android-res" for rule in rules))
# --cached --others --exclude-standard is "everything git would put in a clone": tracked
# files plus untracked ones it is willing to take. Asking only for tracked files would make
# this fail in the gap between regenerating the icons and committing them, which is a state
# the person editing them is legitimately in.
visible = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard",
                          "android-res"], cwd=str(ROOT), capture_output=True, text=True)
on_disk = sorted(p for p in RES.rglob("*") if p.is_file())
if visible.returncode == 0:
    listed = [line for line in visible.stdout.splitlines() if line.strip()]
    check(f"git would carry all {len(on_disk)} resource files into a clone",
          len(listed) == len(on_disk) and len(on_disk) == 19)
else:
    check("git is available to confirm the icons would reach a clone", False)

print("\n[7] capacitor.config.json promises nothing it cannot do")
# Read straight, no comment-stripping: "//" and "//SplashScreen" are ordinary JSON keys,
# which is why Capacitor's own JSON.parse is happy with them. (An earlier version of this
# test ran a regex over the file first and broke a file that was already valid.)
config = json.loads((ROOT / "capacitor.config.json").read_text(encoding="utf-8"))
check("webDir points straight at web/", config["webDir"] == "web")
check("the app id is set", config["appId"].count(".") >= 2)
package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
deps = dict(package.get("dependencies", {}), **package.get("devDependencies", {}))
# A config block for a plugin that is not installed is read by nobody. It looks like it
# controls the splash screen; it does not, and that is worse than having no block at all.
check("no SplashScreen config without the plugin that reads it",
      "SplashScreen" not in config.get("plugins", {})
      or "@capacitor/splash-screen" in deps)

print("\n[8] build-apk.ps1 is readable by the PowerShell that will run it")
ps1 = (ROOT / "build-apk.ps1").read_bytes()
check("build-apk.ps1 exists", len(ps1) > 0)
# Windows PowerShell 5.1 reads a BOM-less file as the local ANSI codepage, so a script
# with non-ASCII bytes and no BOM is mangled on exactly the machines it targets.
check("it is pure ASCII, so a missing BOM cannot mangle it",
      all(byte < 127 for byte in ps1))
text = ps1.decode("ascii").splitlines()
opens = [n for n, line in enumerate(text, 1) if line.rstrip().endswith('@"')]
closes = [n for n, line in enumerate(text, 1) if line.strip() == '"@']
check("its here-strings are balanced", len(opens) == len(closes) and len(opens) > 0)
check("no here-string is closed mid-line",
      not any(line.rstrip().endswith('"@') and line.strip() != '"@' for line in text))
check("it does not claim a -Release build it cannot sign",
      "assembleRelease" not in "\n".join(text))

print("\n[9] The copier, run for real against a throwaway project")
node = shutil.which("node")
if not node:
    print("  SKIP  node is not installed, so the copier was not executed")
else:
    with tempfile.TemporaryDirectory(prefix="xfa-android-") as temp:
        fake = Path(temp)
        # apply-android-res.mjs finds the repo from its own location, so a copy of the
        # tool plus the resources next to a stand-in android/ is a complete rehearsal.
        (fake / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "apply-android-res.mjs", fake / "tools")
        shutil.copytree(RES, fake / "android-res")
        res = fake / "android" / "app" / "src" / "main" / "res"
        for folder in ("drawable", "drawable-port-hdpi", "drawable-land-xxhdpi",
                       "mipmap-hdpi", "values"):
            (res / folder).mkdir(parents=True)
            if folder.startswith("drawable"):
                (res / folder / "splash.png").write_bytes(b"template splash")
        (res / "mipmap-hdpi" / "ic_launcher.png").write_bytes(b"template logo")
        (res / "values" / "ic_launcher_background.xml").write_text("#FFFFFF")

        done = subprocess.run([node, "tools/apply-android-res.mjs"], cwd=str(fake),
                              capture_output=True, text=True)
        check("the copier reports success", done.returncode == 0)
        check("it says how many template splash bitmaps it removed",
              "3 template splash bitmaps removed" in done.stdout)
        check("the template splash bitmaps are gone",
              not list(res.glob("drawable*/splash.png")))
        check("splash.xml took their place", (res / "drawable" / "splash.xml").exists())
        check("the template logo was overwritten",
              (res / "mipmap-hdpi" / "ic_launcher.png").read_bytes()
              == (RES / "mipmap-hdpi" / "ic_launcher.png").read_bytes())
        check("night splash was copied into the project",
              (res / "drawable-night" / "splash.xml").exists())
        check("night styles were copied into the project",
              (res / "values-night" / "styles.xml").exists())
        # The declared colour, not any mention of #FFFFFF: the real file explains in a
        # comment that Capacitor leaves this white, so a substring search finds the word
        # in the very file that fixes the problem.
        landed = re.search(r'name="ic_launcher_background">#([0-9A-Fa-f]{6})<',
                           (res / "values" / "ic_launcher_background.xml").read_text())
        check("the white background was replaced with the desk colour",
              landed is not None
              and tuple(int(landed.group(1)[i:i + 2], 16) for i in (0, 2, 4)) == DESK)
        check("every density arrived", len(list(res.glob("mipmap-*/ic_launcher*.png"))) == 15)

        again = subprocess.run([node, "tools/apply-android-res.mjs"], cwd=str(fake),
                               capture_output=True, text=True)
        check("running it twice changes nothing and still succeeds",
              again.returncode == 0 and "0 template splash bitmaps removed" in again.stdout)

    with tempfile.TemporaryDirectory(prefix="xfa-noandroid-") as temp:
        bare = Path(temp)
        (bare / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "apply-android-res.mjs", bare / "tools")
        shutil.copytree(RES, bare / "android-res")
        missing = subprocess.run([node, "tools/apply-android-res.mjs"], cwd=str(bare),
                                 capture_output=True, text=True)
        check("without android/ it fails loudly instead of silently doing nothing",
              missing.returncode == 1 and "android:init" in missing.stderr)

print("\n[10] The install manifest, and the colours painted before any CSS loads")
# Three separate files hold a copy of the desk colour, because each is read by something
# that runs before app.css does: the manifest (the browser's install prompt and PWA splash),
# the theme-color metas (the Android status bar), and capacitor.config.json (the very first
# WebView frame). None of them can reference a custom property, so all this suite can do is
# refuse to let them drift from the stylesheet.
manifest_text = (ROOT / "web" / "manifest.webmanifest").read_text(encoding="utf-8")
try:
    manifest = json.loads(manifest_text)
    check("web/manifest.webmanifest is valid JSON", True)
except json.JSONDecodeError as e:
    manifest = {}
    check("web/manifest.webmanifest is valid JSON", False)
    print(f"        {e}")

index = (ROOT / "web" / "index.html").read_text(encoding="utf-8")

# The decision recorded in ANDROID.md: the manifest declares the language of its own
# strings, which is English, because those strings are the app's name and the name has to
# match the one the APK installs under. It deliberately does not follow the interface
# language — that is a runtime choice kept in localStorage, and a static file cannot track
# it. document.title does, and tests/test_frontend.mjs holds it to that.
check("short_name is the name the APK installs under, so one app has one name",
      manifest.get("short_name") == config.get("appName"))
ARABIC = range(0x0600, 0x0700)
strings = " ".join(str(manifest.get(key, ""))
                   for key in ("name", "short_name", "description"))
persian_script = any(ord(ch) in ARABIC for ch in strings)
check("the direction it declares is the direction its own strings are written in",
      (manifest.get("dir") == "rtl") == persian_script)
check("and the language it declares matches that script too",
      (manifest.get("lang", "").startswith("fa")) == persian_script)

check("theme_color is --desk from web/app.css", manifest.get("theme_color", "").upper() == hex6(DESK))
# One colour for both, and it is the light one: the manifest has no media queries, so it
# cannot answer prefers-color-scheme. The metas below are what do.
check("background_color is the same colour, since the manifest cannot switch themes",
      manifest.get("background_color", "").upper() == hex6(DESK))
check("start_url and scope are relative, so they resolve under file:// in the WebView",
      str(manifest.get("start_url", "")).startswith(".")
      and str(manifest.get("scope", "")).startswith("."))

metas = dict((scheme, colour.upper()) for colour, scheme in re.findall(
    r'<meta name="theme-color" content="(#[0-9A-Fa-f]{6})" '
    r'media="\(prefers-color-scheme: (light|dark)\)">', index))
check("the status bar is tinted --desk in daylight", metas.get("light") == hex6(DESK))
check("and the dark --desk at night", metas.get("dark") == hex6(DESK_NIGHT))
check("the first WebView frame is the same colour, opaque",
      config.get("android", {}).get("backgroundColor", "").upper() == hex6(DESK) + "FF")

# The server hands out an allowlist, so a file the manifest points at but the server will
# not serve is a 404 that only shows up when someone tries to install. Read as text rather
# than imported: this suite has to run without FastAPI installed.
served = re.search(r"SERVED_FILES = \{(.*?)\n\}",
                   (ROOT / "x_analyzer_server.py").read_text(encoding="utf-8"), re.S)
allowlist = set(re.findall(r'"([\w.]+)":', served.group(1))) if served else set()
check("the manifest itself is one of the files the server will hand out",
      "manifest.webmanifest" in allowlist)
icons = [icon.get("src", "") for icon in manifest.get("icons", [])]
check("every icon it names is in web/ and served",
      bool(icons) and all((ROOT / "web" / src).exists() and src in allowlist for src in icons))

print("\n[11] The Persian docs describe the app that exists")
docs = {name: (ROOT / name).read_text(encoding="utf-8") for name in ("README.md", "ANDROID.md")}
# A grep cannot judge whether an explanation is any good. What it can do is refuse to let
# the manifest's language decision go unexplained, because the one thing a reader cannot
# work out from the file is why it says en while the interface opens in Persian. The two
# member names are looked for quoted, the way JSON spells them: bare "dir" would be
# satisfied by the mkdir in a shell example and would prove nothing.
recorded = docs["ANDROID.md"]
check("ANDROID.md explains the manifest's language and direction",
      all(part in recorded for part in ("manifest.webmanifest", '"lang"', '"dir"')))
# The docs promised @capacitor/filesystem for months. It was never installed, the code never
# called it, and a reader who went looking for that behaviour would have found nothing.
for name, text in docs.items():
    promised = sorted(set(re.findall(r"@capacitor(?:-community)?/[a-z-]+", text)))
    unmet = [pkg for pkg in promised if pkg not in deps]
    check(f"{name} promises no plugin that is not installed", not unmet)
    if unmet:
        print(f"        promised but absent from package.json: {', '.join(unmet)}")

print("\n[12] Run.bat, the menu most people arrive through")
# The other Windows launcher, and it fails the same silent way: a goto whose label was
# renamed prints "The system cannot find the batch label specified" and closes the window,
# which nobody sees from a shell that is not cmd.exe. Cheap to check, invisible otherwise.
bat = (ROOT / "Run.bat").read_bytes()
check("Run.bat is pure ASCII too, for the same codepage reason",
      all(byte < 127 for byte in bat))
lines = bat.decode("ascii").splitlines()
jumps = set(re.findall(r"goto\s+(\w+)", "\n".join(lines)))
labels = set(line.strip()[1:] for line in lines if re.fullmatch(r":\w+", line.strip()))
check(f"every goto reaches a label that exists ({len(jumps)} of them)", jumps <= labels)
if jumps - labels:
    print(f"        jumps to nothing: {', '.join(sorted(jumps - labels))}")
# Option 4 is the reason this section is in the Android suite: building the APK is Node and
# a JDK, no Python anywhere in it, so it is the one menu entry that has to stay reachable on
# a machine without Python. The check is that it branches away before the interpreter test.
menu = "\n".join(lines)
apk_branch = menu.find('if "%choice%"=="4" goto apk')
python_test = menu.find("-c \"import sys\"")
check("the APK build branches away before Python is required",
      apk_branch != -1 and python_test != -1 and apk_branch < python_test)

print("\n[13] The APK committed for people who download the ZIP")
# This is the only binary the repository keeps, and it is kept for one reason: "Code ->
# Download ZIP" does not include release assets, so without it somebody who took the whole
# project still has no phone app. The risk that buys is staleness -- an APK is a snapshot of
# web/ at build time, and nothing about editing web/app.js makes the old one look wrong. So
# the file is unzipped here and measured against the front end it claims to contain.
APK = ROOT / "dist" / APK_NAME
check(f"dist/{APK_NAME} is in the tree", APK.is_file())

if APK.is_file():
    check("it is a real zip archive, not a truncated download",
          zipfile.is_zipfile(APK))
    with zipfile.ZipFile(APK) as apk:
        check("no entry inside it is corrupt", apk.testzip() is None)
        entries = set(apk.namelist())
        check("it is an Android package: manifest, bytecode and resource table",
              "AndroidManifest.xml" in entries and "classes.dex" in entries
              and "resources.arsc" in entries)
        check("it is debug-signed, so a phone will install it",
              any(name.startswith("META-INF/") and name.endswith((".RSA", ".DSA", ".EC"))
                  for name in entries))

        # The staleness guard. Capacitor copies webDir verbatim into assets/public with no
        # minifying step, so these are byte comparisons rather than size ones -- a one-word
        # change to a Persian string moves no byte count but does change the digest.
        drifted, absent = [], []
        for source in sorted(p for p in (ROOT / "web").iterdir() if p.is_file()):
            packed = f"assets/public/{source.name}"
            if packed not in entries:
                absent.append(source.name)
            elif apk.read(packed) != source.read_bytes():
                drifted.append(source.name)
        check(f"every one of the {len(list((ROOT / 'web').iterdir()))} files in web/ is inside it",
              not absent)
        if absent:
            print(f"        packaged from an older web/, missing: {', '.join(absent)}")
        check("and each is byte-identical, so the APK is not stale",
              not drifted)
        if drifted:
            print(f"        web/ has moved on since this APK was built: {', '.join(drifted)}")
            print("        rebuild it: powershell -ExecutionPolicy Bypass -File build-apk.ps1")

print("\n[14] The workflows that build it, and the link that has to keep resolving")
# .github/ is not covered by any other suite, and a broken workflow is invisible until a
# release goes out with no APK attached to it.
WORKFLOWS = ROOT / ".github" / "workflows"
apk_yml = WORKFLOWS / "apk.yml"
tests_yml = WORKFLOWS / "tests.yml"
check("the APK workflow exists", apk_yml.is_file())
check("the test workflow exists", tests_yml.is_file())

if apk_yml.is_file() and tests_yml.is_file():
    for path in (apk_yml, tests_yml):
        raw = path.read_bytes()
        # YAML forbids a tab as indentation outright, and an editor that expands nothing is
        # the usual way one arrives. GitHub rejects the whole file, so the workflow simply
        # never runs -- there is no failing build to notice.
        check(f"{path.name} indents with spaces, never a tab", b"\t" not in raw)
        ascii_only = all(byte < 127 for byte in raw)
        check(f"{path.name} is pure ASCII, like every other script here", ascii_only)
        # decode("ascii") on a file that just failed that check raises, which would end the
        # suite here and hide checks [14] onwards behind a traceback. errors="replace" keeps
        # the one failure reported as a failure.
        text = raw.decode("ascii", errors="replace")
        roots = [line.split(":")[0] for line in text.splitlines()
                 if line and not line.startswith((" ", "#")) and ":" in line]
        check(f"{path.name} declares a trigger and a job at the top level",
              "on" in roots and "jobs" in roots and "name" in roots)

    apk_text = apk_yml.read_text(encoding="ascii", errors="replace")

    # The reason this check is here rather than in a comment: Gradle 8.2.1, which Capacitor 6
    # pins, knows Java only up to 20. Bumping this to 21 to be current is a natural thing to
    # do and it breaks the build minutes in, with a class-file version number for an error.
    java = re.search(r"java-version:\s*'?(\d+)'?", apk_text)
    check("it asks for a JDK at all", java is not None)
    check("and that JDK is 17-20, the only range Gradle 8.2.1 accepts",
          java is not None and 17 <= int(java.group(1)) <= 20)

    check("it builds on a tag, which is what makes a release produce an APK",
          re.search(r"tags:\s*\[\s*'v\*'\s*\]", apk_text) is not None)
    # Same trap as check [5], one layer out: cap add writes Capacitor's template logo, and
    # only the copier puts ours back. A workflow that calls gradlew directly would publish
    # an APK with a stranger's icon and no error anywhere.
    check("it runs android:init, so the launcher icons cannot be skipped",
          "npm run android:init" in apk_text)
    check("it grants itself no more than the write it needs to attach the file",
          "contents: write" in apk_text and "packages:" not in apk_text)

    # The invariant that ties this section to the README. The permanent download URL is
    # /releases/latest/download/<asset name>, which resolves only if every release spells the
    # asset exactly that way -- and if it stops resolving, the page still looks fine and the
    # link 404s. Three places, one name.
    check(f"the workflow publishes it as {APK_NAME}", APK_NAME in apk_text)
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    permalink = f"/releases/latest/download/{APK_NAME}"
    check("README's direct download link uses that same name",
          permalink in readme)
    check("and points at this repository, not a fork or a placeholder",
          f"github.com/weederace/x-follow-analyzer{permalink}" in readme)

print(f"\n{'=' * 52}\n  {ok} passed, {fail} failed\n{'=' * 52}")
sys.exit(1 if fail else 0)