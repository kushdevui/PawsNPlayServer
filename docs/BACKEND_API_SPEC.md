# Paws N' Play — Backend API Specification (v1)

> **Audience:** the engineer / agent building the Node.js REST API in a **separate repository**.
> This document is self-contained: you do not need the mobile app repo to implement it.
> **Source of truth:** the React Native app already runs against a mock of this API
> (`src/api/mock/routes.ts` in `kushdevui/PawsNPlayRender`). The real server must return the
> **same shapes, status codes, error codes and rules** so the app works by flipping one env flag.
>
> Version: 1.0 · 24 Nov 2026 · Phase 1 = admin boarding board (dogs, bookings, capacity, payments, billing).

---

## Table of contents
1. [What to build](#1-what-to-build)
2. [Tech stack & project setup](#2-tech-stack--project-setup)
3. [API conventions](#3-api-conventions)
4. [Roles & permissions](#4-roles--permissions)
5. [Error codes](#5-error-codes)
6. [Data models (MongoDB)](#6-data-models-mongodb)
7. [Endpoints](#7-endpoints)
   - 7.1 Health · 7.2 Auth · 7.3 Users · 7.4 Dogs · 7.5 Bookings · 7.6 Payments · 7.7 Settings · 7.8 Dashboard · 7.9 Occupancy · 7.10 Billing · 7.11 Uploads · 7.12 Questionnaires
8. [Business rules (exact algorithms)](#8-business-rules-exact-algorithms)
9. [Auth & security](#9-auth--security)
10. [Seed data](#10-seed-data)
11. [Acceptance tests](#11-acceptance-tests)
12. [Connecting the mobile app](#12-connecting-the-mobile-app)
13. [Route summary](#13-route-summary)

---

## 1. What to build

Paws N' Play runs a **dog boarding** facility. Admins use the mobile app to:
- maintain **dogs** (with owner contact and care info, vaccination documents),
- create and manage **bookings** (stays from a check-in date+time to a check-out date+time),
- check dogs **in / out**, cancel stays,
- enforce **capacity** (max dogs at the same time) and prevent **double booking** of a dog,
- record **payments** (advance / payment / refund) per booking,
- view a **dashboard**, an **occupancy calendar** and **billing** for any period.

Roles today: `admin` (full access), `staff` (read + check-in/out), `user` (customer — no Phase 1 endpoints beyond auth/me).

---

## 2. Tech stack & project setup

| Concern | Choice (recommended) |
|---|---|
| Runtime | Node.js 22 LTS, TypeScript (strict) |
| HTTP | Express 5 (or Fastify) |
| DB | MongoDB 7+ with Mongoose 8 |
| Validation | Zod (request body/query schemas) |
| Auth | JWT (access + refresh), bcrypt (cost 12) |
| Dates / timezone | Luxon (or date-fns-tz) — **all "day" logic in the facility timezone** |
| Uploads | multer (memory) → S3 / Cloudinary (signed URLs) |
| Security | helmet, cors, express-rate-limit (login), request size limits |
| Logging | pino |
| Tests | Vitest/Jest + supertest + mongodb-memory-server |

Suggested structure:
```
src/
  app.ts               express app, middleware, routes, error handler
  server.ts            listen
  config/env.ts        zod-validated env
  db/mongo.ts          connect
  models/              User, Dog, Booking, Settings (+ RefreshToken)
  middleware/          auth (requireUser, requireRole), validate(zod), errorHandler
  routes/              auth, users, dogs, bookings, payments, settings, admin, uploads
  services/            booking.service (capacity, overlap, nights), billing, occupancy, dashboard
  utils/               httpError, pagination, time (facility tz helpers), serialize
  seed/                seed.ts + data/*.json (copied from the app repo mock/data)
tests/
```

Environment variables:
```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/pawsnplay
JWT_ACCESS_SECRET=...            # long random
JWT_REFRESH_SECRET=...           # different long random
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
CORS_ORIGINS=*                   # tighten in production
UPLOAD_PROVIDER=s3               # s3 | cloudinary | local (dev only)
S3_BUCKET=... S3_REGION=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
```

Scripts: `dev`, `build`, `start`, `test`, `seed` (drops & re-seeds Phase 1 data).

---

## 3. API conventions

- **Base URL:** `/api/v1` (all paths below are relative to it).
- **Content type:** `application/json` (except uploads: `multipart/form-data`).
- **Auth:** `Authorization: Bearer <accessToken>` on every endpoint except health, login, register, refresh.
- **IDs:** strings. Expose Mongo `_id` as `id` (hex string). Never return `_id`, `__v`, `passwordHash`.
  Embedded sub-documents (payments, documents) also expose `id`.
- **Dates/times:** ISO-8601 **UTC** strings with milliseconds, e.g. `"2026-11-23T04:30:00.000Z"`.
  Calendar-only fields (`dateOfBirth`, `vaccinationExpiry`, occupancy `date`) are `"YYYY-MM-DD"` strings.
  Times of day (`defaultCheckInTime`) are `"HH:mm"` 24-hour strings.
- **Facility timezone:** `settings.timezone` (default `Asia/Kolkata`). Anything described as "today",
  "day", "calendar day", "this month" or "nights" is computed **in this timezone**.
- **Money:** plain numbers in the major unit (rupees), currency from `settings.currency` (`"INR"`).
  Use integers where possible; never floats with >2 decimals.
- **Response envelopes:**
  - Single item: `{ "data": { ... } }`
  - List: `{ "data": [ ... ], "meta": { "total": 42, "page": 1, "limit": 50 } }`
  - Error: `{ "error": { "code": "CAPACITY_FULL", "message": "Human readable", "details": { ... } } }`
    (`details` optional). The app shows `message` to the user — keep it short and friendly.
- **Pagination (lists):** `?page=1&limit=50`. Defaults page 1, limit 50; clamp limit to 1..500.
  The app currently requests `limit=500` and paginates client-side.
- **Status codes:** 200 OK, 201 Created (POST that creates), 401, 403, 404, 405, 422 (validation & rule
  violations — the app expects **422**, not 400), 429, 500.
- **Unknown query params** are ignored. Unknown body fields are ignored (do not error).
- **PATCH** = partial update: only provided fields change; `undefined`/missing = keep.

---

## 4. Roles & permissions

| Endpoint group | admin | staff | user |
|---|:-:|:-:|:-:|
| Auth (`/auth/*`, `/me`) | ✓ | ✓ | ✓ |
| Users (`/users*`) | ✓ | – | – |
| Dogs read (`GET /dogs`, `GET /dogs/:id`) | ✓ | ✓ | – |
| Dogs write (`POST`, `PATCH /dogs*`) | ✓ | – | – |
| Bookings read | ✓ | ✓ | – |
| Bookings create / edit | ✓ | – | – |
| Booking status (`PATCH /bookings/:id/status`) | ✓ | ✓ | – |
| Payments (record / remove) | ✓ | – | – |
| Settings read | ✓ | ✓ | – |
| Settings write | ✓ | – | – |
| Dashboard, Occupancy | ✓ | ✓ | – |
| Billing | ✓ | – | – |
| Uploads | ✓ | – | – |
| Questionnaires: submit (`POST /questionnaires`) | public | public | public |
| Questionnaires: read | ✓ | ✓ | – |
| Questionnaires: update | ✓ | – | – |

- No/invalid token → **401** `UNAUTHORIZED`. Wrong role → **403** `FORBIDDEN`.
- `inactive` users cannot log in and their tokens must be rejected (401).

---

## 5. Error codes

| HTTP | code | When | `details` |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | missing/expired/invalid access token, or user inactive | – |
| 401 | `INVALID_CREDENTIALS` | wrong email or password | – |
| 401 | `INVALID_TOKEN` | refresh token invalid/expired/revoked | – |
| 403 | `FORBIDDEN` | role not allowed | – |
| 403 | `ACCOUNT_INACTIVE` | login with an inactive account | – |
| 404 | `NOT_FOUND` | resource id doesn't exist (message: `"Dog not found"`, `"Booking not found"`, `"Payment not found"`, `"User not found"`) | – |
| 404 | `ROUTE_NOT_FOUND` | unknown path | – |
| 405 | `METHOD_NOT_ALLOWED` | known path, wrong method | – |
| 422 | `VALIDATION_ERROR` | bad/missing input (see each endpoint) | optional `{ field }` |
| 422 | `EMAIL_TAKEN` | register with an existing email | – |
| 422 | `DOG_ALREADY_BOOKED` | dog has an overlapping open stay | `{ bookingId }` |
| 422 | `CAPACITY_FULL` | stay would exceed capacity at some moment / check-in when full | `{ peak, capacity }` (create/edit) |
| 422 | `INVALID_STATE` | status transition or edit not allowed from current status | – |
| 422 | `HAS_OPEN_BOOKINGS` | archiving a dog that has open stays | – |
| 422 | `OVERPAYMENT` | payment larger than balance due | `{ balanceDue }` |
| 422 | `CAPACITY_BELOW_OCCUPANCY` | capacity set below dogs checked in now | `{ checkedIn }` |
| 429 | `RATE_LIMITED` | too many login attempts | – |
| 500 | `INTERNAL_ERROR` | unexpected (never leak stack traces) | – |

Use the **exact messages** shown in this spec where given — the app displays them.

---

## 6. Data models (MongoDB)

All collections use `timestamps: true` (`createdAt`, `updatedAt`). JSON output transforms `_id → id`
and removes `__v` and secrets.

### 6.1 `users`
| Field | Type | Rules |
|---|---|---|
| name | string | required, trimmed, 1–100 |
| email | string | required, unique, lowercase, trimmed, valid email |
| passwordHash | string | required, bcrypt; **never returned** |
| role | enum `admin`\|`staff`\|`user` | default `user` |
| phone | string \| null | optional |
| avatarUrl | string \| null | optional |
| status | enum `active`\|`inactive` | default `active` |
| tokenVersion | number | default 0; increment to revoke all refresh tokens (logout-all / deactivate) |

Indexes: `{ email: 1 }` unique, `{ role: 1, status: 1 }`.

**User JSON:**
```json
{ "id": "6742…", "name": "Kush", "email": "kush@pawsnplay.com", "role": "admin",
  "phone": "+91 98100 00001", "avatarUrl": null, "status": "active", "createdAt": "2026-01-05T09:00:00.000Z" }
```

### 6.2 `dogs`
| Field | Type | Rules / default |
|---|---|---|
| name | string | **required**, trimmed, 1–60 |
| breed | string | default `""` |
| gender | enum `male`\|`female` | default `male` |
| dateOfBirth | string `YYYY-MM-DD` \| null | default null |
| weightKg | number \| null | > 0 if set |
| color | string | default `""` |
| ownerId | ObjectId → users \| null | default null (customer link, future) |
| ownerName | string | **required**, trimmed |
| ownerPhone | string | **required**, trimmed |
| vaccinated | boolean | default false |
| vaccinationExpiry | string `YYYY-MM-DD` \| null | default null |
| neutered | boolean | default false |
| temperament | enum `friendly`\|`shy`\|`reactive` | default `friendly` |
| feedingNotes | string | default `""` |
| medicalNotes | string | default `""` |
| notes | string | default `""` |
| photoUrl | string \| null | default null |
| documents | [DogDocument] | default `[]`, max 10 |
| status | enum `active`\|`archived` | default `active` (soft delete) |

**DogDocument (embedded):**
| Field | Type | Rules |
|---|---|---|
| id | string (sub-doc `_id`) | the app may send its own temporary id; server may keep it or replace it |
| kind | enum `vaccination`\|`other` | default `vaccination` |
| name | string | required (original file name) |
| uri | string | required — URL returned by `POST /uploads` |
| mimeType | string | must match `^image/` or `application/pdf` |
| size | number \| null | bytes, ≤ 10 485 760 (10 MB) |
| uploadedAt | ISO date | |

Indexes: `{ status: 1, name: 1 }`, `{ ownerId: 1 }`, text or regex search on `name, breed, ownerName, ownerPhone`.

**Dog JSON:**
```json
{
  "id": "d_001", "name": "Bruno", "breed": "Labrador Retriever", "gender": "male",
  "dateOfBirth": "2022-05-14", "weightKg": 28.5, "color": "Golden",
  "ownerId": null, "ownerName": "Priya Sharma", "ownerPhone": "+91 98100 00002",
  "vaccinated": true, "vaccinationExpiry": "2027-03-10", "neutered": true, "temperament": "friendly",
  "feedingNotes": "2 cups kibble, twice a day. No chicken.", "medicalNotes": "Allergic to chicken.", "notes": "",
  "photoUrl": null,
  "documents": [
    { "id": "doc_1", "kind": "vaccination", "name": "card.pdf", "uri": "https://cdn…/card.pdf",
      "mimeType": "application/pdf", "size": 240000, "uploadedAt": "2026-11-23T10:00:00.000Z" }
  ],
  "status": "active", "createdAt": "2026-09-01T04:30:00.000Z", "updatedAt": "2026-09-01T04:30:00.000Z"
}
```

### 6.3 `bookings`
| Field | Type | Rules / default |
|---|---|---|
| dogId | ObjectId → dogs | required |
| checkIn | Date (UTC) | required |
| checkOut | Date (UTC) | required, > checkIn |
| status | enum `pending`\|`confirmed`\|`checked_in`\|`checked_out`\|`cancelled` | admin create → `confirmed` |
| kennel | string \| null | optional, e.g. `"K-04"` |
| nights | number | **server-computed** (§8.3) |
| pricePerNight | number | ≥ 0; default `settings.pricePerNight` |
| totalAmount | number | **server-computed** = nights × pricePerNight |
| currency | string | from settings at creation (`"INR"`) |
| notes | string | default `""` |
| source | enum `admin`\|`app` | `admin` for these endpoints |
| createdBy | ObjectId → users | the admin who created it |
| payments | [Payment] | default `[]` |

**Payment (embedded):**
| Field | Type | Rules |
|---|---|---|
| id | sub-doc `_id` | |
| amount | number | > 0 (always positive) |
| type | enum `advance`\|`payment`\|`refund` | |
| method | enum `cash`\|`upi`\|`card`\|`bank` | |
| note | string | default `""`, trimmed |
| receivedAt | Date | default now |
| recordedBy | ObjectId → users | |

Indexes: `{ checkIn: 1, checkOut: 1 }`, `{ status: 1, checkIn: 1 }`, `{ dogId: 1, checkIn: -1 }`, `{ "payments.receivedAt": 1 }`.

**Derived fields — computed on every response, NOT stored** (§8.5):
`dog` (summary join), `amountPaid`, `balanceDue`, `paymentStatus`.

**Booking JSON (every booking response uses this exact shape):**
```json
{
  "id": "b_004", "dogId": "d_002",
  "dog": { "id": "d_002", "name": "Simba", "breed": "Golden Retriever", "ownerName": "Rohan Mehta", "ownerPhone": "+91 98100 00003" },
  "checkIn": "2026-11-19T04:30:00.000Z", "checkOut": "2026-11-26T12:30:00.000Z",
  "status": "checked_in", "kennel": "K-02",
  "nights": 7, "pricePerNight": 1200, "totalAmount": 8400, "currency": "INR",
  "notes": "Pick-up by owner's brother.", "source": "admin", "createdBy": "u_001",
  "createdAt": "2026-10-01T03:30:00.000Z", "updatedAt": "2026-10-01T03:30:00.000Z",
  "payments": [
    { "id": "p_007", "amount": 3000, "type": "advance", "method": "upi", "note": "Advance",
      "receivedAt": "2026-11-16T04:30:00.000Z", "recordedBy": "u_001" }
  ],
  "amountPaid": 3000, "balanceDue": 5400, "paymentStatus": "partial"
}
```
`dog` is `null` only if the dog document no longer exists (should not happen — dogs are soft-deleted).

### 6.4 `settings` (single document)
| Field | Type | Default | Rules |
|---|---|---|---|
| facilityName | string | `"Paws N' Play Boarding"` | non-empty |
| capacity | integer | 15 | 1..500, ≥ dogs currently checked in |
| defaultCheckInTime | `HH:mm` | `"10:00"` | `^([01]\d\|2[0-3]):[0-5]\d$` |
| defaultCheckOutTime | `HH:mm` | `"18:00"` | same |
| pricePerNight | number | 1200 | ≥ 0 |
| currency | string | `"INR"` | read-only via API |
| timezone | IANA tz | `"Asia/Kolkata"` | read-only via API |

**Settings JSON:** exactly the fields above (no id needed).

### 6.5 `refreshTokens` (optional, recommended)
`{ userId, tokenHash, expiresAt, revokedAt, userAgent }` — enables logout and rotation. TTL index on `expiresAt`.

---

## 7. Endpoints

Notation: **Roles** = who may call. "Booking" in responses = the Booking JSON in §6.3.

### 7.1 Health
#### `GET /health` — public
`200 { "data": { "status": "ok", "time": "<ISO>" } }` (also checks DB ping).

### 7.2 Auth

#### `POST /auth/login` — public
Body: `{ "email": string, "password": string }` (email case-insensitive).
- Unknown email or wrong password → **401** `INVALID_CREDENTIALS` · `"Email or password is incorrect."`
- User `inactive` → **403** `ACCOUNT_INACTIVE` · `"This account is inactive. Contact support."`
- Rate limit: 10 attempts / 15 min / IP+email → 429.

`200`:
```json
{ "data": { "accessToken": "<jwt>", "refreshToken": "<jwt>", "user": { /* User JSON */ } } }
```

#### `POST /auth/register` — public
Body: `{ "name", "email", "password", "phone"? }`. Creates role `user`.
- Missing name/email/password → 422 `VALIDATION_ERROR` · `"Name, email and password are required."`
- Password < 8 chars → 422 `VALIDATION_ERROR`.
- Email exists → 422 `EMAIL_TAKEN` · `"This email is already registered."`

`201` same shape as login.

#### `POST /auth/refresh` — public
Body: `{ "refreshToken": string }`.
- Invalid/expired/revoked, or user inactive → **401** `INVALID_TOKEN` · `"Session expired."`

`200 { "data": { "accessToken": "<jwt>" } }` (optionally also a rotated `refreshToken`; the app ignores extra fields).

#### `POST /auth/logout` — any authenticated
Revoke the current refresh token (body may include `{ refreshToken }`; if absent, revoke all for the user).
`200 { "data": { "success": true } }`

#### `GET /me` — any authenticated
`200 { "data": User }`

#### `PATCH /me` — any authenticated
Body (all optional): `name`, `phone`, `avatarUrl`. Ignore anything else (no role/email change here).
`200 { "data": User }`

### 7.3 Users (admin)

#### `GET /users`
Query: `role` (`admin|staff|user`), `status` (`active|inactive`), `search` (case-insensitive substring of name or email), `page`, `limit`.
`200` list of User.

#### `GET /users/:id` → `200 { data: User }` · 404 `"User not found"`

#### `PATCH /users/:id`
Body: `role?` (`admin|staff|user`), `status?` (`active|inactive`).
Invalid values → 422 `"Invalid role."` / `"Invalid status."`. Deactivating a user should revoke their tokens (bump `tokenVersion`).
`200 { data: User }`

### 7.4 Dogs

#### `GET /dogs` — admin, staff
Query:
- `status`: `active` (**default**) | `archived` | `all`
- `search`: case-insensitive substring match on `name`, `breed`, `ownerName`, `ownerPhone` (escape regex)
- `page`, `limit`

Sorted by `name` ascending. `200` list of Dog.

#### `GET /dogs/:id` — admin, staff → `200 { data: Dog }` · 404 `"Dog not found"`

#### `POST /dogs` — admin
Body: any Dog fields from §6.2 except `id`, `status` (optional), timestamps. Accepted keys:
`name, breed, gender, dateOfBirth, weightKg, color, ownerId, ownerName, ownerPhone, vaccinated, vaccinationExpiry, neutered, temperament, feedingNotes, medicalNotes, notes, photoUrl, status, documents`.
Validation (422 `VALIDATION_ERROR`):
- `"Dog name is required."` · `"Owner name is required."` · `"Owner phone is required."`
- `"Invalid gender."` · `"Invalid temperament."` · `"Invalid status."`
- documents: `"Up to 10 documents per dog."` · `"Documents must be images or PDFs."` · `"<name> is larger than 10 MB."`

Apply defaults for missing fields. `201 { data: Dog }`

#### `PATCH /dogs/:id` — admin
Partial update with the same keys and validation (required-field checks apply only to fields that are sent).
- `status: "archived"` while the dog has any booking with status `pending|confirmed|checked_in` →
  422 `HAS_OPEN_BOOKINGS` · `"<Dog name> has upcoming or active bookings. Cancel or finish them first."`
- `documents` replaces the whole array (the app sends the full list).

`200 { data: Dog }`

> There is **no DELETE** for dogs — archive instead.

### 7.5 Bookings

#### `GET /bookings` — admin, staff
Query (all optional, combinable):
| Param | Meaning |
|---|---|
| `from`, `to` | ISO datetimes; return stays that **overlap** `[from, to)`: `checkIn < to AND checkOut > from`. Missing `from` = −∞, missing `to` = +∞ |
| `status` | exact booking status |
| `dogId` | only this dog's bookings (used for full dog history — no date range) |
| `paymentStatus` | `unpaid`\|`partial`\|`paid`\|`overpaid`, or `due` = `balanceDue > 0` |
| `page`, `limit` | pagination |

Sorted by `checkIn` ascending. Each item = Booking JSON (with `dog` join and derived money fields).
`paymentStatus` filtering is on derived values — compute in an aggregation pipeline or after fetch.

#### `GET /bookings/:id` — admin, staff → `200 { data: Booking }` · 404 `"Booking not found"`

#### `POST /bookings` — admin
Body:
```json
{ "dogId": "d_009", "checkIn": "2026-12-15T04:30:00.000Z", "checkOut": "2026-12-17T12:30:00.000Z",
  "kennel": "K-04", "pricePerNight": 1200, "notes": "Late drop-off" }
```
`kennel`, `pricePerNight` (default `settings.pricePerNight`), `notes` optional.
Validation, **in this order** (§8.1, §8.2):
1. Dog missing → 422 `VALIDATION_ERROR` · `"Choose a dog."`
2. Dog archived → 422 `VALIDATION_ERROR` · `"<Dog name> is archived."`
3. Invalid dates → 422 `"Enter check-in and check-out date and time."`
4. `checkOut <= checkIn` → 422 `"Check-out must be after check-in."`
5. Same dog has an overlapping **open** stay (`pending|confirmed|checked_in`) → 422 `DOG_ALREADY_BOOKED` · `"<Dog name> already has a booking in these dates."` · `details.bookingId`
6. Peak occupancy in `[checkIn, checkOut)` ≥ capacity → 422 `CAPACITY_FULL` · `"Boarding is full (<capacity> dogs) for part of these dates."` · `details { peak, capacity }`
7. `pricePerNight < 0` / NaN → 422 `"Price per night must be a positive number."`

Then: `status = "confirmed"`, `nights` (§8.3), `totalAmount = nights × pricePerNight`, `currency = settings.currency`,
`source = "admin"`, `createdBy = current user`, `payments = []`.
Run steps 5–6 and the insert in a **transaction / lock** (§8.2 concurrency). `201 { data: Booking }`

#### `PATCH /bookings/:id` — admin
Body (all optional): `dogId`, `checkIn`, `checkOut`, `kennel`, `pricePerNight`, `notes`.
- Booking `checked_out` or `cancelled` → 422 `INVALID_STATE` · `"Booking is already checked out."` / `"Booking is already cancelled."`
- Booking `checked_in` and `dogId` changes → 422 `INVALID_STATE` · `"Cannot change the dog after check-in."`
- Re-run the same validation as create on the merged values, **ignoring this booking** in overlap and capacity checks.
- Recompute `nights` and `totalAmount`. `kennel: ""` or `null` clears it.

`200 { data: Booking }` (may become `overpaid` if the total drops below what was paid — that's allowed).

#### `PATCH /bookings/:id/status` — admin, staff
Body: `{ "status": "confirmed" | "checked_in" | "checked_out" | "cancelled" }`
Allowed transitions (anything else → 422 `INVALID_STATE` · `"Cannot change a <current> booking to <next>."`, statuses written with spaces, e.g. `checked in`):
```
pending    -> confirmed | cancelled
confirmed  -> checked_in | cancelled
checked_in -> checked_out
checked_out, cancelled -> (none)
```
- `checked_in` when the number of bookings currently `checked_in` ≥ capacity → 422 `CAPACITY_FULL` · `"Boarding is full (<capacity> dogs checked in)."`
- (Recommended) append `{ status, at, by }` to a `statusHistory` array for audit.

`200 { data: Booking }`

> There is **no DELETE** for bookings — cancel instead.

### 7.6 Payments (embedded in bookings)

#### `POST /bookings/:id/payments` — admin
Body:
```json
{ "amount": 1800, "type": "advance", "method": "upi", "note": "50%", "receivedAt": "2026-11-24T05:00:00.000Z" }
```
Defaults: `type = "payment"`, `method = "cash"`, `note = ""`, `receivedAt = now`.
Validation (422):
- `amount` not > 0 → `VALIDATION_ERROR` · `"Enter an amount above 0."`
- bad type → `"Invalid payment type."` · bad method → `"Invalid payment method."`
- `type = refund` and `amount > amountPaid` → `VALIDATION_ERROR` · `"Refund can't be more than the ₹<amountPaid> received."`
- `type ≠ refund` and booking `cancelled` → `INVALID_STATE` · `"This booking is cancelled - record a refund instead."`
- `type ≠ refund` and `amount > balanceDue` → `OVERPAYMENT` · `"Only ₹<max(0,balanceDue)> is due on this booking."` · `details.balanceDue`
- invalid `receivedAt` → `"Invalid payment date."`

Push payment with `recordedBy = current user`. **`201 { data: Booking }`** (the full updated booking).

#### `DELETE /bookings/:id/payments/:paymentId` — admin
Removes a payment entered by mistake. 404 `"Booking not found"` / `"Payment not found"`.
`200 { data: Booking }`. (Recommended: soft-delete with `removedAt/removedBy` for audit, excluded from totals.)

### 7.7 Settings

#### `GET /settings` — admin, staff → `200 { data: Settings }`

#### `PATCH /settings` — admin
Body (all optional): `capacity`, `pricePerNight`, `defaultCheckInTime`, `defaultCheckOutTime`, `facilityName`.
(`currency`, `timezone` are not editable via API — ignore if sent.)
Validation (422):
- capacity not an integer 1..500 → `VALIDATION_ERROR` · `"Capacity must be a whole number between 1 and 500."`
- capacity < bookings currently `checked_in` → `CAPACITY_BELOW_OCCUPANCY` · `"<n> dogs are checked in right now. Capacity can't be lower than that."` · `details.checkedIn`
- pricePerNight < 0 → `"Price per night must be 0 or more."`
- times not `HH:mm` → `"Check-in time must be HH:mm."` / `"Check-out time must be HH:mm."`
- empty facilityName → `"Facility name is required."`

Lowering capacity below **future** bookings is allowed (those days just show as full). `200 { data: Settings }`

### 7.8 Dashboard

#### `GET /admin/dashboard` — admin, staff
All "today/month" boundaries in the facility timezone. `now` = server time.
```json
{
  "data": {
    "capacity": 15,
    "occupiedNow": 7,
    "availableNow": 8,
    "todayCheckIns":  [ /* Booking */ ],
    "todayCheckOuts": [ /* Booking */ ],
    "upcoming":       [ /* Booking */ ],
    "occupancyNext7Days": [ { "date": "2026-11-23", "count": 7 }, … 7 items ],
    "activeDogs": 12,
    "bookingsThisMonth": 12,
    "paymentsDue": 57000,
    "paymentsDueBookings": 12
  }
}
```
| Field | Definition |
|---|---|
| occupiedNow | count of bookings with status `checked_in` |
| availableNow | `max(0, capacity − occupiedNow)` |
| todayCheckIns | status ∈ {confirmed, checked_in, checked_out} and `checkIn` within today; sorted by checkIn |
| todayCheckOuts | status ∈ {checked_in, checked_out} and `checkOut` within today; sorted by checkOut |
| upcoming | status `confirmed` and `now ≤ checkIn < now + 7 days`; sorted by checkIn |
| occupancyNext7Days | for today + next 6 days: `{ date, count: dayStats(date).occupied }` (§8.6) |
| activeDogs | dogs with status `active` |
| bookingsThisMonth | non-cancelled bookings overlapping the current calendar month |
| paymentsDue / paymentsDueBookings | over non-cancelled bookings with `balanceDue > 0`: sum of balanceDue / count |

### 7.9 Occupancy calendar

#### `GET /admin/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD` — admin, staff
Local (facility-tz) dates, `to` **exclusive**, max 62 days.
Invalid/missing or `to <= from` → 422 `VALIDATION_ERROR` · `"from and to must be YYYY-MM-DD with to after from."`
```json
{
  "data": {
    "capacity": 15,
    "days": [
      { "date": "2026-11-01", "occupied": 0, "available": 15, "checkIns": 0, "checkOuts": 0 },
      { "date": "2026-11-23", "occupied": 7, "available": 8,  "checkIns": 2, "checkOuts": 1 }
    ]
  }
}
```
One entry per day in range, in order. Definition in §8.6.

### 7.10 Billing

#### `GET /admin/billing?from=<ISO>&to=<ISO>` — admin
Any period (the app sends this/next/last week Mon–Sun, a calendar month, or custom dates).
```json
{
  "data": {
    "from": "2026-10-31T18:30:00.000Z", "to": "2026-11-30T18:30:00.000Z", "currency": "INR",
    "bookings": 12, "expected": 68400, "received": 30800, "due": 37600, "advances": 28400,
    "paidCount": 3, "partialCount": 6, "unpaidCount": 3,
    "outstandingAllTime": 57000, "outstandingBookings": 12,
    "collected": 34200, "collectedCount": 13
  }
}
```
Definitions in §8.7. `from`/`to` echo the query (null if omitted).

### 7.11 Uploads

#### `POST /uploads` — admin · `multipart/form-data`, field `file`
- Allowed MIME: `image/*`, `application/pdf`; max 10 MB → else 422 `VALIDATION_ERROR` (`"Documents must be images or PDFs."` / `"<name> is larger than 10 MB."`).
- Store in S3/Cloudinary under `dogs/<yyyy>/<mm>/<uuid>-<safeName>`; return a URL the app can display
  (public-read CDN URL, or a long-lived signed URL; if signed, also add `GET /uploads/:key` that redirects to a fresh signed URL).

`201`:
```json
{ "data": { "url": "https://cdn…/dogs/2026/11/uuid-card.pdf", "name": "card.pdf", "mimeType": "application/pdf", "size": 240000 } }
```
The app then saves `{ kind, name, uri: url, mimeType, size, uploadedAt }` into `dog.documents` via `PATCH /dogs/:id`
(or inside `POST /dogs`). In the app, `src/lib/attachments.ts → uploadAttachment()` is the single place that will call this.

### 7.12 Questionnaires ("Know Your Dog")

> The form screen lives in the app (public route `/know-your-dog`, no login) and posts here. It follows the
> "Paws N Play: Know Your Dog Questionnaire" (Nov 2026, 9 sections). Admins read submissions in the app at
> `/admin/forms` (list) and `/admin/forms/[id]` (detail). The detail is **read-only** (the dog parent fills it) and is
> loaded with **one call**, `GET /questionnaires/:id`; the only action is **Mark reviewed** (`PATCH` status).

#### `POST /questionnaires` - public (no auth) · `multipart/form-data`
| Field | Content |
|---|---|
| `answers` | JSON string of a flat object (see below) |
| `website` | honeypot - real users leave it empty. If it is non-empty the server answers `201` with a fake id and stores nothing |
| `documents` | 0-5 files, `image/*` (not SVG) or `application/pdf`, max 10 MB each |

`answers` keys (whitelisted; unknown keys are dropped; strings are trimmed, empty optional answers removed; max length per
field 40-2000 characters as on the page):
- **Required:** `ownerName`, `ownerPhone`, `emergencyName`, `emergencyPhone`, `dogName`, `breed`, `age`,
  `sex` (`male|female`), `sterilised` (`yes|no`), `signName`, `confirmTrue` (must be `true`).
  Phones: 7-20 characters of digits, `+`, `-`, spaces.
- **Optional text**, by section of the form:
  - About your dog: `weight, heatInfo` · contact: `address`
  - Health: `tickFlea, skinIssues, recentIllness, conditions, medication, allergies, vet`
  - Food: `homeDiet, avoidFoods, eatingStyle`
  - With other dogs and with people: `otherDogs, withPeople, fightHistory, biteHistory, boardingBefore`
  - Triggers and quirks: `foodGuarding, toyGuarding, placeGuarding, noiseFear, aloneBehaviour, handlingDislikes,
    escapeRisk, barking, eatsObjects, calmingTips`
  - Routine: `sleep, toilet, exercise, anythingElse`
  - Your requests for this stay: `trialVisit, specialFood, sendingItems`
- **Optional yes/no:** `standardMealOk` (Food); `keepSeparate, extraMeal` (extra ₹150 per meal), `ownBowls`,
  `bath` (extra ₹750) (Your requests for this stay). **Dates** (`YYYY-MM-DD`): `rabiesDate, comboVaccineDate,
  dewormingDate, signDate`.
- **Earlier form (before Nov 2026):** `with_<key>` / `with_<key>_note` ratings and `breedsDislike` are no longer
  accepted (dropped like any unknown key). Stored submissions keep them; the app shows them under "Earlier form answers".

Errors (422 `VALIDATION_ERROR`, message shown on the page), e.g. `"Please enter your name."`,
`"Please enter a valid phone number for you."`, `"Please choose your dog's sex."`,
`"Please confirm that your answers are true."`, `"<file> is not a photo or PDF."`, `"<file> is bigger than 10 MB."`,
`"You can add up to 5 files."`. Rate limit per IP: 5 / hour and 20 / day (`QUESTIONNAIRE_RATE_PER_HOUR` / `_PER_DAY`) -> 429.

Files are stored with the uploads provider under `questionnaires/<yyyy>/<mm>/<uuid>-<safeName>`.
No raw IP is stored (HMAC-SHA256 only); the user agent is kept (truncated) for spam review but never returned.

`201 { "data": { "id": "...", "createdAt": "<ISO>" } }`

#### `GET /questionnaires` - admin, staff
Query: `status` (`new|reviewed|archived`), `search` (case-insensitive substring of dog name, owner name or owner phone),
`page`, `limit`. Newest first. List item:
```json
{ "id": "...", "status": "new", "createdAt": "<ISO>", "dogName": "Kaju", "breed": "Indie",
  "ownerName": "Asha Rao", "ownerPhone": "+91 98765 43210", "documentsCount": 1 }
```

#### `GET /questionnaires/:id` - admin, staff -> `200 { data: Questionnaire }` · 404 `"Questionnaire not found"`
```json
{ "id": "...", "status": "new", "answers": { "dogName": "Kaju", "...": "..." },
  "documents": [ { "id": "...", "name": "vaccines.pdf", "uri": "https://.../uploads/questionnaires/...",
                   "mimeType": "application/pdf", "size": 240000, "uploadedAt": "<ISO>" } ],
  "dogId": null, "reviewedBy": null, "reviewedByName": null, "reviewedAt": null,
  "createdAt": "<ISO>", "updatedAt": "<ISO>" }
```
This one response is the complete submission: every answer, every file and the review info (`reviewedByName` is the
reviewer's name, so the app needs no extra user lookup). The app must not call other endpoints to show a submission.

#### `PATCH /questionnaires/:id` - admin
Body (all optional): `status` (`new|reviewed|archived`; invalid -> `"Invalid status."`), `dogId` (existing dog id, or `null`
to unlink; unknown -> 422 `"Choose an existing dog."`). Moving away from `new` sets `reviewedBy`/`reviewedAt`; moving back
to `new` clears them. `200 { data: Questionnaire }`. The app only sends `{ "status": "reviewed" }` (Mark reviewed);
`dogId` is kept in the API but the app no longer links forms to dog profiles.

---

## 8. Business rules (exact algorithms)

Let `OCCUPYING = {confirmed, checked_in}` and `OPEN = {pending, confirmed, checked_in}`.
Intervals are half-open `[checkIn, checkOut)`. Two stays overlap iff `a.checkIn < b.checkOut && b.checkIn < a.checkOut`.

### 8.1 No double booking
A dog cannot have two `OPEN` stays that overlap. On create/edit, if another (≠ this booking) `OPEN` booking of
the same `dogId` overlaps → `DOG_ALREADY_BOOKED` with `details.bookingId` of the clash.

### 8.2 Capacity check (peak simultaneous occupancy)
```
peakOccupancy(start, end, ignoreId, statuses = OCCUPYING):
  relevant = bookings where id != ignoreId and status in statuses and overlaps([start,end))
  points   = [start] ∪ { b.checkIn for b in relevant if start < b.checkIn < end }
  return max over p in points of count(b in relevant where b.checkIn <= p < b.checkOut)   (0 if none)
```
Reject create/edit if `peakOccupancy(checkIn, checkOut, thisId) >= capacity` (`CAPACITY_FULL`).
A dog leaving at 11:00 and another arriving at 20:00 the same day do **not** both count at once.

**Concurrency:** two admins booking the last kennel at the same time must not both succeed. Do the
overlap + capacity checks and the write inside a MongoDB transaction that also updates a lock field
(e.g. `settings.bookingLockVersion` with `findOneAndUpdate`), or use a per-facility mutex. Retry once on write conflict.

### 8.3 Nights
`nights = max(1, calendarDays(localDate(checkOut) − localDate(checkIn)))` where `localDate` is the date in the
**facility timezone**. Examples (IST): 25 Nov 10:00 → 28 Nov 18:00 = 3; 23 Nov 08:30 → 23 Nov 18:00 = 1.
`totalAmount = nights × pricePerNight`.

### 8.4 Status machine
See §7.5 (`PATCH /bookings/:id/status`). Edits (`PATCH /bookings/:id`) only for `confirmed`/`checked_in`
(also allow `pending`); dog locked once `checked_in`.

### 8.5 Money (derived on every booking response)
```
amountPaid    = Σ amount where type in {advance, payment}  −  Σ amount where type = refund
owed          = status == cancelled ? 0 : totalAmount
balanceDue    = owed − amountPaid                 (negative ⇒ money to refund)
paymentStatus = balanceDue < 0            → "overpaid"
                owed == 0 or balanceDue == 0 → "paid"
                amountPaid > 0            → "partial"
                else                      → "unpaid"
```

### 8.6 Occupancy per day (`dayStats(date)`)
For local day `D` (facility tz) = `[startOfDay(D), startOfDay(D+1))`:
- `statuses = D is entirely before today ? OCCUPYING ∪ {checked_out} : OCCUPYING` (history stays accurate)
- `occupied = peakOccupancy(dayStart, dayEnd, none, statuses)`
- `available = max(0, capacity − occupied)`
- `checkIns` / `checkOuts` = count of bookings with those `statuses` whose `checkIn` / `checkOut` falls within the day.

### 8.7 Billing for `[from, to)`
- `inRange` = non-cancelled bookings with `from ≤ checkIn < to` (grouped by **check-in date**).
- `bookings = |inRange|`, `expected = Σ totalAmount`, `received = Σ amountPaid`, `due = Σ max(0, balanceDue)`,
  `advances = Σ advance payment amounts`.
- `paidCount` = paymentStatus ∈ {paid, overpaid}; `partialCount`; `unpaidCount`.
- `outstandingAllTime` / `outstandingBookings` = over **all** non-cancelled bookings with `balanceDue > 0`: Σ balanceDue / count.
- `collected` = Σ over **all bookings' payments** with `from ≤ receivedAt < to` of (refund ? −amount : amount);
  `collectedCount` = number of such payments. (Cash flow — independent of check-in dates, includes cancelled bookings' refunds.)

### 8.8 Dogs
- Archive blocked while any `OPEN` booking exists (`HAS_OPEN_BOOKINGS`). No hard delete.
- Archived dogs cannot be used for **new** bookings (`"<name> is archived."`) but remain in history.

---

## 9. Auth & security

- Passwords: bcrypt cost 12. Min length 8 on register.
- **Access token** JWT (HS256): `{ sub: userId, role, tv: tokenVersion }`, TTL 15 min.
- **Refresh token** JWT: `{ sub, tv, jti }`, TTL 30 days, stored hashed in `refreshTokens`; reject if revoked,
  expired, or `tv` ≠ user.tokenVersion. Rotation on refresh is recommended.
- On every request, load the user (or cache briefly) and reject if `inactive` or `tv` mismatch → 401 `UNAUTHORIZED`.
- The app: on 401 it will try `POST /auth/refresh` once (TODO in client), else logs out.
- helmet; CORS from `CORS_ORIGINS`; JSON body limit 1 MB; upload limit 10 MB; rate-limit `/auth/login` & `/auth/register`.
- Validate & sanitize all input with Zod; escape regex in `search`; never trust client-computed `nights`, `totalAmount`, `amountPaid`, etc.
- Log with request id; never log passwords or tokens.

---

## 10. Seed data

Copy these files from the app repo (`kushdevui/PawsNPlayRender/mock/data/`) into `src/seed/data/`:
`users.json`, `dogs.json`, `bookings.json`, `settings.json`. The seed script must:
1. Drop Phase 1 collections (dev only; refuse if `NODE_ENV=production`).
2. Insert users with `passwordHash = bcrypt(password)` (seed passwords are `password123`).
3. Map mock string ids (`u_001`, `d_001`, `b_001`, `p_001`) to new ObjectIds and rewrite references
   (`dogId`, `createdBy`, `recordedBy`). Keep a lookup table so relationships stay intact.
4. Insert settings as the single settings document.

Seed logins (all `password123`):
| Name | Email | Role |
|---|---|---|
| Kush | kush@pawsnplay.com | admin |
| Divya | divya@pawsnplay.com | admin |
| Shreya | shreya@pawsnplay.com | admin |
| Neha Kapoor | neha.staff@pawsnplay.com | staff |
| Vikram Singh | vikram.staff@pawsnplay.com | staff |
| Priya Sharma | priya@example.com | user |
| Ananya Iyer | ananya@example.com | user (inactive — login must fail with 403) |

Seed bookings are dated around 23 Nov 2026; for a lively dashboard on other dates, offer `seed --shift-to-today`
that shifts all booking and payment dates by (today − 2026-11-23) days.

---

## 11. Acceptance tests

Implement as automated API tests (supertest + in-memory Mongo, facility tz `Asia/Kolkata`). Each line = one test.

**Auth**
- Login Kush/password123 → 200, `user.role = admin`, tokens present.
- Wrong password → 401 `INVALID_CREDENTIALS`. Ananya (inactive) → 403 `ACCOUNT_INACTIVE`.
- `GET /me` without token → 401 `UNAUTHORIZED`. As `user` role, `GET /dogs` → 403 `FORBIDDEN`.
- Refresh with valid token → new access token; after logout → 401 `INVALID_TOKEN`.

**Dogs**
- `GET /dogs?search=lab` → only Labrador(s); default excludes archived; `status=all` includes them.
- `POST /dogs` without ownerName → 422 `"Owner name is required."`; valid → 201 with defaults (`documents: []`, `status: active`).
- Archive a dog with a `confirmed` booking → 422 `HAS_OPEN_BOOKINGS`.
- `documents` with `application/zip` → 422; with size 20 MB → 422.

**Bookings**
- Create 10 Dec 10:00 → 13 Dec 18:00 at 1200 → 201, `nights 3`, `totalAmount 3600`, `status confirmed`, `paymentStatus unpaid`.
- Same dog, overlapping 12–14 Dec → 422 `DOG_ALREADY_BOOKED` with `details.bookingId`.
- `checkOut <= checkIn` → 422 `"Check-out must be after check-in."`
- Fill capacity: set capacity = current peak for a window, then create one more stay in it → 422 `CAPACITY_FULL` with `{ peak, capacity }`.
- Back-to-back same-day stays (A leaves 11:00, B arrives 20:00) with capacity 1 → both allowed.
- Status: confirmed → checked_in → checked_out ✓; checked_in → cancelled → 422 `INVALID_STATE`; editing a checked_out booking → 422.
- Changing dog after check-in → 422 `"Cannot change the dog after check-in."`
- `GET /bookings?from&to` returns stays **overlapping** the range (a 28 Nov–3 Dec stay appears in both Nov and Dec).
- `GET /bookings?paymentStatus=due` returns only `balanceDue > 0`.

**Payments**
- Advance 1800 on a 3600 booking → 201, `amountPaid 1800`, `balanceDue 1800`, `partial`.
- Payment 5000 → 422 `OVERPAYMENT` (`details.balanceDue 1800`). Payment 1800 → `paid`.
- Refund > amountPaid → 422. Payment on cancelled booking → 422 `INVALID_STATE`; refund allowed.
- DELETE a payment → totals recomputed.

**Settings / capacity**
- Capacity 5 while 7 checked in → 422 `CAPACITY_BELOW_OCCUPANCY` (`details.checkedIn 7`). Capacity 20 → 200; dashboard `availableNow` updates.
- `defaultCheckInTime: "25:00"` → 422.

**Dashboard / occupancy / billing** (with seed data and "now" fixed to 2026-11-23 19:30 IST)
- Dashboard: `capacity 15`, `occupiedNow 7`, `availableNow 8`, `activeDogs 12`, `bookingsThisMonth 12`, `paymentsDue 57000` across `12` bookings.
- Occupancy 2026-11-01..2026-12-01 → 30 days; 23 Nov `occupied 7, available 8, checkIns 2, checkOuts 1` (Oscar leaves 18:00 before Bruno arrives 20:00), cancelled stays never counted.
- Billing for November (IST month) → `bookings 12, expected 68400, received 30800, due 37600, advances 28400, paidCount 3, partialCount 6, unpaidCount 3, collected 34200 (13 payments)`.
- Billing week Mon 23 Nov–Mon 30 Nov → `bookings 5, expected 26400`.

---

## 12. Connecting the mobile app

In the app repo (`.env` or EAS profile env):
```
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_API_URL=https://<host>/api/v1        # on a phone in dev use your LAN IP, not localhost
```
The app's axios client sends `Authorization: Bearer <accessToken>`, expects the envelopes above, and shows
`error.message`. No other client change is needed except wiring `uploadAttachment()` to `POST /uploads`.

---

## 13. Route summary

| # | Method | Path | Roles | Success |
|---|---|---|---|---|
| 1 | GET | /health | public | 200 |
| 2 | POST | /auth/login | public | 200 AuthResponse |
| 3 | POST | /auth/register | public | 201 AuthResponse |
| 4 | POST | /auth/refresh | public | 200 { accessToken } |
| 5 | POST | /auth/logout | any | 200 { success } |
| 6 | GET | /me | any | 200 User |
| 7 | PATCH | /me | any | 200 User |
| 8 | GET | /users | admin | 200 List<User> |
| 9 | GET | /users/:id | admin | 200 User |
| 10 | PATCH | /users/:id | admin | 200 User |
| 11 | GET | /dogs | admin, staff | 200 List<Dog> |
| 12 | GET | /dogs/:id | admin, staff | 200 Dog |
| 13 | POST | /dogs | admin | 201 Dog |
| 14 | PATCH | /dogs/:id | admin | 200 Dog |
| 15 | GET | /bookings | admin, staff | 200 List<Booking> |
| 16 | GET | /bookings/:id | admin, staff | 200 Booking |
| 17 | POST | /bookings | admin | 201 Booking |
| 18 | PATCH | /bookings/:id | admin | 200 Booking |
| 19 | PATCH | /bookings/:id/status | admin, staff | 200 Booking |
| 20 | POST | /bookings/:id/payments | admin | 201 Booking |
| 21 | DELETE | /bookings/:id/payments/:paymentId | admin | 200 Booking |
| 22 | GET | /settings | admin, staff | 200 Settings |
| 23 | PATCH | /settings | admin | 200 Settings |
| 24 | GET | /admin/dashboard | admin, staff | 200 DashboardStats |
| 25 | GET | /admin/occupancy | admin, staff | 200 OccupancyCalendar |
| 26 | GET | /admin/billing | admin | 200 BillingSummary |
| 27 | POST | /uploads | admin | 201 { url, name, mimeType, size } |
| 28 | POST | /questionnaires | public (rate-limited) | 201 { id, createdAt } |
| 29 | GET | /questionnaires | admin, staff | 200 List<QuestionnaireListItem> |
| 30 | GET | /questionnaires/:id | admin, staff | 200 Questionnaire |
| 31 | PATCH | /questionnaires/:id | admin | 200 Questionnaire |

**Prompt to give the backend agent:**
> Build the Node.js + TypeScript + Express + MongoDB (Mongoose) REST API described in `BACKEND_API_SPEC.md`
> exactly — same paths, envelopes, status codes, error codes, messages and business rules. Use Zod for
> validation, JWT access/refresh auth with bcrypt, Luxon for facility-timezone date logic, and a seed script
> from the provided JSON files. Implement every acceptance test in §11 and make them pass. Include a README
> with setup, env vars, seed and test commands.
