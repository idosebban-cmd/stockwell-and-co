import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CONFIG, DEPTS, type DeptId } from '../sim/config';
import type { DayContext } from '../sim/types';
import { productivity } from '../sim/engine';
import { ASSIGNMENT_LABEL } from '../sim/roster';
import type { AssignmentId, FloorTask, StaffMember } from '../sim/types';
import { poseFor, Shopper, StaffFigure } from './art/Characters';
import { shopperFigures } from './shopperLayout';
import type { ShopBubble } from './bubbles';
import {
  AislesArt,
  Backdrop,
  BreakRoomArt,
  ChilledArt,
  DockArt,
  EntranceArt,
  ExpandSpot,
  FloorDecor,
  H,
  hourOfDay,
  layoutFor,
  OfficeArt,
  ProduceArt,
  ShopDefs,
  StockroomArt,
  StreetWindow,
  TillCounter,
  Vignette,
  W,
  type Layout,
  type ShopFit,
  type ZoneId,
} from './art/Shop';

export type { ShopFit, ZoneId } from './art/Shop';

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
  chilled: 'Chilled',
  ambient: 'Cupboard',
  tills: 'Tills',
  dock: 'Dock',
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
  /** Changes every few minutes so walk-in animations restart. */
  tick: string;
  clock: string;
}

export function fitFromContext(ctx: DayContext): ShopFit {
  return {
    depts: ctx.depts,
    tills: ctx.tills,
    produceRows: ctx.shelfCap.produce > CONFIG.campaign.shelf.produce ? 3 : 2,
    aisles: ctx.shelfCap.ambient > CONFIG.campaign.shelf.ambient ? 3 : 2,
    cabinets: !ctx.depts.includes('chilled') ? 0 : ctx.shelfCap.chilled > CONFIG.campaign.shelf.chilled ? 4 : 2,
    frost: ctx.dockSpoil.chilled < CONFIG.departments.chilled.dockSpoilPerHour,
  };
}

/** What each staff member is doing: working, standing idle (nothing to do), or just planned. */
export type Activity = 'work' | 'idle' | 'plan';

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
  fit: ShopFit;
  /** Live play: people can be dragged to a place, and walk there when moved. */
  onDrop?: (staffId: string, job: AssignmentId) => void;
  /** Coins popping up over the tills as they take money. */
  pops?: CoinPop[];
  /** Live play: floor jobs and the burst at the door. */
  floor?: StoreFloor;
  /** Live play: send someone to a floor job (dropped on it, or chosen with them selected). */
  onTask?: (taskId: string, staffId: string | null) => void;
  /** Your shop: the office opens hiring. */
  office?: { onOpen: () => void; open: boolean };
  /** Problems as speech bubbles. */
  bubbles?: ShopBubble[];
  /** A long queue and a closed till: the closed till glows. */
  glowTills?: boolean;
}

export interface StoreFloor {
  tasks: FloorTask[];
  /** Each job's bubble ("Spill!"), by id. */
  labels: Record<string, string>;
  /** A burst announced at the door. */
  door: { text: string; arriving: boolean } | null;
}

export function taskXY(t: FloorTask, L: Layout): [number, number] {
  const spots = L.taskSpots[t.place];
  return spots[Math.min(t.spot, spots.length - 1)];
}

export interface CoinPop {
  id: number;
  /** Checkout lane (0 = top). */
  lane: number;
  text: string;
}

interface Drag {
  id: string;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
  /** Already selected when the drag began (a click without moving then deselects). */
  wasSelected: boolean;
}

export const STORE_SIZE = { w: 1000, h: 700 };

