import { Suspense, lazy } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { PageLoading } from "./components/QueryState.jsx";
import Home from "./pages/Home.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppShell from "./components/AppShell.jsx";
import RoleAwareDashboardShell from "./components/RoleAwareDashboardShell.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Route-level code splitting: each page is its own chunk, downloaded on
// first visit, so the initial load only carries the shell and the homepage.
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const RegisterPage = lazy(() => import("./pages/RegisterPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const SearchPage = lazy(() => import("./pages/SearchPage.jsx"));
const VendorProfilePage = lazy(() => import("./pages/VendorProfilePage.jsx"));
const CustomerProfilePage = lazy(() => import("./pages/CustomerProfilePage.jsx"));
const ListingDetailPage = lazy(() => import("./pages/ListingDetailPage.jsx"));
const VendorProfileForm = lazy(() => import("./pages/vendor/VendorProfileForm.jsx"));
const VendorListingsPage = lazy(() => import("./pages/vendor/VendorListingsPage.jsx"));
const ListingFormPage = lazy(() => import("./pages/vendor/ListingFormPage.jsx"));
const VendorBookingsPage = lazy(() => import("./pages/vendor/VendorBookingsPage.jsx"));
const VendorCalendarPage = lazy(() => import("./pages/vendor/VendorCalendarPage.jsx"));
const VendorEarningsPage = lazy(() => import("./pages/vendor/VendorEarningsPage.jsx"));
const CustomerBookingsPage = lazy(() => import("./pages/customer/CustomerBookingsPage.jsx"));
const BookingDetailPage = lazy(() => import("./pages/BookingDetailPage.jsx"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage.jsx"));
const AdminVendorsPage = lazy(() => import("./pages/admin/AdminVendorsPage.jsx"));
const CustomerMessagesPage = lazy(() => import("./pages/customer/CustomerMessagesPage.jsx"));
const VendorMessagesPage = lazy(() => import("./pages/vendor/VendorMessagesPage.jsx"));
const VendorSubmitWorkPage = lazy(() => import("./pages/vendor/VendorSubmitWorkPage.jsx"));
const AdminDisputesPage = lazy(() => import("./pages/admin/AdminDisputesPage.jsx"));
const AdminAnalyticsPage = lazy(() => import("./pages/admin/AdminAnalyticsPage.jsx"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage.jsx"));
const AdminPayoutsPage = lazy(() => import("./pages/admin/AdminPayoutsPage.jsx"));
const AdminSecurityPage = lazy(() => import("./pages/admin/AdminSecurityPage.jsx"));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage.jsx"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage.jsx"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage.jsx"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage.jsx"));

const only = (roles, page) => <ProtectedRoute allowedRoles={roles}>{page}</ProtectedRoute>;

function App() {
  const { pathname } = useLocation();
  return (
    <AppShell>
      <ErrorBoundary key={pathname}>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/vendor/:id" element={<VendorProfilePage />} />
        <Route path="/customer/:id" element={<CustomerProfilePage />} />
        <Route path="/listing/:id" element={<ListingDetailPage />} />
        <Route path="/checkout/:listingId" element={only(["customer"], <CheckoutPage />)} />
        <Route path="/booking/:id" element={<ProtectedRoute><BookingDetailPage /></ProtectedRoute>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Every /dashboard/* page renders inside the role-aware sidebar shell. */}
        <Route path="/dashboard" element={<ProtectedRoute><RoleAwareDashboardShell /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="account" element={<AccountSettingsPage />} />

          <Route path="vendor/profile" element={only(["vendor"], <VendorProfileForm />)} />
          <Route path="vendor/listings" element={only(["vendor"], <VendorListingsPage />)} />
          <Route path="vendor/listings/new" element={only(["vendor"], <ListingFormPage />)} />
          <Route path="vendor/listings/:id/edit" element={only(["vendor"], <ListingFormPage />)} />
          <Route path="vendor/bookings" element={only(["vendor"], <VendorBookingsPage />)} />
          <Route path="vendor/bookings/:id/submit" element={only(["vendor"], <VendorSubmitWorkPage />)} />
          <Route path="vendor/messages" element={only(["vendor"], <VendorMessagesPage />)} />
          <Route path="vendor/calendar" element={only(["vendor"], <VendorCalendarPage />)} />
          <Route path="vendor/earnings" element={only(["vendor"], <VendorEarningsPage />)} />

          <Route path="customer/bookings" element={only(["customer"], <CustomerBookingsPage />)} />
          <Route path="customer/messages" element={only(["customer"], <CustomerMessagesPage />)} />

          <Route path="admin/vendors" element={only(["admin"], <AdminVendorsPage />)} />
          <Route path="admin/disputes" element={only(["admin"], <AdminDisputesPage />)} />
          <Route path="admin/analytics" element={only(["admin"], <AdminAnalyticsPage />)} />
          <Route path="admin/users" element={only(["admin"], <AdminUsersPage />)} />
          <Route path="admin/payouts" element={only(["admin"], <AdminPayoutsPage />)} />
          <Route path="admin/security" element={only(["admin"], <AdminSecurityPage />)} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export default App;
