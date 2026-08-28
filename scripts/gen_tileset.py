#!/usr/bin/env python3
"""
Generate public/assets/ae-bay-tileset-v2.png — the A&E Bay 3 tileset.

The first tileset was a small crop of a third-party hospital pack plus hand-drawn
fill-ins, and the map built from it read poorly: a saturated blue floor on a heavy grey
grid, and a repeating blue-and-white stripe standing in for the bay curtains, which at
a glance looked like wallpaper rather than a clinical space.

This sheet is drawn to a single muted palette keyed to real ward materials — pale green
vinyl flooring, off-white walls with a rubber skirting, NHS-teal cubicle curtains — and
provides the props a resus bay actually contains, so the room can be composed rather
than tiled flat.

Grid: 8 columns x 5 rows of 32px tiles (256 x 160). Tile ids are row-major, and are
named in TILES below so the map generator can refer to them by name.

Run:  python3 scripts/gen_tileset.py
"""

import random
from PIL import Image

TD = 32
COLS, ROWS = 8, 5

# ---------------------------------------------------------------- palette
C = {
    'patient_skin':    (238, 195, 154),
    'patient_skin_lo': (217, 160, 102),
    'patient_hair':    (167, 183, 191),
    'patient_hair_lo': (132, 126, 135),

    # Selective-outlining / hue-shift targets, matching gen_characters.py: shadows lean
    # cool blue-violet, highlights lean warm cream, instead of sliding toward neutral
    # black/white — a flat lerp-to-white/black is what reads as flat/plasticky.
    'shadow_tint': (46, 48, 92),
    'hilite_tint': (255, 226, 168),

    # Vinyl flooring — pale, desaturated, slightly green. Deliberately low contrast:
    # the floor is the largest surface on screen and must sit behind the characters.
    'floor':      (214, 226, 236),
    'floor_alt':  (232, 240, 246),   # alternating checker square, brighter than the base
    'floor_hi':   (246, 250, 253),
    'floor_lo':   (186, 204, 220),
    'floor_seam': (198, 214, 228),
    'speck':      (170, 196, 216),

    # Walls
    'wall_hi':    (255, 250, 238),
    'wall':       (248, 240, 222),
    'wall_lo':    (226, 214, 190),
    'dado':       (94, 158, 198),      # Pokemon-Center-style blue accent band
    'skirt':      (122, 132, 130),
    'skirt_hi':   (146, 156, 153),

    'chair_hi':   (108, 140, 186),
    'chair':      (74, 104, 152),
    'chair_lo':   (52, 76, 118),
    'chair_dk':   (36, 54, 88),

    # Cubicle curtain
    'curt_hi':    (108, 214, 216),
    'curt':       (48, 176, 176),
    'curt_lo':    (28, 138, 142),
    'curt_dk':    (18, 100, 106),
    'rail':       (150, 158, 162),
    'rail_lo':    (110, 118, 122),

    # Bed / linen
    'metal_hi':   (214, 222, 228),
    'metal':      (176, 184, 190),
    'metal_lo':   (128, 137, 144),
    'metal_dk':   (92, 100, 108),
    'linen':      (238, 242, 244),
    'linen_lo':   (214, 221, 226),
    'linen_dk':   (190, 199, 206),
    'blanket_hi': (232, 128, 128),
    'blanket':    (210, 78, 88),
    'blanket_lo': (168, 48, 62),
    'blanket_dk': (128, 30, 46),
    'pillow':     (250, 251, 252),

    # Equipment
    'case':       (58, 64, 72),
    'case_lo':    (38, 42, 50),
    'screen':     (16, 30, 24),
    'trace':      (92, 224, 138),
    'amber':      (232, 176, 72),
    'wood':       (185, 144, 106),
    'wood_lo':    (150, 112, 80),
    'red':        (172, 66, 62),
    'plastic':    (222, 226, 228),

    'line':       (86, 94, 96),     # soft outline — a hard black reads as cartoon here
    'line_soft':  (150, 158, 158),
    'shadow':     (150, 158, 156),
}


def _blend(dst, src, a):
    return tuple(round(d + (sv - d) * a) for d, sv in zip(dst, src))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a[:3], b[:3]))


