import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyBookings, updateBookingStatus } from "../../api/bookingApi";
import BookingStatusBadge from "../../components/BookingStatusBadge";
import { LoadError, SkeletonList } from "../../components/QueryState";
import { MapPin } from "lucide-react";

function VendorBookingsPage() {
  const queryClient = useQueryClient();
  const { data: bookings, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => getMyBookings(),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateBookingStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-bookings"] }),
  });

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Bookings</h1>
          <p className="workspace-subtitle">Accept requests, then submit your completed work.</p>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      {bookings?.length === 0 && <div className="empty-state">No bookings yet.</div>}
      <ul className="list-stack">
        {bookings?.map((b) => (
          <li key={b._id} className="list-item">
            <Link to={`/booking/${b._id}`} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-ink">{b.listingId?.title}</p>
                <p className="meta-text mt-1">
                  {new Date(b.slot.date).toLocaleDateString()} · {b.slot.startTime} · {b.customerId?.name}
                </p>
                {(b.serviceAddress?.line || b.notes) && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted">
                    {b.serviceAddress?.line && <span className="inline-flex items-center gap-1 font-medium text-ink/80"><MapPin size={12} aria-hidden="true" />{[b.serviceAddress.area, b.serviceAddress.city].filter(Boolean).join(", ") || b.serviceAddress.line}</span>}
                    {b.serviceAddress?.line && b.notes && " · "}
                    {b.notes}
                  </p>
                )}
              </div>
              <BookingStatusBadge status={b.status} />
            </Link>
            {b.status === "pending" && (
              <div className="mt-3 flex gap-2 border-t border-black/5 pt-3">
                <button type="button" onClick={() => statusMutation.mutate({ id: b._id, status: "accepted" })} disabled={statusMutation.isPending} className="button button--dark button--sm disabled:opacity-50">Accept request</button>
                <button type="button" onClick={() => statusMutation.mutate({ id: b._id, status: "declined" })} disabled={statusMutation.isPending} className="button button--outline button--sm disabled:opacity-50">Decline</button>
              </div>
            )}
            {b.status === "accepted" && (
              <div className="mt-3 border-t border-black/5 pt-3">
                <Link to={`/dashboard/vendor/bookings/${b._id}/submit`} className="button button--dark button--sm">
                  Submit work
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default VendorBookingsPage;
