import type { ChilledLife, DeptId, PriceTier, TaskPlace } from './config';

/** A quantity of one aggregate product with one cost and one date. */
export interface Batch {
  qty: number;
  unitCost: number;
  /** Hours from opening at which it becomes unsellable; null = keeps beyond today. */
  expiresAt: number | null;
  label: string;
}

export interface DeptStock {
  shelf: Batch[];
  backroom: Batch[];
  /** Delivered but not yet received into the stockroom. */
  dock: Batch[];
}

export type AssignmentId =
  | 'tills'
  | 'replenish:produce'
  | 'replenish:chilled'
  | 'replenish:ambient'
  | 'receive'
  | 'break'
  /** On a floor job (which one is on the job itself). Not offered as a standing job. */
  | 'task';

export const ASSIGNMENTS: readonly AssignmentId[] = [
  'tills',
  'replenish:produce',
  'replenish:chilled',
  'replenish:ambient',
  'receive',
  'break',
];

export type Speciality = 'checkout' | 'calm' | 'produce' | 'chilled' | 'stamina' | 'receiving' | 'none';

export interface StaffMember {
  id: string;
  name: string;
  speciality: Speciality;
  energy: number;
  /** Accumulated strain across the shift (drives wellbeing). */
  strain: number;
  /** Hours worked in a row since the last break. */
  consecutive: number;
  breaks: number;
  hoursWorked: number;
  isTemp: boolean;
  /** Hour from which this person is on shift. */
  availableFrom: number;
  lastAssignment: AssignmentId;
  /** Steps (minutes) worked / rested so far in the current hour. */
  stepsWorked: number;
  stepsRested: number;
  /** Minutes rested in a row (a break counts once this reaches half an hour). */
  restRun?: number;
  /** A break was completed during the current hour. */
  breakThisHour?: boolean;
}

export interface PendingDelivery {
  id: string;
  dept: DeptId;
  qty: number;
  unitCost: number;
  arrivesAt: number;
  kind: 'midday' | 'emergency';
  /** Shelf life for chilled deliveries. */
  life?: ChilledLife;
  /** Hour it was originally due (for delays). */
  originalHour: number;
  /** Rush deliveries arrive at a minute (step since opening) rather than an hour. */
  arrivesAtStep?: number;
}

export interface TimedEffect {
  dept: DeptId;
  from: number;
  /** Exclusive end hour. */
  to: number;
}

export type EventKind = 'rush' | 'delayedDelivery' | 'fridgeFault';

export interface ScenarioEvent {
  id: string;
  kind: EventKind;
  /** Hour it takes effect. */
  hour: number;
  /** Hour it is announced (<= hour). Equal means no advance warning. */
  warnAt: number;
}

export interface Scenario {
  seed: number;
  name: string;
  curated: boolean;
  /** Forecast customers per hour shown to the player. */
  forecast: number[];
  /** Actual hidden multipliers on the forecast (bounded). */
  customerNoise: number[];
  deptNoise: Record<DeptId, number[]>;
  events: ScenarioEvent[];
}

export type ActionRequest =
  | { kind: 'markdown'; dept: DeptId }
  | { kind: 'promotion'; dept: DeptId }
  | { kind: 'emergency'; dept: DeptId }
  | { kind: 'cashAndCarry'; dept: DeptId; staffId: string }
  /** Accept that a department will run out today (no more warnings). */
  | { kind: 'letRunOut'; dept: DeptId }
  | { kind: 'temp' }
  | { kind: 'repair' };

export interface SetupPlan {
  orders: Record<DeptId, { morning: number; midday: number }>;
  /** Shelf life bought for each chilled delivery. */
  chilledLife: Record<'morning' | 'midday', ChilledLife>;
  pricing: Record<DeptId, PriceTier>;
}

export interface HourPlan {
  assignments: Record<string, AssignmentId>;
  pricing: Record<DeptId, PriceTier>;
  actions: ActionRequest[];
}