class Tile:
    def __init__(self, bg=None):
        self.img = Image.new('RGBA', (TD, TD), (0, 0, 0, 0))
        if bg:
            self.rect(0, 0, TD - 1, TD - 1, bg)

    def set(self, x, y, col):
        if 0 <= x < TD and 0 <= y < TD and col:
            self.img.putpixel((x, y), col + (255,))

    def rect(self, x0, y0, x1, y1, col):
        for y in range(max(0, y0), min(TD, y1 + 1)):
            for x in range(max(0, x0), min(TD, x1 + 1)):
                self.set(x, y, col)

    def hline(self, x0, x1, y, col):
        for x in range(x0, x1 + 1):
            self.set(x, y, col)

    def vline(self, x, y0, y1, col):
        for y in range(y0, y1 + 1):
            self.set(x, y, col)

    def clear(self, x0, y0, x1, y1):
        for y in range(max(0, y0), min(TD, y1 + 1)):
            for x in range(max(0, x0), min(TD, x1 + 1)):
                self.img.putpixel((x, y), (0, 0, 0, 0))

    def shade(self, x, y, col, a):
        """Blend `col` over whatever is already at (x, y). Used for shadow and light."""
        if not (0 <= x < TD and 0 <= y < TD):
            return
        cur = self.img.getpixel((x, y))
        if cur[3] == 0:
            return
        self.img.putpixel((x, y), _blend(cur[:3], col, a) + (cur[3],))

    def cast_shadow(self, dx=3, dy=3, alpha=0.30):
        """
        Drop the tile's own silhouette onto the floor behind it.

        This is most of what gives a top-down tile the read of having height: without it
        every prop looks painted onto the floor rather than standing on it. Drawn under
        the existing pixels, offset toward the bottom-right so every prop in the room
        agrees on a single light source up and to the left.
        """
        src = self.img.copy()
        out = Image.new('RGBA', (TD, TD), (0, 0, 0, 0))
        for y in range(TD):
            for x in range(TD):
                if src.getpixel((x, y))[3] > 0:
                    tx, ty = x + dx, y + dy
                    if 0 <= tx < TD and 0 <= ty < TD:
                        out.putpixel((tx, ty), (44, 52, 54, int(255 * alpha)))
        out.alpha_composite(src)
        self.img = out

    def key_light(self, top=0.28, bottom=0.22):
        """
        Light the upper-left edge of the silhouette and darken the lower-right, so flat
        fills pick up a suggestion of volume.
        """
        src = self.img.copy()

        def solid(x, y):
            return 0 <= x < TD and 0 <= y < TD and src.getpixel((x, y))[3] > 0

        for y in range(TD):
            for x in range(TD):
                if not solid(x, y):
                    continue
                if not solid(x, y - 1) or not solid(x - 1, y):
                    self.shade(x, y, C['hilite_tint'], top)
                elif not solid(x, y + 1) or not solid(x + 1, y):
                    self.shade(x, y, C['shadow_tint'], bottom)

    def frame(self, x0, y0, x1, y1, col):
        self.hline(x0, x1, y0, col)
        self.hline(x0, x1, y1, col)
        self.vline(x0, y0, y1, col)
        self.vline(x1, y0, y1, col)


# ---------------------------------------------------------------- surfaces
def floor(seed, seams=True, scuff=False):
    """
    Vinyl flooring, laid as 16px squares so one map tile carries four of them.

    Drawing the floor at half the tile size is the cheapest way to add detail to the
    largest surface on screen: the eye reads laid squares rather than one flat colour,
    and the repeat is much harder to spot than a 32px grid was. Tones stay within a few
    values of each other so it stays behind the characters.
    """
    t = Tile(C['floor'])
    rnd = random.Random(seed)
    half = TD // 2
    for qy in range(2):
        for qx in range(2):
            # Alternate the two near-identical vinyl tones in a checker.
            if (qx + qy + seed) % 2:
                t.rect(qx * half, qy * half, qx * half + half - 1, qy * half + half - 1,
                       C['floor_alt'])
            # Grout: a light top/left edge and a darker bottom/right, per square.
            x0, y0 = qx * half, qy * half
            x1, y1 = x0 + half - 1, y0 + half - 1
            t.hline(x0, x1, y0, C['floor_hi'])
            t.vline(x0, y0, y1, C['floor_hi'])
            t.hline(x0, x1, y1, C['floor_seam'])
            t.vline(x1, y0, y1, C['floor_seam'])
    for _ in range(14):
        x, y = rnd.randrange(TD), rnd.randrange(TD)
        t.set(x, y, C['speck'] if rnd.random() < 0.5 else C['floor_hi'])
    if scuff:
        for i in range(9):
            t.set(5 + i, 21 + (i % 3 == 0), C['floor_lo'])
        for i in range(6):
            t.set(18 + i, 10 - (i % 2), C['floor_lo'])
    return t


def _wall_speckle(t, seed, density=10):
    """Faint texture on a painted wall panel — a flat fill read as a colour swatch."""
    rnd = random.Random(seed)
    for _ in range(density):
        x, y = rnd.randrange(TD), rnd.randrange(TD)
        t.set(x, y, mix(C['wall'], C['wall_lo'], 0.4 if rnd.random() < 0.6 else 0.2))


def wall_upper(seed=1):
    """Painted wall above the dado rail."""
    t = Tile(C['wall'])
    t.hline(0, TD - 1, 0, C['wall_hi'])
    t.hline(0, TD - 1, 1, C['wall_hi'])
    t.hline(0, TD - 1, TD - 1, C['wall_lo'])
    _wall_speckle(t, seed)
    return t


def wall_lower(seed=2):
    """
    Wall meeting the floor. Carries the dado rail, the wipe-clean band below it and the
    rubber skirting — three horizontal bands rather than one flat fill, which is what
    stops a long wall run reading as a blank strip. The dado is a moulded rail with its
    own bevel (a lit top edge, a groove, a shadowed underside), not a single flat line.
    """
    t = Tile(C['wall'])
    t.hline(0, TD - 1, 0, mix(C['dado'], C['hilite_tint'], 0.35))   # rail: lit top edge
    t.hline(0, TD - 1, 1, C['dado'])
    t.hline(0, TD - 1, 2, mix(C['dado'], C['shadow_tint'], 0.35))          # groove
    t.hline(0, TD - 1, 3, C['wall_hi'])
    t.rect(0, 4, TD - 1, TD - 8, C['wall'])
    _wall_speckle(t, seed)
    t.hline(0, TD - 1, TD - 7, C['wall_lo'])
    t.rect(0, TD - 6, TD - 1, TD - 1, C['skirt'])
    t.hline(0, TD - 1, TD - 6, C['skirt_hi'])
    t.hline(0, TD - 1, TD - 1, (98, 108, 106))
    return t


