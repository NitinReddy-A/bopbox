"""Generate Bopbox's launcher, adaptive, splash and favicon images.

The mark is a rounded play triangle with two concentric sound arcs, drawn in white on a soft
red gradient (iOS-style). Everything is drawn at 4x and downsampled for clean edges.

Run: python scripts/make-icons.py
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')

GRAD_TOP = (0xFF, 0x33, 0x55)
GRAD_BOTTOM = (0xE5, 0x00, 0x2B)
ACCENT = (0xFF, 0x00, 0x33)
WHITE = (255, 255, 255)

SS = 4  # supersampling factor

# Glyph geometry in "glyph units": the finished mark is GLYPH_W units wide.
TRI_H = 1.00          # outer height of the play triangle
TRI_W = 0.92          # outer width (tip to back edge)
TRI_R = 0.12          # corner radius of the triangle
STROKE = 0.13         # arc stroke width
GAP1 = 0.15           # gap between triangle tip and first arc (measured on the axis)
GAP2 = 0.12           # gap between the two arcs
ARC_CENTER = 0.26     # arc centre sits this far left of the triangle tip
ARC1_SWEEP = 43       # half-angle of the inner arc, degrees
ARC2_SWEEP = 42       # half-angle of the outer arc, degrees
OPTICAL_SHIFT = -0.02  # fraction of the glyph width to nudge the mark left after centring


def _rounded_polygon(pts, r, steps=32):
    """Outline of a convex polygon whose corners are rounded with radius r (outer size unchanged)."""
    (ax, ay), (bx, by), (cx, cy) = pts
    a = math.dist((bx, by), (cx, cy))
    b = math.dist((ax, ay), (cx, cy))
    c = math.dist((ax, ay), (bx, by))
    p = a + b + c
    ix, iy = (a * ax + b * bx + c * cx) / p, (a * ay + b * by + c * cy) / p
    s = p / 2
    inradius = math.sqrt(s * (s - a) * (s - b) * (s - c)) / s
    k = (inradius - r) / inradius
    inner = [(ix + (x - ix) * k, iy + (y - iy) * k) for x, y in pts]

    def normal(p0, p1):
        nx, ny = p1[1] - p0[1], -(p1[0] - p0[0])
        ln = math.hypot(nx, ny)
        nx, ny = nx / ln, ny / ln
        mx, my = (p0[0] + p1[0]) / 2 - ix, (p0[1] + p1[1]) / 2 - iy
        return (nx, ny) if nx * mx + ny * my > 0 else (-nx, -ny)

    n = len(inner)
    out = []
    for i, (vx, vy) in enumerate(inner):
        n_prev = normal(inner[i - 1], inner[i])
        n_next = normal(inner[i], inner[(i + 1) % n])
        a0, a1 = math.atan2(n_prev[1], n_prev[0]), math.atan2(n_next[1], n_next[0])
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi  # shortest way round (convex corner)
        for j in range(steps + 1):
            t = a0 + da * j / steps
            out.append((vx + r * math.cos(t), vy + r * math.sin(t)))
    return out


def _arc_outline(cx, cy, r, sweep, steps=96):
    """Outline of a STROKE-wide arc of midline radius r, +-sweep degrees around 3 o'clock, round caps."""
    h = STROKE / 2
    a0, a1 = math.radians(-sweep), math.radians(sweep)
    pts = []
    for j in range(steps + 1):  # outer edge, top to bottom
        t = a0 + (a1 - a0) * j / steps
        pts.append((cx + (r + h) * math.cos(t), cy + (r + h) * math.sin(t)))
    ex, ey = cx + r * math.cos(a1), cy + r * math.sin(a1)
    for j in range(1, steps // 4):  # bottom cap
        t = a1 + math.pi * j / (steps // 4)
        pts.append((ex + h * math.cos(t), ey + h * math.sin(t)))
    for j in range(steps + 1):  # inner edge, bottom to top
        t = a1 - (a1 - a0) * j / steps
        pts.append((cx + (r - h) * math.cos(t), cy + (r - h) * math.sin(t)))
    sx, sy = cx + r * math.cos(a0), cy + r * math.sin(a0)
    for j in range(1, steps // 4):  # top cap
        t = a0 + math.pi + math.pi * j / (steps // 4)
        pts.append((sx + h * math.cos(t), sy + h * math.sin(t)))
    return pts


def _glyph_parts():
    """Return the glyph as primitives in glyph units, origin at the triangle's back-top corner."""
    tri = [(0.0, 0.0), (0.0, TRI_H), (TRI_W, TRI_H / 2)]
    tip_x, mid_y = TRI_W, TRI_H / 2
    cx = tip_x - ARC_CENTER
    r1 = ARC_CENTER + GAP1 + STROKE / 2
    r2 = r1 + STROKE + GAP2
    arcs = [(cx, mid_y, r1, ARC1_SWEEP), (cx, mid_y, r2, ARC2_SWEEP)]
    return tri, arcs


def _glyph_bounds():
    tri, arcs = _glyph_parts()
    x0, y0, x1, y1 = 0.0, 0.0, TRI_W, TRI_H
    for cx, cy, r, sweep in arcs:
        x1 = max(x1, cx + r + STROKE / 2)
        ey = r * math.sin(math.radians(sweep)) + STROKE / 2
        y0, y1 = min(y0, cy - ey), max(y1, cy + ey)
    return x0, y0, x1, y1


def glyph_mask(canvas, width_frac, center=(0.5, 0.5)):
    """Antialiased L mask of the glyph on a `canvas` px square; mark is `width_frac` of the canvas wide."""
    S = canvas * SS
    x0, y0, x1, y1 = _glyph_bounds()
    gw, gh = x1 - x0, y1 - y0
    scale = width_frac * S / gw
    ox = center[0] * S - (x0 + gw / 2) * scale + OPTICAL_SHIFT * gw * scale
    oy = center[1] * S - (y0 + gh / 2) * scale

    def P(x, y):
        return ox + x * scale, oy + y * scale

    mask = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(mask)
    tri, arcs = _glyph_parts()

    d.polygon([P(*p) for p in _rounded_polygon(tri, TRI_R)], fill=255)

    for arc in arcs:
        d.polygon([P(*p) for p in _arc_outline(*arc)], fill=255)

    return mask.resize((canvas, canvas), Image.LANCZOS)


def gradient(size):
    """Vertical gradient GRAD_TOP -> GRAD_BOTTOM, full bleed."""
    ramp = Image.linear_gradient('L').resize((size, size), Image.BICUBIC)
    return Image.composite(Image.new('RGB', (size, size), GRAD_BOTTOM), Image.new('RGB', (size, size), GRAD_TOP), ramp)


def solid(size, color, mask):
    img = Image.new('RGBA', (size, size), color + (0,))
    img.putalpha(mask)
    return img


# Glyph width as a fraction of the visible icon. Adaptive layers are 108dp with 72dp visible.
ICON_GLYPH = 0.46
ADAPTIVE_GLYPH = ICON_GLYPH * 72 / 108
SPLASH_GLYPH = 0.62


def main():
    out = lambda name: os.path.join(ROOT, name)

    icon = gradient(1024).convert('RGBA')
    icon.alpha_composite(solid(1024, WHITE, glyph_mask(1024, ICON_GLYPH)))
    icon.convert('RGB').save(out('icon.png'), optimize=True)

    solid(512, WHITE, glyph_mask(512, ADAPTIVE_GLYPH)).save(out('android-icon-foreground.png'), optimize=True)
    gradient(512).save(out('android-icon-background.png'), optimize=True)
    solid(432, WHITE, glyph_mask(432, ADAPTIVE_GLYPH)).save(out('android-icon-monochrome.png'), optimize=True)
    solid(1024, ACCENT, glyph_mask(1024, SPLASH_GLYPH)).save(out('splash-icon.png'), optimize=True)

    icon.convert('RGB').resize((48, 48), Image.LANCZOS).save(out('favicon.png'), optimize=True)
    print('icons written')


if __name__ == '__main__':
    main()
