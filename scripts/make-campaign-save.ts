/**
 * Writes a saved week played by the sensible strategy, for screenshots and browser checks.
 * Usage: vite-node scripts/make-campaign-save.ts <out.json> <path: staff|chilled> <day 0-6> <hours into that day, or 'closed'>
 */
import { writeFileSync } from 'node:fs';
import { sensible } from '../src/sim/bots';
import { allOffers, CAMPAIGN_VERSION, rebuildCampaign, recommendOrder, type CampaignRecord, type UpgradeId } from '../src/sim/campaign';
const [out, path = 'staff', dayArg = '3', hoursArg = '2'] = process.argv.slice(2);
const paths: Record<string, Record<number, UpgradeId[]>> = {
  staff: { 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] },
  chilled: { 1: ['hire:bev'], 2: ['chilled', 'hire:dougie'], 4: ['shelfChilled'] },
};
const stopDay = Number(dayArg);
const rec: CampaignRecord = { version: CAMPAIGN_VERSION, seed: 1, days: [] };
for (let d = 0; d <= stopDay; d++) {
  let rb = rebuildCampaign(rec);
  rec.days.push({ setup: recommendOrder(rb.camp), plans: [], purchases: [], done: false });
  rb = rebuildCampaign(rec);
  const limit = d === stopDay && hoursArg !== 'closed' ? Number(hoursArg) : 99;
  while (rb.phase === 'trading' && rec.days[d].plans.length < limit) {
    rec.days[d].plans.push(sensible(rb.state!));
    rb = rebuildCampaign(rec);
  }
  if (d < stopDay) {
    for (const id of paths[path][d] ?? []) if (allOffers(rb.camp, rb.state).find((o) => o.id === id)?.available) {
      rec.days[d].purchases.push(id);
      rb = rebuildCampaign(rec);
    }
    rec.days[d].done = true;
  }
}
writeFileSync(out, JSON.stringify({ record: rec, draft: null, savedAt: '' }));
console.log('phase', rebuildCampaign(rec).phase);