def wall_side(left=True, seed=3):
    """
    Vertical wall run. Needs its own tile because wall_lower's skirting is a horizontal
    band, which reads as a floor stripe when stacked down a side wall.
    """
    t = Tile(C['wall'])
    if left:
        t.vline(TD - 1, 0, TD - 1, mix(C['dado'], C['hilite_tint'], 0.35))
        t.vline(TD - 2, 0, TD - 1, C['dado'])
        t.vline(TD - 3, 0, TD - 1, mix(C['dado'], C['shadow_tint'], 0.35))
        t.vline(TD - 4, 0, TD - 1, C['wall_hi'])
        t.rect(TD - 9, 0, TD - 5, TD - 1, C['wall'])
        t.vline(TD - 10, 0, TD - 1, C['wall_lo'])
        t.rect(TD - 16, 0, TD - 11, TD - 1, C['skirt'])
        t.vline(TD - 11, 0, TD - 1, C['skirt_hi'])
        t.vline(TD - 16, 0, TD - 1, (98, 108, 106))
    else:
        t.vline(0, 0, TD - 1, mix(C['dado'], C['hilite_tint'], 0.35))
        t.vline(1, 0, TD - 1, C['dado'])
        t.vline(2, 0, TD - 1, mix(C['dado'], C['shadow_tint'], 0.35))
        t.vline(3, 0, TD - 1, C['wall_hi'])
        t.rect(4, 0, 8, TD - 1, C['wall'])
        t.vline(9, 0, TD - 1, C['wall_lo'])
        t.rect(10, 0, 15, TD - 1, C['skirt'])
        t.vline(10, 0, TD - 1, C['skirt_hi'])
        t.vline(15, 0, TD - 1, (98, 108, 106))
    _wall_speckle(t, seed, density=6)
    return t


def curtain_rail():
    """Ceiling track the cubicle curtain hangs from, with hook fittings along it."""
    t = Tile(C['wall'])
    t.rect(0, 5, TD - 1, 8, C['rail'])
    t.hline(0, TD - 1, 5, mix(C['rail'], C['hilite_tint'], 0.3))
    t.hline(0, TD - 1, 8, C['rail_lo'])
    for x in range(1, TD, 5):
        t.vline(x, 9, 11, C['rail_lo'])          # hook stems
        t.rect(x - 1, 11, x + 1, 12, C['metal'])  # hook rings
    return t


def _curtain_fold_ramp():
    """
    A run of folds with irregular widths and irregular depth, rather than one tone
    repeating on a fixed period — a perfectly even repeat is what made the first version
    read as a barcode instead of fabric. Each fold still goes dark -> light -> dark so
    the cloth still reads as turning, just not on a metronome.
    """
    widths = [5, 3, 6, 4, 5, 3, 6]                # sums to 32, deliberately uneven
    depths = [0.9, 0.55, 1.0, 0.4, 0.85, 0.5, 0.75]
    ramp = []
    for w, d in zip(widths, depths):
        for i in range(w):
            # 0 at the fold edges (shadow), 1 at the fold centre (lit) — a triangle wave
            # scaled by that fold's own depth, so some folds are barely creased and
            # others are deep.
            t = 1 - abs((i / max(1, w - 1)) * 2 - 1)
            ramp.append(t * d)
    return ramp[:TD]


def curtain(variant=0):
    """
    Hanging cubicle curtain fabric. Two variants with unrelated fold rhythms (rather than
    the same pattern offset by a few pixels) so a run of these tiles doesn't repeat on a
    visible beat, plus a sparse woven-in dot print, which is what real NHS cubicle
    curtains almost always carry rather than a plain colour.
    """
    t = Tile(C['curt'])
    ramp = _curtain_fold_ramp()
    if variant:
        ramp = ramp[5:] + ramp[:5]               # unrelated phase, not just mirrored
    for x in range(TD):
        depth = ramp[x]
        col = mix(C['curt_dk'], C['curt_hi'], depth) if depth < 0.5 else             mix(C['curt'], C['curt_hi'], (depth - 0.5) * 2)
        t.vline(x, 0, TD - 1, col)
    # Print: a faint diamond every so often, only on the lighter part of a fold so it
    # doesn't muddy the creases.
    rnd = random.Random(11 + variant)
    for _ in range(5):
        x = rnd.randrange(3, TD - 3)
        y = rnd.randrange(3, TD - 3)
        if ramp[x] > 0.5:
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                t.set(x + dx, y + dy, mix(C['curt_hi'], C['hilite_tint'], 0.5))
    # Mesh header panel, as real cubicle curtains have, brick-offset rather than a flat grid.
    for row, dy in enumerate((2, 4)):
        for x in range((row * 2) % 4, TD, 4):
            t.set(x, dy, C['curt_hi'])
    t.hline(0, TD - 1, 0, C['curt_dk'])
    return t


