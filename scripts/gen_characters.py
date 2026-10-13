#!/usr/bin/env python3
"""
Generate public/assets/ae-characters.png — the VeriSim Scenario 01 character sheet.

Replaces the inherited AI Town `32x32folk.png` villagers (anime townsfolk in fantasy
dress) with four figures that belong in A&E Bay 3. Drawn in the DawnBringer-32 palette
that `ae-bay-tileset.png` already uses.

Frame is 32 wide x 40 tall, not the 32x32 "chibi" the sheet started at (a 32x48 first pass
overshot — tall enough to look like the figures were on stilts). The extra 8 rows go
entirely into the torso and legs — the head is a fixed ~12px regardless of frame height —
which is the standard top-down-RPG trick for getting an adult read: the sprite is taller
than the tile it stands on and is anchored at the feet, so it rises out of its own
footprint the way a real person would, just not by much (see src/components/Character.tsx,
which anchors on FOOT_Y rather than frame centre).

Sheet layout: one character block is 96w x 160h (3 walk frames across, 4 directions down,
each 32x40). Blocks left-to-right: ray, kelly, sam, clinician. Sheet = 384 x 160.

Run:  python3 scripts/gen_characters.py
"""

from PIL import Image

FRAME_W = 32
FRAME_H = 40
FRAMES = 3
DIRS = ['down', 'left', 'right', 'up']

# ---------------------------------------------------------------- palette
# DawnBringer 32 — the palette ae-bay-tileset.png is drawn in.
P = {
    'outline':     (34, 32, 52),
    'shadow':      (69, 40, 60),

    'skin_l':      (238, 195, 154),
    'skin_ls':     (217, 160, 102),
    'skin_d':      (143, 86, 59),
    'skin_ds':     (102, 57, 49),

    'white':       (255, 255, 255),
    'offwhite':    (223, 231, 236),
    'lightgrey':   (155, 173, 183),
    'midgrey':     (132, 126, 135),
    'darkgrey':    (89, 86, 82),

    'navy':        (63, 63, 116),
    'navy_d':      (34, 32, 52),
    'blue':        (91, 110, 225),
    'blue_l':      (99, 155, 255),
    'blue_pale':   (203, 219, 252),
    'teal':        (95, 205, 228),

    'brown':       (143, 86, 59),
    'brown_d':     (102, 57, 49),
    'olive':       (138, 111, 48),
    'olive_d':     (82, 75, 36),

    'red':         (172, 50, 50),
    'red_d':       (105, 30, 30),
    'green':       (55, 148, 110),
    'slate':       (50, 60, 57),
    'grey_hair':   (167, 183, 191),
    'grey_hair_d': (132, 126, 135),
}

# Selective-outlining / hue-shift targets: shadows lean cool blue-violet, highlights lean
# warm cream, rather than sliding every colour toward neutral black or white.
SHADOW_TINT = (46, 48, 92)
HILITE_TINT = (255, 226, 168)


class Px:
    """A scratch frame with clipped plotting and region shifting."""

    def __init__(self):
        self.d = {}

    def set(self, x, y, col):
        if 0 <= x < FRAME_W and 0 <= y < FRAME_H and col is not None:
            self.d[(x, y)] = col

    def hline(self, x0, x1, y, col):
        for x in range(x0, x1 + 1):
            self.set(x, y, col)

    def vline(self, x, y0, y1, col):
        for y in range(y0, y1 + 1):
            self.set(x, y, col)

    def rect(self, x0, y0, x1, y1, col):
        for y in range(y0, y1 + 1):
            self.hline(x0, x1, y, col)

    def shift_region(self, x0, y0, x1, y1, dx, dy):
        moved = {}
        for (x, y), c in list(self.d.items()):
            if x0 <= x <= x1 and y0 <= y <= y1:
                del self.d[(x, y)]
                moved[(x + dx, y + dy)] = c
        for (x, y), c in moved.items():
            self.set(x, y, c)

    def outline_alpha(self, col, skip=(), col_lit=None):
        """
        1px keyline around the silhouette, so figures read against the floor.

        Selective outlining ("selout"): where the keyline sits on the same side as the
        key light — above or to the left of the shape it borders — it's drawn in a
        lighter, warmer tone instead of the flat dark one. A uniform outline reads as a
        hard sticker edge; softening just the lit side is what makes an outlined sprite
        read as lit from a direction rather than just outlined.
        """
        # For each outline pixel, collect which side(s) of solid fill it borders. Key
        # light is upper-left, so a pixel bordering fill on its left (-1,0) or top (0,-1)
        # is on the lit side; one bordering fill on its right (1,0) or bottom (0,1) is on
        # the shadow side. A corner pixel bordering both stays on the dark tone.
        directions = {}
        for (x, y) in self.d:
            if (x, y) in skip:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in self.d:
                    directions.setdefault(n, set()).add((dx, dy))
        for (x, y), dirs in directions.items():
            if (x, y) in skip:
                continue
            lit = any(d in ((-1, 0), (0, -1)) for d in dirs) and \
                not any(d in ((1, 0), (0, 1)) for d in dirs)
            self.set(x, y, col_lit if (lit and col_lit) else col)

    def to_image(self):
        img = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
        for (x, y), c in self.d.items():
            if 0 <= x < FRAME_W and 0 <= y < FRAME_H:
                img.putpixel((x, y), c if len(c) == 4 else c + (255,))
        return img


