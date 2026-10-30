import { useMemo, useState } from "react";
import { CONFIG, deptName, type DeptId } from "../sim/config";
import { clockLabel, money, onShift } from "../sim/engine";
import { isAway } from "../sim/live";
import {
  orderMax,
  orderStep,
  quote,
  stockOutlook,
  suggestedQty,
  type OrderOption,
} from "../sim/restock";
import type { ActionRequest, HourPlan, SimState } from "../sim/types";

const STEPS = CONFIG.stepsPerHour;

const OPTIONS: { id: OrderOption; label: string; blurb: string }[] = [
  {
    id: "emergency",
    label: "Rush delivery",
    blurb: `Dearer, plus a ${money(CONFIG.actions.emergency.deliveryFee)} fee. On the dock in ~${CONFIG.actions.emergency.arrivalMinutes} min; someone must unload it.`,
  },
  {
    id: "cashAndCarry",
    label: "Cash-and-carry",
    blurb: `Send someone for ~${CONFIG.actions.cashAndCarry.minutes} min. Up to ${CONFIG.actions.cashAndCarry.maxQty} items, straight into the stockroom.`,
  },
  {
    id: "nextDelivery",
    label: "Next delivery",
    blurb:
      "Normal price, with the next scheduled delivery (tomorrow morning if none today).",
  },
];

/** The stockroom: per department, how long stock lasts, what's coming, and ordering more (also while paused). */
export function StockroomCard({
  state,
  plan,
  onOrder,
}: {
  state: SimState;
  plan: HourPlan;
  onOrder: (a: ActionRequest) => void;
}) {
  return (
    <div className="stockroom-card">
      <p className="tiny muted">
        Estimates from today’s forecast. Orders are paid when placed.
      </p>
      {state.ctx.depts.map((d) => (
        <DeptOrder key={d} state={state} plan={plan} d={d} onOrder={onOrder} />
      ))}
    </div>
  );
}