function StoreImpl(props: Props) {
  const { view, staff, assignments, selected, onSelectStaff, onZone, interactive, animating, reducedMotion, fit } = props;
  const L = layoutFor(fit);
  const SLOTS = L.slots;
  // The dock unloads itself, so it isn't a place to send people.
  const zones = L.zones.filter((z) => z.z !== 'dock' && (!['produce', 'chilled', 'ambient'].includes(z.z) || fit.depts.includes(z.z as DeptId)));
  const counts = new Map<AssignmentId, number>();
  const placed: { s: StaffMember; a: AssignmentId; x: number; y: number }[] = [];
  for (const s of staff) {
    const a = assignments[s.id];
    if (!a) continue;
    const i = counts.get(a) ?? 0;
    counts.set(a, i + 1);
    const job = a === 'task' ? props.floor?.tasks.find((t) => t.assigned === s.id) : undefined;
    if (job) {
      const [tx, ty] = taskXY(job, L);
      placed.push({ s, a, x: tx + 36, y: ty + 30 });
      continue;
    }
    const slot = SLOTS[a][Math.min(i, SLOTS[a].length - 1)];
    placed.push({ s, a, x: slot[0] + (i >= SLOTS[a].length ? 20 : 0), y: slot[1] });
  }
  const openTills = counts.get('tills') ?? 0;
  const motion = !reducedMotion && animating;
  const selectedName = staff.find((s) => s.id === selected)?.name;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const draggable = interactive && !!props.onDrop;
  const t = hourOfDay(view.clock) / 12;

  const toSvg = (e: ReactPointerEvent): [number, number] => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const zoneAt = (x: number, y: number) => zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  const taskAt = (x: number, y: number) =>
    props.onTask
      ? props.floor?.tasks.find((tk) => {
          const [tx, ty] = taskXY(tk, L);
          return Math.hypot(x - tx, y - ty) < 44;
        })
      : undefined;
  const dropTask = drag?.moved ? taskAt(drag.x, drag.y) : undefined;
  const dropZone = drag?.moved && !dropTask ? zoneAt(drag.x, drag.y) : undefined;
  const startDrag = (id: string, e: ReactPointerEvent) => {
    if (!draggable || e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = toSvg(e);
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDrag({ id, x, y, sx: x, sy: y, moved: false, wasSelected: selected === id });
    if (selected !== id) onSelectStaff(id);
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const [x, y] = toSvg(e);
    setDrag({ ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.sx, y - drag.sy) > 10 });
  };
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      const tk = taskAt(drag.x, drag.y);
      const z = zoneAt(drag.x, drag.y);
      if (tk) props.onTask?.(tk.id, drag.id);
      else if (z) props.onDrop?.(drag.id, ZONE_JOB[z.z]);
    } else if (drag.wasSelected) onSelectStaff(drag.id);
    setDrag(null);
  };

  return (
    <svg
      ref={svgRef}
      className={`store ${motion ? 'is-animating' : ''} ${drag?.moved ? 'is-dragging' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label={`The shop. ${draggable ? 'Drag someone to a place, or s' : 'S'}elect someone, then a place.`}
      onPointerMove={drag ? moveDrag : undefined}
      onPointerUp={drag ? endDrag : undefined}
      onPointerCancel={drag ? () => setDrag(null) : undefined}
    >
      <ShopDefs t={t} />
      <Backdrop t={t} />

      <StockroomArt backroom={view.backroom} depts={fit.depts} />
      <DockArt dock={view.dock} lorry={view.lorry} />
      <OfficeArt clock={view.clock} hiring={!!props.office?.open} />
      <BreakRoomArt />
      <StreetWindow motion={!reducedMotion} />

      {fit.depts.includes('produce') && <ProduceArt fill={view.shelf.produce / Math.max(1, view.shelfCap.produce)} rows={fit.produceRows} markdown={false} />}
      {fit.cabinets > 0 ? (
        <ChilledArt fill={view.shelf.chilled / Math.max(1, view.shelfCap.chilled)} cabinets={fit.cabinets} frost={fit.frost} fault={view.fridgeFault} markdown={false} />
      ) : (
        <ExpandSpot />
      )}
      {fit.depts.includes('ambient') && <AislesArt fill={view.shelf.ambient / Math.max(1, view.shelfCap.ambient)} gondolas={L.gondolas} promo={false} />}
      {L.laneY.slice(0, fit.tills).map((y, i) => (
        <TillCounter key={i} y={y} on={i < openTills} />
      ))}
      <FloorDecor />
      <EntranceArt dropped={view.dropped} ring={!!props.floor?.door?.arriving} motion={!reducedMotion} />
      <Vignette />
      {props.glowTills &&
        L.laneY.slice(openTills, fit.tills).map((y) => <rect key={y} className={motion ? 'till-glow pulse' : 'till-glow'} x="736" y={y - 8} width="206" height="66" rx="14" aria-hidden="true" />)}

      {/* Places: drop someone here, or select someone and then the place */}
      {zones.map((zone) => {
        const a = ZONE_JOB[zone.z];
        const activate = () => {
          if (interactive && selected) onZone(a);
        };
        return (
          <rect
            key={zone.z}
            className={`zone ${selected && interactive ? 'zone-armed' : ''} ${dropZone?.z === zone.z ? 'zone-drop' : ''}`}
            x={zone.x}
            y={zone.y}
            width={zone.w}
            height={zone.h}
            rx="10"
            tabIndex={interactive && selected ? 0 : -1}
            role={interactive && selected ? 'button' : undefined}
            aria-label={interactive && selected ? `${ZONE_NAME[zone.z]}: move ${selectedName} here` : undefined}
            onClick={activate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                activate();
              }
            }}
          />
        );
      })}

      {props.office && interactive && !selected && (
        <rect
          className={`zone zone-browse ${props.office.open ? 'zone-context' : ''}`}
          x={L.office.x}
          y={L.office.y}
          width={L.office.w}
          height={L.office.h}
          rx="10"
          tabIndex={0}
          role="button"
          aria-pressed={props.office.open}
          aria-label="Office: hire people"
          onClick={props.office.onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              props.office!.onOpen();
            }
          }}
        />
      )}
      <QueueFigures L={L} open={openTills} queue={view.queue} />
      <AisleShoppers L={L} view={view} motion={motion} depts={fit.depts} />
      <WalkOuts L={L} view={view} motion={motion} />

      {props.floor && <FloorLayer L={L} floor={props.floor} selected={selected} interactive={interactive && !!props.onTask} target={dropTask?.id ?? null} onTask={props.onTask} motion={!reducedMotion} />}
      {props.pops && !reducedMotion && <CoinPops L={L} pops={props.pops} />}

      {placed.map(({ s, a, x, y }) => {
        const dragging = drag?.moved && drag.id === s.id;
        return (
          <StaffToken
            entrance={L.entrance}
            key={s.id}
            s={s}
            a={a}
            x={dragging ? drag.x : x}
            y={dragging ? drag.y + 30 : y}
            selected={selected === s.id}
            interactive={interactive}
            onClick={() => onSelectStaff(s.id)}
            onPointerDown={draggable ? (e) => startDrag(s.id, e) : undefined}
            walk={draggable && !dragging}
            dragging={!!dragging}
            motion={motion}
          />
        );
      })}

      {props.bubbles?.map((b) => (
        <SpeechBubble key={b.id} x={b.x} y={b.y} text={b.text} tone={b.tone} pop={motion} />
      ))}
    </svg>
  );
}

export const Store = memo(StoreImpl);

// ---------------------------------------------------------------------------
// Bubbles and faces
// ---------------------------------------------------------------------------

/** A speech bubble whose tail points at (x, y). */
function SpeechBubble({ x, y, text, tone, pop, icon }: { x: number; y: number; text: string; tone: 'bad' | 'warn' | 'good' | 'calm'; pop: boolean; icon?: 'bus' }) {
  const w = text.length * 9.6 + 30 + (icon ? 34 : 0);
  const h = 34;
  return (
    <g className={`speech speech-${tone} ${pop ? 'pop' : ''}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x={-w / 2} y={-h - 12} width={w} height={h} rx="15" />
      <path d="M-8 -13.5 L0 -1 L8 -13.5 Z" />
      <rect className="speech-gap" x="-8" y="-16" width="16" height="4" />
      {icon === 'bus' && (
        <g transform={`translate(${-w / 2 + 10} ${-h - 3})`}>
          <rect width="28" height="16" rx="4" fill="#c2452d" />
          <rect x="3" y="3" width="6" height="5" fill="#cfe6ee" />
          <rect x="11" y="3" width="6" height="5" fill="#cfe6ee" />
          <rect x="19" y="3" width="6" height="5" fill="#cfe6ee" />
          <circle cx="7" cy="17" r="3" fill="#2f1308" />
          <circle cx="21" cy="17" r="3" fill="#2f1308" />
        </g>
      )}
      <text x={icon ? 17 : 0} y={-h / 2 - 6} textAnchor="middle" dominantBaseline="middle">
        {text}
      </text>
    </g>
  );
}

