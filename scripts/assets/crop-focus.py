"""Turns a screenshot into a picture for the catalog (default 1600x1000).

Without --frame: crops a box around one feature in 16:10, at least the
output size in pixels of the screenshot (a small feature keeps the full
sharpness of the monitor and is never scaled up), and scales it to the output.

With --frame WALLPAPER: crops the feature box alone and lays it, with round
corners and a soft shadow, as large as fits onto the wallpaper. So a small
card in the settings still shows the feature big, on a calm background.

Usage: python3 crop-focus.py IN.png OUT.png X Y W H [PAD] [--frame WALLPAPER] [--radius R]
       (X Y W H, PAD and R in pixels of IN.png)
"""
import argparse

from PIL import Image, ImageDraw, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument("src")
parser.add_argument("dst")
parser.add_argument("box", nargs=4, type=float)
parser.add_argument("pad", nargs="?", type=float, default=0)
parser.add_argument("--frame")
parser.add_argument("--radius", type=float, default=52)
parser.add_argument("--size", nargs=2, type=int, default=(1600, 1000))
args = parser.parse_args()

img = Image.open(args.src).convert("RGB")
sw, sh = img.size
out_w, out_h = args.size
ratio = out_w / out_h
x, y, w, h = args.box
pad = args.pad


def clamp_box(left, top, width, height):
    left = min(max(left, 0), sw - width)
    top = min(max(top, 0), sh - height)
    return tuple(round(v) for v in (left, top, left + width, top + height))


if args.frame:
    # The feature and its padding, as it is.
    box = clamp_box(x - pad, y - pad, min(w + 2 * pad, sw), min(h + 2 * pad, sh))
    card = img.crop(box)
    cw, ch = card.size
    # As large as fits, with only a thin edge of the wallpaper around it.
    scale = min(out_w * 0.96 / cw, out_h * 0.94 / ch)
    card = card.resize((round(cw * scale), round(ch * scale)), Image.LANCZOS)
    cw, ch = card.size
    radius = round(args.radius * scale)
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), radius, fill=255)

    back = Image.open(args.frame).convert("RGB")
    # The wallpaper fills the picture, cut in its middle.
    bscale = max(out_w / back.width, out_h / back.height)
    back = back.resize((round(back.width * bscale), round(back.height * bscale)), Image.LANCZOS)
    bl, bt = (back.width - out_w) // 2, (back.height - out_h) // 2
    back = back.crop((bl, bt, bl + out_w, bt + out_h))

    left, top = (out_w - cw) // 2, (out_h - ch) // 2
    shadow = Image.new("L", (out_w, out_h), 0)
    offset = round(out_h * 0.008)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (left, top + offset, left + cw, top + ch + offset), radius, fill=150
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(out_h * 0.012))
    back.paste(Image.new("RGB", back.size, (0, 0, 0)), (0, 0), shadow)
    back.paste(card, (left, top), mask)
    back.save(args.dst, optimize=True)
else:
    cx, cy = x + w / 2, y + h / 2
    w, h = w + 2 * pad, h + 2 * pad
    # The shorter side grows to 16:10, then the box to at least the output
    # size, and at most the screen.
    if w / h < ratio:
        w = h * ratio
    else:
        h = w / ratio
    if w < out_w:
        w, h = float(out_w), float(out_h)
    if w > sw:
        w, h = float(sw), sw / ratio
    if h > sh:
        w, h = sh * ratio, float(sh)
    box = clamp_box(cx - w / 2, cy - h / 2, w, h)
    img.crop(box).resize((out_w, out_h), Image.LANCZOS).save(args.dst, optimize=True)
