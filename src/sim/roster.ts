import { CONFIG } from './config';
import type { AssignmentId, Speciality, StaffMember } from './types';

export interface RosterEntry {
  id: string;
  name: string;
  speciality: Speciality;
  startEnergy: number;
  bio: string;
}

export const ROSTER: readonly RosterEntry[] = [
  { id: 'priya', name: 'Priya', speciality: 'checkout', startEnergy: 100, bio: 'Scans faster than the barcode can be printed.' },
  { id: 'bev', name: 'Bev', speciality: 'calm', startEnergy: 100, bio: 'Thirty years on tills. Queues relax in her presence.' },
  { id: 'kwame', name: 'Kwame', speciality: 'produce', startEnergy: 100, bio: 'Can stack a pyramid of satsumas that survives a toddler.' },
  { id: 'dougie', name: 'Dougie', speciality: 'chilled', startEnergy: 85, bio: 'Knows the chiller layout by heart. Was at a ceilidh last night.' },
  { id: 'mags', name: 'Mags', speciality: 'stamina', startEnergy: 100, bio: 'Has never, to anyone’s knowledge, sat down.' },
  { id: 'tomasz', name: 'Tomasz', speciality: 'receiving', startEnergy: 100, bio: 'Unloads a pallet like it owes him money.' },
];

export const TEMP_ENTRY: RosterEntry = {
  id: 'temp',
  name: 'Agency temp',
  speciality: 'none',
  startEnergy: 100,
  bio: 'Keen. Not yet sure where the tinned tomatoes live.',
};

export const SPECIALITY_TEXT: Record<Speciality, string> = {
  checkout: `Quick on tills (+${pct(CONFIG.staff.specialityBonus)} checkout speed)`,
  calm: `Calming on tills (queuers wait ${CONFIG.staff.calmPatienceMinutes} min longer before leaving)`,
  produce: `Fruit & veg know-how (+${pct(CONFIG.staff.specialityBonus)} replenishing fruit & veg)`,
  chilled: `Chiller know-how (+${pct(CONFIG.staff.specialityBonus)} replenishing chilled)`,
  stamina: `Stamina (tires ${pct(1 - CONFIG.staff.staminaDrain)} more slowly)`,
  receiving: `Strong on deliveries (+${pct(CONFIG.staff.specialityBonus)} receiving)`,
  none: `New here (${pct(1 - CONFIG.actions.temp.productivity)} slower at everything)`,
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function makeStaff(entry: RosterEntry, availableFrom = 0, isTemp = false): StaffMember {
  return {
    id: entry.id,
    name: entry.name,
    speciality: entry.speciality,
    energy: entry.startEnergy,
    strain: 0,
    consecutive: 0,
    breaks: 0,
    hoursWorked: 0,
    isTemp,
    availableFrom,
    lastAssignment: DEFAULT_ASSIGNMENTS[entry.id] ?? 'replenish:ambient',
    stepsWorked: 0,
    stepsRested: 0,
  };
}

/** A reasonable opening allocation for 09:00. */
export const DEFAULT_ASSIGNMENTS: Record<string, AssignmentId> = {
  priya: 'tills',
  bev: 'tills',
  kwame: 'replenish:produce',
  dougie: 'replenish:chilled',
  mags: 'replenish:ambient',
  tomasz: 'replenish:ambient',
  temp: 'tills',
};

export const ASSIGNMENT_LABEL: Record<AssignmentId, string> = {
  tills: 'Serve customers',
  'replenish:produce': 'Fill produce shelves',
  'replenish:chilled': 'Fill chilled shelves',
  'replenish:ambient': 'Fill grocery shelves',
  receive: 'Unload delivery',
  break: 'Take a break',
};

/** "Mags will unload deliveries next hour." */
export const ASSIGNMENT_FUTURE: Record<AssignmentId, string> = {
  tills: 'serve customers',
  'replenish:produce': 'fill the produce shelves',
  'replenish:chilled': 'fill the chilled shelves',
  'replenish:ambient': 'fill the grocery shelves',
  receive: 'unload deliveries',
  break: 'take a break',
};