function DeptOrder({
  state,
  plan,
  d,
  onOrder,
}: {
  state: SimState;
  plan: HourPlan;
  d: DeptId;
  onOrder: (a: ActionRequest) => void;
}) {
  const o = useMemo(() => stockOutlook(state, d), [state, d]);
  const [option, setOption] = useState<OrderOption>("emergency");
  const helpers = onShift(state).filter(
    (s) =>
      !s.isTemp && plan.assignments[s.id] !== "break" && !isAway(state, s.id),
  );
  const [staffId, setStaffId] = useState<string>(
    () =>
      helpers.find((s) => plan.assignments[s.id] !== "tills")?.id ??
      helpers[0]?.id ??
      "",
  );
  const suggested = suggestedQty(state, d, option);
  const step = orderStep(option);
  const [qty, setQty] = useState<number | null>(null);
  // Enough until closing: the order controls stay folded away unless asked for.
  const [anyway, setAnyway] = useState(false);
  const enough = o.runsOutAt === null;
  const amount =
    qty ??
    (suggested ||
      Math.min(
        orderMax(option),
        option === "cashAndCarry"
          ? CONFIG.actions.cashAndCarry.qty
          : CONFIG.actions.emergency.qty,
      ));
  const q = quote(
    state,
    d,
    option,
    amount,
    option === "cashAndCarry" ? staffId : undefined,
  );
  const name = deptName(d);
  const id = `order-${d}`;
  const lettingRunOut = state.floor?.letRunOut?.includes(d);
  const setAmount = (v: number) =>
    setQty(
      Math.max(0, Math.min(orderMax(option), Math.round(v / step) * step)),
    );
  const choose = (x: OrderOption) => {
    setOption(x);
    setQty(null);
  };
  return (
    <section className="sr-dept" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>{name}</h3>
      <p className="sr-stock">
        On the shelf <strong>{Math.round(o.shelf)}</strong> · Stockroom{" "}
        <strong className={o.stockroom < 1 ? "bad" : ""}>
          {Math.round(o.stockroom)}
        </strong>
        {o.dock > 0 && (
          <>
            {" "}
            · On the dock <strong>{Math.round(o.dock)}</strong>
          </>
        )}
      </p>
      <p className={`sr-lasts ${o.runsOutAt === null ? "calm" : "bad"}`}>
        {o.runsOutAt === null
          ? "Enough until closing"
          : `Lasts until ~${clockLabel(Math.floor(o.runsOutAt / STEPS), o.runsOutAt % STEPS)}`}
        {lettingRunOut && o.runsOutAt !== null ? " (letting it run out)" : ""}
      </p>
      {o.incoming.length > 0 && (
        <ul className="sr-incoming" aria-label={`${name} on its way`}>
          {o.incoming.map((x, i) => (
            <li key={i}>{x.label}</li>
          ))}
        </ul>
      )}

      {enough && !anyway ? (
        <button
          type="button"
          className="btn-link sr-anyway"
          aria-expanded={false}
          onClick={() => setAnyway(true)}
        >
          Order anyway
        </button>
      ) : (
        <>
          <div
            className="sr-options"
            role="group"
            aria-label={`How to order ${name.toLowerCase()}`}
          >
            {OPTIONS.map((x) => (
              <button
                key={x.id}
                type="button"
                className="sr-option"
                aria-pressed={option === x.id}
                onClick={() => choose(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <p className="tiny sr-blurb">
            {OPTIONS.find((x) => x.id === option)!.blurb} {money(q.unitPrice)}{" "}
            an item (normally {money(CONFIG.departments[d].unitCost)}).
          </p>
          {option === "cashAndCarry" && (
            <label className="sr-who">
              Send{" "}
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                {helpers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sr-qty">
            <span className="qty-row small">
              <button
                type="button"
                className="btn-qty"
                aria-label={`${step} fewer ${name.toLowerCase()}`}
                onClick={() => setAmount(amount - step)}
              >
                −
              </button>
              <input
                type="number"
                aria-label={`${name}: items to order`}
                min={0}
                max={orderMax(option)}
                step={step}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
              />
              <button
                type="button"
                className="btn-qty"
                aria-label={`${step} more ${name.toLowerCase()}`}
                onClick={() => setAmount(amount + step)}
              >
                +
              </button>
            </span>
            {suggested > 0 ? (
              <button
                type="button"
                className="btn-link"
                onClick={() => setQty(suggested)}
                aria-pressed={amount === suggested}
              >
                {suggested >= orderMax(option) && o.shortfall * 1.1 > suggested
                  ? `Most this can bring (${suggested})`
                  : `Top up until closing (${suggested})`}
              </button>
            ) : (
              <span className="tiny calm">No top-up needed today</span>
            )}
          </div>
          <p className="sr-quote" aria-live="polite">
            {amount} items · <strong>{money(q.cost)}</strong> · {q.arrives} ·
            cash after{" "}
            <span className={q.cashAfter < 0 ? "bad" : ""}>
              {money(q.cashAfter)}
            </span>
          </p>
          {q.info.reason && <p className="tiny bad">{q.info.reason}</p>}
          <div className="sr-actions">
            <button
              type="button"
              className="btn-primary sr-confirm"
              disabled={!q.info.available || amount <= 0}
              onClick={() => {
                onOrder(q.action);
                setQty(null);
              }}
            >
              {option === "cashAndCarry"
                ? `Send ${helpers.find((s) => s.id === staffId)?.name ?? ""} · ${money(q.cost)}`
                : `Order ${amount} · ${money(q.cost)}`}
            </button>
            {o.runsOutAt !== null && !lettingRunOut && (
              <button
                type="button"
                className="btn-link"
                onClick={() => onOrder({ kind: "letRunOut", dept: d })}
              >
                Let it run out
              </button>
            )}
            {enough && (
              <button
                type="button"
                className="btn-link"
                aria-expanded={true}
                onClick={() => setAnyway(false)}
              >
                Hide
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
