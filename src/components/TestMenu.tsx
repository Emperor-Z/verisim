import clsx from 'clsx';
import {
  consentGiven,
  type TestCategory,
  type TrustState,
} from '../../convex/verisim/consentGate';

/**
 * VeriSim test-menu panel (presentation only, fully prop-driven).
 *
 * Renders the clinical actions the clinician can attempt and greys out the ones the patient has not
 * consented to yet — the visible half of the consent-gate mechanic (logic in
 * convex/verisim/consentGate.ts, spec in docs/consent_gate.md). It holds no state of its own: the
 * parent owns the `TrustState`, calls `evaluateTestRequest` on a click, and feeds back `lastRefusal`
 * so a blocked attempt shows the patient's in-character refusal. This keeps the component trivial to
 * unit-test / storybook and decoupled from Convex wiring (still to be built).
 */

export interface TestMenuItem {
  id: string;
  label: string;
  category: TestCategory;
}

// Scenario 01 default menu (persona_cards.md). Parameterise per scenario later.
export const CHEST_PAIN_TESTS: TestMenuItem[] = [
  { id: 'obs', label: 'Observations (pulse, resp, colour)', category: 'observation' },
  { id: 'ecg', label: '12-lead ECG', category: 'invasive' },
  { id: 'bloods', label: 'Bloods (troponin, FBC)', category: 'invasive' },
  { id: 'cannula', label: 'IV cannula', category: 'invasive' },
  { id: 'gtn', label: 'GTN spray', category: 'medication' },
  { id: 'analgesia', label: 'Analgesia (morphine)', category: 'medication' },
];

function isEnabled(state: TrustState, category: TestCategory): boolean {
  if (state.selfDischarged) return false;
  if (category === 'observation') return state.stage !== 'hostile';
  return consentGiven(state); // invasive + medication need earned consent
}

export function TestMenu({
  state,
  patientName,
  items = CHEST_PAIN_TESTS,
  lastRefusal,
  onRequestTest,
}: {
  state: TrustState;
  patientName: string;
  items?: TestMenuItem[];
  /** In-character refusal line for the most recent blocked attempt, if any. */
  lastRefusal?: string | null;
  onRequestTest: (item: TestMenuItem) => void;
}) {
  const consented = consentGiven(state);
  return (
    <div className="test-menu bg-black/70 text-white p-4 rounded-md w-72 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="uppercase text-sm tracking-wide">Test menu</span>
        <TrustBadge state={state} />
      </div>

      {/* Trust meter */}
      <div className="h-2 w-full bg-white/20 rounded mb-1 overflow-hidden">
        <div
          className={clsx(
            'h-full transition-all',
            state.stage === 'hostile' && 'bg-red-500',
            state.stage === 'wary' && 'bg-amber-400',
            state.stage === 'consenting' && 'bg-emerald-400',
          )}
          style={{ width: `${state.trust}%` }}
        />
      </div>
      <p className="text-xs text-white/70 mb-3">
        {state.selfDischarged
          ? `${patientName} has left against advice — no tests possible.`
          : consented
            ? `${patientName} has consented to necessary tests.`
            : `Earn ${patientName}'s consent (de-escalate, then explain a test) to unlock invasive tests.`}
      </p>

      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const enabled = isEnabled(state, item.category);
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onRequestTest(item)}
                className={clsx(
                  'w-full text-left text-sm px-2 py-1 rounded flex items-center justify-between',
                  enabled ? 'bg-white/10 hover:bg-white/20 cursor-pointer' : 'bg-white/5 text-white/40 cursor-not-allowed',
                )}
                title={enabled ? '' : 'Not consented yet'}
              >
                <span>{item.label}</span>
                {!enabled && <span aria-hidden>🔒</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {lastRefusal && (
        <p className="mt-3 text-xs italic text-red-300 border-l-2 border-red-400 pl-2">
          “{lastRefusal}”
        </p>
      )}
    </div>
  );
}

function TrustBadge({ state }: { state: TrustState }) {
  const label = state.selfDischarged ? 'left AMA' : state.stage;
  return (
    <span
      className={clsx(
        'text-xs px-2 py-0.5 rounded uppercase',
        state.selfDischarged && 'bg-red-700',
        !state.selfDischarged && state.stage === 'hostile' && 'bg-red-600',
        !state.selfDischarged && state.stage === 'wary' && 'bg-amber-600',
        !state.selfDischarged && state.stage === 'consenting' && 'bg-emerald-600',
      )}
    >
      {label}
    </span>
  );
}
