import apiClient from "./client";

export async function createVendorProfile(data) {
  const res = await apiClient.post("/vendors", data);
  return res.data.vendorProfile;
}

export async function getVendorProfile(id) {
  const res = await apiClient.get(`/vendors/${id}`);
  return res.data.vendorProfile;
}

export async function getMyVendorProfile() {
  const res = await apiClient.get("/vendors/me");
  return res.data.vendorProfile; // null if not created yet
}

export async function updateVendorProfile(id, data) {
  const res = await apiClient.patch(`/vendors/${id}`, data);
  return res.data.vendorProfile;
}

export async function verifyVendor(id, note = "") {
  const res = await apiClient.post(`/vendors/${id}/verify`, { note });
  return res.data.vendorProfile;
}

// items: CHANGE_ITEMS keys (utils/verification.js); note: free text for the vendor.
export async function requestVendorChanges(id, { items, note }) {
  const res = await apiClient.post(`/vendors/${id}/request-changes`, { items, note });
  return res.data.vendorProfile;
}

export async function getPendingVendors() {
  const res = await apiClient.get("/admin/vendors/pending");
  return res.data.vendors;
}

// Vendor days off. Returns { timeOff, conflicts } — conflicts are existing
// pending/accepted bookings inside the new period.
export async function addTimeOff({ from, to, reason }) {
  const res = await apiClient.post("/vendors/me/time-off", { from, to, reason });
  return res.data;
}

export async function removeTimeOff(entryId) {
  const res = await apiClient.delete(`/vendors/me/time-off/${entryId}`);
  return res.data;
}
