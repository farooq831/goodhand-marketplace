import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { getNotifications, getUnreadNotificationCount, markNotificationRead } from "../api/notificationApi";
import { useAuth } from "../context/AuthContext";

const LABELS = {
  booking_request: "New booking request",
  booking_accepted: "Booking accepted",
  booking_declined: "Booking declined",
  booking_completed: "Booking completed",
  booking_cancelled: "Booking cancelled",
  booking_disputed: "Dispute raised",
  dispute_opened: "Dispute needs review",
  dispute_resolved: "Dispute resolved",
  work_submitted: "Work submitted for review",
  revision_requested: "Revision requested",
  payment_confirmed: "Payment held in escrow",
  payment_released: "Payment released",
  payment_refunded: "Payment refunded",
  payment_failed: "Payment failed",
  message_received: "New message",
  review_received: "New review",
  vendor_changes_requested: "Action needed: update your vendor profile",
  vendor_approved: "Your vendor profile is approved",
  vendor_submitted: "New vendor to verify",
  vendor_resubmitted: "Vendor resubmitted for review",
  payout_sent: "Payout sent to your account",
  booking_reminder: "Upcoming booking reminder",
};

// Non-booking notifications that still have an obvious place to go.
const LINKS = {
  vendor_changes_requested: "/dashboard/vendor/profile",
  vendor_approved: "/dashboard/vendor/listings",
  vendor_submitted: "/dashboard/admin/vendors",
  vendor_resubmitted: "/dashboard/admin/vendors",
  payout_sent: "/dashboard/vendor/earnings",
};

const labelFor = (type) => LABELS[type] || type.replaceAll("_", " ");

function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const queryClient = useQueryClient();
  const { data: count = 0 } = useQuery({ queryKey: ["notification-count"], queryFn: getUnreadNotificationCount, refetchInterval: 60000 });
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    enabled: open,
  });
  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });

  // Dismiss on outside click or Escape, like any other popover.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => rootRef.current && !rootRef.current.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleOpen(notification) {
    if (!notification.isRead) readMutation.mutate(notification._id);
    setOpen(false);
  }

  const messagesPath = user?.role === "admin" ? "/dashboard/admin/disputes" : `/dashboard/${user?.role}/messages`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
        className="icon-button relative"
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-ink">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-black/5 bg-white p-3 shadow-soft">
          <h2 className="mb-2 px-1 text-sm font-semibold text-ink">Notifications</h2>
          {isLoading && <div className="skeleton h-14" />}
          {!isLoading && notifications.length === 0 && <p className="meta-text px-1 py-4 text-center text-xs">You're all caught up.</p>}
          <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {notifications.slice(0, 10).map((notification) => {
              const bookingId = notification.payload?.bookingId;
              const href = bookingId ? `/booking/${bookingId}` : LINKS[notification.type];
              const body = (
                <>
                  <span className="flex items-center gap-2 font-medium text-ink">
                    {!notification.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                    {labelFor(notification.type)}
                  </span>
                  <span className="meta-text mt-0.5 block text-xs">{new Date(notification.createdAt).toLocaleString()}</span>
                </>
              );
              const className = `block rounded-xl p-2.5 text-sm transition hover:bg-canvas ${notification.isRead ? "" : "bg-amber-50/70"}`;
              return (
                <li key={notification._id}>
                  {href ? (
                    <Link to={href} onClick={() => handleOpen(notification)} className={className}>{body}</Link>
                  ) : (
                    <button type="button" onClick={() => handleOpen(notification)} className={`${className} w-full text-left`}>{body}</button>
                  )}
                </li>
              );
            })}
          </ul>
          <Link to={messagesPath} onClick={() => setOpen(false)} className="mt-2 inline-flex px-1 text-xs font-semibold text-primary hover:text-ink">
            {user?.role === "admin" ? "Open dispute queue" : "Open messages"}
          </Link>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
