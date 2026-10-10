import axios from "axios";

// Preconfigured axios instance. withCredentials is required so the
// httpOnly refresh-token cookie (Architecture.md §5) is sent on
// cross-origin requests during local dev.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// The access token lives in memory only (never localStorage), so it
// has to be threaded into every request manually via this module-level
// holder rather than persisted storage. AuthContext calls setAccessToken
// whenever the token changes (login, refresh, logout).
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// On a 401 (expired access token), try refreshing once via the
// httpOnly cookie and retry the original request before giving up.
// Concurrent 401s share a single in-flight refresh instead of each
// firing their own.
let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (!response || response.status !== 401 || config._retried || config.url?.includes("/auth/")) {
      return Promise.reject(error);
    }
    config._retried = true;

    try {
      refreshPromise ??= apiClient.post("/auth/refresh-token").finally(() => {
        refreshPromise = null;
      });
      const { data } = await refreshPromise;
      setAccessToken(data.accessToken);
      config.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(config);
    } catch (refreshError) {
      setAccessToken(null);
      return Promise.reject(error);
    }
  }
);

export default apiClient;
