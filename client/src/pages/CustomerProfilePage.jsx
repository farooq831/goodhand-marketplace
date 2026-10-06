import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCustomerReviews } from "../api/reviewApi";
import RatingStars from "../components/RatingStars";
import ReviewCard from "../components/ReviewCard";
import apiClient from "../api/client";
import { PageLoading, PageNotFound } from "../components/QueryState";

function CustomerProfilePage() {
  const { id } = useParams();
  const profileQuery = useQuery({
    queryKey: ["customer-profile", id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/users/profile/${id}`);
      return data;
    },
  });
  const reviewsQuery = useQuery({ queryKey: ["customer-reviews", id], queryFn: () => getCustomerReviews(id) });

  if (profileQuery.isLoading) return <PageLoading />;
  if (profileQuery.isError || !profileQuery.data) return <PageNotFound title="Customer not found" />;
  const { user } = profileQuery.data;
  const reviews = reviewsQuery.data || [];
  const average = reviews.length ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length : 0;

  return (
    <div className="workspace-page">
      <div className="hero-panel mb-8">
        <p className="eyebrow text-accent">Customer profile</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">{user.name}</h1>
        <div className="mt-4"><RatingStars rating={average} reviewCount={reviews.length} /></div>
      </div>
      <h2 className="section-title mb-4">Reviews from service providers</h2>
      <div className="flex flex-col gap-3">
        {reviews.map((review) => <ReviewCard key={review._id} review={review} />)}
      </div>
      {!reviews.length && <div className="empty-state">No reviews yet.</div>}
    </div>
  );
}

export default CustomerProfilePage;