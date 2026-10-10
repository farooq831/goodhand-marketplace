import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyListings, deleteListing } from "../../api/listingApi";
import { SkeletonList } from "../../components/QueryState";

function VendorListingsPage() {
  const queryClient = useQueryClient();
  const {
    data: listings,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["my-listings"],
    queryFn: getMyListings,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteListing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
  });

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">My listings</h1>
          <p className="workspace-subtitle">Create and manage the services you offer.</p>
        </div>
        <Link to="/dashboard/vendor/listings/new" className="button button--dark">
          + New listing
        </Link>
      </div>

      {isLoading && <SkeletonList />}
      {isError && (
        <div className="empty-state">
          Couldn't load listings — do you have a vendor profile yet?
        </div>
      )}
      {listings?.length === 0 && <div className="empty-state">No listings yet. Create your first service to start receiving bookings.</div>}

      <ul className="list-stack">
        {listings?.map((listing) => (
          <li key={listing._id} className="list-item flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink">{listing.title}</p>
              <p className="meta-text mt-1 flex items-center gap-2">
                <span className="font-medium text-primary">Rs {listing.price}</span>
                <span aria-hidden="true">·</span>
                {listing.moderation?.hidden ? (
                  <span className="font-medium text-red-700" title={listing.moderation.reason}>Hidden by our team — {listing.moderation.reason}</span>
                ) : (
                  <span className={listing.isActive ? "text-primary" : "text-muted"}>{listing.isActive ? "Active" : "Paused"}</span>
                )}
                {listing.featuredUntil && new Date(listing.featuredUntil) > new Date() && <span className="ml-2 font-medium text-amber-700">· Featured</span>}
                {listing.views > 0 && <span className="meta-text ml-2">· {listing.views} views</span>}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Link
                to={`/dashboard/vendor/listings/${listing._id}/edit`}
                className="text-link"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${listing.title}"?`)) deleteMutation.mutate(listing._id);
                }}
                className="font-semibold text-red-700 underline-offset-2 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default VendorListingsPage;
