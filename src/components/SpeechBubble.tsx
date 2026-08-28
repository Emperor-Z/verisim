import { useCallback, useMemo } from 'react';
import { Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

// Sized against the 32px sprite and the 32px tile grid: wide enough for a clause,
// narrow enough that three people talking in one bay don't overlap into mush.
const MAX_WIDTH = 132;
const PAD_X = 6;
const PAD_Y = 4;
const TAIL_H = 5;
const FONT_SIZE = 11;

const BG = 0xfdfdf6;
const BORDER = 0x222034;
const TEXT = 0x222034;

/**
 * A speech bubble drawn above a character in the world.
 *
 * The map previously showed only a '💬' emoji while someone was talking, so a bystander
 * conversation was visible as an activity but unreadable as dialogue. This puts the words
 * where the speaker is.
 */
export function SpeechBubble({ x, y, text }: { x: number; y: number; text: string }) {
  const style = useMemo(
    () =>
      new PIXI.TextStyle({
        fontFamily: ['VCR OSD Mono', 'monospace'],
        fontSize: FONT_SIZE,
        fill: TEXT,
        wordWrap: true,
        wordWrapWidth: MAX_WIDTH - PAD_X * 2,
        lineHeight: FONT_SIZE + 3,
      }),
    [],
  );

  // Measure before drawing so the bubble wraps to the text rather than the text to a
  // fixed box — short lines like "On it." get a short bubble.
  const metrics = useMemo(() => PIXI.TextMetrics.measureText(text, style), [text, style]);
  const w = Math.ceil(metrics.width) + PAD_X * 2;
  const h = Math.ceil(metrics.height) + PAD_Y * 2;

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.lineStyle(1, BORDER, 1, 0);
      g.beginFill(BG);
      g.drawRoundedRect(-w / 2, -h, w, h, 3);
      g.endFill();
      // Tail pointing down at the speaker's head.
      g.lineStyle(0);
      g.beginFill(BG);
      g.moveTo(-3, 0);
      g.lineTo(3, 0);
      g.lineTo(0, TAIL_H);
      g.closePath();
      g.endFill();
      g.lineStyle(1, BORDER, 1, 0);
      g.moveTo(-3, 0);
      g.lineTo(0, TAIL_H);
      g.lineTo(3, 0);
    },
    [w, h],
  );

  return (
    <Container x={x} y={y} eventMode="none">
      <Graphics draw={draw} />
      <Text text={text} style={style} x={-w / 2 + PAD_X} y={-h + PAD_Y} resolution={2} />
    </Container>
  );
}
