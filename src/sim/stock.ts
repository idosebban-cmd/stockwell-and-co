import type { Batch } from './types';

const EPS = 1e-9;

export function total(batches: readonly Batch[]): number {
  let t = 0;
  for (const b of batches) t += b.qty;
  return t;
}

export function value(batches: readonly Batch[]): number {
  let t = 0;
  for (const b of batches) t += b.qty * b.unitCost;
  return t;
}

function key(b: Batch): string {
  return `${b.label}|${b.unitCost}|${b.expiresAt}`;
}

/** Earliest expiry first; non-expiring last. Stable for equal dates. */
function byExpiry(a: Batch, b: Batch): number {
  const ea = a.expiresAt ?? Infinity;
  const eb = b.expiresAt ?? Infinity;
  return ea - eb;
}

/** Adds batches into a list, merging matching ones. Mutates and returns `into`. */
export function add(into: Batch[], batches: readonly Batch[]): Batch[] {
  for (const b of batches) {
    if (b.qty <= EPS) continue;
    const k = key(b);
    const existing = into.find((x) => key(x) === k);
    if (existing) existing.qty += b.qty;
    else into.push({ ...b });
  }
  into.sort(byExpiry);
  return into;
}

function prune(batches: Batch[]): void {
  for (let i = batches.length - 1; i >= 0; i--) {
    if (batches[i].qty <= EPS) batches.splice(i, 1);
  }
}

/** Removes up to `qty`, earliest expiry first (stock rotation). Returns what was taken. */
export function take(batches: Batch[], qty: number): Batch[] {
  batches.sort(byExpiry);
  const taken: Batch[] = [];
  let left = qty;
  for (const b of batches) {
    if (left <= EPS) break;
    const n = Math.min(b.qty, left);
    if (n <= EPS) continue;
    b.qty -= n;
    left -= n;
    taken.push({ ...b, qty: n });
  }
  prune(batches);
  return taken;
}

/** Removes up to `qty`, latest expiry first (used to move the freshest stock back). */
export function takeNewest(batches: Batch[], qty: number): Batch[] {
  batches.sort(byExpiry);
  const taken: Batch[] = [];
  let left = qty;
  for (let i = batches.length - 1; i >= 0 && left > EPS; i--) {
    const b = batches[i];
    const n = Math.min(b.qty, left);
    b.qty -= n;
    left -= n;
    taken.push({ ...b, qty: n });
  }
  prune(batches);
  return taken;
}

/** Removes the same share of every batch. */
export function takeShare(batches: Batch[], share: number): Batch[] {
  const s = Math.max(0, Math.min(1, share));
  const taken: Batch[] = [];
  for (const b of batches) {
    const n = b.qty * s;
    if (n <= EPS) continue;
    b.qty -= n;
    taken.push({ ...b, qty: n });
  }
  prune(batches);
  return taken;
}

/** Removes batches that have expired by time `t`. */
export function takeExpired(batches: Batch[], t: number): Batch[] {
  const taken: Batch[] = [];
  for (const b of batches) {
    if (b.expiresAt !== null && b.expiresAt <= t && b.qty > EPS) {
      taken.push({ ...b });
      b.qty = 0;
    }
  }
  prune(batches);
  return taken;
}

export function clone(batches: readonly Batch[]): Batch[] {
  return batches.map((b) => ({ ...b }));
}
