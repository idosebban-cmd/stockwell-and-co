/** Campaign balance report: the first weeks with different investment strategies. Run with `npm run campaign [seeds] [passive|nobreaks] [days]`. */
import { playCampaign, planInvest, saver, sensible, passive, noBreaks, type InvestPolicy } from '../src/sim/bots';
import { businessValue, recommendOrder, teamWellbeing } from '../src/sim/campaign';
import { weekdayName } from '../src/sim/engine';

const strategies: Record<string, InvestPolicy> = {
  saver,
  staff: planInvest({ 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] }),
  chilled: planInvest({ 2: ['chilled'], 3: ['hire:dougie'], 4: ['fridge'] }),
  shelves: planInvest({ 0: ['shelfProduce'], 1: ['shelfAmbient'], 2: ['hire:bev'] }),
  balanced: planInvest({ 0: ['hire:bev'], 2: ['chilled'], 3: ['till3'], 4: ['hire:dougie'] }),
};
const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number);
const play = process.argv[3] === 'passive' ? passive : process.argv[3] === 'nobreaks' ? noBreaks : sensible;
const days = Number(process.argv[4] ?? 7);
for (const [name, inv] of Object.entries(strategies)) {
  console.log(`\n== ${name}`);
  for (const seed of seeds) {
    const w = playCampaign(seed, play, inv, recommendOrder, days);
    const line = w.days.map((d) => `${weekdayName(d.result.day, true)} ${Math.round(d.result.profit)}${d.result.walkouts >= 1 ? `/w${Math.round(d.result.walkouts)}` : ''}${d.bought.length ? `[${d.bought.join(',')}]` : ''}`).join(' ');
    const v = businessValue(w.camp);
    console.log(`seed ${seed}: ${line}`);
    console.log(`   value ${Math.round(v.total)} (start ${Math.round(w.camp.startValue)}) rep ${w.camp.reputation.toFixed(1)} wb ${teamWellbeing(w.camp.staff).toFixed(1)} cash ${Math.round(w.camp.cash)} owed ${Math.round(w.camp.credit)} inv ${Math.round(v.inventory)}`);
  }
}