export interface Ledger {
  revenue: number;
  cogs: number;
  waste: number;
  wages: number;
  /** Additional costs by line (overheads, promotions, fees, repair). */
  extras: Record<string, number>;
  /** Cash spent on stock (inventory, not an expense). */
  stockPurchases: number;
}

export interface FridgeState {
  status: 'ok' | 'fault' | 'fixed';
  /** Absolute step (hour * steps + step) the engineer arrives, if booked. */
  repairAtStep: number | null;
}

/**
 * Everything that differs between trading days: how long the shop is open,
 * what is installed, what the player may use yet. Quick play uses the fully
 * fitted Saturday shop (`QUICK_CONTEXT`); the campaign builds one per day.
 */
export interface DayContext {
  mode: 'quick' | 'campaign';
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Trading hours; every day opens at 09:00. */
  hours: number;
  /** Departments the shop has. Others have no stock, no demand and no jobs. */
  depts: DeptId[];
  /** Installed tills (each needs an operator). */
  tills: number;
  shelfCap: Record<DeptId, number>;
  /** Share of the full range on sale (1 = the Saturday shop's range); scales the items shoppers want. */
  range: Record<DeptId, number>;
  backroomCap: Record<DeptId, number>;
  /** Share per hour lost from stock left on the dock. */
  dockSpoil: Record<DeptId, number>;
  /** Hour the midday delivery reaches the dock; null when there is none today. */
  middayHour: number | null;
  /** Footfall multiplier from the shop's reputation (1 in Quick play). */
  reputationFootfall: number;
  /** Day costs by line (rent, energy, refrigeration…), accrued evenly over trading hours. */
  overheads: Record<string, number>;
  /** Actions the player may use today. */
  actions: ActionRequest['kind'][];
  /** Whether prices can be changed today. */
  pricing: boolean;
  /** Extra minutes of queue patience (the generous first days). */
  patienceBonus?: number;
  /** Scales satisfaction penalties from floor jobs and answers (the generous first days). */
  penaltyScale?: number;
}

export interface SimState {
  seed: number;
  ctx: DayContext;
  scenario: Scenario;
  /** Next hour to run: 0..8. 8 = closed. */
  hour: number;
  /** Steps (minutes) already played in the current hour. */
  step: number;
  cash: number;
  /** Cash before the day's order was paid for. */
  cashBeforeOrder: number;
  openingInventoryValue: number;
  ledger: Ledger;
  stock: Record<DeptId, DeptStock>;
  queue: { customers: number; baskets: Record<DeptId, Batch[]> };
  staff: StaffMember[];
  pricing: Record<DeptId, PriceTier>;
  deliveries: PendingDelivery[];
  markdowns: TimedEffect[];
  promotions: TimedEffect[];
  used: { markdown: DeptId[]; promotions: number; emergency: number; temp: boolean; repair: boolean; cashAndCarry?: number };
  fridge: FridgeState;
  satisfaction: { weightedSum: number; customers: number };
  history: HourReport[];
  /** Short log of messages shown in the store's announcement board. */
  announcements: string[];
  idCounter: number;
  /** Owed to the wholesaler for stock bought on account; repaid from takings. */
  credit?: number;
  /** Life on the shop floor: bursts, small jobs and questions (live play). */
  floor?: Floor;
}

export type TaskKind = 'spill' | 'help' | 'priceCheck' | 'pallet' | 'baskets' | 'errand';
export type FloorEventKind = 'breakRequest' | 'favour' | 'nearDate' | 'complaint' | 'donation';

/** A short spike of shoppers on top of the hour's forecast. Times are steps since opening. */
export interface Burst {
  id: string;
  kind: 'bus' | 'school' | 'church' | 'lunch' | 'coach';
  at: number;
  minutes: number;
  shoppers: number;
  warnAt: number;
}

