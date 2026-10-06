import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getMyBookings } from "../../api/bookingApi";
import { getBookingMessages } from "../../api/messageApi";
import { LoadError, SkeletonList } from "../../components/QueryState";

function VendorMessagesPage() {
  const { data: bookings = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["my-bookings"], queryFn: getMyBookings });
  const messageQueries = useQueries({
    queries: bookings.map((booking) => ({
      queryKey: ["messages", booking._id],
      queryFn: () => getBookingMessages(booking._id),
    })),
  });

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Messages</h1>
          <p className="workspace-subtitle">Conversations are scoped to each booking.</p>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      {!isLoading && !isError && bookings.length === 0 && <div className="empty-state">No bookings yet.</div>}
      <ul className="list-stack">
        {bookings.map((booking, index) => {
          const messages = messageQueries[index]?.data || [];
          const latest = messages.at(-1);
          return (
            <li key={booking._id}>
              <Link to={`/booking/${booking._id}`} className="list-item block">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{booking.listingId?.title}</p>
                  <span className="meta-text shrink-0 text-xs">{booking.customerId?.name}</span>
                </div>
                <p className="mt-1 truncate text-sm text-muted">{latest?.text || "Open chat"}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default VendorMessagesPage;