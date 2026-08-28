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
    # Vinyl flooring — pale, desaturated, slightly green. Deliberately low contrast:
    # the floor is the largest surface on screen and must sit behind the characters.
    'floor':      (198, 205, 196),
    'floor_hi':   (208, 214, 205),
    'floor_lo':   (184, 192, 183),
    'floor_seam': (192, 200, 191),
    'speck':      (170, 180, 172),

    # Walls
    'wall':       (231, 235, 233),
    'wall_lo':    (214, 220, 217),
    'skirt':      (122, 132, 130),
    'skirt_hi':   (146, 156, 153),

    # Cubicle curtain
    'curt':       (74, 158, 143),
    'curt_lo':    (55, 122, 110),
    'curt_hi':    (104, 186, 170),
    'rail':       (150, 158, 162),
    'rail_lo':    (110, 118, 122),

    # Bed / linen
    'metal':      (176, 184, 190),
    'metal_lo':   (128, 137, 144),
    'linen':      (238, 242, 244),
    'linen_lo':   (214, 221, 226),
    'blanket':    (108, 142, 190),
    'blanket_lo': (78, 108, 152),
    'pillow':     (248, 250, 251),

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
                    self.shade(x, y, (255, 255, 255), top)
                elif not solid(x, y + 1) or not solid(x + 1, y):
                    self.shade(x, y, (40, 48, 52), bottom)

    def frame(self, x0, y0, x1, y1, col):
        self.hline(x0, x1, y0, col)
        self.hline(x0, x1, y1, col)
        self.vline(x0, y0, y1, col)
        self.vline(x1, y0, y1, col)


# ---------------------------------------------------------------- surfaces
def floor(seed, seams=True, scuff=False):
    """
    Vinyl sheet flooring. Seams are drawn on two edges only and kept close in value to
    the fill, so a field of these reads as a floor rather than as a grid of boxes — the
    heavy grey gridlines were most of what made the old floor look like a placeholder.
    """
    t = Tile(C['floor'])
    rnd = random.Random(seed)
    for _ in range(10):
        x, y = rnd.randrange(TD), rnd.randrange(TD)
        t.set(x, y, C['speck'] if rnd.random() < 0.4 else C['floor_hi'])
    if seams:
        t.hline(0, TD - 1, 0, C['floor_seam'])
        t.vline(0, 0, TD - 1, C['floor_seam'])
    if scuff:
        for i in range(7):
            t.set(6 + i, 20 + (i % 2), C['floor_lo'])
        for i in range(5):
            t.set(19 + i, 11 - (i % 2), C['floor_lo'])
    return t


def wall_upper():
    """Painted wall above the dado rail."""
    t = Tile(C['wall'])
    t.hline(0, TD - 1, TD - 1, C['wall_lo'])
    return t


def wall_lower():
    """Wall meeting the floor: dado shadow at the top, rubber skirting at the base."""
    t = Tile(C['wall'])
    t.hline(0, TD - 1, 0, C['wall_lo'])
    t.rect(0, TD - 6, TD - 1, TD - 1, C['skirt'])
    t.hline(0, TD - 1, TD - 6, C['skirt_hi'])
    return t


def wall_side(left=True):
    """
    Vertical wall run. Needs its own tile because wall_lower's skirting is a horizontal
    band, which reads as a floor stripe when stacked down a side wall.
    """
    t = Tile(C['wall'])
    if left:
        t.rect(TD - 6, 0, TD - 1, TD - 1, C['skirt'])
        t.vline(TD - 6, 0, TD - 1, C['skirt_hi'])
        t.vline(0, 0, TD - 1, C['wall_lo'])
    else:
        t.rect(0, 0, 5, TD - 1, C['skirt'])
        t.vline(5, 0, TD - 1, C['skirt_hi'])
        t.vline(TD - 1, 0, TD - 1, C['wall_lo'])
    return t


def curtain_rail():
    """Ceiling track the cubicle curtain hangs from."""
    t = Tile(C['wall'])
    t.rect(0, 6, TD - 1, 9, C['rail'])
    t.hline(0, TD - 1, 9, C['rail_lo'])
    for x in range(2, TD, 6):
        t.vline(x, 10, 12, C['rail_lo'])
    return t


def curtain(offset=0):
    """
    Hanging cubicle curtain. The fold pattern is offset per variant so a run of them
    reads as continuous fabric instead of a repeating stripe.
    """
    t = Tile(C['curt'])
    for x in range(TD):
        phase = (x + offset) % 8
        if phase in (0, 1):
            t.vline(x, 0, TD - 1, C['curt_lo'])
        elif phase in (4, 5):
            t.vline(x, 0, TD - 1, C['curt_hi'])
    # Mesh panel along the top, as real cubicle curtains have.
    for x in range(0, TD, 2):
        t.set(x, 2, C['curt_hi'])
        t.set(x, 4, C['curt_hi'])
    return t


