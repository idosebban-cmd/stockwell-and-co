/**
 * Small illustrations for the briefing and the closing screen. Each one is
 * drawn from the same pieces as the shop (staff figures, tills, crates,
 * cabinets) and always appears next to a short text label.
 */
import type { ReactNode } from 'react';
import type { Speciality } from '../sim/types';
import { Shopper, StaffFigure, type Pose } from './art/Characters';

function Svg({ w, h, children, label }: { w: number; h: number; children: ReactNode; label?: string }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="ill" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </svg>
  );
}

/** A person from the team, in a pose. */
export function Person({ id, pose = 'stand', scale = 1.5, w = 48, h = 74 }: { id: string; pose?: Pose; scale?: number; w?: number; h?: number }) {
  return (
    <Svg w={w} h={h}>
      <g transform={`translate(${w / 2} ${h - 4}) scale(${scale})`}>
        <StaffFigure id={id} pose={pose} tired={false} />
      </g>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Briefing pieces
// ---------------------------------------------------------------------------

export function Clock({ hour }: { hour: number }) {
  const a = ((hour % 12) / 12) * Math.PI * 2;
  return (
    <Svg w={30} h={30}>
      <circle cx="15" cy="15" r="13" fill="var(--paper)" stroke="var(--burgundy)" strokeWidth="2.5" />
      <path d={`M15 15 L${15 + Math.sin(a) * 7} ${15 - Math.cos(a) * 7}`} stroke="var(--burgundy-dark)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 15 L15 6" stroke="var(--burgundy-dark)" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export type CueId = 'serve' | 'restock' | 'rest' | 'unload' | 'prices' | 'chilled';

/** The picture for a learning cue. */
export function CueArt({ cue }: { cue: CueId }) {
  const W = 84;
  const H = 62;
  switch (cue) {
    case 'serve':
      return (
        <Svg w={W} h={H}>
          <rect x="40" y="30" width="40" height="16" rx="3" fill="var(--wood)" stroke="var(--wood-dark)" />
          <rect x="62" y="22" width="10" height="8" rx="1.5" fill="var(--ink)" />
          <rect x="63.5" y="23.5" width="7" height="4" fill="#9fd39a" />
          <g transform="translate(28 58) scale(1.35)">
            <StaffFigure id="priya" pose="scan" tired={false} />
          </g>
          <g transform="translate(70 58) scale(1.1)">
            <Shopper n={4} fill={0.8} />
          </g>
        </Svg>
      );
    case 'restock':
      return (
        <Svg w={W} h={H}>
          <rect x="46" y="14" width="34" height="36" rx="2" fill="var(--shelf)" stroke="var(--wood-dark)" />
          <path d="M46 26 h34 M46 38 h34" stroke="var(--wood-dark)" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={49 + i * 7.5} y="17" width="5" height="8" rx="1" className={`tin tin-${i}`} />
          ))}
          {[0, 1].map((i) => (
            <rect key={i} x={49 + i * 7.5} y="29" width="5" height="8" rx="1" className={`tin tin-${i + 2}`} />
          ))}
          <g transform="translate(26 58) scale(1.35)">
            <StaffFigure id="kwame" pose="carry" tired={false} />
          </g>
        </Svg>
      );
    case 'rest':
      return (
        <Svg w={W} h={H}>
          <rect x="16" y="34" width="60" height="10" rx="4" fill="var(--burgundy-dark)" />
          <rect x="18" y="42" width="56" height="12" rx="4" fill="var(--burgundy)" />
          <g transform="translate(40 58) scale(1.35)">
            <StaffFigure id="mags" pose="sit" tired={false} />
          </g>
        </Svg>
      );
    case 'unload':
      return (
        <Svg w={W} h={H}>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={50 + (i % 2) * 15} y={i < 2 ? 40 : 26} width="14" height="13" rx="1.5" className="crate crate-dock" />
          ))}
          <g transform="translate(26 58) scale(1.35)">
            <StaffFigure id="tomasz" pose="push" tired={false} />
          </g>
        </Svg>
      );
    case 'prices':
      return (
        <Svg w={W} h={H}>
          {(['Low', 'Reg', 'High'] as const).map((t, i) => (
            <g key={t} transform={`translate(${8 + i * 25} ${20 + (i === 1 ? 0 : 6)})`}>
              <path d="M0 6 l6 -6 h16 v20 h-16 z" fill={i === 1 ? 'var(--mustard)' : 'var(--paper)'} stroke="var(--burgundy)" strokeWidth="1.4" />
              <circle cx="5" cy="6" r="1.6" fill="var(--burgundy)" />
              <text x="14" y="14" textAnchor="middle" fontSize="7" fontWeight="800" fill="var(--burgundy-dark)">
                {t}
              </text>
            </g>
          ))}
        </Svg>
      );
    case 'chilled':
      return (
        <Svg w={W} h={H}>
          <Cabinet x={30} y={16} />
          <g transform="translate(18 58) scale(1.35)">
            <StaffFigure id="dougie" pose="carry" tired={false} />
          </g>
        </Svg>
      );
  }
}

