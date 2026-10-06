import apiClient from "./client";

export async function createPaymentIntent(bookingId) {
  const res = await apiClient.post("/payments/create-intent", { bookingId });
  return res.data; // { payment, clientSecret }
}

export async function confirmPayment(bookingId) {
  const res = await apiClient.post("/payments/confirm", { bookingId });
  return res.data;
}

export async function getPaymentForBooking(bookingId) {
  const res = await apiClient.get(`/payments/booking/${bookingId}`);
  return res.data.payment; // null if checkout hasn't started for this booking
}
