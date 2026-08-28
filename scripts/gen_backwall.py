#!/usr/bin/env python3
"""
Generate public/assets/ae-back-wall.png — a tall, 3/4-style overlay for Bay 3's back wall.

The tilemap itself (scripts/gen_tileset.py / gen_map.py) is a flat 32x32 grid, and the
engine's renderer (src/components/PixiStaticMap.tsx) draws every cell at exactly one tile
square with no notion of height — a wall can only ever be as tall as the row it sits in.
That is fine for a floor, but it is exactly why a "3/4" room reads as flat: real walls
have a visible face that stands up from the floor plan, not a single top-down square.

This is a free-form image, not a tile: one continuous strip spanning the whole back wall
(X0..X1 in scripts/gen_map.py), rendered as a client-side overlay in src/components/
BackWall.tsx, positioned in world space and drawn after the floor but before the
characters — so it can be taller than its row and still occlude correctly. It carries the
monitor, oxygen outlet, gel dispenser and clock at a size actually proportioned against the
character sheet's new height (scripts/gen_characters.py), rather than squeezed into a
single 32px tile.

Run:  python3 scripts/gen_backwall.py
"""

import json
import random
from PIL import Image

TD = 32
# Must match X0, X1, WALL_TOP_Y, BED_X in scripts/gen_map.py.
X0, X1 = 5, 19
BED_X = 8
TILES_W = X1 - X0 + 1
W = TILES_W * TD

# Total wall face height: the ceiling-wall row, the base-wall row, and a kick that
# projects a little further down into the floor to read as the wall having real
# thickness — the single biggest cue that turns a flat top-down strip into a 3/4 one.
TOP_H, MID_H, KICK_H = TD, TD, 8
H = TOP_H + MID_H + KICK_H

C = {
    'shadow_tint': (46, 48, 92),
    'hilite_tint': (255, 226, 168),
    'wall_hi':    (255, 250, 238),
    'wall':       (248, 240, 222),
    'wall_lo':    (226, 214, 190),
    'dado':       (94, 158, 198),
    'skirt_hi':   (120, 168, 202),
    'skirt':      (70, 122, 168),
    'skirt_lo':   (48, 92, 132),
    'case':       (58, 64, 72),
    'case_lo':    (38, 42, 50),
    'case_hi':    (86, 94, 104),
    'screen':     (16, 30, 24),
    'trace':      (92, 224, 138),
    'amber':      (232, 176, 72),
    'metal':      (176, 184, 190),
    'metal_lo':   (128, 137, 144),
    'metal_hi':   (214, 222, 228),
    'plastic':    (222, 226, 228),
    'line_soft':  (150, 158, 158),
    'wood':       (185, 144, 106),
    'wood_lo':    (150, 112, 80),
    'red':        (172, 66, 62),
}


class Canvas:
    def __init__(self, w, h):
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    def set(self, x, y, col):
        if 0 <= x < self.img.width and 0 <= y < self.img.height and col:
            self.img.putpixel((x, y), col + (255,) if len(col) == 3 else col)

    def rect(self, x0, y0, x1, y1, col):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, col)

    def hline(self, x0, x1, y, col):
        self.rect(x0, y1 if False else x1, x1, y, col) if False else \
            [self.set(x, y, col) for x in range(x0, x1 + 1)]

    def vline(self, x, y0, y1, col):
        for y in range(y0, y1 + 1):
            self.set(x, y, col)

    def frame(self, x0, y0, x1, y1, col):
        self.hline(x0, x1, y0, col)
        self.hline(x0, x1, y1, col)
        self.vline(x0, y0, y1, col)
        self.vline(x1, y0, y1, col)


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a[:3], b[:3]))


def _speckle(cv, x0, y0, x1, y1, seed, density=40):
    rnd = random.Random(seed)
    for _ in range(density):
        x = rnd.randrange(x0, x1 + 1)
        y = rnd.randrange(y0, y1 + 1)
        cv.set(x, y, mix(C['wall'], C['wall_lo'], 0.4 if rnd.random() < 0.6 else 0.2))


