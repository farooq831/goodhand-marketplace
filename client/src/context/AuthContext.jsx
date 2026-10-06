import { createContext, useContext, useEffect, useState } from "react";
import { loginRequest, registerRequest, googleLoginRequest, refreshRequest, logoutRequest } from "../api/authApi";
import { setAccessToken } from "../api/client";
import { connectSocket, disconnectSocket } from "../socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load there's no access token in memory yet — try the
  // httpOnly refresh cookie to silently restore a session, if any.
  useEffect(() => {
    async function restoreSession() {
      try {
        const { accessToken, user } = await refreshRequest();
        setAccessToken(accessToken);
        setUser(user);
        connectSocket(accessToken);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  async function login(credentials) {
    const { accessToken, user } = await loginRequest(credentials);
    setAccessToken(accessToken);
    setUser(user);
    connectSocket(accessToken);
    return user;
  }

  async function register(data) {
    const { accessToken, user } = await registerRequest(data);
    setAccessToken(accessToken);
    setUser(user);
    connectSocket(accessToken);
    return user;
  }

  async function googleLogin(credential) {
    const { accessToken, user } = await googleLoginRequest(credential);
    setAccessToken(accessToken);
    setUser(user);
    connectSocket(accessToken);
    return user;
  }

  async function logout() {
    await logoutRequest().catch(() => {});
    setAccessToken(null);
    setUser(null);
    disconnectSocket();
  }

  // Lets a page that just saved a profile change (name, phone, avatar) push
  // it back into context so the header and dashboard reflect it immediately,
  // without a refresh round-trip.
  function updateUser(partial) {
    setUser((current) => (current ? { ...current, ...partial } : current));
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, googleLogin, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
