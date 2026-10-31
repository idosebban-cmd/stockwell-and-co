/** Your shop before opening: the morning's stock is already in. One button opens the doors. */
import { useMemo } from 'react';
import { defaultPlan, weekdayName } from '../sim/engine';
import { recommendOrder, startCampaignDay, type CampaignState } from '../sim/campaign';
import type { SetupPlan } from '../sim/types';
import { ShopScreen } from './ShopScreen';

export function MorningScreen({ camp, onOpen, reduced, onUpgrades }: { camp: CampaignState; onOpen: (s: SetupPlan) => void; reduced: boolean; onUpgrades: () => void }) {
  const order = useMemo(() => recommendOrder(camp), [camp]);
  const preview = useMemo(() => startCampaignDay(camp, order), [camp, order]);
  const plan = useMemo(() => defaultPlan(preview), [preview]);
  return (
    <ShopScreen
      state={preview}
      plan={plan}
      live={false}
      reduced={reduced}
      interactive={false}
      onExpand={onUpgrades}
      primary={{ label: 'Open the shop ▶', onClick: () => onOpen(order) }}
      panel={() => (
        <div className="panel-inner briefing">
          <h2 className="morning-day">{weekdayName(camp.day)}</h2>
          <p className="morning-line">Stock is in!</p>
        </div>
      )}
    />
  );
}
