/**
 * Pacing report: prompts per in-game hour (= per real minute at 1x) and how often jobs outnumber people,
 * for each day of the first week and for Quick play, played live by the attentive scripted manager.
 * Usage: npm run pacing [-- seeds]. Aim: one prompt every 30–60 real seconds.
 */
import { playLiveDay, sensible } from '../src/sim/bots';
import { newCampaign, recommendOrder, startCampaignDay, finishDay, type CampaignState } from '../src/sim/campaign';
import { recommendedSetup, startDay, weekdayName } from '../src/sim/engine';
import { newWatch, watchMinute, type PacingWatch } from '../src/sim/pacing';

const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number);
const rows: Record<string, PacingWatch[]> = {};
const add = (name: string, w: PacingWatch) => (rows[name] ??= []).push(w);
for (const seed of seeds) {
  let camp: CampaignState = newCampaign(seed);
  for (let d = 0; d < 7; d++) {
    const w = newWatch();
    const state = playLiveDay(startCampaignDay(camp, recommendOrder(camp)), sensible, (live) => void watchMinute(w, live));
    add(`Day ${d + 1} ${weekdayName(d, true)}`, w);
    camp = finishDay(camp, state).camp;
  }
  const w = newWatch();
  playLiveDay(startDay(seed, recommendedSetup()), sensible, (live) => void watchMinute(w, live));
  add('Quick play', w);
}
console.log('day            per hour  every (s at 1x)  bursts tasks events shelves queues dock   more jobs than people');
for (const [name, ws] of Object.entries(rows)) {
  const hours = ws.reduce((t, w) => t + w.minutes, 0) / 60;
  const sum = (k: keyof PacingWatch['counts']) => ws.reduce((t, w) => t + w.counts[k], 0) / hours;
  const total = (['burst', 'task', 'event', 'shelf', 'queue', 'dock'] as const).reduce((t, k) => t + sum(k), 0);
  const stretched = ws.reduce((t, w) => t + w.stretched, 0) / ws.reduce((t, w) => t + w.minutes, 0);
  const f = (x: number) => x.toFixed(2).padStart(5);
  console.log(`${name.padEnd(14)} ${f(total)}     ${String(Math.round(60 / total)).padStart(4)}            ${f(sum('burst'))} ${f(sum('task'))} ${f(sum('event'))} ${f(sum('shelf'))}  ${f(sum('queue'))} ${f(sum('dock'))}   ${Math.round(stretched * 100)}%`);
}
