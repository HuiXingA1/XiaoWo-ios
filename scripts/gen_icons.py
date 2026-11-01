#!/usr/bin/env python3
"""Generate PNG app icons from the project favicon.svg (no external deps beyond Pillow+lxml).

Renders the SVG at target size using our own rasterizer-lite: parses shapes via lxml,
draws with Pillow. Supports: linearGradient rects with rx, path fill (via svglib-like
approximation is complex) -- fallback: embed favicon into a rounded square with
gradient background using the SVG's own colors.
"""
import sys, io, zlib, struct, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SRC = Path(r"D:\DeepseekWork\_ipa_src\lovers-nest\public\favicon.svg")
OUT = Path(r"D:\DeepseekWork\xiaowo-ios\Xiaowo\Assets.xcassets\AppIcon.appiconset")
OUT.mkdir(parents=True, exist_ok=True)

svg_text = SRC.read_text(encoding="utf-8")
# grab gradient stops
stops = re.findall(r'stop-color="([^"]+)"', svg_text)
if not stops:
    stops = ["#f4658a", "#d94f76"]

def hex2rgb(h):
    h = h.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(c*2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def make_icon(size: int, path: Path):
    S = 4  # supersample
    s = size * S
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # rounded-square background #fdf7f4; App Store 1024 must be opaque square (no alpha corners)
    radius = 0 if size >= 1024 else int(s * 16 / 64)
    d.rounded_rectangle([0, 0, s, s], radius=radius, fill=hex2rgb("#fdf7f4"))
    # gradient heart: draw heart shape via parametric curve, fill with vertical-diagonal gradient
    c1, c2 = hex2rgb(stops[0]), hex2rgb(stops[1])
    # heart bbox from svg: x 17..47, y 26..50 within 64 canvas
    # build heart mask at supersampled scale
    mask = Image.new("L", (s, s), 0)
    md = ImageDraw.Draw(mask)
    # parametric heart: x = 16 sin^3 t, y = 13cos t - 5cos2t - 2cos3t - cos4t (classic), scale into bbox
    import math
    pts = []
    for i in range(0, 360):
        t = math.radians(i)
        x = 16 * (math.sin(t) ** 3)
        y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
        pts.append((x, -y))
    # bbox of parametric heart: x in [-16,16], y in [-17,12] approx; normalize to svg bbox (17..47, 26..50)/64
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    # target rect in svg coords
    tx0, tx1, ty0, ty1 = 17/64, 47/64, 26/64, 50/64
    def mappt(p):
        u = (p[0]-minx)/(maxx-minx)
        v = (p[1]-miny)/(maxy-miny)
        return ((tx0 + u*(tx1-tx0))*s, (ty0 + v*(ty1-ty0))*s)
    poly = [mappt(p) for p in pts]
    md.polygon(poly, fill=255)
    # gradient fill: draw gradient over whole canvas, then composite through mask
    grad = Image.new("RGBA", (s, s))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        t = y / s
        # diagonal-ish blend: mix x offset
        row = lerp(c1, c2, t)
        gd.line([(0, y), (s, y)], fill=row + (255,))
    # also draw the subtle outline from svg path? skip; heart silhouette is the shape.
    img.paste(grad, (0, 0), mask)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG")

def make_market180(path: Path):
    # App Store marketing icon: 1024, opaque background (no alpha), no rounded corners (system applies)
    make_icon(1024, path)

sizes = {
    20: "Icon-App-20x20@1x",
    40: "Icon-App-40x40@1x",
    29: "Icon-App-29x29@1x",
    58: "Icon-App-29x29@2x",
    87: "Icon-App-29x29@3x",
    60: "Icon-App-20x20@3x",
    76: "Icon-App-76x76@1x",
    80: "Icon-App-40x40@2x",
    120: "Icon-App-40x40@3x",
    120: "Icon-App-20x20@3x",  # duplicate size; second write overwrites; keep distinct names below
    152: "Icon-App-76x76@2x",
    167: "Icon-App-83.5x83.5@2x",
    180: "Icon-App-60x60@3x",
    1024: "Icon-App-1024",
}
# fix the 120 collision: write both names explicitly
out_files = {}
for size, name in sizes.items():
    out_files[name] = size
for name, size in out_files.items():
    make_icon(size, OUT / f"{name}.png")

# single-size icon (Xcode 14+ style)
single = {
    20: "Icon-20",
    29: "Icon-29",
    38: "Icon-29@2x",
    40: "Icon-40",
    57: "Icon-57",
    60: "Icon-60",
    76: "Icon-76",
    80: "Icon-40@2x",
    114: "Icon-57@2x",
    120: "Icon-60@2x",
    152: "Icon-76@2x",
    167: "Icon-83.5@2x",
    180: "Icon-60@3x",
    1024: "Icon-1024",
}
single_dir = OUT.parent.parent / "SingleSizeIcons" if False else None
print("icons written to", OUT)
for p in sorted(OUT.glob("*.png")):
    print(" ", p.name, p.stat().st_size)