def base_wall(cv):
    """
    The plain wall face: painted panel, moulded dado rail, wipe-clean band, skirting,
    kick. The dado is a lit top edge, a groove and a shadowed underside — a real rail
    profile, not the single flat line the first version drew — matching the moulding
    scripts/gen_tileset.py's wall_lower() carries.
    """
    cv.rect(0, 0, W - 1, TOP_H - 1, C['wall'])
    cv.hline(0, W - 1, 0, C['wall_hi'])
    cv.hline(0, W - 1, 1, C['wall_hi'])
    cv.hline(0, W - 1, TOP_H - 1, C['wall_lo'])
    _speckle(cv, 0, 0, W - 1, TOP_H - 1, seed=21)

    y0 = TOP_H
    cv.hline(0, W - 1, y0, mix(C['dado'], C['hilite_tint'], 0.35))
    cv.hline(0, W - 1, y0 + 1, C['dado'])
    cv.hline(0, W - 1, y0 + 2, mix(C['dado'], C['shadow_tint'], 0.35))
    cv.hline(0, W - 1, y0 + 3, C['wall_hi'])
    cv.rect(0, y0 + 4, W - 1, y0 + MID_H - 8, C['wall'])
    _speckle(cv, 0, y0 + 4, W - 1, y0 + MID_H - 8, seed=22)
    cv.hline(0, W - 1, y0 + MID_H - 7, C['wall_lo'])
    cv.rect(0, y0 + MID_H - 6, W - 1, y0 + MID_H - 1, C['skirt'])
    cv.hline(0, W - 1, y0 + MID_H - 6, C['skirt_hi'])

    # Kick: the wall's toe, standing proud of the floor plane. Shaded top-to-bottom so it
    # reads as receding away from the viewer rather than as another flat panel.
    ky0 = TOP_H + MID_H
    for i in range(KICK_H):
        t = i / max(1, KICK_H - 1)
        shade = tuple(round(a + (b - a) * t) for a, b in zip(C['skirt_lo'], C['shadow_tint']))
        cv.hline(0, W - 1, ky0 + i, shade)
    cv.hline(0, W - 1, ky0, C['skirt_lo'])

    # Vertical seams at each tile boundary, faint — the wall is built from panels.
    for i in range(TILES_W + 1):
        x = i * TD
        if 0 < x < W:
            cv.vline(x, 0, TOP_H + MID_H - 1, C['wall_lo'])


def col(x0, y0):
    """Shift helper: returns a rect-drawer offset to (x0, y0) on the canvas."""
    def r(cv, dx0, dy0, dx1, dy1, c):
        cv.rect(x0 + dx0, y0 + dy0, x0 + dx1, y0 + dy1, c)
    def h(cv, dx0, dx1, dy, c):
        cv.hline(x0 + dx0, x0 + dx1, y0 + dy, c)
    def v(cv, dx, dy0, dy1, c):
        cv.vline(x0 + dx, y0 + dy0, y0 + dy1, c)
    def f(cv, dx0, dy0, dx1, dy1, c):
        cv.frame(x0 + dx0, y0 + dy0, x0 + dx1, y0 + dy1, c)
    return r, h, v, f


def monitor(cv, cx):
    """
    Cardiac monitor on its wall bracket, drawn to its own scale rather than a 32px tile —
    proportioned against the character sheet: a bedside monitor sits roughly chest-to-
    eye height on an adult (scripts/gen_characters.py has the head at rows 2-13 of a
    45px-tall standing figure), so the case is drawn about 40% of a standing figure's
    height, mounted at the top of the mid band.
    """
    x0, y0 = cx - 22, TOP_H - 30
    r, h, v, f = col(x0, y0)
    r(cv, 0, 0, 43, 6, C['metal_lo'])            # bracket
    h(cv, 4, 39, 6, C['metal'])
    r(cv, 8, 0, 15, 46, C['case'])                # neck (narrower than in-tile version)
    r(cv, -8, 34, 51, 74, C['case'])              # case
    h(cv, -8, 51, 34, C['case_hi'])
    h(cv, -8, 51, 35, C['case_hi'])
    v(cv, -8, 34, 74, C['case_hi'])
    v(cv, 51, 34, 74, C['case_lo'])
    r(cv, -4, 39, 47, 68, C['screen'])
    f(cv, -4, 39, 47, 68, (10, 20, 16))
    base = y0 + 52
    for x in range(x0 - 2, x0 + 45):
        cv.set(x, base, (36, 96, 62))
    for origin in (x0 - 1, x0 + 16, x0 + 33):
        for dx, dy in ((2, -2), (3, -10), (4, 6), (5, 0)):
            cv.set(origin + dx, base + dy, C['trace'])
            cv.set(origin + dx, base + dy + 1, C['trace'])
    for x in range(x0, x0 + 8):
        cv.set(x, y0 + 62, C['trace'])
    for x in range(x0 + 30, x0 + 38):
        cv.set(x, y0 + 62, C['amber'])
    # Leads trailing down off the bottom of the case toward the patient.
    for i, dx in enumerate((-2, 4, 10)):
        v(cv, 22 + dx, 74, 82 + i * 4, C['case'])


