import apiClient from "./client";

// Customer shortlists. kind: "listings" | "vendors".
export async function getSaved() {
  const { data } = await apiClient.get("/users/me/saved");
  return data; // { listings, vendors, listingIds, vendorIds }
}

export async function saveItem(kind, id) {
  await apiClient.put(`/users/me/saved/${kind}/${id}`);
}

export async function unsaveItem(kind, id) {
  await apiClient.delete(`/users/me/saved/${kind}/${id}`);
}
