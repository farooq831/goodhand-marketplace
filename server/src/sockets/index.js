const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Booking = require("../models/Booking");
const { resolveBookingRequesterRole } = require("../utils/bookingAccess");
const messageService = require("../services/messageService");

// Kept so services (e.g. bookingService) can emit without threading
// the io instance through every controller call.
let ioInstance = null;

function isAllowedOrigin(origin, callback) {
  if (!origin || origin === process.env.CLIENT_URL || (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin))) {
    return callback(null, true);
  }
  return callback(new Error("Origin not allowed by CORS"));
}

function getIO() {
  return ioInstance;
}

/**
 * Wires up Socket.io on top of the existing HTTP server.
 *
 * Booking-scoped realtime (Architecture.md §8): a client joins
 * `booking:{bookingId}` while viewing that booking's detail page, which
 * both receives bookingService's booking:statusUpdate emit (built in
 * phase 3, inert until now) and — once task 5.3/5.4 build chat — the
 * message events too, over this same room. The doc frames joining as
 * happening "after a booking is accepted", but that would miss the very
 * acceptance event itself; joining on view (any status) is what actually
 * makes the status push useful.
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: isAllowedOrigin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("Missing auth token");

      socket.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      next();
    } catch (err) {
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.user?.id})`);

    socket.on("booking:join", async (bookingId) => {
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return;

        const { isCustomer, isVendor } = await resolveBookingRequesterRole(booking, socket.user);
        if (isCustomer || isVendor || socket.user.role === "admin") {
          socket.join(`booking:${bookingId}`);
        }
      } catch (err) {
        console.error("booking:join failed:", err.message);
      }
    });

    socket.on("message:send", async ({ bookingId, text } = {}, ack) => {
      try {
        const message = await messageService.createMessage(bookingId, socket.user, text);
        io.to(`booking:${bookingId}`).emit("message:receive", message);
        if (typeof ack === "function") ack({ message });
      } catch (err) {
        if (typeof ack === "function") ack({ error: err.message });
        else console.error("message:send failed:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  ioInstance = io;
  return io;
}

module.exports = initSocket;
module.exports.getIO = getIO;
