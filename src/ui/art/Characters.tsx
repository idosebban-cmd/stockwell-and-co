/**
 * Small front-view characters drawn in SVG. Coordinates are relative to the
 * figure's feet (0, 0); a standing staff member is about 44 units tall.
 */
import type { AssignmentId } from '../../sim/types';

type Hair = 'ponytail' | 'perm' | 'short' | 'messy' | 'bun' | 'beanie' | 'cap';

interface Look {
  skin: string;
  hair: string;
  style: Hair;
  beard?: string;
  glasses?: boolean;
  /** Tabard colour; the temp wears hi-vis. */
  tabard: string;
}

export const LOOKS: Record<string, Look> = {
  priya: { skin: '#a8724a', hair: '#1f1612', style: 'ponytail', tabard: 'var(--burgundy)' },
  bev: { skin: '#f0c9a8', hair: '#c9c4bc', style: 'perm', glasses: true, tabard: 'var(--burgundy)' },
  kwame: { skin: '#5e3b24', hair: '#16100c', style: 'short', beard: '#16100c', tabard: 'var(--burgundy)' },
  dougie: { skin: '#f3c6a0', hair: '#b9551f', style: 'messy', beard: '#b9551f', tabard: 'var(--burgundy)' },
  mags: { skin: '#e3ad86', hair: '#6b4a2f', style: 'bun', tabard: 'var(--burgundy)' },
  tomasz: { skin: '#e9be9a', hair: '#2f3a4a', style: 'beanie', tabard: 'var(--burgundy)' },
  temp: { skin: '#d9a27c', hair: '#3b2a1e', style: 'cap', tabard: '#e8d23a' },
};

function HairBack({ l }: { l: Look }) {
  if (l.style === 'ponytail') return <path d="M5 -38 q8 4 5 14 q-2 4 -5 2 q2 -8 0 -16z" fill={l.hair} />;
  if (l.style === 'perm') return <circle cx="0" cy="-36" r="9.5" fill={l.hair} />;
  return null;
}

function HairFront({ l }: { l: Look }) {
  switch (l.style) {
    case 'ponytail':
      return <path d="M-7 -36 q7 -9 14 0 q-7 -3 -14 0z" fill={l.hair} />;
    case 'perm':
      return (
        <g fill={l.hair}>
          <circle cx="-5" cy="-41" r="3.5" />
          <circle cx="0" cy="-43" r="3.5" />
          <circle cx="5" cy="-41" r="3.5" />
        </g>
      );
    case 'short':
      return <path d="M-7 -36 q7 -8 14 0 v-2 q-7 -7 -14 0z" fill={l.hair} />;
    case 'messy':
      return <path d="M-8 -35 l2 -6 l3 3 l2 -5 l3 4 l3 -4 l2 6 q-7 -5 -15 2z" fill={l.hair} />;
    case 'bun':
      return (
        <g fill={l.hair}>
          <circle cx="0" cy="-46" r="3.6" />
          <path d="M-7 -36 q7 -9 14 0 q-7 -4 -14 0z" />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d="M-7.5 -36 q7.5 -12 15 0z" fill={l.hair} />
          <rect x="-8" y="-38" width="16" height="3" rx="1.5" fill="var(--mustard)" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M-7 -37 q7 -9 14 0z" fill="#2d4a6b" />
          <rect x="-1" y="-38" width="11" height="2.5" rx="1" fill="#2d4a6b" />
        </g>
      );
  }
}

export type Pose = 'stand' | 'carry' | 'scan' | 'push' | 'sit' | 'idle';

export function poseFor(a: AssignmentId, working: boolean): Pose {
  if (a === 'break') return 'sit';
  if (!working) return 'idle';
  if (a === 'tills') return 'scan';
  if (a === 'receive') return 'push';
  return 'carry';
}

