import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Undo2, Wallet, X } from "lucide-react";
import { getBooking } from "../api/bookingApi";
import { getBookingMessages } from "../api/messageApi";
import { resolveDispute } from "../api/adminApi";
import BookingTimeline from "./BookingTimeline";
import PaymentStatusBadge from "./PaymentStatusBadge";

// Design.md §3.3 / §4: the admin rules on a dispute from the record — the
// full chat transcript and the booking's status history — not from one
// side's summary. The server requires a written resolution note so every
// ruling is auditable; it lands in statusHistory and the booking thread.
function DisputeDetailDrawer({ dispute, onClose }) {
  const queryClient = useQueryClient();
  const closeRef = useRef(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(null); // "release" | "refund" | null

  const bookingQuery = useQuery({ queryKey: ["booking", dispute._id], queryFn: () => getBooking(dispute._id) });
  const messagesQuery = useQuery({ queryKey: ["messages", dispute._id], queryFn: () => getBookingMessages(dispute._id) });

  const mutation = useMutation({
    mutationFn: ({ action }) => resolveDispute(dispute._id, action, note.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
      onClose();
    },
    onSettled: () => setConfirming(null),
  });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const booking = bookingQuery.data;
  const messages = messagesQuery.data || [];
  const amount = dispute.paymentId?.amount ?? dispute.price;
  const noteMissing = !note.trim();

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="dispute-title">
      <button type="button" className="absolute inset-0 bg-ink/40 backdrop-blur-sm" aria-label="Close dispute details" tabIndex={-1} onClick={onClose} />
      <div className="drawer-panel">
        <div className="flex items-start justify-between gap-4 border-b border-black/5 p-5">
          <div className="min-w-0">
            <p className="eyebrow text-red-700">Disputed booking</p>
            <h2 id="dispute-title" className="mt-1 truncate font-display text-2xl text-ink">{dispute.listingId?.title || "Booking"}</h2>
            <p className="meta-text mt-1 font-mono text-xs">#{dispute._id.slice(-8)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="icon-button shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="kpi-card"><p className="meta-text text-xs">Customer</p><p className="mt-1 font-semibold text-ink">{dispute.customerId?.name}</p><p className="meta-text truncate text-xs">{dispute.customerId?.email}</p></div>
            <div className="kpi-card"><p className="meta-text text-xs">Vendor</p><p className="mt-1 font-semibold text-ink">{dispute.vendorId?.businessName}</p></div>
            <div className="kpi-card"><p className="meta-text text-xs">Amount held</p><p className="mt-1 font-semibold text-ink">Rs {amount}</p>{dispute.paymentId?.status && <div className="mt-1"><PaymentStatusBadge status={dispute.paymentId.status} /></div>}</div>
            <div className="kpi-card"><p className="meta-text text-xs">Raised on</p><p className="mt-1 font-semibold text-ink">{new Date(dispute.disputeOpenedAt).toLocaleDateString()}</p><p className="meta-text text-xs">{dispute.deliveryCount} deliveries</p></div>
          </section>

          {dispute.disputeReason && (
            <section>
              <h3 className="section-title text-base">Reason given</h3>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-900">{dispute.disputeReason}</p>
            </section>
          )}

          <section>
            <h3 className="section-title text-base">Chat transcript <span className="meta-text font-normal">({messages.length})</span></h3>
            {messagesQuery.isLoading && <div className="skeleton mt-2 h-32" />}
            {messagesQuery.isError && <p className="mt-2 text-sm text-red-700">Couldn't load the transcript.</p>}
            {!messagesQuery.isLoading && messages.length === 0 && <p className="meta-text mt-2">No messages were exchanged on this booking.</p>}
            <ol className="mt-2 max-h-80 space-y-2 overflow-y-auto rounded-2xl bg-canvas p-3">
              {messages.map((message) =>
                message.kind === "event" ? (
                  <li key={message._id} className="text-center text-xs italic text-muted">{message.text} · {new Date(message.createdAt).toLocaleString()}</li>
                ) : (
                  <li key={message._id} className="rounded-xl bg-white p-2.5 text-sm shadow-sm">
                    <p className="text-xs font-semibold text-ink">
                      {message.senderId?.name || "Participant"}
                      <span className="ml-1 font-normal capitalize text-muted">· {message.senderId?.role}</span>
                      <span className="ml-1 font-normal text-muted">· {new Date(message.createdAt).toLocaleString()}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-ink/90">{message.text}</p>
                  </li>
                )
              )}
            </ol>
          </section>

          <section>
            <h3 className="section-title text-base">Status history</h3>
            {bookingQuery.isLoading ? <div className="skeleton mt-2 h-24" /> : <BookingTimeline entries={booking?.statusHistory} className="mt-3" />}
          </section>

          <Link to={`/booking/${dispute._id}`} className="text-link inline-flex items-center gap-1 text-sm">
            Open full booking page <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="space-y-3 border-t border-black/5 bg-white p-5">
          <div className="field">
            <label htmlFor="resolution-note" className="form-label">Resolution note <span className="text-red-700">*</span></label>
            <textarea id="resolution-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="form-control" placeholder="Explain the decision — both parties will see this." />
          </div>
          {mutation.isError && (
            <p className="status-banner status-banner--error text-sm" role="alert">{mutation.error?.response?.data?.message || mutation.error.message}</p>
          )}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <p className="flex-1 text-sm text-ink">
                {confirming === "release" ? `Release Rs ${amount} to ${dispute.vendorId?.businessName}?` : `Refund Rs ${amount} to ${dispute.customerId?.name}?`} This can't be undone.
              </p>
              <button type="button" onClick={() => setConfirming(null)} className="button button--outline button--sm">Back</button>
              <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: confirming })} className={`button button--sm disabled:opacity-50 ${confirming === "release" ? "button--dark" : "button--danger"}`}>
                {mutation.isPending ? "Working…" : "Confirm"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={noteMissing} onClick={() => setConfirming("release")} className="button button--dark button--sm flex-1 disabled:opacity-40">
                <Wallet size={16} aria-hidden="true" className="mr-1.5" />Release to vendor
              </button>
              <button type="button" disabled={noteMissing} onClick={() => setConfirming("refund")} className="button button--danger button--sm flex-1 disabled:opacity-40">
                <Undo2 size={16} aria-hidden="true" className="mr-1.5" />Refund customer
              </button>
            </div>
          )}
          {noteMissing && <p className="meta-text text-xs">A note is required before resolving.</p>}
        </div>
      </div>
    </div>
  );
}

export default DisputeDetailDrawer;
