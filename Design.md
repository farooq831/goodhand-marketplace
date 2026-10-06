# Design Document
## Local Services Marketplace

**Last updated:** August 2026

---

## 1. Design Principles

- **Trust first** — every screen should reinforce that payments and reviews are safe and verifiable (escrow badges, verified vendor badges, transaction-linked reviews).
- **Low friction booking** — a customer should get from "browsing" to "booked" in as few taps/clicks as possible.
- **Role clarity** — customer and vendor experiences should feel like different apps wearing the same visual system, since their goals differ completely.
- **Mobile-first** — most customers in the target market will browse on a phone; design layouts for a narrow viewport first, then expand.

## 2. Information Architecture

```
/                        → Landing page (category grid, search bar, featured vendors)
/search                  → Search results (filters: category, price, rating, date, location)
/vendor/:id              → Vendor profile (listings, reviews, availability)
/listing/:id             → Listing detail + booking widget
/login, /register         → Auth
/dashboard                → Role-aware redirect
  /dashboard/customer/bookings
  /dashboard/customer/messages
  /dashboard/vendor/listings
  /dashboard/vendor/calendar
  /dashboard/vendor/bookings
  /dashboard/vendor/earnings
  /dashboard/admin/vendors
  /dashboard/admin/disputes
  /dashboard/admin/analytics
/booking/:id              → Booking detail (status, chat, payment info, review CTA)
/checkout/:listingId      → Payment flow
```

## 3. Key User Flows

### 3.1 Customer: Search → Book → Pay
1. Land on homepage → select category or search
2. Filter results by price/rating/date → open a listing
3. View vendor profile, reviews, availability calendar
4. Pick a slot → confirm booking details → checkout (Stripe)
5. Land on booking confirmation → see status = "pending vendor acceptance"
6. Get notified when vendor accepts → chat opens → service happens
7. Mark as completed (or auto-completes) → prompted to leave a review

### 3.2 Vendor: Onboarding → First Booking
1. Register as vendor → fill business profile → upload verification docs
2. Wait for admin approval (status banner shown: "Pending verification")
3. Once approved, create first listing (title, price, photos, availability)
4. Receive booking request notification → accept/decline from dashboard
5. Calendar auto-blocks the slot → chat with customer to confirm details
6. Mark booking complete after service → payment releases automatically (or after grace period)

### 3.3 Admin: Resolve a Dispute
1. Dispute flagged (customer or vendor raises an issue on a booking)
2. Admin sees it in `/dashboard/admin/disputes` queue with booking + chat context
3. Admin reviews chat log and booking history
4. Admin resolves: release payment to vendor OR refund customer
5. Both parties notified of resolution

## 4. Wireframe Descriptions (Key Screens)

### Homepage
- Sticky top nav: logo, search bar, "Become a Vendor" CTA, login/avatar
- Hero section: large search bar + trust line ("Verified vendors. Protected payments.")
- Category grid (icon + label): Tutoring, Home Repair, Photography, Events, Cleaning, etc.
- "Featured Vendors" horizontal scroll — card shows photo, name, rating, starting price

### Search Results
- Left sidebar (collapses to a filter drawer on mobile): category, price range slider, min rating, date availability
- Right: result cards — vendor photo, name, category tag, star rating + review count, starting price, "View" button
- Sort dropdown: Relevance / Price / Rating

### Vendor Profile
- Header: cover photo, avatar, business name, verified badge, avg rating, response rate
- Tabs: Listings | Reviews | About
- Listings tab: card grid of that vendor's services with price + "Book" button
- Reviews tab: list of star ratings + comments, vendor responses shown inline

### Listing Detail + Booking Widget
- Left: photo gallery, description, what's included
- Right (sticky on desktop, bottom sheet on mobile): price, duration, calendar date picker, available time slots, "Request Booking" button
- Below fold: vendor mini-card, cancellation policy, related listings

### Booking Detail Page
- Status stepper at top: Pending → Accepted → Completed (visual progress, greys out Declined/Cancelled paths if not taken)
- Booking summary card: listing, date/time, price, payment status badge ("Held in Escrow" / "Released" / "Refunded")
- Embedded chat panel (real-time)
- CTA changes by state: "Cancel Booking" (pending), "Mark Complete" (vendor, when accepted), "Leave a Review" (after completed)

### Vendor Dashboard — Calendar
- Week/month calendar view, accepted bookings shown as blocked slots
- Click a slot → see customer name, listing, status, quick actions (accept/decline/message)

### Admin — Dispute Queue
- Table: Booking ID, Customer, Vendor, Amount, Raised On, Status
- Row click → detail drawer with full chat transcript + booking status history + Resolve buttons

## 5. Visual System

| Element | Choice | Rationale |
|---|---|---|
| Primary color | Deep teal (#0F6E5F) | Signals trust/safety without being generic "fintech blue" |
| Accent color | Warm amber (#E8A33D) | For CTAs — stands out against teal, feels approachable not corporate |
| Neutral scale | Warm greys (not pure black/white) | Softer, more approachable than a stark SaaS look |
| Typography | Inter or Manrope for UI, one distinct serif (e.g., Fraunces) for marketing headlines only | Keeps dashboards clean while giving the landing page some personality |
| Status colors | Pending = amber, Accepted = blue, Completed = teal/green, Declined/Cancelled = neutral grey, Disputed = red | Consistent status color language across customer, vendor, and admin views |
| Cards | Rounded-lg (8–12px), soft shadow, generous padding | Avoid the "default Bootstrap card" look |
| Iconography | Line icons (Lucide) | Matches lightweight, modern feel |

## 6. Component Inventory

- `SearchBar` (with location + category typeahead)
- `FilterSidebar` / `FilterDrawer` (mobile)
- `VendorCard`, `ListingCard`
- `RatingStars` (display + input variants)
- `AvailabilityCalendar` (read-only for customer, editable for vendor)
- `BookingStatusStepper`
- `ChatPanel` (real-time, scoped to bookingId)
- `PaymentStatusBadge`
- `ReviewCard` (with optional vendor response block)
- `RoleAwareDashboardShell` (sidebar nav that changes by role)
- `DisputeDetailDrawer` (admin)
- `NotificationBell` (dropdown list, unread count)

## 7. Responsive Rules

- Breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px)
- Booking widget: sticky sidebar on desktop → collapses to a bottom sheet triggered by a "Book Now" bar on mobile
- Filters: sidebar on desktop → slide-up drawer on mobile
- Dashboard nav: persistent sidebar on desktop → bottom tab bar or hamburger drawer on mobile

## 8. Accessibility Notes

- All status badges (Pending/Accepted/etc.) must pair color with text/icon, not color alone
- Calendar date picker must be keyboard-navigable
- Chat panel needs `aria-live` region for incoming messages
- Minimum contrast ratio 4.5:1 for all text on colored backgrounds (verify teal/amber against white and dark backgrounds)
