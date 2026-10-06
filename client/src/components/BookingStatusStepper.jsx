// Design.md §4 Booking Detail Page: "Status stepper at top: Pending →
// Submitted is the vendor's handoff; the customer completes the order.
const STEPS = ["pending", "accepted", "submitted", "completed"];
const OFF_PATH_STATUSES = ["declined", "cancelled", "disputed"];

// A revision request walks the booking backwards (submitted -> accepted), which
// the index maths already handles — but a stepper that silently steps back
// looks like a bug. Count the deliveries already made to name the loop instead.
function countRevisions(statusHistory) {
  let deliveries = 0;
  let revisions = 0;
  for (const entry of statusHistory) {
    if (entry.status === "submitted") deliveries += 1;
    else if (entry.status === "accepted" && deliveries > 0) revisions += 1;
  }
  return revisions;
}

function BookingStatusStepper({ status, statusHistory = [] }) {
  const isOffPath = OFF_PATH_STATUSES.includes(status);
  const currentIndex = STEPS.indexOf(status);
  const revisions = countRevisions(statusHistory);

  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {STEPS.map((step, i) => {
        const reached = !isOffPath && currentIndex >= i;
        const isCurrent = !isOffPath && currentIndex === i;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${
                reached ? "bg-primary text-white" : "bg-black/5 text-muted"
              } ${isCurrent ? "ring-4 ring-primary/15" : ""}`}
            >
              {i + 1}
            </div>
            <span className={`text-xs font-medium capitalize ${reached ? "text-ink" : "text-muted/70"}`}>
              {step}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`mx-1 h-px w-6 sm:w-10 ${reached && currentIndex > i ? "bg-primary/40" : "bg-black/10"}`} />
            )}
          </div>
        );
      })}
      {revisions > 0 && !isOffPath && (
        <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {revisions === 1 ? "1 revision" : `${revisions} revisions`}
        </span>
      )}
      {isOffPath && (
        <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-red-700">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {status}
        </span>
      )}
    </div>
  );
}

export default BookingStatusStepper;
