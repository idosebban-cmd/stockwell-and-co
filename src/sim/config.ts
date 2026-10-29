/**
 * Stockwell & Co — balancing parameters.
 *
 * Every tunable number in the simulation lives here. Values are provisional
 * and were chosen to make one Saturday feel tight but recoverable:
 *
 * - ~440 customers across eight hours, peaking at 13:00–14:00.
 * - A sensible plan makes roughly £1,050–1,250 operating profit; the target
 *   is £800. Neglecting tills, replenishment or breaks should miss at least
 *   one target.
 * - Units are "items" of one aggregate product per department.
 * - Money is pounds sterling. Time is hours from opening (0 = 09:00).
 */

export type DeptId = 'produce' | 'chilled' | 'ambient';
export const DEPTS: readonly DeptId[] = ['produce', 'chilled', 'ambient'] as const;

export type PriceTier = 'value' | 'standard' | 'premium';
export const PRICE_TIERS: readonly PriceTier[] = ['value', 'standard', 'premium'] as const;

export const CONFIG = {
  /** Shop opens at 09:00 and closes at 17:00: eight hourly turns. */
  openingHour: 9,
  hours: 8,
  /** Internal sub-steps per hour (10 minutes each). Not shown to the player. */
  stepsPerHour: 6,

  startingCash: 3600,

  targets: {
    operatingProfit: 800,
    satisfaction: 70,
    wellbeing: 60,
  },

  /** Wages and fixed costs. */
  wagePerHour: 12.6,
  /** Rent, rates, energy and the like, accrued evenly across the day. */
  overheadPerDay: 680,

  departments: {
    produce: {
      name: 'Fruit & veg',
      short: 'Fruit & veg',
      unitCost: 0.52,
      standardPrice: 0.95,
      /** Average items wanted per customer at standard price. */
      basket: 3.5,
      shelfCapacity: 300,
      backroomCapacity: 600,
      /** Items each replenisher can move to shelf per hour at full energy. */
      replenishRate: 280,
      /** Share of displayed stock lost per hour to handling and bruising. */
      shelfShrinkPerHour: 0.015,
      /** Share lost per hour while left on the delivery dock. */
      dockSpoilPerHour: 0.03,
      /** Share of items left in abandoned baskets that must be binned. */
      abandonedBinShare: 0.1,
      perishable: true,
    },
    chilled: {
      name: 'Chilled food',
      short: 'Chilled',
      unitCost: 1.45,
      standardPrice: 2.4,
      basket: 2.5,
      shelfCapacity: 260,
      backroomCapacity: 450,
      replenishRate: 260,
      shelfShrinkPerHour: 0,
      dockSpoilPerHour: 0.08,
      abandonedBinShare: 0.3,
      perishable: true,
    },
    ambient: {
      name: 'Cupboard essentials',
      short: 'Cupboard',
      unitCost: 0.82,
      standardPrice: 1.35,
      basket: 4,
      shelfCapacity: 600,
      backroomCapacity: 1200,
      replenishRate: 400,
      shelfShrinkPerHour: 0,
      dockSpoilPerHour: 0,
      abandonedBinShare: 0,
      perishable: false,
    },
  } satisfies Record<DeptId, DeptConfig>,

  /** Stock carried over from Friday. `expiresAt` is hours from opening. */
  carriedStock: {
    produce: [{ qty: 120, label: "Friday's produce", expiresAt: 4, where: 'shelf' }],
    chilled: [{ qty: 90, label: 'Use by today', expiresAt: 8, where: 'shelf' }],
    ambient: [
      { qty: 400, label: 'Tins & packets', expiresAt: null, where: 'shelf' },
      { qty: 300, label: 'Tins & packets', expiresAt: null, where: 'backroom' },
    ],
  } satisfies Record<DeptId, CarriedBatch[]>,

  /**
   * What a delivery looks like. Chilled arrives with mixed dates: the store is
   * closed on Sunday, so "use by Sunday" stock is binned at close.
   */
  deliveryDating: {
    produce: [{ share: 1, label: 'Fresh produce', expiresAt: null }],
    chilled: [
      { share: 0.6, label: 'Use by Sunday', expiresAt: 8 },
      { share: 0.4, label: 'Use by Wednesday', expiresAt: null },
    ],
    ambient: [{ share: 1, label: 'Tins & packets', expiresAt: null }],
  } satisfies Record<DeptId, DatingShare[]>,

  /** Opening order. Morning stock is put away by the night crew. */
  openingOrder: {
    /** The midday delivery reaches the dock at 12:00 (hour 3). */
    middayHour: 3,
    recommended: {
      produce: { morning: 740, midday: 660 },
      chilled: { morning: 580, midday: 480 },
      ambient: { morning: 1000, midday: 200 },
    } satisfies Record<DeptId, { morning: number; midday: number }>,
    maxMidday: 1500,
  },

  pricing: {
    value: { priceMult: 0.9, demandMult: 1.18, satisfaction: 4, label: 'Value' },
    standard: { priceMult: 1, demandMult: 1, satisfaction: 0, label: 'Standard' },
    premium: { priceMult: 1.1, demandMult: 0.86, satisfaction: -5, label: 'Premium' },
  } satisfies Record<PriceTier, { priceMult: number; demandMult: number; satisfaction: number; label: string }>,

  demand: {
    /** Baseline customers per hour, 09:00 to 16:00 starts (curated Saturday). */
    forecast: [35, 48, 62, 75, 72, 58, 50, 40],
    /** Bounded seeded variation around the forecast. */
    customerNoise: 0.08,
    deptNoise: 0.06,
    /** Footfall responds gently to satisfaction so far, within these bounds. */
    satisfactionFootfall: { pivot: 75, perPoint: 0.004, min: 0.92, max: 1.04 },
    /** Share of items shoppers take from the front (oldest first); the rest reach for the back. */
    rotation: 0.8,
    /** Combined demand multiplier cap per department (stops stacking). */
    maxDeptMult: 1.7,
  },

  checkout: {
    tills: 3,
    /** Customers served per hour by one person at full energy. */
    customersPerHour: 30,
    /** Minimum time at a till, in minutes, even with no queue. */
    baseServiceMinutes: 1,
    /** Customers start leaving once the expected wait exceeds this. */
    patienceMinutes: 6,
    /** Extra share leaving per 10 minutes for each minute over patience. */
    abandonPerMinute: 1 / 25,
    maxAbandonPerStep: 0.5,
  },

  staff: {
    /** Assignment limits (people at once). */
    limits: { tills: 3, replenish: 2, receive: 2, break: 2 },
    receiveRate: 500,
    /** Energy change per hour by job. */
    energy: { tills: -13, replenish: -15, receive: -18, break: 40 },
    /** Below this energy, productivity falls linearly to `minProductivity` at 0. */
    tiredBelow: 50,
    minProductivity: 0.55,
    /** Labels for the energy bands. */
    exhaustedBelow: 25,
    specialityBonus: 0.15,
    /** Extra minutes of queue patience while the calm speciality is on a till. */
    calmPatienceMinutes: 2,
    /** Energy drain multiplier for the stamina speciality. */
    staminaDrain: 0.7,
  },

  wellbeing: {
    /** Strain per hour worked with end-of-hour energy below this. */
    lowEnergyBelow: 40,
    lowEnergyStrainPerPoint: 0.25,
    /** Hours in a row before working without a break starts to strain. */
    hoursBeforeBreakNeeded: 5,
    consecutiveStrainStep: 2.5,
    noBreakAllDayStrain: 12,
    /** Wellbeing = 100 - average strain x this. */
    strainScale: 1.5,
  },

  satisfaction: {
    /** Score for a perfectly ordinary visit. */
    base: 85,
    /** Points lost per 100% of a department's wanted items not found, weighted by basket share. */
    availabilityPenalty: 60,
    /** Points lost per minute of average wait above `waitFreeMinutes`. */
    waitFreeMinutes: 4,
    waitPenaltyPerMinute: 3,
    /** Points lost per 100% of arriving customers who walk out. */
    abandonPenalty: 80,
    markdownBonus: 2,
    promotionBonus: 1,
    /** Satisfaction shown before any customer has visited. */
    initial: 80,
  },

  actions: {
    markdown: {
      /** Markdown price as a share of the standard price. */
      priceMult: 0.65,
      demandMult: 1.5,
      durationHours: 2,
      /** Once per perishable department per day. */
    },
    promotion: {
      cost: 45,
      demandMult: 1.3,
      durationHours: 2,
      maxPerDay: 2,
    },
    emergency: {
      qty: 120,
      costMult: 1.5,
      deliveryFee: 30,
      delayHours: 1,
      maxPerDay: 2,
    },
    temp: {
      bookingFee: 40,
      hourlyFee: 19,
      delayHours: 1,
      /** Must arrive with at least this many hours left. */
      minHoursOnShift: 2,
      productivity: 0.9,
    },
    repair: {
      cost: 140,
      /** Engineer arrives after this many 10-minute steps. */
      arrivalSteps: 3,
    },
  },

  events: {
    rush: { customerMult: 1.35 },
    delayedDelivery: { delayHours: 1 },
    fridgeFault: {
      /** Share of the chilled shelf still usable while broken. */
      capacityShare: 0.5,
      /** Share per hour of stranded stock spoiling in the warm cabinet. */
      spoilPerHour: 0.35,
    },
    maxPerShift: 2,
  },
} as const;

export interface DeptConfig {
  name: string;
  short: string;
  unitCost: number;
  standardPrice: number;
  basket: number;
  shelfCapacity: number;
  backroomCapacity: number;
  replenishRate: number;
  shelfShrinkPerHour: number;
  dockSpoilPerHour: number;
  abandonedBinShare: number;
  perishable: boolean;
}

export interface CarriedBatch {
  qty: number;
  label: string;
  expiresAt: number | null;
  where: 'shelf' | 'backroom';
}

export interface DatingShare {
  share: number;
  label: string;
  expiresAt: number | null;
}

export function deptName(d: DeptId): string {
  return CONFIG.departments[d].name;
}

export function hourLabel(hour: number): string {
  const h = CONFIG.openingHour + hour;
  return `${String(h).padStart(2, '0')}:00`;
}

export function hourRange(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel(hour + 1)}`;
}
