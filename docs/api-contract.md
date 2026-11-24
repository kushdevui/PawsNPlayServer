# API contract (Node REST backend)

**Full backend contract for the API team: [`docs/BACKEND_API_SPEC.md`](BACKEND_API_SPEC.md)** (models, every route, rules, seed, acceptance tests).
Machine-readable list: **`mock/endpoints.json`**. Seed data: **`mock/data/*.json`**.
Business rules and MongoDB schemas: **`docs/ARCHITECTURE.md`**.
The app runs against the mock until the backend is ready (`EXPO_PUBLIC_USE_MOCKS=true`).

Base URL: `EXPO_PUBLIC_API_URL` (e.g. `http://<host>:4000/api/v1`) · Auth: `Authorization: Bearer <accessToken>`
Dates: ISO-8601 UTC strings. The app sends/receives UTC and shows local time.

## Response shapes
- Single: `{ "data": { ... } }`
- List: `{ "data": [ ... ], "meta": { "total": 12, "page": 1, "limit": 50 } }`
- Error: `{ "error": { "code": "CAPACITY_FULL", "message": "...", "details": { ... } } }`

| HTTP | code | When |
|---|---|---|
| 401 | UNAUTHORIZED, INVALID_CREDENTIALS, INVALID_TOKEN | not logged in / bad login |
| 403 | FORBIDDEN, ACCOUNT_INACTIVE | role not allowed |
| 404 | NOT_FOUND, ROUTE_NOT_FOUND | |
| 422 | VALIDATION_ERROR | bad input |
| 422 | DOG_ALREADY_BOOKED | dog has an overlapping open stay (`details.bookingId`) |
| 422 | CAPACITY_FULL | peak occupancy in the dates would exceed capacity (`details.peak`, `details.capacity`) |
| 422 | INVALID_STATE | status change / edit not allowed from current status |
| 422 | HAS_OPEN_BOOKINGS | archiving a dog with open stays |
| 422 | OVERPAYMENT | payment larger than the balance due (`details.balanceDue`) |
| 422 | CAPACITY_BELOW_OCCUPANCY | capacity set lower than dogs checked in now |

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | /auth/login | public | `{email,password}` -> `{accessToken,refreshToken,user}` |
| POST | /auth/register | public | creates a `user` (customer) account |
| POST | /auth/refresh | public | `{refreshToken}` -> `{accessToken}` |
| POST | /auth/logout | any | |
| GET / PATCH | /me | any | current user |
| GET | /users | admin | filters: role, status, search |
| GET / PATCH | /users/:id | admin | change role / status |
| GET | /dogs | admin, staff | `search`, `status` = active (default) / archived / all; sorted by name |
| GET | /dogs/:id | admin, staff | |
| POST | /dogs | admin | name, ownerName, ownerPhone required; `documents[]` (images/PDF, ≤10 MB, ≤10) |
| PATCH | /dogs/:id | admin | partial update; `status: archived` blocked while open stays exist |
| GET | /bookings | admin, staff | `from`,`to` (overlap), `status`, `dogId`, `paymentStatus` (`due` = balance > 0); sorted by checkIn; includes `dog` summary and payment totals |
| GET | /bookings/:id | admin, staff | |
| POST | /bookings | admin | `{dogId, checkIn, checkOut, kennel?, pricePerNight?, notes?}` -> status `confirmed` |
| PATCH | /bookings/:id | admin | edit dates/dog/kennel/price/notes (confirmed or checked_in only) |
| PATCH | /bookings/:id/status | admin, staff | check in / check out / cancel (see state machine) |
| POST | /bookings/:id/payments | admin | `{amount, type: advance\|payment\|refund, method: cash\|upi\|card\|bank, note?, receivedAt?}` |
| DELETE | /bookings/:id/payments/:paymentId | admin | remove a mistaken payment |
| GET | /settings | admin, staff | capacity, default times, price |
| PATCH | /settings | admin | capacity (≥ dogs checked in now), pricePerNight, default times, facilityName |
| GET | /admin/dashboard | admin, staff | capacity, occupiedNow, today in/out, next 7 days, upcoming, paymentsDue |
| GET | /admin/occupancy | admin, staff | `from`,`to` = `YYYY-MM-DD`; per day: occupied (peak), available, checkIns, checkOuts |
| GET | /admin/billing | admin | `from`,`to` ISO; stays checking in that range: expected, received, due, advances, counts; `collected` = payments received in the range; outstanding all-time |

## File uploads (Phase 2)
`POST /uploads` multipart `file` (image/* or application/pdf, ≤ 10 MB) -> `{ data: { url, mimeType, size, name } }`.
The app then saves the returned `url` in `dog.documents[].uri`. In mock mode the local file URI is stored instead.

## Booking money fields (derived by server)
- `amountPaid` = Σ advances + payments − refunds
- `balanceDue` = (cancelled ? 0 : totalAmount) − amountPaid (negative = to refund)
- `paymentStatus` = `paid` (balance 0) · `partial` · `unpaid` · `overpaid` (balance < 0)

## Booking status flow
```
pending ──► confirmed ──► checked_in ──► checked_out
   │            │
   └────────────┴──► cancelled
```
`pending` is reserved for future customer-app requests. Admin-created bookings start as `confirmed`.
