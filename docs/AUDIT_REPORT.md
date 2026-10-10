# Production Audit & Optimization Report — Goodhand

**Date:** October 2026 · **Scope:** full codebase (Express API, React client, MongoDB schema, CI, deployment config)

**Result:** the audit pass made 7 commits. The server test suite grew from 56 to **69 tests, all passing**, and a browser regression run passed every check. Production dependencies went from **5 vulnerabilities (1 critical) to 0**.

How this pass was run:
- Each issue below was found in the code, fixed, and verified, either by an automated test or by a scripted run in headless Chrome.
- Items that need outside accounts, money or product decisions — AI APIs, payment gateways, subscription billing, managed infrastructure — are listed under **Remaining recommendations** with a concrete plan. They are not presented as done.

---

## 1. Existing issues found

| # | Area | Issue | Severity |
|---|---|---|---|
| 1 | Security | **NoSQL operator injection.** Query strings like `?status[$ne]=x` and JSON bodies like `{"email":{"$gt":""}}` reached MongoDB as query operators. | High |
| 2 | Security / trust | **Unapproved vendors' listings were publicly visible.** The vendor-filtered search skipped the "vendor must be verified" rule. Combined with #1, `?vendorId[$ne]=…` listed every unapproved vendor at once. | High |
| 3 | Dependencies | 5 vulnerable production packages: `proxy-addr` IP spoofing (critical; relevant because `trust proxy` is on), and `axios`, `engine.io` and `nodemailer` (high). | Critical |
| 4 | Security | Uploads stored on Cloudinary accepted **any file type** (HTML, scripts) as "raw" files, with no size cap beyond the 10 MB body limit. | Medium |
| 5 | Authorization | Admins could suspend **other admins or themselves** through the API. | Medium |
| 6 | Security | The JWT algorithm wasn't pinned on verify. The library's defaults are currently safe, but this should be explicit. | Low |
| 7 | Operations | The server **started without a database** if `MONGODB_URI` was missing, and would start in production with blank or placeholder JWT secrets, letting anyone forge logins. | High |
| 8 | Operations | In production, unexpected 500 errors returned raw internal messages to clients. There were no request IDs to correlate logs. | Medium |
| 9 | Observability | No record of who did what: admin decisions and sign-in failures left no trace, and there was no defence signal against password guessing. | Medium |
| 10 | Scalability | Scheduled jobs would run on **every** instance once the API is scaled horizontally. There was no health endpoint, no graceful shutdown, and an unbounded connection pool. | Medium |
| 11 | Performance | The whole client shipped as one ~490 kB JavaScript bundle; API responses weren't compressed. | Medium |
| 12 | Database | Indexes didn't match the real query shapes for search, dashboards, the payout queue or the background jobs. | Medium |
| 13 | Marketplace | Ranking was "newest" or a raw average rating, so a single 5★ review outranked a 50-review 4.8★ vendor. There were no saved items, no listing moderation, no featured placements, no provider analytics and no portfolio. | — |
| 14 | UX | No dark mode. | — |
| 15 | SEO | One static `<title>` for every page; no meta descriptions, canonical URLs, Open Graph tags, structured data, sitemap or robots.txt. | — |

## 2. Security vulnerabilities fixed

- **Injection guard** (`middleware/sanitizeRequest.js`): every key starting with `$` or containing `.` is removed from body, query and params before routing, so client input can only ever be data. Covered by tests.
- **Listing visibility:** vendor-filtered search now enforces the approved-vendor rule and validates the ID. Covered by tests.
- **Dependencies:** `npm audit --omit=dev` now reports **0 vulnerabilities**.
  - Safe in-range fixes were applied.
  - `nodemailer` was upgraded 6 → 10, `google-auth-library` 9 → 11 and `node-cron` 3 → 4. These are major versions, but the APIs we use are unchanged, which was verified.
