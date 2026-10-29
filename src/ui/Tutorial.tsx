/**
 * The guided shift. Progress lives under its own storage key, separate from
 * the full-game save, and only records which lesson to start next: a reload
 * always restarts the current lesson from its fixed starting state.
 */
import { useCallback, useMemo, useState } from 'react';
import { planErrors } from '../sim/engine';
import type { StorageLike } from '../sim/save';
import { CORE_LESSONS, LESSONS, lessonPlan, runLesson, type LessonResult } from '../sim/tutorial';
import type { HourPlan, HourReport, SimState } from '../sim/types';
import { ContextCard, intervalLabel, PriceComparison, StaffCard, type PanelOptions } from './PlanPanel';
import { ReplayPanel } from './ResultsPanel';
import type { PanelContext, PrimaryAction } from './ShopScreen';

export const TUTORIAL_KEY = 'stockwell-and-co:tutorial';

export interface TutorialProgress {
  active: boolean;
  lesson: number;
  done: string[];
}

export function loadTutorial(storage: StorageLike | null): TutorialProgress {
  try {
    const raw = storage?.getItem(TUTORIAL_KEY);
    if (!raw) return { active: false, lesson: 0, done: [] };
    const p = JSON.parse(raw) as Partial<TutorialProgress>;
    const lesson = Number.isInteger(p.lesson) && p.lesson! >= 0 && p.lesson! < LESSONS.length ? p.lesson! : 0;
    const done = Array.isArray(p.done) ? p.done.filter((x): x is string => typeof x === 'string' && LESSONS.some((l) => l.id === x)) : [];
    return { active: p.active === true, lesson, done };
  } catch {
    return { active: false, lesson: 0, done: [] };
  }
}

export function saveTutorial(storage: StorageLike | null, p: TutorialProgress): void {
  try {
    storage?.setItem(TUTORIAL_KEY, JSON.stringify(p));
  } catch {
    /* progress just won't survive a reload */
  }
}

export function basicsDone(p: TutorialProgress): boolean {
  return LESSONS.filter((l) => !l.optional).every((l) => p.done.includes(l.id));
}

type TutorialPhase = 'plan' | 'replay' | 'results' | 'basics' | 'finished';

export function useTutorial(storage: StorageLike | null, skipReplay: boolean) {
  const [progress, setProgressState] = useState<TutorialProgress>(() => loadTutorial(storage));
  const setProgress = useCallback(
    (p: TutorialProgress) => {
      setProgressState(p);
      saveTutorial(storage, p);
    },
    [storage],
  );
  const [start, setStart] = useState<SimState>(() => LESSONS[progress.lesson].build());
  const [draft, setDraft] = useState<HourPlan>(() => lessonPlan(start));
  const [phase, setPhase] = useState<TutorialPhase>('plan');
  const [run, setRun] = useState<{ after: SimState; report: HourReport; result: LessonResult } | null>(null);
  const [attempts, setAttempts] = useState<Record<string, LessonResult[]>>({});
  const lesson = LESSONS[progress.lesson];

  const load = useCallback(
    (i: number, p: TutorialProgress) => {
      const s = LESSONS[i].build();
      setStart(s);
      setDraft(lessonPlan(s));
      setRun(null);
      setPhase('plan');
      setProgress({ ...p, active: true, lesson: i });
    },
    [setProgress],
  );

  const begin = useCallback((i = 0) => load(i, progress), [load, progress]);
  const exit = useCallback(() => setProgress({ ...progress, active: false }), [progress, setProgress]);

  const runNow = useCallback(() => {
    if (phase !== 'plan' || planErrors(start, draft).length) return;
    const r = runLesson(lesson, start, draft);
    setRun(r);
    setAttempts((a) => {
      const prev = (a[lesson.id] ?? []).filter((x) => x.choice !== r.result.choice);
      return { ...a, [lesson.id]: [...prev, r.result] };
    });
    setPhase(skipReplay ? 'results' : 'replay');
  }, [phase, start, draft, lesson, skipReplay]);

  const finishReplay = useCallback(() => setPhase('results'), []);
  const retry = useCallback(() => load(progress.lesson, progress), [load, progress]);

  const advance = useCallback(
    (markDone: boolean) => {
      const done = markDone && !progress.done.includes(lesson.id) ? [...progress.done, lesson.id] : progress.done;
      const p = { ...progress, done };
      const i = progress.lesson;
      if (i === CORE_LESSONS - 1) {
        setProgress({ ...p, lesson: i });
        setPhase('basics');
      } else if (i >= LESSONS.length - 1) {
        setProgress({ ...p, lesson: i });
        setPhase('finished');
      } else load(i + 1, p);
    },
    [progress, lesson, load, setProgress],
  );

  const state = phase === 'plan' || !run ? start : run.after;
  return {
    progress,
    lesson,
    index: progress.lesson,
    phase,
    start,
    state,
    draft,
    setDraft,
    run,
    attempts: attempts[lesson.id] ?? [],
    begin,
    exit,
    runNow,
    finishReplay,
    retry,
    next: () => advance(true),
    skipLesson: () => advance(false),
    startPricing: () => load(CORE_LESSONS, progress),
  };
}

export type Tutorial = ReturnType<typeof useTutorial>;

