import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Lock, ShieldCheck } from "lucide-react";
import { getListing } from "../api/listingApi";
import { createBooking } from "../api/bookingApi";
import { confirmPayment } from "../api/paymentApi";

function formatDate(value) {
  if (!value) return "";
  // The slot date is a plain YYYY-MM-DD; parse it as local midnight so it
  // doesn't shift a day in timezones west of UTC.
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// Design.md §2: /checkout/:listingId. The chosen date/slot travel here as
// query params from ListingDetailPage's "Request Booking" button. This
// page creates the booking (still "pending"), then records payment only
// after the customer confirms it.
function CheckoutPage() {
  const { listingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get("date");
  const startTime = searchParams.get("startTime");

  const [listing, setListing] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [startError, setStartError] = useState(null);
  const [payError, setPayError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!date || !startTime) {
        setStartError("Missing date/time — go back and pick a slot.");
        return;
      }
      try {
        const listingData = await getListing(listingId);
        if (cancelled) return;
        setListing(listingData);

        const booking = await createBooking({ listingId, date, startTime });
        if (cancelled) return;
        setBookingId(booking._id);
      } catch (err) {
        if (!cancelled) setStartError(err.response?.data?.message || "Failed to start checkout");
      }
    }

    start();
    return () => {
      cancelled = true;
    };
    // Deliberately runs once on mount only — re-running on a dependency
    // change would create a second booking for the same slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirmPayment() {
    setIsConfirming(true);
    setPayError(null);
    try {
      await confirmPayment(bookingId);
      setPaymentConfirmed(true);
    } catch (err) {
      setPayError(err.response?.data?.message || "Unable to confirm payment");
    } finally {
      setIsConfirming(false);
    }
  }

  if (startError) {
    return (
      <div className="mx-auto max-w-md px-5 py-16">
        <div className="status-banner status-banner--error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <p className="flex-1 text-sm">{startError}</p>
        </div>
        <Link to={`/listing/${listingId}`} className="button button--outline mt-4">Back to listing</Link>
      </div>
    );
  }

  const steps = ["Details", "Payment", "Requested"];
  const currentStep = paymentConfirmed ? 2 : bookingId ? 1 : 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <p className="eyebrow">Secure booking</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Checkout</h1>

      <ol className="mt-6 flex items-center gap-2 text-xs font-medium" aria-label="Checkout progress">
        {steps.map((label, index) => (
          <li key={label} className="flex items-center gap-2" aria-current={index === currentStep ? "step" : undefined}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${index <= currentStep ? "bg-primary text-white" : "bg-black/5 text-muted"}`}>{index + 1}</span>
            <span className={index <= currentStep ? "text-ink" : "text-muted"}>{label}</span>
            {index < steps.length - 1 && <span className="mx-1 h-px w-6 bg-black/10" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <section className="surface h-fit p-5" aria-label="Booking summary">
          {listing ? (
            <>
              <p className="eyebrow">{listing.category}</p>
              <p className="mt-2 font-display text-2xl text-ink">{listing.title}</p>
              {listing.vendorId?.businessName && <p className="meta-text mt-1">{listing.vendorId.businessName}</p>}
              <div className="mt-4 space-y-2 text-sm text-ink">
                <p className="flex items-center gap-2"><CalendarDays size={16} className="text-primary" aria-hidden="true" />{formatDate(date)}</p>
                <p className="flex items-center gap-2"><Clock size={16} className="text-primary" aria-hidden="true" />{startTime} · {listing.durationMinutes} min</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4">
                <span className="text-sm text-muted">Total</span>
                <span className="font-display text-2xl text-primary">Rs {listing.price}</span>
              </div>
            </>
          ) : (
            <div className="space-y-3" aria-busy="true"><div className="skeleton h-6 w-1/3" /><div className="skeleton h-8" /><div className="skeleton h-16" /></div>
          )}
        </section>

        <section aria-live="polite">
          {!bookingId && !paymentConfirmed && <div className="skeleton h-56" aria-label="Reserving your slot" />}

          {!paymentConfirmed && bookingId && (
            <div className="panel">
              <h2 className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck size={20} className="text-primary" aria-hidden="true" />Escrow-protected payment</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-ink/75">
                <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />Your payment is held by Goodhand, not sent to the provider.</li>
                <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />It's released only after the work is complete.</li>
                <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />If the provider declines or you cancel, it's refunded in full.</li>
              </ul>
              {payError && <p className="status-banner status-banner--error mt-4 text-sm" role="alert">{payError}</p>}
              <button type="button" onClick={handleConfirmPayment} disabled={isConfirming} className="button button--dark mt-5 w-full disabled:opacity-50">
                <Lock size={16} aria-hidden="true" className="mr-2" />
                {isConfirming ? "Confirming…" : `Pay Rs ${listing?.price ?? ""} into escrow`}
              </button>
              <p className="meta-text mt-3 text-center text-xs">Demo checkout — no real card is charged.</p>
            </div>
          )}

          {paymentConfirmed && (
            <div className="panel">
              <p className="flex items-center gap-2 text-lg font-semibold text-primary"><CheckCircle2 size={22} aria-hidden="true" />Booking requested</p>
              <p className="mt-2 text-sm leading-6 text-ink/75">Your payment is held in escrow and your request has been sent to the provider. We'll notify you as soon as they respond.</p>
              <button type="button" onClick={() => navigate(`/booking/${bookingId}`)} className="button button--dark mt-5 w-full">View booking</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default CheckoutPage;
