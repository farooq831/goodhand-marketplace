import apiClient from "./client";

export async function createReview(data) {
  const { data: response } = await apiClient.post("/reviews", data);
  return response.review;
}

export async function getVendorReviews(vendorId) {
  const { data } = await apiClient.get(`/reviews/vendor/${vendorId}`);
  return data.reviews;
}

export async function getCustomerReviews(customerId) {
  const { data } = await apiClient.get(`/reviews/customer/${customerId}`);
  return data.reviews;
}

export async function respondToReview(id, response) {
  const { data } = await apiClient.post(`/reviews/${id}/response`, { response });
  return data.review;
}