- **Uploads:** both storage paths share one allowlist (JPEG, PNG, WebP, GIF, PDF, DOC, DOCX) and an 8 MB cap. Locally stored files get random names and are served with `nosniff`.
- **Authorization:** admins can't change their own status or suspend another admin.
- **JWT:** every `jwt.verify` pins `HS256`.
- **Safe startup:** the server refuses to start without a database URI, or in production with missing, short, placeholder-looking or identical JWT secrets, or without `CLIENT_URL`.
- **Error hygiene:** every response carries an `X-Request-Id`. 500 errors are logged server-side as JSON and returned to clients as a generic message in production.
- **Audit trail** (`models/AuditLog.js`, kept for one year):
  - **Account events:** sign-in success and failure (with IP and device), registration, password reset, email verification.
  - **Admin decisions:** vendor approval and change requests, dispute rulings, suspensions, payouts, and listing moderation.
- **Login monitoring:** the admin **Security & audit** page groups failed sign-ins from the last 24 hours by account (password guessing) and by network (credential stuffing). It flags patterns of 5 or more failures and shows a filterable, paginated audit trail.
- **Device tracking:** each account remembers up to 10 devices. A sign-in from a new device triggers a "was this you?" alert in-app and by email, with a reset-password link.

This builds on hardening from earlier passes, which is still in place:
- Hashed single-use reset and verification tokens; refresh tokens revoked on password reset.
- Rate limits on failed logins, sign-ups and email-sending endpoints, plus an API-wide limit.
- Helmet security headers and strict CORS.
- Private-field stripping: CNIC numbers, documents, payout details and time off are never exposed publicly.

## 3. Features added

