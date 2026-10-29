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

export type PriceTier = 'low' | 'regular' | 'high';
export type ChilledLife = 'short' | 'long';
export const PRICE_TIERS: readonly PriceTier[] = ['low', 'regular', 'high'] as const;

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
      /** Price elasticity: a 10% price change moves the items wanted by about this × 10%. Loose fruit and veg: shoppers notice, but compare less than branded goods. */
      priceElasticity: 2.2,
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
      /** Price elasticity: a 10% price change moves the items wanted by about this × 10%. Own-label chilled: similar. */
      priceElasticity: 2.2,
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
      /** Price elasticity: a 10% price change moves the items wanted by about this × 10%. Branded tins and packets: the easiest prices to compare with the supermarket up the road. */
      priceElasticity: 2.7,
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
   * Explicit dates. Stock is dated "use by <day>"; it expires at `useByHour`
   * (17:00) that day, or when the shop closes if that is earlier, so stock
   * past its date before the next opening is binned at closing. Times are hours
   * from today's opening; every day opens at 09:00, 24 hours after the last.
   */
  calendar: { hoursPerDay: 24, useByHour: 8 },
  /** Days a delivery keeps, counting the day it arrives as 0 (null: keeps). Chilled uses `chilledLife`. */
  shelfLife: { produce: 3, chilled: 3, ambient: null } satisfies Record<DeptId, number | null>,
  shelfLabels: { produce: 'Fresh produce', chilled: 'Chilled', ambient: 'Tins & packets' } satisfies Record<DeptId, string>,

  /**
   * Chilled deliveries come in two shelf lives, chosen per delivery: "use by
   * today" (cheaper; whatever doesn't sell is binned at closing) or longer-life
   * (dearer, keeps three more days). `departments.chilled.unitCost` is the
   * reference cost used for margin estimates and emergency orders.
   */
  chilledLife: {
    short: { name: 'Short-dated', label: 'Use by today', days: 0, unitCost: 1.35 },
    long: { name: 'Longer-life', label: 'Keeps 3 more days', days: 3, unitCost: 1.55 },
  } satisfies Record<ChilledLife, { name: string; label: string; days: number; unitCost: number }>,

  /** Opening order. Morning stock is put away by the night crew. */
  openingOrder: {
    /** The midday delivery reaches the dock at 12:00 (hour 3). */
    middayHour: 3,
    recommended: {
      produce: { morning: 740, midday: 660 },
      chilled: { morning: 580, midday: 480 },
      ambient: { morning: 1000, midday: 200 },
    } satisfies Record<DeptId, { morning: number; midday: number }>,
    /** Morning chilled sells today; afternoon chilled may be left over, so it keeps. */
    recommendedChilledLife: { morning: 'short', midday: 'long' } satisfies Record<'morning' | 'midday', ChilledLife>,
    maxMidday: 1500,
  },

  /**
   * Department price levels. Product quality is the same at every level.
   * Items wanted respond to price through each department's `priceElasticity`
   * (a nearby competitor is a short walk away), so at ordinary stock levels the
   * regular price is close to the best gross profit; with short stock the high
   * price earns more, and with stock that would otherwise be binned the low one. `tripMult` is the whole-shop effect:
   * shoppers who find one department cheap do a little more of the rest of
   * their shop here (and a little less when it is dear). Bigger baskets take
   * longer to scan (see `checkout`).
   */
  pricing: {
    low: { priceMult: 0.9, tripMult: 1.04, satisfaction: 4, label: 'Low price', short: 'Low' },
    regular: { priceMult: 1, tripMult: 1, satisfaction: 0, label: 'Regular price', short: 'Regular' },
    high: { priceMult: 1.1, tripMult: 0.97, satisfaction: -5, label: 'High price', short: 'High' },
  } satisfies Record<PriceTier, { priceMult: number; tripMult: number; satisfaction: number; label: string; short: string }>,

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
    /** Customers served per hour by one person at full energy, with an ordinary basket. */
    customersPerHour: 30,
    /**
     * Time at the till: a fixed part (greeting, paying) plus scanning and
     * bagging per item. With the ordinary basket (10 items) this is 2 minutes,
     * i.e. `customersPerHour`. Fuller baskets slow the tills; emptier ones speed them up.
     */
    serviceFixedMinutes: 0.75,
    servicePerItemMinutes: 0.125,
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

  /**
   * The seven-day campaign: Sunday to Saturday in the same shop. Provisional
   * values, balanced with scripted players (scripts/campaign.ts); see README.
   */
  campaign: {
    startCash: 1200,
    /** The three regulars at the start; the others can be hired, in any order. */
    startStaff: ['priya', 'kwame', 'mags'],
    hireable: ['bev', 'tomasz', 'dougie'],
    startDepts: ['produce', 'ambient'] as DeptId[],
    startTills: 2,
    /** Stock in the shop on Sunday morning. `days`: days it still keeps (null: keeps). */
    startStock: {
      produce: [{ qty: 150, days: 1, where: 'shelf' }],
      chilled: [],
      ambient: [
        { qty: 380, days: null, where: 'shelf' },
        { qty: 220, days: null, where: 'backroom' },
      ],
    } as Record<DeptId, { qty: number; days: number | null; where: 'shelf' | 'backroom' }[]>,
    /** A modest shop: two-thirds of the Saturday shelving until it is extended. */
    shelf: { produce: 200, chilled: 130, ambient: 400 } as Record<DeptId, number>,
    backroom: { produce: 400, chilled: 300, ambient: 800 } as Record<DeptId, number>,
    /** Day costs: rent and rates per day, energy and the like per trading hour. */
    rentPerDay: 90,
    costsPerHour: 14,
    /** Reputation: the week's customer opinion. Each day moves it part-way to that day's satisfaction. */
    reputation: { start: 70, pull: 0.4, pivot: 72, perPoint: 0.006, min: 0.88, max: 1.12 },
    /** Overnight rest restores energy, but part of the day's strain carries over and lowers the next morning's energy. */
    fatigue: { carry: 0.4, energyPerStrain: 0.8, maxEnergyLoss: 25 },
    overnight: { produceShrink: 0.03 },
    /** The bank lets cash go this far below zero (counted as debt); beyond it the campaign ends. */
    overdraftLimit: 500,
    /** Recommended orders keep this many hours of wages and costs back (the rest is paid from takings). */
    orderReserveHours: 1,
    /** Finish Saturday with business value this much above the start, reputation and team wellbeing at least these. */
    objective: { growth: 1500, reputation: 65, wellbeing: 60 },
    days: [
      {
        name: 'Sunday',
        hours: 4,
        forecast: [16, 24, 28, 22],
        middayHour: null,
        pricing: false,
        actions: [],
        profitTarget: 20,
        intro: 'First day in charge. Keep a till open, keep the shelves filled from the stockroom, and give everyone a break.',
        events: [],
      },
      {
        name: 'Monday',
        hours: 5,
        forecast: [20, 28, 34, 32, 24],
        middayHour: 2,
        pricing: false,
        actions: ['emergency'],
        profitTarget: 60,
        intro: 'New today: a midday delivery arrives at 11:00. Someone has to unload it on the dock before the shelves can be filled from it.',
        events: [],
      },
      {
        name: 'Tuesday',
        hours: 6,
        forecast: [22, 30, 38, 40, 32, 26],
        middayHour: 3,
        pricing: true,
        actions: ['emergency', 'markdown', 'promotion'],
        profitTarget: 110,
        intro: 'New today: you can set each department’s price. Click a department, then Change prices.',
        events: [],
      },
      {
        name: 'Wednesday',
        hours: 6,
        forecast: [40, 48, 40, 32, 26, 24],
        middayHour: 3,
        pricing: true,
        actions: ['emergency', 'markdown', 'promotion', 'temp', 'repair'],
        profitTarget: 140,
        intro: 'Market day: busiest first thing, quieter after lunch.',
        events: [{ kind: 'delayedDelivery', hour: 3, warnAt: 1 }],
      },
      {
        name: 'Thursday',
        hours: 7,
        forecast: [24, 30, 36, 42, 36, 46, 54],
        middayHour: 3,
        pricing: true,
        actions: ['emergency', 'markdown', 'promotion', 'temp', 'repair'],
        profitTarget: 170,
        intro: 'Late opening: the after-work crowd arrives from 14:00.',
        events: [{ kind: 'rush', hour: 6, warnAt: 4 }],
      },
      {
        name: 'Friday',
        hours: 7,
        forecast: [30, 40, 50, 58, 52, 48, 46],
        middayHour: 3,
        pricing: true,
        actions: ['emergency', 'markdown', 'promotion', 'temp', 'repair'],
        profitTarget: 220,
        intro: 'Payday: steady and busy all day.',
        /** Only if the shop has chilled cabinets without the refrigeration upgrade; announced at opening. */
        events: [{ kind: 'fridgeFault', hour: 2, warnAt: 0 }],
      },
      {
        name: 'Saturday',
        hours: 8,
        forecast: [35, 48, 62, 75, 72, 58, 50, 40],
        middayHour: 3,
        pricing: true,
        actions: ['emergency', 'markdown', 'promotion', 'temp', 'repair'],
        profitTarget: 320,
        intro: 'Saturday: the busiest day of the week, and the end of your first week.',
        events: [{ kind: 'rush', hour: 5, warnAt: 3 }],
      },
    ] as CampaignDayConfig[],
    /**
     * Permanent improvements. `cost` is paid between days. Equipment counts in
     * business value at purchase cost; a hire's induction fee is an expense.
     * `perDay` is a running cost added to that day's costs.
     */
    upgrades: {
      till3: { name: 'Third till', cost: 450, perDay: 0, from: 0, equipment: true },
      shelfProduce: { name: 'More fruit & veg display', cost: 280, perDay: 0, from: 0, equipment: true, extra: 100 },
      shelfAmbient: { name: 'Third grocery aisle', cost: 320, perDay: 0, from: 0, equipment: true, extra: 200 },
      chilled: { name: 'Chilled department', cost: 850, perDay: 18, from: 2, equipment: true },
      shelfChilled: { name: 'Two more chilled cabinets', cost: 350, perDay: 6, from: 2, equipment: true, extra: 130 },
      fridge: { name: 'Better refrigeration', cost: 300, perDay: 0, from: 2, equipment: true },
      hire: { name: 'Hire', cost: 60, perDay: 0, from: 0, equipment: false },
    },
    /** Better refrigeration: no cabinet faults, and chilled on the dock spoils this much as fast. */
    fridgeDockSpoilMult: 0.5,
  },
} as const;

export interface CampaignDayConfig {
  name: string;
  hours: number;
  /** Customers per hour before reputation. */
  forecast: number[];
  middayHour: number | null;
  pricing: boolean;
  actions: ('markdown' | 'promotion' | 'emergency' | 'temp' | 'repair')[];
  /** The day's objective: operating profit of at least this. */
  profitTarget: number;
  /** One line shown at opening; introduces whatever is new today. */
  intro: string;
  events: { kind: 'rush' | 'delayedDelivery' | 'fridgeFault'; hour: number; warnAt: number }[];
}

export interface DeptConfig {
  name: string;
  short: string;
  unitCost: number;
  standardPrice: number;
  priceElasticity: number;
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
