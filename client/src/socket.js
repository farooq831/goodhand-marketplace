import { io } from "socket.io-client";

// Singleton, managed by AuthContext (connect on login/register/restore,
// disconnect on logout) rather than owned by any one page — pages that
// need it (BookingDetailPage today; chat in task 5.4) just call getSocket().
let socket = null;

// VITE_API_URL is the REST base ("http://localhost:5000/api"); Socket.io
// connects to the server root, not the /api prefix.
const SOCKET_URL = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "");

export function connectSocket(token) {
  socket?.disconnect();
  socket = io(SOCKET_URL, { auth: { token } });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket() {
  return socket;
}
