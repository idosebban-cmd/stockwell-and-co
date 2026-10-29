import { memo, type ReactNode } from 'react';
import { CONFIG, DEPTS, type DeptId } from '../sim/config';
import { assignmentLimit, productivity } from '../sim/engine';
import { ASSIGNMENT_LABEL } from '../sim/roster';
import type { AssignmentId, StaffMember } from '../sim/types';
import { DroppedBasket, poseFor, Shopper, StaffFigure } from './art/Characters';

export type ZoneId = 'produce' | 'chilled' | 'ambient' | 'tills' | 'dock' | 'break';

export const ZONE_JOB: Record<ZoneId, AssignmentId> = {
  produce: 'replenish:produce',
  chilled: 'replenish:chilled',
  ambient: 'replenish:ambient',
  tills: 'tills',
  dock: 'receive',
  break: 'break',
};

export const ZONE_NAME: Record<ZoneId, string> = {
  produce: 'Fruit & veg',
  chilled: 'Chilled food',
  ambient: 'Cupboard essentials',
  tills: 'Tills',
  dock: 'Delivery dock',
  break: 'Break room',
};

export interface StoreView {
  shelf: Record<DeptId, number>;
  shelfCap: Record<DeptId, number>;
  backroom: Record<DeptId, number>;
  dock: number;
  queue: number;
  arrivals: number;
  abandoned: number;
  /** Baskets left behind so far this hour. */
  dropped: number;
  emptyDepts: DeptId[];
  fridgeFault: boolean;
  lorry: boolean;
  promo: DeptId[];
  markdown: DeptId[];
  /** Short labels attached to a place in the shop, e.g. "Delivery: 12:00". */
  notices: ShopNotice[];
  /** Changes every replay step so walk-in animations restart. */
  tick: string;
  clock: string;
}

export interface ShopNotice {
  zone: ZoneId;
  text: string;
  tone: 'info' | 'warn' | 'good' | 'bad';
}

/** What the selected employee would achieve at a place. */
export interface JobHint {
  text: string;
  blocked: boolean;
}

const NOTICE_AT: Record<ZoneId, [number, number]> = {
  dock: [486, 50],
  produce: [146, 196],
  chilled: [780, 168],
  ambient: [800, 262],
  break: [812, 52],
  tills: [600, 448],
};

/** What each staff member is doing: working, standing idle (nothing to do), or just planned. */
export type Activity = 'work' | 'idle' | 'plan';

interface Props {
  view: StoreView;
  staff: StaffMember[];
  assignments: Record<string, AssignmentId>;
  activity: Record<string, Activity>;
  selected: string | null;
  onSelectStaff: (id: string) => void;
  onZone: (a: AssignmentId) => void;
  context: ZoneId | null;
  onContext: (z: ZoneId | null) => void;
  interactive: boolean;
  animating: boolean;
  reducedMotion: boolean;
  /** Places and people the current lesson points at. */
  highlightZones?: ZoneId[];
  highlightStaff?: string[];
  /** Shown on each place while someone is selected. */
  jobHints?: Partial<Record<ZoneId, JobHint>>;
  /** Places with a problem worth opening. */
  problemZones?: Partial<Record<ZoneId, 'urgent' | 'warn'>>;
}

const W = 1000;
const H = 700;
const LANE_Y = [468, 538, 608];
const QUEUE_FRONT_X = 780;
const QUEUE_GAP = 22;
const ENTRANCE: [number, number] = [130, 684];

/** Feet positions for each job. */
const SLOTS: Record<AssignmentId, [number, number][]> = {
  tills: LANE_Y.map((y) => [958, y + 46] as [number, number]),
  'replenish:produce': [
    [84, 426],
    [210, 426],
  ],
  'replenish:chilled': [
    [726, 266],
    [884, 266],
  ],
  'replenish:ambient': [
    [566, 336],
    [806, 390],
  ],
  receive: [
    [430, 130],
    [542, 130],
  ],
  break: [
    [772, 128],
    [846, 128],
  ],
};

const ZONES: { z: ZoneId; x: number; y: number; w: number; h: number; badge: [number, number] }[] = [
  { z: 'produce', x: 12, y: 156, w: 268, h: 278, badge: [226, 384] },
  { z: 'chilled', x: 300, y: 156, w: 688, h: 114, badge: [936, 158] },
  { z: 'ambient', x: 316, y: 272, w: 672, h: 160, badge: [936, 414] },
  { z: 'tills', x: 316, y: 466, w: 672, h: 224, badge: [806, 440] },
  { z: 'dock', x: 396, y: 12, w: 180, h: 134, badge: [524, 16] },
  { z: 'break', x: 704, y: 12, w: 284, h: 134, badge: [936, 16] },
];

/** Where each placed employee stands (viewBox units), for tips that point at someone. */
export function staffPositions(staff: StaffMember[], assignments: Record<string, AssignmentId>): Record<string, [number, number]> {
  const counts = new Map<AssignmentId, number>();
  const out: Record<string, [number, number]> = {};
  for (const s of staff) {
    const a = assignments[s.id];
    if (!a) continue;
    const i = counts.get(a) ?? 0;
    counts.set(a, i + 1);
    const slot = SLOTS[a][Math.min(i, SLOTS[a].length - 1)];
    out[s.id] = [slot[0] + (i >= SLOTS[a].length ? 20 : 0), slot[1]];
  }
  return out;
}