/** A staff member at their feet position. */
export function StaffFigure({ id, pose, tired }: { id: string; pose: Pose; tired: boolean }) {
  const l = LOOKS[id] ?? LOOKS.temp;
  const sit = pose === 'sit';
  const lift = sit ? 8 : 0;
  return (
    <g className={`figure pose-${pose}`}>
      <ellipse cx="0" cy="0" rx="11" ry="3.5" fill="rgba(60,40,20,0.22)" />
      {/* legs */}
      {sit ? (
        <path d="M-5 -10 h10 v4 h4 v6 h-3 v-3 h-11z" fill="#3a3330" />
      ) : (
        <g fill="#3a3330">
          <rect x="-5" y="-13" width="4" height="13" rx="1.5" />
          <rect x="1" y="-13" width="4" height="13" rx="1.5" />
        </g>
      )}
      <g transform={`translate(0 ${lift})`}>
        <HairBack l={l} />
        {/* body: shirt + tabard */}
        <rect x="-8" y="-29" width="16" height="17" rx="5" fill="var(--paper)" />
        <rect x="-6.5" y="-28" width="13" height="16" rx="3" fill={l.tabard} />
        <rect x="1" y="-25" width="4.5" height="2.6" rx="0.8" fill="var(--mustard)" />
        {/* arms by pose */}
        <Arms pose={pose} skin={l.skin} />
        {/* head */}
        <rect x="-2" y="-31" width="4" height="3" fill={l.skin} />
        <circle cx="0" cy="-36" r="7" fill={l.skin} />
        <HairFront l={l} />
        {l.beard && <path d="M-5 -34 q5 7 10 0 q0 4 -5 5 q-5 -1 -5 -5z" fill={l.beard} />}
        {l.glasses ? (
          <g fill="none" stroke="#2b2320" strokeWidth="0.9">
            <circle cx="-2.6" cy="-36" r="2" />
            <circle cx="2.6" cy="-36" r="2" />
            <path d="M-0.6 -36 h1.2" />
          </g>
        ) : (
          <g fill="#2b2320">
            <circle cx="-2.5" cy="-36" r={tired ? 0.6 : 0.95} />
            <circle cx="2.5" cy="-36" r={tired ? 0.6 : 0.95} />
          </g>
        )}
        <path d={tired ? 'M-2 -32.4 h4' : 'M-2 -32.8 q2 1.6 4 0'} stroke="#2b2320" strokeWidth="0.8" fill="none" />
      </g>
      {pose === 'push' && (
        <g className="cage">
          <rect x="10" y="-22" width="16" height="20" rx="1.5" fill="none" stroke="#7d7d7d" strokeWidth="1.4" />
          <path d="M10 -15 h16 M10 -8 h16 M15 -22 v20 M21 -22 v20" stroke="#9a9a9a" strokeWidth="0.8" />
          <rect x="12" y="-19" width="12" height="9" rx="1" fill="var(--mustard)" />
          <circle cx="12" cy="0" r="1.6" fill="#555" />
          <circle cx="24" cy="0" r="1.6" fill="#555" />
        </g>
      )}
      {pose === 'sit' && (
        <g className="mug">
          <rect x="9" y="-20" width="5" height="6" rx="1" fill="var(--paper)" stroke="var(--burgundy)" strokeWidth="1" />
          <path className="steam" d="M11 -23 q-2 -3 0 -6 q2 -3 0 -6" stroke="#b9ad9b" strokeWidth="1" fill="none" />
        </g>
      )}
    </g>
  );
}

function Arms({ pose, skin }: { pose: Pose; skin: string }) {
  switch (pose) {
    case 'carry':
      return (
        <g className="carry-box">
          <rect x="-7" y="-33" width="14" height="10" rx="1.5" fill="#c9a46a" stroke="#8a5d33" strokeWidth="0.8" />
          <path d="M-7 -28 h14" stroke="#8a5d33" strokeWidth="0.6" />
          <circle cx="-7.5" cy="-27" r="2" fill={skin} />
          <circle cx="7.5" cy="-27" r="2" fill={skin} />
        </g>
      );
    case 'scan':
      return (
        <g>
          <rect x="-11" y="-27" width="3.5" height="10" rx="1.6" fill={skin} />
          <path d="M8 -26 l7 -4" stroke={skin} strokeWidth="3.4" strokeLinecap="round" />
          <rect className="scanner" x="13" y="-33" width="5" height="4" rx="1" fill="#2b2320" />
        </g>
      );
    case 'push':
      return <path d="M7 -24 h6 M-7 -24 q4 3 20 0" stroke={skin} strokeWidth="3.2" strokeLinecap="round" fill="none" />;
    case 'sit':
      return <path d="M7 -22 q3 3 4 -1" stroke={skin} strokeWidth="3.2" strokeLinecap="round" fill="none" />;
    default:
      return (
        <g fill={skin}>
          <rect x="-11" y="-27" width="3.5" height="11" rx="1.6" />
          <rect x="7.5" y="-27" width="3.5" height="11" rx="1.6" />
        </g>
      );
  }
}

