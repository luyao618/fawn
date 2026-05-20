#!/usr/bin/env python3
"""Generate LV-monogram-style icon + splash assets for Fawn.

Output:
  assets/fawn-icon.png                 (1024x1024, square)
  assets/fawn-adaptive-foreground.png  (432x432, transparent, deer only on transparent bg)
  assets/fawn-adaptive-background.png  (432x432, the monogram pattern only)
  assets/fawn-splash.png               (1242x2436, splash with pattern + deer)
  assets/fawn-monochrome.png           (432x432, monochrome deer for Android themed icon)

We keep the existing deer silhouette (fawn-adaptive-foreground.png from the previous
PR — same antler shape) and recolor its strokes to gold. Background becomes a
deep brown with a cream symmetrical monogram-style pattern (quatrefoils +
4-petal stars), inspired by LV monogram canvas.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# ---- palette ---------------------------------------------------------------
DEEP_BROWN = (58, 36, 21, 255)          # #3A2415  background
CREAM      = (224, 200, 158, 255)       # #E0C89E  monogram motif
CREAM_SOFT = (224, 200, 158, 110)       # softer overlay for subtle layer
GOLD       = (212, 168, 80, 255)        # #D4A850  deer strokes
GOLD_HI    = (240, 205, 120, 255)       # highlight gold


# ---- monogram tile ---------------------------------------------------------
def draw_quatrefoil(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float,
                    color):
    """A 4-lobed LV-style flower made from 4 circles + a center disk."""
    # 4 outer petals
    for ang in (0, 90, 180, 270):
        ox = cx + math.cos(math.radians(ang)) * r * 0.55
        oy = cy + math.sin(math.radians(ang)) * r * 0.55
        draw.ellipse((ox - r * 0.42, oy - r * 0.42,
                      ox + r * 0.42, oy + r * 0.42), fill=color)
    # center cap
    draw.ellipse((cx - r * 0.30, cy - r * 0.30,
                  cx + r * 0.30, cy + r * 0.30), fill=DEEP_BROWN)
    draw.ellipse((cx - r * 0.15, cy - r * 0.15,
                  cx + r * 0.15, cy + r * 0.15), fill=color)


def draw_four_point_star(draw: ImageDraw.ImageDraw, cx: float, cy: float,
                         r: float, color):
    """A simple 4-point star / diamond cross motif."""
    pts_long = r
    pts_short = r * 0.32
    poly = [
        (cx, cy - pts_long),
        (cx + pts_short, cy - pts_short),
        (cx + pts_long, cy),
        (cx + pts_short, cy + pts_short),
        (cx, cy + pts_long),
        (cx - pts_short, cy + pts_short),
        (cx - pts_long, cy),
        (cx - pts_short, cy - pts_short),
    ]
    draw.polygon(poly, fill=color)
    draw.ellipse((cx - r * 0.18, cy - r * 0.18,
                  cx + r * 0.18, cy + r * 0.18), fill=DEEP_BROWN)


def draw_fleur_dot(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float,
                   color):
    """Small dotted cross filler between main motifs."""
    s = r * 0.55
    for dx, dy in ((0, -s), (s, 0), (0, s), (-s, 0)):
        draw.ellipse((cx + dx - r * 0.18, cy + dy - r * 0.18,
                      cx + dx + r * 0.18, cy + dy + r * 0.18), fill=color)
    draw.ellipse((cx - r * 0.22, cy - r * 0.22,
                  cx + r * 0.22, cy + r * 0.22), fill=color)


def make_monogram(size: int) -> Image.Image:
    """Render LV-monogram-style background at given square size."""
    img = Image.new("RGBA", (size, size), DEEP_BROWN)
    draw = ImageDraw.Draw(img)

    # Tile geometry: two staggered grids of motifs.
    # tile = one cell holding (quatrefoil, star, fleur) at offsets.
    step = size / 6.0           # ~6 motifs across
    motif_r = step * 0.38

    # quatrefoils on integer grid
    rows = int(size / step) + 2
    cols = int(size / step) + 2
    for r in range(-1, rows):
        for c in range(-1, cols):
            cx = c * step + step / 2
            cy = r * step + step / 2
            # alternate by parity for visual rhythm
            if (r + c) % 2 == 0:
                draw_quatrefoil(draw, cx, cy, motif_r, CREAM)
            else:
                draw_four_point_star(draw, cx, cy, motif_r * 0.85, CREAM)

    # fleur dots offset by half a tile (staggered)
    for r in range(-1, rows + 1):
        for c in range(-1, cols + 1):
            cx = c * step
            cy = r * step
            draw_fleur_dot(draw, cx, cy, motif_r * 0.45, CREAM)

    # Subtle soft vignette to add depth (darker at the corners)
    vignette = Image.new("L", (size, size), 0)
    vd = ImageDraw.Draw(vignette)
    max_r = size * 0.75
    for i in range(60, 0, -1):
        alpha = int(140 * (i / 60) ** 2)
        rr = max_r + (60 - i) * (size / 60)
        vd.ellipse((size / 2 - rr, size / 2 - rr,
                    size / 2 + rr, size / 2 + rr),
                   outline=alpha, width=2)
    vignette = vignette.filter(ImageFilter.GaussianBlur(size * 0.06))
    dark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dark.putalpha(vignette)
    img = Image.alpha_composite(img, dark)

    return img


# ---- deer recoloring -------------------------------------------------------
_DEER_MASK_CACHE: Image.Image | None = None


def load_deer_mask() -> Image.Image:
    """Return an alpha mask of the deer strokes.

    Prefer a transparent-background source. If the source PNG has an opaque
    white background with brown strokes (as on the PR branch), derive the
    mask from pixel darkness instead. The mask returned is "L"-mode, where
    255 = deer stroke and 0 = empty.

    Cached on first call so we are not affected when we later overwrite the
    foreground asset on disk.
    """
    global _DEER_MASK_CACHE
    if _DEER_MASK_CACHE is not None:
        return _DEER_MASK_CACHE
    p = ASSETS / "fawn-adaptive-foreground.png"
    src = Image.open(p).convert("RGBA")
    r, g, b, a = src.split()
    # If alpha varies (transparent bg), use it directly.
    a_min, a_max = a.getextrema()
    if a_max - a_min > 32:
        mask = a.copy()
    else:
        # Opaque background — strokes are dark. Build mask = 255 - luminance.
        lum = Image.merge("RGB", (r, g, b)).convert("L")
        mask = lum.point(lambda v: 255 - v)
        # Mild threshold so faint anti-alias halos don't bleed
        mask = mask.point(lambda v: 0 if v < 40 else min(255, int((v - 40) * 1.35)))
    _DEER_MASK_CACHE = mask
    return mask


def gold_deer(size: int, padding_ratio: float = 0.20) -> Image.Image:
    """Return a `size x size` RGBA layer with the deer rendered in gold,
    centred with `padding_ratio` margin on each side."""
    mask = load_deer_mask()
    inner = int(size * (1 - 2 * padding_ratio))
    scaled = mask.resize((inner, inner), Image.LANCZOS)

    # Slight outer-glow halo so the gold reads on the busy background
    glow_src = scaled.point(lambda v: min(255, int(v * 0.9)))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    glow.paste((10, 5, 0, 0), (off, off), glow_src)  # noop colour; need fill
    # use a darker brown halo to ground the gold
    halo_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    halo_alpha = Image.new("L", (size, size), 0)
    halo_alpha.paste(scaled, (off, off))
    halo_alpha = halo_alpha.filter(ImageFilter.GaussianBlur(size * 0.012))
    halo_rgb = Image.new("RGBA", (size, size), (20, 10, 4, 255))
    halo_rgb.putalpha(halo_alpha.point(lambda v: int(v * 0.55)))

    # Gold strokes
    gold_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gold_rgb = Image.new("RGBA", (size, size), GOLD)
    gold_rgb.putalpha(0)
    gold_alpha = Image.new("L", (size, size), 0)
    gold_alpha.paste(scaled, (off, off))
    gold_rgb.putalpha(gold_alpha)

    # Add a subtle highlight on the upper half (vertical gradient over alpha)
    hi = Image.new("L", (size, size), 0)
    hd = ImageDraw.Draw(hi)
    for y in range(size):
        v = int(110 * max(0.0, 1.0 - y / (size * 0.65)))
        hd.line([(0, y), (size, y)], fill=v)
    # constrain highlight to the deer area
    hi_masked = Image.new("L", (size, size), 0)
    hi_masked.paste(hi, (0, 0), gold_alpha)

    highlight_layer = Image.new("RGBA", (size, size), GOLD_HI)
    highlight_layer.putalpha(hi_masked)

    out = halo_rgb
    out = Image.alpha_composite(out, gold_rgb)
    out = Image.alpha_composite(out, highlight_layer)
    return out


# ---- composers -------------------------------------------------------------
def build_icon(size: int = 1024) -> Image.Image:
    bg = make_monogram(size)
    deer = gold_deer(size, padding_ratio=0.20)
    return Image.alpha_composite(bg, deer)


def build_adaptive_foreground(size: int = 432) -> Image.Image:
    """Adaptive icon foreground: pattern + deer composed, leaving 18% safe
    inset within the 432px canvas (Android masks 33% off each edge).

    We bake pattern + deer into the foreground so the launcher's mask alone
    reveals the design; background colour fallback stays deep brown.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Inner disc area where adaptive icons are safe (~66% of 108dp).
    inner = int(size * 0.92)  # leave a hair of transparent border for masks
    inner_img = build_icon(inner)
    off = (size - inner) // 2
    canvas.paste(inner_img, (off, off), inner_img)
    return canvas


