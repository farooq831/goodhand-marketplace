import apiClient from "./client";

export async function getBookingMessages(bookingId) {
  const { data } = await apiClient.get(`/messages/booking/${bookingId}`);
  return data.messages;
}

export async function postBookingMessage(bookingId, text) {
  const { data } = await apiClient.post(`/messages/booking/${bookingId}`, { text });
  return data.message;
}
