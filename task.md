# Task Tracker — Local Services Marketplace

Tracks work against the phase plan in `PRD.md` §9. Completed phases are summarized below; remaining
phases are broken into numbered tasks (`4.1`, `4.2`, ...) — ask for one by number when ready.

---

## ✅ Completed

### Phase 0 — Repo scaffold
- Root `package.json` (npm workspaces: `client`, `server`), `.gitignore`
- `/server`: Express entry point (`server.js`), `.env.example`, config stubs (`db.js`, `cloudinary.js`, `stripe.js`), generic `errorHandler`/`notFound` middleware, Socket.io bootstrap with JWT-authenticated handshake
- `/client`: Vite + React + Tailwind (brand colors from `Design.md` §5), axios client stub
- Full folder skeleton per `Architecture.md` §9 (`models`, `routes`, `controllers`, `services`, `middleware`, `sockets`, `jobs`, `utils` on the server; `pages`, `components`, `features`, `hooks`, `api`, `context`, `utils` on the client)

### Phase 1 — Auth + roles + DB schema
- `User` model (`Architecture.md` §3)
- Email/password register, login, refresh (rotates both tokens), logout — JWT access token + httpOnly-cookie refresh token
- `authenticate` / `requireRole(...)` middleware; `GET/PATCH /api/users/me`
- Signup can't self-assign `admin`; `PATCH /me` can't touch role/email/password
- Frontend: `AuthContext` (in-memory token, silent session restore via refresh cookie), axios 401→refresh→retry interceptor, login/register pages, `ProtectedRoute`, role-aware `/dashboard`
- **Deferred:** Google OAuth (`POST /api/auth/google`) — needs real credentials to test against

### Phase 2 — Vendor listings + search/filter
- `VendorProfile`, `Listing` models (`Architecture.md` §3); `VendorProfile.isVerified` denormalizes `User.isVerified` for query performance
- Vendor profile CRUD + admin verify (`POST /:id/verify`, syncs both `isVerified` copies)
- Listing CRUD, `/mine` for the vendor dashboard, search with category/price/rating/geo/date filters + pagination + sort (newest/price/rating)
- Visibility rule: a listing is public only when `isActive && vendor.isVerified`; owner/admin always see it
- Frontend: `SearchPage` (filters, "use my location"), `VendorProfilePage`, `ListingDetailPage`, vendor `VendorProfileForm`/`VendorListingsPage`/`ListingFormPage`, `AdminVendorsPage` (verify queue)
- **Deferred:** photo upload UI (photos are `string[]` URLs, no Cloudinary wiring yet), vendor location map picker (city name only)

### Phase 3 — Booking + calendar logic
- `Booking` model incl. `statusHistory` (`Architecture.md` §3/§6)
- `updateBookingStatus()` — single choke point for every transition, permissions keyed per `"fromStatus->toStatus"` edge (e.g. only the customer cancels a pending request; only the vendor marks complete, per `Design.md` §4)
- Real availability slot computation (`GET /listings/:id/availability`) — window sliced by listing duration, minus already-*accepted* bookings; conflict re-checked at accept time to close the race window
- `GET/POST /api/bookings`, `GET /api/bookings/me`, `PATCH /:id/status`
- Frontend: live booking widget on `ListingDetailPage`, `BookingDetailPage` (stepper + state/role-aware actions, 15s poll standing in for realtime), `CustomerBookingsPage`, `VendorBookingsPage`, hand-rolled `VendorCalendarPage`
- `booking:statusUpdate` socket emit wired server-side (inert until phase 5 gives the client a socket to listen on)
- **Bugs found & fixed during this phase:** `VendorProfile` geo schema produced malformed GeoJSON for vendors without lat/lng (2dsphere index rejected the save); `resolveRequesterRole` compared a populated document instead of an id, breaking booking-detail ownership checks