/** A small job on the shop floor that needs one person for a few minutes. */
export interface FloorTask {
  id: string;
  kind: TaskKind;
  place: TaskPlace;
  /** Which of the place's spots it appears on. */
  spot: number;
  at: number;
  /** Minutes of work needed, and done so far. */
  work: number;
  progress: number;
  assigned: string | null;
  /** Step at which it goes away by itself if nobody has come. */
  expiresAt: number | null;
  /** A cash-and-carry run: what comes back into the stockroom. */
  brings?: { dept: DeptId; qty: number; unitCost: number };
}

export interface FloorEvent {
  id: string;
  kind: FloorEventKind;
  at: number;
  /** Filled in when it is raised: who or what it is about. */
  staffId?: string;
  dept?: DeptId;
  reason?: string;
}

export interface Floor {
  bursts: Burst[];
  /** Jobs still to appear, in time order. */
  schedule: FloorTask[];
  /** Jobs on the floor now. */
  tasks: FloorTask[];
  /** Questions still to come, in time order. */
  events: FloorEvent[];
  /** A question waiting for an answer (the day doesn't move on until it's answered). */
  pending: FloorEvent | null;
  /** Satisfaction changes from answers, until a step. */
  mood: { delta: number; until: number; label: string }[];
  counts: { resolved: number; expired: number; answered: number };
  /** What the last answer did, in a line. */
  lastAnswer?: string;
  /** Departments the player has accepted will run out today. */
  letRunOut?: DeptId[];
}

export interface StepSnapshot {
  step: number;
  shelf: Record<DeptId, number>;
  backroom: Record<DeptId, number>;
  dock: number;
  arrivals: number;
  queue: number;
  served: number;
  abandoned: number;
  emptyDepts: DeptId[];
  fridgeFault: boolean;
  /** Items moved by each department's fillers this step (to shelf, or rescued to the cold room). */
  moved: Record<DeptId, number>;
  /** Items received from the dock this step. */
  received: number;
  /** Customers the open tills could serve this step. */
  tillCapacity: number;
  /** Money taken at the tills this step. */
  takings: number;
}

export interface DeptHourReport {
  wanted: number;
  picked: number;
  sold: number;
  revenue: number;
  cogs: number;
  /** Unmet because the shelf was empty but the stockroom or dock had stock. */
  lostShelfGap: number;
  /** Unmet because the store had none anywhere. */
  lostNoStock: number;
  /** Items put down in abandoned baskets. */
  abandonedItems: number;
  replenished: number;
  /** Moved off a broken chiller into the cold room (not onto shelves). */
  rescued: number;
  replenishCapacity: number;
  received: number;
  shelfEmptySteps: number;
  shelfStart: number;
  shelfEnd: number;
  backroomEnd: number;
  dockEnd: number;
  price: number;
  demandMult: number;
  /** Takings above (+) or below (−) standard prices, including markdown stickers. */
  priceEffect: number;
}

export interface WasteLine {
  dept: DeptId;
  qty: number;
  cost: number;
  reason: 'expired' | 'shrink' | 'dock' | 'abandoned' | 'fridge';
}

export interface StaffHourReport {
  id: string;
  name: string;
  assignment: AssignmentId;
  energyBefore: number;
  energyAfter: number;
  productivity: number;
  /** Share of available capacity actually used (0..1). Null for breaks. */
  utilisation: number | null;
  strainAdded: number;
}

export interface Reason {
  label: string;
  delta: number;
}

export interface HourReport {
  hour: number;
  /** Steps of the hour this report covers: [fromStep, toStep). A full hour is 0..6. */
  fromStep: number;
  toStep: number;
  customersArrived: number;
  customersServed: number;
  customersAbandoned: number;
  avgWait: number;
  maxQueue: number;
  tillCapacity: number;
  dept: Record<DeptId, DeptHourReport>;
  staff: StaffHourReport[];
  waste: WasteLine[];
  money: {
    revenue: number;
    cogs: number;
    waste: number;
    wages: number;
    extras: number;
    cashEnd: number;
    profitSoFar: number;
  };
  satisfaction: { score: number; reasons: Reason[]; daySoFar: number };
  wellbeing: number;
  messages: string[];
  steps: StepSnapshot[];
  actionsTaken: ActionRequest[];
}
