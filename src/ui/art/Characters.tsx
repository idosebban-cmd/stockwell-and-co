/**
 * The people, in the chibi style: big heads with shiny eyes and rosy cheeks,
 * small bodies, each person with their own build. Coordinates are relative to
 * the figure's feet (0, 0). Drawn at about 78 units and scaled to `SIZE`, so a
 * standing person is about 54 units tall at scale 1 (as before).
 */
import type { ReactNode } from 'react';
import type { AssignmentId, PersonLook } from '../../sim/types';

type Hair = PersonLook['style'];
type Build = 'slim' | 'average' | 'broad' | 'short';

interface Look {
  skin: string;
  hair: string;
  style: Hair;
  beard?: string;
  glasses?: boolean;
  /** Tabard colour; the temp wears hi-vis. */
  tabard: string;
  build?: Build;
  tall?: boolean;
}

export const LOOKS: Record<string, Look> = {
  priya: { skin: '#a8724a', hair: '#1f1612', style: 'ponytail', tabard: '#7a1f2b', build: 'slim' },
  bev: { skin: '#f0c9a8', hair: '#cfc9c0', style: 'perm', glasses: true, tabard: '#7a1f2b', build: 'short' },
  kwame: { skin: '#5e3b24', hair: '#16100c', style: 'short', beard: '#16100c', tabard: '#7a1f2b', build: 'broad' },
  dougie: { skin: '#f3c6a0', hair: '#c0602a', style: 'messy', beard: '#c0602a', tabard: '#7a1f2b', build: 'average' },
  mags: { skin: '#e3ad86', hair: '#6b4a2f', style: 'bun', tabard: '#7a1f2b', build: 'slim', tall: true },
  tomasz: { skin: '#e9be9a', hair: '#2f3a4a', style: 'beanie', tabard: '#7a1f2b', build: 'broad', tall: true },
  temp: { skin: '#d9a27c', hair: '#3b2a1e', style: 'cap', tabard: '#e8d23a', build: 'average' },
};

/** Drawn size to shown size. */
const SIZE = 0.68;
const OUT = 'rgba(60,28,12,0.55)';
const SHIRT = '#f7ead2';
const TROUSERS = '#4a3a33';
const SHOE = '#2f2420';
const EYE = '#2b1d14';
const BLUSH = '#e8897a';
const MUSTARD = '#e3a43a';
const BURGUNDY_DARK = '#4c0f18';

const ol = { stroke: OUT, strokeWidth: 1.4, strokeLinejoin: 'round' as const };

export type Pose = 'stand' | 'carry' | 'scan' | 'push' | 'sit' | 'idle';

export function poseFor(a: AssignmentId, working: boolean): Pose {
  if (a === 'break') return 'sit';
  if (!working) return 'idle';
  if (a === 'tills') return 'scan';
  if (a === 'receive') return 'push';
  return 'carry';
}

// ---------------------------------------------------------------------------
// Heads: hair behind, face, hair in front. Head centre (0, cy), radius r.
// ---------------------------------------------------------------------------

function HairBack({ l, cy, r }: { l: Look; cy: number; r: number }) {
  if (l.style === 'ponytail')
    return <path d={`M${r * 0.55} ${cy - r * 0.55} C${r * 1.35} ${cy - r * 0.3} ${r * 1.2} ${cy + r * 0.9} ${r * 0.7} ${cy + r * 1.15} C${r * 0.85} ${cy + r * 0.5} ${r * 0.7} ${cy - r * 0.1} ${r * 0.4} ${cy - r * 0.3}Z`} fill={l.hair} {...ol} />;
  if (l.style === 'perm')
    return (
      <g fill={l.hair} {...ol}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = Math.PI * (0.92 + (i / 8) * 1.16);
          return <circle key={i} cx={Math.cos(a) * r * 0.95} cy={cy + Math.sin(a) * r * 0.9} r={r * 0.36} />;
        })}
      </g>
    );
  return null;
}