def curtain_hem():
    """Bottom of the curtain: a slightly uneven drape rather than a flat cut, with a
    weighted hem line."""
    t = curtain(1)
    wave = [0, 1, 1, 0, -1, 0, 1, 1, 0, -1, 0, 1, 1, 0, -1, 0,
            0, 1, 1, 0, -1, 0, 1, 1, 0, -1, 0, 1, 1, 0, -1, 0]
    base = TD - 9
    for x in range(TD):
        y = base + wave[x % len(wave)]
        t.clear(x, y + 1, x, TD - 1)
        t.set(x, y, C['curt_lo'])
    return t


# ---------------------------------------------------------------- bed
# A single-tile-wide, two-tile-tall bed (metrically "correct" for a 0.9m trolley) drew as
# a narrow coffin-shaped column next to characters this size, with Ray's shoulders forced
# up against the rails to fill it. Real top-down games almost never draw a bed at strict
# real-world proportions — they draw it roughly square, wide enough that a person sitting
# in it has visible margin either side. 2x2 tiles matches that convention while still
# reading unambiguously as a hospital trolley rather than a double bed.
BED_W, BED_H = TD * 2, TD * 2


def _bed_full():
    im = Image.new('RGBA', (BED_W, BED_H), (0, 0, 0, 0))
    px = im.load()

    def rect(x0, y0, x1, y1, col):
        for y in range(max(0, y0), min(BED_H, y1 + 1)):
            for x in range(max(0, x0), min(BED_W, x1 + 1)):
                px[x, y] = col + (255,)

    def hline(x0, x1, y, col):
        rect(x0, y, x1, y, col)

    def vline(x, y0, y1, col):
        rect(x, y0, x, y1, col)

    L, R = 12, BED_W - 13        # mattress edges
    HEAD, FOOT = 5, BED_H - 6

    # Castors
    for cx in (L, R - 1):
        for cy in (HEAD + 3, FOOT - 4):
            rect(cx, cy, cx + 1, cy + 2, C['metal_dk'])

    # Frame and mattress
    rect(L, HEAD, R, FOOT, C['metal_lo'])
    rect(L + 1, HEAD + 1, R - 1, FOOT - 1, C['linen'])

    # Head and foot boards
    for y0, y1 in ((HEAD - 4, HEAD), (FOOT, FOOT + 4)):
        rect(L - 2, y0, R + 2, y1, C['metal'])
        hline(L - 2, R + 2, y0, C['metal_hi'])
        hline(L - 2, R + 2, y1, C['metal_dk'])

    # Pillow with a crease
    py0, py1 = HEAD + 2, HEAD + 12
    rect(L + 2, py0, R - 2, py1, C['pillow'])
    hline(L + 2, R - 2, py1, C['linen_dk'])
    hline(L + 3, R - 3, py1 - 1, C['linen_lo'])
    vline(R - 2, py0, py1, C['linen_lo'])
    hline(L + 5, R - 5, py0 + 5, C['linen_lo'])

    # Blanket over the lower half, turned back at the top
    top = HEAD + 17
    rect(L + 1, top, R - 1, FOOT - 1, C['blanket'])
    rect(L + 1, top, R - 1, top + 2, C['linen'])
    hline(L + 1, R - 1, top + 3, C['blanket_hi'])
    for dy, shade in ((8, 'blanket_lo'), (15, 'blanket_dk'), (21, 'blanket_lo')):
        y = top + dy
        if y < FOOT - 1:
            hline(L + 2, R - 2, y, C[shade])
            hline(L + 3, R - 3, y + 1, C['blanket_hi'])
    vline(R - 1, top, FOOT - 1, C['blanket_dk'])
    vline(L + 1, top, FOOT - 1, C['blanket_hi'])

    # Cot side rails
    for x0, lit in ((L - 3, True), (R + 1, False)):
        rect(x0, HEAD + 6, x0 + 2, FOOT - 4, C['metal_lo'])
        rect(x0 + (0 if lit else 1), HEAD + 6, x0 + (1 if lit else 2), FOOT - 4, C['metal'])
        for y in (HEAD + 6, HEAD + 16, FOOT - 4):
            rect(x0, y, x0 + 2, y, C['metal_hi'])
    return im


