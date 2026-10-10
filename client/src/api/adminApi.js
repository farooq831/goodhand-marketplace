import apiClient from "./client";

export async function getDisputes() {
  const { data } = await apiClient.get("/admin/disputes");
  return data.disputes;
}

export async function resolveDispute(id, action, note) {
  const { data } = await apiClient.patch(`/admin/disputes/${id}`, { action, note });
  return data;
}

export async function getAnalytics() {
  const { data } = await apiClient.get("/admin/analytics");
  return data.analytics;
}

export async function getUsers() {
  const { data } = await apiClient.get("/admin/users");
  return data.users;
}

export async function setUserStatus(id, status) {
  const { data } = await apiClient.patch(`/admin/users/${id}/status`, { status });
  return data.user;
}

// Vendor payouts (manual in v1): what's owed per vendor, the paid history,
// and recording a transfer that was made outside the app.
export async function getAuditLog(params = {}) {
  const { data } = await apiClient.get("/admin/audit-log", { params });
  return data; // { entries, total, page, limit }
}

export async function getSecurityReport() {
  const { data } = await apiClient.get("/admin/security");
  return data; // { byEmail, byIp, newDevices }
}

export async function getPendingPayouts() {
  const { data } = await apiClient.get("/admin/payouts");
  return data.payouts;
}

export async function getPayoutHistory() {
  const { data } = await apiClient.get("/admin/payouts/history");
  return data.payouts;
}

export async function markPayoutPaid({ vendorId, paymentIds, reference }) {
  const { data } = await apiClient.post("/admin/payouts/mark-paid", { vendorId, paymentIds, reference });
  return data.payout;
}

// Listing moderation & featured placements.
export async function getAdminListings(params = {}) {
  const { data } = await apiClient.get("/admin/listings", { params });
  return data; // { listings, total, page, limit }
}

// action: "hide" (needs reason) | "unhide" | "feature" (days 7/14/30/90) | "unfeature"
export async function moderateListing(id, body) {
  const { data } = await apiClient.patch(`/admin/listings/${id}/moderation`, body);
  return data.listing;
}
