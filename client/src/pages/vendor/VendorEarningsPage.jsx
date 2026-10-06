import { useQuery } from "@tanstack/react-query";
import { getMyBookings } from "../../api/bookingApi";
import PaymentStatusBadge from "../../components/PaymentStatusBadge";
import { LoadError, SkeletonList } from "../../components/QueryState";

// Design.md §2: /dashboard/vendor/earnings. bookingService.getMyBookings
// already populates paymentId (amount/commissionAmount/status/releasedAt),
// so this just filters down to bookings that actually have one.
function VendorEarningsPage() {
  const { data: bookings, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => getMyBookings(),
  });

  const withPayments = (bookings || []).filter((b) => b.paymentId);
  const totalReleased = withPayments
    .filter((b) => b.paymentId.status === "released")
    .reduce((sum, b) => sum + (b.paymentId.amount - b.paymentId.commissionAmount), 0);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Earnings</h1>
          <p className="workspace-subtitle">Payouts release automatically after each order completes.</p>
        </div>
      </div>

      <div className="kpi-card mb-6 sm:max-w-xs">
        <p className="meta-text text-xs uppercase tracking-wide">Total released</p>
        <p className="mt-1 font-display text-3xl text-ink">Rs {totalReleased}</p>
      </div>

      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      {!isLoading && !isError && withPayments.length === 0 && (
        <div className="empty-state">No payments yet.</div>
      )}

      <ul className="list-stack">
        {withPayments.map((b) => (
          <li key={b._id} className="list-item flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink">{b.listingId?.title}</p>
              <p className="meta-text mt-1">
                {new Date(b.slot.date).toLocaleDateString()} · {b.customerId?.name}
              </p>
              <p className="meta-text mt-0.5 text-xs">
                Rs {b.paymentId.amount} − Rs {b.paymentId.commissionAmount} commission = <span className="font-semibold text-primary">Rs {b.paymentId.amount - b.paymentId.commissionAmount}</span>
              </p>
            </div>
            <PaymentStatusBadge status={b.paymentId.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default VendorEarningsPage;
