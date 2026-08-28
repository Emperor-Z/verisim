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


def base_wall(cv):
    """The plain wall face: painted panel, dado rail, wipe-clean band, skirting, kick."""
    cv.rect(0, 0, W - 1, TOP_H - 1, C['wall'])
    cv.hline(0, W - 1, 0, C['wall_hi'])
    cv.hline(0, W - 1, 1, C['wall_hi'])
    cv.hline(0, W - 1, TOP_H - 1, C['wall_lo'])

    y0 = TOP_H
    cv.hline(0, W - 1, y0, C['dado'])
    cv.hline(0, W - 1, y0 + 1, C['wall_hi'])
    cv.rect(0, y0 + 2, W - 1, y0 + MID_H - 8, C['wall'])
    cv.hline(0, W - 1, y0 + MID_H - 7, C['wall_lo'])
    cv.rect(0, y0 + MID_H - 6, W - 1, y0 + MID_H - 1, C['skirt'])
    cv.hline(0, W - 1, y0 + MID_H - 6, C['skirt_hi'])

    # Kick: the wall's toe, standing proud of the floor plane. Shaded top-to-bottom so it
    # reads as receding away from the viewer rather than as another flat panel.
    ky0 = TOP_H + MID_H
    for i in range(KICK_H):
        t = i / max(1, KICK_H - 1)
        shade = tuple(round(a + (b - a) * t) for a, b in zip(C['skirt_lo'], (44, 52, 54)))
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
    out = 'public/assets/ae-back-wall.png'
    cv.img.save(out)
    meta = dict(x0=X0, y0=0, tileTop=0, w=W, h=H, topH=TOP_H, midH=MID_H, kickH=KICK_H, tileDim=TD)
    json.dump(meta, open('data/backWallMeta.json', 'w'), indent=2)
    print(f'wrote {out}  {W}x{H}')


if __name__ == '__main__':
    main()
