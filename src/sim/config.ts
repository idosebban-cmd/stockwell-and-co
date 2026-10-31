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
  /** Simulation steps per hour: one per in-game minute, so a move takes effect within a minute. */
  stepsPerHour: 60,

  /**
   * The live clock. At 1x one in-game hour takes `secondsPerHour` real
   * seconds; 2x and 3x run the same minutes faster. Space pauses.
   */
  live: {
    secondsPerHour: 60,
    speeds: [1, 2, 3] as number[],
    /** A break ends by itself after this many minutes and the person goes back to their job. */
    breakMinutes: 30,
    /** Autosave at least this often while the clock runs (real seconds). */
    autosaveSeconds: 5,
    /**
     * Routine jobs run themselves: deliveries unload by themselves, people with nothing to fill move to the
     * shelf that needs it most, and tired people take a break one at a time when the shop isn't busy.
     * Checked every `everyMinutes`; the player can move anyone at any time.
     */
    auto: {
      everyMinutes: 5,
      /** A filler moves on when their shelf needs less than this (share of the shelf empty) … */
      doneBelow: 0.1,
      /** … to a shelf that needs at least this much. */
      moveAbove: 0.2,
      /** Go for a break below this energy … */
      breakBelow: 45,
      /** … unless more than this many shoppers wait per open till, or a burst is under way. */
      busyQueuePerTill: 4,
      /** After being called back from a break, no automatic break for this long (minutes). */
      holdMinutes: 60,
    },
  },

  /**
   * Life on the shop floor, on top of the hourly forecast: short bursts of
   * shoppers, small jobs that need a person for a few minutes, and the odd
   * question that pauses the day. Seeded per day, so a saved day replays
   * exactly. Aim: a decision worth making every 30–60 real seconds at 1x
   * (one in-game hour = one real minute). See `npm run pacing`.
   */
  floor: {
    bursts: {
      /** Expected bursts per trading hour, scaled by how busy the hour is relative to `busyAt` customers. */
      perHour: 0.45,
      busyAt: 40,
      maxPerHour: 1,
      minGapMinutes: 30,
      /** Announced at the door this many minutes before the first shopper arrives (about 12 real seconds at 1x). */
      warnMinutes: 12,
      /** Shoppers arrive over this many minutes. */
      minutes: [6, 10] as [number, number],
      /** Extra shoppers as a share of the hour's forecast, at least `minShoppers`. */
      share: [0.12, 0.2] as [number, number],
      minShoppers: 6,
    },
    tasks: {
      /** Expected new jobs per trading hour: a base plus a share per forecast customer. */
      perHour: 0.3,
      perCustomer: 0.005,
      minGapMinutes: 15,
      /** The first job of the day appears within this many minutes of opening, so there's something to do from the start. */
      firstWithinMinutes: 15,
      /** What a shopper needing help is looking for, by department. */
      helpItems: {
        produce: ['fresh ginger', 'ripe avocados', 'spring onions', 'fresh mint'],
        chilled: ['oat milk', 'halloumi', 'fresh pasta', 'crème fraîche'],
        ambient: ['tea bags', 'gravy granules', 'tinned chickpeas', 'birthday candles', 'golden syrup'],
      } as Record<DeptId, string[]>,
      /** Never more than this many open at once (new ones wait). */
      maxOpen: 2,
      /** Satisfaction lost each minute, per open job nobody is on, capped in total. */
      maxPenalty: 12,
      kinds: {
        spill: { label: 'Spill to mop', short: 'Spill', where: ['produce', 'chilled', 'ambient'], work: 3, expires: null, penalty: 5, weight: 3 },
        help: { label: 'Shopper needs help finding something', short: 'Help', where: ['produce', 'chilled', 'ambient'], work: 2, expires: 12, penalty: 4, weight: 3 },
        priceCheck: { label: 'Price check at the till', short: 'Price check', where: ['tills'], work: 1, expires: 8, penalty: 6, weight: 2 },
        pallet: { label: 'Cage blocking the aisle', short: 'Cage in aisle', where: ['ambient', 'chilled', 'produce'], work: 2, expires: null, penalty: 4, weight: 2 },
        baskets: { label: 'Baskets running out at the door', short: 'Baskets', where: ['entrance'], work: 1, expires: null, penalty: 4, weight: 2 },
        /** Not a floor job: someone out at the cash-and-carry (`actions.cashAndCarry`). Never spawns by itself. */
        errand: { label: 'At the cash-and-carry', short: 'Cash-and-carry', where: ['entrance'], work: 30, expires: null, penalty: 0, weight: 0 },
      } satisfies Record<string, TaskKindConfig>,
    },
    /** Questions that pause the day. Kinds and their numbers; at most `maxPerDay`. */
    events: {
      perHour: 0.4,
      maxPerDay: 2,
      minGapMinutes: 90,
      /** A surprise due during a burst, or while jobs wait on the floor, comes this much later. */
      waitMinutes: 10,
      firstAfterMinutes: 20,
      breakRequest: { minutes: 10, refusedStrain: 4, grantedStrainRelief: 2 },
      favour: { cost: 3, mood: 3, refusedMood: -2, moodMinutes: 60 },
      nearDate: { qty: 100, costShare: 0.5, days: 1 },
      complaint: { voucher: 5, voucherMood: 3, apologyMood: 1, moodMinutes: 45 },
      donation: { cost: 20, mood: 3, moodMinutes: 180 },
    },
  },

  /**
   * Hiring from the office, at any time (your shop). A pool of candidates each
   * morning; more as reputation rises. Hired before `sameDayBefore` they walk in
   * `startDelayMinutes` later; after it, they start the next morning. New people
   * work a little slower for their first days. The team can't outgrow the break
   * room (`teamLimit`), which the "Bigger break room" upgrade raises.
   */
  hiring: {
    poolSize: 3,
    poolMax: 5,
    /** One more candidate for every this many reputation points above `poolFrom`. */
    poolFrom: 70,
    poolPerReputation: 6,
    /** Chance each of the old regulars (Bev, Tomasz, Dougie) is in a morning's pool, if not on the team. */
    regularChance: 0.6,
    hireCost: 60,
    /** Hourly wage range (specialists ask a little more). Wages are paid at closing. */
    wage: { min: 11.6, max: 13.4, specialistPremium: 0.6 },
    /** Hours from opening: 3 = 12:00. */
    sameDayBefore: 3,
    startDelayMinutes: 30,
    newcomer: { days: 2, productivity: 0.85 },
    teamLimit: 5,
    /** Letting someone go: reputation, strain for the rest of the team, and the mood in the shop for a while. */
    letGo: { reputation: -1, teamStrain: 2, mood: -2, moodMinutes: 60 },
    names: ['Aisha', 'Callum', 'Ffion', 'Gareth', 'Hana', 'Imran', 'Jade', 'Kofi', 'Lydia', 'Marek', 'Niamh', 'Olu', 'Pat', 'Rosie', 'Sanjay', 'Tess', 'Wes', 'Yusuf', 'Zainab', 'Dot'],
  },

  /** Character traits: small, readable effects on top of a person's strength. */
  traits: {
    morningPerson: { label: 'Morning person', text: 'Quicker before 12:00, slower after', before: 1.1, after: 0.95 },
    nightOwl: { label: 'Night owl', text: 'Slow to get going; quicker after 12:00', before: 0.95, after: 1.1 },
    chatty: { label: 'Chatty with regulars', text: 'Shoppers enjoy the chat at the till (+1 satisfaction), but it’s a little slower', tillSpeed: 0.95, satisfaction: 1 },
    dislikesStockroom: { label: 'Dislikes the stockroom', text: 'Slower unloading deliveries', receiveSpeed: 0.85 },
    steady: { label: 'Steady', text: 'Tires more slowly', energyDrain: 0.85 },
    tidy: { label: 'Tidy', text: 'Sorts out floor jobs quicker', floorSpeed: 1.3 },
  },

  /** Sound and the little coin pops when a till takes money. */
  juice: {
    /** Volume of the till ding, 0–1 (gentle). */
    volume: 0.18,
    /** At most one ding per till this often (real milliseconds). */
    dingEveryMs: 1400,
    /** Takings that make a till ding (pounds since its last ding). */
    dingAfterPounds: 6,
  },

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
    /** Share of the queue leaving per 10 minutes, for each minute the wait is over patience. */
    abandonPer10Minutes: 1 / 25,
    /** At most this share leaves in any 10 minutes. */
    maxAbandonPer10Minutes: 0.5,
  },

  staff: {
    /** Assignment limits (people at once). */
    limits: { tills: 3, replenish: 2, receive: 2, break: 2 },
    receiveRate: 500,
    /** Energy change per hour by job. */
    energy: { tills: -10, replenish: -11, receive: -13, break: 40 },
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
    /**
     * Ordering during the day (the stockroom panel). Quantities go in steps of `step`.
     * Rush delivery: from the wholesaler, dearer per item plus a fee, on the dock (to unload) about
     * `arrivalMinutes` after ordering. Priced so a good morning order is clearly cheaper: at ×1.6 plus £25
     * a rush of 120 fruit & veg costs £125 against £62 in the morning order.
     */
    emergency: {
      /** The amount the stepper starts at when there's no better suggestion. */
      qty: 120,
      maxQty: 300,
      step: 20,
      costMult: 1.6,
      deliveryFee: 25,
      arrivalMinutes: 20,
      maxPerDay: 2,
    },
    /** Send someone to the cash-and-carry: away for `minutes`, back with up to `maxQty` items (what fits in the car) straight into the stockroom. */
    cashAndCarry: {
      qty: 60,
      maxQty: 80,
      step: 10,
      costMult: 1.25,
      minutes: 30,
      maxPerDay: 2,
    },
    /** Add to the next scheduled delivery: today's midday lorry if it hasn't come yet, otherwise tomorrow morning (on the dock at opening). Normal prices. */
    nextDelivery: {
      maxQty: 600,
      step: 20,
    },
    /** Warn when a department's stock (shelf, stockroom, dock and deliveries due) will run out within this many minutes at the forecast rate. */
    runOutWarnMinutes: 45,
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
      /** Engineer arrives this many minutes after being called. */
      arrivalMinutes: 30,
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
   * The shop, day after day: Sunday to Saturday and round again, with no end
   * and no pass or fail. Provisional values, balanced with scripted players
   * (scripts/campaign.ts); see README.
   */
  /** End of day: stars from how happy shoppers were (satisfaction). Everyone gets at least one. */
  stars: { two: 70, three: 82 },

  campaign: {
    startCash: 1500,
    /** Features unlock on these days (0 = the first Sunday), whatever the weekday. */
    unlocks: {
      /** Prices are fixed: never unlocked. */
      pricing: Infinity,
      actions: { hire: 0, letGo: 0 },
    },
    /**
     * The first days forgive mistakes rather than lowering the activity: shoppers wait longer before giving up,
     * unattended floor jobs and brush-offs cost half the satisfaction, and a poor day moves reputation down half as far.
     */
    generous: { days: 3, patienceBonusMinutes: 2, penaltyScale: 0.5, reputationDropScale: 0.5 },
    /** Word gets round: each completed week brings this many more shoppers, up to `maxGrowth`. */
    weeklyGrowth: 0.05,
    maxGrowth: 0.3,
    /**
     * Stock bought on the wholesaler's account (no longer offered). Saves from before it was removed may still owe some:
     * `repayShare` of takings pays it off.
     */
    supplierCredit: { repayShare: 0.3 },
    /** The three regulars at the start; the others can be hired, in any order. */
    startStaff: ['priya', 'kwame', 'mags'],
    hireable: ['bev', 'tomasz', 'dougie'],
    startDepts: ['produce', 'ambient'] as DeptId[],
    startTills: 2,
    /** Stock in the shop on Sunday morning. `days`: days it still keeps (null: keeps). */
    startStock: {
      produce: [
        { qty: 120, days: 1, where: 'shelf' },
        { qty: 120, days: 2, where: 'backroom' },
      ],
      chilled: [],
      ambient: [
        { qty: 200, days: null, where: 'shelf' },
        { qty: 400, days: null, where: 'backroom' },
      ],
    } as Record<DeptId, { qty: number; days: number | null; where: 'shelf' | 'backroom' }[]>,
    /** A modest shop with small displays: they hold roughly an hour or two of trade, so they need topping up from the stockroom during the day. */
    shelf: { produce: 200, chilled: 140, ambient: 300 } as Record<DeptId, number>,
    backroom: { produce: 600, chilled: 360, ambient: 1300 } as Record<DeptId, number>,
    /** Day costs: rent and rates per day, energy and the like per trading hour. */
    rentPerDay: 90,
    costsPerHour: 14,
    /** Reputation: the week's customer opinion. Each day moves it part-way to that day's satisfaction. */
    reputation: { start: 70, pull: 0.4, pivot: 72, perPoint: 0.006, min: 0.88, max: 1.12 },
    /** Overnight rest restores energy, but part of the day's strain carries over and lowers the next morning's energy. */
    fatigue: { carry: 0.4, energyPerStrain: 0.8, maxEnergyLoss: 25 },
    overnight: { produceShrink: 0.03 },
    /**
     * Recommended orders buy the forecast times this: room for the day's bursts of shoppers (about 15% more) and the hidden
     * variation, more for cupboard stock, which keeps. Space and cash still cap it.
     */
    orderCover: { perishable: 1.45, ambient: 1.6 },
    /** Recommended orders keep this many hours of wages and costs back (the rest is paid from takings). */
    orderReserveHours: 1,
    days: [
      {
        name: 'Sunday',
        hours: 4,
        forecast: [22, 34, 42, 30],
        middayHour: null,
        intro: 'First day in charge. Keep a till open, keep the shelves filled from the stockroom, and give everyone a break. There’s no rush: pause whenever you like.',
        later: 'Sunday: short hours and a calm start to the week.',
        events: [],
      },
      {
        name: 'Monday',
        hours: 5,
        forecast: [24, 32, 38, 36, 28],
        middayHour: 2,
        intro: 'New today: a midday delivery arrives at 11:00. Someone has to unload it on the dock before the shelves can be filled from it.',
        later: 'Monday: a quiet one, with the midday lorry at 11:00.',
        events: [],
      },
      {
        name: 'Tuesday',
        hours: 6,
        forecast: [26, 34, 42, 44, 36, 30],
        middayHour: 3,
        intro: 'New today: you can set each department’s price. Click a department, then Change prices.',
        later: 'Tuesday: an ordinary day. A good one for trying a new price.',
        events: [],
      },
      {
        name: 'Wednesday',
        hours: 6,
        forecast: [40, 48, 40, 32, 26, 24],
        middayHour: 3,
        intro: 'Market day: busiest first thing, quieter after lunch.',
        later: 'Market day: busiest first thing, quieter after lunch.',
        events: [{ kind: 'delayedDelivery', hour: 3, warnAt: 1 }],
      },
      {
        name: 'Thursday',
        hours: 7,
        forecast: [24, 30, 36, 42, 36, 46, 54],
        middayHour: 3,
        intro: 'Late opening: the after-work crowd arrives from 14:00.',
        later: 'Late opening: the after-work crowd arrives from 14:00.',
        events: [{ kind: 'rush', hour: 6, warnAt: 4 }],
      },
      {
        name: 'Friday',
        hours: 7,
        forecast: [30, 40, 50, 58, 52, 48, 46],
        middayHour: 3,
        intro: 'Payday: steady and busy all day.',
        later: 'Payday: steady and busy all day.',
        /** Only if the shop has chilled cabinets without the refrigeration upgrade; announced at opening. */
        events: [{ kind: 'fridgeFault', hour: 2, warnAt: 0 }],
      },
      {
        name: 'Saturday',
        hours: 8,
        forecast: [35, 48, 62, 75, 72, 58, 50, 40],
        middayHour: 3,
        intro: 'Saturday: the busiest day of the week.',
        later: 'Saturday: the busiest day of the week.',
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
      breakRoom: { name: 'Bigger break room', cost: 400, perDay: 0, from: 1, equipment: true, extraTeam: 2, extraBreak: 1 },
    },
    /** Share of the chilled range two cabinets carry (four carry it all). */
    smallChilledRange: 0.5,
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
  /** One line shown at opening in the first week; introduces whatever is new today. */
  intro: string;
  /** The line shown on this weekday in later weeks. */
  later: string;
  events: { kind: 'rush' | 'delayedDelivery' | 'fridgeFault'; hour: number; warnAt: number }[];
}

export interface TaskKindConfig {
  label: string;
  short: string;
  /** Where it can appear: departments, the tills or the entrance. */
  where: TaskPlace[];
  /** Minutes of one person's work. */
  work: number;
  /** Minutes before it goes away by itself (the shopper gives up), or null. */
  expires: number | null;
  /** Satisfaction points lost each minute while nobody is on it. */
  penalty: number;
  weight: number;
}

export type TaskPlace = DeptId | 'tills' | 'entrance';

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
