/**
 * The end of the day: 1–3 stars from how happy shoppers were, and one
 * highlight to show as a picture (design rule 10). Pure.
 */
import { CONFIG } from './config';
import type { CampaignState, DayResult } from './campaign';
import type { SimState } from './types';

export function starsFor(satisfaction: number): 1 | 2 | 3 {
  return satisfaction >= CONFIG.stars.three ? 3 : satisfaction >= CONFIG.stars.two ? 2 : 1;
}

export type Highlight =
  | { kind: 'staff'; staffId: string; text: string }
  | { kind: 'happy' | 'mop' | 'crowd' | 'cat'; text: string };

/** Who spent the most of the day on the tills. */
function tillStar(state: SimState): { id: string; name: string } | null {
  const hours = new Map<string, { name: string; n: number }>();
  for (const r of state.history) for (const s of r.staff) if (s.assignment === 'tills') hours.set(s.id, { name: s.name, n: (hours.get(s.id)?.n ?? 0) + 1 });
  const best = [...hours.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
  return best ? { id: best[0], name: best[1].name } : null;
}

/** One thing that went well today; a different one most days. */
export function dayHighlight(state: SimState, result: DayResult, before: CampaignState): Highlight {
  const out: Highlight[] = [];
  if (result.walkouts < 1) out.push({ kind: 'happy', text: 'Nobody left grumpy!' });
  const counts = state.floor?.counts;
  if (counts && counts.resolved >= 2 && counts.expired === 0) out.push({ kind: 'mop', text: 'Every job sorted!' });
  const star = tillStar(state);
  if (star) out.push({ kind: 'staff', staffId: star.id, text: `${star.name}, till superstar!` });
  if (before.results.length > 0 && result.served > Math.max(...before.results.map((r) => r.served))) out.push({ kind: 'crowd', text: 'Busiest day yet!' });
  if (!out.length) return { kind: 'cat', text: 'The cat had a lovely nap.' };
  return out[result.day % out.length];
}
