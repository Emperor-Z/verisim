/**
 * In-character reading text for each test-menu item, keyed by `TestMenuItem.id`
 * (src/components/TestMenu.tsx, CHEST_PAIN_TESTS). Kept server-side so a permitted dispatch always
 * posts the same canonical result regardless of what the client sends — the client only supplies the
 * id, not the text.
 */
export const TEST_RESULT_LINES: Record<string, string> = {
  obs: 'Obs: pulse 96, RR 22, sats 97% on air, looks pale but alert.',
  ecg: '12-lead ECG: sinus tachycardia, 1mm ST depression in II, III, aVF. No acute ST elevation.',
  bloods: 'Bloods sent — troponin and FBC back in 20 minutes.',
  cannula: 'IV cannula sited, 18G, left ACF. Flushed, no issues.',
  gtn: 'GTN spray given sublingually. Ray reports the pain easing slightly after two minutes.',
  analgesia: 'Morphine given per protocol. Ray visibly settles, breathing slower within a few minutes.',
};

export function testResultLine(testId: string): string {
  return TEST_RESULT_LINES[testId] ?? 'Result recorded.';
}
