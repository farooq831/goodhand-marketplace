// Design.md §5 status color language, applied consistently across
// customer, vendor, and admin views. Text label always accompanies the
// color (§8 accessibility notes: never color alone) and the leading dot
// is decorative (aria-hidden), inheriting the label's color.
const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-blue-100 text-blue-700",
  submitted: "bg-blue-100 text-blue-700",
  completed: "bg-primary/10 text-primary",
  declined: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-600",
  disputed: "bg-red-100 text-red-700",
};

function BookingStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export default BookingStatusBadge;