const COATS = ['#4b6a9b', '#6c8f4a', '#8a5a8c', '#c07a3a', '#5c6f74', '#a34a3d', '#3f7d74', '#7d6a4b'];
const SKINS = ['#f1c7a5', '#d9a27c', '#a8724a', '#6b4428', '#e8b48f', '#c48b62'];
const HAIRS = ['#2b1d14', '#6b4a2f', '#c9c4bc', '#b9551f', '#16100c', '#d8b25a'];

/** A shopper with a basket. `fill` is how full the basket looks (0..1). */
export function Shopper({ n, fill = 0.6, puzzled = false, leaving = false }: { n: number; fill?: number; puzzled?: boolean; leaving?: boolean }) {
  const coat = COATS[n % COATS.length];
  const skin = SKINS[(n * 7) % SKINS.length];
  const hair = HAIRS[(n * 5) % HAIRS.length];
  const items = Math.round(Math.max(0, Math.min(1, fill)) * 3);
  return (
    <g className="shopper-fig">
      <ellipse cx="0" cy="0" rx="8" ry="2.6" fill="rgba(60,40,20,0.2)" />
      <rect x="-3.6" y="-10" width="3" height="10" rx="1.2" fill="#3a3330" />
      <rect x="0.6" y="-10" width="3" height="10" rx="1.2" fill="#3a3330" />
      <rect x="-6" y="-22" width="12" height="14" rx="4" fill={coat} />
      <circle cx="0" cy="-26" r="5.2" fill={skin} />
      <path d={n % 2 ? 'M-5.2 -27 q5.2 -7 10.4 0 q-5 -3 -10.4 0z' : 'M-5.4 -26 q0 -7 5.4 -7 q5.4 0 5.4 7 q-1 -4 -5.4 -4 q-4.4 0 -5.4 4z'} fill={hair} />
      {/* basket */}
      {!leaving && (
        <g transform="translate(6 -13)">
          <path d="M1 0 q3.5 -6 7 0" stroke="#5c5c5c" strokeWidth="1" fill="none" />
          {items > 0 && <rect x="1.2" y="-1.5" width="2.4" height="2.5" fill="#c2452d" />}
          {items > 1 && <rect x="3.8" y="-2" width="2.2" height="3" fill="#f2d16b" />}
          {items > 2 && <rect x="5.8" y="-1" width="2" height="2" fill="#5d8f2f" />}
          <rect x="0" y="0" width="9" height="6" rx="1" fill="var(--burgundy)" opacity="0.9" />
          <path d="M1.5 1.5 h6 M1.5 3.5 h6" stroke="var(--paper)" strokeWidth="0.5" />
        </g>
      )}
      {puzzled && (
        <g className="bubble">
          <circle cx="7" cy="-36" r="5.5" fill="var(--paper)" stroke="var(--bad)" strokeWidth="1" />
          <text x="7" y="-33.4" textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--bad)">
            ?
          </text>
        </g>
      )}
      {leaving && (
        <g>
          <circle cx="7" cy="-34" r="5" fill="var(--bad)" />
          <text x="7" y="-31.6" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff">
            ✕
          </text>
        </g>
      )}
    </g>
  );
}

/** A dropped basket (abandoned shopping). */
export function DroppedBasket() {
  return (
    <g>
      <rect x="-5" y="-4" width="10" height="6" rx="1" fill="var(--burgundy)" opacity="0.85" />
      <rect x="-3" y="-6" width="2.5" height="2.5" fill="#c2452d" />
      <rect x="0.5" y="-6.5" width="2.5" height="3" fill="#9cc7d6" />
    </g>
  );
}
