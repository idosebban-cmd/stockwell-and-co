import { CONFIG, hourLabel } from '../sim/config';
import type { HourReport, Scenario } from '../sim/types';

interface Props {
  scenario: Scenario;
  currentHour: number;
  /** Hours whose events have been announced (rushes show on the forecast). */
  knownUpTo: number;
  reports?: HourReport[];
  compact?: boolean;
  /** Wide, short version shown under the shop. */
  strip?: boolean;
}

/** Bar chart of expected customers per hour, with actual arrivals for hours already played. */
export function Forecast({ scenario, currentHour, knownUpTo, reports = [], compact, strip }: Props) {
  const rushes = new Set(scenario.events.filter((e) => e.kind === 'rush' && e.warnAt <= knownUpTo).map((e) => e.hour));
  const expected = scenario.forecast.map((f, h) => f * (rushes.has(h) ? CONFIG.events.rush.customerMult : 1));
  const max = Math.max(...expected, ...reports.map((r) => r.customersArrived)) * 1.1;
  const w = strip ? 640 : compact ? 300 : 420;
  const h = strip ? 78 : compact ? 92 : 130;
  const bw = w / scenario.forecast.length;
  const ch = h - 30;
  return (
    <figure className={`forecast ${strip ? 'forecast-strip' : ''}`}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Expected customers per hour: ${expected.map((e, i) => `${hourLabel(i)} about ${Math.round(e)}`).join(', ')}`}>
        {expected.map((e, i) => {
          const bh = (e / max) * ch;
          const actual = reports[i]?.customersArrived;
          const ah = actual ? (actual / max) * ch : 0;
          const cur = i === currentHour;
          return (
            <g key={i}>
              <rect
                x={i * bw + 4}
                y={ch - bh + 8}
                width={bw - 8}
                height={bh}
                rx="3"
                className={`fc-bar ${cur ? 'fc-current' : ''} ${rushes.has(i) ? 'fc-rush' : ''} ${i < currentHour ? 'fc-past' : ''}`}
              />
              {actual !== undefined && <rect x={i * bw + bw / 2 - 3} y={ch - ah + 8} width="6" height={ah} className="fc-actual" />}
              <text x={i * bw + bw / 2} y={ch - bh + 4} textAnchor="middle" fontSize="10" className="fc-num">
                {Math.round(e)}
              </text>
              <text x={i * bw + bw / 2} y={h - 6} textAnchor="middle" fontSize="10" className={cur ? 'fc-label-cur' : 'fc-label'}>
                {hourLabel(i).slice(0, 2)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        {strip ? 'Forecast customers per hour' : 'Expected customers per hour'}{rushes.size ? ' (dark red: announced rush)' : ''}
        {reports.length ? '; thin bars: actual' : ''}. Real footfall varies a little.
      </figcaption>
    </figure>
  );
}