def build_adaptive_background(size: int = 432) -> Image.Image:
    """Solid deep brown background plate for adaptive icon. (Pattern is baked
    into the foreground so it lines up under any mask.)"""
    return Image.new("RGBA", (size, size), DEEP_BROWN)


def build_splash(width: int = 1242, height: int = 2436) -> Image.Image:
    """Phone-sized splash: same monogram canvas, deer centred and a touch
    larger; tiny breathing room around so it does not feel cramped."""
    # Background pattern square then tiled / scaled to fill
    sq = max(width, height)
    bg = make_monogram(sq)
    # Center-crop / pad onto target canvas
    canvas = Image.new("RGBA", (width, height), DEEP_BROWN)
    bx = (width - sq) // 2
    by = (height - sq) // 2
    canvas.paste(bg, (bx, by), bg)

    # Deer overlay (about 55% of the shorter side)
    deer_size = int(min(width, height) * 0.55)
    deer = gold_deer(deer_size, padding_ratio=0.0)
    dx = (width - deer_size) // 2
    dy = (height - deer_size) // 2
    canvas.alpha_composite(deer, (dx, dy))
    return canvas


def build_monochrome(size: int = 432) -> Image.Image:
    """White silhouette of the deer on transparent, for Android themed icon."""
    mask = load_deer_mask().resize((int(size * 0.62), int(size * 0.62)),
                                   Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    a = Image.new("L", (size, size), 0)
    off = (size - mask.width) // 2
    a.paste(mask, (off, off))
    layer.putalpha(a)
    return Image.alpha_composite(out, layer)


# ---- previews --------------------------------------------------------------
def round_preview(icon: Image.Image, out: Path):
    s = icon.size[0]
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s, s), fill=255)
    rp = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    rp.paste(icon, (0, 0), mask)
    rp.save(out)


# ---- main ------------------------------------------------------------------
def main():
    print(f"writing assets into {ASSETS}")
    icon = build_icon(1024)
    icon.save(ASSETS / "fawn-icon.png", optimize=True)

    fg = build_adaptive_foreground(432)
    fg.save(ASSETS / "fawn-adaptive-foreground.png", optimize=True)

    bg = build_adaptive_background(432)
    bg.save(ASSETS / "fawn-adaptive-background.png", optimize=True)

    splash = build_splash(1242, 2436)
    splash.save(ASSETS / "fawn-splash.png", optimize=True)

    mono = build_monochrome(432)
    mono.save(ASSETS / "fawn-monochrome.png", optimize=True)

    # previews (for issue comment, low-res so we can read them back)
    previews = ROOT / "scripts" / "_preview"
    previews.mkdir(exist_ok=True)
    icon.resize((256, 256), Image.LANCZOS).save(previews / "icon-256.png")
    round_preview(icon.resize((256, 256), Image.LANCZOS),
                  previews / "icon-round-256.png")
    splash.resize((360, 720), Image.LANCZOS).save(previews / "splash-360.png")
    print("done")


if __name__ == "__main__":
    main()
