import { Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import VendorProfilePage from "./pages/VendorProfilePage.jsx";
import CustomerProfilePage from "./pages/CustomerProfilePage.jsx";
import ListingDetailPage from "./pages/ListingDetailPage.jsx";
import VendorProfileForm from "./pages/vendor/VendorProfileForm.jsx";
import VendorListingsPage from "./pages/vendor/VendorListingsPage.jsx";
import ListingFormPage from "./pages/vendor/ListingFormPage.jsx";
import VendorBookingsPage from "./pages/vendor/VendorBookingsPage.jsx";
import VendorCalendarPage from "./pages/vendor/VendorCalendarPage.jsx";
import VendorEarningsPage from "./pages/vendor/VendorEarningsPage.jsx";
import CustomerBookingsPage from "./pages/customer/CustomerBookingsPage.jsx";
import BookingDetailPage from "./pages/BookingDetailPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import AdminVendorsPage from "./pages/admin/AdminVendorsPage.jsx";
import CustomerMessagesPage from "./pages/customer/CustomerMessagesPage.jsx";
import VendorMessagesPage from "./pages/vendor/VendorMessagesPage.jsx";
import VendorSubmitWorkPage from "./pages/vendor/VendorSubmitWorkPage.jsx";
import AdminDisputesPage from "./pages/admin/AdminDisputesPage.jsx";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage.jsx";
import AdminUsersPage from "./pages/admin/AdminUsersPage.jsx";
import AdminPayoutsPage from "./pages/admin/AdminPayoutsPage.jsx";
import AdminSecurityPage from "./pages/admin/AdminSecurityPage.jsx";
import AccountSettingsPage from "./pages/AccountSettingsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppShell from "./components/AppShell.jsx";
import RoleAwareDashboardShell from "./components/RoleAwareDashboardShell.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const only = (roles, page) => <ProtectedRoute allowedRoles={roles}>{page}</ProtectedRoute>;

function App() {
  const { pathname } = useLocation();
  return (
    <AppShell>
      <ErrorBoundary key={pathname}>
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
      </ErrorBoundary>
    </AppShell>
  );
}

export default App;
