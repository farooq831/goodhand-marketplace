# Product Requirements Document (PRD)
## Local Services Marketplace

**Author:** Muhammad Farooq
**Status:** Draft v1.0
**Last updated:** August 2026

---

## 1. Overview

A two-sided marketplace web application connecting customers with local service providers (tutors, home repair technicians, photographers, event vendors, cleaners, etc.). Customers discover, book, and pay for services; vendors manage listings, availability, and orders. Built on the MERN stack (MongoDB, Express, React, Node.js).

## 2. Problem Statement

Local service providers in Pakistan (and most emerging markets) rely on WhatsApp groups, word-of-mouth, or informal Facebook marketplace posts to find customers. This creates:

- No centralized way to compare vendors by price, rating, or availability
- No accountability — payments happen off-platform, disputes have no record
- No booking calendar — double-bookings and missed appointments are common
- No trust signal for new customers (no reviews tied to verified transactions)

Customers waste time searching multiple WhatsApp groups; vendors lose bookings to disorganization and have no way to build a reputation that travels with them.

## 3. Goals

| Goal | Metric |
|---|---|
| Let customers find and book a vetted local service in under 5 minutes | Time-to-book |
| Let vendors manage their business without a phone/paper calendar | Vendor retention after first booking |
| Build trust through verified, transaction-linked reviews | % of completed bookings that get reviewed |
| Handle payment safely so both sides are protected | Disputed transaction rate |

## 4. Target Users

### Persona A — Customer ("Ayesha")
Needs a home tutor for her son. Currently asks in a parents' WhatsApp group and gets 3 conflicting recommendations with no way to compare price or reviews.

### Persona B — Vendor ("Bilal")
Freelance photographer. Manages bookings via Instagram DMs and a paper diary. Frequently double-books or forgets a shoot.

### Persona C — Admin
Platform operator who needs to resolve disputes, verify vendors, and monitor overall marketplace health.

## 5. Core Features (MVP Scope)

### 5.1 Authentication & Roles
- Email/password + Google OAuth signup
- Three roles: `customer`, `vendor`, `admin`
- Vendor accounts require a verification step (ID/business proof) before listings go live

### 5.2 Vendor Onboarding & Listings
- Vendor creates a profile: business name, category, description, service area, price range
- Vendor creates one or more **service listings** (e.g., "1-hour Math Tutoring", "Wedding Photography — Half Day")
- Each listing has: title, description, price, duration, photos, availability rules

### 5.3 Search & Discovery
- Browse by category (Tutoring, Home Repair, Photography, Events, Cleaning, etc.)
- Filter by price range, rating, location/distance, availability date
- Vendor profile page shows listings, reviews, and response rate

### 5.4 Booking & Calendar
- Customer selects a listing, sees vendor's real-time availability calendar, picks a slot
- Booking request goes to vendor: **Pending → Accepted/Declined → Completed → Cancelled**
- Vendor calendar auto-blocks accepted slots to prevent double-booking

### 5.5 Payments
- Customer pays at booking time; funds are **held in escrow** (platform-held status) until service is marked complete
- Payment released to vendor automatically after completion window (e.g., 24 hrs post-service) unless a dispute is raised
- Platform takes a commission percentage per transaction (configurable, e.g., 10%)

### 5.6 In-App Chat
- Real-time chat between customer and vendor, scoped to a specific booking
- Used for clarifying details before/after booking (address, requirements, etc.)

### 5.7 Reviews & Ratings
- Only customers with a **completed** booking can review that vendor
- 1–5 star rating + written review
- Vendor can publicly respond to a review once

### 5.8 Notifications
- In-app + email notifications for: booking request, booking accepted/declined, payment confirmation, chat message, review received
- Optional SMS for booking confirmations (stretch goal)

### 5.9 Admin Dashboard
- Approve/reject vendor verification requests
- View all transactions, flag/resolve disputes
- Suspend vendor or customer accounts
- Basic marketplace analytics (GMV, active vendors, booking volume)

## 6. Out of Scope (v1)

- Native mobile apps (web-responsive only)
- Multi-currency support
- Vendor payout to bank accounts automatically (manual payout process is fine for v1)
- AI-based vendor recommendations
- Multi-language support

## 7. User Stories (Sample)

- *As a customer*, I want to filter vendors by price and rating so I can find one within my budget.
- *As a vendor*, I want to see my upcoming bookings on a calendar so I don't double-book myself.
- *As a customer*, I want my payment held until the service is done so I'm protected if the vendor doesn't show up.
- *As an admin*, I want to see flagged disputes in one place so I can resolve them quickly.
- *As a vendor*, I want to respond to a negative review so potential customers see my side.

## 8. Success Metrics (Post-Launch / Demo)

- End-to-end booking flow completes without errors (signup → search → book → pay → chat → complete → review)
- At least 3 vendor categories represented in seed data
- Payment escrow state machine correctly transitions in all cases (completed, cancelled, disputed)
- Admin can resolve a simulated dispute from the dashboard

## 9. Suggested Build Timeline (Solo Developer)

| Phase | Duration | Deliverable |
|---|---|---|
| 1. Auth + roles + DB schema | Week 1 | Working signup/login, role-based routing |
| 2. Vendor listings + search/filter | Week 2 | Browse & filter UI, listing CRUD |
| 3. Booking + calendar logic | Week 3 | Booking state machine, availability calendar |
| 4. Payments (Stripe test mode) + escrow logic | Week 4 | Full pay → hold → release flow |
| 5. Chat (Socket.io) + notifications | Week 5 | Real-time chat, email notifications |
| 6. Reviews + Admin dashboard + polish | Week 6 | Reviews, admin panel, deployment |

## 10. Open Questions

- Which payment gateway is realistic for a Pakistan-based demo — Stripe (test mode, for portfolio purposes) or a local gateway (JazzCash/Easypaisa) if aiming for real local usage?
- Should vendor verification be manual (admin reviews uploaded ID) or skipped entirely for MVP/demo purposes?
