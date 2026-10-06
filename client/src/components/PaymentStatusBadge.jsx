// Design.md §4 Booking Detail Page: payment status badge. Color language follows the same
// pattern as BookingStatusBadge (§5) — held mirrors "pending" (amber,
// something's in flight), released mirrors "completed" (success), and
// refunded/disputed reuse their booking-status counterparts.
const STATUS_STYLES = {
  held: "bg-amber-100 text-amber-700",
  released: "bg-primary/10 text-primary",
  refunded: "bg-gray-100 text-gray-600",
  disputed: "bg-red-100 text-red-700",
};

const STATUS_LABELS = {
  held: "Held in escrow",
  released: "Released",
  refunded: "Refunded",
  disputed: "Disputed",
};

function PaymentStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default PaymentStatusBadge;
