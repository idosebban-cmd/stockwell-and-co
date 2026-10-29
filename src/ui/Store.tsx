import { memo } from 'react';
import { CONFIG, DEPTS, type DeptId } from '../sim/config';
import { assignmentLimit, productivity } from '../sim/engine';
import { ASSIGNMENT_LABEL } from '../sim/roster';
import type { AssignmentId, StaffMember } from '../sim/types';

export interface StoreView {
  shelf: Record<DeptId, number>;
  shelfCap: Record<DeptId, number>;
  backroom: Record<DeptId, number>;
  dock: number;
  queue: number;
  arrivals: number;
  abandoned: number;
  emptyDepts: DeptId[];
  fridgeFault: boolean;
  lorry: boolean;
  /** Changes every replay step so walk-in animations restart. */
  tick: string;
  clock: string;
}

interface Props {
  view: StoreView;
  staff: StaffMember[];
  assignments: Record<string, AssignmentId>;
  selected: string | null;
  onSelectStaff: (id: string) => void;
  onZone: (a: AssignmentId) => void;
  interactive: boolean;
  animating: boolean;
  reducedMotion: boolean;
}

const W = 960;
const H = 600;

/** Where each job's staff stand. */
const SLOTS: Record<AssignmentId, [number, number][]> = {
  tills: [
    [445, 548],
    [585, 548],
    [725, 548],
  ],
  'replenish:produce': [
    [80, 400],
    [180, 400],
  ],
  'replenish:chilled': [
    [880, 232],
    [700, 232],
  ],
  'replenish:ambient': [
    [500, 380],
    [760, 380],
  ],
  receive: [
    [420, 66],
    [530, 66],
  ],
  break: [
    [800, 100],
    [880, 100],
  ],
};

const ZONES: { a: AssignmentId; x: number; y: number; w: number; h: number; label: string; badge: [number, number] }[] = [
  { a: 'replenish:produce', x: 16, y: 170, w: 262, h: 262, label: 'Fruit & veg', badge: [226, 408] },
  { a: 'replenish:chilled', x: 300, y: 166, w: 644, h: 92, label: 'Chilled food', badge: [890, 172] },
  { a: 'replenish:ambient', x: 300, y: 266, w: 644, h: 140, label: 'Cupboard essentials', badge: [890, 410] },
  { a: 'tills', x: 380, y: 470, w: 420, h: 112, label: 'Tills', badge: [384, 474] },
  { a: 'receive', x: 384, y: 16, w: 180, h: 128, label: 'Delivery dock', badge: [512, 34] },
  { a: 'break', x: 744, y: 16, w: 200, h: 128, label: 'Break room', badge: [890, 34] },
];

function fillWord(f: number): string {
  if (f < 0.02) return 'Empty';
  if (f < 0.25) return 'Low';
  if (f > 0.9) return 'Full';
  return 'OK';
}

function initials(name: string): string {
  return name === 'Agency temp' ? 'T' : name.slice(0, 2);
}

function energyColour(e: number): string {
  if (e < CONFIG.staff.exhaustedBelow) return 'var(--bad)';
  if (e < CONFIG.staff.tiredBelow) return 'var(--mustard)';
  return 'var(--good)';
}