def _bed_occupied():
    """
    Ray, lying in the bed. The plain bed art alone left the demo positioning a full
    standing walk-cycle sprite directly on the mattress, which read as a patient standing
    on top of his own bed rather than lying in it. This bakes a reclining figure into the
    bed graphic itself — head and hair on the pillow, a body-shaped rise under the
    blanket, hands resting on top of it — and Ray's normal Character sprite is hidden
    while he's on this tile (src/components/PixiGame.tsx) so only this appears.
    """
    im = _bed_full()
    px = im.load()

    def rect(x0, y0, x1, y1, col):
        for y in range(max(0, y0), min(BED_H, y1 + 1)):
            for x in range(max(0, x0), min(BED_W, x1 + 1)):
                px[x, y] = col + (255,)

    def hline(x0, x1, y, col):
        rect(x0, y, x1, y, col)

    def oval(cx, cy, rx, ry, col):
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2 <= 1.0:
                    px[x, y] = col + (255,)

    L, R = 12, BED_W - 13
    HEAD = 5
    cx = (L + R) // 2

    # Head, resting on the pillow, tipped very slightly so he reads as looking toward
    # whoever is at the bedside rather than straight up at the ceiling.
    head_cy = HEAD + 8
    oval(cx + 1, head_cy, 6, 5, C['patient_hair'])
    oval(cx + 1, head_cy + 1, 5, 4, C['patient_skin'])
    # Closed eyes: short horizontal dashes, not dots — a dot at this scale reads as a
    # nostril rather than a shut eye.
    hline(cx - 3, cx - 2, head_cy + 1, C['line'])
    hline(cx + 3, cx + 4, head_cy + 1, C['line'])

    # Body: a soft rise under the blanket rather than the flat rectangle the plain bed
    # has, tapering from shoulders to feet, with a highlight ridge down the centre.
    top = HEAD + 19
    for i, y in enumerate(range(top, top + 34)):
        t = i / 34
        w = round(9 - 3 * t)
        rect(cx - w, y, cx + w, y, mix(C['blanket'], C['blanket_hi'], 0.25))
        px[cx, y] = mix(C['blanket_hi'], C['hilite_tint'], 0.12) + (255,)
    # Feet, tenting the blanket at the very end.
    oval(cx - 3, top + 33, 2, 3, C['blanket_lo'])
    oval(cx + 3, top + 33, 2, 3, C['blanket_lo'])

    # Hands resting on top of the covers, near where the turned-back sheet ends.
    oval(cx - 7, top + 3, 2, 2, C['patient_skin'])
    oval(cx + 8, top + 3, 2, 2, C['patient_skin'])
    return im


def _bed_shadowed(source=_bed_full):
    im = source()
    out = Image.new('RGBA', (BED_W, BED_H), (0, 0, 0, 0))
    for y in range(BED_H):
        for x in range(BED_W):
            if im.getpixel((x, y))[3] > 0 and x + 3 < BED_W and y + 3 < BED_H:
                out.putpixel((x + 3, y + 3), (44, 52, 54, 76))
    out.alpha_composite(im)
    return out


_BED = _bed_shadowed()
_BED_OCCUPIED = _bed_shadowed(_bed_occupied)


def bed_piece(col, row, occupied=False):
    """col: 0=left, 1=right.  row: 0=head, 1=foot."""
    t = Tile()
    source = _BED_OCCUPIED if occupied else _BED
    t.img.paste(source.crop((col * TD, row * TD, col * TD + TD, row * TD + TD)), (0, 0))
    return t


# ---------------------------------------------------------------- props
def monitor_screen():
    """
    Cardiac monitor, upper tile: the case and the display.

    Given a whole tile to itself the screen can carry a real rhythm strip and a second
    numeric row, instead of the few pixels it had when the whole unit was one tile.

    Drawn onto a wall tile, not a transparent one — it sits in the wall run, and a bare
    tile leaves a hole through to the floor behind.
    """
    t = wall_upper()
    t.rect(8, 12, 24, 31, C['case'])
    t.hline(8, 24, 12, (86, 94, 104))         # lit top bezel
    t.vline(8, 12, 31, (86, 94, 104))
    t.vline(24, 12, 31, C['case_lo'])
    t.rect(10, 14, 22, 29, C['screen'])
    t.frame(10, 14, 22, 29, (10, 20, 16))

    # ECG rhythm: two beats across the tile, each a small P wave then a QRS spike.
    base = 19
    for x in range(11, 22):
        t.set(x, base, (36, 96, 62))
    for origin in (11, 17):
        for dx, dy in ((1, -1), (2, -5), (3, 3), (4, 0)):
            t.set(origin + dx, base + dy, C['trace'])
            t.set(origin + dx, base + dy + 1, C['trace'])

    # Numeric row underneath: heart rate in green, sats in amber.
    for x in range(11, 15):
        t.set(x, 25, C['trace'])
    for x in range(18, 22):
        t.set(x, 25, C['amber'])
    # Contact shadow on the wall behind, cast down and right like everything else.
    for i, a in enumerate((0.26, 0.16, 0.08)):
        for x in range(9 + i, 25 + i + 1):
            t.shade(x, 31, C['shadow_tint'], a)
        t.shade(25 + i, 12 + i, C['shadow_tint'], a)
    for y in range(13, 32):
        t.shade(25, y, C['shadow_tint'], 0.22)
        t.shade(26, y + 1 if y + 1 < 32 else y, C['shadow_tint'], 0.12)
    return t


def monitor_arm():
    """Cardiac monitor, lower tile: wall arm and the leads running down to the patient."""
    t = wall_lower()
    t.rect(14, 0, 17, 3, C['case_lo'])         # neck
    t.rect(12, 3, 19, 6, C['metal_lo'])        # bracket
    t.hline(12, 19, 3, C['metal'])
    # Leads trailing off toward the bed.
    for i, x in enumerate((14, 16, 18)):
        t.vline(x, 7, 12 + i * 3, C['case'])
        t.set(x + 1, 12 + i * 3, C['case'])
    return t


def iv_stand(top=True):
    """Drip stand: bag and hook on the upper tile, pole and castors on the lower."""
    t = Tile()
    if top:
        t.rect(13, 2, 18, 5, C['metal_lo'])       # hook
        t.rect(11, 6, 20, 20, C['plastic'])       # bag
        t.frame(11, 6, 20, 20, C['line_soft'])
        t.rect(12, 9, 19, 19, (206, 226, 236))    # fluid
        t.vline(15, 21, TD - 1, C['metal'])
        t.vline(16, 21, TD - 1, C['metal_lo'])
    else:
        t.vline(15, 0, 22, C['metal'])
        t.vline(16, 0, 22, C['metal_lo'])
        t.hline(9, 22, 23, C['metal'])            # castor spider
        t.set(9, 24, C['metal_lo']); t.set(22, 24, C['metal_lo'])
        t.set(15, 25, C['metal_lo']); t.set(16, 25, C['metal_lo'])
    return t


