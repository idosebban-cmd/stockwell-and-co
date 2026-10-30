# Stockwell & Co: design rules

These rules apply to every screen, feature and change in the game. Check every piece of work against them. If an existing part of the game breaks a rule, fix or remove it.

## Who it's for

A fun, silly shop game played by a parent and their son. It should be easy to pick up, visual, and enjoyable to watch together.

## The rules

1. **Show it in the shop.** If something needs a sentence, show it visually instead: on the shelves, the people, the floor. The game should be playable with the sound off and without reading anything longer than a few words.
2. **Five words or fewer.** Every label, button, bubble and message. No paragraphs anywhere.
3. **One number on screen: cash.** No percentages, per-item prices, fees, rates or forecasts during play. Show quantities through pictures (full or empty shelves, long or short queues, yawning or bouncy staff, happy or grumpy faces).
4. **Remove before explaining.** If a system needs explaining, simplify or remove it. Never add a rule, limit or warning to patch another rule.
5. **No admin.** The player never does paperwork: no detailed ordering, no supply-chain choices, no spreadsheets. Routine jobs (stocking, deliveries, breaks) happen by themselves; the player steps in only when it's interesting.
6. **Every problem has an action.** Never show a problem the player can't do anything about. Never show a disabled button with an explanation.
7. **The player's job is the fun part.** Moving staff around, handling surprises, and choosing upgrades that visibly change the shop. Everything else is automatic.
8. **Picture first.** Upgrades, staff and events are presented as picture cards: image, name, at most one short line.
9. **Calm with moments of busy.** Peaks should feel lively, with calm stretches in between. Never a constant stream of prompts.
10. **Nobody loses.** Bad days are funny or mildly costly, never game-ending. End of day: 1–3 stars and one highlight.
11. **Silly is welcome.** Exaggerated reactions, funny sounds and surprises are part of the game, not decoration.

## Project notes

- React 18 + TypeScript + Vite, SVG art, Vitest. `npm test`, `npm run build`.
- The simulation is pure TypeScript in `src/sim` (no React). All tuning values live in `src/sim/config.ts`.
- Shop art: `src/ui/art/Shop.tsx` (scene and `layoutFor(fit)`, the positions everything else uses) and `src/ui/art/Characters.tsx` (chibi staff and shoppers).
- Keep UK English and £, keyboard access, reduced-motion support and autosave.
