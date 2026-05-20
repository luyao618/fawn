#!/usr/bin/env python3
"""Generate icon + splash assets for Fawn: plain brown background, gold deer.

The deer silhouette source is a committed, read-only asset at
``mobile/assets/sources/fawn-deer-source.png``. This script only reads from
that path and writes its outputs to disjoint paths under ``mobile/assets/``,
so re-running it from committed inputs produces byte-stable artifacts.

Output:
  assets/fawn-icon.png                 (1024x1024, square legacy icon)
  assets/fawn-adaptive-foreground.png  (432x432, gold deer on transparent)
  assets/fawn-adaptive-background.png  (432x432, solid brown plate)
  assets/fawn-splash.png               (1242x2436, brown + centred gold deer)
  assets/fawn-monochrome.png           (432x432, silhouette for themed icon)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCES = ASSETS / "sources"
DEER_SOURCE = SOURCES / "fawn-deer-source.png"

# ---- palette ---------------------------------------------------------------
BROWN      = (107, 62, 31, 255)         # #6B3E1F  background
GOLD       = (212, 168, 80, 255)        # #D4A850  deer strokes
GOLD_HI    = (240, 205, 120, 255)       # highlight gold


# ---- deer mask -------------------------------------------------------------
_DEER_MASK_CACHE: Image.Image | None = None


def load_deer_mask() -> Image.Image:
    """Return the deer alpha mask from the committed read-only source asset.

    ``assets/sources/fawn-deer-source.png`` is the canonical input. The
    script never writes to that path, so producing outputs cannot mutate
    the source — re-running the generator from committed inputs yields
    byte-stable artifacts.
    """
    global _DEER_MASK_CACHE
    if _DEER_MASK_CACHE is not None:
        return _DEER_MASK_CACHE

    if not DEER_SOURCE.exists():
        raise FileNotFoundError(
            f"Missing deer source asset: {DEER_SOURCE}. "
            "Commit the source PNG before running this generator."
        )

    src = Image.open(DEER_SOURCE).convert("RGBA")
    r, g, b, a = src.split()
    a_min, a_max = a.getextrema()
    if a_max - a_min > 32:
        mask = a.copy()
    else:
        # Opaque-background fallback: derive from dark strokes.
        lum = Image.merge("RGB", (r, g, b)).convert("L")
        mask = lum.point(lambda v: 255 - v)
        mask = mask.point(lambda v: 0 if v < 40 else min(255, int((v - 40) * 1.35)))
    _DEER_MASK_CACHE = mask
    return mask


def gold_deer(size: int, padding_ratio: float = 0.18) -> Image.Image:
    """Return a `size x size` RGBA layer with the deer rendered in gold,
    centred with `padding_ratio` margin on each side."""
    mask = load_deer_mask()
    inner = int(size * (1 - 2 * padding_ratio))
    scaled = mask.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2

    # 1) Soft halo behind the strokes so the gold reads cleanly on brown.
    halo_alpha = Image.new("L", (size, size), 0)
    halo_alpha.paste(scaled, (off, off))
    halo_alpha = halo_alpha.filter(ImageFilter.GaussianBlur(size * 0.010))
    halo_alpha = halo_alpha.point(lambda v: int(v * 0.35))
    halo_layer = Image.new("RGBA", (size, size), (30, 16, 6, 255))
    halo_layer.putalpha(halo_alpha)

    # 2) Solid gold strokes.
    gold_alpha = Image.new("L", (size, size), 0)
    gold_alpha.paste(scaled, (off, off))
    gold_layer = Image.new("RGBA", (size, size), GOLD)
    gold_layer.putalpha(gold_alpha)

    # 3) Top highlight on upper half of the deer for a subtle metallic feel.
    hi = Image.new("L", (size, size), 0)
    hd = ImageDraw.Draw(hi)
    for y in range(size):
        v = int(110 * max(0.0, 1.0 - y / (size * 0.65)))
        hd.line([(0, y), (size, y)], fill=v)
    hi_masked = Image.new("L", (size, size), 0)
    hi_masked.paste(hi, (0, 0), gold_alpha)
    highlight_layer = Image.new("RGBA", (size, size), GOLD_HI)
    highlight_layer.putalpha(hi_masked)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out = Image.alpha_composite(out, halo_layer)
    out = Image.alpha_composite(out, gold_layer)
    out = Image.alpha_composite(out, highlight_layer)
    return out


# ---- composers -------------------------------------------------------------
def build_icon(size: int = 1024) -> Image.Image:
    bg = Image.new("RGBA", (size, size), BROWN)
    deer = gold_deer(size, padding_ratio=0.18)
    return Image.alpha_composite(bg, deer)


def build_adaptive_foreground(size: int = 432) -> Image.Image:
    """Adaptive foreground: gold deer only on transparent, sized for the
    Android adaptive-icon safe zone (~66% of 108dp)."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    deer = gold_deer(size, padding_ratio=0.22)
    canvas = Image.alpha_composite(canvas, deer)
    return canvas


def build_adaptive_background(size: int = 432) -> Image.Image:
    return Image.new("RGBA", (size, size), BROWN)


def build_splash(width: int = 1242, height: int = 2436) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), BROWN)
    deer_size = int(min(width, height) * 0.55)
    deer = gold_deer(deer_size, padding_ratio=0.0)
    dx = (width - deer_size) // 2
    dy = (height - deer_size) // 2
    canvas.alpha_composite(deer, (dx, dy))
    return canvas


def build_monochrome(size: int = 432) -> Image.Image:
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
    print(f"reading source from {DEER_SOURCE}")
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

    previews = ROOT / "scripts" / "_preview"
    previews.mkdir(exist_ok=True)
    icon.resize((256, 256), Image.LANCZOS).save(previews / "icon-256.png")
    round_preview(icon.resize((256, 256), Image.LANCZOS),
                  previews / "icon-round-256.png")
    splash.resize((360, 720), Image.LANCZOS).save(previews / "splash-360.png")
    print("done")


if __name__ == "__main__":
    main()
