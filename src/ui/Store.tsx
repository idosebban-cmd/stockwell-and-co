import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CONFIG, DEPTS, type DeptId } from '../sim/config';
import type { DayContext } from '../sim/types';
import { assignmentLimit, productivity } from '../sim/engine';
import { ASSIGNMENT_LABEL } from '../sim/roster';
import type { AssignmentId, FloorTask, StaffMember } from '../sim/types';
import { poseFor, Shopper, StaffFigure } from './art/Characters';
import { shopperFigures } from './shopperLayout';
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
  /** The place whose panel is open: its counts are shown in the shop. */
  detail?: ZoneId | null;
  fit: ShopFit;
  /** Live play: people can be dragged to a place, and walk there when moved. */
  onDrop?: (staffId: string, job: AssignmentId) => void;
  /** Coins popping up over the tills as they take money. */
  pops?: CoinPop[];
  /** Live play: floor jobs and the cue at the door. */
  floor?: StoreFloor;
  /** Live play: send someone to a floor job (dropped on it, or the job chosen with them selected). With no one, says what it needs. */
  onTask?: (taskId: string, staffId: string | null) => void;
  /** Live play: the stockroom opens the ordering panel; it shows orders on their way and a "!" when something will run out. */
  stockroom?: StoreStockroom;
  /** Your shop: the office opens hiring. */
  office?: { onOpen: () => void; open: boolean };
}

export interface StoreStockroom {
  onOpen: () => void;
  open: boolean;
  alert: 'urgent' | 'warn' | null;
  /** "+60 arriving 11:20" per department. */
  tags: Partial<Record<DeptId, string>>;
}

export interface StoreFloor {
  tasks: FloorTask[];
  /** Each job's short label ("Can’t find tea bags · 3 min left"), by id. */
  labels: Record<string, string>;
  /** A burst announced at the door. */
  door: { text: string; detail: string; arriving: boolean } | null;
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

/** Where each placed employee stands (viewBox units), for tips that point at someone. */
export function staffPositions(staff: StaffMember[], assignments: Record<string, AssignmentId>, fit: ShopFit): Record<string, [number, number]> {
  const SLOTS = layoutFor(fit).slots;
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


function StoreImpl(props: Props) {
  const { view, staff, assignments, activity, selected, onSelectStaff, onZone, context, onContext, interactive, animating, reducedMotion } = props;
  const highlightZones = props.highlightZones ?? [];
  const highlightStaff = props.highlightStaff ?? [];
  const hints = props.jobHints ?? {};
  const problemZones = props.problemZones ?? {};
  const detail = props.detail ?? null;
  const fit = props.fit;
  const L = layoutFor(fit);
  const SLOTS = L.slots;
  const zones = L.zones.filter((z) => !['produce', 'chilled', 'ambient'].includes(z.z) || fit.depts.includes(z.z as DeptId));
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

  const toSvg = (e: ReactPointerEvent): [number, number] => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const zoneAt = (x: number, y: number) => zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  const taskAt = (x: number, y: number) =>
    props.onTask ? props.floor?.tasks.find((t) => {
      const [tx, ty] = taskXY(t, L);
      return Math.hypot(x - tx, y - ty) < 38;
    }) : undefined;
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
      const t = taskAt(drag.x, drag.y);
      const z = zoneAt(drag.x, drag.y);
      if (t) props.onTask?.(t.id, drag.id);
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
      aria-label={`Plan of the shop. Select a department to see its controls, or ${draggable ? 'drag a staff member to a place, or ' : ''}select a staff member and then a zone to move them.`}
      onPointerMove={drag ? moveDrag : undefined}
      onPointerUp={drag ? endDrag : undefined}
      onPointerCancel={drag ? () => setDrag(null) : undefined}
    >
      <ShopDefs t={hourOfDay(view.clock) / 12} />
      <Backdrop t={hourOfDay(view.clock) / 12} />

      <StockroomArt backroom={view.backroom} detail={detail} depts={fit.depts} tags={props.stockroom?.tags} />
      <DockArt dock={view.dock} lorry={view.lorry} detail={detail === 'dock'} />
      <OfficeArt clock={view.clock} hiring={!!props.office?.open} />
      <BreakRoomArt />
      <StreetWindow motion={!reducedMotion} />

      {fit.depts.includes('produce') && <ProduceArt fill={view.shelf.produce / Math.max(1, view.shelfCap.produce)} rows={fit.produceRows} markdown={view.markdown.includes('produce')} />}
      {fit.cabinets > 0 ? (
        <ChilledArt fill={view.shelf.chilled / Math.max(1, view.shelfCap.chilled)} cabinets={fit.cabinets} frost={fit.frost} fault={view.fridgeFault} markdown={view.markdown.includes('chilled')} />
      ) : (
        <ExpandSpot />
      )}
      {fit.depts.includes('ambient') && <AislesArt fill={view.shelf.ambient / Math.max(1, view.shelfCap.ambient)} gondolas={L.gondolas} promo={view.promo.includes('ambient')} />}
      {L.laneY.slice(0, fit.tills).map((y, i) => (
        <TillCounter key={i} y={y} n={i + 1} on={i < openTills} />
      ))}
      <FloorDecor />
      <EntranceArt dropped={view.dropped} ring={!!props.floor?.door?.arriving} motion={!reducedMotion} />
      <Vignette />
      <DeptLabels view={view} detail={detail} fit={fit} L={L} />
      <QueueLabel open={openTills} queue={view.queue} detail={detail === 'tills'} installed={fit.tills} />

      {/* Zones: select a department, or place the selected employee */}
      {zones.map((zone) => {
        const a = ZONE_JOB[zone.z];
        const n = counts.get(a) ?? 0;
        const lim = a === 'tills' ? fit.tills : assignmentLimit(a);
        const full = n >= lim;
        const hint = selected ? hints[zone.z] : undefined;
        const label = selected
          ? `${ASSIGNMENT_LABEL[a]}: move ${selectedName} here (${n} of ${lim} staff)${full ? ', full' : ''}${hint ? `. ${hint.text}` : ''}`
          : `${ZONE_NAME[zone.z]}: ${n} of ${lim} staff${problemZones[zone.z] ? ', needs attention' : ''}. Open.`;
        const activate = () => {
          if (!interactive) return;
          if (selected) onZone(a);
          else onContext(context === zone.z ? null : zone.z);
        };
        return (
          <g key={zone.z}>
            <rect
              className={`zone ${selected && interactive ? (hint?.blocked || (full && !props.onDrop) ? 'zone-armed zone-full' : 'zone-armed') : interactive ? 'zone-browse' : ''} ${context === zone.z ? 'zone-context' : ''} ${highlightZones.includes(zone.z) ? 'zone-lesson' : ''} ${dropZone?.z === zone.z ? 'zone-drop' : ''}`}
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
                if (e.key === 'Enter') {
                  e.preventDefault();
                  activate();
                }
              }}
            />
            {selected && interactive && hint && <ZoneBadge x={zone.mark[0] - 46} y={zone.mark[1] - 9} n={n} lim={lim} />}
          </g>
        );
      })}