| Feature | For | Notes |
|---|---|---|
| **Provider trust score (0–100)** | All | Built from a rating pulled toward 4.0★ until a vendor has enough reviews, plus completion rate, response rate, verification, experience and a dispute penalty. Recomputed on booking, review and approval events and nightly. Shown on the dashboard and profile; a **Top rated** badge appears at 85+. |
| **Smart ranking — "Recommended"** (new default sort) | Customers | Active featured placements first, then trust score. |
| **Featured listings** | Admin / revenue | Feature a listing for 7, 14, 30 or 90 days, extendable. It gets a badge and top placement in search and on the homepage. |
| **Listing moderation** | Admin | Hide a listing with a reason (the vendor is notified and emailed, and can't re-enable it) or restore it. Searchable, filterable admin Listings page. |
| **Saved services & providers** | Customers | Heart on cards and profiles with instant feedback, and a Saved page. Hidden or unverified items drop out automatically. |
| **Provider analytics** | Vendors | Listing views, view-to-request conversion, acceptance and completion rates, this month's earnings and the trust score, with tips when the score is low. |
| **Portfolio** | Vendors | Up to 12 captioned photos of past work, shown in a public **Work** tab. |
| **Customer reliability** | Vendors | Booking pages show the customer's completed, cancelled and disputed counts and a reliability percentage. Customers with too little history aren't judged. |
| **Security & audit console** | Admin | See §2. |
| **New-device sign-in alerts** | All | See §2. |

## 4. UX improvements

- **Dark mode:**
  - Follows the system setting by default, with a header toggle that remembers your choice.
  - It's applied before first paint, so there's no white flash.
  - The colour tokens are CSS variables, so every component adapts consistently.
  - Dark values were chosen for **WCAG AA contrast** (teal on the dark surface is about 6.5:1).
  - Status colours have dark tints, and fixed-dark panels (hero, login, vendor header) stay correct in both themes.
- Trust badges, Featured badges, and save hearts with accessible labels and pressed states.
- Moderation and payout states are visible to vendors on their own pages.
- Readable labels for every audit event.
- Verified in headless Chrome at desktop width in both themes.

## 5. Database improvements

- **New compound indexes matching real queries:**
  - Bookings: `{customerId, slot.date}`, `{vendorId, status, slot.date}` and `{status, slot.date}`.
  - Payments: `{status, payout.status, releasedAt}`.
  - Listings: `{isActive, category, price}` and `{vendorId, isActive, createdAt}`.
  - Vendors: `{isVerified, trustScore}`, `{isVerified, avgRating}` and `{verificationStatus, createdAt}`.
  - Users: `{role, status}`.
  - Audit log: indexes on action, actor and IP, plus a TTL index.
- **New fields:**
  - `VendorProfile.trustScore` and `portfolio`.
  - `Listing.featuredUntil`, `views` and `moderation`.
  - `User.savedListings`, `savedVendors` and `knownDevices` (private).
  - A new `AuditLog` collection.
- Automatic backfill of trust scores for existing vendors on startup.

## 6. API improvements

- **New endpoints:**
  - `GET /api/health`
  - `GET /sitemap.xml`
  - `GET|PUT|DELETE /api/users/me/saved…`
  - `GET /api/vendors/me/stats`
  - `GET /api/admin/listings` and `PATCH /api/admin/listings/:id/moderation`
  - `GET /api/admin/audit-log` and `GET /api/admin/security`
- Consistent error bodies (`message`, `requestId`) and correct 4xx status codes for malformed input.
- `GET /api/bookings/:id` includes `customerStats` for vendors and admins.

## 7. Performance improvements

- **Route-level code splitting:** 29 pages load on demand. The app's own startup code is now **36 kB (11 kB gzipped)**, down from one ~490 kB bundle.
- **Vendor chunking:** React, the data libraries and the icons are separately cached, so an app deploy doesn't re-download them.
- **Lazy-loaded, sized images** to reduce layout shift.
- **gzip compression** on API responses.
- **Fire-and-forget view counting** that never slows a page.

**Not measured:** Lighthouse and Core Web Vitals scores. No Lighthouse runner was available in this environment. Run Lighthouse against the deployed site; the changes above target the usual biggest costs (bundle size, images, compression).

## 8. Scalability improvements

- **`RUN_JOBS` switch:** scheduled jobs (escrow release, auto-complete, reminders, trust scores) run on exactly one instance. Each job also claims its records atomically, so overlapping runs can't double-act.
- **`/api/health`** returns 503 when the database is down, for load balancers and uptime monitors.
- **Graceful SIGTERM shutdown** lets in-flight requests finish on deploys. The MongoDB pool is bounded (`MONGODB_POOL_SIZE`) and fails fast.
- **Structured JSON error logs** with request IDs, ready for a log aggregator.
- **Stateless API** (JWT, no server sessions), so instances can be added freely. Socket.io needs a Redis adapter beyond one instance; see §10.

## 9. Revenue opportunities added

- **Featured listings:** the mechanism is built, with admin-controlled placements of 7–90 days, a badge and top ranking. It's currently granted by an admin; selling it self-serve needs a payment flow (§10).
- **Commission:** configurable via `PLATFORM_COMMISSION_PERCENT`, applied on every escrow payment and reported in analytics and payouts.
- **Trust-based ranking** gives vendors a reason to perform well and to buy visibility on top.

## 10. Remaining recommendations

Prioritised. Each needs an outside account, budget or product decision, so none were faked.

1. **Server-side rendering or pre-rendering for SEO.** Google runs JavaScript, so the new tags and structured data work for Google search. Social apps (WhatsApp, Facebook) don't, so link previews still show the default tags. Move public pages to SSR (Next.js or Vite SSR) or add a pre-render service.
2. **Local payments.** JazzCash and Easypaisa merchant APIs need merchant accounts. The escrow model already supports a second gateway behind `paymentService`.
3. **Self-serve monetization.** Vendors could buy featured placements and subscription plans (Pro: lower commission, more listings, a badge). This needs the payment gateway above plus a `Subscription` model and a billing job.
4. **Wallet, coupons and referrals.** These touch escrow amounts and commission. Design them as ledger entries, never by editing `Payment.amount`, and add them after local payments.
5. **AI features.** Description and SEO-metadata generation and a support assistant need an LLM API key and a cost budget. Recommended first: "Improve my listing description", generated on demand and always edited by the vendor. The trust score already provides a data-driven, explainable ranking without AI.
6. **Real-time at scale.** Add `@socket.io/redis-adapter` and Redis before running more than one API instance; rate-limit counters should also move to Redis.
7. **Queues.** Move email sending and reminders to a queue (BullMQ on Redis) for retries and backpressure.
8. **Monitoring.** Add Sentry (errors), an uptime monitor on `/api/health`, and log shipping for the JSON logs.
9. **Fraud signals.** Feed the audit trail into automated rules (for example, auto-lock after a burst of failures from many networks) and add CAPTCHA on sign-up once spam appears.
10. **Content Security Policy for the website.** The API already sends Helmet's CSP. Add a CSP header on Vercel once third-party scripts (Google sign-in, Stripe) are finalised.
11. **Lighthouse budget in CI.** Fail the build if bundle size or the Lighthouse score regresses.
