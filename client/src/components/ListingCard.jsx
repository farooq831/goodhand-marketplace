import { Link } from "react-router-dom";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import RatingStars from "./RatingStars";

function ListingCard({ listing }) {
  const vendor = listing.vendorId; // populated by the API

  return (
    <Link
      to={`/listing/${listing._id}`}
      className="listing-card group"
    >
      <div className="listing-card__image">
        {listing.photos?.[0] ? <img src={listing.photos[0]} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="listing-card__placeholder"><span>{listing.category?.slice(0, 1)}</span></div>}
        <span className="listing-card__tag">{listing.category}</span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl leading-tight text-ink">{listing.title}</h3><span className="shrink-0 whitespace-nowrap text-lg font-semibold text-primary">Rs {listing.price}</span></div>
        {vendor && <p className="mt-2 text-sm text-muted">{vendor.businessName}</p>}
        {vendor && <div className="mt-3"><RatingStars rating={vendor.avgRating} reviewCount={vendor.reviewCount} /></div>}
        <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-3 text-xs text-muted"><span className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden="true" />{listing.durationMinutes} min</span>{vendor?.serviceArea?.city && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{vendor.serviceArea.city}</span>}</span><span className="inline-flex items-center gap-0.5 font-semibold text-primary">View<ArrowUpRight size={14} aria-hidden="true" /></span></div>
      </div>
    </Link>
  );
}

export default ListingCard;
