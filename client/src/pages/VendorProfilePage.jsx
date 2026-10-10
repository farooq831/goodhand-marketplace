import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, BadgeCheck, Clock, MapPin } from "lucide-react";
import SaveButton from "../components/SaveButton";
import { useQuery } from "@tanstack/react-query";
import { getVendorProfile } from "../api/vendorApi";
import { searchListings } from "../api/listingApi";
import { getVendorReviews } from "../api/reviewApi";
import ListingCard from "../components/ListingCard";
import RatingStars from "../components/RatingStars";
import ReviewCard from "../components/ReviewCard";
import { SkeletonList } from "../components/QueryState";

const TABS = [
  { id: "listings", label: "Listings" },
  { id: "work", label: "Work" },
  { id: "reviews", label: "Reviews" },
  { id: "about", label: "About" },
];

function VendorProfilePage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("listings");

  const vendorQuery = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getVendorProfile(id),
  });

  const listingsQuery = useQuery({
    queryKey: ["vendor-listings", id],
    queryFn: () => searchListings({ vendorId: id, limit: 50 }),
    enabled: !!vendorQuery.data,
  });
  const reviewsQuery = useQuery({
    queryKey: ["vendor-reviews", id],
    queryFn: () => getVendorReviews(id),
  });

  if (vendorQuery.isLoading) return <div className="workspace-page"><div className="skeleton mb-8 h-56 rounded-3xl" /><SkeletonList rows={2} /></div>;
  if (vendorQuery.isError || !vendorQuery.data) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <div className="empty-state">
          <p className="font-semibold text-ink">This provider isn't available.</p>
          <Link to="/search" className="button button--dark mt-5">Browse services</Link>
        </div>
      </div>
    );
  }

  const vendor = vendorQuery.data;
  // null means "no requests yet" rather than "answered none of them".
  const responseRate = vendor.responseRate == null ? "New provider" : `${vendor.responseRate}% response rate`;

  return (
    <div className="workspace-page">
      <div className="hero-panel mb-8">
        <p className="eyebrow text-accent">{vendor.category}</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <h1 className="font-display text-4xl sm:text-5xl">{vendor.businessName}</h1>
          <SaveButton kind="vendors" id={vendor._id} label={vendor.businessName} className="shrink-0" />
        </div>
        {vendor.trustScore != null && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-snow/10 px-3 py-1 text-xs font-semibold text-snow ring-1 ring-snow/20" title="Based on ratings, completion and response rates, verification and disputes">
            <Award size={14} aria-hidden="true" />Trust score {vendor.trustScore}/100
          </p>
        )}
        {vendor.serviceArea?.city && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-snow/70">
            <MapPin size={14} aria-hidden="true" />
            {vendor.serviceArea.city}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <RatingStars rating={vendor.avgRating} reviewCount={vendor.reviewCount} />
          <span className="text-sm text-snow/65">{responseRate}</span>
          {vendor.isVerified ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-snow/10 px-2.5 py-1 text-[11px] font-semibold text-snow ring-1 ring-snow/20">
              <BadgeCheck size={14} aria-hidden="true" /> Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <Clock size={14} aria-hidden="true" /> Pending verification
            </span>
          )}
        </div>
        {vendor.description && <p className="mt-4 max-w-2xl text-sm leading-6 text-snow/75">{vendor.description}</p>}
      </div>

      <div className="mb-6 flex gap-6 border-b border-black/5" role="tablist" aria-label="Vendor profile sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`tab ${activeTab === tab.id ? "tab--active" : ""}`}
          >
            {tab.label}
            {tab.id === "reviews" ? ` (${vendor.reviewCount || 0})` : ""}
          </button>
        ))}
      </div>

      {activeTab === "listings" && (
        <section id="panel-listings" role="tabpanel" aria-labelledby="tab-listings">
          <h2 className="section-title mb-4">Listings</h2>
          {listingsQuery.isLoading && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="skeleton aspect-[4/5]" />)}</div>}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listingsQuery.data?.listings.map((listing) => (
              <ListingCard key={listing._id} listing={listing} />
            ))}
          </div>
          {listingsQuery.data?.listings.length === 0 && (
            <div className="empty-state">No active listings yet.</div>
          )}
        </section>
      )}

      {activeTab === "work" && (
        <section id="panel-work" role="tabpanel" aria-labelledby="tab-work">
          <h2 className="section-title mb-4">Past work</h2>
          {vendor.portfolio?.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {vendor.portfolio.map((item) => (
                <li key={item.url}>
                  <a href={item.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-2xl bg-white shadow-soft">
                    <img src={item.url} alt={item.caption || `Work by ${vendor.businessName}`} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                    {item.caption && <p className="truncate px-3 py-2 text-xs text-muted">{item.caption}</p>}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">This provider hasn&apos;t added photos of past work yet.</div>
          )}
        </section>
      )}

      {activeTab === "reviews" && (
        <section id="panel-reviews" role="tabpanel" aria-labelledby="tab-reviews">
          <h2 className="section-title mb-4">Reviews</h2>
          {reviewsQuery.isLoading && <SkeletonList rows={2} height="h-20" />}
          {reviewsQuery.isError && <p className="text-sm text-red-700">Reviews could not be loaded.</p>}
          <div className="flex flex-col gap-3">
            {reviewsQuery.data?.map((review) => <ReviewCard key={review._id} review={review} />)}
          </div>
          {reviewsQuery.data?.length === 0 && <div className="empty-state">No reviews yet.</div>}
        </section>
      )}

      {activeTab === "about" && (
        <section id="panel-about" role="tabpanel" aria-labelledby="tab-about">
          <h2 className="section-title mb-4">About</h2>
          <div className="panel max-w-2xl">
            {vendor.description ? (
              <p className="text-sm leading-6 text-ink/70">{vendor.description}</p>
            ) : (
              <p className="text-sm text-muted">This provider hasn&apos;t written a description yet.</p>
            )}
            <div className="mt-4">
              <div className="data-row">
                <span className="data-row__label">Category</span>
                <span className="data-row__value">{vendor.category}</span>
              </div>
              <div className="data-row">
                <span className="data-row__label">Service area</span>
                <span className="data-row__value">{vendor.serviceArea?.city || "Not specified"}</span>
              </div>
              <div className="data-row">
                <span className="data-row__label">Verification</span>
                <span className="data-row__value">{vendor.isVerified ? "Verified by Goodhand" : "Pending review"}</span>
              </div>
              <div className="data-row">
                <span className="data-row__label">Response rate</span>
                <span className="data-row__value">
                  {vendor.responseRate == null ? "No requests yet" : `${vendor.responseRate}%`}
                </span>
              </div>
              <div className="data-row">
                <span className="data-row__label">Average rating</span>
                <span className="data-row__value">
                  {vendor.reviewCount
                    ? `${vendor.avgRating.toFixed(1)} from ${vendor.reviewCount} reviews`
                    : "Not rated yet"}
                </span>
              </div>
              {vendor.createdAt && (
                <div className="data-row">
                  <span className="data-row__label">On Goodhand since</span>
                  <span className="data-row__value">
                    {new Date(vendor.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default VendorProfilePage;