      {props.stockroom && interactive && !selected && (
        <rect
          className={`zone zone-browse ${props.stockroom.open ? 'zone-context' : ''}`}
          x={L.stockroom.x}
          y={L.stockroom.y}
          width={L.stockroom.w}
          height={L.stockroom.h}
          rx="10"
          tabIndex={0}
          role="button"
          aria-pressed={props.stockroom.open}
          aria-label={`Stockroom: order more stock${props.stockroom.alert ? ', something will run out soon' : ''}. Open.`}
          onClick={props.stockroom.onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              props.stockroom!.onOpen();
            }
          }}
        />
      )}
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
          aria-label="Office: hire people. Open."
          onClick={props.office.onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              props.office!.onOpen();
            }
          }}
        />
      )}
      {props.stockroom?.alert && !selected && <ProblemMark x={L.stockroomMark[0]} y={L.stockroomMark[1]} level={props.stockroom.alert} label="Stockroom" onOpen={interactive ? props.stockroom.onOpen : undefined} />}
      <Notices L={L} notices={view.notices} onOpen={interactive ? (z) => onContext(z) : undefined} />
      {!selected &&
        zones.map((zone) =>
          problemZones[zone.z] ? (
            <ProblemMark
              key={`pm-${zone.z}`}
              x={zone.mark[0]}
              y={zone.mark[1]}
              level={problemZones[zone.z]!}
              label={ZONE_NAME[zone.z]}
              onOpen={interactive ? () => onContext(zone.z) : undefined}
            />
          ) : null,
        )}
      <QueueFigures L={L} open={openTills} queue={view.queue} />
      <AisleShoppers L={L} view={view} motion={motion} depts={fit.depts} />
      <WalkOuts L={L} view={view} motion={motion} />

      {selected &&
        zones.map((zone) => {
          const hint = hints[zone.z];
          if (!hint) return null;
          return <HintPill key={zone.z} zone={zone} hint={hint} />;
        })}

      {props.floor && <FloorLayer L={L} floor={props.floor} selected={selected} interactive={interactive && !!props.onTask} target={dropTask?.id ?? null} onTask={props.onTask} motion={!reducedMotion} />}
      {props.pops && !reducedMotion && <CoinPops L={L} pops={props.pops} />}

      {placed.map(({ s, a, x, y }) => {
        const dragging = drag?.moved && drag.id === s.id;
        return (
          <StaffToken
            entrance={L.entrance}
            lesson={highlightStaff.includes(s.id)}
            key={s.id}
            s={s}
            a={a}
            x={dragging ? drag.x : x}
            y={dragging ? drag.y + 30 : y}
            act={activity[s.id] ?? 'plan'}
            selected={selected === s.id}
            interactive={interactive}
            onClick={() => onSelectStaff(s.id)}
            onPointerDown={draggable ? (e) => startDrag(s.id, e) : undefined}
            walk={draggable && !dragging}
            dragging={!!dragging}
            named={selected === s.id || highlightStaff.includes(s.id)}
          />
        );
      })}
    </svg>
  );
}

