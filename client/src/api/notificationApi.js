import apiClient from "./client";

export async function getNotifications() {
  const { data } = await apiClient.get("/notifications");
  return data.notifications;
}

export async function getUnreadNotificationCount() {
  const { data } = await apiClient.get("/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(notificationId) {
  const { data } = await apiClient.patch(`/notifications/${notificationId}/read`);
  return data.notification;
}
