"use client";

import { useState } from "react";
import { askBoard, BOARD_ASKS, defaultStadium, EXPANSIONS, expandStadium, fairPrice, rebalanceBudget, SEAT_COST, setTicketPrice, type BoardAsk } from "@/game/club";
import { formatMoney } from "@/game/ratings";
import { act, updateSave, useCareer } from "@/lib/store/save-store";
import { Slider } from "./Slider";
import { toast } from "./overlay";
import { Button, Meter, Panel } from "./ui";

/** Stadium, budgets and board requests (docs/DEPTH_PLAN.md §10). */
export function ClubOps() {
  const save = useCareer();
  const club = save.clubs[save.userClubId];
  const st = club.stadium ?? defaultStadium(club);
  const [shift, setShift] = useState(0);
  const fill = st.lastAttendance ? Math.round((st.lastAttendance / st.capacity) * 100) : null;
  const fair = Math.round(fairPrice(club));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title={st.name} subtitle={`Capacity ${st.capacity.toLocaleString()}${st.expansion ? ` · +${st.expansion.seats.toLocaleString()} seats in ${st.expansion.weeksLeft} wk` : ""}`}>
        <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
          <div>
            <div className="mb-1 flex justify-between">
              <span className="text-muted">Last home crowd</span>
              <span className="tabular">{st.lastAttendance ? `${st.lastAttendance.toLocaleString()} (${fill}%)` : "–"}</span>
            </div>
            <Meter value={fill ?? 0} label="Stadium filled" />
          </div>
          <Slider label="Ticket price" value={st.ticketPrice} min={5} max={60} onChange={(price) => updateSave((d) => setTicketPrice(d, price))} valueText={`£${st.ticketPrice}`} low="£5" high="£60" hint={`Fans think £${fair} is fair. Higher prices earn more per fan but keep some away. Form, league position, big opponents and derbies bring crowds in.`} />
          {!st.expansion && (
            <div className="flex flex-wrap gap-2">
              {EXPANSIONS.map((e) => (
                <Button
                  key={e.seats}
                  size="sm"
                  disabled={club.balance < e.seats * SEAT_COST}
                  onClick={() => {
                    if (!confirm(`Add ${e.seats.toLocaleString()} seats for ${formatMoney(e.seats * SEAT_COST)}? Takes ${e.weeks} weeks.`)) return;
                    const r = act((d) => expandStadium(d, e.seats));
                    toast(r.ok ? "Building work begins." : (r.reason ?? ""), r.ok ? "good" : "bad");
                  }}
                >
                  +{e.seats.toLocaleString()} seats · {formatMoney(e.seats * SEAT_COST)}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Budgets" subtitle="Set by the board each season">
        <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Transfer budget</span>
            <span className="font-semibold tabular">{formatMoney(save.board.transferBudget ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Wage budget</span>
            <span className="font-semibold tabular">{formatMoney(save.board.wageBudget)}/wk</span>
          </div>
          <div className="border-t border-line pt-3">
            <Slider label={`Move budget to ${shift >= 0 ? "wages" : "transfers"}`} min={-Math.floor((save.board.wageBudget * 0.3 * 40) / 10000) * 10000} max={Math.floor((save.board.transferBudget ?? 0) / 10000) * 10000} step={10000} value={shift} onChange={setShift} valueText={`${formatMoney(Math.abs(shift))} ↔ ${formatMoney(Math.abs(shift) / 40)}/wk`} low="More transfers" high="More wages" />
            <Button
              size="sm"
              className="mt-2"
              disabled={shift === 0}
              onClick={() => {
                const r = act((d) => rebalanceBudget(d, shift));
                toast(r.ok ? "Budgets adjusted." : (r.reason ?? ""), r.ok ? "good" : "bad");
                setShift(0);
              }}
            >
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted">Every £40 of transfer budget buys £1 a week of wage room. Half of every sale goes back into the transfer budget.</p>
        </div>
      </Panel>

      <Panel title="Ask the board" subtitle={`Confidence ${Math.round(save.board.confidence)}/100. Asking too often irritates them.`}>
        <div className="flex flex-col gap-2 px-4 pb-4">
          {(Object.keys(BOARD_ASKS) as BoardAsk[]).map((k) => {
            const last = save.board.asked?.[k];
            const recent = last !== undefined && save.calendarIndex - last < 6;
            return (
              <button
                key={k}
                onClick={() => {
                  const r = act((d) => askBoard(d, k));
                  toast(r.text, r.ok ? "good" : "bad");
                }}
                className="rounded-md border border-line px-3 py-2 text-left hover:border-text"
              >
                <span className="block text-sm font-semibold">{BOARD_ASKS[k].label}</span>
                <span className="block text-xs text-muted">{recent ? `Asked ${save.calendarIndex - last!} week(s) ago: wait a while.` : BOARD_ASKS[k].blurb}</span>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
