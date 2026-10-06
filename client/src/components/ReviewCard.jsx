import RatingStars from "./RatingStars";

function ReviewCard({ review }) {
  const author = review.authorRole === "vendor"
    ? review.vendorId?.businessName || "Service provider"
    : review.customerId?.name || "Customer";

  return (
    <article className="panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{author}</p>
        <RatingStars rating={review.rating} />
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/80">{review.comment}</p>
      {review.vendorResponse && (
        <div className="mt-3 rounded-xl border-l-2 border-primary bg-primary/5 py-2 pl-3 pr-3 text-sm text-ink/70">
          <p className="font-semibold text-primary">Vendor response</p>
          <p className="mt-1 leading-6">{review.vendorResponse}</p>
        </div>
      )}
    </article>
  );
}

export default ReviewCard;
