import { Shopper, StaffFigure } from './art/Characters';

/** First screen: the shopfront, one sentence and the ways in. */
export function Opening({
  week,
  onWeek,
  onQuick,
  quickInProgress,
  onCustom,
  onLearn,
  notice,
  onDismissNotice,
}: {
  /** "Open the shop" or the day to continue. */
  week: { label: string; continuing: boolean };
  onWeek: () => void;
  onQuick: () => void;
  quickInProgress: boolean;
  onCustom: () => void;
  onLearn: () => void;
  notice: string | null;
  onDismissNotice: () => void;
}) {
  return (
    <main className="opening" id="main">
      <Shopfront />
      <div className="opening-copy">
        <h1>Stockwell &amp; Co</h1>
        <p className="opening-line">
          Take over a little corner shop and run it at your own pace, day after day. Keep the shelves full and the queues short, look after the team, and
          grow the business as you go. Pause whenever you like.
        </p>
        {notice && (
          <p className="opening-notice" role="status">
            {notice}{' '}
            <button type="button" className="btn-link" onClick={onDismissNotice}>
              OK
            </button>
          </p>
        )}
        <div className="opening-buttons">
          <button type="button" className="btn-primary btn-start" onClick={onWeek} autoFocus>
            {week.label}
          </button>
          <button type="button" className="btn-secondary btn-start-2" onClick={onQuick}>
            {quickInProgress ? 'Continue Quick play' : 'Quick play: one Saturday'}
          </button>
        </div>
        <p className="tiny muted">The shop teaches as it goes. Prefer a guided start?</p>
        <div className="opening-links">
          <button type="button" className="btn-link" onClick={onLearn}>
            Learn to play (five short lessons)
          </button>
          <button type="button" className="btn-link" onClick={onCustom}>
            Quick play with a custom order
          </button>
        </div>
      </div>
    </main>
  );
}

const STAFF_LINE = ['priya', 'bev', 'kwame', 'dougie', 'mags', 'tomasz'];

