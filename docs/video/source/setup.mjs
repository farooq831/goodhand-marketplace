// Stages realistic data for the walkthrough: an active booking with chat,
// a fresh paid request for the vendor to accept, and an open dispute.
import fs from "node:fs";
const API = "http://localhost:5000/api";
async function j(p, { t, method = "GET", body } = {}) {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${d.message || ""}`);
  return d;
}
const login = async (e, p = "Demo1234") => (await j("/auth/login", { method: "POST", body: { email: e, password: p } })).accessToken;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const cust = await login("demo.customer@example.com");
const tutor = await login("demo.tutor.math@example.com");
const photo = await login("demo.photo.portraits@example.com");
const { listings } = await j("/listings?limit=50");
const math = listings.find((l) => l.title === "Math Tutoring Session");
const photoL = listings.find((l) => /portrait/i.test(l.title)) || listings.find((l) => /photo/i.test(l.title));
console.log("listings", math?.title, "|", photoL?.title);

async function book(listing, offset) {
  for (let n = offset; n < offset + 60; n++) {
    const date = day(n);
    const av = await j(`/listings/${listing._id}/availability?date=${date}`);
    const slot = (av.slots || []).find((s) => s.available !== false);
    if (!av.isAvailableDay || !slot) continue;
    const { booking: b } = await j("/bookings", { t: cust, method: "POST", body: { listingId: listing._id, date, startTime: slot.startTime, notes: "Grade 8 algebra, chapter 4 — quadratic equations. Please bring practice sheets.", serviceAddress: { line: "House 12, Street 4", area: "DHA Phase 5", city: "Lahore" }, contactPhone: "0300 1234567" } });
    await j("/payments/confirm", { t: cust, method: "POST", body: { bookingId: b._id } });
    return b._id;
  }
  throw new Error("no slot for " + listing.title);
}
const status = (t, id, s, extra = {}) => j(`/bookings/${id}/status`, { t, method: "PATCH", body: { status: s, ...extra } });
const msg = (t, id, text) => j(`/messages/booking/${id}`, { t, method: "POST", body: { text } });

// 1. Active booking with a conversation (customer booking page + messages).
const active = await book(math, 4 + Math.floor(Math.random() * 20));
await status(tutor, active, "accepted");
await msg(cust, active, "Assalamu Alaikum! My son is in grade 8 and struggling with quadratic equations.");
await msg(tutor, active, "Walaikum Assalam! No problem at all — I'll bring practice sheets and we'll start from the basics.");
await msg(cust, active, "Perfect, thank you. The house is the one with the green gate.");

// 2. Fresh paid request waiting for the vendor.
const pending = await book(math, 30 + Math.floor(Math.random() * 20));

// 3. An open dispute for the admin.
const disp = await book(photoL, 6 + Math.floor(Math.random() * 20));
await status(photo, disp, "accepted");
await msg(cust, disp, "Looking forward to the family portrait session!");
await msg(photo, disp, "Me too — I'll deliver the edited photos within two days.");
await status(photo, disp, "submitted", { files: ["http://localhost:5000/uploads/work/portraits.zip"] });
await msg(cust, disp, "Only 8 of the promised 25 edited photos were delivered.");
await status(cust, disp, "disputed", { note: "Only 8 of the 25 promised edited photos were delivered." });

fs.writeFileSync("state.json", JSON.stringify({ active, pending, disp, math: math._id }, null, 2));
console.log({ active, pending, disp });
