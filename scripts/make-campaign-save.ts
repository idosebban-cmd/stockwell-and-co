/**
 * Writes a saved shop played by the sensible strategy, for screenshots and browser checks.
 * Usage: vite-node scripts/make-campaign-save.ts <out.json> <path: staff|chilled> <day> <hours into that day, or 'closed'>
 */
import { writeFileSync } from 'node:fs';
import { sensible } from '../src/sim/bots';
import { allOffers, afterClose, newCampaignRecord, nextDay, recommendOrder, replayToday, startCampaignDay, type CampaignRecord, type UpgradeId } from '../src/sim/campaign';
import { CONFIG } from '../src/sim/config';
import { runHour } from '../src/sim/engine';
import { choicesFromHourlyPlans } from '../src/sim/live';
const [out, path = 'staff', dayArg = '3', hoursArg = '2'] = process.argv.slice(2);
const paths: Record<string, Record<number, UpgradeId[]>> = {
  staff: { 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] },
  chilled: { 1: ['hire:bev'], 2: ['chilled', 'hire:dougie'], 4: ['shelfChilled'] },
};
const stopDay = Number(dayArg);
let rec: CampaignRecord = newCampaignRecord(1);
for (let d = 0; d <= stopDay; d++) {
  const setup = recommendOrder(rec.camp);
  let state = startCampaignDay(rec.camp, setup);
  const plans = [];
  const limit = d === stopDay && hoursArg !== 'closed' ? Number(hoursArg) : 99;
  while (state.hour < state.ctx.hours && plans.length < limit) {
    const p = sensible(state);
    plans.push(p);
    state = runHour(state, p).state;
  }
  rec = { ...rec, today: { setup, choices: choicesFromHourlyPlans(plans), minute: plans.length * CONFIG.stepsPerHour }, purchases: [] };
  if (d < stopDay) {
    const closed = replayToday(rec)!.state;
    for (const id of paths[path][d] ?? []) if (allOffers(afterClose(rec, closed).camp, closed).find((o) => o.id === id)?.available) rec = { ...rec, purchases: [...rec.purchases, id] };
    rec = nextDay(rec, closed);
  }
}
writeFileSync(out, JSON.stringify({ record: rec, savedAt: '' }));
console.log('day', rec.camp.day, 'minute', rec.today?.minute);