function Shopfront() {
  const stripes = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg className="shopfront" viewBox="0 0 900 470" role="img" aria-label="The Stockwell & Co shopfront, with the six staff standing outside.">
      {/* street */}
      <rect x="0" y="0" width="900" height="470" fill="var(--cream)" />
      <rect x="0" y="398" width="900" height="72" fill="#d8ccb4" />
      <path d="M0 398 H900" stroke="#bfae8f" strokeWidth="3" />
      {Array.from({ length: 10 }, (_, i) => (
        <path key={i} d={`M${i * 96 + 40} 398 l-18 72`} stroke="#c9bb9f" strokeWidth="2" />
      ))}
      {/* building */}
      <rect x="90" y="20" width="720" height="380" fill="#efe2c8" stroke="var(--wall)" strokeWidth="4" />
      {/* upstairs windows with flower boxes */}
      {[170, 400, 630].map((x) => (
        <g key={x}>
          <rect x={x} y="40" width="100" height="62" rx="4" fill="#cfe3ea" stroke="var(--wall)" strokeWidth="3" />
          <path d={`M${x + 50} 40 v62 M${x} 71 h100`} stroke="var(--wall)" strokeWidth="2" />
          <rect x={x - 6} y="102" width="112" height="12" rx="2" fill="var(--wood)" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={x + 6 + i * 18} cy="100" r="6" fill={i % 2 ? '#c2452d' : 'var(--mustard)'} />
          ))}
        </g>
      ))}
      {/* fascia */}
      <rect x="110" y="124" width="680" height="64" rx="6" fill="var(--burgundy)" stroke="var(--mustard)" strokeWidth="5" />
      <text x="450" y="168" textAnchor="middle" fontFamily="var(--serif)" fontSize="38" fontWeight="700" fill="var(--paper)" letterSpacing="2">
        Stockwell <tspan fill="var(--mustard)" fontStyle="italic">&amp;</tspan> Co
      </text>
      <text x="450" y="183" textAnchor="middle" fontSize="10" fill="var(--mustard-soft)" letterSpacing="3">
        GROCERS · EST. 1987
      </text>
      {/* awning */}
      <g>
        {stripes.map((i) => (
          <rect key={i} x={110 + i * (680 / 14)} y="192" width={680 / 14} height="40" fill={i % 2 ? 'var(--paper)' : 'var(--burgundy)'} />
        ))}
        <path
          d={`M110 232 ${stripes.map(() => `q${680 / 28} 16 ${680 / 14} 0`).join(' ')}`}
          fill="none"
          stroke="var(--burgundy-dark)"
          strokeWidth="3"
        />
        {stripes.map((i) => (
          <path key={i} d={`M${110 + i * (680 / 14)} 232 q${680 / 28} 16 ${680 / 14} 0 z`} fill={i % 2 ? 'var(--paper)' : 'var(--burgundy)'} />
        ))}
      </g>
      {/* windows */}
      <ShopWindow x={130} />
      <ShopWindow x={560} right />
      {/* door */}
      <rect x="380" y="246" width="140" height="152" rx="4" fill="#cfe3ea" stroke="var(--wall)" strokeWidth="4" />
      <path d="M450 246 V398" stroke="var(--wall)" strokeWidth="3" />
      <rect x="415" y="276" width="70" height="24" rx="4" fill="var(--paper)" stroke="var(--burgundy)" strokeWidth="2" />
      <text x="450" y="293" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--burgundy)" letterSpacing="1">
        OPEN
      </text>
      {/* pavement board */}
      <g transform="translate(770 300)">
        <path d="M0 98 L14 0 H86 L100 98" fill="var(--ink)" />
        <rect x="18" y="8" width="64" height="70" rx="3" fill="#2f3a35" />
        <text x="50" y="26" textAnchor="middle" fontSize="9" fill="var(--paper)" fontWeight="700">
          TODAY
        </text>
        <text x="50" y="42" textAnchor="middle" fontSize="8" fill="var(--mustard-soft)">
          Satsumas
        </text>
        <text x="50" y="54" textAnchor="middle" fontSize="8" fill="var(--mustard-soft)">
          Tins 2 for £2
        </text>
        <text x="50" y="68" textAnchor="middle" fontSize="7" fill="#b9ad9b" fontStyle="italic">
          Kettle: on
        </text>
      </g>
      {/* crates outside */}
      <g transform="translate(22 330)">
        {[0, 1].map((r) => (
          <g key={r} transform={`translate(0 ${r * 34})`}>
            <rect width="78" height="30" rx="3" fill="var(--wood)" stroke="var(--wood-dark)" strokeWidth="2" />
            {Array.from({ length: 5 }, (_, i) => (
              <circle key={i} cx={10 + i * 14.5} cy="10" r="7" fill={r ? '#5d8f2f' : '#e08a1e'} />
            ))}
          </g>
        ))}
      </g>
      {/* staff out front */}
      {STAFF_LINE.map((id, i) => (
        <g key={id} transform={`translate(${255 + i * 78} 452) scale(2.1)`}>
          <StaffFigure id={id} pose={i === 2 ? 'carry' : 'stand'} tired={false} />
        </g>
      ))}
      {/* shoppers arriving */}
      <g transform="translate(150 452) scale(2)">
        <Shopper n={4} fill={0.9} />
      </g>
      <g transform="translate(730 452) scale(2)">
        <Shopper n={9} fill={0.3} />
      </g>
    </svg>
  );
}

function ShopWindow({ x, right }: { x: number; right?: boolean }) {
  return (
    <g>
      <rect x={x} y="246" width="210" height="122" rx="4" fill="#d9ecf1" stroke="var(--wall)" strokeWidth="4" />
      <rect x={x + 8} y="300" width="194" height="6" fill="var(--wood-dark)" />
      <rect x={x + 8} y="350" width="194" height="6" fill="var(--wood-dark)" />
      {Array.from({ length: 11 }, (_, i) => (
        <rect key={i} x={x + 12 + i * 17.5} y="282" width="12" height="18" rx="2" className={`tin tin-${(i + (right ? 1 : 0)) % 4}`} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={x + 22 + i * 21} cy="340" r="9" fill={['#c2452d', '#e08a1e', '#9fbf3b'][i % 3]} />
      ))}
      <path d={`M${x + 20} 256 l30 30 M${x + 40} 256 l20 20`} stroke="#fff" strokeWidth="4" opacity="0.6" />
      <rect x={x - 6} y="368" width="222" height="30" fill="#e3d3b4" stroke="var(--wall)" strokeWidth="3" />
    </g>
  );
}