def oxygen(cv, cx):
    x0, y0 = cx - 11, TOP_H + 6
    r, h, v, f = col(x0, y0)
    r(cv, 0, 0, 21, 20, C['plastic'])
    f(cv, 0, 0, 21, 20, C['line_soft'])
    r(cv, 3, 4, 9, 15, (108, 172, 214))
    r(cv, 13, 4, 19, 15, C['case'])


def gel(cv, cx):
    x0, y0 = cx - 8, TOP_H + 8
    r, h, v, f = col(x0, y0)
    r(cv, 0, 0, 15, 18, C['plastic'])
    f(cv, 0, 0, 15, 18, C['line_soft'])
    r(cv, 2, 2, 13, 10, (198, 220, 230))
    r(cv, 4, 12, 11, 15, C['metal_lo'])


def clock(cv, cx):
    x0, y0 = cx - 12, 6
    r, h, v, f = col(x0, y0)
    r(cv, 0, 0, 23, 23, C['plastic'])
    f(cv, 0, 0, 23, 23, (86, 94, 96))
    v(cv, 11, 4, 11, (86, 94, 96))
    h(cv, 11, 18, 11, (86, 94, 96))


def door(cv, x0):
    """A single-leaf door set into the wall, drawn at full band height for once."""
    y0 = TOP_H - 2
    y1 = TOP_H + MID_H - 6
    cv.rect(x0, y0, x0 + TD - 1, y1, C['wood_lo'])
    cv.rect(x0 + 1, y0 + 1, x0 + TD - 2, y1, C['wood'])
    cv.vline(x0 + 1, y0 + 1, y1, (206, 168, 128))
    cv.vline(x0 + TD - 2, y0 + 1, y1, C['wood_lo'])
    cv.rect(x0 + 5, y0 + 5, x0 + TD - 6, y0 + 22, (206, 224, 232))
    cv.frame(x0 + 5, y0 + 5, x0 + TD - 6, y0 + 22, C['wood_lo'])
    cv.rect(x0 + TD - 9, y0 + 32, x0 + TD - 7, y0 + 36, C['metal'])


_DIGITS = {
    '3': ['111', '..1', '111', '..1', '111'],
}


def bay_sign(cv, cx):
    """Wall plaque — the bay number, the way a real ward bay is signed."""
    x0, y0 = cx - 13, 4
    cv.rect(x0, y0, x0 + 26, y0 + 20, C['dado'])
    cv.frame(x0, y0, x0 + 26, y0 + 20, mix(C['dado'], C['hilite_tint'], 0.4))
    scale = 3
    for ry, row in enumerate(_DIGITS['3']):
        for rx, bit in enumerate(row):
            if bit == '1':
                cv.rect(x0 + 8 + rx * scale, y0 + 3 + ry * scale,
                        x0 + 8 + rx * scale + scale - 1, y0 + 3 + ry * scale + scale - 1,
                        C['wall_hi'])


