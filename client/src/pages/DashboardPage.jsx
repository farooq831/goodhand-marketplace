import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Clock, ShieldCheck, Store } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getMyVendorProfile } from "../api/vendorApi";
import { NAV_BY_ROLE } from "../utils/dashboardNav";
import VendorStatsPanel from "../components/VendorStatsPanel";

// Design.md §3.2: a vendor must see where they stand in onboarding before
// anything else — no profile yet, waiting on admin approval, or live.
function VendorStatusBanner() {
  const { data: profile, isLoading } = useQuery({ queryKey: ["my-vendor-profile"], queryFn: getMyVendorProfile });
  if (isLoading) return <div className="skeleton mb-6 h-20" />;

  if (!profile) {
    return (
      <div className="status-banner status-banner--info mb-6" role="status">
        <Store size={20} aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">Set up your business profile</p>
          <p className="text-sm opacity-80">Customers can't find you until your profile exists and an admin verifies it.</p>
        </div>
        <Link to="/dashboard/vendor/profile" className="button button--dark button--sm">Create profile</Link>
      </div>
    );
  }
  if (profile.verificationStatus === "changes_requested") {
    return (
      <div className="status-banner status-banner--error mb-6" role="alert">
        <AlertTriangle size={20} aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">Action needed: update your profile</p>
          <p className="text-sm opacity-80">Our team asked you to correct some details or documents before you can go live.</p>
        </div>
        <Link to="/dashboard/vendor/profile" className="button button--dark button--sm">See what to fix</Link>
      </div>
    );
  }
  if (!profile.isVerified) {
    return (
      <div className="status-banner status-banner--pending mb-6" role="status">
        <Clock size={20} aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">Pending verification</p>
          <p className="text-sm opacity-80">Your listings go live as soon as an admin approves your verification documents.</p>
        </div>
        <Link to="/dashboard/vendor/profile" className="button button--outline button--sm">Review profile</Link>
      </div>
    );
  }
  return (
    <div className="status-banner status-banner--ok mb-6" role="status">
      <ShieldCheck size={20} aria-hidden="true" />
      <p className="flex-1 font-semibold">{profile.businessName} is verified and visible to customers.</p>
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const navItems = NAV_BY_ROLE[user.role] || [];

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/15" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 font-display text-xl text-primary" aria-hidden="true">
              {user.name?.slice(0, 1)}
            </div>
          )}
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1 className="workspace-title mt-1">Welcome, {user.name}</h1>
            <p className="mt-1 text-sm text-muted">
              Signed in as <span className="font-semibold capitalize text-primary">{user.role}</span> · {user.email}
            </p>
          </div>
        </div>
      </div>

      {user.role === "vendor" && <VendorStatusBanner />}
      {user.role === "vendor" && <VendorStatsPanel />}

      <p className="section-title mb-3">Quick actions</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {navItems.map(({ to, title, desc, icon: Icon }) => (
          <Link key={to} to={to} className="nav-card">
            <span className="nav-card__icon" aria-hidden="true"><Icon size={20} /></span>
            <span className="flex-1">
              <span className="nav-card__title">{title}</span>
              <span className="nav-card__desc block">{desc}</span>
            </span>
            <ArrowRight className="nav-card__arrow" size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default DashboardPage;
