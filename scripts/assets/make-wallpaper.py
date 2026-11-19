"""Draws the background of the screenshots of the catalog: soft glows of
colour on a deep blue, original and free of any licence of others.

Usage: python3 make-wallpaper.py OUT.jpg [WIDTH HEIGHT]
"""
import sys

import numpy as np
from PIL import Image

out = sys.argv[1]
w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (3200, 2000)
y, x = np.mgrid[0:h, 0:w].astype(np.float32)
x /= w
y /= h

# A deep night blue that turns violet towards the bottom right.
base = np.array([18, 20, 46], np.float32)
corner = np.array([46, 22, 70], np.float32)
t = np.clip((x + y) / 2, 0, 1)[..., None]
img = base * (1 - t) + corner * t

# Glows: centre, radius (fraction of the width), colour, strength.
glows = [
    ((0.18, 0.22), 0.42, (64, 120, 255), 0.85),
    ((0.82, 0.18), 0.36, (255, 96, 160), 0.70),
    ((0.70, 0.85), 0.45, (120, 70, 255), 0.75),
    ((0.10, 0.92), 0.30, (40, 200, 210), 0.55),
    ((0.50, 0.50), 0.55, (90, 60, 200), 0.30),
]
aspect = h / w
for (cx, cy), r, colour, strength in glows:
    d2 = ((x - cx) ** 2 + ((y - cy) * aspect) ** 2) / (r * r)
    a = (np.exp(-d2 * 2.2) * strength)[..., None]
    img = img * (1 - a) + np.array(colour, np.float32) * a

# A little grain, so the gradients do not band.
rng = np.random.default_rng(7)
img += rng.normal(0, 1.6, img.shape).astype(np.float32)
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(out, quality=92, optimize=True)
