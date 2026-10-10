# Pre-launch Code Review — "1 million users tomorrow"

**Scope:** whole codebase. Every finding below was confirmed in the code before being fixed. Where a fix could be tested, it has a test; the concurrency tests were mutation-checked, meaning they fail when the fix is removed.

**Result:**
- **Critical: 8 found, 8 fixed.**
- **High: 10 found, 9 fixed.** The remaining one, admin two-factor authentication, needs a product decision; see the plan below.
- **Medium and Low:** fixed where cheap; otherwise documented as accepted risks with a plan.

**Verification:**
- 91 server tests pass, run 3 times in a row for the concurrency suite.
- A full browser journey passes: register → verify email → checkout → pay → password reset → vendor time off and payout details → vendor accepts → work delivered → escrow released → admin payout.
- An admin regression run passes.
- The production build was checked under the production Content Security Policy with zero violations.
- `npm audit --omit=dev` reports 0 vulnerabilities.

Commits: `ef04cbe`, `b8885d2`, `f939695`, `ad06201`, `9af5114`, `afa9a82`, `ec682b7`, `409fd51`, plus the Medium-severity fixes.

---

## CRITICAL — all fixed

| # | Issue | Why it matters | Fix |
|---|---|---|---|
| C1 | **Public admin password on production.** `DEPLOYMENT.md` told you to run `seed:demo` against the live database, which creates `admin@example.com / Admin1234`, a password published in the README. | Anyone on the internet could sign in as admin: approve vendors, release escrow, suspend users. | Against any non-local database, the seed refuses to run unless `SEED_PASSWORD` (12+ characters) is set; every seeded account then uses it. The local-database check is anchored so a remote URL can't bypass it. Docs updated. |
| C2 | **Double-booking.** Accepting checked for conflicts and then saved, with no lock in between. | Two overlapping requests accepted at the same moment both succeed, so one vendor is booked twice. | The conflict check and the save run inside a per-vendor-per-day MongoDB mutex (`utils/locks.js`, a unique key with a TTL for crash safety). Test: 5 simultaneous accepts → exactly 1. |
| C3 | **Lost updates in the booking state machine.** Each status change read the booking, validated it, then saved the whole document. | A customer cancelling while the vendor accepts: the cancel refunds the escrow and the accept overwrites it, leaving an accepted job with no money held. The vendor works for free. | Every transition is a conditional write `{_id, status: <expected>}`; the loser gets a 409 "refresh". Test: cancel and accept at once → exactly one wins. |
| C4 | **Double payment.** "No payment yet?" was checked before creating the payment, with no guard against a second request. | A double-click or retry creates two escrow payments; one is orphaned. | A **unique index on `Payment.bookingId`** (synced at startup), a guarded link step, and an orphaned Stripe authorisation is voided. Test: 4 simultaneous payments → 1. |
| C5 | **Double release or refund.** Release and refund read "held" and then acted. | The release job and an admin ruling (or two instances) can both release, or one release while the other refunds. | An atomic `held → released/refunded` claim *before* calling Stripe, rolled back if Stripe fails. Tests: 4 simultaneous releases → money moves once, one notification; release racing refund → one outcome. |
| C6 | **The admin user list loaded every user.** | At 1M users, opening the page loads the whole collection into memory and crashes the API for everyone. | Server-side search (email prefix or name), role and status filters, pages of 25, capped page depth. Client page rebuilt. |
| C7 | **Search didn't scale and ranked wrongly.** Each request loaded the ID of every approved vendor into memory; the default "Recommended" sort fetched the newest 300 listings and sorted them in Node. | The busiest endpoint did O(vendors) work per request, and older top-quality listings could **never** rank. | Vendor facts (approved, trust score, rating, review count, name, location) are copied onto listings (`services/listingSync.js`, kept in sync on every change). Each sort and filter has a matching index; geo uses `$geoWithin`. Tests include a 322-listing ranking case and an `explain()` check that asserts an index scan. |
| C8 | **The safety indexes might not exist yet.** The lock and one-payment guards rely on unique indexes that Mongoose builds asynchronously. | On a fresh deploy or new database, the first requests can run before the index exists, so the lock silently does nothing. A test caught this. | `Model.init()` is awaited before relying on these indexes, and the critical indexes are built at startup before serving traffic. |

## HIGH