/** A little face over a shopper: happy, or grumpy (with a cloud). */
function MoodFace({ x, y, mood }: { x: number; y: number; mood: 'happy' | 'grumpy' }) {
  return (
    <g className={`mood mood-${mood}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r="8.5" />
      {mood === 'happy' ? (
        <>
          <circle cx="-3" cy="-1.5" r="1.3" fill="#2f1308" />
          <circle cx="3" cy="-1.5" r="1.3" fill="#2f1308" />
          <path d="M-4 2.5 q4 4.5 8 0" stroke="#2f1308" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-4.5 -3 l3 1.6 M4.5 -3 l-3 1.6" stroke="#2f1308" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M-4 4.5 q4 -4 8 0" stroke="#2f1308" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M6 -12 q2.5 -3.5 5 0 q2.5 -3.5 5 0" stroke="#7a7470" strokeWidth="1.6" fill="none" />
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Queue split across open tills, one figure per customer; the longer the wait, the grumpier. */
function QueueFigures({ L, open, queue }: { L: Layout; open: number; queue: number }) {
  const lanes = Math.max(1, open);
  const total = Math.round(queue);
  const perLane = Array.from({ length: lanes }, (_, i) => Math.floor(total / lanes) + (i < total % lanes ? 1 : 0));
  const maxShown = 13;
  return (
    <g aria-hidden="true">
      {perLane.map((n, lane) => {
        const y = L.laneY[Math.min(lane, 2)] + 44;
        return (
          <g key={lane}>
            {Array.from({ length: Math.min(n, maxShown) }, (_, i) => (
              <g key={i} className="queuer" style={{ transform: `translate(${L.queueFrontX - i * L.queueGap}px, ${y}px)` }}>
                <Shopper n={lane * 31 + i} fill={0.85} />
              </g>
            ))}
            {Array.from({ length: Math.min(n, maxShown) }, (_, i) =>
              i % 3 === 1 ? <MoodFace key={`f${i}`} x={L.queueFrontX - i * L.queueGap} y={y - 50} mood={n > 5 && i >= 3 ? 'grumpy' : 'happy'} /> : null,
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Shoppers browsing the departments the shop has; every few show how they feel. */
function AisleShoppers({ L, view, motion, depts }: { L: Layout; view: StoreView; motion: boolean; depts: DeptId[] }) {
  const figs = shopperFigures(view.arrivals, depts, view.emptyDepts, L.aisleWalks);
  if (!figs.length) return null;
  return (
    <g aria-hidden="true">
      {figs.map(({ k, x, y, fill, dept }) => (
        <g key={`${view.tick}-${k}`} transform={`translate(${x} ${y})`}>
          <g
            className={motion ? 'walk-in' : ''}
            style={{ ['--sx' as string]: `${L.entrance[0] - x}px`, ['--sy' as string]: `${L.entrance[1] - y}px`, animationDelay: `${(k % 7) * 70}ms` }}
          >
            <Shopper n={k + 3} fill={fill} />
            {k % 3 === 0 && <MoodFace x={0} y={-50} mood={view.emptyDepts.includes(dept) ? 'grumpy' : 'happy'} />}
          </g>
        </g>
      ))}
    </g>
  );
}

function WalkOuts({ L, view, motion }: { L: Layout; view: StoreView; motion: boolean }) {
  const m = Math.min(6, Math.round(view.abandoned));
  return (
    <g aria-hidden="true">
      {Array.from({ length: m }, (_, i) => {
        const x = 340 + i * 26;
        const y = 470;
        return (
          <g key={`${view.tick}-out-${i}`} transform={`translate(${x} ${y})`}>
            <g className={motion ? 'walk-out' : ''} style={{ ['--ex' as string]: `${L.entrance[0] - x}px`, ['--ey' as string]: `${L.entrance[1] - y}px` }}>
              <Shopper n={i + 11} leaving />
              {i === 0 && (
                <text className="hmph" x="0" y="-48" textAnchor="middle">
                  Hmph!
                </text>
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}

const TASK_TONE: Record<FloorTask['kind'], 'bad' | 'warn'> = { spill: 'bad', help: 'warn', priceCheck: 'warn', pallet: 'warn', baskets: 'warn', errand: 'warn' };

/** Floor jobs as bubbles on the spot, and the burst announced at the door. */
function FloorLayer({
  L,
  floor,
  selected,
  interactive,
  target,
  onTask,
  motion,
}: {
  L: Layout;
  floor: StoreFloor;
  selected: string | null;
  interactive: boolean;
  target: string | null;
  onTask?: (taskId: string, staffId: string | null) => void;
  motion: boolean;
}) {
  return (
    <g>
      {floor.door && (
        <g className="door-cue" role="status" aria-label={floor.door.text}>
          <SpeechBubble x={L.doorCue[0] + 110} y={L.doorCue[1] + 52} text={floor.door.text} tone="warn" pop={motion} icon="bus" />
        </g>
      )}
      {floor.tasks.map((t) => {
        const [x, y] = taskXY(t, L);
        const open = t.assigned === null;
        const act = () => interactive && onTask?.(t.id, selected);
        const done = Math.min(1, t.progress / t.work);
        const label = floor.labels[t.id] ?? '!';
        return (
          <g
            key={t.id}
            className={`floor-task ${open ? 'open' : 'working'} ${target === t.id ? 'drop' : ''} ${selected && open ? 'armed' : ''}`}
            transform={`translate(${x} ${y})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={`${label}${selected && open ? ' Send the selected person here.' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              act();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                act();
              }
            }}
          >
            <title>{label}</title>
            <circle r="34" fill="transparent" />
            {selected && open && interactive && <circle r="34" className="task-armed" />}
            {target === t.id && <circle r="34" fill="rgba(227,178,60,0.35)" stroke="var(--mustard)" strokeWidth="4" />}
            <TaskPicture kind={t.kind} n={Number(t.id.replace(/\D/g, ''))} />
            {open ? (
              <g className={motion ? 'task-bob' : ''}>
                <SpeechBubble x={0} y={-20} text={label} tone={TASK_TONE[t.kind]} pop={motion} />
              </g>
            ) : (
              <g transform="translate(0 -30)">
                <circle r="13" fill="var(--paper)" stroke="var(--good)" strokeWidth="2.5" />
                <path d={arc(done)} fill="var(--good)" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** What the job looks like on the floor. */
function TaskPicture({ kind, n }: { kind: FloorTask['kind']; n: number }) {
  switch (kind) {
    case 'spill':
      return (
        <g aria-hidden="true">
          <ellipse cx="0" cy="10" rx="28" ry="9" fill="#f6fbff" stroke="#9cc7d6" strokeWidth="2.5" />
          <ellipse cx="24" cy="5" rx="7" ry="3" fill="#f6fbff" stroke="#9cc7d6" strokeWidth="2" />
          <rect x="-26" y="-2" width="10" height="15" rx="2" transform="rotate(-70 -21 5)" fill="#fbfbf8" stroke="#3b6fb0" strokeWidth="1.6" />
        </g>
      );
    case 'help':
      return (
        <g transform="translate(-26 22) scale(0.9)" aria-hidden="true">
          <Shopper n={n + 5} fill={0.2} />
        </g>
      );
    case 'pallet':
      return (
        <g aria-hidden="true">
          <rect x="-22" y="-8" width="20" height="18" rx="2" fill="#c99a63" stroke="rgba(60,28,12,0.5)" />
          <rect x="0" y="-8" width="20" height="18" rx="2" fill="#c99a63" stroke="rgba(60,28,12,0.5)" />
          <rect x="-11" y="-24" width="20" height="17" rx="2" fill="#b98a53" stroke="rgba(60,28,12,0.5)" />
        </g>
      );
    case 'baskets':
      return (
        <g aria-hidden="true">
          <rect x="-14" y="2" width="28" height="10" rx="2" fill="none" stroke="#7a1f2b" strokeWidth="2" strokeDasharray="4 3" />
        </g>
      );
    case 'priceCheck':
      return (
        <g aria-hidden="true">
          <rect x="-10" y="-6" width="20" height="16" rx="2" fill="#f2d16b" stroke="rgba(60,28,12,0.5)" />
          <text x="0" y="6" textAnchor="middle" fontSize="11" fontWeight="900" fill="#7a1f2b">
            ?
          </text>
        </g>
      );
    default:
      return null;
  }
}

/** A pie slice for a job's progress (0..1). */
function arc(f: number): string {
  if (f <= 0) return '';
  if (f >= 0.999) return 'M0 -10 A10 10 0 1 1 -0.01 -10 Z';
  const a = f * Math.PI * 2;
  const x = Math.sin(a) * 10;
  const y = -Math.cos(a) * 10;
  return `M0 0 L0 -10 A10 10 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

function CoinPops({ L, pops }: { L: Layout; pops: CoinPop[] }) {
  return (
    <g aria-hidden="true">
      {pops.map((p) => (
        <g key={p.id} transform={`translate(900 ${L.laneY[Math.min(p.lane, L.laneY.length - 1)] - 22})`}>
          <g className="coin-pop">
            <circle r="9" fill="#e3b23c" stroke="#9a6f12" strokeWidth="2" />
            <text y="3.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="#7a540a">
              £
            </text>
            <text x="14" y="4" fontSize="13" fontWeight="800" fill="var(--burgundy-dark)" stroke="var(--paper)" strokeWidth="3" paintOrder="stroke">
              {p.text}
            </text>
          </g>
        </g>
      ))}
    </g>
  );
}

/** Rested people bounce; tired ones yawn. */
export function staffMood(s: StaffMember, a: AssignmentId): 'bouncy' | 'sleepy' | 'resting' | 'ok' {
  if (a === 'break') return 'resting';
  if (productivity(s.energy) < 1) return 'sleepy';
  return s.energy >= 75 ? 'bouncy' : 'ok';
}

function StaffToken({
  entrance,
  s,
  a,
  x,
  y,
  selected,
  interactive,
  onClick,
  onPointerDown,
  walk,
  dragging,
  motion,
}: {
  entrance: [number, number];
  onPointerDown?: (e: ReactPointerEvent) => void;
  walk?: boolean;
  dragging?: boolean;
  s: StaffMember;
  a: AssignmentId;
  x: number;
  y: number;
  selected: boolean;
  interactive: boolean;
  onClick: () => void;
  motion: boolean;
}) {
  const mood = staffMood(s, a);
  const pose = poseFor(a, true);
  const name = s.isTemp ? 'Temp' : s.name;
  return (
    <g
      className={`token ${selected ? 'token-selected' : ''} ${interactive ? 'token-interactive' : ''} ${walk ? 'token-walk' : ''} ${dragging ? 'token-dragging' : ''}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onPointerDown={onPointerDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-label={interactive ? `${s.name}: ${ASSIGNMENT_LABEL[a]}${mood === 'sleepy' ? ', sleepy' : ''}. Select.` : undefined}
      onClick={
        interactive && !onPointerDown
          ? (ev) => {
              ev.stopPropagation();
              onClick();
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <circle cx="0" cy="-30" r="32" fill="transparent" />
      <title>{`${s.name}: ${ASSIGNMENT_LABEL[a]}`}</title>
      {selected && <ellipse cx="0" cy="0" rx="24" ry="8" fill="none" stroke="var(--mustard)" strokeWidth="4" />}
      <g
        className={`${s.availableFromStep !== undefined && s.availableFromStep < 1e9 ? 'staff-arrive' : ''}`}
        style={s.availableFromStep !== undefined ? { ['--sx' as string]: `${entrance[0] - x}px`, ['--sy' as string]: `${entrance[1] - y}px` } : undefined}
      >
        <g className={motion && mood === 'bouncy' ? 'bouncy' : motion && mood === 'sleepy' ? 'sleepy' : ''}>
          <g transform={a === 'tills' ? 'scale(1.05)' : 'scale(1.15)'}>
            <StaffFigure id={s.id} look={s.look} pose={pose} tired={mood === 'sleepy'} />
          </g>
        </g>
      </g>
      {mood === 'sleepy' && (
        <g className="yawn" transform={`translate(${x > 900 ? -34 : 30} -66)`} aria-hidden="true">
          <rect x="-26" y="-14" width="52" height="22" rx="10" />
          <text y="2" textAnchor="middle">
            Yawn…
          </text>
          <text className="zz" x="30" y="-8">
            z
          </text>
        </g>
      )}
      {selected && (
        <g transform="translate(0 4)">
          <rect x="-32" y="0" width="64" height="20" rx="8" fill="var(--mustard)" stroke="var(--burgundy-dark)" strokeWidth="1.5" />
          <text y="14" textAnchor="middle" fontSize="12" fill="var(--ink)" fontWeight="800">
            {name}
          </text>
        </g>
      )}
    </g>
  );
}

export function storeViewFromState(args: Omit<StoreView, 'arrivals' | 'abandoned' | 'dropped' | 'emptyDepts' | 'tick'> & { dropped?: number }): StoreView {
  return { dropped: 0, ...args, arrivals: 0, abandoned: 0, emptyDepts: DEPTS.filter((d) => args.shelf[d] < 1), tick: 'rest' };
}
