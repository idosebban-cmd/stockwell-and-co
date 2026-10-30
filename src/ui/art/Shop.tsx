/**
 * The shop, lamplit and in three-quarter view: the back rooms behind a low
 * wall, a street window whose light moves across the floor through the day,
 * fixtures with visible front faces, stock that looks like stock and empties
 * as it sells, and a little ambient life (passers-by, the shop cat, the door
 * bell). Pure drawing: positions for people, zones and markers come from
 * `layoutFor`, so the shop's interaction layer can use the same places.
 */
import type { ReactNode } from 'react';
import { CONFIG, type DeptId, type TaskPlace } from '../../sim/config';

export const W = 1000;
export const H = 700;

// Lamplit palette.
const C = {
  wall: '#e3b98a',
  stripe: '#d9aa76',
  skirting: '#7d4423',
  floorA: '#d6a56c',
  floorB: '#cb975d',
  grout: '#b9844b',
  room: '#c9a77e',
  roomDark: '#a98a64',
  roomFloor: '#b08a5e',
  wood: '#a8673a',
  woodTop: '#c78755',
  woodDark: '#6f3f1f',
  shelfFace: '#ead0a6',
  cream: '#f7e6c6',
  burgundy: '#7a1f2b',
  burgundyDark: '#4c0f18',
  mustard: '#e3a43a',
  ink: '#2f1308',
  out: 'rgba(60,28,12,0.5)',
  shadow: 'rgba(60,25,5,0.3)',
  glass: '#cfe6ee',
  steel: '#8a8580',
};
const ol = { stroke: C.out, strokeWidth: 1.4, strokeLinejoin: 'round' as const };

/** What is installed, for drawing: fixtures occupy predefined places and appear when bought. */
export interface ShopFit {
  depts: DeptId[];
  tills: number;
  /** Rows of fruit & veg crates (2 or 3). */
  produceRows: number;
  /** Grocery aisles (2 or 3). */
  aisles: number;
  /** Chilled cabinets (0, 2 or 4). */
  cabinets: number;
  /** Better refrigeration installed. */
  frost: boolean;
}

export type ZoneId = 'produce' | 'chilled' | 'ambient' | 'tills' | 'dock' | 'break';
export type SlotJob = 'tills' | 'replenish:produce' | 'replenish:chilled' | 'replenish:ambient' | 'receive' | 'break' | 'task';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  zones: (Rect & { z: ZoneId; mark: [number, number] })[];
  /** Feet positions for each job. */
  slots: Record<SlotJob, [number, number][]>;
  /** Where floor jobs appear, per place. */
  taskSpots: Record<TaskPlace, [number, number][]>;
  noticeAt: Record<ZoneId, [number, number]>;
  stockroom: Rect;
  office: Rect;
  stockroomMark: [number, number];
  laneY: number[];
  queueFrontX: number;
  queueGap: number;
  /** Where shoppers come in and leave. */
  entrance: [number, number];
  gondolas: { x: number; y: number; w: number; faceH: number }[];
  /** Feet line in front of each gondola (where shoppers and fillers stand). */
  aisleWalks: number[];
  /** Where the door cue sits. */
  doorCue: [number, number];
}

const PRODUCE_ROWS = [184, 262, 340];
const LANES = [486, 556, 626];

