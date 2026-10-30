# Stockwell & Co

A single-player browser game about running a small independent British supermarket. The main mode is **the week**: seven days, Sunday to Saturday, in the same shop. You start small (two departments, three staff, two tills), earn enough to improve the shop, and finish on the busiest day of the week. Each hour you make staffing and commercial decisions, run it, watch what happens and adjust.

**Quick play** keeps the original standalone Saturday in the fully fitted shop: eight hourly turns, three departments, six employees. **Learn to play** is an optional five-minute set of lessons; the week also introduces things as it goes.

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
npm run campaign    # whole weeks with different investment paths (seeds as an argument: npm run campaign -- 1,2,3)
```

The build is static (`dist/`, relative paths) and can be opened from any static file host. There is no backend, account or external asset.

## How to play

1. **Home.** **Start the week** (or **Continue the week · Tuesday**), **Quick play: one Saturday**, and links to **Learn to play** and Quick play with a custom order. If a saved week can’t be continued with the current rules, the home screen says so instead of silently dropping it.
1. **The week.** Each day has three parts.
   - *Before opening:* an illustrated briefing beside the shop as it will open. Seven day markers with today highlighted, the trading hours by a clock, **Expected customers** as a small hourly chart with the busiest hour marked, and a **Today: £N profit** badge. Three picture cues (Serve, Restock, Rest on Sunday; Unload on Monday; Prices on Tuesday) highlight where that happens in the shop and show one sentence; they assign nobody. The order is shown on the shop itself (“+170 arriving” by the crates, “600 in stock · No order” by the shelves, the midday lorry by the dock), with **Order** and **Cash after** in the panel, **Adjust order**, and an ⓘ for how it is worked out. **Week goals · N of 3 met now** opens the three goals (checked on Saturday night) and a separate **How calculated**. **Confirm order & open** buys the order and starts trading.
   - *Trading:* the same shop screen as Quick play (below). The top bar shows today’s profit against today’s goal, reputation, the team over the week and business value against the week’s goal.
   - *After closing:* **<Day> complete** with three illustrated indicators (profit, customer satisfaction, staff wellbeing), each with its value and target; a takeaway only when there is something useful to say. Below, **Improve the shop**: candidates as portraits with their speciality symbol and costs (“Bev · Calm queues · £60 hire · £12.60/hour”), equipment as pictures with a quantified benefit. Selecting one opens a single detail panel (a hire’s actual ability, tomorrow’s wages, hiring cost and cash after; equipment as before → after) with **Hire Bev** or **Buy …**; selecting never buys. “Suggested” appears only when the day’s results give a reason, unavailable options say why (“From Wed”, “Short of £…”), and chilled extras appear once there is chilled. Cash, **Next day** and **View report** sit at the bottom; continuing without buying is fine. **Restart day** is in the menu. New staff join the shop as the same characters and bought fixtures appear the next morning.
   - After Saturday: **Week complete** with business value, reputation and team against the week’s goal, and a day-by-day report.
2. **Learn to play** (about five minutes). Five lessons, each a 30-minute engine interval on a quiet, fixed Saturday with no purchases, promotions or faults: *Serve customers*, *Fill a shelf*, *Unload a delivery* (dock → stockroom → shelves), *Take a break* and *A trade-off* (two reasonable choices, compared side by side). Each lesson shows one instruction and highlights one target at a time: the person, then (once they are selected) the place they should go; other places show no hints. After running you get one sentence and the figures that decided it. You can **Try again** (same start, same customers, attempts compared in a table), **Skip** or exit at any time. Two optional pricing lessons follow with opposite answers: too much short-dated chilled in the last hour (the low price sells enough more to bin less and earn the most after waste) and too little fruit & veg (all prices sell out, so the high price earns more per item). Tutorial progress is stored separately from the game save; reloading restarts the current lesson.
3. **Each hour.** The screen has three layers. *Always visible:* the illustrated shop, the top bar (time, cash, profit, customers, staff) and one action bar under the shop with a compact day timeline, **Needs attention · N**, **Team** and **Run next hour**. *On selection:* one panel on the right for whatever you selected (a person, a department, the tills, the dock, the break room, a problem); opening something else replaces it. *On request:* forecast (click the timeline), outlook estimates, price comparisons, staff specialities and detailed results. Fixtures carry no permanent counts, staff badges or name tags; a small “!” marks a fixture that needs attention (red when urgent), “Low”/“Empty” marks a shelf, “z” a tired person. Counts appear for the selected place; name and energy for the selected person. **Needs attention** lists the problems, most urgent first, and each opens its card: what is wrong, what is at risk, what happens if you wait, and only the responses that work here, with cost, staff and timing (the chiller fault card books the engineer, with undo, and shows who is moving stock to the cold room). Jobs are *Serve customers*, *Fill produce / chilled / grocery shelves*, *Unload delivery* and *Take a break*. Selecting someone shows their current job, energy and the rate they would achieve in each job (or why a job would achieve nothing, e.g. “Nothing on the dock to unload”); places in the shop are highlighted with the same figures. Each move is confirmed, with any change to the estimate (“Mags will unload deliveries next hour. Estimate: Delivery dock: short → OK.”). Prices: a department shows its current price; **Change prices** opens the Low / Regular / High comparison (price, margin, estimated units sold, gross profit; waste, after-waste profit, leftovers and customer mood under Details) with a one-line trade-off from the figures. No price is marked best. Spending and cash after show beside the run button. R runs the hour, Escape clears a selection.
4. **Replay and results.** The replay is labelled “Replay of what happened” with its clock, and can be skipped. Planning then resumes with a short summary in the panel: at most three outcomes, each from recorded data (for example “Unloaded 288”, “201 chilled items wanted weren’t on the shelf”, “Served 80 customers; nobody gave up”), with matching tags in the shop beside the shelf, dock or till. **View details** has the full breakdown; dismissing it, or selecting anything, clears the summary and the tags.
5. **Closing (both modes).** **Shift complete**, how many targets were met, three scores with their targets (Profit, Customers, Staff), one takeaway from the recorded results and the main action (**Next day** in the week, **Try again** in Quick play), all on one laptop screen. **View report** opens tabs: *Accounts* (profit breakdown, cash, stock left; business value in the week), *Operations* (customers, availability, money actually spent, estimated profit missed and missed opportunities, kept apart) and *Team* (hours, breaks, energy, quiet hours). The advice only suggests what was possible at the time (no emergency order that would arrive after closing), treats repairs as costs rather than mistakes, and names a cause for a missed target only when the recorded figures support it.

Profit is shown as progress towards the £800 target ("£289 / £800") and stays neutral until closing; cash is a separate indicator.

**The week’s goal** (shown from the first morning): finish Saturday with business value at least £1,500 above the start (£1,770 → £3,270), reputation 65+ and team wellbeing 60+. Each day also has its own profit goal. **Quick play** is won with operating profit of £800 or more, customer satisfaction of 70 or more and staff wellbeing of 60 or more.

## Design in brief

- **Stock** is held as dated batches in three places per department: shelf, stockroom and dock. Customers can only buy from shelves. Shelves only refill from the stockroom, by staff assigned to that department. Deliveries need receiving before they reach the stockroom.
- **Perishables.** Friday's produce goes past its best at 13:00; produce on display bruises slowly. Chilled is bought per delivery as short-dated ("use by Sunday", £1.35, binned at close if unsold because the shop is closed on Sundays) or longer-life ("use by Wednesday", £1.55, keeps its value). The recommended order buys short-dated in the morning and longer-life at midday. Emergency chilled is longer-life. Chilled stock on the dock spoils quickly. Cupboard stock keeps. Rotation is good but not perfect, so some fresher stock sells first.
- **Midday room estimate.** The order screen estimates the space at 12:00 from forecast sales before the lorry arrives (at the chosen prices, assuming shelves are kept filled), and says roughly when any overflow will have cleared from the dock. It ignores the hidden demand variation, so it is labelled as an estimate.
- **Prices.** Low, Regular and High are the same products at different prices. With the elasticities above, the regular price earns about the most on an ordinary day; the high price earns more when stock is short (everything sells anyway) and when the tills are congested (smaller baskets scan faster, so fewer people give up); the low price earns more when perishable stock would otherwise be binned. Unsold cupboard stock keeps its value, so cutting its price only pays through the whole-trip effect. `npm run pricing` measures each situation over eight seeds (full days with short and recommended orders, surplus near expiry, plenty of stock, one till in the rush). These are modelling choices, not measured shopper behaviour.
- **Customers and queues.** Each hour is simulated in six ten-minute steps. The engine can also run part of an hour (`runSteps`); wages, overheads, fatigue and rest are pro-rated per step and breaks are settled at the hour's end, so a full hour gives exactly the same result as before. The tutorial uses three-step intervals. Shoppers pick from the shelves and join the queue. When the expected wait exceeds their patience, a share leave; their baskets go back on the shelves (some chilled is binned). The queue carries over between hours.
- **Money.** Stock purchases spend cash and create inventory. A sale recognises revenue and the cost of the goods sold; waste writes off the cost of what expired. Wages and other costs reduce profit. Unsold stock keeps its value at cost. Tests check that no item or pound is created, lost or counted twice.
- **Staff.** Energy falls while working and recovers on a break. Below 50, people slow down. Wellbeing is based on strain accumulated across the shift (low energy, long stretches without a break, no break at all), so resting everyone at the end does not undo the day. Specialities are modest (+15%) and don't decide the allocation.
- **Satisfaction** is a customer-weighted average of each hour's experience: availability, waiting, walk-outs and prices. Each hour shows the reasons. Footfall reacts only slightly (between −8% and +4%), so an early mistake is recoverable.
- **Actions** (limited, previewed with cost, timing and effect): markdown (yellow stickers on short-dated stock, once per fresh department), promotion (two hours, one at a time, two per day), emergency order (1.5× cost plus fee, arrives next hour on the dock, two per day, not after closing), agency temp (arrives next hour, booking fee plus hourly, once), chiller engineer (only while the chiller is broken).
- **Events.** At most two per Saturday: an unexpected rush (announced two hours ahead), a delayed midday delivery (announced an hour ahead), and a chiller fault (half the chilled shelf out of use: rescue the stock with staff, call the engineer, or both). No unannounced event lands in the last two hours. The first Saturday is curated: a chiller fault at 11:00 and a rush at 14:00.
- **Determinism.** The seed fixes the demand variation and events. A game is stored as seed + setup + committed hourly plans and rebuilt by replaying them, so the same decisions always give the same result. The replay animation only displays recorded steps and cannot affect results.

## The week in brief

- **Pacing.** Every day opens at 09:00 and runs for its real trading hours, so wages, fatigue, costs and demand are per hour throughout. Sunday 4 hours (about 90 customers), Monday 5, Tuesday and Wednesday 6, Thursday and Friday 7, Saturday 8 (the Quick play Saturday’s demand, about 440 customers). Patterns differ: Wednesday is busiest first thing (market day), Thursday rises after work, Friday is steady and busy, Saturday peaks at lunchtime with an announced rush.
- **Introductions in play.** Sunday: serve, fill shelves, breaks (no deliveries during the day, prices fixed). Monday: a midday delivery to unload, emergency orders. Tuesday: prices, markdowns and promotions. Wednesday: the chilled department can be bought; agency temps. Announced disruptions: a late lorry on Wednesday, the after-work rush on Thursday, a rattling chiller on Friday (only if the shop has chilled cabinets without better refrigeration), Saturday’s rush.
- **What carries over.** Cash; stock with its date (stock is dated “use by <day>”; whatever is past its date before the next opening is binned at closing, and nothing else is); the night crew puts dock stock away where there is room (chilled that doesn’t fit is binned, the rest waits on the dock); fruit & veg ages 3% overnight; installed equipment; staff and their specialities; reputation; prices.
- **People.** Energy recovers overnight, but 40% of each person’s strain carries into the next day and lowers their morning energy (up to −25). Team wellbeing over the week is based on that carried strain, so a run of long days without breaks shows up even after a good night.
- **Reputation.** Starts at 70. Each day moves it 40% of the way towards that day’s customer satisfaction. Footfall follows it gently (between −12% and +12%), so a poor day costs customers without ending the week.
- **Orders.** The recommended order is the forecast at today’s prices, less stock already in the shop, within the shelf and stockroom space, and split between the morning delivery and the midday lorry when there is one. It can use the £500 overdraft (the screen says so); one hour of wages and costs is kept back. Nothing is bought without confirming.
- **Improvements** (any order, none required; each shows upfront cost, running cost, effect and cash after):

  | Improvement | Cost | Running cost | Effect |
  |---|---|---|---|
  | Hire Bev, Tomasz or Dougie | £60 induction | £12.60 an hour on shift | Another person, with their speciality |
  | Third till | £450 | — | Up to 30 more customers an hour, when staffed |
  | More fruit & veg display | £280 | — | Shelf 200 → 300 (a third row of crates) |
  | Third grocery aisle | £320 | — | Shelf 400 → 600 |
  | Chilled department (from Wednesday) | £850 | £18 a day | Two cabinets and a cold room; half the chilled range |
  | Two more chilled cabinets | £350 | £6 a day | Chilled shelf 130 → 260 and the full range |
  | Better refrigeration | £300 | — | No cabinet faults; chilled on the dock spoils half as fast |

- **Accounting.** Business value = cash + usable stock at cost + equipment at purchase cost − overdraft. Buying stock or equipment moves cash into stock or equipment; it is not an expense. Stock becomes a cost when sold (cost of goods) or written off (waste). Wages, rent and rates (£90 a day), energy and other costs (£14 per trading hour), running costs and a hire’s induction fee are operating costs. Daily operating profit and business value are shown separately; the breakdown is behind **View report**.
- **Failure** only when cash at closing is below the £500 overdraft, i.e. the shop can’t pay for tomorrow. Any day can be restarted from its morning.
- **Saving.** The week is stored as decisions (each day’s order, hourly plans and purchases) under its own key and rebuilt by replaying them, so reloading between days or mid-shift and restarting a day are exact. Quick play saves are unchanged and still load.

## Code layout

```
src/sim/            Pure TypeScript simulation (no DOM, no timers)
  config.ts         All balancing parameters, with comments
  engine.ts         startDay (Quick play) / startShift (any day), runHour, plan validation, action
                    rules, queries; every shift has a DayContext (hours, departments, tills, space…)
  campaign.ts       The week: persistent state, each day's shop and forecast, recommended orders,
                    closing, investments, business value, the decision record and rebuild
  stock.ts          Batch operations (FIFO/expiry/share), used for conservation
  scenario.ts       Seeded scenarios; seed 1 is the curated first Saturday
  roster.ts         The six employees, specialities and default jobs
  explain.ts        Directional pre-turn warnings and post-turn explanations
  insight.ts        Estimates for the UI from engine runs: outlook, job previews, problems,
                    chiller-fault facts, price comparison, interval outcomes
  tutorial.ts       Lessons: controlled starting states, objectives, checks and results
  summary.ts        Closing scores, the takeaway, accounts, costs vs estimates, missed opportunities
  game.ts           Game record (seed + decisions) and rebuild-by-replay
  save.ts           localStorage autosave and settings, failure-tolerant
  bots.ts           Scripted strategies for tests and balance runs
  sim.test.ts       Vitest suite (tutorial.test.ts: lessons and insight; campaign.test.ts: the week)
