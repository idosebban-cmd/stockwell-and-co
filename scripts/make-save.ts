/** Writes a save file of the sensible strategy's first N hours (for screenshots and manual checks). Usage: vite-node scripts/make-save.ts <hours> <out.json> [default] (default: leave the next hour's plan to the game) */
import { writeFileSync } from 'node:fs';
import { playShift, sensible } from '../src/sim/bots';
import { recommendedSetup } from '../src/sim/engine';
import { RECORD_VERSION } from '../src/sim/game';
const n = Number(process.argv[2] ?? 8);
const { plans } = playShift(1, sensible);
const save = { record: { version: RECORD_VERSION, seed: 1, setup: recommendedSetup(), plans: plans.slice(0, n) }, draft: process.argv[4] === 'default' ? null : (plans[n] ?? null), savedAt: '' };
writeFileSync(process.argv[3], JSON.stringify(save));
