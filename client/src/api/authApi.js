import apiClient from "./client";

export async function registerRequest(data) {
  const res = await apiClient.post("/auth/register", data);
  return res.data;
}

export async function loginRequest(data) {
  const res = await apiClient.post("/auth/login", data);
  return res.data;
}

export async function googleLoginRequest(credential) {
  const res = await apiClient.post("/auth/google", { credential });
  return res.data;
}

export async function refreshRequest() {
  const res = await apiClient.post("/auth/refresh-token");
  return res.data;
}

export async function logoutRequest() {
  await apiClient.post("/auth/logout");
}

export async function fetchMeRequest() {
  const res = await apiClient.get("/users/me");
  return res.data;
}