export function layoutFor(fit: ShopFit): Layout {
  const chilled = fit.cabinets > 0;
  const ambTop = chilled ? 286 : 166;
  const ambRight = chilled ? 986 : 846;
  const n = Math.max(1, fit.aisles);
  const bandTop = ambTop + 26;
  const pitch = (452 - bandTop) / n;
  const faceH = Math.max(30, Math.min(74, pitch - 26));
  const gondolas = Array.from({ length: n }, (_, i) => ({ x: 330, y: bandTop + i * pitch, w: ambRight - 344, faceH }));
  const aisleWalks = gondolas.map((g) => Math.min(458, g.y + 10 + g.faceH + 12));
  const walkA = aisleWalks[0];
  const walkB = aisleWalks[Math.min(1, n - 1)];
  return {
    zones: [
      { z: 'produce', x: 14, y: 160, w: 280, h: 300, mark: [276, 176] },
      { z: 'chilled', x: 300, y: 160, w: 686, h: 120, mark: [968, 176] },
      { z: 'ambient', x: 300, y: ambTop, w: ambRight - 300, h: 462 - ambTop, mark: [ambRight - 18, ambTop + 16] },
      { z: 'tills', x: 300, y: 466, w: 686, h: 226, mark: [968, 482] },
      { z: 'dock', x: 388, y: 14, w: 172, h: 132, mark: [544, 30] },
      { z: 'break', x: 706, y: 14, w: 160, h: 132, mark: [850, 30] },
    ],
    slots: {
      tills: LANES.map((y) => [966, y + 40] as [number, number]),
      'replenish:produce': [
        [150, 456],
        [286, 300],
      ],
      'replenish:chilled': [
        [480, 298],
        [800, 298],
      ],
      'replenish:ambient': [
        [540, walkA],
        [740, walkB],
      ],
      receive: [
        [430, 136],
        [520, 136],
      ],
      break: [
        [756, 134],
        [818, 134],
      ],
      task: [[200, 470]],
    },
    taskSpots: {
      produce: [
        [150, 252],
        [86, 462],
        [222, 462],
      ],
      chilled: [
        [420, 300],
        [640, 300],
        [860, 300],
      ],
      ambient: [
        [430, walkA + 2],
        [650, walkB + 2],
        [Math.min(780, ambRight - 70), walkA + 2],
      ],
      tills: [
        [600, 528],
        [600, 598],
      ],
      entrance: [[248, 646]],
    },
    noticeAt: {
      dock: [474, 30],
      produce: [150, 168],
      chilled: [640, 166],
      ambient: [(300 + ambRight) / 2, ambTop + 6],
      break: [786, 30],
      tills: [640, 476],
    },
    stockroom: { x: 14, y: 14, w: 362, h: 132 },
    office: { x: 572, y: 14, w: 122, h: 132 },
    stockroomMark: [360, 30],
    laneY: LANES,
    queueFrontX: 712,
    queueGap: 24,
    entrance: [120, 690],
    gondolas,
    aisleWalks,
    doorCue: [24, 476],
  };
}

/** Hours since opening, from the shop clock ("10:40"); used to move the light. */
export function hourOfDay(clock: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!m) return 4;
  return Number(m[1]) + Number(m[2]) / 60 - CONFIG.openingHour;
}