def supply_shelf(cv, cx):
    """
    Wall-mounted stock shelving — three shelves of colour-coded boxes. The wall had
    equipment but nothing that reads as day-to-day clutter; a shelf like this is what
    sells a bay as lived-in rather than a showroom.
    """
    x0, y0 = cx - 15, TOP_H - 4
    h = MID_H - 8
    cv.rect(x0, y0, x0 + 30, y0 + h, C['wood_lo'])
    cv.rect(x0 + 1, y0 + 1, x0 + 29, y0 + h - 1, C['wall_lo'])
    shelf_ys = [y0 + 2, y0 + 2 + h // 3, y0 + 2 + 2 * h // 3]
    box_colours = [(214, 96, 92), (94, 168, 214), (232, 186, 58), (96, 176, 128)]
    rnd = random.Random(88)
    for si, sy in enumerate(shelf_ys):
        cv.hline(x0 + 1, x0 + 29, sy, C['wood'])
        cv.hline(x0 + 1, x0 + 29, sy + 1, C['wood_lo'])
        x = x0 + 2
        while x < x0 + 27:
            w = rnd.choice((4, 5, 6))
            if x + w > x0 + 28:
                break
            col = box_colours[(si + x) % len(box_colours)]
            bh = rnd.choice((5, 6))
            cv.rect(x, sy + 2, x + w - 1, sy + 1 + bh, col)
            cv.hline(x, x + w - 1, sy + 2, mix(col, C['hilite_tint'], 0.35))
            x += w + 1


def whiteboard(cv, cx):
    """Patient status board — NEWS score / obs tracker, the kind every real bay has."""
    x0, y0 = cx - 17, 6
    cv.rect(x0, y0, x0 + 34, y0 + 22, C['plastic'] if 'plastic' in C else (222, 226, 228))
    cv.frame(x0, y0, x0 + 34, y0 + 22, C['metal_lo'] if 'metal_lo' in C else C['skirt'])
    cv.hline(x0 + 1, x0 + 33, y0 + 6, (200, 60, 56))
    for row in range(3):
        y = y0 + 10 + row * 4
        cv.hline(x0 + 3, x0 + 3 + [16, 22, 12][row], y, (150, 158, 158))
    cv.rect(x0 + 26, y0 - 3, x0 + 29, y0, (60, 66, 70))   # pen on a cord
    cv.vline(x0 + 27, y0, y0 + 4, (60, 66, 70))


def screen_divider(cv, cx):
    """
    Mobile privacy screen — a folding 3-panel curtain screen on castors, the freestanding
    piece every A&E bay has spare for exactly this kind of consultation. Floor-standing,
    so it's drawn tall (kick + mid band) rather than as a small wall fitting.
    """
    x0 = cx - 21
    y0 = TOP_H + MID_H - 46
    panel_w = 14
    for i in range(3):
        px0 = x0 + i * (panel_w - 2)
        shade = [C['curt'], C['curt_hi'], C['curt']][i] if 'curt' in C else C['dado']
        cv.rect(px0, y0, px0 + panel_w - 1, y0 + 40, shade)
        cv.vline(px0, y0, y0 + 40, mix(shade, C['hilite_tint'], 0.2))
        cv.vline(px0 + panel_w - 1, y0, y0 + 40, mix(shade, C['shadow_tint'], 0.25))
        cv.hline(px0, px0 + panel_w - 1, y0, mix(shade, C['shadow_tint'], 0.3))
        cv.rect(px0 + 4, y0 + 41, px0 + 5, y0 + 44, C['metal_lo'])   # castor leg
        cv.rect(px0 + panel_w - 6, y0 + 41, px0 + panel_w - 5, y0 + 44, C['metal_lo'])


def main():
    cv = Canvas(W, H)
    base_wall(cv)
    door(cv, 1 * TD)                                  # X0+1
    clock(cv, 1 * TD + TD // 2)
    # Bed is 2 tiles wide (BED_X, BED_X+1) — the monitor centres on the boundary between
    # them, and oxygen/gel sit one tile clear on either side.
    monitor(cv, (BED_X - X0) * TD + TD)
    oxygen(cv, (BED_X - 1 - X0) * TD + TD // 2)
    gel(cv, (BED_X + 2 - X0) * TD + TD // 2)
    # Free stretch of wall between the bed's fittings and the neighbouring bay.
    bay_sign(cv, (BED_X + 4 - X0) * TD + TD // 2)
    supply_shelf(cv, (BED_X + 6 - X0) * TD + TD // 2)
    # Free stretches of wall: between gel and the sign, and between the neighbouring
    # bay's bed and the room's outer curtain.
    screen_divider(cv, (BED_X + 3 - X0) * TD + TD // 2)
    whiteboard(cv, (BED_X + 9 - X0) * TD + TD // 2)
    out = 'public/assets/ae-back-wall.png'
    cv.img.save(out)
    meta = dict(x0=X0, y0=0, tileTop=0, w=W, h=H, topH=TOP_H, midH=MID_H, kickH=KICK_H, tileDim=TD)
    json.dump(meta, open('data/backWallMeta.json', 'w'), indent=2)
    print(f'wrote {out}  {W}x{H}')


if __name__ == '__main__':
    main()
