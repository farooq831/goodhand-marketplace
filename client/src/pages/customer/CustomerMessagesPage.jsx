import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getMyBookings } from "../../api/bookingApi";
import { getBookingMessages } from "../../api/messageApi";
import { LoadError, SkeletonList } from "../../components/QueryState";

function CustomerMessagesPage() {
  const { data: bookings = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["my-bookings"], queryFn: getMyBookings });
  const messageQueries = useQueries({
    queries: bookings.map((booking) => ({
      queryKey: ["messages", booking._id],
      queryFn: () => getBookingMessages(booking._id),
    })),
  });

  const threads = bookings
    .map((booking, index) => ({ booking, messages: messageQueries[index]?.data || [] }))
    .sort((a, b) => {
      const aDate = a.messages.at(-1)?.createdAt || a.booking.updatedAt;
      const bDate = b.messages.at(-1)?.createdAt || b.booking.updatedAt;
      return new Date(bDate) - new Date(aDate);
    });

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1 className="workspace-title">Messages</h1>
          <p className="workspace-subtitle">Conversations are scoped to each booking.</p>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      {!isLoading && !isError && threads.length === 0 && <div className="empty-state">No bookings yet. Chat becomes available from a booking.</div>}
      <ul className="list-stack">
        {threads.map(({ booking, messages }) => {
          const latest = messages.at(-1);
          return (
            <li key={booking._id}>
              <Link to={`/booking/${booking._id}`} className="list-item block">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{booking.listingId?.title}</p>
                  {latest && <span className="meta-text shrink-0 text-xs">{new Date(latest.createdAt).toLocaleDateString()}</span>}
                </div>
                {latest ? (
                  <p className="mt-1 truncate text-sm text-muted">{latest.text}</p>
                ) : (
                  <p className="mt-1 text-sm font-medium text-primary">Open chat</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default CustomerMessagesPage;
