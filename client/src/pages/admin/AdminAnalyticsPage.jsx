import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAnalytics } from "../../api/adminApi";
import BookingStatusBadge from "../../components/BookingStatusBadge";
import PaymentStatusBadge from "../../components/PaymentStatusBadge";
import QueryState from "../../components/QueryState";

const STATUS_ORDER = ["pending", "accepted", "submitted", "completed", "disputed", "declined", "cancelled"];
const rs = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

function StatTile({ label, value, hint }) {
  return (
    <div className="kpi-card">
      <dt className="meta-text text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 font-display text-3xl text-ink">{value}</dd>
      {hint && <dd className="meta-text mt-1 text-xs">{hint}</dd>}
    </div>
  );
}

// One series, one hue: bars encode count; the status is named in text
// beside each bar (status colours stay reserved for the badges), and the
// exact number is printed, so nothing depends on colour or hover.
function StatusBreakdown({ counts, total }) {
  const max = Math.max(1, ...STATUS_ORDER.map((status) => counts[status] || 0));
  return (
    <ul className="space-y-3" aria-label="Bookings by status">
      {STATUS_ORDER.map((status) => {
        const count = counts[status] || 0;
        const share = total ? Math.round((count / total) * 100) : 0;
        return (
          <li key={status} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${status}: ${count} bookings (${share}%)`}>
            <span className="capitalize text-ink">{status}</span>
            <span className="h-3 rounded-r bg-black/[0.04]" aria-hidden="true">
              <span className="block h-full rounded-r-[4px] bg-primary transition-[width]" style={{ width: `${(count / max) * 100}%`, minWidth: count ? 4 : 0 }} />
            </span>
            <span className="text-right tabular-nums text-ink">{count} <span className="text-muted">· {share}%</span></span>
          </li>
        );
      })}
    </ul>
  );
}

function AdminAnalyticsPage() {
  const query = useQuery({ queryKey: ["admin-analytics"], queryFn: getAnalytics });
  const data = query.data;

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Marketplace analytics</h1>
          <p className="workspace-subtitle">A snapshot of platform activity to date.</p>
        </div>
      </div>

      <QueryState query={query} skeleton={<div className="kpi-grid">{[1, 2, 3].map((n) => <div key={n} className="skeleton h-28" />)}</div>}>
        {data && (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="GMV" value={rs(data.gmv)} hint="Accepted, delivered, completed & disputed" />
              <StatTile label="Bookings" value={data.bookingVolume} hint="All time" />
              <StatTile label="Active vendors" value={data.activeVendors} hint={data.pendingVendors ? `${data.pendingVendors} awaiting verification` : "None awaiting verification"} />
              <StatTile label="Commission earned" value={rs(data.commissionEarned)} hint="On released payments" />
            </dl>

            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile label="Held in escrow" value={rs(data.escrowHeld)} />
              <StatTile label="Released to vendors" value={rs(data.released)} />
              <StatTile label="Refunded to customers" value={rs(data.refunded)} />
            </dl>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.6fr]">
              <section className="panel">
                <h2 className="section-title text-base">Bookings by status</h2>
                <div className="mt-5"><StatusBreakdown counts={data.bookingsByStatus || {}} total={data.bookingVolume} /></div>
              </section>

              <section className="panel overflow-hidden p-0">
                <h2 className="section-title p-5 pb-3 text-base">Recent transactions</h2>
                {data.recentTransactions?.length ? (
                  <div className="overflow-x-auto">
                    <table className="data-table min-w-[30rem]">
                      <thead>
                        <tr><th scope="col">Booking</th><th scope="col">Customer → Vendor</th><th scope="col">Amount</th><th scope="col">Payment</th></tr>
                      </thead>
                      <tbody>
                        {data.recentTransactions.map((payment) => {
                          const booking = payment.bookingId;
                          return (
                            <tr key={payment._id}>
                              <td>
                                {booking ? <Link to={`/booking/${booking._id}`} className="text-link">{booking.listingId?.title || "Booking"}</Link> : "—"}
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {booking && <BookingStatusBadge status={booking.status} />}
                                  {payment.heldAt && <span className="meta-text text-xs">{new Date(payment.heldAt).toLocaleDateString()}</span>}
                                </div>
                              </td>
                              <td className="text-sm">{booking?.customerId?.name || "—"} → {booking?.vendorId?.businessName || "—"}</td>
                              <td className="tabular-nums font-semibold">{rs(payment.amount)}</td>
                              <td><PaymentStatusBadge status={payment.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="meta-text px-5 pb-5">No payments yet.</p>
                )}
              </section>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}

export default AdminAnalyticsPage;