function HairFront({ l, cy, r }: { l: Look; cy: number; r: number }) {
  const top = cy - r;
  switch (l.style) {
    case 'ponytail':
    case 'short':
      return (
        <path
          d={`M${-r * 1.02} ${cy - r * 0.05} C${-r * 1.05} ${top - r * 0.35} ${r * 1.05} ${top - r * 0.35} ${r * 1.02} ${cy - r * 0.05} C${r * 0.7} ${cy - r * 0.55} ${-r * 0.1} ${cy - r * 0.5} ${-r * 0.35} ${cy - r * 0.75} C${-r * 0.55} ${cy - r * 0.45} ${-r * 0.85} ${cy - r * 0.4} ${-r * 1.02} ${cy - r * 0.05}Z`}
          fill={l.hair}
          {...ol}
        />
      );
    case 'messy': {
      const pts: [number, number][] = [[-1.05, -0.6], [-0.75, -1.2], [-0.45, -0.75], [-0.2, -1.35], [0.1, -0.85], [0.4, -1.3], [0.65, -0.8], [1.0, -1.1], [1.05, 0]];
      const d = `M${-r * 1.05} ${cy}${pts.map(([x, y]) => ` L${x * r} ${cy + y * r}`).join('')} C${r * 0.6} ${cy - r * 0.55} ${-r * 0.6} ${cy - r * 0.55} ${-r * 1.05} ${cy}Z`;
      return <path d={d} fill={l.hair} {...ol} />;
    }
    case 'bun':
      return (
        <g fill={l.hair} {...ol}>
          <circle cx="0" cy={top - r * 0.3} r={r * 0.45} />
          <path d={`M${-r * 1.02} ${cy - r * 0.1} C${-r * 1.05} ${top - r * 0.3} ${r * 1.05} ${top - r * 0.3} ${r * 1.02} ${cy - r * 0.1} C${r * 0.6} ${cy - r * 0.62} ${-r * 0.6} ${cy - r * 0.62} ${-r * 1.02} ${cy - r * 0.1}Z`} />
        </g>
      );
    case 'beanie':
      return (
        <g {...ol}>
          <path d={`M${-r * 1.08} ${cy - r * 0.2} C${-r * 1.1} ${top - r * 0.75} ${r * 1.1} ${top - r * 0.75} ${r * 1.08} ${cy - r * 0.2}Z`} fill={l.hair} />
          <rect x={-r * 1.12} y={cy - r * 0.42} width={r * 2.24} height={r * 0.34} rx={r * 0.17} fill={MUSTARD} />
          <circle cx="0" cy={top - r * 0.62} r={r * 0.26} fill={MUSTARD} />
        </g>
      );
    case 'perm':
      return (
        <g fill={l.hair} {...ol}>
          {Array.from({ length: 7 }, (_, j) => {
            const a = Math.PI * (1.12 + (j / 6) * 0.76);
            return <circle key={j} cx={Math.cos(a) * r * 0.82} cy={cy + Math.sin(a) * r * 0.82} r={r * 0.34} />;
          })}
        </g>
      );
    case 'cap':
      return (
        <g {...ol}>
          <path d={`M${-r * 1.05} ${cy - r * 0.15} C${-r * 1.05} ${top - r * 0.45} ${r * 1.05} ${top - r * 0.45} ${r * 1.05} ${cy - r * 0.15}Z`} fill="#2d4a6b" />
          <path d={`M${r * 0.3} ${cy - r * 0.3} h${r * 1.1} q${r * 0.2} 0 0 ${r * 0.22} h${-r * 1.1}z`} fill="#24405e" />
        </g>
      );
  }
}