function mix(a: string, b: string, t: number): string {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

// ---------------------------------------------------------------------------
// Defs, floor, back wall, light
// ---------------------------------------------------------------------------

export function ShopDefs({ t }: { t: number }) {
  // t: 0 at opening, 1 at a late close. Morning sky is pale, the afternoon warmer.
  const skyTop = mix('#bfe0f2', '#f2a86a', Math.min(1, t));
  const skyLow = mix('#f6ecd0', '#fbd9a6', Math.min(1, t));
  return (
    <defs>
      <pattern id="sh-tiles" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill={C.floorA} />
        <rect width="20" height="20" fill={C.floorB} />
        <rect x="20" y="20" width="20" height="20" fill={C.floorB} />
        <path d="M0 0 H40 M0 20 H40 M0 0 V40 M20 0 V40" stroke={C.grout} strokeWidth="1" />
        <circle cx="9" cy="31" r="0.9" fill="rgba(90,50,20,0.18)" />
        <circle cx="31" cy="11" r="0.9" fill="rgba(90,50,20,0.18)" />
      </pattern>
      <pattern id="sh-boards" width="48" height="10" patternUnits="userSpaceOnUse">
        <rect width="48" height="10" fill={C.roomFloor} />
        <path d="M0 10 H48 M24 0 V10" stroke="rgba(70,40,15,0.25)" strokeWidth="1" />
      </pattern>
      <pattern id="sh-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="rgba(179,54,44,0.12)" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#b3362c" strokeWidth="2" />
      </pattern>
      <pattern id="belt" width="8" height="12" patternUnits="userSpaceOnUse">
        <rect width="8" height="12" fill="#4a4442" />
        <rect width="2" height="12" fill="#5d5754" />
      </pattern>
      <linearGradient id="sh-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={skyTop} />
        <stop offset="1" stopColor={skyLow} />
      </linearGradient>
      <radialGradient id="sh-vignette" cx="0.48" cy="0.45" r="0.78">
        <stop offset="0.55" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(40,12,4,0.42)" />
      </radialGradient>
      <linearGradient id="sh-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
        <stop offset="0.4" stopColor="rgba(255,255,255,0.08)" />
        <stop offset="1" stopColor="rgba(255,255,255,0.25)" />
      </linearGradient>
    </defs>
  );
}

/** Floor, back wall and the window's light on the floor. */
export function Backdrop({ t }: { t: number }) {
  // The sunbeam swings from steep and pale in the morning to long and orange late in the day.
  const swing = 120 + 420 * Math.min(1, Math.max(0, t));
  const beam = mix('#fff3c4', '#ffb050', Math.min(1, t));
  return (
    <g aria-hidden="true">
      <rect x="0" y="150" width={W} height={H - 150} fill="url(#sh-tiles)" />
      <path d={`M884 158 L982 158 L${982 - swing} ${H} L${884 - swing - 160} ${H} Z`} fill={beam} opacity="0.26" className="sunbeam" />
      <rect x="0" y="0" width={W} height="150" fill={C.wall} />
      {Array.from({ length: Math.ceil(W / 26) }, (_, i) => (
        <rect key={i} x={i * 26} y="0" width="12" height="146" fill={C.stripe} opacity="0.55" />
      ))}
      <rect x="0" y="146" width={W} height="12" fill={C.skirting} />
      <rect x="0" y="158" width={W} height="6" fill="rgba(60,25,5,0.18)" />
    </g>
  );
}

/** Soft dark edges over the shop (under the people and markers). */
export function Vignette() {
  return <rect x="0" y="0" width={W} height={H} fill="url(#sh-vignette)" pointerEvents="none" aria-hidden="true" />;
}

function RoomBox({ x, w, label, children }: { x: number; w: number; label: string; children?: ReactNode }) {
  return (
    <g>
      <rect x={x} y="14" width={w} height="132" rx="6" fill={C.room} {...ol} />
      <rect x={x + 4} y="118" width={w - 8} height="26" fill="url(#sh-boards)" />
      <rect x={x + 4} y="18" width={w - 8} height="4" fill="rgba(255,240,215,0.35)" />
      {children}
      <text x={x + 10} y="30" className="room-label">
        {label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Back rooms
// ---------------------------------------------------------------------------

const CRATE_FILL: Record<DeptId, string> = { produce: '#9fbf3b', chilled: '#b9dbe6', ambient: '#c99a63' };

export function StockroomArt({ backroom, depts, detail, tags }: { backroom: Record<DeptId, number>; depts: DeptId[]; detail: string | null; tags?: Partial<Record<DeptId, string>> }) {
  const bays = (
    [
      ['produce', 24, 'Fruit & veg'],
      ['chilled', 140, 'Cold room'],
      ['ambient', 256, 'Cupboard'],
    ] as [DeptId, number, string][]
  ).filter(([d]) => depts.includes(d));
  return (
    <g aria-hidden="true">
      <RoomBox x={14} w={362} label="STOCKROOM">
        {bays.map(([d, x, label]) => {
          const cap = CONFIG.campaign.backroom[d];
          const n = Math.round(Math.min(1, backroom[d] / cap) * 8);
          return (
            <g key={d}>
              {d === 'chilled' && <rect x={x - 3} y="34" width="110" height="84" rx="4" fill="#a9cdd8" opacity="0.6" />}
              <rect x={x} y="36" width="104" height="82" fill="none" stroke={C.woodDark} strokeWidth="2.5" />
              <path d={`M${x} 76 h104 M${x} 116 h104`} stroke={C.woodDark} strokeWidth="3" />
              {Array.from({ length: n }, (_, i) => {
                const row = Math.floor(i / 4);
                const cx = x + 4 + (i % 4) * 25;
                const cy = 113 - row * 40;
                return (
                  <g key={i}>
                    <rect x={cx} y={cy - 20} width="22" height="20" rx="2" fill={CRATE_FILL[d]} {...ol} />
                    <rect x={cx} y={cy - 20} width="22" height="5" rx="1.5" fill="rgba(255,255,255,0.3)" />
                  </g>
                );
              })}
              <text x={x + 52} y="140" textAnchor="middle" fontSize="11" fill={backroom[d] < 1 ? '#a3261c' : C.ink} fontWeight={backroom[d] < 1 || detail === d || detail === 'dock' ? 800 : 600}>
                {label}
                {backroom[d] < 1 ? ': none' : detail === d || detail === 'dock' ? `: ${Math.round(backroom[d])}` : ''}
              </text>
              {tags?.[d] && (
                <g transform={`translate(${x + 52} 48)`}>
                  <rect x={-Math.max(44, tags[d]!.length * 2.9 + 8)} y="-9" width={Math.max(88, tags[d]!.length * 5.8 + 16)} height="17" rx="8" fill="#e3f1df" stroke="#2f7a45" strokeWidth="1.5" />
                  <text y="4" textAnchor="middle" fontSize="9.5" fontWeight="800" fill={C.ink}>
                    {tags[d]}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </RoomBox>
    </g>
  );
}

export function DockArt({ dock, lorry, detail }: { dock: number; lorry: boolean; detail: boolean }) {
  const n = Math.min(8, Math.ceil(dock / 120));
  return (
    <g aria-hidden="true">
      <RoomBox x={388} w={172} label={dock > 0 && detail ? `DOCK · ${Math.round(dock).toLocaleString('en-GB')}` : 'DOCK'}>
        <rect x="402" y="38" width="144" height="74" rx="3" fill="#bdb2a0" {...ol} />
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x="406" y={42 + i * 10} width="136" height="6" rx="1" fill="#d3c8b5" />
        ))}
        <rect x="402" y="34" width="144" height="8" fill={C.mustard} />
        <path d="M408 34 l6 8 M424 34 l6 8 M440 34 l6 8 M456 34 l6 8 M472 34 l6 8 M488 34 l6 8 M504 34 l6 8 M520 34 l6 8 M536 34 l6 8" stroke={C.ink} strokeWidth="2" opacity="0.5" />
        {lorry && (
          <g className="lorry">
            <rect x="412" y="46" width="124" height="36" rx="4" fill={C.burgundy} {...ol} />
            <text x="474" y="69" textAnchor="middle" fontSize="10" fill={C.cream} fontWeight="800" letterSpacing="1">
              WHOLESALE
            </text>
          </g>
        )}
        {Array.from({ length: n }, (_, i) => {
          const x = 398 + (i % 4) * 38;
          const y = i < 4 ? 142 : 120;
          return (
            <g key={i}>
              <rect x={x} y={y - 22} width="34" height="22" rx="2" fill="#c99a63" {...ol} />
              <path d={`M${x + 17} ${y - 22} v22 M${x} ${y - 13} h34`} stroke="rgba(90,50,20,0.45)" strokeWidth="1.5" />
            </g>
          );
        })}
      </RoomBox>
    </g>
  );
}

export function OfficeArt({ clock, hiring }: { clock: string; hiring: boolean }) {
  return (
    <g aria-hidden="true">
      <RoomBox x={572} w={122} label="OFFICE">
        <rect x="582" y="44" width="40" height="76" rx="4" fill={C.wood} {...ol} />
        <circle cx="614" cy="86" r="2.6" fill={C.mustard} />
        <rect x="588" y="52" width="28" height="22" rx="2" fill="rgba(255,240,215,0.35)" />
        <circle cx="660" cy="56" r="20" fill="#fffaf0" stroke={C.burgundy} strokeWidth="4" />
        <text x="660" y="61" textAnchor="middle" fontSize="11.5" fontWeight="900" fill={C.burgundy}>
          {clock}
        </text>
        <rect x="634" y="84" width="52" height="34" rx="2" fill="#d9c49a" {...ol} />
        <rect x="639" y="89" width="18" height="11" fill="#fff" />
        <rect x="660" y="91" width="20" height="13" fill={hiring ? '#f3dc9a' : '#fff'} />
        {hiring && (
          <text x="670" y="100" textAnchor="middle" fontSize="5.5" fontWeight="900" fill={C.burgundy}>
            HIRING
          </text>
        )}
      </RoomBox>
    </g>
  );
}

export function BreakRoomArt() {
  return (
    <g aria-hidden="true">
      <RoomBox x={706} w={160} label="BREAK ROOM">
        <rect x="726" y="86" width="116" height="30" rx="10" fill={C.burgundy} {...ol} />
        <rect x="720" y="104" width="128" height="22" rx="9" fill={C.burgundyDark} {...ol} />
        <rect x="726" y="102" width="56" height="10" rx="5" fill="#93303d" />
        <rect x="786" y="102" width="56" height="10" rx="5" fill="#93303d" />
        <rect x="806" y="40" width="50" height="38" rx="2" fill="#fffaf0" {...ol} />
        <text x="831" y="51" textAnchor="middle" fontSize="7" fontWeight="900" fill={C.burgundy}>
          ROTA
        </text>
        <path d="M812 58 h38 M812 64 h38 M812 70 h28" stroke="#c9b48c" strokeWidth="1.5" />
        <rect x="722" y="56" width="44" height="8" rx="2" fill={C.wood} />
        <rect x="728" y="44" width="12" height="12" rx="3" fill={C.steel} />
        <rect x="746" y="47" width="7" height="9" rx="1.5" fill="#fffaf0" stroke={C.burgundy} />
      </RoomBox>
    </g>
  );
}

/** The street window: sky by time of day, the shops opposite and people walking past. */
export function StreetWindow({ motion }: { motion: boolean }) {
  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id="sh-window">
          <rect x="878" y="14" width="108" height="132" rx="6" />
        </clipPath>
      </defs>
      <g clipPath="url(#sh-window)">
        <rect x="878" y="14" width="108" height="132" fill="url(#sh-sky)" />
        <rect x="882" y="70" width="34" height="62" fill="#b97a5a" />
        <rect x="920" y="58" width="30" height="74" fill="#a8695a" />
        <rect x="954" y="76" width="34" height="56" fill="#c98f68" />
        {[[888, 80], [902, 80], [926, 68], [938, 68], [960, 86], [974, 86]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="8" height="10" fill="#fff0c4" opacity="0.85" />
        ))}
        <rect x="878" y="128" width="108" height="18" fill="#a9a196" />
        <g className={motion ? 'passer passer-a' : 'passer'} transform="translate(900 144)">
          <Passer coat="#3f7d74" />
        </g>
        <g className={motion ? 'passer passer-b' : 'passer'} transform="translate(960 144)">
          <Passer coat="#8a5a8c" />
        </g>
      </g>
      <rect x="878" y="14" width="108" height="132" rx="6" fill="none" stroke={C.woodDark} strokeWidth="5" />
      <path d="M932 14 V146 M878 72 H986" stroke={C.woodDark} strokeWidth="4" />
      <rect x="872" y="140" width="120" height="10" rx="2" fill={C.woodTop} {...ol} />
    </g>
  );
}

function Passer({ coat }: { coat: string }) {
  return (
    <g>
      <rect x="-3" y="-8" width="2.5" height="8" fill="#3a3330" />
      <rect x="0.5" y="-8" width="2.5" height="8" fill="#3a3330" />
      <rect x="-5" y="-20" width="10" height="13" rx="4" fill={coat} />
      <circle cx="0" cy="-24" r="5" fill="#e8b48f" />
      <path d="M-5 -25 q5 -7 10 0z" fill="#3b2a1e" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The shop floor
// ---------------------------------------------------------------------------

function Sticker({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="10" fill="#f2d21a" stroke="#b89a0a" />
      <text x={x} y={y + 2.5} textAnchor="middle" fontSize="7" fontWeight="800" fill="#5a4a00">
        −35%
      </text>
    </g>
  );
}

const FRUIT: [string, string][] = [
  ['#c2452d', '#d9583c'],
  ['#e08a1e', '#f0a33a'],
  ['#5d8f2f', '#78a944'],
  ['#9fbf3b', '#b8cf55'],
  ['#d8b25a', '#e8c66a'],
  ['#8a3a6b', '#a04c80'],
];

export function ProduceArt({ fill, rows, markdown }: { fill: number; rows: number; markdown: boolean }) {
  const f = Math.max(0, Math.min(1, fill));
  const crates: [number, number, number][] = [];
  PRODUCE_ROWS.slice(0, rows).forEach((y, r) => [28, 158].forEach((x, c) => crates.push([x, y, r * 2 + c])));
  return (
    <g aria-hidden="true">
      {crates.map(([x, y, i]) => {
        const w = 118;
        const per = 18;
        const keep = Math.round(per * f);
        return (
          <g key={i}>
            <ellipse cx={x + w / 2} cy={y + 60} rx={w / 2 + 6} ry="6" fill={C.shadow} />
            <rect x={x} y={y + 16} width={w} height="40" rx="3" fill={C.wood} {...ol} />
            <path d={`M${x + 4} ${y + 29} h${w - 8} M${x + 4} ${y + 42} h${w - 8}`} stroke={C.woodDark} strokeWidth="2" />
            <rect x={x} y={y} width={w} height="18" rx="3" fill={C.woodDark} {...ol} />
            {Array.from({ length: keep }, (_, k) => {
              const row = Math.floor(k / 9);
              const col = k % 9;
              const cx = x + 10 + col * 12.5 + (row % 2) * 5;
              const cy = y + 12 - row * 6;
              const [a, b] = FRUIT[i % FRUIT.length];
              return (
                <g key={k}>
                  <circle cx={cx} cy={cy} r="6.4" fill={k % 3 ? a : b} {...ol} strokeWidth={1} />
                  <circle cx={cx - 2} cy={cy - 2} r="1.6" fill="#fff" opacity="0.55" />
                </g>
              );
            })}
            {markdown && i === 0 && <Sticker x={x + w - 8} y={y + 4} />}
          </g>
        );
      })}
    </g>
  );
}

/** Where the chilled cabinets will go, before the department is bought. */
export function ExpandSpot() {
  return (
    <g aria-hidden="true">
      <rect x="862" y="172" width="120" height="98" rx="10" fill="rgba(255,240,215,0.28)" stroke={C.mustard} strokeWidth="2.5" strokeDasharray="8 6" />
      <rect x="878" y="190" width="88" height="36" rx="6" fill={C.cream} {...ol} />
      <text x="922" y="204" textAnchor="middle" fontSize="9.5" fontWeight="900" fill={C.burgundy} letterSpacing="1">
        EXPAND HERE
      </text>
      <text x="922" y="218" textAnchor="middle" fontSize="9" fontWeight="700" fill="#5b4a3b">
        Chilled cabinets
      </text>
      <rect x="918" y="226" width="8" height="34" fill={C.woodDark} />
    </g>
  );
}

const PACKS = ['#f7f3ea', '#9cc7d6', '#e8c1c8', '#f2d16b'];

export function ChilledArt({ fill, cabinets, frost, fault, markdown }: { fill: number; cabinets: number; frost: boolean; fault: boolean; markdown: boolean }) {
  const working = fault ? cabinets / 2 : cabinets;
  const f = Math.max(0, Math.min(1, fill));
  return (
    <g aria-hidden="true">
      {Array.from({ length: cabinets }, (_, c) => {
        const x = 316 + c * 166;
        const per = 30;
        const keep = c < working ? Math.round(per * f) : 0;
        return (
          <g key={c}>
            <ellipse cx={x + 80} cy="268" rx="88" ry="6" fill={C.shadow} />
            <rect x={x} y="174" width="160" height="14" rx="3" fill="#f2efe8" {...ol} />
            <rect x={x} y="188" width="160" height="72" rx="3" fill="#7fa9b8" {...ol} />
            <rect x={x + 5} y="192" width="150" height="62" rx="2" fill={C.glass} />
            {[0, 1, 2].map((s) => (
              <rect key={s} x={x + 5} y={212 + s * 20} width="150" height="2.5" fill="#9cbccb" />
            ))}
            {Array.from({ length: keep }, (_, k) => {
              const s = Math.floor(k / 10);
              const px = x + 9 + (k % 10) * 14.5;
              const py = 211 + s * 20;
              return k % 2 ? (
                <rect key={k} x={px} y={py - 14} width="10" height="14" rx="2" fill={PACKS[(k + c) % 4]} {...ol} strokeWidth={0.8} />
              ) : (
                <g key={k}>
                  <rect x={px + 1} y={py - 15} width="8" height="15" rx="2" fill="#fbfbf8" {...ol} strokeWidth={0.8} />
                  <rect x={px + 2.5} y={py - 18} width="5" height="3.5" rx="1" fill="#3b6fb0" />
                </g>
              );
            })}
            <rect x={x + 5} y="192" width="150" height="62" rx="2" fill="url(#sh-glass)" />
            <rect x={x} y="256" width="160" height="6" rx="2" fill="#5f8794" />
            {frost && (
              <text x={x + 150} y="204" textAnchor="middle" fontSize="11" fill="#2f6f8f">
                ❄
              </text>
            )}
            {c >= working && (
              <g>
                <rect x={x} y="174" width="160" height="88" fill="url(#sh-hatch)" />
                <rect x={x + 30} y="214" width="100" height="20" rx="6" fill="#fffaf0" opacity="0.92" />
                <text x={x + 80} y="228" textAnchor="middle" fontSize="11" fill="#b3362c" fontWeight="800">
                  Out of use
                </text>
              </g>
            )}
          </g>
        );
      })}
      {markdown && <Sticker x={470} y={194} />}
    </g>
  );
}

const STOCK = ['#c2452d', '#2f6f8f', '#5c8f3a', '#d9932b', '#8a3a6b', '#2d6b5f'];

function Tin({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <rect x={x} y={y - 15} width="11" height="15" rx="2" fill={c} {...ol} strokeWidth={0.9} />
      <rect x={x} y={y - 10} width="11" height="5" fill="#fff6e0" opacity="0.85" />
      <ellipse cx={x + 5.5} cy={y - 15} rx="5.5" ry="1.5" fill="#d8d2c8" />
    </g>
  );
}
function Jar({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <rect x={x} y={y - 16} width="12" height="16" rx="4" fill={c} {...ol} strokeWidth={0.9} />
      <rect x={x + 1} y={y - 19} width="10" height="4" rx="1" fill="#e9c24a" />
      <rect x={x + 2} y={y - 10} width="8" height="5" rx="1" fill="#fff6e0" opacity="0.9" />
    </g>
  );
}
function Box({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <rect x={x} y={y - 19} width="13" height="19" rx="1.5" fill={c} {...ol} strokeWidth={0.9} />
      <rect x={x + 2} y={y - 15} width="9" height="6" rx="1" fill="#fff6e0" opacity="0.9" />
    </g>
  );
}

export function AislesArt({ fill, gondolas, promo }: { fill: number; gondolas: Layout['gondolas']; promo: boolean }) {
  const f = Math.max(0, Math.min(1, fill));
  return (
    <g aria-hidden="true">
      {gondolas.map((g, gi) => {
        const rows = g.faceH >= 60 ? 3 : g.faceH >= 42 ? 2 : 1;
        const rowH = (g.faceH - 6) / rows;
        const n = Math.floor((g.w - 16) / 15);
        return (
          <g key={gi}>
            <ellipse cx={g.x + g.w / 2} cy={g.y + 10 + g.faceH + 4} rx={g.w / 2 + 10} ry="7" fill={C.shadow} />
            <rect x={g.x} y={g.y} width={g.w} height="12" rx="3" fill={C.woodTop} {...ol} />
            <rect x={g.x} y={g.y + 12} width={g.w} height={g.faceH} rx="3" fill={C.shelfFace} {...ol} />
            {Array.from({ length: rows }, (_, r) => {
              const sy = g.y + 12 + (r + 1) * rowH;
              // Stock empties from the far end of each shelf, lower shelves last.
              const keep = Math.round(n * Math.max(0, Math.min(1, f * (1.15 - r * 0.12))));
              return (
                <g key={r}>
                  {Array.from({ length: keep }, (_, i) => {
                    const x = g.x + 8 + i * 15;
                    const c = STOCK[(i * 7 + r * 3 + gi) % STOCK.length];
                    return r === 0 ? <Tin key={i} x={x} y={sy} c={c} /> : r === 1 ? <Jar key={i} x={x} y={sy} c={c} /> : <Box key={i} x={x} y={sy} c={c} />;
                  })}
                  <rect x={g.x + 2} y={sy} width={g.w - 4} height="4" fill={C.wood} />
                </g>
              );
            })}
            <rect x={g.x - 10} y={g.y - 2} width="12" height={g.faceH + 16} rx="3" fill={promo ? C.mustard : C.wood} {...ol} />
            <rect x={g.x + g.w - 2} y={g.y - 2} width="12" height={g.faceH + 16} rx="3" fill={promo ? C.mustard : C.wood} {...ol} />
            <circle cx={g.x - 4} cy={g.y + 8} r="8" fill={C.burgundy} />
            <text x={g.x - 4} y={g.y + 11.5} textAnchor="middle" fontSize="10" fontWeight="800" fill={C.cream}>
              {gi + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** One checkout lane's counter (drawn per lane, so the queue in front of it overlaps correctly). */
export function TillCounter({ y, n, on }: { y: number; n: number; on: boolean }) {
  return (
    <g aria-hidden="true" opacity={on ? 1 : 0.62}>
      <ellipse cx="840" cy={y + 50} rx="104" ry="7" fill={C.shadow} />
      <rect x="744" y={y} width="190" height="16" rx="4" fill={C.woodTop} {...ol} />
      <rect x="744" y={y + 16} width="190" height="32" rx="4" fill={C.wood} {...ol} />
      <path d={`M752 ${y + 30} h174`} stroke={C.woodDark} strokeWidth="1.5" opacity="0.6" />
      <rect x="752" y={y + 3} width="110" height="10" rx="3" fill="url(#belt)" />
      <rect x="884" y={y - 14} width="34" height="18" rx="3" fill="#3a3330" {...ol} />
      <rect x="888" y={y - 11} width="26" height="8" fill={on ? '#7cd38a' : '#77716c'} />
      <circle cx="732" cy={y + 22} r="10" fill={on ? C.burgundy : '#8a7a6a'} />
      <text x="732" y={y + 26} textAnchor="middle" fontSize="11" fontWeight="800" fill={C.cream}>
        {n}
      </text>
      {!on && (
        <text x="690" y={y + 40} textAnchor="middle" fontSize="11" fontWeight="800" fill="#6d5b4b">
          Closed
        </text>
      )}
    </g>
  );
}

/** The front door with its bell, the baskets, the doormat and the shop cat. */
export function EntranceArt({ dropped, ring, motion }: { dropped: number; ring: boolean; motion: boolean }) {
  return (
    <g aria-hidden="true">
      {/* the low front wall of the cutaway, with the doorway */}
      <rect x="0" y="684" width="36" height="16" fill={C.skirting} />
      <rect x="206" y="684" width={W - 206} height="16" fill={C.skirting} />
      <rect x="40" y="652" width="160" height="40" rx="8" fill="#8a3a2a" {...ol} />
      <rect x="48" y="658" width="144" height="28" rx="6" fill="#a34a36" />
      <text x="120" y="677" textAnchor="middle" fontSize="11" fontWeight="900" fill={C.cream} letterSpacing="2">
        WELCOME
      </text>
      <rect x="30" y="604" width="8" height="84" rx="2" fill={C.woodDark} />
      <rect x="200" y="604" width="8" height="84" rx="2" fill={C.woodDark} />
      <path d="M30 604 H208" stroke={C.woodDark} strokeWidth="6" />
      <g className={ring && motion ? 'bell ring' : 'bell'} style={{ transformOrigin: '54px 608px' }}>
        <path d="M54 608 v6" stroke={C.woodDark} strokeWidth="2" />
        <path d="M46 624 q8 -14 16 0 z" fill={C.mustard} {...ol} />
        <circle cx="54" cy="625" r="2" fill={C.woodDark} />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="222" y={652 - i * 7} width="40" height="16" rx="3" fill={C.burgundy} {...ol} />
          <path d={`M228 ${656 - i * 7} h28`} stroke={C.cream} strokeWidth="1" opacity="0.7" />
        </g>
      ))}
      <ShopCat x={150} y={640} motion={motion} />
      {Array.from({ length: Math.min(10, Math.round(dropped)) }, (_, i) => (
        <g key={i} transform={`translate(${296 + (i % 5) * 7} ${640 - Math.floor(i / 5) * 8 - (i % 2) * 2})`}>
          <rect x="-6" y="-5" width="12" height="7" rx="1.5" fill={C.burgundy} opacity="0.85" />
          <rect x="-4" y="-8" width="3" height="3" fill="#c2452d" />
          <rect x="0.5" y="-8.5" width="3" height="3.5" fill="#9cc7d6" />
        </g>
      ))}
      {dropped >= 1 && (
        <text x="310" y="660" textAnchor="middle" fontSize="9" fill="#b3362c" fontWeight="800">
          left behind
        </text>
      )}
    </g>
  );
}

function ShopCat({ x, y, motion }: { x: number; y: number; motion: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="18" ry="4" fill={C.shadow} />
      <g {...ol}>
        <path className={motion ? 'cat-tail swish' : 'cat-tail'} d="M-15 -4 q-12 2 -9 -9" fill="none" stroke="#e08a3c" strokeWidth="4.5" strokeLinecap="round" style={{ transformOrigin: '-15px -4px' }} />
        <ellipse cx="0" cy="-6" rx="16" ry="9" fill="#e08a3c" />
        <circle cx="13" cy="-13" r="8" fill="#e08a3c" />
        <path d="M8 -19 l2 -7 l4 6z M15 -20 l4 -6 l1 7z" fill="#e08a3c" />
      </g>
      <path d="M9.5 -13 q1.6 1.2 3.2 0 M15 -13 q1.6 1.2 3.2 0" stroke="#3a2418" strokeWidth="1.2" fill="none" />
      <path d="M-7 -10 q3 -2 6 0 M-2 -5 q3 -2 6 0" stroke="#b9652a" strokeWidth="1.6" fill="none" />
      <g className={motion ? 'zzz' : ''}>
        <text x="24" y="-18" fontSize="10" fontWeight="800" fill="#6d5b4b">
          z
        </text>
        <text x="31" y="-26" fontSize="8" fontWeight="800" fill="#6d5b4b">
          z
        </text>
      </g>
    </g>
  );
}

/** Small fixtures that fill the corner by the door: the paper stand and the bread table. */
export function FloorDecor() {
  const papers = ['#f4efe4', '#efe6d0', '#f7f1e2', '#ece0c6'];
  return (
    <g aria-hidden="true">
      <ellipse cx="78" cy="590" rx="56" ry="6" fill={C.shadow} />
      <rect x="28" y="530" width="100" height="58" rx="3" fill={C.burgundy} {...ol} />
      <rect x="28" y="522" width="100" height="10" rx="3" fill={C.burgundyDark} {...ol} />
      {papers.map((p, i) => (
        <g key={i}>
          <rect x={34 + i * 23} y={512 - (i % 2) * 3} width="20" height="26" rx="1" fill={p} {...ol} strokeWidth={0.9} />
          <rect x={36 + i * 23} y={516 - (i % 2) * 3} width="16" height="4" fill={i % 2 ? '#2f3a5a' : '#a3261c'} />
          <path d={`M${36 + i * 23} ${524 - (i % 2) * 3} h16 M${36 + i * 23} ${528 - (i % 2) * 3} h12`} stroke="#9a907e" strokeWidth="1" />
        </g>
      ))}
      <text x="78" y="566" textAnchor="middle" fontSize="9" fontWeight="900" fill={C.cream} letterSpacing="1">
        PAPERS
      </text>
      <ellipse cx="206" cy="590" rx="58" ry="6" fill={C.shadow} />
      <rect x="152" y="536" width="108" height="10" rx="3" fill={C.woodTop} {...ol} />
      <rect x="156" y="546" width="100" height="40" rx="3" fill={C.wood} {...ol} />
      <path d="M160 562 h92" stroke={C.woodDark} strokeWidth="1.5" opacity="0.6" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <ellipse cx={176 + i * 30} cy="532" rx="15" ry="9" fill="#d7a35a" {...ol} />
          <path d={`M${168 + i * 30} 529 q4 -3 8 0 M${176 + i * 30} 527 q4 -3 8 0`} stroke="#a8702e" strokeWidth="1.4" fill="none" />
        </g>
      ))}
      <rect x="172" y="566" width="68" height="14" rx="3" fill={C.cream} />
      <text x="206" y="576" textAnchor="middle" fontSize="8" fontWeight="900" fill={C.burgundy}>
        FRESH BREAD
      </text>
    </g>
  );
}
