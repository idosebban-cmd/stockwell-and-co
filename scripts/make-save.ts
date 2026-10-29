import { writeFileSync } from 'node:fs';
import { playShift, sensible } from '../src/sim/bots';
import { recommendedSetup } from '../src/sim/engine';
const n = Number(process.argv[2] ?? 8);
const { plans } = playShift(1, sensible);
const save = { record: { version: 1, seed: 1, setup: recommendedSetup(), plans: plans.slice(0, n) }, draft: null, savedAt: '' };
writeFileSync(process.argv[3], JSON.stringify(save));