function Face({ l, cy, r, tired }: { l: Look; cy: number; r: number; tired: boolean }) {
  const ex = r * 0.38;
  const ey = cy + r * 0.08;
  const lw = Math.max(1, r * 0.07);
  return (
    <g>
      {tired ? (
        <g stroke={EYE} strokeWidth={lw * 1.2} strokeLinecap="round" fill="none">
          <path d={`M${-ex - r * 0.13} ${ey} q${r * 0.13} ${r * 0.08} ${r * 0.26} 0`} />
          <path d={`M${ex - r * 0.13} ${ey} q${r * 0.13} ${r * 0.08} ${r * 0.26} 0`} />
        </g>
      ) : (
        [-1, 1].map((s) => (
          <g key={s}>
            <ellipse cx={s * ex} cy={ey} rx={r * 0.15} ry={r * 0.2} fill={EYE} />
            <circle cx={s * ex + r * 0.05} cy={ey - r * 0.07} r={r * 0.06} fill="#fff" />
          </g>
        ))
      )}
      <ellipse cx={-r * 0.62} cy={ey + r * 0.32} rx={r * 0.17} ry={r * 0.1} fill={BLUSH} opacity="0.6" />
      <ellipse cx={r * 0.62} cy={ey + r * 0.32} rx={r * 0.17} ry={r * 0.1} fill={BLUSH} opacity="0.6" />
      <path
        d={tired ? `M${-r * 0.14} ${ey + r * 0.44} h${r * 0.28}` : `M${-r * 0.16} ${ey + r * 0.38} q${r * 0.16} ${r * 0.16} ${r * 0.32} 0`}
        stroke="#6a2a1e"
        strokeWidth={lw}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${-ex - r * 0.15} ${ey - r * 0.38} q${r * 0.15} ${-r * 0.1} ${r * 0.3} 0 M${ex - r * 0.15} ${ey - r * 0.38} q${r * 0.15} ${-r * 0.1} ${r * 0.3} 0`}
        stroke={l.hair}
        strokeWidth={lw}
        fill="none"
        strokeLinecap="round"
      />
      {l.beard && (
        <g>
          <path d={`M${-r * 0.92} ${cy + r * 0.05} C${-r * 0.8} ${cy + r * 1.15} ${r * 0.8} ${cy + r * 1.15} ${r * 0.92} ${cy + r * 0.05} C${r * 0.6} ${cy + r * 0.55} ${-r * 0.6} ${cy + r * 0.55} ${-r * 0.92} ${cy + r * 0.05}Z`} fill={l.beard} opacity="0.92" />
          <path d={`M${-r * 0.2} ${ey + r * 0.45} q${r * 0.2} ${r * 0.12} ${r * 0.4} 0`} stroke="#f0d0b0" strokeWidth={lw} fill="none" strokeLinecap="round" opacity="0.8" />
        </g>
      )}
      {l.glasses && (
        <g fill="rgba(255,255,255,0.18)" stroke="#2b2320" strokeWidth={Math.max(1.1, r * 0.08)}>
          <circle cx={-ex} cy={ey} r={r * 0.27} />
          <circle cx={ex} cy={ey} r={r * 0.27} />
          <path d={`M${-ex + r * 0.27} ${ey} h${2 * ex - r * 0.54}`} />
        </g>
      )}
    </g>
  );
}

function Head({ l, cy, r, tired }: { l: Look; cy: number; r: number; tired: boolean }) {
  return (
    <g>
      <HairBack l={l} cy={cy} r={r} />
      <circle cx={-r * 0.98} cy={cy + r * 0.12} r={r * 0.2} fill={l.skin} {...ol} />
      <circle cx={r * 0.98} cy={cy + r * 0.12} r={r * 0.2} fill={l.skin} {...ol} />
      <ellipse cx="0" cy={cy} rx={r} ry={r * 0.97} fill={l.skin} {...ol} />
      <Face l={l} cy={cy} r={r} tired={tired} />
      <HairFront l={l} cy={cy} r={r} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

interface BodyOpts {
  l: Look;
  coat: string;
  apron: string | null;
  trousers: string;
  pose: Pose;
  tired: boolean;
  /** Shoppers: what's in the basket (0..1), or leaving without it. */
  basket?: number;
  leaving?: boolean;
}

function Chibi({ l, coat, apron, trousers, pose, tired, basket, leaving }: BodyOpts): ReactNode {
  const build = l.build ?? 'average';
  const bw = { slim: 20, average: 24, broad: 30, short: 24 }[build];
  const sit = pose === 'sit';
  const legH = sit ? 4 : build === 'short' ? 8 : l.tall ? 14 : 11;
  const bodyH = 24;
  const r = 17;
  const bodyTop = -legH - bodyH;
  const cy = bodyTop - r + 4;
  const ax = bw / 2 + 2;
  const hand = (x: number, y: number) => <circle cx={x} cy={y} r="3.6" fill={l.skin} {...ol} />;
  const sleeve = (x: number, y: number, rot = 0) => <rect x={x - 3} y={y} width="6" height="15" rx="3" fill={coat} {...ol} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined} />;
  return (
    <g>
      <ellipse cx="0" cy="0" rx={bw * 0.75} ry="4" fill="rgba(60,25,5,0.28)" />
      {/* legs and shoes (seated: legs forward) */}
      {sit ? (
        <g {...ol}>
          <rect x="-9" y={-legH - 3} width="18" height="6" rx="3" fill={trousers} />
          <ellipse cx="-6" cy="-1" rx="5" ry="3" fill={SHOE} />
          <ellipse cx="6" cy="-1" rx="5" ry="3" fill={SHOE} />
        </g>
      ) : (
        <g {...ol}>
          <rect x="-8" y={-legH - 2} width="7" height={legH + 2} rx="3" fill={trousers} />
          <rect x="1" y={-legH - 2} width="7" height={legH + 2} rx="3" fill={trousers} />
          <ellipse cx="-4.5" cy="-1.5" rx="5.5" ry="3.2" fill={SHOE} />
          <ellipse cx="4.5" cy="-1.5" rx="5.5" ry="3.2" fill={SHOE} />
        </g>
      )}
      {/* body */}
      <rect x={-bw / 2} y={bodyTop} width={bw} height={bodyH + 2} rx={bw * 0.4} fill={coat} {...ol} />
      {apron && (
        <g>
          <path d={`M${-bw / 2 + 3} ${bodyTop + 7} h${bw - 6} v${bodyH - 6} q0 3 -3 3 h${-(bw - 12)} q-3 0 -3 -3z`} fill={apron} {...ol} />
          <rect x={bw / 2 - 11} y={bodyTop + 10} width="6" height="4" rx="1" fill={apron === '#e8d23a' ? '#c7c7c7' : MUSTARD} />
          <rect x="-5" y={bodyTop + 17} width="10" height="5" rx="1.5" fill="none" stroke={apron === '#e8d23a' ? '#9a8a1a' : BURGUNDY_DARK} strokeWidth="1" />
        </g>
      )}
      {/* arms, and what they hold */}
      {pose === 'carry' ? (
        <g className="carry-box">
          <rect x="-15" y={bodyTop - 4} width="30" height="16" rx="2" fill="#c78755" {...ol} />
          <path d={`M-13 ${bodyTop + 4} h26`} stroke="#6f3f1f" strokeWidth="1.5" />
          {['#c2452d', '#e08a1e', '#9fbf3b', '#c2452d'].map((c, i) => (
            <circle key={i} cx={-10 + i * 6.8} cy={bodyTop - 5} r="3.6" fill={c} {...ol} />
          ))}
          {hand(-15, bodyTop + 6)}
          {hand(15, bodyTop + 6)}
        </g>
      ) : pose === 'scan' ? (
        <g>
          {sleeve(-ax, bodyTop + 3)}
          {hand(-ax, bodyTop + 19)}
          {sleeve(ax, bodyTop + 2, -50)}
          {hand(ax + 11, bodyTop + 11)}
          <g className="scanner-g">
            <rect x={ax + 9} y={bodyTop + 1} width="5" height="8" rx="1" fill="#2b2320" />
            <rect className="scanner" x={ax + 10} y={bodyTop + 2} width="3" height="1.6" fill="#e0412b" />
          </g>
        </g>
      ) : pose === 'push' ? (
        <g>
          {sleeve(-ax, bodyTop + 3, -60)}
          {sleeve(ax, bodyTop + 3, -60)}
          {hand(ax + 13, bodyTop + 10)}
          <g className="cage">
            <rect x={ax + 12} y={bodyTop + 4} width="22" height={bodyH + legH - 4} rx="2" fill="none" stroke="#6f6a66" strokeWidth="2.4" />
            <path d={`M${ax + 12} ${bodyTop + 14} h22 M${ax + 23} ${bodyTop + 4} v${bodyH + legH - 4}`} stroke="#9a9a9a" strokeWidth="1" />
            <rect x={ax + 15} y={bodyTop + 7} width="16" height="10" fill="#c99a63" {...ol} />
            <circle cx={ax + 14} cy="-1" r="2" fill="#555" />
            <circle cx={ax + 32} cy="-1" r="2" fill="#555" />
          </g>
        </g>
      ) : pose === 'sit' ? (
        <g>
          {sleeve(-ax, bodyTop + 3)}
          {hand(-ax, bodyTop + 19)}
          {sleeve(ax, bodyTop + 3, -30)}
          {hand(ax + 7, bodyTop + 14)}
          <g className="mug">
            <rect x={ax + 6} y={bodyTop + 3} width="7" height="8" rx="1.5" fill="#fff8ea" stroke="#7a1f2b" strokeWidth="1.2" />
            <path className="steam" d={`M${ax + 9} ${bodyTop} q-2 -4 0 -8 q2 -4 0 -8`} stroke="#b9ad9b" strokeWidth="1.2" fill="none" />
          </g>
        </g>
      ) : (
        <g>
          {sleeve(-ax, bodyTop + 3)}
          {hand(-ax, bodyTop + 19)}
          {sleeve(ax, bodyTop + 3)}
          {hand(ax, bodyTop + 19)}
          {basket !== undefined && !leaving && <Basket x={ax + 1} y={bodyTop + 20} fill={basket} />}
        </g>
      )}
      <g className="head">
        <Head l={l} cy={cy} r={r} tired={tired} />
      </g>
      {leaving && (
        <g>
          <circle cx="16" cy={cy - 18} r="6" fill="#b3362c" />
          <text x="16" y={cy - 15} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">
            ✕
          </text>
        </g>
      )}
    </g>
  );
}

function Basket({ x, y, fill }: { x: number; y: number; fill: number }) {
  const items = Math.round(Math.max(0, Math.min(1, fill)) * 3);
  const ic = ['#c2452d', '#f2d16b', '#5d8f2f'];
  return (
    <g>
      <path d={`M${x - 5} ${y} q5 -9 10 0`} stroke="#5c5c5c" strokeWidth="1.4" fill="none" />
      {Array.from({ length: items }, (_, i) => (
        <rect key={i} x={x - 4 + i * 3} y={y - 3} width="2.6" height="4" fill={ic[i]} />
      ))}
      <rect x={x - 6} y={y} width="12" height="8" rx="2" fill="#7a1f2b" {...ol} />
      <path d={`M${x - 4} ${y + 3} h8`} stroke="#f4e2c2" strokeWidth="0.8" />
    </g>
  );
}

/** A staff member at their feet position. New people carry their own look; the original six and the temp are drawn by id. */
export function StaffFigure({ id, pose, tired, look }: { id: string; pose: Pose; tired: boolean; look?: PersonLook }) {
  const l: Look = look ? { ...look, tabard: '#7a1f2b' } : (LOOKS[id] ?? LOOKS.temp);
  return (
    <g className={`figure pose-${pose}`}>
      <g transform={`scale(${SIZE})`}>
        <Chibi l={l} coat={SHIRT} apron={l.tabard} trousers={TROUSERS} pose={pose} tired={tired} />
      </g>
    </g>
  );
}

const COATS = ['#4b6a9b', '#6c8f4a', '#8a5a8c', '#c07a3a', '#5c6f74', '#a34a3d', '#3f7d74', '#7d6a4b'];
const SKINS = ['#f1c7a5', '#d9a27c', '#a8724a', '#6b4428', '#e8b48f', '#c48b62'];
const HAIRS = ['#2b1d14', '#6b4a2f', '#c9c4bc', '#b9551f', '#16100c', '#d8b25a'];
const SHOPPER_STYLES: Hair[] = ['short', 'ponytail', 'perm', 'bun', 'messy', 'short', 'cap'];
const BUILDS: Build[] = ['average', 'slim', 'broad', 'short'];
const PANTS = ['#3e4a5c', '#4a3a33', '#5c4a3a', '#2f3a4a'];

/** A shopper with a basket. `fill` is how full the basket looks (0..1). Drawn a little smaller than staff. */
export function Shopper({ n, fill = 0.6, leaving = false }: { n: number; fill?: number; leaving?: boolean }) {
  const style = SHOPPER_STYLES[n % SHOPPER_STYLES.length];
  const l: Look = {
    skin: SKINS[(n * 7) % SKINS.length],
    hair: style === 'cap' ? '#c2452d' : HAIRS[(n * 5) % HAIRS.length],
    style,
    glasses: n % 5 === 2,
    beard: n % 9 === 4 ? HAIRS[(n * 5) % HAIRS.length] : undefined,
    tabard: '',
    build: BUILDS[n % BUILDS.length],
  };
  return (
    <g className="shopper-fig">
      <g transform="scale(0.5)">
        <Chibi l={l} coat={COATS[n % COATS.length]} apron={null} trousers={PANTS[n % PANTS.length]} pose="stand" tired={false} basket={fill} leaving={leaving} />
      </g>
    </g>
  );
}

/** A dropped basket (abandoned shopping). */
export function DroppedBasket() {
  return (
    <g>
      <rect x="-5" y="-4" width="10" height="6" rx="1" fill="#7a1f2b" opacity="0.85" />
      <rect x="-3" y="-6" width="2.5" height="2.5" fill="#c2452d" />
      <rect x="0.5" y="-6.5" width="2.5" height="3" fill="#9cc7d6" />
    </g>
  );
}
