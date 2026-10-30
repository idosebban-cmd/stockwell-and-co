/**
 * Before the chilled department is bought, nothing in the shop involves it:
 * no shopper browses (or is drawn in) the empty chilled strip, no basket holds
 * chilled, and no floor job or question mentions it.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG, DEPTS, deptName } from './config';
import { finishDay, newCampaign, recommendOrder, startCampaignDay } from './campaign';
import { playLiveDay, sensible } from './bots';
import { describeEvent } from './live';
import { helpItem, taskText } from './floor';
import { inChilledArea, liveBrowsing, shopperFigures } from '../ui/shopperLayout';
import * as S from './stock';

describe('chilled stays out of the shop until it is bought', () => {
  it('Sunday to Tuesday: no shopper targets the chilled area and no "?", help job or question refers to chilled', () => {
    const chilledWords = [deptName('chilled').toLowerCase(), 'chilled', ...CONFIG.floor.tasks.helpItems.chilled];
    const mentions = (text: string) => chilledWords.some((w) => text.toLowerCase().includes(w.toLowerCase()));
    for (const seed of [1, 2, 3, 4]) {
      let camp = newCampaign(seed);
      for (let day = 0; day < 3; day++) {
        const problems: string[] = [];
        const start = startCampaignDay(camp, recommendOrder(camp));
        expect(start.ctx.depts).not.toContain('chilled');
        const state = playLiveDay(start, sensible, (live) => {
          const st = live.state;
          const at = `day ${day} ${st.hour}:${st.step}`;
          // Shoppers drawn in the aisles: the same positions the shop draws, with every department marked empty
          // (the case that used to put a puzzled shopper in the chilled strip).
          for (const f of shopperFigures(Math.max(liveBrowsing(st), 20), st.ctx.depts, DEPTS)) {
            if (f.dept === 'chilled' || inChilledArea(f.x, f.y)) problems.push(`${at}: shopper in the chilled area`);
          }
          // Baskets and the queue.
          if (S.total(st.queue.baskets.chilled) > 0) problems.push(`${at}: chilled in a basket`);
          // Floor jobs.
          for (const t of st.floor?.tasks ?? []) {
            if (t.place === 'chilled') problems.push(`${at}: floor job in chilled`);
            if (t.kind === 'help' && mentions(helpItem(t))) problems.push(`${at}: help job looking for ${helpItem(t)}`);
            if (mentions(taskText(t, 0))) problems.push(`${at}: job label "${taskText(t, 0)}"`);
          }
          // Questions.
          const ev = st.floor?.pending;
          if (ev) {
            const card = describeEvent(st, ev);
            if (ev.dept === 'chilled' || mentions(`${card.title} ${card.text} ${card.options.map((o) => `${o.label} ${o.effect}`).join(' ')}`)) problems.push(`${at}: question about chilled`);
          }
        });
        // Nobody wanted, picked or was sold chilled all day.
        for (const r of state.history) expect(r.dept.chilled.wanted + r.dept.chilled.picked + r.dept.chilled.sold).toBe(0);
        // Every floor job of the day (including ones still to come) stayed out of chilled.
        for (const t of [...start.floor!.schedule, ...state.floor!.tasks]) expect(t.place).not.toBe('chilled');
        expect(problems).toEqual([]);
        camp = finishDay(camp, state).camp;
      }
    }
  });
  it('the browsing shoppers are only ever placed in departments the shop has', () => {
    const figs = shopperFigures(30, ['produce', 'ambient'], ['produce', 'chilled', 'ambient']);
    expect(figs.length).toBeGreaterThan(0);
    expect(figs.every((f) => f.dept !== 'chilled' && !inChilledArea(f.x, f.y))).toBe(true);
    // With chilled open, some do browse it.
    expect(shopperFigures(30, ['produce', 'chilled', 'ambient'], []).some((f) => f.dept === 'chilled')).toBe(true);
  });
});
