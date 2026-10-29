# Stockwell & Co

A single-player browser game about running a small independent British supermarket through one busy Saturday. You make staffing and commercial decisions, run the next hour, watch what happens and adjust.

Eight hourly turns (09:00–17:00), three departments (fruit & veg, chilled food, cupboard essentials), six employees, limited cash. A first playthrough takes roughly 15–25 minutes.

## Running it

Requires Node 18 or later.

```bash
npm install
```

```bash
npm run dev
```

Then open the address Vite prints (normally http://localhost:5173).

Other commands:

```bash
npm test            # Vitest simulation tests
npm run build       # typecheck + production build into dist/
npm run preview     # serve the production build
npm run balance     # play full Saturdays with scripted strategies across seeds
npm run consequence # one hour, one staffing change: preview and outcome side by side
```

The build is static (`dist/`, relative paths) and can be opened from any static file host. There is no backend, account or external asset.

## How to play

1. **Opening.** The shopfront, one sentence and **Start shift**, which opens the doors with the recommended stock. **Custom setup** (underneath) shows one department at a time in tabs: morning and midday quantities, chilled dates ("Expires tonight" £1.35 or "Keeps till Wednesday" £1.55), price tier, cost, space at opening and "Estimated overflow" at 12:00. Calculations and assumptions sit behind **Details**; the order total, cash left and Start shift stay visible at the bottom.
2. **Each hour.** On the first shift, three short tips appear in the shop one at a time (select someone, choose where they work, run the hour); each can be dismissed, and Settings can show them again. Labels appear on the shop itself when they matter: "Delivery: 12:00 · 1,340 items" on the dock, "Nobody receiving", "Expires tonight: 120" on the chilled cabinets, "Due a break: Bev" in the break room. Profit, customers and staff are compact indicators in the top bar; click one for its target and what it means. Read the Tannoy (events) and the "Likely this hour" warnings. Give everyone a job: tills, fill one department, receive deliveries or take a break. Use each person's drop-down, or click a staff character in the shop and then the place they should work. Click a department, the tills, the dock or the break room to open its controls (stock and dates, price tier, markdown, promotion, emergency order, temp, chiller engineer). Everything is reversible until you press **Run** (or R).
3. **Replay and results.** A short replay shows the hour's recorded outcome (skip it any time): shoppers with baskets arriving at the departments, queues building in the till lanes, walk-outs and abandoned baskets, shelves emptying, and staff carrying stock, scanning or standing idle. A side list says what each person is doing and why anyone is idle. Then you get an explanation that separates missing stock, empty shelves with stock out back, and checkout bottlenecks.
4. **Closing.** Accounts, cash and remaining stock, targets, the three biggest effects on profit, and missed opportunities drawn from the day's data. **Retry same Saturday** replays identical customers and events; **New Saturday** uses a new seed.

**Win** with operating profit of £800 or more, customer satisfaction of 70 or more and staff wellbeing of 60 or more.

## Design in brief

- **Stock** is held as dated batches in three places per department: shelf, stockroom and dock. Customers can only buy from shelves. Shelves only refill from the stockroom, by staff assigned to that department. Deliveries need receiving before they reach the stockroom.
- **Perishables.** Friday's produce goes past its best at 13:00; produce on display bruises slowly. Chilled is bought per delivery as short-dated ("use by Sunday", £1.35, binned at close if unsold because the shop is closed on Sundays) or longer-life ("use by Wednesday", £1.55, keeps its value). The recommended order buys short-dated in the morning and longer-life at midday. Emergency chilled is longer-life. Chilled stock on the dock spoils quickly. Cupboard stock keeps. Rotation is good but not perfect, so some fresher stock sells first.
- **Midday room estimate.** The order screen estimates the space at 12:00 from forecast sales before the lorry arrives (at the chosen prices, assuming shelves are kept filled), and says roughly when any overflow will have cleared from the dock. It ignores the hidden demand variation, so it is labelled as an estimate.
- **Customers and queues.** Each hour is simulated in six ten-minute steps. Shoppers pick from the shelves and join the queue. When the expected wait exceeds their patience, a share leave; their baskets go back on the shelves (some chilled is binned). The queue carries over between hours.
- **Money.** Stock purchases spend cash and create inventory. A sale recognises revenue and the cost of the goods sold; waste writes off the cost of what expired. Wages and other costs reduce profit. Unsold stock keeps its value at cost. Tests check that no item or pound is created, lost or counted twice.
- **Staff.** Energy falls while working and recovers on a break. Below 50, people slow down. Wellbeing is based on strain accumulated across the shift (low energy, long stretches without a break, no break at all), so resting everyone at the end does not undo the day. Specialities are modest (+15%) and don't decide the allocation.
- **Satisfaction** is a customer-weighted average of each hour's experience: availability, waiting, walk-outs and prices. Each hour shows the reasons. Footfall reacts only slightly (between −8% and +4%), so an early mistake is recoverable.
- **Actions** (limited, previewed with cost, timing and effect): markdown (yellow stickers on short-dated stock, once per fresh department), promotion (two hours, one at a time, two per day), emergency order (1.5× cost plus fee, arrives next hour on the dock, two per day, not after closing), agency temp (arrives next hour, booking fee plus hourly, once), chiller engineer (only while the chiller is broken).
- **Events.** At most two per Saturday: an unexpected rush (announced two hours ahead), a delayed midday delivery (announced an hour ahead), and a chiller fault (half the chilled shelf out of use: rescue the stock with staff, call the engineer, or both). No unannounced event lands in the last two hours. The first Saturday is curated: a chiller fault at 11:00 and a rush at 14:00.
- **Determinism.** The seed fixes the demand variation and events. A game is stored as seed + setup + committed hourly plans and rebuilt by replaying them, so the same decisions always give the same result. The replay animation only displays recorded steps and cannot affect results.

## Code layout

```
src/sim/            Pure TypeScript simulation (no DOM, no timers)
  config.ts         All balancing parameters, with comments
  engine.ts         startDay, runHour, plan validation, action rules, queries
  stock.ts          Batch operations (FIFO/expiry/share), used for conservation
  scenario.ts       Seeded scenarios; seed 1 is the curated first Saturday
  roster.ts         The six employees, specialities and default jobs
  explain.ts        Directional pre-turn warnings and post-turn explanations
  summary.ts        Closing accounts, biggest factors, missed opportunities
  game.ts           Game record (seed + decisions) and rebuild-by-replay
  save.ts           localStorage autosave and settings, failure-tolerant
  bots.ts           Scripted strategies for tests and balance runs
  sim.test.ts       Vitest suite
src/ui/             React components: Store.tsx (illustrated shop), art/Characters.tsx (staff and
                    shoppers), PlanPanel.tsx (staff, context card, prices and actions), activity.ts
                    (staff activity from replay snapshots), setup, results, closing, dialogs
src/App.tsx         Phases, replay timer, keyboard shortcuts
scripts/            Balance and playtest scripts (run with vite-node)
```

## Provisional balance

All in `src/sim/config.ts`. Highlights:

| Parameter | Value |
|---|---|
| Starting cash | £3,600 (recommended order costs about £3,240) |
| Forecast customers per hour | 35, 48, 62, 75, 72, 58, 50, 40 (±8% hidden variation) |
| Basket per customer | 3.5 fruit & veg, 2.5 chilled, 4 cupboard items |
| Price / unit cost | fruit & veg £0.95 / £0.52 · chilled £2.40 / £1.35 short-dated or £1.55 longer-life · cupboard £1.35 / £0.82 |
| Value / premium | ×0.90 price, ×1.18 demand, +satisfaction / ×1.10 price, ×0.86 demand, −satisfaction |
| Shelf / stockroom space | 300 / 600 · 260 / 450 · 600 / 1,200 |
| Staff rates per hour | tills 30 customers · fill 280 / 260 / 400 items · receive 500 items |
| Job limits | 3 tills · 2 per department · 2 receiving · 2 on break |
| Energy per hour | tills −13, filling −15, receiving −18, break +40 |
| Queue patience | 6 minutes (+2 with Bev on a till) |
| Wages and overheads | £12.60/hour each; £680/day overheads |
| Targets | profit £800 · satisfaction 70 · wellbeing 60 |

With these values the scripted "sensible" manager wins the curated Saturday (about £1,100, satisfaction 79, wellbeing 90) and 19 of 20 generated Saturdays in the test sample. That is probably slightly generous for a real first-time player, and is the first thing to check in playtesting. Keeping one till, never refilling shelves, never taking breaks, or accepting the default plan every hour all lose (see `npm run balance` and the balance tests).

## Accessibility

- All essential actions work with the keyboard: drop-downs for jobs, radio buttons for prices, buttons for actions. Zones in the store become focusable buttons once someone is selected. R runs the hour; Escape cancels a selection or closes a dialog.
- Status is never shown by colour alone: shelf labels say Full/OK/Low/Empty, targets show ✓/✗ with text, warnings have icons and labels, energy has a word as well as a bar.
- Reduced motion (setting, or the system preference) removes walking shoppers and transitions. The replay can be skipped every hour or turned off entirely.
- UK English, pounds sterling.

## Known limitations

- Each department is one aggregate product; there is no individual product management.
- The queue and shopping model is a deterministic flow model of fractional customers. It doesn't simulate individual shoppers. In the replay, **queue figures are one per queuing customer** (split evenly across open tills, up to 20 per lane), shelf stock, stockroom crates, the dock, empty-shelf flags, walk-outs and staff activity come from the recorded ten-minute steps; the **shoppers in the aisles are representative** (about one figure per 1.2 arrivals that step, spread by basket share) and their walking paths are decorative.
- Dragging staff is not implemented; click-to-assign and the drop-downs cover everything.
- Balance has been tuned with scripted strategies, not yet with human players. The generated Saturdays (New Saturday) vary demand and events within limits, but haven't been hand-checked as much as the curated one.
- Desktop-first. The layout stacks on narrow screens but isn't designed for phones.
- Saves from an incompatible version (including those from before the chilled shelf-life choice) are discarded rather than migrated.

## Playtest questions

The central question: **does changing a staffing or commercial decision create an understandable, interesting consequence elsewhere in the shop?** For example, `npm run consequence` takes the 12:00 hour of the first Saturday and moves one person from tills to receiving. The preview warns "Checkout capacity is likely to fall short", and the result shows 8 walk-outs and about £110 of abandoned shopping, where the original plan had none.

Also worth watching for: whether the midday delivery and receiving make sense without the tip; whether breaks feel worth their cost; whether the markdown and chiller decisions feel like real choices.

## Status: implemented vs provisional

Implemented and covered by tests: the simulation (stock, perishables, queues, money, staff, events, interventions), the chilled shelf-life choice, the midday room estimate, determinism, save/load, and the reconciliation between replay snapshots and hour results (served, walk-outs, received, shelf levels, idle staff only when they moved nothing).

Implemented and unit-tested in the UI layer: the tip sequence and when shop labels appear (`src/ui/Coach.tsx`).

Implemented, checked by screenshots at 1366×768 but not by automated tests: the shopfront opening, tabbed custom setup, in-shop tip callouts, indicator popovers, illustrated shop, characters, context cards and replay animation.

Provisional: all balance values in `src/sim/config.ts` (tuned with scripted strategies, not people); the art is simple SVG and character sizes are small at laptop width; the representative aisle shoppers.