# ---------------------------------------------------------------- body plan
# Head stays the same absolute size a 32-tall chibi used (~12px) — the extra frame
# height goes entirely into torso and legs, which is what turns "toy" into "adult".
HEAD_TOP = 2
HEAD_BOT = 13
NECK_Y = 14
TORSO_TOP = 15
TORSO_BOT = 28
LEG_TOP = 29
FOOT_Y = 36

CX = 16   # centre line: a row spans x = CX-h .. CX-1+h


def head_half(y, direction, wide=0):
    """Half-width of the head at row y. Side views are a narrower profile."""
    narrow = 1 if direction in ('left', 'right') else 0
    if y == HEAD_TOP:
        h = 5
    elif y == HEAD_TOP + 1:
        h = 6
    elif y >= HEAD_BOT:
        h = 5
    elif y >= HEAD_BOT - 1:
        h = 6
    else:
        h = 7
    return max(3, h - narrow + wide)


def torso_half(y, direction, build=0):
    """
    Half-width of the torso. Tapers waist-in, hip-out rather than running as a flat
    column top to bottom — over 19 rows (up from the original 8) a uniform width reads
    as a barrel rather than a body.
    """
    narrow = 2 if direction in ('left', 'right') else 0
    span = TORSO_BOT - TORSO_TOP
    t = (y - TORSO_TOP) / max(1, span)
    if t < 0.12:
        h = 7                     # shoulders
    elif t < 0.5:
        h = 7 - round(1 * ((t - 0.12) / 0.38))   # taper to the waist
    elif t < 0.7:
        h = 6
    else:
        h = 7                     # hips flare back out
    return max(4, h - narrow + build)


def draw_head(p, direction, skin, skin_s, wide=0):
    for y in range(HEAD_TOP, HEAD_BOT + 1):
        h = head_half(y, direction, wide)
        p.hline(CX - h, CX - 1 + h, y, skin)
    # Ambient occlusion under the jaw and down the shaded side.
    h = head_half(HEAD_BOT, direction, wide)
    p.hline(CX - h + 1, CX - 2 + h, HEAD_BOT, skin_s)
    for y in range(HEAD_TOP + 2, HEAD_BOT):
        h = head_half(y, direction, wide)
        p.set(CX - 1 + h, y, skin_s)
    # Side views get a nose bump on the facing edge.
    nose_y = (HEAD_TOP + HEAD_BOT) // 2
    if direction == 'left':
        h = head_half(nose_y, direction, wide)
        p.set(CX - h - 1, nose_y, skin)
        p.set(CX - h - 1, nose_y + 1, skin_s)
    elif direction == 'right':
        h = head_half(nose_y, direction, wide)
        p.set(CX - 1 + h + 1, nose_y, skin)
        p.set(CX - 1 + h + 1, nose_y + 1, skin_s)


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a[:3], b[:3]))


