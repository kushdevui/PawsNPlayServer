# API contract (Node REST backend)

Mirrored from PawsNPlayRender (`docs/api-contract.md`). The full machine-readable list is in **`docs/endpoints.json`** (app: `mock/endpoints.json`), and the seed data is in the app's
**`mock/data/*.json`**. The app currently runs against these mocks (`EXPO_PUBLIC_USE_MOCKS=true`).
The Node backend should return exactly these shapes.

Base URL: `EXPO_PUBLIC_API_URL` (e.g. `http://<host>:4000/api/v1`)
Auth header: `Authorization: Bearer <accessToken>`

## Response shapes
- Single: `{ "data": { ... } }`
- List: `{ "data": [ ... ], "meta": { "total": 12, "page": 1, "limit": 20 } }` - `?page=&limit=`
- Error: `{ "error": { "code": "NOT_FOUND", "message": "Booking not found" } }`
  - 401 UNAUTHORIZED / INVALID_CREDENTIALS / INVALID_TOKEN
  - 403 FORBIDDEN / ACCOUNT_INACTIVE
  - 404 NOT_FOUND - also used when a record exists but belongs to someone else
  - 422 VALIDATION_ERROR / EMAIL_TAKEN / INVALID_STATE

## Roles
- `admin` - manages users, services, all bookings and staff assignment; sees the dashboard
- `user` - pet owner: manages their own pets, books services, cancels their own bookings
- `staff` - caretaker/groomer: sees all pets and bookings assigned to them; marks them completed

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | /auth/login | public | `{email,password}` -> `{accessToken,refreshToken,user}` |
| POST | /auth/register | public | creates a `user` role account |
| POST | /auth/refresh | public | `{refreshToken}` -> `{accessToken}` |
| POST | /auth/logout | any | |
| GET | /me | any | current user |
| PATCH | /me | any | name, phone, avatarUrl |
| GET | /users | admin | filters: role, status, search |
| GET | /users/:id | admin | |
| PATCH | /users/:id | admin | change role / status |
| GET | /pets | user, staff, admin | user sees own pets only; filters: species, ownerId |
| GET | /pets/:id | user, staff, admin | |
| POST | /pets | user, admin | |
| PATCH | /pets/:id | user, admin | |
| DELETE | /pets/:id | user, admin | |
| GET | /services | any | non-admins see active services only; filter: category |
| GET | /services/:id | any | |
| POST | /services | admin | |
| PATCH | /services/:id | admin | |
| GET | /bookings | user, staff, admin | user: own, staff: assigned, admin: all; filters: status, from, to |
| GET | /bookings/:id | user, staff, admin | |
| POST | /bookings | user | `{petId,serviceId,startTime,notes?}`; endTime/price set by the server |
| PATCH | /bookings/:id/status | user, staff, admin | user -> cancelled, staff -> completed, admin -> any |
| PATCH | /bookings/:id/assign | admin | `{staffId}` |
| GET | /notifications | any | own only; filter: unread |
| PATCH | /notifications/:id/read | any | |
| GET | /admin/dashboard | admin | counts, bookings by status, revenue, upcoming bookings |

## Booking status flow
`pending` -> `confirmed` (admin) -> `completed` (staff/admin)
`pending`/`confirmed` -> `cancelled` (owner/admin). Completed and cancelled bookings are final.