def curtain_hem():
    """Bottom of the curtain, hanging clear of the floor."""
    t = curtain(0)
    t.clear(0, TD - 8, TD - 1, TD - 1)
    t.hline(0, TD - 1, TD - 9, C['curt_lo'])
    return t


# ---------------------------------------------------------------- bed
# A trolley bed spans 2 tiles across and 3 down. Drawing it whole and slicing it is far
# easier to get right than drawing six tiles that each have to guess where the others'
# edges fall — the first attempt did the latter and the seams never lined up.
BED_W, BED_H = TD * 2, TD * 3


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

    L, R = 6, BED_W - 7          # frame edges
    HEAD, FOOT = 4, BED_H - 5

    # Frame
    rect(L, HEAD, R, FOOT, C['metal_lo'])
    rect(L + 2, HEAD + 2, R - 2, FOOT - 2, C['linen'])

    # Head and foot boards
    rect(L - 2, HEAD - 4, R + 2, HEAD + 1, C['metal'])
    hline(L - 2, R + 2, HEAD - 4, (198, 206, 212))
    rect(L - 2, FOOT - 1, R + 2, FOOT + 4, C['metal'])
    hline(L - 2, R + 2, FOOT - 1, (198, 206, 212))

    # Pillow
    rect(L + 5, HEAD + 5, R - 5, HEAD + 22, C['pillow'])
    for x in range(L + 5, R - 4):
        px[x, HEAD + 22] = C['linen_lo'] + (255,)
    vline(R - 5, HEAD + 5, HEAD + 22, C['linen_lo'])

    # Blanket over the lower two thirds, with a turned-back top edge
    top = HEAD + 30
    rect(L + 2, top, R - 2, FOOT - 2, C['blanket'])
    rect(L + 2, top, R - 2, top + 4, C['linen'])        # turned-back sheet
    hline(L + 2, R - 2, top + 5, C['blanket_lo'])
    hline(L + 2, R - 2, top, C['linen_lo'])
    # Soft folds, irregular so it does not read as corrugation
    for y in (top + 14, top + 27, top + 41):
        hline(L + 4, R - 4, y, C['blanket_lo'])

    # Cot side rails — the clearest signal that this is a hospital bed
    for x0 in (L - 3, R + 1):
        rect(x0, HEAD + 12, x0 + 2, FOOT - 8, C['metal'])
        vline(x0 + 2, HEAD + 12, FOOT - 8, C['metal_lo'])
        for y in (HEAD + 12, HEAD + 24, FOOT - 8):
            rect(x0, y, x0 + 2, y + 1, (206, 214, 220))
    return im


def _bed_shadowed():
    im = _bed_full()
    out = Image.new('RGBA', (BED_W, BED_H), (0, 0, 0, 0))
    for y in range(BED_H):
        for x in range(BED_W):
            if im.getpixel((x, y))[3] > 0 and x + 3 < BED_W and y + 3 < BED_H:
                out.putpixel((x + 3, y + 3), (44, 52, 54, 76))
    out.alpha_composite(im)
    return out


_BED = _bed_shadowed()


def bed_piece(col, row):
    """col: 0=left 1=right.  row: 0=head 1=middle 2=foot."""
    t = Tile()
    t.img.paste(_BED.crop((col * TD, row * TD, col * TD + TD, row * TD + TD)), (0, 0))
    return t


# ---------------------------------------------------------------- props
def monitor():
    """Cardiac monitor on a wall bracket, showing a trace."""
    t = Tile()
    t.rect(4, 4, 27, 24, C['case'])
    t.hline(4, 27, 4, C['case_lo'])
    t.rect(6, 6, 25, 20, C['screen'])
    # ECG trace: flat line with a QRS complex, plus a pulse-ox reading below.
    base = 13
    for x in range(7, 25):
        t.set(x, base, C['trace'])
    for dx, dy in ((12, -1), (13, -5), (14, 3), (15, -1)):
        t.set(dx, base + dy, C['trace'])
        t.set(dx, base + dy + 1, C['trace'])
    t.hline(7, 10, 18, C['amber'])
    t.rect(12, 25, 19, 27, C['case_lo'])   # bracket
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
    """Bedside locker."""
    t = Tile()
    t.rect(4, 8, 27, 29, C['wood'])
    t.hline(4, 27, 8, (206, 168, 128))
    t.frame(4, 8, 27, 29, C['wood_lo'])
    t.hline(6, 25, 16, C['wood_lo'])
    t.hline(13, 18, 13, C['wood_lo'])
    t.hline(13, 18, 22, C['wood_lo'])
    return t


def chair():
    """Visitor chair, seen from above-front like everything else."""
    t = Tile()
    t.rect(8, 6, 23, 12, C['blanket'])            # back
    t.hline(8, 23, 6, C['blanket_lo'])
    t.rect(7, 13, 24, 22, C['blanket_lo'])        # seat
    t.rect(9, 23, 11, 28, C['metal_lo'])          # legs
    t.rect(20, 23, 22, 28, C['metal_lo'])
    return t


