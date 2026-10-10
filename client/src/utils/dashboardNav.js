import {
  Banknote,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Heart,
  LayoutDashboard,
  LayoutList,
  ListChecks,
  MessageSquare,
  Scale,
  ShieldAlert,
  Search,
  Store,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

// Single source for role navigation: the dashboard landing cards and the
// persistent RoleAwareDashboardShell sidebar both read from here, so a new
// page only has to be registered once to show up in both places.
export const NAV_BY_ROLE = {
  customer: [
    { to: "/search", title: "Browse services", desc: "Discover trusted local specialists.", icon: Search },
    { to: "/dashboard/customer/bookings", title: "My bookings", desc: "Track requests, work, and reviews.", icon: ClipboardList },
    { to: "/dashboard/customer/saved", title: "Saved", desc: "Services and providers you saved.", icon: Heart },
    { to: "/dashboard/customer/messages", title: "Messages", desc: "Chat with your providers.", icon: MessageSquare },
  ],
  vendor: [
    { to: "/dashboard/vendor/profile", title: "Vendor profile", desc: "Business details and verification.", icon: Store },
    { to: "/dashboard/vendor/listings", title: "My listings", desc: "Create and manage your services.", icon: ListChecks },
    { to: "/dashboard/vendor/bookings", title: "Bookings", desc: "Accept requests and submit work.", icon: ClipboardList },
    { to: "/dashboard/vendor/messages", title: "Messages", desc: "Chat with your customers.", icon: MessageSquare },
    { to: "/dashboard/vendor/calendar", title: "Calendar", desc: "See your accepted bookings.", icon: CalendarDays },
    { to: "/dashboard/vendor/earnings", title: "Earnings", desc: "Track released and held payments.", icon: Wallet },
  ],
  admin: [
    { to: "/dashboard/admin/vendors", title: "Vendor verification", desc: "Approve pending providers.", icon: BadgeCheck },
    { to: "/dashboard/admin/listings", title: "Listings", desc: "Moderate and feature services.", icon: LayoutList },
    { to: "/dashboard/admin/disputes", title: "Dispute queue", desc: "Resolve held payments.", icon: Scale },
    { to: "/dashboard/admin/payouts", title: "Payouts", desc: "Record money sent to vendors.", icon: Banknote },
    { to: "/dashboard/admin/analytics", title: "Analytics", desc: "Marketplace GMV and volume.", icon: BarChart3 },
    { to: "/dashboard/admin/security", title: "Security & audit", desc: "Failed logins and every admin action.", icon: ShieldAlert },
    { to: "/dashboard/admin/users", title: "Account status", desc: "Suspend or reactivate accounts.", icon: Users },
  ],
};

export const OVERVIEW_ITEM = { to: "/dashboard", title: "Overview", icon: LayoutDashboard };
export const ACCOUNT_ITEM = { to: "/dashboard/account", title: "Account settings", icon: UserCog };
