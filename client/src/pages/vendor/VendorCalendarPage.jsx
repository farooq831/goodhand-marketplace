import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMyBookings } from "../../api/bookingApi";
import { getMyVendorProfile } from "../../api/vendorApi";
import TimeOffPanel from "../../components/TimeOffPanel";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return gridStart;
}

// Design.md §4 Vendor Dashboard Calendar: "Week/month calendar view,
// accepted bookings shown as blocked slots. Click a slot → see customer
// name, listing, status, quick actions." Quick actions live on the
// booking detail page (accept/decline/message all happen there already)
// rather than inline here, to keep this view a simple month grid.
function VendorCalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const { data: bookings } = useQuery({
    queryKey: ["my-bookings", "accepted"],
    queryFn: () => getMyBookings("accepted"),
  });

  const { data: profile } = useQuery({ queryKey: ["my-vendor-profile"], queryFn: getMyVendorProfile });
  const timeOff = (profile?.timeOff || []).map((entry) => ({ ...entry, fromDate: new Date(entry.from), toDate: new Date(entry.to) }));
  const offEntry = (d) => timeOff.find((entry) => entry.fromDate <= d && d <= entry.toDate);

  const byDate = {};
  (bookings || []).forEach((b) => {
    const key = new Date(b.slot.date).toDateString();
    (byDate[key] ||= []).push(b);
  });

  const gridStart = startOfMonthGrid(cursor.year, cursor.month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return d;
  });

  const monthLabel = new Date(cursor.year, cursor.month).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const todayStr = new Date().toDateString();

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Calendar</h1>
          <p className="workspace-subtitle">Your accepted bookings and days off.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="pager-button">
            ‹
          </button>
          <span className="min-w-36 text-center font-semibold text-ink">{monthLabel}</span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="pager-button">
            ›
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="surface h-fit p-4">
        <div className="calendar-grid mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((d) => {
            const inMonth = d.getMonth() === cursor.month;
            const isToday = d.toDateString() === todayStr;
            const dayBookings = byDate[d.toDateString()] || [];
            const off = offEntry(d);
            return (
              <div
                key={d.toISOString()}
                className={`calendar-cell ${inMonth ? "" : "calendar-cell--muted"} ${isToday ? "calendar-cell--today" : ""} ${off && inMonth ? "calendar-cell--off" : ""}`}
                title={off ? `Time off${off.reason ? ` — ${off.reason}` : ""}` : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${isToday ? "text-primary" : "text-ink"}`}>{d.getDate()}</span>
                  {off && inMonth && <span className="rounded bg-black/10 px-1 text-[10px] font-semibold uppercase text-ink/70">Off</span>}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayBookings.map((b) => (
                    <Link
                      key={b._id}
                      to={`/booking/${b._id}`}
                      className="calendar-event"
                      title={`${b.slot.startTime} ${b.listingId?.title}`}
                    >
                      {b.slot.startTime} {b.customerId?.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <TimeOffPanel timeOff={profile?.timeOff || []} />
      </div>
    </div>
  );
}

export default VendorCalendarPage;
