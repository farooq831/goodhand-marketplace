import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarX, Clock, MapPin, ShieldCheck, X } from "lucide-react";
import { getListing, getListingAvailability, searchListings } from "../api/listingApi";
import { useAuth } from "../context/AuthContext";
import RatingStars from "../components/RatingStars";
import ReviewCard from "../components/ReviewCard";
import ListingCard from "../components/ListingCard";
import { SkeletonList } from "../components/QueryState";
import { getVendorReviews } from "../api/reviewApi";

function ListingDetailSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-10" aria-busy="true">
      <div>
        <div className="skeleton aspect-[4/3] rounded-3xl" />
        <div className="skeleton mt-8 h-10 w-2/3" />
        <div className="skeleton mt-4 h-24" />
      </div>
      <div className="skeleton hidden h-80 rounded-3xl lg:block" />
    </div>
  );
}

function ListingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  // Design.md §7: on mobile the booking widget lives in a bottom sheet
  // opened from a sticky "Book now" bar; on desktop it's a sticky sidebar.
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: listing, isLoading, isError } = useQuery({ queryKey: ["listing", id], queryFn: () => getListing(id) });

  const availabilityQuery = useQuery({
    queryKey: ["availability", id, date],
    queryFn: () => getListingAvailability(id, date),
    enabled: !!date,
  });
  const reviewsQuery = useQuery({
    queryKey: ["vendor-reviews", listing?.vendorId?._id],
    queryFn: () => getVendorReviews(listing.vendorId._id),
    enabled: !!listing?.vendorId?._id,
  });
  const relatedQuery = useQuery({
    queryKey: ["related-listings", listing?.category],
    queryFn: () => searchListings({ category: listing.category, limit: 4 }),
    enabled: !!listing?.category,
  });

  // Reset per-listing state when navigating between related listings.
  useEffect(() => {
    setDate("");
    setSelectedSlot(null);
    setPhotoIndex(0);
    setSheetOpen(false);
  }, [id]);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setSheetOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  if (isLoading) return <ListingDetailSkeleton />;
  if (isError || !listing) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <div className="empty-state">
          <p className="font-semibold text-ink">This listing isn't available.</p>
          <p className="mt-1">It may have been removed, or the provider is awaiting verification.</p>
          <Link to="/search" className="button button--dark mt-5">Browse other services</Link>
        </div>
      </div>
    );
  }

  const vendor = listing.vendorId;
  const todayStr = new Date().toISOString().slice(0, 10);
  const photos = listing.photos || [];
  const related = (relatedQuery.data?.listings || []).filter((item) => item._id !== listing._id).slice(0, 3);

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
        <div className="min-w-0">
          <div className="detail-image">
            {photos[photoIndex] ? (
              <img src={photos[photoIndex]} alt={listing.title} className="h-full w-full object-cover" />
            ) : (
              <div className="detail-image__placeholder">{listing.category?.slice(0, 1)}</div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto" role="group" aria-label="Photo gallery">
              {photos.map((photo, index) => (
                <button
                  key={photo}
                  type="button"
                  onClick={() => setPhotoIndex(index)}
                  aria-label={`Show photo ${index + 1} of ${photos.length}`}
                  aria-pressed={index === photoIndex}
                  className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition ${index === photoIndex ? "ring-primary" : "ring-transparent opacity-70 hover:opacity-100"}`}
                >
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <p className="eyebrow mt-8">{listing.category}</p>
          <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">{listing.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            {vendor && <RatingStars rating={vendor.avgRating} reviewCount={vendor.reviewCount} />}
            <span className="inline-flex items-center gap-1.5"><Clock size={16} aria-hidden="true" />{listing.durationMinutes} minutes</span>
            {vendor?.serviceArea?.city && <span className="inline-flex items-center gap-1.5"><MapPin size={16} aria-hidden="true" />{vendor.serviceArea.city}</span>}
          </div>
          {listing.description && <p className="mt-6 whitespace-pre-line leading-7 text-ink/75">{listing.description}</p>}

          {vendor && (
            <Link to={`/vendor/${vendor._id}`} className="nav-card mt-8">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-xl text-primary" aria-hidden="true">
                {vendor.businessName?.slice(0, 1)}
              </span>
              <span className="flex-1">
                <span className="nav-card__title flex items-center gap-1.5">
                  {vendor.businessName}
                  {vendor.isVerified && <BadgeCheck size={16} className="text-primary" aria-label="Verified" />}
                </span>
                <span className="nav-card__desc block">View profile, all services and reviews</span>
              </span>
            </Link>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="panel-muted flex gap-3 text-sm">
              <ShieldCheck size={20} className="shrink-0 text-primary" aria-hidden="true" />
              <p><span className="font-semibold text-ink">Protected payment.</span> <span className="text-muted">Your money is held in escrow and only released after the work is done.</span></p>
            </div>
            <div className="panel-muted flex gap-3 text-sm">
              <CalendarX size={20} className="shrink-0 text-primary" aria-hidden="true" />
              <p><span className="font-semibold text-ink">Free cancellation.</span> <span className="text-muted">Cancel any time before work is delivered and your held payment is refunded in full.</span></p>
            </div>
          </div>

          <section className="mt-10 border-t border-black/5 pt-8" aria-labelledby="reviews-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="reviews-heading" className="section-title">Reviews</h2>
              <span className="meta-text">{vendor?.reviewCount || 0} reviews</span>
            </div>
            {reviewsQuery.isLoading && <div className="mt-4"><SkeletonList rows={2} height="h-20" /></div>}
            {reviewsQuery.isError && <p className="mt-3 text-sm text-red-700">Reviews could not be loaded.</p>}
            {!reviewsQuery.isLoading && !reviewsQuery.isError && reviewsQuery.data?.length === 0 && (
              <div className="empty-state mt-4">No written reviews yet.</div>
            )}
            <div className="mt-4 flex flex-col gap-3">
              {reviewsQuery.data?.map((review) => <ReviewCard key={review._id} review={review} />)}
            </div>
          </section>
        </div>

        {sheetOpen && <button type="button" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-label="Close booking panel" tabIndex={-1} onClick={() => setSheetOpen(false)} />}
        <aside
          className={`detail-booking ${sheetOpen ? "detail-booking--sheet" : "max-lg:hidden"}`}
          aria-label="Book this service"
          {...(sheetOpen ? { role: "dialog", "aria-modal": "true" } : {})}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-3xl text-ink">
              Rs {listing.price} <span className="text-sm font-normal text-muted">/ {listing.durationMinutes} min</span>
            </p>
            {sheetOpen && (
              <button type="button" onClick={() => setSheetOpen(false)} className="icon-button lg:hidden" aria-label="Close booking panel">
                <X size={18} />
              </button>
            )}
          </div>

          {!user && (
            <div className="mt-5">
              <Link to="/login" state={{ from: `/listing/${id}` }} className="button button--dark w-full">Log in to book</Link>
              <p className="meta-text mt-3 text-center text-xs">New here? <Link to="/register" className="text-link">Create a free account</Link></p>
            </div>
          )}

          {user && user.role !== "customer" && (
            <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-muted">Only customer accounts can request bookings.</p>
          )}

          {user && user.role === "customer" && (
            <div className="mt-5">
              <div className="field">
                <label className="form-label" htmlFor="booking-date">Choose a date</label>
                <input
                  id="booking-date"
                  type="date"
                  min={todayStr}
                  className="form-control"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                />
              </div>

              <div className="mt-4" aria-live="polite">
                {!date && <p className="meta-text text-xs">Pick a date to see open time slots.</p>}
                {date && availabilityQuery.isLoading && <div className="flex gap-2">{[1, 2, 3].map((n) => <div key={n} className="skeleton h-8 w-16 rounded-full" />)}</div>}
                {date && availabilityQuery.isError && <p className="text-sm text-red-700">Couldn't check availability. Try another date.</p>}
                {date && availabilityQuery.data && !availabilityQuery.data.isAvailableDay && <p className="text-sm text-muted">Not available on that day.</p>}
                {date && availabilityQuery.data?.isAvailableDay && (
                  <>
                    <p className="form-label mb-2">Available times</p>
                    {availabilityQuery.data.slots.length === 0 ? (
                      <p className="text-sm text-muted">No open slots that day.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Available times">
                        {availabilityQuery.data.slots.map((slot) => (
                          <button
                            key={slot.startTime}
                            type="button"
                            onClick={() => setSelectedSlot(slot.startTime)}
                            aria-pressed={selectedSlot === slot.startTime}
                            className={`chip button--sm ${selectedSlot === slot.startTime ? "chip--on" : ""}`}
                          >
                            {slot.startTime}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={!selectedSlot}
                onClick={() => navigate(`/checkout/${id}?date=${date}&startTime=${selectedSlot}`)}
                className="button button--dark mt-5 w-full disabled:opacity-50"
              >
                Request booking
              </button>
              <p className="meta-text mt-3 flex items-center justify-center gap-1.5 text-xs">
                <ShieldCheck size={14} aria-hidden="true" />You won't be charged until the work is complete
              </p>
            </div>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <section className="border-t border-black/5 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-12 lg:px-10">
            <h2 className="font-display text-3xl text-ink">More in {listing.category}</h2>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => <ListingCard key={item._id} listing={item} />)}
            </div>
          </div>
        </section>
      )}

      {!sheetOpen && (
        <div className="booking-bar lg:hidden">
          <div>
            <p className="font-display text-xl text-ink">Rs {listing.price}</p>
            <p className="meta-text text-xs">{listing.durationMinutes} min · escrow protected</p>
          </div>
          <button type="button" onClick={() => setSheetOpen(true)} className="button button--dark">Book now</button>
        </div>
      )}
    </div>
  );
}

export default ListingDetailPage;