def draw_torso(p, direction, garment, garment_d, build=0):
    """
    Garment with a light-to-dark fall from shoulder to hem, a shaded side, and a centre
    seam. A flat fill left every character looking like a coloured rectangle next to
    furniture that now has three or four tones on it.
    """
    span = TORSO_BOT - TORSO_TOP
    for y in range(TORSO_TOP, TORSO_BOT + 1):
        h = torso_half(y, direction, build)
        t = (y - TORSO_TOP) / max(1, span)
        p.hline(CX - h, CX - 1 + h, y, mix(garment, garment_d, 0.45 * t))
    for y in range(TORSO_TOP, TORSO_BOT + 1):
        h = torso_half(y, direction, build)
        p.set(CX - 1 + h, y, garment_d)
        p.set(CX - h, y, mix(garment, HILITE_TINT, 0.18))
    # Shoulder highlight, waist crease and hem shadow.
    h = torso_half(TORSO_TOP, direction, build)
    p.hline(CX - h + 1, CX - 2 + h, TORSO_TOP, mix(garment, HILITE_TINT, 0.3))
    waist_y = TORSO_TOP + round(span * 0.5)
    h = torso_half(waist_y, direction, build)
    p.hline(CX - h + 1, CX - 2 + h, waist_y, mix(garment, garment_d, 0.5))
    h = torso_half(TORSO_BOT, direction, build)
    p.hline(CX - h, CX - 1 + h, TORSO_BOT, garment_d)
    if direction in ('down', 'up'):
        for y in range(TORSO_TOP + 2, TORSO_BOT):
            p.set(CX, y, mix(garment, garment_d, 0.55))


def arm_x(direction, build):
    """x of the left and right arm columns (2px each), just outside the torso shoulder."""
    h = torso_half(TORSO_TOP + 2, direction, build)
    return CX - h - 2, CX - 1 + h + 1


def draw_arms(p, direction, garment, garment_d, skin, sleeve_to, build, swing=0):
    """
    Arms hang at the sides, 2px wide — a single column read as a wire against the taller
    body. `swing` is the walk-cycle offset: +1/-1 moves each arm in opposite directions so
    the figure reads as walking, not sliding.
    """
    lx, rx = arm_x(direction, build)
    top = TORSO_TOP + 1
    bot = TORSO_BOT + 1   # hands reach to about the hip
    if direction in ('left', 'right'):
        x = lx if direction == 'left' else rx
        for y in range(top + swing, bot + swing):
            col = garment if y <= sleeve_to + swing else skin
            p.set(x, y, col)
            p.set(x + 1, y, col)
    else:
        for y in range(top + swing, bot + swing):
            col = garment if y <= sleeve_to + swing else skin
            p.set(lx, y, col)
            p.set(lx + 1, y, col)
        for y in range(top - swing, bot - swing):
            col = garment_d if y <= sleeve_to - swing else skin
            p.set(rx - 1, y, col)
            p.set(rx, y, col)


def draw_legs(p, direction, trouser, trouser_d, shoe, lift_left=0, lift_right=0):
    """Two legs with a gap between them, so the walk cycle is legible at 1x."""
    if direction in ('left', 'right'):
        lx0, lx1 = 12, 15
        rx0, rx1 = 16, 19
    else:
        lx0, lx1 = 11, 14
        rx0, rx1 = 17, 20
    for y in range(LEG_TOP, FOOT_Y):
        p.hline(lx0, lx1, y - lift_left, trouser)
        p.hline(rx0, rx1, y - lift_right, trouser_d)
    p.hline(lx0, lx1, FOOT_Y - lift_left, shoe)
    p.hline(rx0, rx1, FOOT_Y - lift_right, shoe)


def draw_face(p, direction, skin_s, eye=None, brow=False):
    """Eyes and brow. 'up' shows the back of the head, so nothing is drawn."""
    eye = eye or P['outline']
    ey = HEAD_TOP + 8
    if direction == 'down':
        p.vline(12, ey, ey + 1, eye)
        p.vline(19, ey, ey + 1, eye)
        p.set(12, ey, mix(eye, HILITE_TINT, 0.35))
        p.set(19, ey, mix(eye, HILITE_TINT, 0.35))
        p.hline(15, 16, ey + 4, skin_s)          # mouth
        if brow:
            p.hline(11, 13, ey - 2, skin_s)
            p.hline(18, 20, ey - 2, skin_s)
    elif direction == 'left':
        p.vline(12, ey, ey + 1, eye)
        if brow:
            p.hline(11, 13, ey - 2, skin_s)
    elif direction == 'right':
        p.vline(19, ey, ey + 1, eye)
        if brow:
            p.hline(18, 20, ey - 2, skin_s)


