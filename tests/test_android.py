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
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android-res"

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


def css_colour(name):
    found = re.search(rf"--{name}:\s*#([0-9A-Fa-f]{{6}})", CSS)
    if not found:
        raise AssertionError(f"--{name} is not in web/app.css any more")
    value = found.group(1)
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


DESK = css_colour("desk")
CARD = css_colour("card")
STAMP = css_colour("stamp")

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
check("it opens on the same colour as the app", "#%02X%02X%02X" % DESK in splash.upper())
for reference in re.findall(r'@(mipmap|drawable|color)/(\w+)', splash):
    kind, name = reference
    if kind == "mipmap":
        exists = all((RES / f"mipmap-{d}" / f"{name}.png").exists() for d in DENSITIES)
        check(f"@mipmap/{name} exists at every density", exists)

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
check("dist/ is ignored", "dist/" in rules)
check("built APKs are ignored", "*.apk" in rules)
check("signing secrets are ignored", "keystore.properties" in rules and "*.jks" in rules)
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
    check(f"git would carry all {len(on_disk)} icon files into a clone",
          len(listed) == len(on_disk) and len(on_disk) == 17)
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

print(f"\n{'=' * 52}\n  {ok} passed, {fail} failed\n{'=' * 52}")
sys.exit(1 if fail else 0)