| # | Issue | Why it matters | Fix | Status |
|---|---|---|---|---|
| H1 | **Refresh-token rotation was cosmetic.** Stateless JWTs were rotated but never invalidated. | A stolen refresh token kept working for 7 days alongside the real user's. | Server-side sessions, one per device (max 10). Each refresh rotates the token ID; replaying a rotated token **revokes the session** and is audited. A 30-second grace window covers two tabs refreshing at once. Logout ends that device's session; password reset ends all of them. | Fixed |
| H2 | **Google account pre-hijack.** Google sign-in linked to an existing account found by email, and Google's `email_verified` flag wasn't checked. | An attacker registers `victim@gmail.com` with a password first; when the victim signs in with Google, the attacker keeps password access. | Google's `email_verified` is required. Linking to an account whose email was never verified **wipes that password and all its sessions**. | Fixed |
| H3 | **10 MB JSON limit on every route.** | A few concurrent large bodies exhaust memory. | 100 KB default; 12 MB only on `/api/uploads`. | Fixed |
| H4 | **The release job scanned every completed booking ever made**, every hour. | It gets slower forever. | `Payment.releaseAfter` is set when a booking completes and cleared on dispute, and the job reads index `{status, releaseAfter}`. Startup migrations backfill it. | Fixed |
| H5 | **Unbounded lists, and earnings summed on the client.** | Busy vendors would download everything, and totals would undercount once a limit was added. | Bookings capped at 300, notifications at 50 (with a 180-day TTL), reviews at 50. Earnings come from one indexed aggregation on the new `Payment.vendorId`. The vendor backfill walks forward by ID, so records whose booking was deleted can't cause an infinite loop. | Fixed |
| H6 | **Unpaid-checkout spam.** Bookings are created before payment, and the vendor was notified immediately. | One account could flood a vendor with fake requests, and unpaid requests also **dragged down the vendor's response rate and trust score**. | Vendors see and hear about a request only once it's paid. Max 3 unpaid checkouts per customer. Abandoned checkouts expire after 30 minutes. Trust and response rates ignore unpaid requests. | Fixed |
| H7 | **Any URL accepted for documents, portfolio, photos, delivered work and avatars.** | A fake vendor could submit a "CNIC photo" that is really a phishing page, and the admin would open it from the review drawer. | Only links to this Cloudinary account, the dev `/uploads` path, or `TRUSTED_UPLOAD_HOSTS` are accepted. Links already on a record may stay. | Fixed |
| H8 | **Real-time sockets.** No rate limit; payloads skipped the request sanitizer; sockets outlived token expiry; **rooms weren't rejoined after a reconnect**. | Chat flooding; a suspended account kept a live channel; any network blip silently stopped live updates. | 10 messages per 10 s and 30 joins per minute per socket; payloads type-checked; disconnect at token expiry; the client reconnects with a fresh token and rejoins its rooms. Verified on the live server: 10 sent and 5 throttled, the operator payload rejected, and the socket dropped at expiry. | Fixed |
| H9 | **No security headers on the website.** | No defence in depth against injected scripts, and the site could be framed for clickjacking. | Strict CSP (no inline scripts), `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy and Permissions-Policy in `vercel.json`. The theme script moved out of the inline `<script>`. Zero violations in the CSP test. | Fixed |
| H10 | **No two-factor authentication for admins.** | Admins can release money and suspend users; one phished password is enough. | **Plan:** TOTP (`otplib`) enrolment from account settings, required for the `admin` role; a second login step that issues the session only after the code; ten single-use recovery codes. | **Open: needs a product decision** (TOTP app vs SMS/WhatsApp OTP for this market) |

## MEDIUM

| # | Issue | Fix / status |
|---|---|---|
| M1 | Every listing view was a database write, creating hotspots on popular listings. | **Fixed:** views are buffered in memory and bulk-written every 15 s, and flushed on shutdown. |
| M2 | Admin analytics re-ran heavy aggregations on every page load. | **Fixed:** cached for 60 s per instance. |
| M3 | Unbounded `skip()` pagination (a DoS vector). | **Fixed:** page caps on search (500), admin lists and the audit log (1000). |
| M4 | bcrypt silently ignores everything past 72 bytes, so two long passwords sharing a prefix both work. | **Fixed:** passwords over 72 bytes are rejected. |
| M5 | The notifications collection grows forever. | **Fixed:** 180-day TTL. |
| M6 | A suspended user keeps access until their current access token expires (≤ 15 min). | **Accepted, mitigated:** refresh is denied, the socket is dropped at expiry, and the token lifetime is short. **Plan:** a Redis deny-list checked in `authenticate` once Redis exists. |
| M7 | Rate-limit counters live in each process's memory. | **Plan:** with more than one instance, switch `express-rate-limit` to `rate-limit-redis`. |
| M8 | Money is stored as floating-point Rupees. | **Plan:** migrate to integer paisa (`amountMinor`) with a dual-write migration; current amounts are rounded to 2 decimals. |
| M9 | Free-text search is a regex, applied after the indexed filters. | **Plan:** MongoDB Atlas Search (partial matching, typo tolerance, relevance). |
| M10 | Uploads are sent as base64 JSON through the API (33% overhead, held in memory). | **Plan:** signed direct-to-Cloudinary uploads, with the API only recording the result. |

## LOW

| # | Issue | Status |
|---|---|---|
| L1 | Registration reveals whether an email is taken. | Accepted (industry-common); the endpoint is rate-limited. |
| L2 | bcrypt cost is 10. | Raise to 12 once login latency on production hardware has been measured. |
| L3 | The dispute queue counts messages with one query per dispute. | Fine while the queue is small; aggregate it if it grows. |
| L4 | Stripe webhook events aren't de-duplicated by event ID. | Handlers are idempotent on status; store processed event IDs before going live with Stripe. |
| L5 | JSON logs go to stdout with no shipping. | Ship to a log service (Better Stack, Datadog) and alert on `level: error`. |

## Behaviour changes to know before launch

- **Everyone signs in once more** after this deploy, because refresh tokens now need a server-side session.
- **Unpaid checkouts disappear after 30 minutes.** That includes any old test bookings left unpaid.
- The live-database seed needs `SEED_PASSWORD` (see `DEPLOYMENT.md`). For a real launch, skip the demo data.
- **Uploaded files must come from your Cloudinary account.** Set `TRUSTED_UPLOAD_HOSTS` if you serve uploads from a CDN.
- Run with `RUN_JOBS=false` on all but one API instance.