export const Store = memo(StoreImpl);

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function DeptLabels({ view, detail, fit, L }: { view: StoreView; detail: ZoneId | null; fit: ShopFit; L: Layout }) {
  const amb = L.zones.find((z) => z.z === 'ambient')!;
  return (
    <g>
      {fit.depts.includes('produce') && <Level x={20} y={162} units={view.shelf.produce} cap={view.shelfCap.produce} label="Fruit & veg" tag={tagFor(view, 'produce')} detail={detail === 'produce'} />}
      {fit.cabinets > 0 && <Level x={316} y={160} units={view.shelf.chilled} cap={view.shelfCap.chilled} label="Chilled" tag={tagFor(view, 'chilled')} detail={detail === 'chilled'} />}
      {fit.depts.includes('ambient') && <Level x={330} y={amb.y + 2} units={view.shelf.ambient} cap={view.shelfCap.ambient} label="Cupboard essentials" tag={tagFor(view, 'ambient')} detail={detail === 'ambient'} />}
    </g>
  );
}

function QueueLabel({ open, queue, detail, installed }: { open: number; queue: number; detail: boolean; installed: number }) {
  if (!detail && queue < 8) return null;
  return (
    <g aria-hidden="true">
      <rect x="560" y="462" width="120" height="22" rx="7" fill="var(--paper)" stroke={queue >= 8 ? 'var(--bad)' : 'var(--line-strong)'} strokeWidth="1.5" />
      <text x="620" y="477.5" textAnchor="middle" fontSize="11.5" fontWeight="800" fill={queue >= 8 ? 'var(--bad)' : 'var(--ink)'}>
        Queue {Math.round(queue)}
        {detail ? ` · ${open}/${installed} open` : ''}
      </text>
    </g>
  );
}

/** Department name, with a small Low/Empty indicator; the count only while its panel is open. */
function Level({ x, y, units, cap, label, tag, detail }: { x: number; y: number; w?: number; units: number; cap: number; label: string; tag?: string; detail: boolean }) {
  const f = Math.max(0, Math.min(1, units / Math.max(1, cap)));
  const word = fillWord(f);
  const low = word === 'Empty' || word === 'Low';
  const text = `${label}${tag ? ` · ${tag}` : ''}`;
  const tw = text.length * 6.4 + 14;
  const extra = detail ? `${Math.round(units)} / ${Math.round(cap)}` : low ? word : '';
  const ew = extra.length * 6.6 + 14;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={tw} height="20" rx="6" fill="var(--paper)" opacity="0.92" />
      <text x={x + 7} y={y + 14} fontSize="11" fill="var(--burgundy-dark)" fontWeight="800">
        {text}
      </text>
      {extra && (
        <g>
          <rect x={x + tw + 4} y={y + 1} width={ew} height="18" rx="9" fill={low ? 'var(--bad)' : 'var(--paper)'} stroke={low ? 'none' : 'var(--line-strong)'} />
          <text x={x + tw + 4 + ew / 2} y={y + 14} textAnchor="middle" fontSize="11" fontWeight="800" fill={low ? '#fff' : 'var(--ink)'}>
            {extra}
          </text>
        </g>
      )}
    </g>
  );
}