def draw_hair(p, direction, style, hair, hair_d, wide=0):
    """
    Hair carries most of the character identity at this size, so each style is
    shaped explicitly rather than tinted from a shared cap.

      'receding' — Ray: grey, hairline pulled back off a bare forehead
      'ponytail' — Kelly: gathered back, tail visible behind the head
      'crop'     — Sam: very short, tight to the skull
      'bob'      — Clinician: chin-length, tucked behind the ears
    """
    top = HEAD_TOP

    def cap(rows, col):
        for y in range(top, top + rows):
            h = head_half(y, direction, wide)
            p.hline(CX - h, CX - 1 + h, y, col)

    def sides(y0, y1, col):
        for y in range(y0, y1 + 1):
            h = head_half(y, direction, wide)
            p.set(CX - h, y, col)
            p.set(CX - 1 + h, y, col)

    if direction == 'up':
        # Back of the head: whatever the style, we see a full head of hair.
        for y in range(top, HEAD_BOT):
            h = head_half(y, direction, wide)
            p.hline(CX - h, CX - 1 + h, y, hair)
        h = head_half(HEAD_BOT - 1, direction, wide)
        p.hline(CX - h + 1, CX - 2 + h, HEAD_BOT - 1, hair_d)
        if style == 'ponytail':
            p.rect(CX - 2, HEAD_BOT - 1, CX + 1, HEAD_BOT + 3, hair)
            p.hline(CX - 1, CX, HEAD_BOT + 4, hair_d)
        elif style == 'bob':
            for y in range(HEAD_BOT - 1, HEAD_BOT + 2):
                h = head_half(HEAD_BOT - 1, direction, wide)
                p.hline(CX - h, CX - 1 + h, y, hair)
        return

    if style == 'receding':
        cap(3, hair)
        # Temples only from here down — the forehead stays bare.
        sides(top + 3, top + 4, hair)
        p.hline(CX - 3, CX + 2, top + 2, hair_d)   # thinning on top

    elif style == 'ponytail':
        cap(4, hair)
        sides(top + 4, top + 6, hair)
        p.hline(CX - 5, CX + 4, top + 4, hair)     # fringe
        # Tail, hanging behind whichever way she faces.
        if direction == 'down':
            p.vline(CX + 8, top + 3, top + 8, hair)
            p.vline(CX + 9, top + 4, top + 7, hair_d)
        elif direction == 'left':
            p.vline(CX + 6, top + 3, top + 9, hair)
            p.vline(CX + 7, top + 4, top + 8, hair_d)
        else:
            p.vline(CX - 7, top + 3, top + 9, hair)
            p.vline(CX - 8, top + 4, top + 8, hair_d)

    elif style == 'crop':
        cap(4, hair)
        sides(top + 4, top + 5, hair)
        p.hline(CX - 4, CX + 3, top + 3, hair_d)

    elif style == 'bob':
        cap(4, hair)
        p.hline(CX - 6, CX + 5, top + 4, hair)     # fringe
        sides(top + 4, HEAD_BOT - 2, hair)
        # Second column each side gives the bob some weight.
        for y in range(top + 5, HEAD_BOT - 2):
            h = head_half(y, direction, wide)
            p.set(CX - h + 1, y, hair_d)
            p.set(CX - 2 + h, y, hair_d)


def hair_highlight(p, direction, hair):
    """A sheen across the upper-left of the hair mass, so it reads as a rounded head."""
    lit = mix(hair, HILITE_TINT, 0.34)
    for y in range(HEAD_TOP + 1, HEAD_TOP + 4):
        h = head_half(y, direction)
        for x in range(CX - h + 1, CX - h + 5):
            if p.d.get((x, y)) == hair:
                p.set(x, y, lit)
    for x in range(CX - 4, CX + 1):
        if p.d.get((x, HEAD_TOP + 1)) == hair:
            p.set(x, HEAD_TOP + 1, lit)


