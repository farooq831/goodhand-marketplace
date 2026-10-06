import apiClient from "./client";

export async function searchListings(params) {
  const res = await apiClient.get("/listings", { params });
  return res.data; // { listings, page, limit, total }
}

export async function getListing(id) {
  const res = await apiClient.get(`/listings/${id}`);
  return res.data.listing;
}

export async function getMyListings() {
  const res = await apiClient.get("/listings/mine");
  return res.data.listings;
}

export async function createListing(data) {
  const res = await apiClient.post("/listings", data);
  return res.data.listing;
}

export async function updateListing(id, data) {
  const res = await apiClient.patch(`/listings/${id}`, data);
  return res.data.listing;
}

export async function deleteListing(id) {
  await apiClient.delete(`/listings/${id}`);
}

export async function getListingAvailability(id, date) {
  const res = await apiClient.get(`/listings/${id}/availability`, { params: { date } });
  return res.data;
}