def stool():
    t = Tile()
    t.rect(9, 10, 22, 19, C['case'])
    t.hline(9, 22, 10, C['case_lo'])
    t.vline(15, 20, 26, C['metal_lo'])
    t.vline(16, 20, 26, C['metal_lo'])
    t.hline(10, 21, 27, C['metal_lo'])
    return t


def trolley(top=True):
    """Crash / dressings trolley."""
    t = Tile()
    if top:
        t.rect(3, 8, 28, 12, C['metal'])
        t.hline(3, 28, 8, (200, 208, 214))
        t.rect(5, 13, 26, 20, C['red'])
        t.hline(5, 26, 13, (196, 92, 88))
        t.rect(5, 21, 26, 28, C['red'])
        t.hline(5, 26, 21, (196, 92, 88))
    else:
        t.rect(5, 0, 26, 6, C['red'])
        t.rect(3, 7, 28, 10, C['metal_lo'])
        t.rect(6, 11, 8, 15, C['case'])
        t.rect(23, 11, 25, 15, C['case'])
    return t


def sink():
    t = Tile()
    t.rect(6, 10, 25, 26, C['plastic'])
    t.frame(6, 10, 25, 26, C['line_soft'])
    t.rect(9, 14, 22, 23, (204, 214, 218))
    t.rect(15, 6, 16, 12, C['metal'])
    t.hline(15, 19, 6, C['metal'])
    return t


def sharps_bin():
    t = Tile()
    t.rect(9, 12, 22, 28, (232, 186, 58))
    t.frame(9, 12, 22, 28, (188, 146, 40))
    t.rect(9, 8, 22, 12, (208, 60, 52))
    t.hline(11, 20, 17, (188, 146, 40))
    return t


def waste_bin():
    t = Tile()
    t.rect(10, 12, 21, 28, C['plastic'])
    t.frame(10, 12, 21, 28, C['line_soft'])
    t.rect(9, 9, 22, 12, C['metal'])
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


def clock():
    t = wall_upper()
    t.rect(11, 8, 20, 17, C['plastic'])
    t.frame(11, 8, 20, 17, C['line'])
    t.vline(15, 10, 13, C['line'])
    t.hline(15, 18, 13, C['line'])
    return t


def door(left=True):
    t = Tile(C['wall'])
    if left:
        t.rect(6, 2, TD - 1, TD - 1, C['wood'])
        t.frame(6, 2, TD - 1, TD - 1, C['wood_lo'])
        t.rect(9, 5, TD - 4, 16, (206, 224, 232))   # vision panel
        t.frame(9, 5, TD - 4, 16, C['wood_lo'])
    else:
        t.rect(0, 2, TD - 7, TD - 1, C['wood'])
        t.frame(0, 2, TD - 7, TD - 1, C['wood_lo'])
        t.rect(3, 5, TD - 10, 16, (206, 224, 232))
        t.frame(3, 5, TD - 10, 16, C['wood_lo'])
        t.rect(TD - 12, 20, TD - 10, 23, C['metal_lo'])  # handle
    return t


def ceiling_light():
    t = Tile()
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
            t.shade(x, i, (40, 48, 52), a)
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
    ('oxygen',        oxygen_outlet),

    ('curtain_rail',  curtain_rail),
    # Hanging fabric: the shadow falls sideways onto the floor, not down.
    ('curtain_a',     standing(lambda: curtain(0), dx=3, dy=0, alpha=0.26, light=False)),
    ('curtain_b',     standing(lambda: curtain(3), dx=3, dy=0, alpha=0.26, light=False)),
    ('curtain_hem',   standing(curtain_hem, dx=3, dy=1, alpha=0.26, light=False)),
    ('door_l',        lambda: door(True)),
    ('door_r',        lambda: door(False)),
    ('clock',         clock),
    ('ceiling_light', ceiling_light),

    ('bed_hl',        lambda: bed_piece(0, 0)),
    ('bed_hr',        lambda: bed_piece(1, 0)),
    ('bed_ml',        lambda: bed_piece(0, 1)),
    ('bed_mr',        lambda: bed_piece(1, 1)),
    ('bed_fl',        lambda: bed_piece(0, 2)),
    ('bed_fr',        lambda: bed_piece(1, 2)),
    ('cabinet',       standing(cabinet)),
    ('monitor',       standing(monitor, dy=2, alpha=0.22)),

    ('iv_top',        standing(lambda: iv_stand(True), dy=0, alpha=0.18)),
    ('iv_bot',        standing(lambda: iv_stand(False), alpha=0.26)),
    ('chair',         standing(chair)),
    ('stool',         standing(stool)),
    ('trolley_top',   standing(lambda: trolley(True), dy=0, alpha=0.22)),
    ('trolley_bot',   standing(lambda: trolley(False))),
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