/** The action bar's main button during the guided shift. */
export function lessonPrimary(t: Tutorial, onFullSaturday: () => void): PrimaryAction | null {
  if (t.phase === 'basics' || t.phase === 'finished') return { label: 'Start the week ▶', onClick: onFullSaturday };
  if (t.phase === 'replay') return { label: 'Skip replay ▶', onClick: t.finishReplay };
  if (t.phase === 'results' && t.run) {
    const last = t.index === CORE_LESSONS - 1 || t.index === LESSONS.length - 1;
    return t.run.result.passed ? { label: last ? 'Finish ▶' : 'Next lesson ▶', onClick: t.next } : { label: 'Try again ▶', onClick: t.retry };
  }
  const errors = planErrors(t.start, t.draft);
  return { label: `Run ${intervalLabel(t.lesson.steps)} ▶`, onClick: t.runNow, disabled: errors.length > 0, note: errors[0], noteTone: errors.length ? 'bad' : undefined };
}

/** Side panel for the guided shift: one instruction, then whatever is selected. */
export function LessonPanel({ t, ctx, onFullSaturday }: { t: Tutorial; ctx: PanelContext; onFullSaturday: () => void }) {
  const { lesson, index } = t;
  const core = !lesson.optional;
  const kicker = core ? `Lesson ${index + 1} of ${CORE_LESSONS} · ${lesson.title}` : `Pricing lesson ${index - CORE_LESSONS + 1} of ${LESSONS.length - CORE_LESSONS}`;
  const focus = lesson.focus(t.start, t.draft);
  const opts: PanelOptions = useMemo(() => ({ steps: lesson.steps, allowActions: false, pricing: focus.priceDept ?? 'none' }), [lesson.steps, focus.priceDept]);

  if (t.phase === 'basics')
    return (
      <div className="panel-inner lesson">
        <p className="panel-kicker">Basics done</p>
        <h2>You can run the shop.</h2>
        <p>Serving, filling, unloading, breaks and trade-offs: that is the whole job.</p>
        <button type="button" className="btn-secondary" onClick={t.startPricing}>
          Pricing lessons (2 short)
        </button>
      </div>
    );
  if (t.phase === 'finished')
    return (
      <div className="panel-inner lesson">
        <p className="panel-kicker">All lessons done</p>
        <h2>Ready for Saturday.</h2>
        <button type="button" className="btn-link" onClick={onFullSaturday}>
          Start the week
        </button>
      </div>
    );
  if (t.phase === 'replay' && t.run) return <ReplayPanel report={t.run.report} step={ctx.step} />;
  if (t.phase === 'results' && t.run) {
    const r = t.run.result;
    const compare = t.attempts.length > 1;
    const choiceLesson = lesson.id === 'tradeoff' || lesson.optional;
    return (
      <div className="panel-inner lesson">
        <p className="panel-kicker">{kicker}</p>
        <p className={`lesson-result ${r.passed ? 'pass' : 'fail'}`} role="status">
          <span aria-hidden="true">{r.passed ? '✓' : '!'}</span> {r.sentence}
        </p>
        {compare ? (
          <table className="mini-table attempts">
            <caption className="tiny muted">Same start, same customers</caption>
            <thead>
              <tr>
                <th scope="col">Choice</th>
                {r.figures.map((f) => (
                  <th key={f.label} scope="col">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.attempts.map((a) => (
                <tr key={a.choice} className={a.choice === r.choice ? 'pc-on' : ''}>
                  <th scope="row">{a.choice}</th>
                  {a.figures.map((f) => (
                    <td key={f.label}>{f.value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <dl className="figures">
            {r.figures.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="lesson-buttons">
          {r.passed ? (
            <button type="button" className="btn-secondary" onClick={t.retry}>
              {choiceLesson ? 'Try another choice' : 'Try again'}
            </button>
          ) : (
            <button type="button" className="btn-link" onClick={t.skipLesson}>
              Skip this lesson
            </button>
          )}
        </div>
      </div>
    );
  }
  const checks = lesson.checklist(t.start, t.draft);
  const sel = ctx.sel;
  return (
    <div className="panel-inner lesson">
      <p className="panel-kicker">{kicker}</p>
      <h2 className="lesson-objective">{lesson.objective}</h2>
      {!lesson.optional && checks.length > 1 && (
        <ul className="checklist">
          {checks.map((c) => (
            <li key={c.label} className={c.done ? 'done' : ''}>
              <span aria-hidden="true">{c.done ? '✓' : '○'}</span> {c.label}
              <span className="sr-only">{c.done ? ' (done)' : ' (to do)'}</span>
            </li>
          ))}
        </ul>
      )}
      {!lesson.optional && checks.length === 1 && checks[0].done && (
        <p className="lesson-ready" role="status">
          ✓ {checks[0].label}. Run when ready.
        </p>
      )}
      {focus.priceDept ? (
        <PriceComparison state={t.start} plan={t.draft} onChange={ctx.onPlanChange} d={focus.priceDept} steps={lesson.steps} />
      ) : sel?.kind === 'staff' ? (
        <StaffCard state={t.start} plan={t.draft} onChange={ctx.onPlanChange} id={sel.id} onClose={() => ctx.setSel(null)} />
      ) : sel?.kind === 'zone' ? (
        <ContextCard state={t.start} plan={t.draft} onChange={ctx.onPlanChange} zone={sel.zone} onClose={() => ctx.setSel(null)} opts={opts} onOpen={(z) => ctx.setSel({ kind: 'zone', zone: z })} />
      ) : null}
      <button type="button" className="btn-link lesson-skip" onClick={t.skipLesson}>
        Skip this lesson
      </button>
    </div>
  );
}
