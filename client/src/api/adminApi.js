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
