/**
 * People: the starting team, the old regulars (Bev, Tomasz, Dougie) and new
 * candidates generated for each morning's hiring pool. Pure and seeded.
 */
import { CONFIG } from './config';
import { mulberry32 } from './rng';
import { ROSTER, type RosterEntry } from './roster';
import type { Person, PersonLook, SkillJob, Speciality, StaffMember, TraitId } from './types';

const H = CONFIG.hiring;
export const TRAITS = Object.keys(CONFIG.traits) as TraitId[];

/** Fixed traits for the original six. */
const ROSTER_TRAITS: Record<string, TraitId[]> = {
  priya: ['morningPerson'],
  kwame: ['tidy'],
  mags: ['steady'],
  bev: ['chatty'],
  tomasz: ['nightOwl'],
  dougie: ['dislikesStockroom'],
};

/** Strength in a few words, by speciality. */
export const STRENGTH: Record<Speciality, string> = {
  checkout: 'Fast on the till',
  calm: 'Keeps queues calm',
  produce: 'Knows fruit & veg',
  chilled: 'Knows the chillers',
  stamina: 'Never seems to tire',
  receiving: 'Quick unloader',
  none: 'Willing learner',
};

/** Starting skill levels (1–5): their strength's job at 3, the rest at 1 or 2. */
export function startingSkills(speciality: Speciality, rng: () => number = () => 0.5): Record<SkillJob, number> {
  const base = (): number => (rng() < 0.5 ? 1 : 2);
  const s: Record<SkillJob, number> = { tills: base(), shelves: base(), unloading: base(), floor: base() };
  if (speciality === 'checkout' || speciality === 'calm') s.tills = 3;
  if (speciality === 'produce' || speciality === 'chilled') s.shelves = 3;
  if (speciality === 'receiving') s.unloading = 3;
  if (speciality === 'stamina') s.floor = 3;
  return s;
}

export function personFromRoster(r: RosterEntry): Person {
  return {
    id: r.id,
    name: r.name,
    speciality: r.speciality,
    traits: ROSTER_TRAITS[r.id] ?? [],
    skills: startingSkills(r.speciality),
    wage: CONFIG.wagePerHour,
    startEnergy: r.startEnergy,
    bio: r.bio,
  };
}

const SKINS = ['#f1c7a5', '#d9a27c', '#a8724a', '#6b4428', '#e8b48f', '#c48b62', '#5e3b24'];
const HAIRS = ['#2b1d14', '#6b4a2f', '#c9c4bc', '#b9551f', '#16100c', '#d8b25a', '#3b2a1e'];
const STYLES: PersonLook['style'][] = ['ponytail', 'perm', 'short', 'messy', 'bun', 'beanie'];
const SPECIALITIES: Speciality[] = ['checkout', 'calm', 'produce', 'chilled', 'stamina', 'receiving'];
const BIOS = [
  'Worked Saturdays at the bakery for years.',
  'Between college terms and keen for hours.',
  'Used to run a market stall. Can shout prices.',
  'Retired early, bored already.',
  'Knows everyone on the high street by name.',
  'Moved here last month. Very punctual.',
  'Sings while stacking. Quietly.',
];

function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length) % xs.length];
}

function round2(x: number): number {
  return Math.round(x * 20) / 20;
}

/** A new candidate. */
function newPerson(rng: () => number, id: string, name: string): Person {
  const speciality = pick(rng, SPECIALITIES);
  const first = pick(rng, TRAITS);
  const traits: TraitId[] = [first];
  if (rng() < 0.5) {
    const second = pick(rng, TRAITS.filter((t) => t !== first && !(first === 'morningPerson' && t === 'nightOwl') && !(first === 'nightOwl' && t === 'morningPerson')));
    traits.push(second);
  }
  const wage = round2(H.wage.min + rng() * (H.wage.max - H.wage.min) + (speciality === 'checkout' || speciality === 'receiving' ? H.wage.specialistPremium : 0));
  const look: PersonLook = { skin: pick(rng, SKINS), hair: pick(rng, HAIRS), style: pick(rng, STYLES), glasses: rng() < 0.25 };
  if ((look.style === 'short' || look.style === 'messy') && rng() < 0.4) look.beard = look.hair;
  return { id, name, speciality, traits, skills: startingSkills(speciality, rng), wage, look, startEnergy: 95 + Math.floor(rng() * 6), bio: pick(rng, BIOS) };
}

/** How many candidates there are at this reputation. */
export function poolSize(reputation: number): number {
  return Math.max(H.poolSize, Math.min(H.poolMax, H.poolSize + Math.floor(Math.max(0, reputation - H.poolFrom) / H.poolPerReputation)));
}

/**
 * The morning's candidates: some of the old regulars who aren't on the team,
 * and new people. Fixed for the day (seed and day), never anyone already in `taken`.
 */
export function candidatePool(seed: number, day: number, reputation: number, taken: readonly string[]): Person[] {
  const rng = mulberry32(seed * 4241 + day * 977 + 5);
  const out: Person[] = [];
  for (const id of CONFIG.campaign.hireable) {
    const r = ROSTER.find((x) => x.id === id);
    const roll = rng();
    if (r && !taken.includes(id) && roll < H.regularChance) out.push(personFromRoster(r));
  }
  const n = poolSize(reputation);
  // Always at least one new face.
  out.splice(n - 1);
  const usedNames = new Set(ROSTER.map((r) => r.name));
  let k = 0;
  while (out.length < n && k < 50) {
    const name = pick(rng, H.names);
    const id = `p${day}-${k++}`;
    if (usedNames.has(name) || taken.includes(id)) continue;
    usedNames.add(name);
    out.push(newPerson(rng, id, name));
  }
  return out.slice(0, n);
}

/** A person ready for a day's work. */
export function staffFromPerson(p: Person, opts: { availableFrom?: number; newcomer?: boolean; energy?: number } = {}): StaffMember {
  return {
    id: p.id,
    name: p.name,
    speciality: p.speciality,
    energy: opts.energy ?? p.startEnergy,
    strain: 0,
    consecutive: 0,
    breaks: 0,
    hoursWorked: 0,
    isTemp: false,
    availableFrom: opts.availableFrom ?? 0,
    lastAssignment: 'tills',
    stepsWorked: 0,
    stepsRested: 0,
    traits: [...p.traits],
    skills: { ...p.skills },
    wage: p.wage,
    look: p.look,
    newcomer: opts.newcomer ?? false,
  };
}
