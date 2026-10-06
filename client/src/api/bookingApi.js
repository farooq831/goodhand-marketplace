import apiClient from "./client";

export async function createBooking(data) {
  const res = await apiClient.post("/bookings", data);
  return res.data.booking;
}

export async function getMyBookings(status) {
  const res = await apiClient.get("/bookings/me", { params: status ? { status } : {} });
  return res.data.bookings;
}

export async function getBooking(id) {
  const res = await apiClient.get(`/bookings/${id}`);
  return res.data.booking;
}

// `note` carries the reason the server requires for a revision request, a
// dispute, or an admin resolution; `files` is only used when delivering work.
export async function updateBookingStatus(id, status, { files = [], note = "" } = {}) {
  const res = await apiClient.patch(`/bookings/${id}/status`, { status, files, note });
  return res.data.booking;
}
