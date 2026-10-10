import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBookingMessages, postBookingMessage } from "../api/messageApi";
import { getSocket, joinBooking, leaveBooking } from "../socket";
import { useAuth } from "../context/AuthContext";

function ChatPanel({ bookingId, subtitle = "Booking chat" }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const endRef = useRef(null);
  const { data: messages = [], isLoading, isError } = useQuery({
    queryKey: ["messages", bookingId],
    queryFn: () => getBookingMessages(bookingId),
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    joinBooking(bookingId);

    function handleMessage(message) {
      if (String(message.bookingId) !== String(bookingId)) return;
      queryClient.setQueryData(["messages", bookingId], (current = []) => {
        if (current.some((item) => item._id === message._id)) return current;
        return [...current, message];
      });
      if (String(message.senderId?._id || message.senderId) !== String(user.id)) {
        setLiveMessage(
          message.kind === "event"
            ? message.text
            : `New message from ${message.senderId?.name || "the other participant"}`
        );
      }
    }

    socket.on("message:receive", handleMessage);
    return () => {
      socket.off("message:receive", handleMessage);
      leaveBooking(bookingId);
    };
  }, [bookingId, queryClient, user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mutation = useMutation({
    mutationFn: (messageText) => {
      const socket = getSocket();
      if (!socket?.connected) return postBookingMessage(bookingId, messageText);
      return new Promise((resolve, reject) => {
        socket.emit("message:send", { bookingId, text: messageText }, (result) => {
          if (result?.error) reject(new Error(result.error));
          else resolve(result.message);
        });
      });
    },
    onSuccess: (message) => {
      queryClient.setQueryData(["messages", bookingId], (current = []) => {
        if (current.some((item) => item._id === message._id)) return current;
        return [...current, message];
      });
      setText("");
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    if (text.trim() && !mutation.isPending) mutation.mutate(text.trim());
  }

  return (
    <section className="mt-8" aria-labelledby="chat-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="chat-heading" className="section-title text-base">Messages</h2>
        <span className="meta-text text-xs">Booking chat</span>
      </div>
      <div className="panel max-h-80 min-h-24 overflow-y-auto bg-canvas" aria-live="polite" aria-label="Booking messages">
        {isLoading && <p className="meta-text text-xs">Loading messages...</p>}
        {isError && <p className="text-xs text-red-700">Messages could not be loaded.</p>}
        {!isLoading && !isError && messages.length === 0 && <p className="meta-text text-xs">No messages yet.</p>}
        <div className="flex flex-col gap-2">
          {messages.map((message) => {
            const isMine = String(message.senderId?._id || message.senderId) === String(user.id);
            const isAdmin = message.senderId?.role === "admin";

            // Lifecycle events (a delivery, a revision request, a dispute
            // opening or being resolved) are written into the same thread by
            // bookingService so the conversation reads as one chronological
            // record — but they aren't chatter, so they get a centred system
            // line rather than a bubble attributed to whoever clicked.
            if (message.kind === "event") {
              return (
                <p key={message._id} className="my-1 self-center text-center text-[11px] font-medium text-muted">
                  <span className="rounded-full bg-black/[0.04] px-3 py-1">{message.text}</span>
                </p>
              );
            }

            return (
              <div
                key={message._id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? "self-end bg-primary text-white"
                    : isAdmin
                      ? "border border-amber-300 bg-amber-50 text-ink"
                      : "border border-black/5 bg-white text-ink"
                }`}
              >
                <p className={`mb-1 text-[11px] ${isAdmin && !isMine ? "font-semibold text-amber-800" : "opacity-70"}`}>
                  {isAdmin && <span aria-hidden="true">★ </span>}
                  {isMine ? "You" : message.senderId?.name || "Participant"}
                  {isAdmin && <span className="font-normal"> · Support</span>}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
      <p className="sr-only" aria-live="assertive">{liveMessage}</p>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <label htmlFor="message-text" className="sr-only">Message</label>
        <input id="message-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Write a message..." className="form-control min-w-0 flex-1" />
        <button type="submit" disabled={!text.trim() || mutation.isPending} className="button button--dark disabled:opacity-50">Send</button>
      </form>
      {mutation.isError && <p className="mt-2 text-xs text-red-700">{mutation.error.message}</p>}
    </section>
  );
}

export default ChatPanel;
