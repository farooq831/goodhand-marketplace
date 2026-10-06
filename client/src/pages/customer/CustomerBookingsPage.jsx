import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMyBookings } from "../../api/bookingApi";
import BookingStatusBadge from "../../components/BookingStatusBadge";
import { LoadError, SkeletonList } from "../../components/QueryState";

function CustomerBookingsPage() {
  const { data: bookings, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => getMyBookings(),
  });

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1 className="workspace-title">My bookings</h1>
          <p className="workspace-subtitle">Track your requests from pending to complete.</p>
        </div>
      </div>

      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      {bookings?.length === 0 && <div className="empty-state">No bookings yet. <Link to="/search" className="text-link">Browse services</Link> to get started.</div>}

      <ul className="list-stack">
        {bookings?.map((b) => (
          <li key={b._id}>
            <Link to={`/booking/${b._id}`} className="list-item flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-ink">{b.listingId?.title}</p>
                <p className="meta-text mt-1">
                  {new Date(b.slot.date).toLocaleDateString()} · {b.slot.startTime} · {b.vendorId?.businessName}
                </p>
              </div>
              <BookingStatusBadge status={b.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CustomerBookingsPage;
