/** Writes a Quick play save of the sensible strategy's first N hours (for screenshots and manual checks). Usage: vite-node scripts/make-save.ts <hours> <out.json> */
import { writeFileSync } from 'node:fs';
import { playShift, sensible } from '../src/sim/bots';
import { recommendedSetup } from '../src/sim/engine';
import { convertRecordV3 } from '../src/sim/game';
const n = Number(process.argv[2] ?? 8);
const { plans } = playShift(1, sensible);
const save = { record: convertRecordV3({ seed: 1, setup: recommendedSetup(), plans: plans.slice(0, n) }), savedAt: '' };
writeFileSync(process.argv[3], JSON.stringify(save));
