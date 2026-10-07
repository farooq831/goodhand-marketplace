import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Lock, MapPin, ShieldCheck } from "lucide-react";
import { getListing } from "../api/listingApi";
import { createBooking, getMyBookings } from "../api/bookingApi";
import { confirmPayment } from "../api/paymentApi";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../components/QueryState";
import { SERVICE_LOCATION_LABEL } from "../utils/serviceLocation";

function formatDate(value) {
  if (!value) return "";
  // The slot date is a plain YYYY-MM-DD; parse it as local midnight so it
  // doesn't shift a day in timezones west of UTC.
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// Design.md §2: /checkout/:listingId. Date/slot arrive as query params from
// the listing's booking widget. Step 1 collects where the job is and any
// details; the booking is created only when that's submitted (it used to be
// created on page load, so a refresh made a duplicate). Step 2 pays into escrow.
function CheckoutPage() {
  const { listingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const date = searchParams.get("date");
  const startTime = searchParams.get("startTime");

  const listingQuery = useQuery({ queryKey: ["listing", listingId], queryFn: () => getListing(listingId) });
  const listing = listingQuery.data;
  const atCustomer = (listing?.serviceLocation || "customer") === "customer";

  // Prefill the address from the customer's most recent at-home booking.
  const pastBookings = useQuery({ queryKey: ["my-bookings"], queryFn: () => getMyBookings() });
  const [details, setDetails] = useState({ line: "", area: "", city: "", contactPhone: user?.phone || "", notes: "" });
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !pastBookings.data) return;
    const last = pastBookings.data.find((b) => b.serviceAddress?.line);
    if (last) {
      setDetails((d) => ({ ...d, line: last.serviceAddress.line, area: last.serviceAddress.area || "", city: last.serviceAddress.city || "", contactPhone: d.contactPhone || last.contactPhone || "" }));
    }
    setPrefilled(true);
  }, [pastBookings.data, prefilled]);

  const [bookingId, setBookingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [payError, setPayError] = useState(null);

  const set = (field) => (event) => setDetails((d) => ({ ...d, [field]: event.target.value }));

  async function handleDetails(event) {
    event.preventDefault();
    setDetailsError(null);
    setIsCreating(true);
    try {
      const booking = await createBooking({
        listingId,
        date,
        startTime,
        notes: details.notes,
        ...(atCustomer ? { serviceAddress: { line: details.line, area: details.area, city: details.city }, contactPhone: details.contactPhone } : {}),
      });
      setBookingId(booking._id);
    } catch (err) {
      setDetailsError(errorMessage(err, "Couldn't reserve this slot."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmPayment() {
    setIsConfirming(true);
    setPayError(null);
    try {
      await confirmPayment(bookingId);
      setPaymentConfirmed(true);
    } catch (err) {
      setPayError(errorMessage(err, "Unable to confirm payment"));
    } finally {
      setIsConfirming(false);
    }
  }

  if (!date || !startTime || listingQuery.isError) {
    return (
      <div className="mx-auto max-w-md px-5 py-16">
        <div className="status-banner status-banner--error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <p className="flex-1 text-sm">{!date || !startTime ? "Missing date/time — go back and pick a slot." : "This service isn't available."}</p>
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
                <p className="flex items-center gap-2"><MapPin size={16} className="text-primary" aria-hidden="true" />{SERVICE_LOCATION_LABEL[listing.serviceLocation || "customer"]}</p>
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
          {!bookingId && (
            <form onSubmit={handleDetails} className="panel flex flex-col gap-4">
              <h2 className="font-semibold text-ink">{atCustomer ? "Where should the provider come?" : "Anything the provider should know?"}</h2>
              {atCustomer && (
                <>
                  <div className="field">
                    <label htmlFor="co-line" className="form-label">House / street <span className="text-red-700">*</span></label>
                    <input id="co-line" required className="form-control" placeholder="e.g. House 12, Street 4" value={details.line} onChange={set("line")} autoComplete="address-line1" />
                  </div>
                  <div className="flex gap-3">
                    <div className="field flex-1">
                      <label htmlFor="co-area" className="form-label">Area / sector</label>
                      <input id="co-area" className="form-control" placeholder="e.g. DHA Phase 5" value={details.area} onChange={set("area")} autoComplete="address-level3" />
                    </div>
                    <div className="field flex-1">
                      <label htmlFor="co-city" className="form-label">City <span className="text-red-700">*</span></label>
                      <input id="co-city" required className="form-control" placeholder="e.g. Lahore" value={details.city} onChange={set("city")} autoComplete="address-level2" />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="co-phone" className="form-label">Contact phone <span className="text-red-700">*</span></label>
                    <input id="co-phone" required type="tel" inputMode="tel" className="form-control" placeholder="e.g. 0300 1234567" value={details.contactPhone} onChange={set("contactPhone")} autoComplete="tel" />
                    <span className="meta-text text-xs">Only shared with your provider for this booking.</span>
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="co-notes" className="form-label">Job details (optional)</label>
                <textarea id="co-notes" rows={3} maxLength={1000} className="form-control" placeholder={atCustomer ? "e.g. Kitchen tap leaking under the sink; parking available outside." : "e.g. My son needs help with algebra, chapter 4."} value={details.notes} onChange={set("notes")} />
              </div>
              {detailsError && <p className="status-banner status-banner--error text-sm" role="alert">{detailsError}</p>}
              <button type="submit" disabled={isCreating || !listing} className="button button--dark w-full disabled:opacity-50">
                {isCreating ? "Reserving your slot…" : "Continue to payment"}
              </button>
            </form>
          )}

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