def draw_accessory(p, kind, direction, build=0):
    """Props that carry the clinical role at a glance."""
    y0 = TORSO_TOP
    if kind == 'stethoscope' and direction != 'up':
        # Tubing round the neck, bell resting on the chest.
        p.set(CX - 4, y0, P['darkgrey'])
        p.set(CX + 3, y0, P['darkgrey'])
        p.set(CX - 4, y0 + 1, P['darkgrey'])
        p.set(CX + 3, y0 + 1, P['darkgrey'])
        p.set(CX - 3, y0 + 2, P['darkgrey'])
        p.set(CX + 2, y0 + 2, P['darkgrey'])
        p.set(CX + 2, y0 + 3, P['lightgrey'])

    elif kind == 'lanyard' and direction != 'up':
        # Ribbon over both shoulders with an ID card — fastest read of "staff".
        p.set(CX - 4, y0, P['blue_l'])
        p.set(CX + 3, y0, P['blue_l'])
        p.set(CX - 3, y0 + 1, P['blue_l'])
        p.set(CX + 2, y0 + 1, P['blue_l'])
        p.set(CX - 2, y0 + 2, P['blue_l'])
        p.set(CX + 1, y0 + 2, P['blue_l'])
        p.rect(CX - 2, y0 + 3, CX + 1, y0 + 5, P['offwhite'])
        p.hline(CX - 1, CX, y0 + 4, P['blue'])

    elif kind == 'phone' and direction != 'up':
        # Held low, screen lit — she reads symptoms off it.
        lx, rx = arm_x(direction, build)
        x = rx if direction != 'right' else lx
        y = TORSO_BOT + 1
        p.rect(x - 1, y, x, y + 2, P['outline'])
        p.set(x - 1, y + 1, P['teal'])

    elif kind == 'gown':
        # Open-backed hospital gown: ties down the spine when seen from behind,
        # a plain yoke and neck opening from the front.
        if direction == 'up':
            p.hline(CX - 3, CX + 2, y0 + 3, P['midgrey'])
            p.hline(CX - 3, CX + 2, y0 + 9, P['midgrey'])
        else:
            p.hline(CX - 2, CX + 1, y0, P['lightgrey'])


# ---------------------------------------------------------------- characters
# The visual half of the persona cards in docs/persona_cards.md.
CHARACTERS = {
    # 58, builder. Hospital gown pulled on over his own work trousers — he has
    # been made to change but hasn't accepted being a patient. Heavier build and
    # a receding grey hairline so he reads as the oldest figure in the bay.
    'ray': dict(
        skin=P['skin_l'], skin_s=P['skin_ls'],
        hair=P['grey_hair'], hair_d=P['grey_hair_d'], hair_style='receding',
        garment=P['offwhite'], garment_d=P['lightgrey'],
        trouser=P['olive'], trouser_d=P['olive_d'],
        shoe=P['brown_d'],
        build=1, wide=0, sleeve_to=TORSO_TOP + 6, brow=True,
        accessory='gown',
    ),
    # 29, came straight from work — red coat still on, phone in hand.
    'kelly': dict(
        skin=P['skin_l'], skin_s=P['skin_ls'],
        hair=P['brown_d'], hair_d=P['outline'], hair_style='ponytail',
        garment=P['red'], garment_d=P['red_d'],
        trouser=P['navy'], trouser_d=P['navy_d'],
        shoe=P['outline'],
        build=0, wide=0, sleeve_to=TORSO_BOT,
        accessory='phone',
    ),
    # 34, A&E staff nurse. Navy scrubs is the NHS nursing convention, and the
    # lanyard is the fastest read of "staff" at this size.
    'sam': dict(
        skin=P['skin_d'], skin_s=P['skin_ds'],
        hair=P['slate'], hair_d=P['outline'], hair_style='crop',
        garment=P['navy'], garment_d=P['navy_d'],
        trouser=P['navy'], trouser_d=P['navy_d'],
        shoe=P['outline'],
        build=0, wide=0, sleeve_to=TORSO_TOP + 8,
        accessory='lanyard',
    ),
    # The player. Pale-blue scrubs and a stethoscope — deliberately distinct
    # from Sam's navy, because they share the bay and must not be confused.
    'clinician': dict(
        skin=P['skin_l'], skin_s=P['skin_ls'],
        hair=P['brown'], hair_d=P['brown_d'], hair_style='bob',
        garment=P['blue_pale'], garment_d=P['lightgrey'],
        trouser=P['lightgrey'], trouser_d=P['midgrey'],
        shoe=P['white'],
        build=0, wide=0, sleeve_to=TORSO_TOP + 8,
        accessory='stethoscope',
    ),
}

