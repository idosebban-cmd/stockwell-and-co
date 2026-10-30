import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hourLabel } from '../sim/config';
import { assignmentLimit, clockLabel, deptUnits, onShift, perDept, shelfCapacity } from '../sim/engine';
import type { AssignmentId, HourPlan, SimState } from '../sim/types';
import { layoutFor } from './art/Shop';
import { queueTooLong, shopBubbles } from './bubbles';
import { fitFromContext, Store, storeViewFromState, type CoinPop, type StoreFloor, type StoreView } from './Store';
import { liveBrowsing } from './shopperLayout';

/** What the side panel is showing. */
export type Selection = { kind: 'staff'; id: string } | { kind: 'office' } | null;

export interface PanelContext {
  sel: Selection;
  setSel: (s: Selection) => void;
}

interface Props {
  state: SimState;
  plan: HourPlan;
  /** The clock is running (or paused) on a trading day. */
  live: boolean;
  reduced: boolean;
  /** False shows the shop without letting the player move anyone (before opening). */
  interactive?: boolean;
  panel: (ctx: PanelContext) => ReactNode;
  /** One big button under the shop (before opening). */
  primary?: { label: string; onClick: () => void } | null;
  onMove?: (staffId: string, job: AssignmentId) => void;
  pops?: CoinPop[];
  paused?: boolean;
  floor?: StoreFloor;
  onAssignTask?: (taskId: string, staffId: string) => void;
  /** A few words to show briefly (what a surprise answer did). */
  notice?: { id: number; text: string } | null;
  /** Your shop: the office opens hiring. */
  office?: boolean;
}

export function ShopScreen({ state, plan, live, reduced, interactive = true, panel, primary, onMove, pops, paused, floor, onAssignTask, notice, office }: Props) {
  const [sel, setSel] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const selectedId = sel?.kind === 'staff' ? sel.id : null;

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => {
    if (notice?.text) say(notice.text);
  }, [notice, say]);

  /** Moves someone now, swapping with the person there if the place is full. */
  const moveTo = useCallback(
    (id: string, job: AssignmentId) => {
      setSel(null);
      if (!onMove || plan.assignments[id] === job || assignmentLimit(job, state) === 0) return;
      onMove(id, job);
    },
    [plan, onMove, state],
  );
  const onTask = useCallback(
    (taskId: string, staffId: string | null) => {
      if (!staffId || !onAssignTask) return;
      setSel(null);
      onAssignTask(taskId, staffId);
    },
    [onAssignTask],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view = useMemo(() => buildView(state, live), [state, live]);
  const fit = fitFromContext(state.ctx);
  const L = layoutFor(fit);
  const bubbles = live ? shopBubbles(state, plan, L) : [];
  const selectedStaff = state.staff.find((s) => s.id === selectedId);
  const canMove = interactive && live;

  return (
    <main className="shop" id="main">
      <div className="stage-col">
        <div className="store-stage">
          <Store
            view={view}
            staff={onShift(state)}
            assignments={plan.assignments}
            fit={fit}
            selected={canMove ? selectedId : null}
            onSelectStaff={(id) => setSel(selectedId === id ? null : { kind: 'staff', id })}
            onZone={(a) => selectedId && moveTo(selectedId, a)}
            interactive={canMove}
            animating={live && !paused}
            onDrop={onMove && canMove ? moveTo : undefined}
            pops={pops}
            floor={floor}
            onTask={onAssignTask && canMove ? onTask : undefined}
            office={office && live ? { onOpen: () => setSel(sel?.kind === 'office' ? null : { kind: 'office' }), open: sel?.kind === 'office' } : undefined}
            reducedMotion={reduced}
            bubbles={bubbles}
            glowTills={live && queueTooLong(state, plan)}
          />
          {live && paused && !selectedStaff && (
            <p className="stage-chip stage-paused" role="status">
              Paused
            </p>
          )}
          {canMove && selectedStaff && (
            <p className="stage-chip" role="status">
              Where should {selectedStaff.name} go?
            </p>
          )}
          {toast && (
            <p className="stage-chip stage-toast" role="status">
              {toast}
            </p>
          )}
        </div>
        {primary && (
          <div className="action-bar">
            <div className="action-main">
              <button type="button" className="btn-primary btn-run btn-big" onClick={primary.onClick} autoFocus>
                {primary.label}
              </button>
            </div>
          </div>
        )}
      </div>
      <aside className="panel" aria-label="Side panel">
        {panel({ sel, setSel })}
      </aside>
    </main>
  );
}

function buildView(state: SimState, live: boolean): StoreView {
  const shelf = perDept((d) => deptUnits(state, d).shelf);
  const backroom = perDept((d) => deptUnits(state, d).backroom);
  const dock = Object.values(perDept((d) => deptUnits(state, d).dock)).reduce((t, x) => t + x, 0);
  const clock = state.hour >= state.ctx.hours ? hourLabel(state.ctx.hours) : clockLabel(state.hour, state.step ?? 0);
  const view = storeViewFromState({
    shelf,
    shelfCap: perDept((d) => shelfCapacity(state, d)),
    backroom,
    dock,
    queue: state.queue.customers,
    fridgeFault: state.fridge.status === 'fault',
    lorry: false,
    promo: [],
    markdown: [],
    clock,
  });
  if (live && state.hour < state.ctx.hours) {
    // Shoppers browsing: about ten minutes' worth of arrivals, refreshed every ten minutes.
    view.arrivals = liveBrowsing(state);
    view.tick = `${state.hour}-${Math.floor((state.step ?? 0) / 10)}`;
  }
  return view;
}
