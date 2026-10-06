# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

All six PRD phases are implemented, plus a polish pass. `task.md` is the running log of what was built, why, and how it was verified — read it before changing a feature. The app is an npm-workspaces monorepo (`client`, `server`).

**Commands** (from the repo root):
- `npm run dev` — API (nodemon, port 5000) + Vite client together
- `npm run build --workspace=client` — production client build
- `npm run check:server` — server syntax check
- `npm test` — server Vitest suite (`server/tests/`). Needs a local mongod; uses `MONGODB_TEST_URI` (default `mongodb://127.0.0.1:27017/lsm_test`) and refuses any DB not ending in `_test`. Tests load app code via `createRequire` — the server is CommonJS, and importing models as ESM double-registers them with Mongoose.
- `npm run seed:demo` — demo vendors/listings/admin (`admin@example.com` / `Admin1234`)

**Payments without Stripe:** checkout uses `POST /api/payments/confirm`, which creates a *demo* payment (`stripePaymentIntentId` prefixed `demo_`) that walks the same held → released/refunded lifecycle locally. `paymentService` skips Stripe calls for demo payments; real `pi_…` intents still go through Stripe. Keep that guard if you touch release/refund.

**Booking states** include `submitted` (work delivered, awaiting customer approval) beyond the Architecture.md diagram; the full edge/permission table is `TRANSITIONS` in `server/src/services/bookingService.js`.

The three documents in the repo root are the spec of record:

- **`PRD.md`** — product requirements: problem statement, personas, MVP feature scope (5.1–5.9), explicit out-of-scope items for v1, and the suggested 6-week build order.
- **`Architecture.md`** — tech stack, MongoDB collection schemas, REST API surface, auth flow, booking state machine, payment/escrow flow, Socket.io event design, and planned folder structure.
- **`Design.md`** — information architecture (routes), key user flows for each role, wireframe descriptions, visual system (colors/type/status colors), component inventory, and accessibility notes.

Client-side shared pieces worth reusing rather than re-implementing: `RoleAwareDashboardShell` (all `/dashboard/*` routes nest under it; role nav lives in `client/src/utils/dashboardNav.js`), `QueryState` / `LoadError` / `PageLoading` / `PageNotFound` for loading-error-empty states, and `DisputeDetailDrawer`.

## Architecture (from Architecture.md)

**Stack:** MERN — React (Vite) + React Router + TanStack Query + Tailwind on the frontend; Node/Express REST API on the backend; MongoDB via Mongoose; Socket.io for real-time chat and booking updates; JWT (access + refresh) with Google OAuth for auth; Stripe (manual-capture PaymentIntents) for escrow-style payments; Cloudinary/S3 for file storage.

**Folder structure:**
```
/server/src
  /config       - db connection, env, stripe, cloudinary
  /models       - Mongoose schemas
  /routes
  /controllers
  /services     - business logic (bookingService, paymentService, ...)
  /middleware   - auth, roleGuard, errorHandler
  /sockets      - chat + booking real-time handlers
  /jobs         - node-cron (payment release, reminder emails)
  /utils
server.js

/client/src
  /pages        - route-level components
  /components   - shared UI
  /features     - auth, listings, bookings, chat, admin (colocated by domain)
  /hooks
  /api          - axios instances + query hooks
  /context      - auth context
  /utils
main.jsx
```

### Domain model to keep in mind

Seven core collections drive everything: `users` → `vendorProfiles` → `listings` → `bookings` → `payments`/`reviews`/`messages` → `notifications`. Key relationships and denormalizations (see `Architecture.md` §3 for full schemas):
- `vendorProfiles.avgRating`/`reviewCount` are denormalized onto the vendor for fast search sort — must be kept in sync when reviews are created.
- `bookings` carries its own `statusHistory` array; every status change should append to it rather than just overwriting `status`.
- `payments` is a separate collection from `bookings` (linked by `bookingId`/`paymentId`), tracking Stripe's `held → released/refunded` lifecycle independently of the booking's own state.
- `messages` are scoped to a `bookingId`, not a general DM thread — chat only exists in the context of a specific booking.

### Booking state machine

```
pending → accepted → completed → (payment released)
pending → declined
accepted → cancelled → (payment refunded)
completed → disputed → (admin resolves → released or refunded)
```
All transitions must go through one `updateBookingStatus()` service function that validates the transition is legal, writes `statusHistory`, and triggers the associated notification + payment side-effect. Don't scatter status writes across controllers — that's how the state machine and escrow logic drift apart.

### Payment / escrow flow

Payments are **not** captured immediately. A booking confirmation creates a Stripe PaymentIntent with `capture_method: manual`; funds are authorized/held (`payments.status = "held"`) and only captured (`"released"`) by a scheduled job after the booking is `completed` plus a grace period, unless a dispute intervenes. This two-phase capture is central to the trust model described in `PRD.md` §5.5 — don't implement payments as immediate-capture.

### Real-time layer

Socket.io uses one room per booking (`booking:{bookingId}`), joined by customer and vendor after acceptance. Socket auth reuses the same JWT middleware as REST. Core events: `message:send`/`message:receive`, `booking:statusUpdate`.

### Auth

JWT access token (~15 min) + httpOnly-cookie refresh token (~7 days); refresh endpoint rotates tokens so access tokens never need localStorage persistence. Role-based middleware (`requireRole("vendor")`, `requireRole("admin")`) guards routes for the three roles: `customer`, `vendor`, `admin`.

## Design system notes (from Design.md)

- Primary color deep teal `#0F6E5F`, accent warm amber `#E8A33D`; status colors are fixed per state (Pending=amber, Accepted=blue, Completed=teal/green, Declined/Cancelled=grey, Disputed=red) and must always pair color with text/icon, not color alone.
- Mobile-first: the booking widget is a sticky sidebar on desktop but collapses to a bottom sheet on mobile; filters are a sidebar on desktop, a slide-up drawer on mobile.
- Customer and vendor dashboards intentionally read as different apps sharing one visual system (`RoleAwareDashboardShell` switches nav by role) — don't unify their UX just because they share components.