/** Deterministic pseudo-random in [0,1) from integers (for scatter positions). */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function StoreImpl({ view, staff, assignments, selected, onSelectStaff, onZone, interactive, animating, reducedMotion }: Props) {
  const counts = new Map<AssignmentId, number>();
  const placed: { s: StaffMember; a: AssignmentId; x: number; y: number }[] = [];
  for (const s of staff) {
    const a = assignments[s.id];
    if (!a) continue;
    const i = counts.get(a) ?? 0;
    counts.set(a, i + 1);
    const slot = SLOTS[a][i] ?? SLOTS[a][SLOTS[a].length - 1];
    placed.push({ s, a, x: slot[0] + (i >= SLOTS[a].length ? 18 : 0), y: slot[1] });
  }
  const openTills = counts.get('tills') ?? 0;
  const motion = !reducedMotion && animating;

  return (
    <svg
      className={`store ${motion ? 'is-animating' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Top-down plan of the shop. Use the staff list or the zone buttons to assign people."
    >
      <defs>
        <pattern id="tiles" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="var(--floor)" />
          <path d="M24 0H0V24" fill="none" stroke="var(--floor-line)" strokeWidth="1" />
        </pattern>
        <pattern id="boards" width="40" height="12" patternUnits="userSpaceOnUse">
          <rect width="40" height="12" fill="var(--back-floor)" />
          <path d="M0 12H40M20 0V12" stroke="var(--back-line)" strokeWidth="1" />
        </pattern>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(179,54,44,0.12)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--bad)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Building */}
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="14" fill="url(#tiles)" stroke="var(--wall)" strokeWidth="8" />
      {/* Back of house */}
      <rect x="8" y="8" width={W - 16} height="144" fill="url(#boards)" />
      <line x1="8" y1="152" x2={W - 8} y2="152" stroke="var(--wall)" strokeWidth="6" />
      <line x1="376" y1="8" x2="376" y2="152" stroke="var(--wall)" strokeWidth="5" />
      <line x1="572" y1="8" x2="572" y2="152" stroke="var(--wall)" strokeWidth="5" />
      <line x1="736" y1="8" x2="736" y2="152" stroke="var(--wall)" strokeWidth="5" />
      {/* doorways */}
      <rect x="300" y="146" width="46" height="12" fill="var(--floor)" />
      <rect x="470" y="146" width="46" height="12" fill="var(--floor)" />
      <rect x="760" y="146" width="40" height="12" fill="var(--floor)" />

      <Stockroom backroom={view.backroom} />
      <Dock dock={view.dock} lorry={view.lorry} />
      <Office clock={view.clock} />
      <BreakRoom />

      <Produce fill={view.shelf.produce / view.shelfCap.produce} units={view.shelf.produce} cap={view.shelfCap.produce} empty={view.emptyDepts.includes('produce')} />
      <Chilled
        fill={view.shelf.chilled / CONFIG.departments.chilled.shelfCapacity}
        units={view.shelf.chilled}
        cap={view.shelfCap.chilled}
        fault={view.fridgeFault}
        empty={view.emptyDepts.includes('chilled')}
      />
      <Ambient fill={view.shelf.ambient / view.shelfCap.ambient} units={view.shelf.ambient} cap={view.shelfCap.ambient} empty={view.emptyDepts.includes('ambient')} />

      <Tills open={openTills} queue={view.queue} />
      <Entrance />

      {/* Zones (click to assign the selected employee) */}
      {ZONES.map((z) => {
        const n = counts.get(z.a) ?? 0;
        const lim = assignmentLimit(z.a);
        const full = n >= lim;
        const label = selected
          ? `Assign ${staff.find((s) => s.id === selected)?.name ?? ''} to ${ASSIGNMENT_LABEL[z.a]} (${n} of ${lim})`
          : `${z.label}: ${n} of ${lim} staff`;
        return (
          <g key={z.a}>
            <rect
              className={`zone ${selected && interactive ? 'zone-armed' : ''} ${full ? 'zone-full' : ''}`}
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx="10"
              tabIndex={interactive && selected ? 0 : -1}
              role="button"
              aria-label={label}
              aria-disabled={!interactive || !selected}
              onClick={() => interactive && selected && onZone(z.a)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && interactive && selected) {
                  e.preventDefault();
                  onZone(z.a);
                }
              }}
            />
            <ZoneBadge z={z} n={n} lim={lim} />
          </g>
        );
      })}

      {/* Shoppers during the replay */}
      {motion || view.arrivals > 0 ? <Shoppers view={view} motion={motion} /> : null}

      {/* Staff tokens */}
      {placed.map(({ s, a, x, y }) => (
        <StaffToken
          key={s.id}
          s={s}
          a={a}
          x={x}
          y={y}
          selected={selected === s.id}
          interactive={interactive}
          onClick={() => onSelectStaff(s.id)}
        />
      ))}
    </svg>
  );
}

export const Store = memo(StoreImpl);

function ZoneBadge({ z, n, lim }: { z: (typeof ZONES)[number]; n: number; lim: number }) {
  const [bx, y] = z.badge;
  const x = bx + 46;
  return (
    <g className="zone-badge" aria-hidden="true">
      <rect x={x - 46} y={y} width="46" height="18" rx="9" fill={n === 0 ? 'var(--paper)' : 'var(--burgundy)'} stroke="var(--burgundy)" />
      <text x={x - 23} y={y + 13} textAnchor="middle" fontSize="11" fill={n === 0 ? 'var(--burgundy)' : 'var(--paper)'} fontWeight="700">
        {n}/{lim} staff
      </text>
    </g>
  );
}

function Level({ x, y, w, fill, units, cap, label }: { x: number; y: number; w: number; fill: number; units: number; cap: number; label: string }) {
  const f = Math.max(0, Math.min(1, fill));
  const word = fillWord(units / Math.max(1, cap));
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={w} height="22" rx="6" fill="var(--paper)" stroke="var(--line-strong)" />
      <rect x={x + 3} y={y + 15} width={(w - 6) * f} height="4" rx="2" fill={word === 'Empty' || word === 'Low' ? 'var(--bad)' : 'var(--good)'} />
      <text x={x + 6} y={y + 12} fontSize="11" fill="var(--ink)" fontWeight="700">
        {label}
      </text>
      <text x={x + w - 6} y={y + 12} fontSize="11" textAnchor="end" fill={word === 'Empty' || word === 'Low' ? 'var(--bad)' : 'var(--muted)'} fontWeight="700">
        {word === 'Empty' ? '⚠ EMPTY' : `${word} · ${Math.round(units)}`}
      </text>
    </g>
  );
}

function Stockroom({ backroom }: { backroom: Record<DeptId, number> }) {
  const bays: [DeptId, number, string][] = [
    ['produce', 28, 'Fruit & veg'],
    ['chilled', 144, 'Cold room'],
    ['ambient', 260, 'Cupboard'],
  ];
  return (
    <g aria-hidden="true">
      <text x="20" y="28" className="room-label">
        STOCKROOM
      </text>
      {bays.map(([d, x, label]) => {
        const cap = CONFIG.departments[d].backroomCapacity;
        const n = Math.round(Math.min(1, backroom[d] / cap) * 12);
        return (
          <g key={d}>
            <rect x={x} y="38" width="100" height="78" rx="4" fill={d === 'chilled' ? 'var(--cold)' : 'rgba(255,255,255,0.35)'} stroke="var(--line-strong)" />
            {Array.from({ length: n }, (_, i) => (
              <rect
                key={i}
                x={x + 6 + (i % 4) * 23}
                y={92 - Math.floor(i / 4) * 22}
                width="20"
                height="18"
                rx="2"
                className={`crate crate-${d}`}
              />
            ))}
            <text x={x + 50} y="132" textAnchor="middle" fontSize="11" fill="var(--ink)">
              {label}: {Math.round(backroom[d])}
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
      <text x="390" y="28" className="room-label">
        DOCK
      </text>
      <rect x="470" y="8" width="90" height="10" fill="var(--mustard)" />
      {lorry && (
        <g className="lorry">
          <rect x="474" y="-30" width="82" height="36" rx="4" fill="var(--burgundy)" />
          <text x="515" y="-8" textAnchor="middle" fontSize="10" fill="var(--paper)">
            WHOLESALE
          </text>
        </g>
      )}
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={392 + (i % 5) * 34} y={i < 5 ? 108 : 86} width="28" height="20" rx="3" className="crate crate-dock" />
      ))}
      <text x="474" y="140" textAnchor="middle" fontSize="11" fill={dock > 0 ? 'var(--bad)' : 'var(--muted)'} fontWeight={dock > 0 ? 700 : 400}>
        {dock > 0 ? `Waiting: ${Math.round(dock)} items` : 'Empty'}
      </text>
    </g>
  );
}

function Office({ clock }: { clock: string }) {
  return (
    <g aria-hidden="true">
      <text x="586" y="28" className="room-label">
        OFFICE
      </text>
      <circle cx="654" cy="78" r="30" fill="var(--paper)" stroke="var(--burgundy)" strokeWidth="4" />
      <text x="654" y="84" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--burgundy)" className="clock-text">
        {clock}
      </text>
      <text x="654" y="132" textAnchor="middle" fontSize="10" fill="var(--muted)">
        (mostly biscuits)
      </text>
    </g>
  );
}

function BreakRoom() {
  return (
    <g aria-hidden="true">
      <text x="752" y="28" className="room-label">
        BREAK ROOM
      </text>
      <rect x="808" y="40" width="64" height="34" rx="6" fill="var(--wood)" />
      <rect x="900" y="40" width="26" height="22" rx="3" fill="var(--muted)" />
      <text x="913" y="76" textAnchor="middle" fontSize="9" fill="var(--muted)">
        kettle
      </text>
    </g>
  );
}

function Produce({ fill, units, cap, empty }: { fill: number; units: number; cap: number; empty: boolean }) {
  const crates = [
    [30, 200],
    [150, 200],
    [30, 290],
    [150, 290],
  ];
  const colours = ['#c2452d', '#e08a1e', '#5d8f2f', '#9fbf3b'];
  const per = Math.round(Math.max(0, Math.min(1, fill)) * 20);
  return (
    <g aria-hidden="true">
      {crates.map(([x, y], c) => (
        <g key={c}>
          <rect x={x} y={y} width="110" height="74" rx="6" fill="var(--wood)" stroke="var(--wood-dark)" strokeWidth="2" />
          {Array.from({ length: per }, (_, i) => (
            <circle key={i} cx={x + 12 + (i % 5) * 21} cy={y + 62 - Math.floor(i / 5) * 16} r="8" fill={colours[c]} />
          ))}
        </g>
      ))}
      <Level x={24} y={176} w={240} fill={fill} units={units} cap={cap} label="Fruit & veg" />
      {empty && <EmptyFlag x={140} y={240} />}
    </g>
  );
}

function Chilled({ fill, units, cap, fault, empty }: { fill: number; units: number; cap: number; fault: boolean; empty: boolean }) {
  const cabinets = 4;
  const per = Math.round(Math.max(0, Math.min(1, fill)) * 24);
  return (
    <g aria-hidden="true">
      {Array.from({ length: cabinets }, (_, c) => {
        const x = 306 + c * 160;
        return (
          <g key={c}>
            <rect x={x} y="196" width="150" height="54" rx="4" fill="var(--cold)" stroke="#6f97a8" strokeWidth="2" />
            {Array.from({ length: Math.round(per / 1) }, (_, i) => (
              <rect key={i} x={x + 6 + (i % 12) * 12} y={208 + Math.floor(i / 12) * 18} width="9" height="14" rx="2" className={`pack pack-${(i + c) % 3}`} />
            ))}
          </g>
        );
      })}
      {fault && (
        <g>
          <rect x="626" y="196" width="310" height="54" fill="url(#hatch)" />
          <rect x="700" y="205" width="160" height="22" rx="6" fill="var(--bad)" />
          <text x="780" y="220" textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">
            ⚠ CHILLER FAULT
          </text>
        </g>
      )}
      <Level x={306} y={170} w={300} fill={units / Math.max(1, cap)} units={units} cap={cap} label={fault ? 'Chilled (half out of use)' : 'Chilled'} />
      {empty && <EmptyFlag x={470} y={232} />}
    </g>
  );
}

function Ambient({ fill, units, cap, empty }: { fill: number; units: number; cap: number; empty: boolean }) {
  const rows = [300, 338, 376];
  const per = Math.round(Math.max(0, Math.min(1, fill)) * 34);
  return (
    <g aria-hidden="true">
      {rows.map((y, r) => (
        <g key={r}>
          <rect x="330" y={y} width="590" height="22" rx="3" fill="var(--shelf)" stroke="var(--wood-dark)" />
          {Array.from({ length: per }, (_, i) => (
            <rect key={i} x={334 + i * 17} y={y + 3} width="13" height="16" rx="2" className={`tin tin-${(i + r) % 4}`} />
          ))}
        </g>
      ))}
      <Level x={330} y={272} w={300} fill={fill} units={units} cap={cap} label="Cupboard essentials" />
      {empty && <EmptyFlag x={640} y={340} />}
    </g>
  );
}

function EmptyFlag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 52} y={y - 13} width="104" height="22" rx="11" fill="var(--bad)" />
      <text x={x} y={y + 2} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">
        SHELF EMPTY
      </text>
    </g>
  );
}

function Tills({ open, queue }: { open: number; queue: number }) {
  const tills = [410, 550, 690];
  const shown = Math.min(36, Math.round(queue));
  const lanes = Math.max(1, open);
  return (
    <g aria-hidden="true">
      {tills.map((x, i) => (
        <g key={i} opacity={i < open ? 1 : 0.5}>
          <rect x={x} y="510" width="100" height="26" rx="5" fill="var(--wood)" stroke="var(--wood-dark)" strokeWidth="2" />
          <rect x={x + 70} y="502" width="22" height="14" rx="2" fill="var(--ink)" />
          <text x={x + 34} y="527" textAnchor="middle" fontSize="11" fill="var(--paper)" fontWeight="700">
            TILL {i + 1}
          </text>
          {i >= open && (
            <text x={x + 50} y="560" textAnchor="middle" fontSize="10" fill="var(--muted)">
              closed
            </text>
          )}
        </g>
      ))}
      {Array.from({ length: shown }, (_, i) => {
        const lane = i % lanes;
        const pos = Math.floor(i / lanes);
        const x = tills[lane] + 40 - Math.min(pos, 11) * 0 + (pos > 5 ? 22 : 0);
        const y = 492 - (pos % 6) * 14;
        return <circle key={i} cx={x} cy={y} r="6" className="shopper queued" />;
      })}
      <g>
        <rect x="812" y="476" width="126" height="40" rx="8" fill="var(--paper)" stroke={queue > 10 ? 'var(--bad)' : 'var(--line-strong)'} strokeWidth="2" />
        <text x="875" y="492" textAnchor="middle" fontSize="11" fill="var(--muted)">
          Queue
        </text>
        <text x="875" y="508" textAnchor="middle" fontSize="13" fontWeight="700" fill={queue > 10 ? 'var(--bad)' : 'var(--ink)'}>
          {Math.round(queue)} {queue > 10 ? '⚠' : ''}
        </text>
      </g>
    </g>
  );
}

function Entrance() {
  return (
    <g aria-hidden="true">
      <rect x="40" y="588" width="170" height="8" fill="var(--mustard)" />
      <rect x="56" y="556" width="138" height="28" rx="4" fill="var(--burgundy)" />
      <text x="125" y="575" textAnchor="middle" fontSize="12" fill="var(--paper)" fontWeight="700" letterSpacing="1">
        WAY IN · WAY OUT
      </text>
      <text x="125" y="548" textAnchor="middle" fontSize="10" fill="var(--muted)">
        Please mind the step. It is famous.
      </text>
    </g>
  );
}

function Shoppers({ view, motion }: { view: StoreView; motion: boolean }) {
  // One dot per ~1.5 shoppers arriving in this ten-minute step, heading for a department.
  const n = Math.min(12, Math.round(view.arrivals / 1.5));
  const targets: [number, number][] = [
    [150, 260],
    [620, 262],
    [620, 330],
  ];
  const left = Math.min(8, Math.round(view.abandoned));
  return (
    <g aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const t = targets[i % 3];
        const x = t[0] + (hash(i, 1) - 0.5) * (i % 3 === 0 ? 160 : 520);
        const y = t[1] + (hash(i, 2) - 0.5) * 40;
        return (
          <circle
            key={`${view.tick}-${i}`}
            className={`shopper ${motion ? 'walk-in' : ''}`}
            cx={x}
            cy={y}
            r="7"
            style={{ ['--sx' as string]: `${125 - x}px`, ['--sy' as string]: `${570 - y}px`, animationDelay: `${(i % 6) * 60}ms` }}
          />
        );
      })}
      {Array.from({ length: left }, (_, i) => {
        const x = 300 + i * 14;
        const y = 470;
        return (
          <g key={`${view.tick}-out-${i}`} className={motion ? 'walk-out' : ''} style={{ ['--ex' as string]: `${125 - x}px`, ['--ey' as string]: `${590 - y}px` }}>
            <circle cx={x} cy={y} r="7" className="shopper leaving" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">
              ✕
            </text>
          </g>
        );
      })}
    </g>
  );
}

function StaffToken({
  s,
  a,
  x,
  y,
  selected,
  interactive,
  onClick,
}: {
  s: StaffMember;
  a: AssignmentId;
  x: number;
  y: number;
  selected: boolean;
  interactive: boolean;
  onClick: () => void;
}) {
  const e = Math.max(0, Math.min(100, s.energy));
  const r = 17;
  const circ = 2 * Math.PI * (r + 4);
  const tired = productivity(s.energy) < 1;
  return (
    <g
      className={`token ${selected ? 'token-selected' : ''} ${a === 'break' ? 'token-break' : ''}`}
      transform={`translate(${x} ${y})`}
      onClick={interactive ? onClick : undefined}
      role="presentation"
    >
      <circle r={r + 4} fill="var(--paper)" stroke="var(--line)" strokeWidth="4" />
      <circle
        r={r + 4}
        fill="none"
        stroke={energyColour(e)}
        strokeWidth="4"
        strokeDasharray={`${(circ * e) / 100} ${circ}`}
        transform="rotate(-90)"
      />
      <circle r={r} fill={s.isTemp ? 'var(--muted)' : 'var(--burgundy)'} />
      <text y="5" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--paper)">
        {initials(s.name)}
      </text>
      <rect x="-30" y={r + 6} width="60" height="15" rx="7" fill="var(--paper)" stroke="var(--line-strong)" />
      <text y={r + 17} textAnchor="middle" fontSize="10" fill="var(--ink)" fontWeight="700">
        {s.name === 'Agency temp' ? 'Temp' : s.name}
        {tired ? ' ·z' : ''}
      </text>
      {a === 'break' && (
        <text x={r + 2} y={-r + 2} fontSize="14">
          ☕
        </text>
      )}
    </g>
  );
}

export function storeViewFromState(args: {
  shelf: Record<DeptId, number>;
  shelfCap: Record<DeptId, number>;
  backroom: Record<DeptId, number>;
  dock: number;
  queue: number;
  fridgeFault: boolean;
  lorry: boolean;
  clock: string;
}): StoreView {
  return { ...args, arrivals: 0, abandoned: 0, emptyDepts: DEPTS.filter((d) => args.shelf[d] < 1), tick: 'rest' };
}
