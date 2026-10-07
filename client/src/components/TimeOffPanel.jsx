import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarOff, Trash2 } from "lucide-react";
import { addTimeOff, removeTimeOff } from "../api/vendorApi";
import { errorMessage } from "./QueryState";

const fmt = (value) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const todayIso = () => new Date().toISOString().slice(0, 10);

// Vendor: block whole days. Customers can't pick these dates, and search
// hides the vendor for them. Existing bookings are flagged, not cancelled.
function TimeOffPanel({ timeOff = [] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ from: "", to: "", reason: "" });
  const [conflicts, setConflicts] = useState([]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-vendor-profile"] });
  const add = useMutation({
    mutationFn: () => addTimeOff({ from: form.from, to: form.to || form.from, reason: form.reason }),
    onSuccess: (data) => {
      setConflicts(data.conflicts || []);
      setForm({ from: "", to: "", reason: "" });
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: removeTimeOff, onSuccess: refresh });

  const upcoming = timeOff.filter((entry) => new Date(entry.to) >= new Date(todayIso()));

  return (
    <section className="panel" aria-labelledby="time-off-title">
      <h2 id="time-off-title" className="section-title flex items-center gap-2 text-base"><CalendarOff size={18} className="text-primary" aria-hidden="true" />Time off</h2>
      <p className="meta-text mt-1 text-xs">Block days you can't work — holidays, travel, illness. Customers won't be able to book them.</p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setConflicts([]);
          add.mutate();
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <div className="field min-w-0">
            <label htmlFor="to-from" className="text-xs text-muted">From</label>
            <input id="to-from" type="date" required min={todayIso()} className="form-control" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to && form.to < e.target.value ? e.target.value : form.to })} />
          </div>
          <div className="field min-w-0">
            <label htmlFor="to-to" className="text-xs text-muted">To (optional)</label>
            <input id="to-to" type="date" min={form.from || todayIso()} className="form-control" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="to-reason" className="text-xs text-muted">Reason (only you see this)</label>
          <input id="to-reason" maxLength={120} className="form-control" placeholder="e.g. Eid holidays" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        {add.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(add.error)}</p>}
        <button type="submit" disabled={add.isPending || !form.from} className="button button--dark button--sm self-start disabled:opacity-50">
          {add.isPending ? "Saving…" : "Block these days"}
        </button>
      </form>

      {conflicts.length > 0 && (
        <div className="status-banner status-banner--pending mt-4 items-start" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">You already have {conflicts.length} booking{conflicts.length > 1 ? "s" : ""} in that period</p>
            <p className="opacity-80">They weren't cancelled. Message the customer to reschedule, or cancel from the booking page.</p>
            <ul className="mt-2 space-y-1">
              {conflicts.map((b) => (
                <li key={b._id}><Link to={`/booking/${b._id}`} className="text-link">{fmt(b.slot.date)} {b.slot.startTime} — {b.listingId?.title} ({b.customerId?.name})</Link></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ul className="mt-5 space-y-2" aria-label="Upcoming time off">
        {upcoming.length === 0 && <li className="meta-text text-sm">No time off scheduled.</li>}
        {upcoming.map((entry) => (
          <li key={entry._id} className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-canvas px-3 py-2 text-sm">
            <span>
              <span className="font-medium text-ink">{fmt(entry.from)}{entry.to !== entry.from && fmt(entry.to) !== fmt(entry.from) ? ` – ${fmt(entry.to)}` : ""}</span>
              {entry.reason && <span className="meta-text"> · {entry.reason}</span>}
            </span>
            <button type="button" onClick={() => remove.mutate(entry._id)} disabled={remove.isPending} className="rounded-full p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50" aria-label={`Remove time off starting ${fmt(entry.from)}`}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TimeOffPanel;
