/**
 * Upgrades and new people as picture cards: a picture, a name and a price.
 * Only what can be bought now is shown (design rules 6 and 8).
 */
import { useEffect, useRef } from 'react';
import { CONFIG } from '../sim/config';
import { pounds } from '../sim/engine';
import { allOffers, hireCandidates, teamLimit, type CampaignState, type UpgradeId } from '../sim/campaign';
import type { Person, Speciality } from '../sim/types';
import { EquipArt, Person as Portrait, type EquipId } from './Illustrations';

const EQUIP_NAME: Record<EquipId, string> = {
  till3: 'Third till',
  shelfProduce: 'More fruit',
  shelfAmbient: 'Third aisle',
  chilled: 'Chilled fridges',
  shelfChilled: 'More fridges',
  fridge: 'Better fridges',
  breakRoom: 'Comfy break room',
};

/** One word for what a person is good at. */
export const HIRE_WORD: Record<Speciality, string> = {
  checkout: 'Speedy',
  calm: 'Calm',
  produce: 'Fruity',
  chilled: 'Chilly',
  stamina: 'Tireless',
  receiving: 'Strong',
  none: 'Keen',
};

/** Equipment the shop can buy now (fridges no longer break, so better ones are not offered). */
export function equipmentOnSale(camp: CampaignState): { id: EquipId; cost: number }[] {
  return allOffers(camp)
    .filter((o) => !o.id.startsWith('hire:') && o.id !== 'fridge' && o.available)
    .map((o) => ({ id: o.id as EquipId, cost: o.cost }));
}

/** People who can be hired now. */
export function hiresOnSale(camp: CampaignState): Person[] {
  if (camp.staff.length >= teamLimit(camp) || camp.cash < CONFIG.hiring.hireCost) return [];
  return hireCandidates(camp);
}

export function anythingOnSale(camp: CampaignState): boolean {
  return equipmentOnSale(camp).length > 0 || hiresOnSale(camp).length > 0;
}

/** Cards for people looking for work; choosing one hires them. */
export function HireCards({ people, onHire }: { people: Person[]; onHire: (p: Person) => void }) {
  return (
    <ul className="pick-cards">
      {people.map((p) => (
        <li key={p.id}>
          <button type="button" className="pick-card" onClick={() => onHire(p)} aria-label={`Hire ${p.name}, ${HIRE_WORD[p.speciality]}, ${pounds(CONFIG.hiring.hireCost)}`}>
            <Portrait id={p.id} look={p.look} w={84} h={96} scale={1.8} />
            <strong>{p.name}</strong>
            <span className="pick-word">{HIRE_WORD[p.speciality]}</span>
            <span className="pick-price">{pounds(CONFIG.hiring.hireCost)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The upgrades sheet, before opening: anything bought appears in the shop at once. */
export function UpgradeSheet({ camp, onBuy, onClose }: { camp: CampaignState; onBuy: (id: UpgradeId) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const equipment = equipmentOnSale(camp);
  const people = hiresOnSale(camp);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.pick-card, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2 id="sheet-title">Upgrades</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {equipment.length === 0 && people.length === 0 && <p className="sheet-empty">Save up for more!</p>}
        {equipment.length > 0 && (
          <ul className="pick-cards">
            {equipment.map((o) => (
              <li key={o.id}>
                <button type="button" className="pick-card" onClick={() => onBuy(o.id)} aria-label={`Buy ${EQUIP_NAME[o.id]}, ${pounds(o.cost)}`}>
                  <EquipArt id={o.id} after w={150} h={92} />
                  <strong>{EQUIP_NAME[o.id]}</strong>
                  <span className="pick-price">{pounds(o.cost)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {people.length > 0 && (
          <>
            <h3 className="sheet-sub">New people</h3>
            <HireCards people={people} onHire={(p) => onBuy(`hire:${p.id}`)} />
          </>
        )}
      </div>
    </div>
  );
}