function Cabinet({ x, y, frost = false, broken = false }: { x: number; y: number; frost?: boolean; broken?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="44" height="30" rx="3" fill="var(--cold)" stroke="#6f97a8" strokeWidth="1.5" />
      <path d="M2 15 h40" stroke="#9cbccb" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={4 + i * 8} y="5" width="5" height="8" rx="1" className={`pack pack-${i % 3}`} />
      ))}
      {frost && (
        <text x="38" y="27" textAnchor="middle" fontSize="10" fill="#4a7f95">
          ❄
        </text>
      )}
      {broken && <path d="M4 26 l8 -8 l4 4 l8 -8" stroke="var(--bad)" strokeWidth="2" fill="none" />}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Specialities: a symbol with a short label
// ---------------------------------------------------------------------------

export const SPECIALITY_LABEL: Record<Speciality, string> = {
  checkout: 'Fast tills',
  calm: 'Calm queues',
  produce: 'Fruit & veg',
  chilled: 'Chiller know-how',
  stamina: 'Stamina',
  receiving: 'Fast unloading',
  none: 'New',
};

export function SpecialitySymbol({ s }: { s: Speciality }) {
  return (
    <Svg w={20} h={20}>
      <circle cx="10" cy="10" r="9.5" fill="var(--mustard-soft)" />
      {s === 'calm' && <path d="M10 15 C2 9 5 4 10 7 C15 4 18 9 10 15z" fill="var(--burgundy)" />}
      {s === 'checkout' && <path d="M11 3 L6 11 h4 l-1 6 l5 -8 h-4z" fill="var(--burgundy)" />}
      {s === 'receiving' && (
        <g>
          <rect x="5" y="7" width="10" height="8" rx="1" fill="#c9a46a" stroke="#8a5d33" />
          <path d="M5 10 h10" stroke="#8a5d33" />
        </g>
      )}
      {s === 'chilled' && (
        <text x="10" y="14.5" textAnchor="middle" fontSize="12" fill="#3e7389">
          ❄
        </text>
      )}
      {s === 'produce' && <circle cx="10" cy="11" r="5" fill="#c2452d" />}
      {s === 'stamina' && (
        <g>
          <rect x="4" y="7" width="11" height="7" rx="1.5" fill="none" stroke="var(--burgundy)" strokeWidth="1.5" />
          <rect x="6" y="9" width="7" height="3" fill="var(--good)" />
          <rect x="15" y="9" width="1.5" height="3" fill="var(--burgundy)" />
        </g>
      )}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Equipment: before and after
// ---------------------------------------------------------------------------

export type EquipId = 'till3' | 'shelfProduce' | 'shelfAmbient' | 'chilled' | 'shelfChilled' | 'fridge';

/** The equipment drawn as it would be installed (`after`) or as it is now. */
export function EquipArt({ id, after, w = 88, h = 54 }: { id: EquipId; after: boolean; w?: number; h?: number }) {
  return (
    <Svg w={w} h={h}>
      <g transform={`scale(${w / 88} ${h / 54})`}>
        {id === 'till3' &&
          [0, 1, 2].map((i) =>
            i < 2 || after ? (
              <g key={i} transform={`translate(4 ${4 + i * 16})`}>
                <rect width="30" height="8" rx="2" fill="#4a4442" />
                <rect x="30" width="26" height="12" rx="2" fill="var(--wood)" stroke="var(--wood-dark)" />
                <rect x="44" y="-3" width="8" height="5" rx="1" fill="var(--ink)" />
              </g>
            ) : (
              <rect key={i} x="4" y={4 + i * 16} width="56" height="12" rx="2" fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />
            ),
          )}
        {id === 'shelfProduce' &&
          [0, 1, 2].map((r) =>
            [0, 1].map((c) =>
              r < 2 || after ? (
                <g key={`${r}${c}`} transform={`translate(${6 + c * 40} ${3 + r * 17})`}>
                  <rect width="36" height="14" rx="2" fill="var(--wood)" stroke="var(--wood-dark)" />
                  {[0, 1, 2, 3].map((i) => (
                    <circle key={i} cx={6 + i * 8} cy="7" r="3.2" fill={['#c2452d', '#e08a1e', '#5d8f2f', '#9fbf3b', '#d8b25a', '#8a3a6b'][(r * 2 + c + i) % 6]} />
                  ))}
                </g>
              ) : (
                <rect key={`${r}${c}`} x={6 + c * 40} y={3 + r * 17} width="36" height="14" rx="2" fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />
              ),
            ),
          )}
        {id === 'shelfAmbient' &&
          [0, 1, 2].map((g) =>
            g < 2 || after ? (
              <g key={g} transform={`translate(4 ${4 + g * 16})`}>
                <rect width="80" height="10" rx="1.5" fill="var(--shelf)" stroke="var(--wood-dark)" />
                {Array.from({ length: 10 }, (_, i) => (
                  <rect key={i} x={3 + i * 7.6} y="2" width="5" height="6" rx="1" className={`tin tin-${(i + g) % 4}`} />
                ))}
              </g>
            ) : (
              <rect key={g} x="4" y={4 + g * 16} width="80" height="10" rx="1.5" fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />
            ),
          )}
        {id === 'chilled' && (after ? <><Cabinet x={0} y={12} /><Cabinet x={44} y={12} /></> : <rect x="2" y="12" width="84" height="30" rx="3" fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />)}
        {id === 'shelfChilled' && (
          <g transform="scale(0.5) translate(0 20)">
            <Cabinet x={0} y={4} />
            <Cabinet x={88} y={4} />
            {after ? (
              <>
                <Cabinet x={0} y={40} />
                <Cabinet x={88} y={40} />
              </>
            ) : (
              <rect x="0" y="40" width="132" height="30" rx="3" fill="none" stroke="var(--line-strong)" strokeDasharray="5 5" />
            )}
          </g>
        )}
        {id === 'fridge' && <Cabinet x={22} y={12} frost={after} broken={!after} />}
      </g>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Result indicators
// ---------------------------------------------------------------------------

export function ResultIcon({ kind }: { kind: 'profit' | 'customers' | 'staff' | 'value' }) {
  if (kind === 'customers')
    return (
      <Svg w={40} h={46}>
        <g transform="translate(20 42) scale(1.5)">
          <Shopper n={3} fill={0.9} />
        </g>
      </Svg>
    );
  if (kind === 'staff')
    return (
      <Svg w={40} h={46}>
        <g transform="translate(20 43) scale(1.05)">
          <StaffFigure id="bev" pose="stand" tired={false} />
        </g>
      </Svg>
    );
  return (
    <Svg w={40} h={46}>
      {kind === 'value' ? (
        <g>
          <path d="M8 38 V20 l12 -10 l12 10 V38z" fill="var(--burgundy)" />
          <rect x="16" y="26" width="8" height="12" fill="var(--mustard)" />
        </g>
      ) : (
        [0, 1, 2].map((i) => (
          <g key={i}>
            <ellipse cx="20" cy={36 - i * 7} rx="12" ry="4.5" fill="var(--mustard)" stroke="#a47a12" strokeWidth="1.2" />
            <rect x="8" y={33 - i * 7} width="24" height="3" fill="var(--mustard)" />
          </g>
        ))
      )}
    </Svg>
  );
}

/** Opening stock: the sun coming up over the shop. */
export function Sunrise() {
  return (
    <Svg w={28} h={20}>
      <path d="M2 17 H26" stroke="var(--wood-dark)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 17 A7 7 0 0 1 21 17 Z" fill="var(--mustard)" />
      {[-60, -30, 0, 30, 60].map((a) => (
        <path key={a} d="M14 7 V3" stroke="var(--mustard)" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${a} 14 17)`} />
      ))}
    </Svg>
  );
}

/** The midday delivery lorry. */
export function Lorry() {
  return (
    <Svg w={30} h={20}>
      <rect x="2" y="4" width="17" height="11" rx="1.5" fill="var(--burgundy)" />
      <path d="M19 7 h5 l3 4 v4 h-8z" fill="var(--burgundy-dark)" />
      <rect x="21" y="8" width="3" height="3" fill="#cfe3ea" />
      <circle cx="7" cy="16" r="2.4" fill="var(--ink)" />
      <circle cx="23" cy="16" r="2.4" fill="var(--ink)" />
    </Svg>
  );
}
