import type { ChilledLife, DeptId, PriceTier } from './config';

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
  | 'break';

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

export interface SimState {
  seed: number;
  scenario: Scenario;
  /** Next hour to run: 0..8. 8 = closed. */
  hour: number;
  cash: number;
  openingInventoryValue: number;
  ledger: Ledger;
  stock: Record<DeptId, DeptStock>;
  queue: { customers: number; baskets: Record<DeptId, Batch[]> };
  staff: StaffMember[];
  pricing: Record<DeptId, PriceTier>;
  deliveries: PendingDelivery[];
  markdowns: TimedEffect[];
  promotions: TimedEffect[];
  used: { markdown: DeptId[]; promotions: number; emergency: number; temp: boolean; repair: boolean };
  fridge: FridgeState;
  satisfaction: { weightedSum: number; customers: number };
  history: HourReport[];
  /** Short log of messages shown in the store's announcement board. */
  announcements: string[];
  idCounter: number;
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
