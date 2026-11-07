"""Generate Bopbox's launcher/adaptive/splash icons (a neon boombox). Run: python scripts/make-icons.py"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
BG = (11, 11, 18)
PINK = (255, 79, 216)
VIOLET = (107, 75, 255)
LIME = (182, 255, 59)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2):
    """Diagonal two-colour gradient (top-left c1 -> bottom-right c2)."""
    w, h = size
    ramp = Image.linear_gradient('L').rotate(45, expand=True).resize((w, h))
    return Image.composite(Image.new('RGB', size, c2), Image.new('RGB', size, c1), ramp)


def boombox(size, mono=False):
    """Draw the boombox glyph centred in a transparent square of `size` px (drawn 4x, downsampled)."""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2 + S * 0.03
    bw, bh = S * 0.62, S * 0.38
    x0, y0, x1, y1 = cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2
    r = S * 0.07

    # handle
    hw = bw * 0.5
    d.rounded_rectangle([cx - hw / 2, y0 - S * 0.11, cx + hw / 2, y0 + S * 0.02], radius=S * 0.05,
                        outline=WHITE if mono else LIME, width=int(S * 0.028))

    # body
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)
    body = Image.new('RGBA', (S, S), WHITE + (255,)) if mono else gradient((S, S), PINK, VIOLET).convert('RGBA')
    img.paste(body, (0, 0), mask)

    ink = (0, 0, 0, 0) if mono else BG + (255,)
    # speakers
    sr = bh * 0.30
    for sx in (x0 + bw * 0.22, x1 - bw * 0.22):
        d.ellipse([sx - sr, cy - sr, sx + sr, cy + sr], fill=ink)
        d.ellipse([sx - sr * 0.72, cy - sr * 0.72, sx + sr * 0.72, cy + sr * 0.72], outline=(WHITE if mono else LIME), width=int(S * 0.014))
        d.ellipse([sx - sr * 0.28, cy - sr * 0.28, sx + sr * 0.28, cy + sr * 0.28], fill=(WHITE if mono else LIME))

    # play triangle
    t = bh * 0.20
    d.polygon([(cx - t * 0.55, cy - t), (cx - t * 0.55, cy + t), (cx + t * 0.85, cy)], fill=ink if not mono else (0, 0, 0, 0))

    # little "sound waves"
    if not mono:
        for i, k in enumerate((0.36, 0.44)):
            rr = S * k
            box = [cx + bw * 0.08 - rr, cy - rr, cx + bw * 0.08 + rr, cy + rr]
            d.arc(box, start=-28, end=28, fill=LIME + (255 - i * 90,), width=int(S * 0.016))

    if mono:
        # carve speakers/play out of the white silhouette for the monochrome layer
        cut = Image.new('L', (S, S), 0)
        cd = ImageDraw.Draw(cut)
        for sx in (x0 + bw * 0.22, x1 - bw * 0.22):
            cd.ellipse([sx - sr, cy - sr, sx + sr, cy + sr], fill=255)
        cd.polygon([(cx - t * 0.55, cy - t), (cx - t * 0.55, cy + t), (cx + t * 0.85, cy)], fill=255)
        alpha = img.getchannel('A')
        alpha = Image.composite(Image.new('L', (S, S), 0), alpha, cut)
        img.putalpha(alpha)

    return img.resize((size, size), Image.LANCZOS)


def background(size):
    img = Image.new('RGB', (size, size), BG)
    glow = Image.new('RGB', (size, size), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([size * 0.15, size * 0.15, size * 0.85, size * 0.85], fill=(60, 20, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    return Image.blend(img, glow, 0.9)


def main():
    fg = boombox(512)
    fg_scaled = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    inner = fg.resize((340, 340), Image.LANCZOS)  # keep inside the adaptive-icon safe zone
    fg_scaled.paste(inner, (86, 86), inner)
    fg_scaled.save(os.path.join(ROOT, 'android-icon-foreground.png'))
    background(512).convert('RGBA').save(os.path.join(ROOT, 'android-icon-background.png'))

    mono = boombox(432, mono=True)
    m = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
    mi = mono.resize((290, 290), Image.LANCZOS)
    m.paste(mi, (71, 71), mi)
    m.save(os.path.join(ROOT, 'android-icon-monochrome.png'))

    icon = background(1024).convert('RGBA')
    big = boombox(1024)
    big = big.resize((760, 760), Image.LANCZOS)
    icon.paste(big, (132, 132), big)
    icon.convert('RGB').save(os.path.join(ROOT, 'icon.png'))

    splash = boombox(1024)
    splash.save(os.path.join(ROOT, 'splash-icon.png'))
    favicon = icon.resize((48, 48), Image.LANCZOS)
    favicon.save(os.path.join(ROOT, 'favicon.png'))
    print('icons written')


if __name__ == '__main__':
    main()
