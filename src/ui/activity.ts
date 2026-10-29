/** Staff activity during a replay step, read from the recorded snapshot (never invented). */
import { deptName, type DeptId } from '../sim/config';
import type { HourReport } from '../sim/types';
import type { Activity } from './Store';

export interface StepActivity {
  id: string;
  name: string;
  activity: Activity;
  /** Plain-language reason, e.g. "stockroom empty". */
  why: string;
}

export function stepActivity(report: HourReport, step: number): StepActivity[] {
  const s = report.steps[Math.min(step, report.steps.length - 1)];
  return report.staff.map((r) => {
    const a = r.assignment;
    let working = true;
    let why = '';
    if (a === 'break') why = 'on a break';
    else if (a === 'tills') {
      working = s.served > 0.05;
      why = working ? 'serving customers' : 'no one waiting';
    } else if (a === 'receive') {
      working = s.received > 0.5;
      why = working ? 'receiving the delivery' : s.dock < 1 ? 'nothing on the dock' : 'stockroom full';
    } else {
      const d = a.split(':')[1] as DeptId;
      working = s.moved[d] > 0.5;
      why = working
        ? s.fridgeFault && d === 'chilled'
          ? 'moving stock from the broken chiller'
          : `filling ${deptName(d).toLowerCase()}`
        : s.backroom[d] < 1
          ? `stockroom empty${s.dock > 0 ? ' (stock still on the dock)' : ''}`
          : 'shelves already full';
    }
    return { id: r.id, name: r.name, activity: working ? 'work' : 'idle', why };
  });
}
