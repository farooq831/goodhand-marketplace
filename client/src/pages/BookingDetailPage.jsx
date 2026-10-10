import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, MapPin, Phone, StickyNote } from "lucide-react";
import { SERVICE_LOCATION_LABEL } from "../utils/serviceLocation";
import { getBooking, updateBookingStatus } from "../api/bookingApi";
import { getPaymentForBooking } from "../api/paymentApi";
import { useAuth } from "../context/AuthContext";
import { getSocket, joinBooking, leaveBooking } from "../socket";
import BookingStatusStepper from "../components/BookingStatusStepper";
import BookingStatusBadge from "../components/BookingStatusBadge";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import ChatPanel from "../components/ChatPanel";
import BookingTimeline from "../components/BookingTimeline";
import { createReview } from "../api/reviewApi";
import ImageUploadField from "../components/ImageUploadField";
import { PageLoading, PageNotFound } from "../components/QueryState";

// Each entry is an action that opens a reason box instead of firing straight
// away. The server rejects a revision or a dispute with no note
// (bookingService's NOTE_REQUIRED), so the box isn't decoration — it's the
// request body. Cancelling accepts an empty note but still routes through here
// so a destructive, refunding action needs a second deliberate click.
const REASON_PROMPTS = {
  revision: {
    status: "accepted",
    title: "Request a revision",
    hint: "Tell the vendor exactly what needs to change. The order goes back to them and they can deliver again.",
    placeholder: "The photos are lower resolution than the listing described — could you re-export them at...",
    confirmLabel: "Send revision request",
    tone: "button--dark",
  },
  dispute: {
    status: "disputed",
    title: "Report a problem",
    hint: "This opens a dispute. Support joins the conversation below, can read the full history and every delivered file, and decides whether the payment is released or refunded.",
    placeholder: "Describe what went wrong, with specifics and dates...",
    confirmLabel: "Open dispute",
    tone: "button--danger",
  },
  cancel: {
    status: "cancelled",
    title: "Cancel this booking",
    hint: "The booking ends and the payment held in escrow is refunded to the customer. This cannot be undone.",
    placeholder: "Optional — let the other party know why.",
    confirmLabel: "Cancel booking",
    tone: "button--danger",
    noteOptional: true,
  },
  decline: {
    status: "declined",
    title: "Decline this request",
    hint: "The request is turned down and the customer's payment is refunded.",
    placeholder: "Optional — let the customer know why.",
    confirmLabel: "Decline request",
    tone: "button--outline",
    noteOptional: true,
  },
};