def cabinet():
    """Bedside locker: a foreshortened top surface over a taller two-drawer front."""
    t = Tile()
    t.rect(9, 7, 23, 12, (214, 178, 138))     # top surface, catching the light
    t.hline(9, 23, 7, (232, 198, 160))
    t.hline(9, 23, 12, C['wood_lo'])
    t.rect(9, 13, 23, 29, C['wood'])          # front, deeper now for real height
    t.vline(9, 13, 29, (206, 168, 128))
    t.vline(23, 13, 29, C['wood_lo'])
    t.hline(9, 23, 29, (120, 88, 62))
    for y in (15, 22):                        # drawers
        t.hline(10, 22, y, (206, 168, 128))
        t.hline(10, 22, y + 4, C['wood_lo'])
        t.hline(14, 18, y + 2, (140, 104, 74))
    return t


def chair():
    """
    Visitor chair, drawn in forced perspective rather than flat top-down: a tall
    backrest (the far side, away from the viewer) rising to a rounded top, a
    foreshortened seat cushion just below it, and front legs with real visible length
    reaching the floor — the standard construction top-down RPG furniture uses so a
    chair reads as something with height, not a two-tone icon.
    """
    t = Tile()
    # Backrest: tall, rounded top, a tufting seam down the middle for a touch of detail.
    t.rect(9, 2, 22, 15, C['chair'])
    t.rect(10, 1, 21, 2, C['chair'])
    t.hline(10, 21, 2, mix(C['chair'], C['hilite_tint'], 0.3))
    t.vline(9, 3, 15, mix(C['chair'], C['hilite_tint'], 0.2))
    t.vline(22, 3, 15, C['chair_dk'])
    t.vline(15, 4, 14, C['chair_lo'])
    t.hline(9, 22, 15, C['chair_lo'])
    # Seat: compressed height, a lit top surface since we're looking down onto it.
    t.rect(7, 16, 24, 21, C['chair_hi'])
    t.hline(7, 24, 16, mix(C['chair_hi'], C['hilite_tint'], 0.25))
    t.hline(7, 24, 21, C['chair_lo'])
    t.vline(24, 16, 21, C['chair_lo'])
    # Front legs, tapering slightly, with real length so the chair has visible height.
    for x0 in (8, 19):
        t.rect(x0, 22, x0 + 2, 29, C['metal_lo'])
        t.vline(x0, 22, 29, C['metal_hi'])
        t.vline(x0 + 2, 22, 29, C['metal_dk'])
    return t


def stool():
    """A round-topped clinical stool — padded seat on a single metal column and base."""
    t = Tile()
    t.rect(9, 9, 22, 17, C['blanket_dk'])       # padded seat, same red-leaning vinyl family
    t.hline(9, 22, 9, mix(C['blanket_dk'], C['hilite_tint'], 0.28))
    t.hline(9, 22, 17, (74, 16, 26))
    t.vline(15, 18, 25, C['metal'])
    t.vline(16, 18, 25, C['metal_lo'])
    t.hline(9, 22, 26, C['metal_lo'])           # star base
    t.hline(11, 20, 27, C['metal_lo'])
    return t


def trolley():
    """Dressings trolley: a metal top over two grey drawers, marked with a small red cross."""
    t = Tile()
    t.rect(7, 6, 25, 10, C['metal'])          # top surface
    t.hline(7, 25, 6, C['metal_hi'])
    t.hline(7, 25, 10, C['metal_dk'])
    for y in (11, 18):                        # drawers
        t.rect(8, y, 24, y + 6, C['plastic'])
        t.hline(8, 24, y, C['metal_hi'])
        t.hline(8, 24, y + 6, C['metal_lo'])
        t.hline(13, 19, y + 3, C['line_soft'])
    t.rect(14, 12, 18, 16, C['red'])          # cross, the one accent
    t.hline(15, 17, 13, C['red'])
    t.vline(16, 12, 16, (232, 150, 146))
    t.rect(9, 25, 11, 28, C['metal_dk'])      # castors
    t.rect(21, 25, 23, 28, C['metal_dk'])
    return t


def sink():
    """
    Hand-wash basin, forced perspective: the tap rising at the back, the basin bowl
    foreshortened just below it, and a visible pedestal/splashback front face rather
    than a flat rimmed rectangle floating with no sense of depth.
    """
    t = Tile()
    # Tap, rising from the back of the unit.
    t.vline(15, 2, 8, C['metal'])
    t.vline(16, 2, 8, C['metal_lo'])
    t.hline(13, 18, 2, C['metal_hi'])
    t.vline(13, 2, 5, C['metal'])
    t.vline(18, 2, 5, C['metal'])
    # Basin: a lit rim, then the bowl itself, foreshortened (compressed) as we're
    # looking down and slightly forward into it.
    t.rect(6, 9, 25, 18, C['plastic'])
    t.hline(6, 25, 9, mix(C['plastic'], C['hilite_tint'], 0.35))
    t.frame(6, 9, 25, 18, C['line_soft'])
    t.rect(9, 11, 22, 16, (204, 214, 218))
    t.hline(9, 22, 16, C['line_soft'])
    # Splashback/pedestal front face, giving the unit real height off the floor.
    t.rect(6, 19, 25, 27, C['plastic'])
    t.hline(6, 25, 19, C['line_soft'])
    t.vline(6, 19, 27, C['line_soft'])
    t.vline(25, 19, 27, C['line_soft'])
    t.rect(11, 20, 20, 26, mix(C['plastic'], C['line_soft'], 0.3))
    return t


