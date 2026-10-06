// Display-only rating (Design.md component inventory). An input variant
// (for leaving a review) can be added alongside the reviews feature.
function RatingStars({ rating: rawRating, reviewCount }) {
  // API can send null for a vendor with no reviews yet.
  const rating = Number(rawRating) || 0;
  const rounded = Math.round(rating);

  return (
    <span className="inline-flex items-center gap-1.5 text-sm" aria-label={`Rated ${rating.toFixed(1)} out of 5${reviewCount != null ? `, ${reviewCount} reviews` : ""}`}>
      <span aria-hidden="true" className="tracking-tight">
        <span className="text-amber-500">{"★".repeat(rounded)}</span>
        <span className="text-black/15">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className="font-medium text-current">
        {rating.toFixed(1)}
        {reviewCount != null && <span className="font-normal text-muted"> ({reviewCount})</span>}
      </span>
    </span>
  );
}

export default RatingStars;
