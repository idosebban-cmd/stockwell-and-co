/** Campaign balance report: whole weeks with different investment strategies. Run with `npm run campaign`. */
import { playCampaign, planInvest, saver, sensible, passive, noBreaks, type InvestPolicy } from '../src/sim/bots';
import { campaignGoal, businessValue } from '../src/sim/campaign';
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
for (const [name, inv] of Object.entries(strategies)) {
  console.log(`\n== ${name}`);
  for (const seed of seeds) {
    const w = playCampaign(seed, play, inv);
    const g = campaignGoal(w.camp);
    const line = w.days.map((d) => `${weekdayName(d.result.day, true)} ${Math.round(d.result.profit)}${d.result.met ? '✓' : '✗'}${d.result.walkouts >= 1 ? `/w${Math.round(d.result.walkouts)}` : ''}${d.bought.length ? `[${d.bought.join(',')}]` : ''}`).join(' ');
    console.log(`seed ${seed}: ${line}`);
    console.log(`   value ${Math.round(g.value)} / ${Math.round(g.target)} (start ${Math.round(w.camp.startValue)}) rep ${g.reputation.toFixed(1)} wb ${g.wellbeing.toFixed(1)} cash ${Math.round(w.camp.cash)} inv ${Math.round(businessValue(w.camp).inventory)} ${g.met.value && g.met.reputation && g.met.wellbeing ? 'WIN' : 'miss'}${w.camp.failed ? ' FAILED' : ''}`);
  }
}