def sharps_bin():
    """Sharps bin: a domed yellow lid (the part we look down onto) over a taller body."""
    t = Tile()
    t.rect(10, 17, 22, 28, (232, 186, 58))         # body, taller than it was
    t.hline(10, 22, 17, mix((232, 186, 58), C['hilite_tint'], 0.3))
    t.hline(10, 22, 28, (188, 146, 40))
    t.vline(10, 17, 28, mix((232, 186, 58), C['hilite_tint'], 0.15))
    t.vline(22, 17, 28, (188, 146, 40))
    t.rect(10, 12, 22, 17, (208, 60, 52))          # lid — the domed top surface
    t.hline(10, 22, 12, mix((208, 60, 52), C['hilite_tint'], 0.3))
    t.hline(13, 19, 20, (188, 146, 40))
    return t


def waste_bin():
    """Pedal bin: a lit lid (looking down onto it) over a taller, shaded body."""
    t = Tile()
    t.rect(10, 15, 21, 29, C['plastic'])
    t.hline(10, 21, 15, mix(C['plastic'], C['hilite_tint'], 0.25))
    t.hline(10, 21, 29, C['line_soft'])
    t.vline(10, 15, 29, mix(C['plastic'], C['hilite_tint'], 0.1))
    t.vline(21, 15, 29, C['line_soft'])
    t.rect(8, 10, 23, 15, C['metal'])              # lid, wider than the body
    t.hline(8, 23, 10, C['metal_hi'])
    t.hline(8, 23, 15, C['metal_lo'])
    t.rect(14, 8, 17, 10, C['metal_lo'])           # pedal-lid handle
    return t


def supply_shelf():
    """
    Wall-mounted supply shelving: three shelves of colour-coded stock boxes and bottles.
    The room had equipment but nothing that reads as "stuff a working bay actually has
    lying around" — a shelf like this is what sells a space as lived-in rather than a
    showroom, and it's the single most detail-dense object in most hospital tilesets.
    """
    t = wall_lower()
    t.rect(2, 4, 29, 27, C['wood_lo'])            # unit frame
    t.rect(3, 5, 28, 26, C['wall_lo'])             # recessed back panel
    shelf_ys = (5, 13, 21)
    box_colours = [(214, 96, 92), (94, 168, 214), (232, 186, 58), (96, 176, 128)]
    rnd = random.Random(77)
    for si, y0 in enumerate(shelf_ys):
        t.hline(3, 28, y0, C['wood'])              # the shelf board itself
        t.hline(3, 28, y0 + 1, C['wood_lo'])
        x = 4
        while x < 26:
            w = rnd.choice((4, 5, 6))
            if x + w > 27:
                break
            col = box_colours[(si + x) % len(box_colours)]
            h = rnd.choice((5, 6))
            t.rect(x, y0 + 2, x + w - 1, y0 + 1 + h, col)
            t.hline(x, x + w - 1, y0 + 2, mix(col, C['hilite_tint'], 0.35))
            t.hline(x, x + w - 1, y0 + 1 + h, mix(col, C['shadow_tint'], 0.3))
            x += w + 1
    return t


def gel_dispenser():
    """Wall-mounted hand gel — small, but it is the detail that says 'hospital'."""
    t = wall_lower()
    t.rect(12, 6, 19, 16, C['plastic'])
    t.frame(12, 6, 19, 16, C['line_soft'])
    t.rect(13, 8, 18, 12, (198, 220, 230))
    t.rect(14, 17, 17, 19, C['metal_lo'])
    return t


def oxygen_outlet():
    t = wall_lower()
    t.rect(9, 5, 22, 15, C['plastic'])
    t.frame(9, 5, 22, 15, C['line_soft'])
    t.rect(11, 8, 14, 12, (108, 172, 214))
    t.rect(17, 8, 20, 12, C['case'])
    return t


# 3x5 bitmap digits, scaled 2x when drawn — just enough characters for a bay number sign.
_DIGITS = {
    '3': ['111', '..1', '111', '..1', '111'],
    'B': ['11.', '1.1', '11.', '1.1', '11.'],
    'A': ['.1.', '1.1', '111', '1.1', '1.1'],
    'Y': ['1.1', '1.1', '.1.', '.1.', '.1.'],
}


def _draw_text(t, x0, y0, text, col, scale=2, gap=1):
    x = x0
    for ch in text:
        if ch == ' ':
            x += 3 * scale + gap
            continue
        rows = _DIGITS.get(ch)
        if not rows:
            continue
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == '1':
                    t.rect(x + rx * scale, y0 + ry * scale,
                           x + rx * scale + scale - 1, y0 + ry * scale + scale - 1, col)
        x += 3 * scale + gap