ORDER = ['ray', 'kelly', 'sam', 'clinician']

# Walk cycle: frame 0 is the neutral stance, 1 and 2 are opposite strides.
# (lift_left, lift_right, arm_swing)
GAIT = [(0, 0, 0), (1, 0, 1), (0, 1, -1)]


def contact_shadow(p):
    """
    Soft ellipse under the feet.

    Without it the figures read as pasted onto the floor rather than standing on it.
    Returns the shadow's coordinates so the silhouette keyline can skip them.
    """
    cells = set()
    for dx in range(-7, 8):
        for dy in range(-2, 3):
            if (dx / 7.0) ** 2 + (dy / 2.2) ** 2 <= 1.0:
                x, y = CX + dx, FOOT_Y + 1 + dy
                edge = (dx / 7.0) ** 2 + (dy / 2.2) ** 2 > 0.55
                p.set(x, y, (34, 32, 52, 40 if edge else 70))
                cells.add((x, y))
    return cells


def key_light(p, skip):
    """
    Light the upper-left of the silhouette and shade the lower-right, matching the single
    top-left light the tileset props are drawn to. Without it the characters read as flat
    stickers next to furniture that has volume.
    """
    solid = {k for k in p.d if k not in skip}
    lit, shaded = [], []
    for (x, y) in solid:
        if p.d[(x, y)] == P['outline']:
            continue
        if (x, y - 1) not in solid or (x - 1, y) not in solid:
            lit.append((x, y))
        elif (x, y + 1) not in solid or (x + 1, y) not in solid:
            shaded.append((x, y))
    for (x, y), col, a in [(c, HILITE_TINT, 0.22) for c in lit] + \
                          [(c, SHADOW_TINT, 0.20) for c in shaded]:
        base = p.d[(x, y)][:3]
        p.set(x, y, tuple(round(b + (c - b) * a) for b, c in zip(base, col)))


def build_frame(spec, direction, frame):
    lift_l, lift_r, swing = GAIT[frame]
    p = Px()
    shadow = contact_shadow(p)

    draw_legs(p, direction, spec['trouser'], spec['trouser_d'], spec['shoe'],
              lift_l, lift_r)
    draw_torso(p, direction, spec['garment'], spec['garment_d'], spec['build'])
    draw_arms(p, direction, spec['garment'], spec['garment_d'], spec['skin'],
              spec['sleeve_to'], spec['build'], swing)
    p.hline(CX - 2, CX + 1, NECK_Y, spec['skin_s'])
    draw_head(p, direction, spec['skin'], spec['skin_s'], spec['wide'])
    draw_hair(p, direction, spec['hair_style'], spec['hair'], spec['hair_d'],
              spec['wide'])
    hair_highlight(p, direction, spec['hair'])
    draw_face(p, direction, spec['skin_s'], brow=spec.get('brow', False))
    draw_accessory(p, spec['accessory'], direction, spec['build'])

    p.outline_alpha(P['outline'], skip=shadow, col_lit=mix(P['outline'], HILITE_TINT, 0.4))
    key_light(p, shadow)
    return p.to_image()


def main():
    sheet = Image.new('RGBA', (FRAME_W * FRAMES * len(ORDER), FRAME_H * len(DIRS)), (0, 0, 0, 0))
    for bi, name in enumerate(ORDER):
        spec = CHARACTERS[name]
        for di, direction in enumerate(DIRS):
            for f in range(FRAMES):
                sheet.paste(build_frame(spec, direction, f),
                            (bi * FRAME_W * FRAMES + f * FRAME_W, di * FRAME_H))
    out = 'public/assets/ae-characters.png'
    sheet.save(out)
    print(f'wrote {out}  {sheet.size[0]}x{sheet.size[1]}')


if __name__ == '__main__':
    main()
