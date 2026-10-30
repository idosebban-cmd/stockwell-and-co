# Stockwell & Co

A cosy, single-player browser game about running a small independent British supermarket. The main mode is **your shop**: day after day, Sunday to Saturday and round again, with no deadline and no failing. You start small (two departments, three staff, two tills), keep the shelves full and the queues short, look after the team and grow the business as you go. The shop runs in real time (about a minute an hour at 1x), and you can pause whenever you like.

**Quick play** keeps the standalone Saturday in the fully fitted shop (three departments, six employees), now in real time too, with its £800 profit target. **Learn to play** is an optional five-minute set of lessons, unchanged for now; your shop also introduces things as it goes.

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
npm run pricing     # does one price level win everywhere? full days and set situations
npm run campaign    # the first week(s) with different investment paths (npm run campaign -- 1,2,3 sensible 14)
npm run pacing      # prompts per in-game hour and how often jobs outnumber people (npm run pacing -- 1,2,3)
```

The build is static (`dist/`, relative paths) and can be opened from any static file host. There is no backend, account or external asset.

## How to play

1. **Home.** **Open the shop** (or **Continue · Tuesday, day 3**), **Quick play: one Saturday**, and links to **Learn to play** and Quick play with a custom order. If a save had to be converted or couldn’t be continued, the home screen says so instead of silently dropping it.
1. **Your shop.** Each day has three parts.
   - *Before opening:* an illustrated briefing beside the shop as it will open: this week’s day markers with today highlighted, the trading hours by a clock, a **Day N** badge, **Expected customers** as a small hourly chart with the busiest hour marked, and three picture cues (Serve, Restock, Rest; Unload on the first Monday; Prices on the first Tuesday) that highlight where that happens. The order is shown on the shop itself (“+170 arriving” by the crates, the midday lorry by the dock), with **Order** and **Cash after**, **Adjust order** and an ⓘ for how it is worked out. When cash and overdraft can’t cover it, one line explains that the wholesaler puts up to £300 of stock on account, repaid from takings. **Confirm order & open** buys the order and starts the clock.
   - *Trading, live:* see **During the day** below. The top bar shows the time, cash, today’s profit, reputation, the team and business value, with no targets.
   - *After closing:* **<Day>: closed for the day** with today’s profit, customer satisfaction and staff wellbeing (figures only, no ticks or crosses) and a takeaway only when there is something useful to say. Below, **Improve the shop**: candidates as portraits with their speciality symbol and costs, equipment as pictures with a quantified benefit; selecting one opens its details and **Hire …** or **Buy …**; selecting never buys. Cash, **Open tomorrow: <day>** and **View report** sit at the bottom. **Restart <day>** is in the menu.
2. **During the day (both modes).** The clock runs: about 60 seconds per in-game hour at 1x, faster at 2x and 3x. **Space** pauses and carries on (also P); 1, 2 and 3 set the speed; opening a dialog or hiding the tab pauses. While paused, everything still works: move people, change prices, take actions, then carry on to see the result.
   - **Moving people:** drag someone to a place (the tills, a department’s shelves, the dock, the break room). They walk there and start straight away; dropping on a full place swaps them with the person there. Or click a person, then a place; or use the person’s panel. Every place shows what the person would achieve there while they are selected or dragged.
   - **Breaks** last half an hour; then the person goes back to the job they left. Half an hour of rest counts as a break even across the hour.
   - **Floor jobs** appear as a red “!” on the spot: a spill to mop, a shopper who needs help finding something, a price check at the till, a cage blocking an aisle, baskets running out at the door. Each needs one person for 1–3 minutes; while nobody is on it, customers’ satisfaction drops (help and price checks give up after a while). Drag a person onto the “!” (or select them and click it); a progress ring fills while they work, and they go back to their job when it’s done.
   - **Bursts:** a sign at the door announces a bus, the school run, the after-church or lunch crowd four in-game minutes ahead (about four seconds at 1x), so you can open another till before they reach it.
   - **Questions** pause the day with two or three answers, each saying what it will do: a colleague asking for a ten-minute breather, a regular’s favour, the wholesaler’s cheap near-date offer (stock lands on the dock), a customer complaint, a raffle prize for the school fête. Effects are cash, satisfaction for a while, a person’s strain or extra stock; a line says what happened.
   - **Actions** (markdown, promotion, emergency order, agency temp, chiller engineer) happen the moment you confirm them, paused or not.
   - **Sales:** a soft till ding and a coin popping over the till as money comes in (sound on by default at a gentle volume; the **Sound** button in the top bar mutes it, remembered between sessions; reduced motion turns off the coin pops and walking).
   - The rest of the screen is as before: one panel for whatever you selected, **Needs attention · N**, **Team**, the day’s timeline (forecast), “!” on fixtures with a problem, price comparisons.
3. **Learn to play** (about five minutes): five lessons and two optional pricing lessons on a fixed quiet Saturday, each run as a 30- or 60-minute interval with a short replay. Unchanged in this phase; to be replaced by in-game hints.
4. **Closing (Quick play).** **Saturday complete**, three scores with their targets (Profit £800, Customers 70, Staff 60), one takeaway and **Try again**; **View report** has *Accounts*, *Operations* and *Team* tabs (also in your shop).

## Design in brief

- **Stock** is held as dated batches in three places per department: shelf, stockroom and dock. Customers can only buy from shelves. Shelves only refill from the stockroom, by staff assigned to that department. Deliveries need receiving before they reach the stockroom.
- **Perishables.** Stock is dated “use by <day>” and binned once past it. Chilled is bought per delivery as short-dated (cheaper; binned at closing if unsold) or longer-life (dearer, keeps three more days). Chilled stock on the dock spoils quickly. Cupboard stock keeps. Rotation is good but not perfect.
- **Prices.** Low, Regular and High are the same products at different prices; `npm run pricing` measures which pays in which situation.
- **Time.** The simulation runs in one-minute steps. Everything that changes during the day (energy, footfall, wages, overheads, satisfaction) is updated every minute, so running an hour in one go or minute by minute gives the same result (tested). Breaks, hours worked and strain are settled at the end of each hour. History keeps one report per hour.
- **Customers and queues.** Shoppers pick from the shelves and join the queue. When the expected wait exceeds their patience, a share leave each minute; their baskets go back on the shelves (some chilled is binned).
- **Money.** Stock purchases spend cash and create inventory. A sale recognises revenue and the cost of the goods sold; waste writes off the cost of what expired. Unsold stock keeps its value at cost. Tests check that no item or pound is created, lost or counted twice.
- **Staff.** Energy falls while working and recovers on a break. Below 50, people slow down. Wellbeing is based on strain accumulated across the shift, so resting everyone at the end does not undo the day.
- **Actions** happen at once (live) and are limited, previewed with cost, timing and effect.
- **Ordering during the day (the stockroom).** Click (or Tab to and press Enter on) the stockroom. Per open department: on the shelf and in the stockroom, how long it lasts at today’s forecast (“Lasts until ~11:40”, or “Enough until closing”) counting anything on its way (“+60 arriving 11:20”), and three ways to order, each with a −/+ stepper, a **Top up until closing** suggestion (the shortfall to closing plus 10%), and the cost, arrival and cash left before confirming. Works while paused.
  - **Rush delivery:** ×1.6 the normal price plus £25, up to 300 items in steps of 20, two a day, one at a time per department; on the dock about 20 minutes later, to unload.
  - **Cash-and-carry:** choose who goes; they’re away 30 minutes and bring up to 80 items (steps of 10) at ×1.25 straight into the stockroom; two runs a day.
  - **Next delivery:** the normal price, with today’s midday lorry if it hasn’t come yet, otherwise on the dock when the shop opens tomorrow (your shop only; Quick play has no tomorrow).
  - **Let it run out:** stops the warnings for that department today.

  Orders on their way show on the stockroom racks as a small tag, deliveries put a “!” on the dock when they land, and a department that will run out within 45 minutes (at the forecast) appears in Needs attention and on the shelf as “runs out ~11:40: order more”, opening the stockroom. Rush prices keep a good morning order clearly cheaper (a rush of 120 fruit & veg costs £125 against £62 in the morning order; tested). All numbers are under `actions` in `src/sim/config.ts`. The old next-hour emergency order is gone (the lessons keep it).
- **Determinism and saves.** The seed fixes the demand variation and events. A live day is stored as its opening state plus the choices made, each stamped with its minute, and rebuilt exactly from them; autosave runs every few seconds, on pause and when the page is hidden.

## Life on the floor (pacing)

The default allocation shouldn’t solve the day: there should usually be more jobs than people, with a decision worth making every 30–60 real seconds at 1x (one in-game hour = one real minute). Everything is in `floor` in `src/sim/config.ts`, scheduled from the seed when the day opens (so saves replay exactly), and lessons stay quiet.

- **Bursts:** about 0.6 an hour at a busy hour’s level (40 customers), at most one an hour, 30 minutes apart; 12–20% of the hour’s shoppers (at least 6) over 6–10 minutes. Sized so one extra till absorbs it.
- **Floor jobs:** 0.45 an hour plus 0.008 per forecast customer, the first within 15 minutes of opening, at most three open at once; each unattended job costs 4–6 satisfaction points a minute (12 at most).
- **Questions:** about 0.4 an hour, at most three a day, 50 minutes apart, each kind once a day.
- **Restocking:** your shop’s displays are small (fruit & veg 140, chilled 100, cupboard 220) and day one starts with stock in the stockroom, so shelves need topping up during the day.
- **Day one** is busier than before (Sunday 22, 34, 42, 30 customers an hour) so three people are stretched at peaks; the first three days forgive instead: shoppers wait 2 minutes longer, unattended jobs and brush-offs cost half, and a poor day moves reputation down half as far.

`npm run pacing` plays each day of the first week and Quick play with an attentive scripted manager (it sends a spare person to each floor job, opens a till for bursts and answers questions) and reports prompts per in-game hour, i.e. per real minute at 1x:

| Day | Prompts per hour | One every (s at 1x) | More jobs than people |
|---|---|---|---|
| Sunday (day 1) | 2.6 | 23 | 19% of minutes |
| Monday–Tuesday | 2.2 | 27 | 57% |
| Wednesday–Friday | 2.5–2.6 | 23–24 | 72–91% |
| Saturday | 2.9 | 21 | 96% |
| Quick play | 2.8 | 22 | 18% |

Prompts counted: a burst announced, a floor job appearing, a question, a shelf falling below a quarter with stock out the back, a queue building, a delivery on the dock. A real player who reacts more slowly will see more queue and shelf prompts than the script, so this sits at the busy end of the target on purpose; lower `floor.tasks.perHour` if it feels hectic. In development builds (`npm run dev`) the game logs the same count to the console each real minute of running clock (`[pacing] …`) and shows it in the corner.

## Your shop in brief

- **Endless days.** Sunday to Saturday and round again. Days open at 09:00 and run for their real hours: Sunday 4, Monday 5, Tuesday and Wednesday 6, Thursday and Friday 7, Saturday 8. Each completed week brings 5% more shoppers (up to +30%).
- **Unlocks by day, not weekday.** Day 2 (the first Monday): the midday lorry and emergency orders. Day 3: prices, markdowns, promotions. Day 4: chilled can be bought, agency temps, the chiller engineer. From the second week everything stays unlocked.
- **Forgiving start.** £1,500 starting cash. The first three days are as busy as the rest but forgive mistakes: shoppers wait 2 extra minutes, unattended floor jobs and brush-offs cost half the satisfaction, and a poor day moves reputation down half as far.
- **No pass or fail.** No daily targets, no week goals, no game over. Days can still make a loss, and a day can always be restarted from its morning.
- **Supplier credit (no death spiral).** The bank lets the morning order take cash to −£500. Beyond that, the wholesaler puts up to £300 of stock on account; 30% of takings goes to paying it off until it is cleared. What is owed counts against business value. So a shop with no cash can still buy a small order, sell it and recover.
- **What carries over.** Cash and what is owed; stock with its date; installed equipment; staff and their carried fatigue; reputation; prices.
- **Reputation** moves 40% of the way towards each day’s satisfaction and sets footfall gently (−12% to +12%).
- **Orders.** The recommended order is the forecast at today’s prices plus a margin for bursts and variation (`campaign.orderCover`: ×1.25 perishable, ×1.35 cupboard), less stock in the shop, within the space, split between the morning and the midday lorry; it can use the overdraft and then the account, keeping one hour of costs back. Nothing is bought without confirming.
- **Improvements** (any order, none required):

  | Improvement | Cost | Running cost | Effect |
  |---|---|---|---|
  | Hire Bev, Tomasz or Dougie | £60 induction | £12.60 an hour on shift | Another person, with their speciality |
  | Third till | £450 | — | Up to 30 more customers an hour, when staffed |
  | More fruit & veg display | £280 | — | Shelf 200 → 300 |
  | Third grocery aisle | £320 | — | Shelf 400 → 600 |
  | Chilled department (from day 4) | £850 | £18 a day | Two cabinets and a cold room; half the chilled range |
  | Two more chilled cabinets | £350 | £6 a day | Chilled shelf 130 → 260 and the full range |
  | Better refrigeration | £300 | — | No cabinet faults; chilled on the dock spoils half as fast |

- **Accounting.** Business value = cash + usable stock at cost + equipment at purchase cost − overdraft − what is owed to the wholesaler.
- **Saving.** Your shop is saved as a snapshot of the shop each morning plus today’s order and minute-stamped choices. Older saves are converted: a week saved hour by hour (version 1) is replayed into the new format, finished days kept and today continued; Quick play saves from the hourly version are converted the same way. Results can differ slightly because breaks now end by themselves after half an hour.

## Code layout

```
src/sim/            Pure TypeScript simulation (no DOM, no timers)
  config.ts         All tuning values, with comments (live clock, juice, campaign, …)
  engine.ts         startDay (Quick play) / startShift (any day), runSteps (one-minute steps), takeAction,
                    plan validation, action rules, queries
  live.ts           A day played live: standing jobs and prices, automatic break returns, moves with swaps,
                    floor jobs, questions and their answers, minute-stamped choices, advance and replay
  floor.ts          Bursts, floor jobs and the questions' schedule, from the seed
  pacing.ts         Prompt counting for the pacing report and the dev counter
  campaign.ts       Your shop: persistent state, each day's shop and forecast, unlocks, recommended orders,
                    supplier credit, closing, investments, business value, the save and its conversion
  stock.ts          Batch operations (FIFO/expiry/share), used for conservation
  scenario.ts       Seeded scenarios; seed 1 is the curated first Saturday
  roster.ts         The six employees, specialities and default jobs
  explain.ts        Directional warnings and explanations
  insight.ts        Estimates for the UI from engine runs: outlook, job previews, problems, price comparison
  tutorial.ts       Lessons: controlled starting states, objectives, checks and results
  summary.ts        Closing scores, the takeaway, accounts, costs vs estimates, missed opportunities
  game.ts           Quick play record (seed + setup + choices) and rebuild
  save.ts           localStorage autosave and settings (sound, reduced motion), failure-tolerant, conversions
  bots.ts           Scripted strategies for tests and balance runs
  *.test.ts         Vitest suites (sim, live, tutorial, campaign)
