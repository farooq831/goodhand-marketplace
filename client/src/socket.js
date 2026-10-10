import { io } from "socket.io-client";
import { getAccessToken, setAccessToken } from "./api/client";
import { refreshRequest } from "./api/authApi";

// Singleton, managed by AuthContext (connect on login/register/restore,
// disconnect on logout) rather than owned by any one page — pages that
// need it just call getSocket().
let socket = null;

// Booking rooms the UI wants. Room membership belongs to a connection, so
// after any reconnect (network blip, token-expiry disconnect) they must be
// joined again or live updates silently stop.
const wantedRooms = new Map(); // bookingId -> number of components using it

export function joinBooking(bookingId) {
  wantedRooms.set(bookingId, (wantedRooms.get(bookingId) || 0) + 1);
  socket?.emit("booking:join", bookingId);
}

export function leaveBooking(bookingId) {
  const n = (wantedRooms.get(bookingId) || 1) - 1;
  if (n <= 0) wantedRooms.delete(bookingId);
  else wantedRooms.set(bookingId, n);
}

// VITE_API_URL is the REST base ("http://localhost:5000/api"); Socket.io
// connects to the server root, not the /api prefix.
const SOCKET_URL = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "");

// The server disconnects a socket when its access token expires (~15 min)
// and rejects stale tokens on connect. Get a fresh token via the refresh
// cookie, then reconnect — so realtime survives long sessions.
async function refreshAndReconnect() {
  try {
    const { accessToken } = await refreshRequest();
    setAccessToken(accessToken);
    socket?.connect();
  } catch {
    // Refresh failed (signed out elsewhere): leave the socket closed; the
    // next API call's 401 handling will send the user to log in.
  }
}

export function connectSocket(token) {
  socket?.disconnect();
  if (token) setAccessToken(token);
  // `auth` as a function: every (re)connect sends the *current* token.
  socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getAccessToken() }) });
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") refreshAndReconnect();
  });
  let retried = false;
  socket.on("connect_error", (err) => {
    if (!retried && /auth/i.test(err.message)) {
      retried = true;
      refreshAndReconnect();
    }
  });
  socket.on("connect", () => {
    retried = false;
    for (const bookingId of wantedRooms.keys()) socket.emit("booking:join", bookingId);
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket() {
  return socket;
}