src/ui/             React components: ShopScreen.tsx (shop, action bar and one contextual panel, shared by the game
                    and the tutorial), Tutorial.tsx (lesson panel and progress), Store.tsx (illustrated shop), art/Characters.tsx (staff and
                    shoppers), PlanPanel.tsx (staff, context card, prices and actions), activity.ts
                    (staff activity from replay snapshots), Closing.tsx (result and report),
                    CampaignScreens.tsx (before opening, offers, end of week), useCampaign.ts, setup, dialogs
src/App.tsx         Phases, replay timer, keyboard shortcuts
scripts/            Balance and playtest scripts (run with vite-node)
```

## Provisional balance

All in `src/sim/config.ts` (the week under `campaign`). Quick play highlights:

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
| Queue patience | 6 minutes (+2 with Bev on a till) |
| Till time | 0.75 min per customer + 0.125 min per item (2 min for the ordinary 10-item basket) |
| Wages and overheads | £12.60/hour each; £680/day overheads |
| Targets | profit £800 · satisfaction 70 · wellbeing 60 |

With these values the scripted "sensible" manager wins the Quick play curated Saturday (about £1,100, satisfaction 79, wellbeing 90) and 19 of 20 generated Saturdays in the test sample. That is probably slightly generous for a real first-time player, and is the first thing to check in playtesting. Keeping one till, never refilling shelves, never taking breaks, or accepting the default plan every hour all lose (see `npm run balance` and the balance tests).

### The week

`npm run campaign` plays whole weeks with the scripted manager and different investment paths (seeds 1–3):

| Path | Business value (goal £3,270) | Reputation | Team | Result |
|---|---|---|---|---|
| Saver (buys nothing) | about £2,900 | about 60 | 0 | Misses: three people can’t keep up and never get a break |
| Staff (Bev, Tomasz, third till) | about £3,600–3,700 | 76–77 | 89 | Wins |
| Chilled (chilled, Dougie, refrigeration) | about £4,000–4,100 | 66–67 | 90 | Wins |
| Shelves (both displays, then Bev) | about £3,950–4,000 | 74–75 | 89–90 | Wins |
| Balanced (Bev, chilled, third till, Dougie) | about £3,150–3,330 | 64–66 | 90 | Wins 2 of 3 |

Chilled is never required. A poor Sunday and Monday (nobody filling shelves) can still finish with the goal met (tested). Daily profit goals are £20, £40, £110, £140, £170, £220 and £320.

Assumptions most in need of human playtesting:

- Whether £1,500 of growth is the right goal for real players. The scripted manager is mechanical: better than people at some things (it never forgets the dock), worse at others (it plays the same way every hour).
- Whether the chilled department feels worth £850. With two cabinets it carries half the range, so it pays slowly until the second pair of cabinets; with too few staff it stretches every shelf.
- Whether the start (three people, two tills) is tight in an interesting way, or just leaves no room for breaks.
- Reputation pull (40% a day) and the overnight fatigue carry (40%): whether one bad day feels fair and recoverable.
- The overdraft-backed recommended order: whether players understand the shop can briefly go below zero.
- Hire cost (£60 plus wages) versus equipment: hires look cheap upfront but cost every hour; whether that is visible enough.

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
- Quick play saves from an incompatible version (before the price-level change) are discarded rather than migrated. A saved week that can’t be continued is reset with a message on the home screen.
- The week has fixed days and demand patterns; only the hidden variation changes with the seed. There is no free placement of fixtures, no loans and no second week with the same shop.

## Playtest questions

The central question: **does changing a staffing or commercial decision create an understandable, interesting consequence elsewhere in the shop?** For example, `npm run consequence` takes the 12:00 hour of the first Saturday and moves one person from tills to receiving. The preview warns "Checkout capacity is likely to fall short", and the result shows 7 walk-outs and about £100 of abandoned shopping, where the original plan had none.

For the week: does “I earned enough to improve my shop, I can see the difference, and I want to play tomorrow” happen? Do players understand why a day went badly from the takeaway alone? Do the offers feel relevant to what just happened?

Also worth watching for: whether the three-layer screen still shows enough without clicking (or hides something people needed); whether pricing feels like a real choice; whether the tutorial is enough to play a full Saturday without help; whether problems are recognised from the shop and the cards; whether the midday delivery and unloading make sense; whether breaks feel worth their cost; whether the markdown and chiller decisions feel like real choices.

## Status: implemented vs provisional

Implemented and covered by tests: the simulation (stock, perishables, queues, money, staff, events, interventions), short intervals, Quick play unchanged by the campaign work (`scripts/quickplay-hash.ts` fingerprints 16 Saturdays by their numbers), the tutorial lessons and insight layer, the pricing economics, and the week: carrying cash, dated stock and upgrades forward; overnight expiry, recovery and carried fatigue; reputation; wages for hires and running costs; locked departments, uninstalled tills and fixed prices; purchases that can’t be duplicated, made without the cash, made too early or without their prerequisite; recommended orders within funds and space and adapting to stock on hand; default plans valid every hour; rebuilding between days and mid-shift; restarting a day; saving and loading the week; incompatible week saves reported; old Quick play saves still loading; three investment paths completing the week; recovery from a poor start; closing advice (no late emergency orders, costs apart from estimates, repairs not mistakes, causes only when big enough).

Checked by scripted browser play-throughs at 1366×768, with no console errors: the whole week from the home screen (buying a hire and chilled, a reload mid-shift on Thursday that resumed at the same hour, restarting Friday, Saturday and the week result); winning weeks loaded from saves through to **Week complete**; the busiest states (Friday with the full team, Saturday’s rush with four chilled cabinets); the closing screen fitting one screen without scrolling in both modes; the tutorial end to end; Quick play to closing and **Try again**.

Not shown by any of this: whether the week is fun or makes people want to play tomorrow. That needs people playing it.

Provisional: all balance values in `src/sim/config.ts` (tuned with scripted strategies, not people); the outlook is an estimate from the forecast; the art is simple SVG and character sizes are small at laptop width.