function tagFor(view: StoreView, d: DeptId): string | undefined {
  const t = [view.markdown.includes(d) ? 'stickers' : '', view.promo.includes(d) ? 'promo' : ''].filter(Boolean).join(', ');
  return t || undefined;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Queue split across open tills, one figure per customer (up to a lane's length). */
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
            {n > maxShown && (
              <text x={L.queueFrontX - maxShown * L.queueGap + 4} y={y - 20} fontSize="11" fontWeight="800" fill="var(--bad)">
                +{n - maxShown}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Shoppers browsing the departments the shop has (positions from `shopperFigures`). */
function AisleShoppers({ L, view, motion, depts }: { L: Layout; view: StoreView; motion: boolean; depts: DeptId[] }) {
  const figs = shopperFigures(view.arrivals, depts, view.emptyDepts, L.aisleWalks);
  if (!figs.length) return null;
  return (
    <g aria-hidden="true">
      {figs.map(({ k, x, y, fill }) => (
        <g key={`${view.tick}-${k}`} transform={`translate(${x} ${y})`}>
          <g
            className={motion ? 'walk-in' : ''}
            style={{ ['--sx' as string]: `${L.entrance[0] - x}px`, ['--sy' as string]: `${L.entrance[1] - y}px`, animationDelay: `${(k % 7) * 70}ms` }}
          >
            <Shopper n={k + 3} fill={fill} />
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
            </g>
          </g>
        );
      })}
    </g>
  );
}

function HintPill({ zone, hint }: { zone: Layout['zones'][number]; hint: JobHint }) {
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

function ProblemMark({ x, y, level, label, onOpen }: { x: number; y: number; level: 'urgent' | 'warn'; label: string; onOpen?: () => void }) {
  return (
    <g
      className={`${level === 'urgent' ? 'problem-mark urgent' : 'problem-mark'} ${onOpen ? 'notice-open' : ''}`}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `${label} needs attention. Open.` : undefined}
      aria-hidden={onOpen ? undefined : true}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      <circle cx={x} cy={y} r="14" fill="transparent" />
      <circle cx={x} cy={y} r="10" fill={level === 'urgent' ? 'var(--bad)' : 'var(--mustard)'} stroke="var(--paper)" strokeWidth="2" />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="900" fill={level === 'urgent' ? '#fff' : 'var(--burgundy-dark)'}>
        !
      </text>
    </g>
  );
}

function Notices({ L, notices, onOpen }: { L: Layout; notices: ShopNotice[]; onOpen?: (z: ZoneId) => void }) {
  const stack = new Map<ZoneId, number>();
  return (
    <g>
      {notices.map((n, i) => {
        const k = stack.get(n.zone) ?? 0;
        stack.set(n.zone, k + 1);
        const [x, y0] = L.noticeAt[n.zone];
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
                    if (e.key === 'Enter') {
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

/** Floor jobs as "!" markers on the spot, and the cue at the door when a burst is coming. */
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
        <g className={`door-cue ${floor.door.arriving ? 'arriving' : ''} ${motion ? 'pulse' : ''}`} transform={`translate(${L.doorCue[0]} ${L.doorCue[1]})`} role="status" aria-label={`${floor.door.text}. ${floor.door.detail}`}>
          <rect width="250" height="34" rx="10" fill={floor.door.arriving ? 'var(--burgundy)' : 'var(--mustard)'} stroke="var(--burgundy-dark)" strokeWidth="1.5" />
          <text x="12" y="15" fontSize="12" fontWeight="800" fill={floor.door.arriving ? 'var(--paper)' : 'var(--ink)'}>
            {floor.door.text}
          </text>
          <text x="12" y="28" fontSize="10.5" fill={floor.door.arriving ? 'var(--paper)' : 'var(--ink)'}>
            {floor.door.detail}
          </text>
        </g>
      )}
      {floor.tasks.map((t) => {
        const [x, y] = taskXY(t, L);
        const k = CONFIG.floor.tasks.kinds[t.kind];
        const open = t.assigned === null;
        const act = () => interactive && onTask?.(t.id, selected);
        const done = Math.min(1, t.progress / t.work);
        const label = floor.labels[t.id] ?? k.short;
        const pillW = Math.max(60, label.length * 5.6 + 14);
        return (
          <g
            key={t.id}
            className={`floor-task ${open ? 'open' : 'working'} ${target === t.id ? 'drop' : ''} ${selected && open ? 'armed' : ''}`}
            transform={`translate(${x} ${y})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={`${label}.${open ? ` Needs one person for about ${k.work} minute${k.work === 1 ? '' : 's'}.` : ''}${selected && open ? ' Send the selected person here.' : ''}`}
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
            <circle r="26" fill="transparent" />
            {/* While someone is being moved, open jobs are highlighted as places they can go, like the zones. */}
            {selected && open && interactive && <circle r="30" className="task-armed" />}
            {target === t.id && <circle r="30" fill="rgba(227,178,60,0.35)" stroke="var(--mustard)" strokeWidth="4" />}
            {t.kind === 'help' && (
              <g transform="translate(-30 22) scale(0.9)" aria-hidden="true">
                <Shopper n={Number(t.id.replace(/\D/g, '')) + 5} fill={0.2} />
              </g>
            )}
            <circle r="13" fill={open ? 'var(--bad)' : 'var(--paper)'} stroke={open ? '#7a1f1a' : 'var(--good)'} strokeWidth="2" className={open && motion ? 'task-bob' : ''} />
            {open ? (
              <text y="5" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff">
                !
              </text>
            ) : (
              <path d={arc(done)} fill="var(--good)" />
            )}
            <g transform={`translate(${t.kind === 'help' ? 8 : 0} ${t.kind === 'help' ? -36 : 20})`}>
              <rect x={-pillW / 2} y="0" width={pillW} height="17" rx="8" fill={open ? 'var(--paper)' : '#e9f2e7'} stroke={open ? 'var(--bad)' : 'var(--good)'} strokeWidth="1.5" />
              <text y="12" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--ink)">
                {label}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** A pie slice for a job's progress (0..1), inside the marker. */
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

function StaffToken({
  entrance,
  s,
  a,
  x,
  y,
  act,
  selected,
  interactive,
  onClick,
  onPointerDown,
  walk,
  dragging,
  lesson,
  named,
}: {
  entrance: [number, number];
  onPointerDown?: (e: ReactPointerEvent) => void;
  walk?: boolean;
  dragging?: boolean;
  lesson?: boolean;
  named?: boolean;
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
      className={`token ${selected ? 'token-selected' : ''} ${interactive ? 'token-interactive' : ''} ${walk ? 'token-walk' : ''} ${dragging ? 'token-dragging' : ''}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onPointerDown={onPointerDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-label={interactive ? `${s.name}: ${ASSIGNMENT_LABEL[a]}, energy ${Math.round(e)}${tired ? ', tired' : ''}. Select.` : undefined}
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
      <circle cx="0" cy="-30" r="30" fill="transparent" />
      <title>{`${s.name}: ${ASSIGNMENT_LABEL[a]}, energy ${Math.round(e)}${tired ? ' (tired, working slower)' : ''}${act === 'idle' ? ', nothing to do' : ''}`}</title>
      {lesson && !selected && <circle cx="0" cy="-30" r="38" className="lesson-ring" />}
      {selected && <ellipse cx="0" cy="0" rx="22" ry="7" fill="none" stroke="var(--mustard)" strokeWidth="4" />}
      <g
        className={`${act === 'work' ? 'busy' : ''} ${s.availableFromStep !== undefined && s.availableFromStep < 1e9 ? 'staff-arrive' : ''}`}
        style={s.availableFromStep !== undefined ? { ['--sx' as string]: `${entrance[0] - x}px`, ['--sy' as string]: `${entrance[1] - y}px` } : undefined}
      >
        <g transform={a === 'tills' ? 'scale(1.05)' : 'scale(1.15)'}>
          <StaffFigure id={s.id} look={s.look} pose={pose} tired={tired} />
        </g>
      </g>
      {act === 'idle' && a !== 'break' && <Bubble text="…" />}
      {tired && act !== 'idle' && a !== 'break' && <Bubble text="z" tone="tired" />}
      {named && (
        <g transform="translate(0 4)">
          <rect x="-30" y="0" width="60" height="20" rx="6" fill={selected ? 'var(--mustard)' : 'var(--paper)'} stroke={selected ? 'var(--burgundy-dark)' : 'var(--line-strong)'} strokeWidth={selected ? 1.5 : 1} />
          <text y="11" textAnchor="middle" fontSize="11" fill="var(--ink)" fontWeight="800">
            {name}
          </text>
          {selected && (
            <>
              <rect x="-24" y="14.5" width="48" height="3" rx="1.5" fill="var(--paper)" />
              <rect x="-24" y="14.5" width={(48 * e) / 100} height="3" rx="1.5" fill={barColour} />
            </>
          )}
        </g>
      )}
    </g>
  );
}

function Bubble({ text, tone }: { text: string; tone?: 'tired' }) {
  return (
    <g className="bubble" transform="translate(16 -68)">
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
