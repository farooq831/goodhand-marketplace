import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ACCOUNT_ITEM, NAV_BY_ROLE, OVERVIEW_ITEM } from "../utils/dashboardNav";
import { useSeo } from "../hooks/useSeo";

const ROLE_LABEL = { customer: "Customer", vendor: "Provider workspace", admin: "Admin console" };

// Design.md §6/§7: persistent sidebar on desktop, horizontal tab strip on
// mobile. Customer, vendor, and admin get different nav sets on purpose —
// they're meant to read as different apps sharing one visual system.
function RoleAwareDashboardShell() {
  const { user } = useAuth();
  // Private pages: keep them out of search engines.
  useSeo({ title: "Your workspace", noindex: true });
  const items = [OVERVIEW_ITEM, ...(NAV_BY_ROLE[user.role] || []).filter((item) => item.to.startsWith("/dashboard")), ACCOUNT_ITEM];

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Workspace navigation">
        <p className="dashboard-sidebar__role">{ROLE_LABEL[user.role]}</p>
        <nav className="dashboard-sidebar__nav">
          {items.map(({ to, title, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/dashboard"} className={({ isActive }) => `dashboard-link${isActive ? " dashboard-link--active" : ""}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="dashboard-content">
        <Outlet />
      </div>
    </div>
  );
}

export default RoleAwareDashboardShell;
