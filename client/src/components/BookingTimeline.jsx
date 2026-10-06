// The booking's evidence trail. Every transition writes a statusHistory entry,
// and since phase 4 those entries carry the reason and — for a delivery — the
// files handed over at that moment. Rendering all of it is what lets an admin
// adjudicate a dispute from the record instead of from one side's summary,
// so this is shared verbatim between the participants' booking page and the
// admin dispute view rather than reimplemented per surface.
const LABELS = {
  pending: "Booking requested",
  accepted: "Accepted by the vendor",
  submitted: "Work delivered",
  completed: "Work accepted — payment releases after the 24h window",
  declined: "Request declined",
  cancelled: "Booking cancelled — payment refunded",
  disputed: "Dispute opened",
};

const DOT_TONES = {
  submitted: "bg-primary",
  completed: "bg-emerald-500",
  disputed: "bg-red-500",
  declined: "bg-red-400",
  cancelled: "bg-red-400",
};

function BookingTimeline({ entries, className = "" }) {
  if (!entries?.length) {
    return <p className={`text-sm text-muted ${className}`}>No history recorded yet.</p>;
  }

  // A return to "accepted" after work already exists is a revision request,
  // not the original acceptance — the status alone reads misleadingly there.
  let deliveries = 0;
  const rows = entries.map((entry) => {
    if (entry.status === "submitted") deliveries += 1;
    const isRevision = entry.status === "accepted" && deliveries > 0;
    return {
      entry,
      label: isRevision ? `Revision ${deliveries} requested` : LABELS[entry.status] || entry.status,
      deliveryNumber: entry.status === "submitted" ? deliveries : null,
    };
  });

  return (
    <ol className={`flex flex-col gap-4 ${className}`}>
      {rows.map(({ entry, label, deliveryNumber }, index) => (
        <li key={`${entry.status}-${entry.changedAt}-${index}`} className="flex gap-3">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONES[entry.status] || "bg-primary/40"}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {label}
              {deliveryNumber && deliveries > 1 ? ` (delivery ${deliveryNumber})` : ""}
            </p>
            <p className="meta-text text-xs">
              {entry.changedBy?.name || "System"}
              {entry.changedBy?.role ? ` · ${entry.changedBy.role}` : ""}
              {" · "}
              {new Date(entry.changedAt).toLocaleString()}
            </p>
            {entry.note && (
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-black/[0.03] px-3 py-2 text-sm leading-6 text-ink/80">
                {entry.note}
              </p>
            )}
            {entry.files?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {entry.files.map((file) => (
                  <a key={file} href={file} target="_blank" rel="noreferrer" className="file-pill">
                    Open file
                  </a>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default BookingTimeline;
