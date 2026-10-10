import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MapPin } from "lucide-react";
import ListingCard from "../../components/ListingCard";
import QueryState from "../../components/QueryState";
import RatingStars from "../../components/RatingStars";
import SaveButton from "../../components/SaveButton";
import { useSaved } from "../../hooks/useSaved";

function CustomerSavedPage() {
  const [tab, setTab] = useState("listings");
  const { query } = useSaved();
  const listings = query.data?.listings || [];
  const vendors = query.data?.vendors || [];
  const items = tab === "listings" ? listings : vendors;

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Your shortlist</p>
          <h1 className="workspace-title">Saved</h1>
          <p className="workspace-subtitle">Services and providers you've saved to book again or compare later.</p>
        </div>
      </div>

      <div className="mb-5 flex gap-6 border-b border-black/5" role="tablist">
        {[["listings", "Services", listings.length], ["vendors", "Providers", vendors.length]].map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`tab ${tab === id ? "tab--active" : ""}`}>
            {label} {n > 0 && <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-xs">{n}</span>}
          </button>
        ))}
      </div>

      <QueryState
        query={query}
        isEmpty={items.length === 0}
        empty={<span className="inline-flex items-center gap-1.5">Tap the <Heart size={14} aria-hidden="true" /> on any {tab === "listings" ? "service" : "provider"} to save it here.</span>}
        emptyAction={<Link to="/search" className="button button--dark button--sm">Browse services</Link>}
      >
        {tab === "listings" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{listings.map((l) => <ListingCard key={l._id} listing={l} />)}</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {vendors.map((v) => (
              <li key={v._id}>
                <Link to={`/vendor/${v._id}`} className="list-item flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{v.businessName}</p>
                    <p className="meta-text mt-0.5 flex items-center gap-2 text-xs">{v.category}{v.serviceArea?.city && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{v.serviceArea.city}</span>}</p>
                    <div className="mt-2"><RatingStars rating={v.avgRating} reviewCount={v.reviewCount} /></div>
                  </div>
                  <SaveButton kind="vendors" id={v._id} label={v.businessName} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export default CustomerSavedPage;