### Phase 4 — Payments (Stripe test mode) + escrow logic
- [x] **4.1** `Payment` model (`Architecture.md` §3: `bookingId`, `stripePaymentIntentId`, `amount`, `commissionAmount`, `status: held|released|refunded|disputed`, `heldAt`, `releasedAt`) — no `createdAt`/`updatedAt`, matches the doc's fields exactly
- [x] **4.2** `POST /api/payments/create-intent` — validates the booking (owner, `pending` status, no existing payment), creates a Stripe PaymentIntent with `capture_method: manual`, creates the `Payment` doc (`status: held`) and links `booking.paymentId`. Commission % and Stripe currency are configurable via `server/.env` (`PLATFORM_COMMISSION_PERCENT`, `STRIPE_CURRENCY`)
  - Verified: all guard clauses (role, ownership, booking status, duplicate payment) pass against a real running server; confirmed the sandbox can reach Stripe's API and that an invalid key fails as a clean `401` JSON error rather than a crash
  - **Not yet verified end-to-end** — creating an actual working PaymentIntent needs a real Stripe test-mode secret key in `server/.env` (`STRIPE_SECRET_KEY`), which this environment doesn't have
  - Local `Payment.status` is set to `"held"` at PaymentIntent creation, which is optimistic (Stripe hasn't actually authorized funds until a payment method is attached and confirmed client-side) — the webhook (4.3) reconciles this against Stripe's real state
- [x] **4.3** `POST /api/payments/webhook` (mounted with a raw body parser *before* `express.json()` — Stripe needs the unparsed body to verify its signature). Handles `payment_intent.amount_capturable_updated` (confirms `held`), `.succeeded` (→ `released`), `.canceled` (→ `refunded`), `.payment_failed` (deletes the `Payment` doc + clears `booking.paymentId` so the customer can retry — no enum value fits "failed")
- [x] **4.4** `POST /:bookingId/release` and `POST /:bookingId/refund`, admin-only. `release` calls `stripe.paymentIntents.capture()`; `refund` calls `.cancel()` (not `refunds.create()` — correct for a still-authorized, not-yet-captured manual-capture intent). Both require the payment to currently be `"held"`
- [x] **4.5** `server/src/jobs/releasePayments.js` — hourly cron (`node-cron`), finds `completed` bookings with a payment, checks the `statusHistory` timestamp of the `completed` transition against `PAYMENT_RELEASE_GRACE_HOURS` (default 24), calls `releasePayment()` for eligible ones. A booking that's since moved to `disputed` no longer matches `status: "completed"`, so it's excluded automatically — no separate dispute check needed
  - Verified with a combined smoke test (23 checks): all 4 webhook event types + bad-signature rejection, release/refund guard clauses (role, missing payment, already-resolved payment, a failed Stripe call leaving local state untouched), and the cron job correctly targeting only the old/non-disputed/held-payment booking while skipping a recent one and a disputed one
  - Refactored the requester-role check (customer vs. vendor vs. neither) out of `bookingService` into `utils/bookingAccess.js` so `paymentService` could reuse it without the two services requiring each other
- [x] **4.6** `updateBookingStatus()` now triggers `refundPayment()` when a booking transitions to `cancelled` **or** `declined` and has a held payment — extended slightly beyond the literal "completed/cancelled" scope to include `declined`, since the documented checkout flow (`Design.md` §3.1) has the customer pay *before* the vendor responds, so a decline can also need a refund. A missing/already-resolved payment is logged, not treated as a transition failure — the status transition itself always succeeds regardless of the refund outcome. `completed` needed no explicit trigger — 4.5's cron job already picks up any booking in that state generically
  - Verified (12 checks): decline/pending-cancel/accepted-cancel all still succeed with the refund attempt failing against the placeholder Stripe key, and the `Payment` doc is left untouched (still `held`) rather than corrupted; a cancel with no payment at all no-ops cleanly with no error
- [x] **4.7** Frontend: `@stripe/stripe-js` + `@stripe/react-stripe-js`, `/checkout/:listingId` page (creates the booking, then the PaymentIntent, then renders Stripe's `PaymentElement`), `PaymentStatusBadge` component (held/released/refunded/disputed, per `Design.md` §4's "Held in Escrow / Released / Refunded"), `BookingDetailPage` now shows it, `/dashboard/vendor/earnings` page listing payments per booking with a running released total. `ListingDetailPage`'s "Request Booking" button now navigates to checkout (carrying date/slot as query params) instead of creating the booking directly — the booking is created as the first step of `CheckoutPage`'s flow
  - Added `GET /api/payments/booking/:bookingId` (not in `Architecture.md`'s literal endpoint list, but needed for the frontend to read a booking's payment — same justification pattern as `/listings/mine` etc. in phase 2) and populated `paymentId` onto `bookingService.getMyBookings()` for the earnings page
  - Verified (12 checks): payment-lookup visibility (customer/vendor can view, unrelated user gets 404, no-payment booking returns `null` cleanly), and `/me` correctly returns populated payment fields
  - **Not verified end-to-end** — Stripe Elements needs a real browser + a real `VITE_STRIPE_PUBLISHABLE_KEY`/`STRIPE_SECRET_KEY` pair to exercise, neither of which this environment has; verified the client builds cleanly with no import/syntax errors instead

**Phase 4 complete.** All 7 tasks built and verified short of the two things that genuinely require a real Stripe account (an actual successful PaymentIntent, and Stripe Elements in a real browser).

### Phase 5 — Chat (Socket.io) + notifications (in progress)
- [x] **5.1** `Notification` model (`Architecture.md` §3, `type` left as a free-form string rather than an enum since the doc lists it as illustrative) + `notificationService` (create/list/mark-read/unread-count). Wired into the event points that exist so far: `bookingService.createBooking` (`booking_request` → vendor) and `updateBookingStatus` (`booking_accepted`/`declined`/`completed`/`cancelled`/`disputed` → whichever side didn't just act), and `paymentService` (`payment_confirmed` on the webhook's `amount_capturable_updated`, `payment_released`/`payment_refunded` fired synchronously inside `releasePayment`/`refundPayment` rather than off the `succeeded`/`canceled` webhook events too, to avoid double-notifying when our own action is what triggered them; `payment_failed` on the webhook). A notification failure never fails the underlying transition — same soft-fail pattern as 4.6's refund side-effect
  - Added minimal REST (`GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`) — not in `Architecture.md`'s literal list, but a service with no way to read what it created isn't very usable; the actual `NotificationBell` UI is still task 5.6
  - Verified (16 checks): every notification type fires to the correct recipient on the correct event, a failed Stripe call does *not* produce a false-positive `payment_released`/`refunded` notification, and the REST endpoints (list/unread-count/mark-read, including a 404 when marking someone else's notification) all behave correctly
- [x] **5.2** `socket.io-client` installed; `client/src/socket.js` is a singleton connect/disconnect pair managed from `AuthContext` (connects on login/register/session-restore, disconnects on logout) rather than owned by any one page. Server-side, added the `booking:join` handler `sockets/index.js` was missing since phase 3 — with an ownership check (customer/vendor/admin only) reusing `utils/bookingAccess.js`, so `emitBookingStatusUpdate` (built inert in phase 3) now actually reaches someone. `BookingDetailPage` joins its room and invalidates both the booking and payment queries on `booking:statusUpdate`, replacing the 15s poll
  - Interpreted `Architecture.md` §8's "customer and vendor join this room after a booking is accepted" as joining *on viewing the page* regardless of status, not gated to post-acceptance — joining only after acceptance would miss the very acceptance event itself
  - Verified (3 checks, real `socket.io-client` connections): the booking's customer and vendor both receive `booking:statusUpdate` on a real status transition; a third, unrelated user who is neither does not

- [x] **5.3** `Message` model with booking/time index, shared authorization/persistence service, `GET/POST /api/messages/booking/:bookingId` REST fallback, and authenticated `message:send`/`message:receive` socket events. Socket sends persist before broadcasting and support acknowledgements for success/errors; messages notify the other booking participant.
- [x] **5.4** `ChatPanel` embedded in `BookingDetailPage`: loads REST history, uses the booking room for realtime updates, falls back to REST when Socket.io is unavailable, and includes polite/assertive `aria-live` announcements for incoming messages.
- [x] **5.5** Configurable Nodemailer delivery through `notificationService`: booking request/status, payment confirmation, chat message, and future `review_received` notifications send email when SMTP settings are configured. Email failures are soft-failed; real delivery requires SMTP credentials.
- [x] **5.6** `NotificationBell` with unread count, dropdown list, and mark-read action; customer `/dashboard/customer/messages` inbox lists booking threads by latest message and links to each booking chat.

---

## ✅ Phase 6 complete

- [x] **6.1** `Review` model and `POST /api/reviews` enforce completed-booking ownership and one review per booking; vendor rating/count aggregates are recomputed.
- [x] **6.2** Vendor review response endpoint and vendor review listing endpoint added.
- [x] **6.3** `ReviewCard`, real booking review form, and Reviews section on vendor profiles added.
- [x] **6.4** Admin dispute queue and release/refund resolution page added; resolution delegates to the existing payment escrow service.
- [x] **6.5** Admin analytics endpoint/page added for GMV, booking volume, and verified active vendors.
- [x] **6.6** Admin user list plus suspend/reactivate controls added using `User.status`.
- [x] **6.7** Responsive base styles, visible focus states, reduced-motion support, and accessible form/live-region behavior added.
- [x] **6.8** Deployment instructions and cross-platform GitHub Actions CI added. Production credentials and live deployment still require hosting/provider setup.

## 🔜 Remaining

### Deferred items (not tied to a single phase)
- [x] Google OAuth login (`POST /api/auth/google`) — verifies Google ID tokens, creates or links users, rejects suspended accounts, and exposes GIS buttons on login/register. Requires `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` for live use.
- [x] Cloudinary upload UI for listing photos, vendor verification docs, and avatars — authenticated `/api/uploads` with image validation and folder separation; requires Cloudinary credentials.
- [x] Vendor location map picker on the profile form — browser geolocation plus manual latitude/longitude fields populate the existing GeoJSON search coordinates; a third-party map provider is not required.

---

## ✅ Polish pass

A read-through after phase 6 turned up five gaps between what the app claimed and what it did. The headline one was a real break in the primary conversion path.

- [x] **P.1 Free-text search (server).** `searchListings()` had no `q` branch at all — `q` wasn't even destructured — so the landing page's search box had no endpoint behaviour to call. Added a case-insensitive regex over listing `title`/`description`/`category` **and** vendor `businessName`. **Regex rather than a MongoDB `$text` index, deliberately:** `$text` matches whole words only, so `"photo"` would miss `"Photography"` — exactly the partial match a search box is expected to make. The collection scan is the same tradeoff the existing `MAX_RATING_SORT_CANDIDATES` in-memory sort already accepts at this scale. Metacharacters are escaped (`escapeRegex`) so a `q` of `.*` is a literal, not a match-everything. The business-name match reuses the vendor allowlist query the non-`vendorId` branch already ran (widened to `select("_id businessName")`) — no extra round-trip — and since `nameMatched ⊆ allowed`, the `$or` still ANDs with the verified/rating/geo visibility gate
- [x] **P.2 Search page (client).** `SearchPage` held its filters in `useState` and never read `useSearchParams`, so every inbound `?q=`/`?category=` from `Home.jsx` was silently discarded — the two halves of the search feature were both broken independently. The URL is now the source of truth: inbound params land, result sets are shareable, and the back button works. Added the search text input (committing on submit, not per keystroke), the availability **date** filter the backend has supported since phase 2 but had no UI for, `sr-only` labels on every control, and a "Clear filters" affordance. Geolocation coordinates are deliberately kept in local state, not the URL — a shared link shouldn't carry where someone was standing
- [x] **P.3 Vendor profile: real tabs + response rate.** The tabs were two decorative `<a href="#...">` with a hardcoded active class and no tab semantics; now three state-driven panels (Listings / Reviews / About) with `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`/`role="tabpanel"`. Response rate (PRD §5.3, `Design.md` §4) was never built — added to `vendorService.getById()` as *responded ÷ (responded + pending)*. `cancelled` is excluded from both halves: a customer can cancel a pending request before the vendor ever had a chance to respond, which shouldn't count against them either way. Returns `null` (not `0`) when there are no requests yet, so a brand-new vendor shows "New provider" rather than a misleading 0%. Computed on read rather than denormalized onto the schema — it's shown on one page only, so there's no search-sort case to justify another field to keep in sync (unlike `avgRating`/`reviewCount`)
- [x] **P.4 404 route.** An unknown URL rendered an empty `AppShell` — header and footer with nothing between them, which reads as a broken page rather than a wrong address. Added `NotFoundPage` and a catch-all `<Route path="*">`
- [x] **P.5 Account settings.** `userController.UPDATABLE_FIELDS` has accepted `name`/`phone` since phase 1 with no UI to reach them. Added `/dashboard/account` with those two editable, `email`/`role` read-only and a note on why (`userController` excludes them on purpose — email would need re-verification, roles are admin-set), and avatar upload via the existing `ImageUploadField`. `AuthContext` gained `updateUser(partial)` so a name/avatar change shows in the header without a refresh — `DashboardPage` had been working around this exact gap with a local `avatarUrl` state copy, which is now deleted along with its duplicate uploader
- [x] **P.6 Shared category list.** The five-category vocabulary was copy-pasted into four files; a category a vendor could pick but a customer couldn't filter by would be invisible. Extracted to `client/src/utils/categories.js`

**Verification.** 26/26 checks against the seeded database exercising the two changed services directly, then re-confirmed over HTTP against a restarted API:
  - `q=photo` returns *Small Event Photography* (title) and *Outdoor Portrait Session* (category) — the decisive partial-word case that distinguishes regex from `$text`
  - `q=Bright Path` reaches listings via vendor name; `q=leaking taps` via description; `q=PHOTO` is case-insensitive
  - no `q`, `q=`, and `q="   "` all return the unchanged full set — no regression on the existing filters
  - `q` composes correctly with `maxPrice`, `category`, `sort=price_asc`, and the in-memory `sort=rating` branch
  - `q=.*` and `q=a(b` return nothing and throw nothing — metacharacters are literal
  - the `vendorId` branch filters within one vendor and returns nothing for a non-matching term
  - `responseRate` is `50` for a vendor with mixed responded/pending, `0` for one with only pending, `null` for one with no bookings; populated `userId` survives `toObject()`, and an unknown id still 404s
- **Frontend not verified in a browser** — this install has no in-app browser preview and the project has no test runner, so the ARIA tab behaviour, URL/back-button round-trip, and the account-settings save were verified by production build plus a clean dev-server transform of every changed module, not by clicking through them

---

## ✅ Polish pass 2 — Design.md gaps, two live bugs, and a test suite

An audit against `Design.md` and PRD §8 found the features all present but several spec'd UX pieces missing, plus two bugs that broke the demo flow outright.

**Bugs fixed**
- [x] **Demo escrow could never release or refund.** Checkout's `POST /payments/confirm` creates `demo_…` payments, but `releasePayment`/`refundPayment` always called Stripe — which, with no key, throws 503 from the config proxy (and would 404 on a fake id with one). So auto-release, cancel/decline refunds, and dispute resolution all failed for every payment the app could actually create. `paymentService` now skips Stripe for demo payments; real `pi_…` intents are unchanged. `confirmPayment` also now sends `payment_confirmed` (only the Stripe webhook did before)
- [x] **Admin dispute resolution always 400'd.** The server requires a resolution note; the admin page sent none
- [x] **GMV excluded `submitted` bookings**, so it dipped whenever a vendor delivered work

**Design.md gaps closed**
- [x] Mobile navigation — the header nav was `hidden` below `md` with no menu; added a hamburger menu (Escape/route-change close), skip link, bell icon
- [x] `RoleAwareDashboardShell` — every `/dashboard/*` route nests under one layout route with a role-specific sidebar (desktop) / scrolling tab strip (mobile); nav config shared with the dashboard cards via `utils/dashboardNav.js`
- [x] `DisputeDetailDrawer` — dispute queue is now a table (cards on mobile); the drawer shows dispute reason, full chat transcript, status timeline, a required resolution note, and confirm-before-release/refund
- [x] Listing page — booking widget becomes a bottom sheet behind a sticky "Book now" bar on mobile; added photo gallery, vendor mini-card, escrow/cancellation notes, related listings
- [x] Search — filters in a sticky sidebar on desktop, slide-up drawer on mobile with active-filter count; price commits on blur/Enter; added distance radius (the backend filters within `radiusKm`, it doesn't sort)
- [x] Visual system — Inter + Fraunces (Design.md §5), Lucide icons replacing text glyphs, icon category grid + trust line + featured horizontal scroll on the homepage, vendor "Pending verification" banner on the dashboard (§3.2)
- [x] Admin analytics — escrow held / released / refunded, commission earned, bookings-by-status breakdown, recent transactions table (PRD §5.9 "view all transactions")
- [x] Consistent loading/error/empty states (`QueryState`, skeletons, retry) across all list and detail pages
- [x] Smaller fixes: login returns you to the page you came from; "Become a vendor" preselects the vendor role; notifications link to their booking and have readable labels; `RatingStars` no longer invisible on dark panels or crashing on a null rating; vendor profile no longer says "Verified" for unverified vendors

**Tests** — `npm test` (24 tests, real MongoDB, `server/tests/`): booking state machine edges/permissions/notes/conflicts, demo escrow (hold, release, refund on decline/cancel, non-held guards, Stripe-unreachable leaves state intact), auto-release job, reviews (completed-only, one per booking, rating recompute, single vendor response), admin dispute release/refund and analytics. Mutation-checked: removing the demo-payment guard fails 2 escrow tests. CI now runs the suite against a `mongo:7` service.

**Verified:** client production build, `check:server`, full test suite, and a live read-only smoke test of `/admin/analytics` and `/admin/disputes` against the dev database. **Not verified in a browser** — layouts (drawer, bottom sheet, sidebar) were checked by build only.

## ✅ Browser verification + finalization

Drove the real app in headless Chrome (puppeteer, scratch `lsm_e2e` database) through the full PRD §8 journey: register → search → book → pay → vendor accepts → work delivered → customer accepts → review, plus a dispute refunded by the admin in the drawer. 18 screenshots at desktop and phone widths reviewed. Found and fixed:

- [x] **Search page crashed while loading** — pagination JSX inside `QueryState` children read `query.data.total` before data existed (children are evaluated even when not rendered). Added an app-wide `ErrorBoundary` so a render error can no longer blank the whole site
- [x] **Escrow copy promised things the code doesn't do** — "Accept & release payment" / "payment released" / vendor-side "released automatically if they don't respond". Release actually happens 24h after completion and nothing auto-accepts deliveries; copy now says that
- [x] **Review form never confirmed** — it silently cleared and stayed visible, inviting a resubmit that 409s; now shows a confirmation (and treats a 409 as "already reviewed")
- [x] Analytics transactions table clipped at 1366px; status badges wrapped — fixed
- [x] **`override: true` in dotenv** (`server.js`, `seedDemo.js`) made `.env` beat explicit env vars, so the seed and server ignored `MONGODB_URI` and hit the dev DB. Removed; the seed is now insert-only for the demo booking/thread (it used to reset an existing booking to `pending` and wipe its messages)
- [x] Added `README.md` (setup, demo accounts, features, scripts)
- [x] **Auto-complete of unanswered deliveries** (Design.md §3.1 "or auto-completes") — `autoCompleteStaleDeliveries()` in `jobs/releasePayments.js` runs hourly before the release job: a `submitted` booking whose latest delivery is older than `AUTO_COMPLETE_DAYS` (default 3) goes to `completed` through `updateBookingStatus` on the customer's behalf, with an "Auto-accepted…" note in the history. The payment then follows the normal 24h release, so the customer can still dispute. A revision restarts the clock. Booking-page copy updated on both sides
- [x] Release job no longer logs a "Cannot release" error every hour for each already-released booking
- **Pending verification:** the 5 new tests (auto-complete ×3, release housekeeping) and a browser re-run were written but not yet run — MongoDB was stopped and starting it needs admin rights

## ✅ Go-live readiness

- [x] **Cross-site login cookie** — refresh cookie was `sameSite: "lax"`; with the client and API on different sites (Vercel + Render) it is never sent, so every reload would log users out. Now `none` + `secure` in production; `clearCookie` repeats the attributes so logout works too; `trust proxy` set for Render
- [x] `client/vercel.json` SPA rewrite — deep links/refreshes no longer 404 on Vercel
- [x] `DEPLOYMENT.md` rewritten as a step-by-step Atlas → Render → Vercel guide with free-tier caveats; `SMTP_FROM` and `AUTO_COMPLETE_DAYS` added to `server/.env.example`
- [x] Seed always provides a known-password customer and an unverified vendor (so every role and the admin verification queue are testable)
- [x] Diagnosed the MongoDB outage: `mongod` crashed with **out of memory** (7.7 GB machine, uncapped WiredTiger cache) and Windows doesn't restart it. `scripts/fix-mongodb-windows.ps1` (run as admin) caps the cache at 1 GB, enables auto-restart, and starts the service

## ✅ Vendor verification review (admin ⇄ vendor)

- [x] `VendorProfile` gains `cnicNumber`, typed `documents` (cnic_front / cnic_back / business_proof / other), `verificationStatus` (pending → changes_requested ⇄ pending → approved) and an append-only `reviewHistory`. Startup backfill migrates legacy `verificationDocs` and sets status from `isVerified`
- [x] Admin: queue split into "Needs review" / "Waiting on vendor", missing items flagged per row; `VendorReviewDrawer` shows owner + business details, CNIC number, document gallery (missing required docs shown as red slots), history; **Approve** or **Request changes** (checklist of `CHANGE_ITEMS`, pre-ticked from what's missing, plus a note). Requesting changes on a live vendor takes them out of search
- [x] Vendor: profile form with CNIC number + per-type upload slots (replace/remove), a banner listing the requested items and note, flagged sections highlighted; saving while changes are requested **is** the resubmission (back to the queue, admins notified). Dashboard banner has an "Action needed" state
- [x] Email: readable per-type bodies with links (`vendor_changes_requested` lists each item). Without SMTP in development, emails are written to `server/dev-outbox/`
- [x] **Privacy fix:** the public `GET /vendors/:id` returned verification documents to anyone; CNIC, documents and review history are now stripped from public responses
- [x] Uploads: dev-only local-disk fallback (`server/uploads/`) when Cloudinary isn't configured; production still requires Cloudinary
- Verified: 33/33 server tests (5 new for this flow), plus a 9-step browser run (admin request → vendor fixes and resubmits with a real upload → admin approves → vendor verified), no page errors

## ✅ Real-world readiness: auth, addresses, time off, payouts, reminders

- [x] **Password reset + email verification + rate limiting.** Single-use hashed links (reset 1h, verify 24h); a reset bumps `User.tokenVersion` so every old refresh token dies. New sign-ups must verify before booking or applying as a vendor (existing accounts grandfathered); app-wide banner with resend. `express-rate-limit` (failed logins only, sign-ups, email-sending endpoints, broad API cap) + `helmet`
- [x] **Service address & notes.** `Listing.serviceLocation` (customer / vendor / online). At-customer bookings require address + contact phone; optional job notes for all. Checkout now creates the booking only when the details are submitted (a refresh used to create duplicates); past dates rejected. Booking page shows the address with a Maps link and tap-to-call
- [x] **Vendor time off.** `VendorProfile.timeOff` ranges, managed from the calendar page (shaded days). Enforced in availability, booking creation and date-filtered search; existing bookings in a new period are listed, not cancelled. Private
- [x] **Payout tracking.** Vendor payout method (IBAN / JazzCash / Easypaisa, validated, private); `Payment.payout` (unpaid → paid with reference + method snapshot). Admin Payouts page: owed per vendor, Mark as paid (all-or-nothing, can't double-pay), Paid history; vendor notified + emailed. Earnings page shows in escrow / awaiting payout / paid out
- [x] **Booking reminders.** `jobs/bookingReminders.js` every 15 min: ~24h and ~2h before accepted bookings, to both sides, in-app + email; atomic claim so never sent twice; `APP_UTC_OFFSET_MINUTES` (default 300, Pakistan)
- Verified: 56/56 server tests (24 new across these five), plus a browser run of every flow (register → blocked until verified → verify via emailed link; checkout with address → booking shows it; forgot/reset password; vendor blocks a day → unavailable to customers; JazzCash details; admin marks payout paid → vendor sees reference), no page errors