export const STORE_SIZE = { w: 1000, h: 700 };

function fillWord(f: number): string {
  if (f < 0.02) return 'Empty';
  if (f < 0.25) return 'Low';
  if (f > 0.9) return 'Full';
  return 'OK';
}

function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function StoreImpl(props: Props) {
  const { view, staff, assignments, activity, selected, onSelectStaff, onZone, context, onContext, interactive, animating, reducedMotion } = props;
  const highlightZones = props.highlightZones ?? [];
  const highlightStaff = props.highlightStaff ?? [];
  const hints = props.jobHints ?? {};
  const problemZones = props.problemZones ?? {};
  const counts = new Map<AssignmentId, number>();
  const placed: { s: StaffMember; a: AssignmentId; x: number; y: number }[] = [];
  for (const s of staff) {
    const a = assignments[s.id];
    if (!a) continue;
    const i = counts.get(a) ?? 0;
    counts.set(a, i + 1);
    const slot = SLOTS[a][Math.min(i, SLOTS[a].length - 1)];
    placed.push({ s, a, x: slot[0] + (i >= SLOTS[a].length ? 20 : 0), y: slot[1] });
  }
  const openTills = counts.get('tills') ?? 0;
  const motion = !reducedMotion && animating;
  const selectedName = staff.find((s) => s.id === selected)?.name;

  return (
    <svg
      className={`store ${motion ? 'is-animating' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label="Plan of the shop. Select a department to see its controls, or select a staff member and then a zone to move them."
    >
      <defs>
        <pattern id="tiles" width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="26" height="26" fill="var(--floor)" />
          <path d="M26 0H0V26" fill="none" stroke="var(--floor-line)" strokeWidth="1" />
        </pattern>
        <pattern id="boards" width="44" height="12" patternUnits="userSpaceOnUse">
          <rect width="44" height="12" fill="var(--back-floor)" />
          <path d="M0 12H44M22 0V12" stroke="var(--back-line)" strokeWidth="1" />
        </pattern>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(179,54,44,0.12)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--bad)" strokeWidth="2" />
        </pattern>
        <pattern id="belt" width="8" height="16" patternUnits="userSpaceOnUse">
          <rect width="8" height="16" fill="#4a4442" />
          <rect width="2" height="16" fill="#5d5754" />
        </pattern>
      </defs>

      {/* Building shell */}
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="14" fill="url(#tiles)" stroke="var(--wall)" strokeWidth="8" />
      <rect x="8" y="8" width={W - 16} height="142" fill="url(#boards)" />
      <Walkways />
      <BackWalls />

      <Stockroom backroom={view.backroom} />
      <Dock dock={view.dock} lorry={view.lorry} />
      <Office clock={view.clock} />
      <BreakRoom />

      <Produce view={view} />
      <Chilled view={view} />
      <Groceries view={view} />
      <Checkouts open={openTills} queue={view.queue} />
      <Entrance dropped={view.dropped} />

      {/* Zones: select a department, or place the selected employee */}
      {ZONES.map((zone) => {
        const a = ZONE_JOB[zone.z];
        const n = counts.get(a) ?? 0;
        const lim = assignmentLimit(a);
        const full = n >= lim;
        const hint = selected ? hints[zone.z] : undefined;
        const label = selected
          ? `${ASSIGNMENT_LABEL[a]}: move ${selectedName} here (${n} of ${lim})${full ? ', full' : ''}${hint ? `. ${hint.text}` : ''}`
          : `${ZONE_NAME[zone.z]}: ${n} of ${lim} staff${problemZones[zone.z] ? ', needs attention' : ''}. Open.`;
        const activate = () => {
          if (!interactive) return;
          if (selected) onZone(a);
          else onContext(context === zone.z ? null : zone.z);
        };
        return (
          <g key={zone.z}>
            <rect
              className={`zone ${selected && interactive ? (hint?.blocked || full ? 'zone-armed zone-full' : 'zone-armed') : interactive ? 'zone-browse' : ''} ${context === zone.z ? 'zone-context' : ''} ${highlightZones.includes(zone.z) ? 'zone-lesson' : ''}`}
              x={zone.x}
              y={zone.y}
              width={zone.w}
              height={zone.h}
              rx="10"
              tabIndex={interactive ? 0 : -1}
              role="button"
              aria-label={label}
              aria-pressed={!selected ? context === zone.z : undefined}
              onClick={activate}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate();
                }
              }}
            />
            <ZoneBadge x={zone.badge[0]} y={zone.badge[1]} n={n} lim={lim} />
            {problemZones[zone.z] && !selected && <ProblemMark x={zone.badge[0] - 14} y={zone.badge[1] + 9} level={problemZones[zone.z]!} />}
          </g>
        );
      })}

      <Notices notices={view.notices} onOpen={interactive ? (z) => onContext(z) : undefined} />
      <QueueFigures open={openTills} queue={view.queue} />
      <AisleShoppers view={view} motion={motion} />
      <WalkOuts view={view} motion={motion} />

      {selected &&
        ZONES.map((zone) => {
          const hint = hints[zone.z];
          if (!hint) return null;
          return <HintPill key={zone.z} zone={zone} hint={hint} />;
        })}

      {placed.map(({ s, a, x, y }) => (
        <StaffToken
          lesson={highlightStaff.includes(s.id)}
          key={s.id}
          s={s}
          a={a}
          x={x}
          y={y}
          act={activity[s.id] ?? 'plan'}
          selected={selected === s.id}
          interactive={interactive}
          onClick={() => onSelectStaff(s.id)}
        />
      ))}
    </svg>
  );
}

export const Store = memo(StoreImpl);

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

function Walkways() {
  const strips: [number, number, number, number][] = [
    [290, 236, 698, 34], // main aisle in front of chilled
    [282, 156, 32, 312], // cross aisle by fruit & veg, up to the stockroom door
    [12, 434, 976, 32], // front aisle
    [316, 310, 672, 30], // grocery aisle 2
    [316, 364, 672, 30], // grocery aisle 3
  ];
  return (
    <g aria-hidden="true">
      {strips.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="var(--aisle)" />
      ))}
      <AisleSign x={300} y={252} text="1" />
      <AisleSign x={330} y={325} text="2" />
      <AisleSign x={330} y={379} text="3" />
    </g>
  );
}

function AisleSign({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="8" fill="var(--burgundy)" />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--paper)">
        {text}
      </text>
    </g>
  );
}

function BackWalls() {
  const doors: [number, string][] = [
    [296, 'STAFF'],
    [470, 'DOCK'],
    [740, 'STAFF'],
  ];
  return (
    <g aria-hidden="true">
      <path d="M8 150 H296 M346 150 H470 M520 150 H740 M790 150 H992" stroke="var(--wall)" strokeWidth="6" />
      <path d="M392 8 V150 M580 8 V150 M700 8 V150" stroke="var(--wall)" strokeWidth="5" />
      {doors.map(([x, t]) => (
        <g key={x}>
          <rect x={x + 2} y="147" width="21" height="6" fill="#c8b593" />
          <rect x={x + 27} y="147" width="21" height="6" fill="#c8b593" />
          <text x={x + 25} y="166" textAnchor="middle" fontSize="7" fill="var(--muted)" letterSpacing="1">
            {t}
          </text>
        </g>
      ))}
    </g>
  );
}

function RoomLabel({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={x} y={y} className="room-label">
      {children}
    </text>
  );
}

function Stockroom({ backroom }: { backroom: Record<DeptId, number> }) {
  const bays: [DeptId, number, string][] = [
    ['produce', 22, 'Fruit & veg'],
    ['chilled', 144, 'Cold room'],
    ['ambient', 266, 'Cupboard'],
  ];
  return (
    <g aria-hidden="true">
      <RoomLabel x={20} y={26}>
        STOCKROOM
      </RoomLabel>
      {bays.map(([d, x, label]) => {
        const cap = CONFIG.departments[d].backroomCapacity;
        const n = Math.round(Math.min(1, backroom[d] / cap) * 12);
        return (
          <g key={d}>
            {d === 'chilled' && <rect x={x - 4} y="32" width="114" height="92" rx="4" fill="var(--cold)" stroke="#8fb3c2" strokeDasharray="4 3" />}
            <rect x={x} y="36" width="106" height="84" fill="none" stroke="#6f6a66" strokeWidth="2" />
            <path d={`M${x} 64 h106 M${x} 92 h106`} stroke="#6f6a66" strokeWidth="2" />
            {Array.from({ length: n }, (_, i) => {
              const shelf = Math.floor(i / 4);
              return <rect key={i} x={x + 4 + (i % 4) * 25} y={98 - shelf * 28} width="22" height="20" rx="2" className={`crate crate-${d}`} />;
            })}
            <text x={x + 53} y="138" textAnchor="middle" fontSize="11" fill={backroom[d] < 1 ? 'var(--bad)' : 'var(--ink)'} fontWeight={backroom[d] < 1 ? 700 : 400}>
              {label}: {backroom[d] < 1 ? 'none' : Math.round(backroom[d])}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Dock({ dock, lorry }: { dock: number; lorry: boolean }) {
  const n = Math.min(10, Math.ceil(dock / 120));
  return (
    <g aria-hidden="true">
      <RoomLabel x={404} y={26}>
        {dock > 0 ? `DOCK · ${Math.round(dock).toLocaleString('en-GB')}` : 'DOCK'}
      </RoomLabel>
      <rect x="434" y="8" width="112" height="9" fill="var(--mustard)" />
      <path d="M440 8 l6 9 M456 8 l6 9 M472 8 l6 9 M488 8 l6 9 M504 8 l6 9 M520 8 l6 9 M536 8 l6 9" stroke="var(--ink)" strokeWidth="2" opacity="0.4" />
      {lorry && (
        <g className="lorry">
          <rect x="440" y="18" width="100" height="30" rx="3" fill="var(--burgundy)" />
          <text x="490" y="37" textAnchor="middle" fontSize="9" fill="var(--paper)" letterSpacing="1">
            WHOLESALE
          </text>
        </g>
      )}
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={404 + (i % 5) * 34} y={i < 5 ? 100 : 76} width="30" height="22" rx="2" className="crate crate-dock" />
          <path d={`M${404 + (i % 5) * 34} ${(i < 5 ? 100 : 76) + 11} h30`} stroke="rgba(0,0,0,0.2)" />
        </g>
      ))}
      {dock < 1 && (
        <text x="486" y="140" textAnchor="middle" fontSize="11" fill="var(--muted)">
          Nothing waiting
        </text>
      )}
    </g>
  );
}

function Office({ clock }: { clock: string }) {
  return (
    <g aria-hidden="true">
      <RoomLabel x={590} y={26}>
        OFFICE
      </RoomLabel>
      <circle cx="640" cy="72" r="28" fill="var(--paper)" stroke="var(--burgundy)" strokeWidth="4" />
      <text x="640" y="78" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--burgundy)">
        {clock}
      </text>
      <rect x="600" y="112" width="80" height="16" rx="2" fill="var(--wood)" />
      <text x="640" y="140" textAnchor="middle" fontSize="9" fill="var(--muted)">
        (mostly biscuits)
      </text>
    </g>
  );
}

function BreakRoom() {
  return (
    <g aria-hidden="true">
      <RoomLabel x={714} y={26}>
        BREAK ROOM
      </RoomLabel>
      <rect x="738" y="88" width="148" height="18" rx="6" fill="var(--burgundy-dark)" />
      <rect x="742" y="104" width="140" height="22" rx="5" fill="var(--burgundy)" />
      <rect x="732" y="96" width="12" height="32" rx="4" fill="var(--burgundy-dark)" />
      <rect x="880" y="96" width="12" height="32" rx="4" fill="var(--burgundy-dark)" />
      <rect x="906" y="40" width="76" height="16" rx="2" fill="var(--wood)" />
      <rect x="918" y="28" width="14" height="14" rx="3" fill="#7d7d7d" />
      <rect x="944" y="32" width="7" height="9" rx="1" fill="var(--paper)" stroke="var(--burgundy)" />
      <rect x="956" y="32" width="7" height="9" rx="1" fill="var(--mustard-soft)" stroke="var(--burgundy)" />
      <rect x="912" y="68" width="62" height="52" rx="2" fill="#fff" stroke="var(--line-strong)" />
      <text x="943" y="81" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--burgundy)">
        ROTA
      </text>
      <path d="M918 88 h50 M918 96 h50 M918 104 h40 M918 112 h46" stroke="var(--line-strong)" strokeWidth="1.5" />
      <text x="806" y="62" textAnchor="middle" fontSize="8" fill="var(--muted)" fontStyle="italic">
        Please wash your mug, Gary
      </text>
    </g>
  );
}

function Level({ x, y, w, units, cap, label, tag }: { x: number; y: number; w: number; units: number; cap: number; label: string; tag?: string }) {
  const f = Math.max(0, Math.min(1, units / Math.max(1, cap)));
  const word = fillWord(f);
  const low = word === 'Empty' || word === 'Low';
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={w} height="22" rx="6" fill="var(--paper)" stroke={low ? 'var(--bad)' : 'var(--line-strong)'} strokeWidth={low ? 2 : 1} />
      <rect x={x + 3} y={y + 16} width={(w - 6) * f} height="3.5" rx="1.5" fill={low ? 'var(--bad)' : 'var(--good)'} />
      <text x={x + 7} y={y + 12.5} fontSize="11" fill="var(--burgundy-dark)" fontWeight="800">
        {label}
        {tag && (
          <tspan fill="var(--burgundy)" fontWeight="700">
            {' '}
            · {tag}
          </tspan>
        )}
      </text>
      <text x={x + w - 7} y={y + 12.5} fontSize="11" textAnchor="end" fill={low ? 'var(--bad)' : 'var(--muted)'} fontWeight="700">
        {word === 'Empty' ? '⚠ EMPTY' : `${word} · ${Math.round(units)}`}
      </text>
    </g>
  );
}

function tagFor(view: StoreView, d: DeptId): string | undefined {
  const t = [view.markdown.includes(d) ? 'stickers' : '', view.promo.includes(d) ? 'promo' : ''].filter(Boolean).join(', ');
  return t || undefined;
}

function Sticker({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="9" fill="#f2d21a" stroke="#b89a0a" />
      <text x={x} y={y + 2.5} textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#5a4a00">
        −35%
      </text>
    </g>
  );
}

function Produce({ view }: { view: StoreView }) {
  const f = view.shelf.produce / Math.max(1, view.shelfCap.produce);
  const per = Math.round(Math.max(0, Math.min(1, f)) * 15);
  const crates: [number, number, string][] = [
    [26, 186, '#c2452d'],
    [150, 186, '#e08a1e'],
    [26, 252, '#5d8f2f'],
    [150, 252, '#9fbf3b'],
    [26, 318, '#d8b25a'],
    [150, 318, '#8a3a6b'],
  ];
  return (
    <g aria-hidden="true">
      {crates.map(([x, y, colour], c) => (
        <g key={c}>
          <rect x={x - 3} y={y + 46} width="116" height="8" rx="2" fill="var(--wood-dark)" />
          <rect x={x} y={y} width="110" height="50" rx="4" fill="var(--wood)" stroke="var(--wood-dark)" strokeWidth="2" />
          <path d={`M${x} ${y + 17} h110 M${x} ${y + 34} h110`} stroke="var(--wood-dark)" strokeWidth="1" opacity="0.5" />
          {Array.from({ length: per }, (_, i) => (
            <circle key={i} cx={x + 13 + (i % 5) * 21} cy={y + 40 - Math.floor(i / 5) * 14} r="8" fill={colour} stroke="rgba(0,0,0,0.15)" />
          ))}
          {view.markdown.includes('produce') && c === 0 && <Sticker x={x + 98} y={y + 8} />}
        </g>
      ))}
      <Level x={20} y={158} w={256} units={view.shelf.produce} cap={view.shelfCap.produce} label="Fruit & veg" tag={tagFor(view, 'produce')} />
      {view.emptyDepts.includes('produce') && <EmptyFlag x={145} y={290} />}
    </g>
  );
}

function Chilled({ view }: { view: StoreView }) {
  const working = view.fridgeFault ? 2 : 4;
  const f = view.shelf.chilled / Math.max(1, view.shelfCap.chilled);
  const per = Math.round(Math.max(0, Math.min(1, f)) * 24);
  return (
    <g aria-hidden="true">
      {Array.from({ length: 4 }, (_, c) => {
        const x = 306 + c * 171;
        return (
          <g key={c}>
            <rect x={x} y="180" width="165" height="52" rx="4" fill="var(--cold)" stroke="#6f97a8" strokeWidth="2" />
            <rect x={x + 3} y="183" width="159" height="4" fill="#b9d7e2" />
            <path d={`M${x + 4} 208 h157`} stroke="#9cbccb" strokeWidth="1.5" />
            {c < working &&
              Array.from({ length: per }, (_, i) => (
                <rect key={i} x={x + 8 + (i % 12) * 13} y={191 + Math.floor(i / 12) * 21} width="9" height="15" rx="2" className={`pack pack-${(i + c) % 3}`} />
              ))}
            <rect x={x} y="226" width="165" height="6" rx="2" fill="rgba(255,255,255,0.6)" />
          </g>
        );
      })}
      {view.markdown.includes('chilled') && <Sticker x={466} y={194} />}
      {view.fridgeFault && (
        <g>
          <rect x="648" y="180" width="336" height="52" fill="url(#hatch)" />
          <rect x="730" y="194" width="172" height="22" rx="6" fill="var(--bad)" />
          <text x="816" y="209" textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">
            ⚠ CHILLER FAULT
          </text>
        </g>
      )}
      <Level
        x={306}
        y={156}
        w={330}
        units={view.shelf.chilled}
        cap={view.shelfCap.chilled}
        label={view.fridgeFault ? 'Chilled (half out of use)' : 'Chilled'}
        tag={tagFor(view, 'chilled')}
      />
      {view.emptyDepts.includes('chilled') && <EmptyFlag x={470} y={208} />}
    </g>
  );
}

function Groceries({ view }: { view: StoreView }) {
  const f = view.shelf.ambient / Math.max(1, view.shelfCap.ambient);
  const per = Math.round(Math.max(0, Math.min(1, f)) * 34);
  const gondolas = [286, 340, 394];
  const promo = view.promo.includes('ambient');
  return (
    <g aria-hidden="true">
      {gondolas.map((y, g) => (
        <g key={g}>
          <rect x="344" y={y} width="608" height="24" rx="2" fill="var(--shelf)" stroke="var(--wood-dark)" />
          <path d={`M344 ${y + 12} h608`} stroke="var(--wood-dark)" strokeWidth="1.5" />
          {Array.from({ length: per }, (_, i) => (
            <g key={i}>
              <rect x={348 + i * 17.8} y={y + 1.5} width="13" height="9" rx="1.5" className={`tin tin-${(i + g) % 4}`} />
              <rect x={348 + (33 - i) * 17.8} y={y + 13.5} width="13" height="9" rx="1.5" className={`tin tin-${(i + g + 2) % 4}`} />
            </g>
          ))}
          <rect x="332" y={y - 2} width="12" height="28" rx="2" fill={promo ? 'var(--mustard)' : 'var(--wood)'} />
          <rect x="952" y={y - 2} width="12" height="28" rx="2" fill={promo ? 'var(--mustard)' : 'var(--wood)'} />
        </g>
      ))}
      <Level x={330} y={242} w={300} units={view.shelf.ambient} cap={view.shelfCap.ambient} label="Cupboard essentials" tag={tagFor(view, 'ambient')} />
      {view.emptyDepts.includes('ambient') && <EmptyFlag x={650} y={350} />}
    </g>
  );
}

function EmptyFlag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 54} y={y - 13} width="108" height="22" rx="11" fill="var(--bad)" />
      <text x={x} y={y + 2} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">
        SHELF EMPTY
      </text>
    </g>
  );
}

function Checkouts({ open, queue }: { open: number; queue: number }) {
  return (
    <g aria-hidden="true">
      {LANE_Y.map((y, i) => {
        const on = i < open;
        return (
          <g key={i} opacity={on ? 1 : 0.55}>
            <path d={`M330 ${y + 54} H936`} stroke="var(--line-strong)" strokeWidth="2" strokeDasharray={on ? '0' : '6 4'} />
            <rect x="820" y={y + 6} width="62" height="18" rx="3" fill="url(#belt)" />
            <rect x="882" y={y + 4} width="52" height="22" rx="3" fill="var(--wood)" stroke="var(--wood-dark)" strokeWidth="1.5" />
            <rect x="912" y={y - 2} width="16" height="11" rx="2" fill="var(--ink)" />
            <rect x="914" y={y} width="12" height="6" fill={on ? '#9fd39a' : '#555'} />
            <circle cx="808" cy={y + 15} r="9" fill={on ? 'var(--burgundy)' : 'var(--muted)'} />
            <text x="808" y={y + 18.5} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--paper)">
              {i + 1}
            </text>
            {!on && (
              <g>
                <path d={`M790 ${y + 26} v26`} stroke="var(--burgundy)" strokeWidth="3" />
                <rect x="744" y={y + 28} width="68" height="16" rx="3" fill="var(--paper)" stroke="var(--burgundy)" />
                <text x="778" y={y + 40} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--burgundy)">
                  TILL CLOSED
                </text>
              </g>
            )}
          </g>
        );
      })}
      <rect x="860" y="436" width="126" height="28" rx="7" fill="var(--paper)" stroke={queue > 10 ? 'var(--bad)' : 'var(--line-strong)'} strokeWidth="2" />
      <text x="923" y="454" textAnchor="middle" fontSize="12" fontWeight="700" fill={queue > 10 ? 'var(--bad)' : 'var(--ink)'}>
        {queue > 10 ? '⚠ ' : ''}Queue {Math.round(queue)} · {open}/3 open
      </text>
    </g>
  );
}

function Entrance({ dropped }: { dropped: number }) {
  return (
    <g aria-hidden="true">
      <rect x="56" y="686" width="150" height="10" fill="#cfe3ea" stroke="#8fb3c2" />
      <rect x="66" y="644" width="130" height="34" rx="4" fill="var(--burgundy)" />
      <text x="131" y="666" textAnchor="middle" fontSize="12" fill="var(--paper)" fontWeight="700" letterSpacing="1">
        WAY IN · WAY OUT
      </text>
      <text x="131" y="636" textAnchor="middle" fontSize="9" fill="var(--muted)">
        Please mind the step. It is famous.
      </text>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="226" y={644 - i * 4} width="22" height="12" rx="2" fill="var(--burgundy)" opacity={0.7 + i * 0.08} stroke="var(--paper)" strokeWidth="0.8" />
      ))}
      <text x="237" y="672" textAnchor="middle" fontSize="8" fill="var(--muted)">
        baskets
      </text>
      <rect x="24" y="510" width="250" height="88" rx="6" fill="rgba(255,255,255,0.35)" stroke="var(--line)" />
      <text x="149" y="548" textAnchor="middle" fontSize="17" fill="var(--burgundy-dark)" fontFamily="var(--serif)" fontWeight="700">
        Stockwell &amp; Co
      </text>
      <text x="149" y="568" textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontStyle="italic">
        Your neighbourhood grocer since 1987
      </text>
      {Array.from({ length: Math.min(10, Math.round(dropped)) }, (_, i) => (
        <g key={i} transform={`translate(${296 + (i % 5) * 5} ${620 - Math.floor(i / 5) * 7 - (i % 2) * 2})`}>
          <DroppedBasket />
        </g>
      ))}
      {dropped >= 1 && (
        <text x="306" y="638" textAnchor="middle" fontSize="8" fill="var(--bad)" fontWeight="700">
          left behind
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Queue split across open tills, one figure per customer (up to a lane's length). */
function QueueFigures({ open, queue }: { open: number; queue: number }) {
  const lanes = Math.max(1, open);
  const total = Math.round(queue);
  const perLane = Array.from({ length: lanes }, (_, i) => Math.floor(total / lanes) + (i < total % lanes ? 1 : 0));
  const maxShown = 20;
  return (
    <g aria-hidden="true">
      {perLane.map((n, lane) => {
        const y = LANE_Y[Math.min(lane, 2)] + 42;
        return (
          <g key={lane}>
            {Array.from({ length: Math.min(n, maxShown) }, (_, i) => (
              <g key={i} className="queuer" style={{ transform: `translate(${QUEUE_FRONT_X - i * QUEUE_GAP}px, ${y}px)` }}>
                <Shopper n={lane * 31 + i} fill={0.85} />
              </g>
            ))}
            {n > maxShown && (
              <text x={QUEUE_FRONT_X - maxShown * QUEUE_GAP + 4} y={y - 20} fontSize="11" fontWeight="800" fill="var(--bad)">
                +{n - maxShown}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

const DEPT_SPOTS: Record<DeptId, { x: [number, number]; y: [number, number] }> = {
  produce: { x: [40, 260], y: [244, 432] },
  chilled: { x: [340, 960], y: [256, 268] },
  ambient: { x: [380, 930], y: [334, 392] },
};

/** Shoppers arriving this step, spread across departments by basket share. */
function AisleShoppers({ view, motion }: { view: StoreView; motion: boolean }) {
  const n = Math.min(14, Math.round(view.arrivals / 1.2));
  if (n <= 0) return null;
  const weights = DEPTS.map((d) => CONFIG.departments[d].basket);
  const sum = weights.reduce((t, x) => t + x, 0);
  const out: ReactNode[] = [];
  let k = 0;
  DEPTS.forEach((d, di) => {
    const m = di === DEPTS.length - 1 ? n - k : Math.round((n * weights[di]) / sum);
    const spot = DEPT_SPOTS[d];
    for (let i = 0; i < m; i++, k++) {
      const x = spot.x[0] + hash(k, 3) * (spot.x[1] - spot.x[0]);
      const y = d === 'ambient' ? (k % 2 ? 336 : 390) : spot.y[0] + hash(k, 5) * (spot.y[1] - spot.y[0]);
      const empty = view.emptyDepts.includes(d);
      out.push(
        <g key={`${view.tick}-${k}`} transform={`translate(${x} ${y})`}>
          <g
            className={motion ? 'walk-in' : ''}
            style={{ ['--sx' as string]: `${ENTRANCE[0] - x}px`, ['--sy' as string]: `${ENTRANCE[1] - y}px`, animationDelay: `${(k % 7) * 70}ms` }}
          >
            <Shopper n={k + 3} fill={empty ? 0.1 : 0.4 + hash(k, 9) * 0.5} puzzled={empty} />
          </g>
        </g>,
      );
    }
  });
  return <g aria-hidden="true">{out}</g>;
}

function WalkOuts({ view, motion }: { view: StoreView; motion: boolean }) {
  const m = Math.min(6, Math.round(view.abandoned));
  return (
    <g aria-hidden="true">
      {Array.from({ length: m }, (_, i) => {
        const x = 340 + i * 26;
        const y = 462;
        return (
          <g key={`${view.tick}-out-${i}`} transform={`translate(${x} ${y})`}>
            <g className={motion ? 'walk-out' : ''} style={{ ['--ex' as string]: `${ENTRANCE[0] - x}px`, ['--ey' as string]: `${ENTRANCE[1] - y}px` }}>
              <Shopper n={i + 11} leaving />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function HintPill({ zone, hint }: { zone: (typeof ZONES)[number]; hint: JobHint }) {
  const x = zone.x + zone.w / 2;
  const y = zone.y + zone.h / 2;
  const w = hint.text.length * 6.6 + 24;
  return (
    <g className="hint-pill" aria-hidden="true" pointerEvents="none">
      <rect x={x - w / 2} y={y - 13} width={w} height="26" rx="13" fill={hint.blocked ? 'var(--paper)' : 'var(--burgundy)'} stroke="var(--burgundy)" strokeWidth="2" />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12" fontWeight="800" fill={hint.blocked ? 'var(--burgundy-dark)' : 'var(--paper)'}>
        {hint.blocked ? '✕ ' : ''}
        {hint.text}
      </text>
    </g>
  );
}

function ProblemMark({ x, y, level }: { x: number; y: number; level: 'urgent' | 'warn' }) {
  return (
    <g aria-hidden="true" pointerEvents="none" className={level === 'urgent' ? 'problem-mark urgent' : 'problem-mark'}>
      <circle cx={x} cy={y} r="10" fill={level === 'urgent' ? 'var(--bad)' : 'var(--mustard)'} stroke="var(--paper)" strokeWidth="2" />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="900" fill={level === 'urgent' ? '#fff' : 'var(--burgundy-dark)'}>
        !
      </text>
    </g>
  );
}

function Notices({ notices, onOpen }: { notices: ShopNotice[]; onOpen?: (z: ZoneId) => void }) {
  const stack = new Map<ZoneId, number>();
  return (
    <g>
      {notices.map((n, i) => {
        const k = stack.get(n.zone) ?? 0;
        stack.set(n.zone, k + 1);
        const [x, y0] = NOTICE_AT[n.zone];
        const y = y0 + k * 24;
        const w = n.text.length * 6.6 + 20;
        return (
          <g
            key={i}
            className={`notice notice-${n.tone} ${onOpen ? 'notice-open' : ''}`}
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
            aria-label={onOpen ? `${n.text}. Open ${ZONE_NAME[n.zone]}` : undefined}
            aria-hidden={onOpen ? undefined : true}
            onClick={onOpen ? () => onOpen(n.zone) : undefined}
            onKeyDown={
              onOpen
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(n.zone);
                    }
                  }
                : undefined
            }
          >
            <rect
              x={x - w / 2}
              y={y - 11}
              width={w}
              height="21"
              rx="10.5"
              fill={n.tone === 'warn' ? 'var(--mustard)' : n.tone === 'good' ? '#e3efe2' : n.tone === 'bad' ? '#f8e3df' : 'var(--paper)'}
              stroke={n.tone === 'good' ? 'var(--good)' : n.tone === 'bad' ? 'var(--bad)' : 'var(--burgundy)'}
              strokeWidth="1.5"
            />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="var(--burgundy-dark)">
              {n.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ZoneBadge({ x, y, n, lim }: { x: number; y: number; n: number; lim: number }) {
  return (
    <g className="zone-badge" aria-hidden="true">
      <rect x={x} y={y} width="48" height="18" rx="9" fill={n === 0 ? 'var(--paper)' : 'var(--burgundy)'} stroke="var(--burgundy)" />
      <text x={x + 24} y={y + 13} textAnchor="middle" fontSize="10.5" fill={n === 0 ? 'var(--burgundy)' : 'var(--paper)'} fontWeight="700">
        {n}/{lim} staff
      </text>
    </g>
  );
}

function StaffToken({
  s,
  a,
  x,
  y,
  act,
  selected,
  interactive,
  onClick,
  lesson,
}: {
  lesson?: boolean;
  s: StaffMember;
  a: AssignmentId;
  x: number;
  y: number;
  act: Activity;
  selected: boolean;
  interactive: boolean;
  onClick: () => void;
}) {
  const e = Math.max(0, Math.min(100, s.energy));
  const tired = productivity(s.energy) < 1;
  const pose = act === 'plan' ? (a === 'break' ? 'sit' : a === 'tills' ? 'scan' : 'stand') : poseFor(a, act === 'work');
  const name = s.isTemp ? 'Temp' : s.name;
  const barColour = e < CONFIG.staff.exhaustedBelow ? 'var(--bad)' : e < CONFIG.staff.tiredBelow ? 'var(--mustard)' : 'var(--good)';
  return (
    <g
      className={`token ${selected ? 'token-selected' : ''}`}
      transform={`translate(${x} ${y})`}
      onClick={
        interactive
          ? (ev) => {
              ev.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <title>{`${s.name}: ${ASSIGNMENT_LABEL[a]}, energy ${Math.round(e)}${tired ? ' (tired, working slower)' : ''}${act === 'idle' ? ', nothing to do' : ''}`}</title>
      {lesson && !selected && <circle cx="0" cy="-30" r="38" className="lesson-ring" />}
      {selected && <ellipse cx="0" cy="0" rx="22" ry="7" fill="none" stroke="var(--mustard)" strokeWidth="4" />}
      <g className={act === 'work' ? 'busy' : ''}>
        <g transform={a === 'tills' ? 'scale(1.2)' : 'scale(1.4)'}>
          <StaffFigure id={s.id} pose={pose} tired={tired} />
        </g>
      </g>
      {act === 'idle' && a !== 'break' && <Bubble text="…" />}
      {tired && act !== 'idle' && a !== 'break' && <Bubble text="z" tone="tired" />}
      <g transform="translate(0 4)">
        <rect x="-25" y="0" width="50" height="17" rx="5" fill="var(--paper)" stroke={selected ? 'var(--mustard)' : 'var(--line-strong)'} strokeWidth={selected ? 2 : 1} />
        <text y="10" textAnchor="middle" fontSize="9.5" fill="var(--ink)" fontWeight="800">
          {name}
        </text>
        <rect x="-20" y="12.5" width="40" height="2.6" rx="1.3" fill="var(--line)" />
        <rect x="-20" y="12.5" width={(40 * e) / 100} height="2.6" rx="1.3" fill={barColour} />
      </g>
    </g>
  );
}

function Bubble({ text, tone }: { text: string; tone?: 'tired' }) {
  return (
    <g className="bubble" transform="translate(14 -62)">
      <rect x="-2" y="-9" width="16" height="13" rx="6" fill="var(--paper)" stroke={tone ? 'var(--mustard)' : 'var(--muted)'} />
      <text x="6" y="1" textAnchor="middle" fontSize="10" fontWeight="800" fill={tone ? '#7d5c0c' : 'var(--muted)'}>
        {text}
      </text>
    </g>
  );
}

export function storeViewFromState(
  args: Omit<StoreView, 'arrivals' | 'abandoned' | 'dropped' | 'emptyDepts' | 'tick' | 'notices'> & { dropped?: number; notices?: ShopNotice[] },
): StoreView {
  return { dropped: 0, notices: [], ...args, arrivals: 0, abandoned: 0, emptyDepts: DEPTS.filter((d) => args.shelf[d] < 1), tick: 'rest' };
}
