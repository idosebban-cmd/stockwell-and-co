/**
 * Where the browsing shoppers are drawn. Pure (no React), so tests can check
 * the same positions the shop draws. Shoppers only ever browse departments the
 * shop has; they are decoration and carry no marker (floor jobs have their own).
 */
import { CONFIG, type DeptId } from '../sim/config';
import { expectedCustomers } from '../sim/engine';
import type { SimState } from '../sim/types';

/** Browsing spots per department (viewBox units). */
export const DEPT_SPOTS: Record<DeptId, { x: [number, number]; y: [number, number] }> = {
  produce: { x: [40, 260], y: [244, 432] },
  chilled: { x: [340, 960], y: [256, 268] },
  ambient: { x: [380, 930], y: [334, 392] },
};

/** The strip where the chilled cabinets stand once bought (the "Chilled food" zone). */
export const CHILLED_AREA = { x: 300, y: 156, w: 688, h: 114 };

export function inChilledArea(x: number, y: number): boolean {
  return x >= CHILLED_AREA.x && x <= CHILLED_AREA.x + CHILLED_AREA.w && y >= CHILLED_AREA.y && y <= CHILLED_AREA.y + CHILLED_AREA.h;
}

export function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface ShopperFigure {
  k: number;
  dept: DeptId;
  x: number;
  y: number;
  /** How full the basket looks (0..1). */
  fill: number;
}

/** Shoppers in the aisles while the shop is open live: about ten minutes' arrivals. */
export function liveBrowsing(state: SimState): number {
  return state.hour < state.ctx.hours ? expectedCustomers(state) / 6 : 0;
}

/** One figure per 1.2 arrivals (up to 14), spread across the shop's departments by basket share. */
export function shopperFigures(arrivals: number, depts: readonly DeptId[], emptyDepts: readonly DeptId[]): ShopperFigure[] {
  const n = Math.min(14, Math.round(arrivals / 1.2));
  if (n <= 0 || !depts.length) return [];
  const weights = depts.map((d) => CONFIG.departments[d].basket);
  const sum = weights.reduce((t, x) => t + x, 0);
  const out: ShopperFigure[] = [];
  let k = 0;
  depts.forEach((d, di) => {
    const m = di === depts.length - 1 ? n - k : Math.round((n * weights[di]) / sum);
    const spot = DEPT_SPOTS[d];
    for (let i = 0; i < m; i++, k++) {
      const x = spot.x[0] + hash(k, 3) * (spot.x[1] - spot.x[0]);
      const y = d === 'ambient' ? (k % 2 ? 336 : 390) : spot.y[0] + hash(k, 5) * (spot.y[1] - spot.y[0]);
      out.push({ k, dept: d, x, y, fill: emptyDepts.includes(d) ? 0.1 : 0.4 + hash(k, 9) * 0.5 });
    }
  });
  return out;
}