// Where the job is and what it involves. Bookings are only readable by
// their customer, vendor, and admins, so the address and phone are safe here.
function ServiceDetails({ booking }) {
  const where = booking.serviceLocation || "customer";
  const address = booking.serviceAddress || {};
  const hasAddress = where === "customer" && address.line;
  if (!hasAddress && !booking.notes && where === "customer") return null;
  const fullAddress = [address.line, address.area, address.city].filter(Boolean).join(", ");

  return (
    <div className="panel mt-6">
      <h2 className="section-title text-base">Service details</h2>
      <div className="mt-3 space-y-3 text-sm">
        <p className="flex items-start gap-2.5">
          <MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {hasAddress ? (
              <>
                <span className="font-medium text-ink">{fullAddress}</span>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noreferrer" className="text-link ml-2 inline-flex items-center gap-1 text-xs">
                  Open in Maps <ExternalLink size={12} aria-hidden="true" />
                </a>
              </>
            ) : (
              <span className="text-ink">{SERVICE_LOCATION_LABEL[where]}{where !== "customer" && " — share details in the chat below"}</span>
            )}
          </span>
        </p>
        {booking.contactPhone && (
          <p className="flex items-center gap-2.5">
            <Phone size={18} className="shrink-0 text-primary" aria-hidden="true" />
            <a href={`tel:${booking.contactPhone.replace(/[\s-]/g, "")}`} className="text-link">{booking.contactPhone}</a>
          </p>
        )}
        {booking.notes && (
          <p className="flex items-start gap-2.5">
            <StickyNote size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="whitespace-pre-wrap text-ink/85">{booking.notes}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// Shown to vendors (and admins): how this customer has behaved on past bookings.
function CustomerReliability({ stats }) {
  const { completed, cancelled, disputed, reliability } = stats;
  const tone = reliability == null ? "text-muted" : reliability >= 80 ? "text-primary" : reliability >= 50 ? "text-amber-700" : "text-red-700";
  return (
    <div className="panel mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div>
        <h2 className="section-title text-base">Customer history</h2>
        <p className="meta-text mt-0.5 text-xs">{completed} completed · {cancelled} cancelled · {disputed} disputed</p>
      </div>
      <p className={`font-semibold ${tone}`}>{reliability == null ? "New customer" : `${reliability}% reliable`}</p>
    </div>
  );
}

function BookingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [submittedFiles, setSubmittedFiles] = useState([]);
  const [promptKey, setPromptKey] = useState(null);
  const [reason, setReason] = useState("");

  const {
    data: booking,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => getBooking(id),
  });

  const { data: payment } = useQuery({
    queryKey: ["payment", id],
    queryFn: () => getPaymentForBooking(id),
  });

  // Join this booking's room and refetch on the server's booking:statusUpdate
  // push (bookingService emits it on every transition — built in phase 3,
  // inert until this joined the room). Replaces the previous 15s poll.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    joinBooking(id);

    function handleStatusUpdate() {
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: ["payment", id] });
    }

    socket.on("booking:statusUpdate", handleStatusUpdate);
    return () => {
      socket.off("booking:statusUpdate", handleStatusUpdate);
      leaveBooking(id);
    };
  }, [id, queryClient]);

  const mutation = useMutation({
    mutationFn: ({ status, files = [], note = "" }) => updateBookingStatus(id, status, { files, note }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["booking", id], updated);
      // Every transition posts an event message and may move the escrow, so
      // the thread and the payment badge both need re-reading.
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["payment", id] });
      setPromptKey(null);
      setReason("");
      setSubmittedFiles([]);
    },
  });
  const reviewMutation = useMutation({
    mutationFn: () => createReview({ bookingId: id, ...reviewForm }),
    onSuccess: () => setReviewForm({ rating: 5, comment: "" }),
  });
  // One review per side per booking: once posted (or the server says one
  // already exists), swap the form for a confirmation instead of inviting
  // a resubmit that can only 409.
  const reviewDone = reviewMutation.isSuccess || reviewMutation.error?.response?.status === 409;

  function openPrompt(key) {
    setPromptKey(key);
    setReason("");
    mutation.reset();
  }

  if (isLoading) return <PageLoading />;
  if (isError || !booking) return <PageNotFound title="Booking not found" message="It may not exist, or you don't have access to it." />;

  const currentUserId = user.id || user._id;
  const vendorUserId = booking.vendorId?.userId?._id || booking.vendorId?.userId;
  const customerUserId = booking.customerId?._id || booking.customerId;
  const isVendor = String(vendorUserId) === String(currentUserId);
  const isCustomer = String(customerUserId) === String(currentUserId);
  const isParty = isVendor || isCustomer;

  const history = booking.statusHistory || [];
  const deliveryCount = history.filter((entry) => entry.status === "submitted").length;
  // A dispute reason lives on the history entry that opened it — surface the
  // most recent one to both parties so nobody has to guess what support is
  // weighing up.
  const openDispute = booking.status === "disputed" ? [...history].reverse().find((entry) => entry.status === "disputed") : null;
  // An "accepted" entry with a note, once a delivery already exists, is a
  // revision request rather than the vendor's original acceptance.
  const openRevision = booking.status === "accepted" && deliveryCount
    ? [...history].reverse().find((entry) => entry.status === "accepted" && entry.note)
    : null;

  const prompt = promptKey ? REASON_PROMPTS[promptKey] : null;
  const canSubmitReason = prompt && (prompt.noteOptional || reason.trim().length > 0);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Booking</p>
          <h1 className="mt-2 font-display text-3xl text-ink">{booking.listingId?.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {payment && <PaymentStatusBadge status={payment.status} />}
          <BookingStatusBadge status={booking.status} />
        </div>
      </div>

      <BookingStatusStepper status={booking.status} statusHistory={history} />

      <div className="panel mt-6">
        <div className="data-row">
          <span className="data-row__label">Date</span>
          <span className="data-row__value">
            {new Date(booking.slot.date).toLocaleDateString()} · {booking.slot.startTime}–{booking.slot.endTime}
          </span>
        </div>
        <div className="data-row">
          <span className="data-row__label">Price</span>
          <span className="data-row__value">Rs {booking.price}</span>
        </div>
        <div className="data-row">
          <span className="data-row__label">Customer</span>
          <span className="data-row__value">
            <Link to={`/customer/${booking.customerId?._id}`} className="text-link">{booking.customerId?.name}</Link>
          </span>
        </div>
        <div className="data-row">
          <span className="data-row__label">Vendor</span>
          <span className="data-row__value">{booking.vendorId?.businessName}</span>
        </div>
      </div>

      <ServiceDetails booking={booking} />
      {booking.customerStats && <CustomerReliability stats={booking.customerStats} />}

      {openDispute && (
        <div className="panel-muted mt-6 border-l-4 border-l-red-500">
          <h2 className="section-title text-base text-red-700">Under review by support</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">{openDispute.note}</p>
          <p className="meta-text mt-2 text-xs">
            Opened by {openDispute.changedBy?.name || "a participant"} · {new Date(openDispute.changedAt).toLocaleString()}
          </p>
          <p className="mt-3 text-sm text-ink/70">
            The payment stays in escrow until support decides. An admin can read this booking&apos;s full
            history, every delivered file, and the conversation below — add anything that supports your
            side there.
          </p>
        </div>
      )}

      {openRevision && (
        <div className="panel-muted mt-6">
          <h2 className="section-title text-base text-primary">Revision {deliveryCount} requested</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">{openRevision.note}</p>
          <p className="meta-text mt-2 text-xs">
            {openRevision.changedBy?.name || "The customer"} · {new Date(openRevision.changedAt).toLocaleString()}
          </p>
        </div>
      )}

      {booking.submittedFiles?.length > 0 && (
        <div className="panel mt-6">
          <h2 className="section-title text-base">
            {deliveryCount > 1 ? `Latest delivery (${deliveryCount} of ${deliveryCount})` : "Delivered work"}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {booking.submittedFiles.map((file) => <a key={file} href={file} target="_blank" rel="noreferrer" className="file-pill">Open file</a>)}
          </div>
          {deliveryCount > 1 && <p className="meta-text mt-3 text-xs">Earlier deliveries stay available in the timeline below.</p>}
        </div>
      )}

      {isParty && (
        <div className="mt-6 flex flex-wrap gap-3">
          {prompt ? (
            <div className="panel w-full">
              <h2 className="section-title text-base">{prompt.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">{prompt.hint}</p>
              <div className="field mt-3">
                <label htmlFor="action-reason" className="form-label">
                  {prompt.noteOptional ? "Reason (optional)" : "Reason"}
                </label>
                <textarea
                  id="action-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder={prompt.placeholder}
                  className="form-control"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => mutation.mutate({ status: prompt.status, note: reason })}
                  disabled={!canSubmitReason || mutation.isPending}
                  className={`button ${prompt.tone} disabled:opacity-50`}
                >
                  {mutation.isPending ? "Sending..." : prompt.confirmLabel}
                </button>
                <button type="button" onClick={() => { setPromptKey(null); setReason(""); }} className="button button--outline">
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              {isVendor && booking.status === "pending" && (
                <>
                  <button type="button" onClick={() => mutation.mutate({ status: "accepted" })} disabled={mutation.isPending} className="button button--dark disabled:opacity-50">
                    {mutation.isPending ? "Accepting..." : "Accept request"}
                  </button>
                  <button type="button" onClick={() => openPrompt("decline")} className="button button--outline">
                    Decline
                  </button>
                </>
              )}
              {isCustomer && booking.status === "pending" && (
                <button type="button" onClick={() => openPrompt("cancel")} className="button button--outline">
                  Cancel booking
                </button>
              )}

              {isVendor && booking.status === "accepted" && (
                <div className="panel w-full">
                  <h2 className="section-title text-base">
                    {deliveryCount ? "Deliver the revised work" : "Submit completed work"}
                  </h2>
                  <p className="mt-1 text-sm text-muted">Add images, PDFs, or documents for the customer to review.</p>
                  <div className="mt-4">
                    <ImageUploadField kind="work" multiple accept="image/*,.pdf,.doc,.docx" onUploaded={(urls) => setSubmittedFiles((current) => [...current, ...urls])} />
                  </div>
                  {submittedFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {submittedFiles.map((file) => <a key={file} href={file} target="_blank" rel="noreferrer" className="file-pill">View submitted file</a>)}
                    </div>
                  )}
                  <button type="button" onClick={() => mutation.mutate({ status: "submitted", files: submittedFiles })} disabled={!submittedFiles.length || mutation.isPending} className="button button--dark mt-4 disabled:opacity-50">
                    {mutation.isPending ? "Submitting..." : deliveryCount ? "Resubmit work" : "Submit work"}
                  </button>
                </div>
              )}
              {isCustomer && booking.status === "accepted" && (
                <div className="panel-muted w-full">
                  <h2 className="section-title text-base">Waiting on the vendor</h2>
                  <p className="mt-1 text-sm text-ink/70">
                    Your payment is held in escrow and is only released once you accept the delivered work.
                  </p>
                </div>
              )}

              {isCustomer && booking.status === "submitted" && (
                <div className="panel-muted w-full">
                  <h2 className="section-title text-base text-primary">Review the delivery</h2>
                  <p className="mt-1 text-sm leading-6 text-ink/70">
                    Accepting completes the booking. The payment stays in escrow for 24 hours, then is released to the vendor
                    unless a problem is reported. If something isn&apos;t right, ask for a revision first — open a dispute
                    only if you can&apos;t resolve it together. If you don&apos;t respond within 3 days, the work is
                    accepted automatically.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => mutation.mutate({ status: "completed" })} disabled={mutation.isPending} className="button button--dark disabled:opacity-50">
                      {mutation.isPending ? "Accepting..." : "Accept work"}
                    </button>
                    <button type="button" onClick={() => openPrompt("revision")} className="button button--outline">
                      Request a revision
                    </button>
                    <button type="button" onClick={() => openPrompt("dispute")} className="button button--danger">
                      Report a problem
                    </button>
                  </div>
                </div>
              )}
              {isVendor && booking.status === "submitted" && (
                <div className="panel-muted w-full">
                  <h2 className="section-title text-base">Awaiting the customer&apos;s review</h2>
                  <p className="mt-1 text-sm text-ink/70">
                    They can accept the work, ask for a revision, or raise a problem. Once accepted, your payment is
                    released after a 24-hour window. If they don&apos;t respond within 3 days, the work is accepted
                    automatically.
                  </p>
                </div>
              )}

              {/* No cancel from "submitted": the work has already changed hands, so
                  money movement past this point goes through support rather than
                  letting either side act unilaterally. */}
              {booking.status === "accepted" && (
                <button type="button" onClick={() => openPrompt("cancel")} className="button button--outline">
                  Cancel booking
                </button>
              )}
              {(booking.status === "accepted" || booking.status === "submitted" || booking.status === "completed") && (
                <button type="button" onClick={() => openPrompt("dispute")} className="button button--danger">
                  {booking.status === "submitted" && isCustomer ? "Escalate to support" : "Report a problem"}
                </button>
              )}

              {booking.status === "completed" && reviewDone && (
                <div className="status-banner status-banner--ok w-full" role="status">
                  <CheckCircle2 size={20} aria-hidden="true" />
                  <p className="flex-1 text-sm font-medium">
                    {reviewMutation.isSuccess ? "Thanks — your review is posted." : "You've already reviewed this booking."}
                  </p>
                </div>
              )}
              {booking.status === "completed" && !reviewDone && (
                <form onSubmit={(event) => { event.preventDefault(); reviewMutation.mutate(); }} className="panel w-full">
                  <h2 className="section-title text-base">{isCustomer ? "Review the service" : "Review the customer"}</h2>
                  <div className="mt-3 flex items-center gap-2">
                    <label htmlFor="review-rating" className="form-label">Rating</label>
                    <select id="review-rating" value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: Number(event.target.value) })} className="form-control w-auto">
                      {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                    </select>
                  </div>
                  <textarea required maxLength={2000} value={reviewForm.comment} onChange={(event) => setReviewForm({ ...reviewForm, comment: event.target.value })} placeholder="Share your experience..." className="form-control mt-3" rows={3} />
                  <button type="submit" disabled={reviewMutation.isPending} className="button button--dark mt-3 disabled:opacity-50">Submit review</button>
                  {reviewMutation.isError && <p className="mt-2 text-xs text-red-700">{reviewMutation.error?.response?.data?.message || reviewMutation.error.message}</p>}
                </form>
              )}
            </>
          )}
        </div>
      )}
      {mutation.isError && (
        <p className="mt-3 text-sm text-red-700">
          {mutation.error?.response?.data?.message || "Action failed"}
        </p>
      )}

      <div className="mt-10">
        <h2 className="section-title text-base">Timeline</h2>
        <BookingTimeline entries={history} className="mt-3" />
      </div>

      <ChatPanel bookingId={id} />
    </div>
  );
}

export default BookingDetailPage;
