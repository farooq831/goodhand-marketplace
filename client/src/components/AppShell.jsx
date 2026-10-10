import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import EmailVerificationBanner from "./EmailVerificationBanner";
import ThemeToggle from "./ThemeToggle";

const navClass = ({ isActive }) => `site-nav__link${isActive ? " site-nav__link--active" : ""}`;
const mobileClass = ({ isActive }) => `mobile-nav__link${isActive ? " mobile-nav__link--active" : ""}`;

function AppShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever navigation happens, however it was triggered.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand-mark" aria-label="Goodhand home">
            <span className="brand-mark__dot" />
            <span>Goodhand</span>
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <NavLink className={navClass} to="/search">Discover</NavLink>
            {user ? (
              <NavLink className={navClass} to="/dashboard">Workspace</NavLink>
            ) : (
              <>
                <NavLink className={navClass} to="/register?role=vendor">Become a vendor</NavLink>
                <NavLink className={navClass} to="/login">Sign in</NavLink>
              </>
            )}
          </nav>
          <div className="site-header__actions">
            <ThemeToggle />
            {user ? (
              <>
                <NotificationBell />
                <button type="button" onClick={logout} className="button button--quiet hidden md:inline-flex">
                  <LogOut size={16} aria-hidden="true" className="mr-1.5" />Log out
                </button>
              </>
            ) : (
              <Link to="/register" className="button button--dark hidden sm:inline-flex">Join Goodhand</Link>
            )}
            <button
              type="button"
              className="icon-button md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" className="mobile-nav md:hidden" aria-label="Mobile navigation">
            <NavLink className={mobileClass} to="/search">Discover services</NavLink>
            {user ? (
              <>
                <NavLink className={mobileClass} to="/dashboard" end>Workspace</NavLink>
                <NavLink className={mobileClass} to="/dashboard/account">Account settings</NavLink>
                <button type="button" onClick={logout} className="mobile-nav__link text-left">Log out</button>
              </>
            ) : (
              <>
                <NavLink className={mobileClass} to="/login">Sign in</NavLink>
                <NavLink className={mobileClass} to="/register?role=vendor">Become a vendor</NavLink>
                <Link to="/register" className="button button--dark mt-2">Join Goodhand</Link>
              </>
            )}
          </nav>
        )}
      </header>
      <EmailVerificationBanner />
      <main id="main" className="flex-1">{children}</main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <span className="brand-mark"><span className="brand-mark__dot" />Goodhand</span>
          <span>Verified vendors. Protected payments.</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;