def bay_sign():
    """Wall plaque by the door — the number every real ward bay is signed with."""
    t = wall_upper()
    t.rect(3, 5, 28, 24, C['dado'])
    t.frame(3, 5, 28, 24, mix(C['dado'], (255, 255, 255), 0.4))
    _draw_text(t, 10, 7, '3', C['wall_hi'], scale=4)
    return t


def clock():
    t = wall_upper()
    t.rect(11, 8, 20, 17, C['plastic'])
    t.frame(11, 8, 20, 17, C['line'])
    t.vline(15, 10, 13, C['line'])
    t.hline(15, 18, 13, C['line'])
    return t


def door():
    """A single-leaf doorway, one tile across."""
    t = wall_lower()
    t.rect(3, 1, 28, TD - 1, C['wood_lo'])       # frame
    t.rect(4, 2, 27, TD - 1, C['wood'])
    t.vline(4, 2, TD - 1, (206, 168, 128))
    t.vline(27, 2, TD - 1, C['wood_lo'])
    t.rect(7, 5, 24, 17, (206, 224, 232))        # vision panel
    t.frame(7, 5, 24, 17, C['wood_lo'])
    t.hline(8, 23, 6, (232, 244, 248))
    t.rect(23, 21, 25, 24, C['metal'])           # handle
    return t


def ceiling_light():
    t = wall_upper()
    t.rect(4, 12, 27, 19, (246, 248, 244))
    t.frame(4, 12, 27, 19, C['line_soft'])
    return t


def blank():
    return Tile()


def standing(fn, dx=3, dy=3, alpha=0.30, light=True):
    """Wrap a prop so it casts a shadow and catches the key light."""
    def build():
        t = fn()
        if light:
            t.key_light()
        t.cast_shadow(dx, dy, alpha)
        return t
    return build


def floor_ao():
    """Floor tile carrying the wall's ambient occlusion along its top edge."""
    t = floor(9)
    for i, a in enumerate((0.34, 0.24, 0.16, 0.09, 0.04)):
        for x in range(TD):
            t.shade(x, i, C['shadow_tint'], a)
    return t


# ---------------------------------------------------------------- sheet
# Order is the tile id. Names are what data/build_ae_map.py refers to.
TILES = [
    ('floor_a',       lambda: floor(1)),
    ('floor_b',       lambda: floor(2)),
    ('floor_c',       lambda: floor(3)),
    ('floor_scuff',   lambda: floor(4, scuff=True)),
    ('wall_upper',    wall_upper),
    ('wall_lower',    wall_lower),
    ('gel',           gel_dispenser),
    ('supply_shelf',  supply_shelf),
    ('oxygen',        oxygen_outlet),

    ('curtain_rail',  curtain_rail),
    # Hanging fabric: the shadow falls sideways onto the floor, not down.
    ('curtain_a',     standing(lambda: curtain(0), dx=3, dy=0, alpha=0.26, light=False)),
    ('curtain_b',     standing(lambda: curtain(1), dx=3, dy=0, alpha=0.26, light=False)),
    ('curtain_hem',   standing(curtain_hem, dx=3, dy=1, alpha=0.26, light=False)),
    ('door',          door),
    ('clock',         clock),
    ('bay_sign',      bay_sign),
    ('ceiling_light', ceiling_light),

    ('bed_hl',        lambda: bed_piece(0, 0)),
    ('bed_hr',        lambda: bed_piece(1, 0)),
    ('bed_fl',        lambda: bed_piece(0, 1)),
    ('bed_fr',        lambda: bed_piece(1, 1)),
    ('bed_hl_occ',    lambda: bed_piece(0, 0, occupied=True)),
    ('bed_hr_occ',    lambda: bed_piece(1, 0, occupied=True)),
    ('bed_fl_occ',    lambda: bed_piece(0, 1, occupied=True)),
    ('bed_fr_occ',    lambda: bed_piece(1, 1, occupied=True)),
    ('cabinet',       standing(cabinet)),
    ('monitor',       monitor_screen),
    ('monitor_arm',   monitor_arm),

    ('iv_top',        standing(lambda: iv_stand(True), dy=0, alpha=0.18)),
    ('iv_bot',        standing(lambda: iv_stand(False), alpha=0.26)),
    ('chair',         standing(chair)),
    ('stool',         standing(stool)),
    ('trolley',       standing(trolley)),
    ('sink',          standing(sink)),
    ('sharps',        standing(sharps_bin)),

    ('waste',         standing(waste_bin)),
    ('floor_ao',      floor_ao),
    ('wall_side_l',   lambda: wall_side(True)),
    ('wall_side_r',   lambda: wall_side(False)),
    ('blank',         blank),
]


def main():
    sheet = Image.new('RGBA', (COLS * TD, ROWS * TD), (0, 0, 0, 0))
    names = {}
    for i, (name, fn) in enumerate(TILES):
        sheet.paste(fn().img, ((i % COLS) * TD, (i // COLS) * TD))
        names[name] = i
    sheet.save('public/assets/ae-bay-tileset-v2.png')
    with open('data/tileIds.json', 'w') as f:
        import json
        json.dump(names, f, indent=2, sort_keys=True)
    print(f'wrote tileset {sheet.size[0]}x{sheet.size[1]}, {len(TILES)} tiles')


if __name__ == '__main__':
    main()
