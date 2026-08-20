#!/usr/bin/env python3
"""
make_android_icons.py — draws the Android launcher icons from web/icon.svg's geometry.

Why the numbers are duplicated here instead of the SVG being rasterised: turning an SVG
into a PNG needs a real renderer (librsvg, cairosvg, Inkscape), none of which most people
have, and this project's rule is that it runs with what is already installed. The one
renderer that *was* available — ImageMagick's internal MSVG fallback — drew both rotated
groups in the wrong place and dropped fill-opacity entirely. It produced a file, silently,
that happened to be wrong; only looking at it caught that. So the geometry lives here as
plain numbers, copied from web/icon.svg, and Pillow draws it.

Run this only when web/icon.svg changes:

    pip install pillow
    python tools/make_android_icons.py

It writes android-res/, which *is* tracked by git. The generated android/ folder is not,
so tools/apply-android-res.mjs copies these files in after every `cap sync` — otherwise
the APK ships Capacitor's default template logo, which is how this whole file came about.
"""

from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:                                     # pragma: no cover
    raise SystemExit("This tool needs Pillow:  pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "android-res"

# --------------------------------------------------------------------------------------
# The drawing, in web/icon.svg's 64-unit coordinate space
# --------------------------------------------------------------------------------------
VIEW = 64
SS = 20                     # master is drawn at 64*SS and downsampled from there

# Straight out of web/app.css, so the icon cannot drift from the interface's palette.
DESK = (0xBA, 0xC5, 0xBF)   # --desk   the desk surface, and the adaptive-icon background
CARD = (0xFC, 0xFB, 0xF7)   # --card   bond paper
INK = (0x17, 0x1C, 0x1A)    # --ink
PINE = (0x1F, 0x4E, 0x46)   # --pine
STAMP = (0x9E, 0x33, 0x24)  # --stamp  the only saturated colour in the whole app

CARD_BOX = (13, 14, 51, 54)         # x13 y14 w38 h40
CARD_R = 2
CARD_TILT = -3, (32, 34)            # SVG rotate(-3 32 34)
BARS = (                            # heading, then two lines of body text
    ((19, 21, 36, 24), 1.5, PINE, 255),
    ((19, 28, 45, 30), 1.0, INK, 46),       # fill-opacity 0.18 -> 46/255
    ((19, 33, 39, 35), 1.0, INK, 46),
)
STAMP_BOX = (24, 35, 52, 48)        # x24 y35 w28 h13, stroked not filled
STAMP_R = 2
STAMP_W = 2.5
CHECK = ((29, 41.6), (32.4, 45.0), (38.6, 38.0))    # M29 41.6 l3.4 3.4 l6.2 -7
STAMP_TILT = -11, (38, 42)          # SVG rotate(-11 38 42): landing harder than the card


def u(value):
    """A drawing unit in master pixels."""
    return value * SS


def blank():
    return Image.new("RGBA", (VIEW * SS, VIEW * SS), (0, 0, 0, 0))


def paint(fn):
    """One layer, one paint operation.

    ImageDraw writes pixels rather than compositing them, so a 18%-opacity bar drawn
    straight onto the card would *replace* the paper underneath and end up blended with
    the desk instead. One layer per paint op and alpha_composite between them is SVG's
    painter's model, exactly.
    """
    layer = blank()
    fn(ImageDraw.Draw(layer))
    return layer


def over(*layers):
    out = layers[0]
    for layer in layers[1:]:
        out = Image.alpha_composite(out, layer)
    return out


def rounded(draw, box, radius, **kw):
    draw.rounded_rectangle([u(box[0]), u(box[1]), u(box[2]), u(box[3])],
                           radius=u(radius), **kw)


def turn(layer, tilt):
    """SVG rotate(a cx cy). SVG turns clockwise, Pillow anticlockwise, hence the sign."""
    angle, (cx, cy) = tilt
    return layer.rotate(-angle, resample=Image.Resampling.BICUBIC, center=(u(cx), u(cy)))


def draw_card():
    layers = [
        paint(lambda d: rounded(d, CARD_BOX, CARD_R, fill=CARD + (255,))),
        # A 1-unit stroke centred on the edge, so the box grows by half a unit each way
        # and the border is drawn inward from there.
        paint(lambda d: rounded(d, (CARD_BOX[0] - 0.5, CARD_BOX[1] - 0.5,
                                    CARD_BOX[2] + 0.5, CARD_BOX[3] + 0.5),
                                CARD_R + 0.5, outline=INK + (41,), width=round(u(1)))),
    ]
    for box, radius, rgb, alpha in BARS:
        layers.append(paint(lambda d, b=box, r=radius, c=rgb + (alpha,):
                            rounded(d, b, r, fill=c)))
    return turn(over(*layers), CARD_TILT)


def draw_stamp():
    width = round(u(STAMP_W))

    def go(d):
        half = STAMP_W / 2
        rounded(d, (STAMP_BOX[0] - half, STAMP_BOX[1] - half,
                    STAMP_BOX[2] + half, STAMP_BOX[3] + half),
                STAMP_R + half, outline=STAMP + (255,), width=width)
        d.line([(u(x), u(y)) for x, y in CHECK],
               fill=STAMP + (255,), width=width, joint="curve")
        for x, y in (CHECK[0], CHECK[-1]):      # stroke-linecap="round"
            d.ellipse([u(x) - width / 2, u(y) - width / 2,
                       u(x) + width / 2, u(y) + width / 2], fill=STAMP + (255,))

    return turn(paint(go), STAMP_TILT)


# The card and the stamp with nothing behind them: this is the adaptive foreground, and
# on the splash screen it sits on the same desk colour the app opens with.
MARK = over(draw_card(), draw_stamp())
GROUND = paint(lambda d: rounded(d, (0, 0, VIEW, VIEW), 10, fill=DESK + (255,)))
FULL = over(GROUND, MARK)


# --------------------------------------------------------------------------------------
# Android's five densities
# --------------------------------------------------------------------------------------
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
LEGACY_DP = 48          # pre-Oreo launcher icon
ADAPTIVE_DP = 108       # Oreo and later: 108dp canvas, only the middle is guaranteed
KEYLINE_DP = 66         # Google's square keyline inside that canvas


def down(image, size):
    return image.resize((size, size), Image.Resampling.LANCZOS)


def circle_mask(size):
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def content_box(image):
    """The mark's true extent, ignoring the faint ringing bicubic rotation leaves behind."""
    alpha = image.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    return alpha.getbbox()


def adaptive_foreground(size):
    """The mark, scaled to the square keyline and centred on a transparent 108dp canvas.

    Launchers mask this to a circle, a squircle, a rounded square or a teardrop, and only
    the middle 72dp of the 108dp canvas survives all of them. Google's keyline for a
    square-ish mark is 66dp, which is what this fits it to — the card is a rounded
    rectangle, so the little the circular mask takes off its corners does not read as
    damage.
    """
    crop = MARK.crop(content_box(MARK))
    target = round(size * KEYLINE_DP / ADAPTIVE_DP)
    scale = target / max(crop.size)
    art = crop.resize((max(1, round(crop.width * scale)),
                       max(1, round(crop.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return canvas


def write(image, *parts):
    path = OUT.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  {image.width}x{image.height}")


print("android-res/")
for name, factor in DENSITIES.items():
    legacy = round(LEGACY_DP * factor)
    write(down(FULL, legacy), f"mipmap-{name}", "ic_launcher.png")

    circular = down(FULL, legacy).copy()
    circular.putalpha(circle_mask(legacy))      # the inscribed circle, well clear of the card
    write(circular, f"mipmap-{name}", "ic_launcher_round.png")

    write(adaptive_foreground(round(ADAPTIVE_DP * factor)),
          f"mipmap-{name}", "ic_launcher_foreground.png")

hexed = "#%02X%02X%02X" % DESK
(OUT / "values").mkdir(parents=True, exist_ok=True)
(OUT / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<!-- The adaptive icon's background, and the desk colour the app itself opens with.\n"
    "     Capacitor's template leaves this #FFFFFF, which would put the mark on a white\n"
    "     square that matches nothing in the interface. Generated by\n"
    "     tools/make_android_icons.py from --desk in web/app.css. -->\n"
    "<resources>\n"
    f'    <color name="ic_launcher_background">{hexed}</color>\n'
    "</resources>\n", encoding="utf-8")
print(f"  android-res/values/ic_launcher_background.xml  {hexed}")

(OUT / "drawable").mkdir(parents=True, exist_ok=True)
(OUT / "drawable" / "splash.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<!-- The launch screen, referenced by AppTheme.NoActionBarLaunch in values/styles.xml.\n"
    "     Capacitor ships eleven splash.png files, one per density and orientation, each\n"
    "     stretched to fill the window and each carrying its own template logo. A layer-list\n"
    "     is one file, is never stretched, and reuses the icon's foreground — so the launch\n"
    "     is the desk colour with the mark centred on it, and the WebView opening on the\n"
    "     same colour is invisible rather than a flash.\n"
    "     tools/apply-android-res.mjs deletes those PNGs, because a bitmap variant of the\n"
    "     same resource name would win on whichever density it matched. -->\n"
    "<layer-list xmlns:android=\"http://schemas.android.com/apk/res/android\">\n"
    f'    <item><color android:color="{hexed}"/></item>\n'
    "    <item>\n"
    '        <bitmap android:src="@mipmap/ic_launcher_foreground"\n'
    '                android:gravity="center"/>\n'
    "    </item>\n"
    "</layer-list>\n", encoding="utf-8")
print("  android-res/drawable/splash.xml")

# A sheet to look at, because an icon that is wrong is only ever wrong to the eye.
sheet_bg = (0x8F, 0x9C, 0x96, 255)
sheet = Image.new("RGBA", (192 * 3 + 48 * 4, 192 + 96), sheet_bg)
legacy = down(FULL, 192)
rounds = down(FULL, 192).copy()
rounds.putalpha(circle_mask(192))
squircle = adaptive_foreground(288)                     # masked the way a Pixel would
mask = Image.new("L", (288 * 4, 288 * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 288 * 4 - 1, 288 * 4 - 1],
                                       radius=288 * 4 * 0.28, fill=255)
oreo = Image.alpha_composite(
    Image.new("RGBA", (288, 288), DESK + (255,)), squircle)
oreo.putalpha(mask.resize((288, 288), Image.Resampling.LANCZOS))
oreo = down(oreo, 192)
for i, tile in enumerate((legacy, rounds, oreo)):
    sheet.paste(tile, (48 + i * (192 + 48), 48), tile)
ImageDraw.Draw(sheet).text((48, 192 + 62), "legacy            round             adaptive",
                           fill=(0x17, 0x1C, 0x1A, 255))
sheet.convert("RGB").save(ROOT / "tools" / "icon-preview.png", "PNG", optimize=True)
print("  tools/icon-preview.png  (not an Android resource; just something to look at)")