src/ui/             React components: ShopScreen.tsx (shop, action bar and one contextual panel), Store.tsx (illustrated
                    shop, drag-to-allocate, walking, coin pops), useClock.ts (pause, speeds, Space), useLiveDay.ts (a live
                    day: clock, choices, autosave, juice), sound.ts (Web Audio till ding), ClockControls.tsx,
                    PlanPanel.tsx, Closing.tsx, CampaignScreens.tsx, useCampaign.ts, useGame.ts, Tutorial.tsx, dialogs
src/App.tsx         Modes and screens
scripts/            Balance and playtest scripts (run with vite-node)
```

## Provisional balance

All in `src/sim/config.ts` (your shop under `campaign`, the clock under `live`, sound and coin pops under `juice`). Quick play highlights:

| Parameter | Value |
|---|---|
| Starting cash | £3,600 (recommended order costs about £3,240) |
| Forecast customers per hour | 35, 48, 62, 75, 72, 58, 50, 40 (±8% hidden variation) |
| Basket per customer | 3.5 fruit & veg, 2.5 chilled, 4 cupboard items |
| Price / unit cost | fruit & veg £0.95 / £0.52 · chilled £2.40 / £1.35 short-dated or £1.55 longer-life · cupboard £1.35 / £0.82 |
| Low / high price | ×0.90 / ×1.10 price, same products. Items wanted change with each department’s price elasticity (fruit & veg and chilled 2.2, cupboard 2.7: about +26% / −19% and +33% / −23%); other departments’ baskets ×1.04 / ×0.97 (whole-trip effect); satisfaction +4 / −5 |
| Shelf / stockroom space | 300 / 600 · 260 / 450 · 600 / 1,200 |
| Staff rates per hour | tills 30 customers · fill 280 / 260 / 400 items · receive 500 items |
| Job limits | 3 tills · 2 per department · 2 receiving · 2 on break |
| Energy per hour | tills −13, filling −15, receiving −18, break +40 |
| Queue patience | 6 minutes (+2 with Bev on a till; +3 in your shop’s first three days) |
| Till time | 0.75 min per customer + 0.125 min per item (2 min for the ordinary 10-item basket) |
| Wages and overheads | £12.60/hour each; £680/day overheads |
| Targets | profit £800 · satisfaction 70 · wellbeing 60 |

With these values the attentive scripted manager (jobs set once an hour, floor jobs, bursts and questions handled as they come) wins the Quick play curated Saturday (about £1,130, satisfaction 77, wellbeing 83) and all 20 generated Saturdays in the test sample, with satisfaction only 3–7 points above the target of 70: the floor jobs and bursts now make satisfaction the tight score. The £800 profit target is unchanged. Keeping one till, never refilling shelves, never taking breaks, or accepting the default plan every hour all lose (see `npm run balance` and the balance tests).

### Your shop

`npm run campaign` plays the first week with the scripted manager (jobs set once an hour, floor jobs, bursts and questions handled as they come) and different investment paths (seeds 1–3; add a day count, e.g. `npm run campaign -- 1 sensible 21`, for longer runs):

| Path | Business value after a week (start about £2,120) | Reputation | Team |
|---|---|---|---|
| Saver (buys nothing) | about £2,900–3,200 | 57–59 | 0: three people can’t keep up and never get a break |
| Staff (Bev, Tomasz, third till) | about £4,200–4,500 | 72–74 | 80–81 |
| Chilled (chilled, Dougie, refrigeration) | about £3,900–4,150 | 65–67 | 62–65 |
| Shelves (both displays, then Bev) | about £4,550–4,750 | 71–72 | 71–75 |
| Balanced (Bev, chilled, third till, Dougie) | about £4,300–4,700 | 70–71 | 81–82 |

These are with the attentive live script (floor jobs take people off their jobs, so team wellbeing is lower than before). Over three weeks the staff path reaches about £9,200, and every day makes a profit. Chilled is never required, and a poor first two days can be recovered from (tested).

Assumptions most in need of playtesting:

- Real time: whether a minute per hour at 1x is the right pace, and whether 3x is fast enough for quiet days.
- Whether the first three days feel generous enough, and later weeks interesting enough without goals (phases 3–6 add staff growth, events, regulars and milestones).
- Supplier credit: £300 and 30% of takings; whether players notice it and understand it.
- Automatic break returns after 30 minutes: helpful, or surprising?
- The till ding’s volume and frequency (`juice` in config).

## Accessibility

- Everything works with the keyboard: Space pauses, 1–3 set the speed; Tab to a person and press Enter, then Tab to a place and press Enter to move them (dragging is never required); the person’s panel lists every job; prices and actions are buttons. Escape cancels a selection or closes a dialog.
- Status is never shown by colour alone: shelf labels say Full/OK/Low/Empty, warnings have icons and labels, energy has a word as well as a bar.
- Reduced motion (setting, or the system preference) removes walking shoppers, staff walking and coin pops. Sound can be muted from the top bar or Settings; both are remembered.
- UK English, pounds sterling.

## Known limitations

- Each department is one aggregate product; there is no individual product management.
- The queue and shopping model is a deterministic flow model of fractional customers. Queue figures are one per queuing customer; the shoppers in the aisles are representative (about ten minutes’ arrivals) and their walking is decorative. Staff walk to their new place in about a second; the walk is decorative and the move takes effect at once.
- The estimates in the panels (outlook, job previews) cover the rest of the current hour, so they get short near the end of an hour. Clearer previews are phase 2.
- Balance has been tuned with scripted strategies that decide once an hour, not with human players in real time.
- Desktop-first. Dragging works with a mouse, pen or touch, but the layout isn’t designed for phones.
- Learn to play and the pricing lessons still use the old hourly intervals and replay; phase 2 replaces them with contextual hints.
- Browsing shoppers are decoration: they only appear in departments the shop has and never carry a marker. A shopper who needs something is a floor job with its own red “!” (`chilledLocked.test.ts` checks Sunday to Tuesday with chilled locked).

## Status

Phase 1 of the cosy redesign (feel) is implemented: real time with pause and 1x/2x/3x, one-minute steps for both modes, drag-to-allocate (also while paused) with walking, actions at once, automatic break returns, endless days with no pass/fail, unlocks by day, a generous start, supplier credit, the till ding and coin pops with a remembered mute, and save conversion. The hourly replay, its settings, Run next hour, daily and weekly targets, Week complete and the overdraft game over are gone.

Phase 1b (something to do) adds life on the floor: seeded bursts announced at the door, floor jobs to drag people onto, five questions that pause the day, restocking pressure from small displays with stock out the back, forgiving rather than quieter early days, and a pacing report and dev counter.

Covered by tests: the simulation and its conservation of stock and money; minute-by-minute and hourly runs giving the same day; live play (break returns, breaks across the hour, swaps, actions while paused, exact replay from choices); the endless campaign (unlocks, growth, generous days, second week); supplier credit and repayment; saves and conversions from both old formats (questions in converted days get their first answer); the shop floor (seeded schedules, burst arrivals, jobs lowering satisfaction until sorted, people returning after a job, questions holding the day until answered, exact replay with jobs and answers, forgiving early days); the lessons.

Checked by scripted browser play at 1366×768 with no console errors: opening the shop, dragging a person to the tills while paused, 3x, coin pops, a reload mid-day resuming paused at the same minute, closing and hiring, the next morning with no cash (order on account), Quick play live, and the first lesson.

Not shown by any of this: whether it feels cosy and makes people want to play tomorrow. That needs people playing it.
