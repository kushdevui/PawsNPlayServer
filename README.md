# PawsNPlayServer

Node.js REST API for **Paws N' Play**, a **dog boarding** facility. The mobile app
([PawsNPlayRender](https://github.com/kushdevui/PawsNPlayRender)) uses it to manage dogs, boarding stays,
capacity, payments and billing. Roles: **admin** (full access), **staff** (read + check-in/out) and
**user** (customer; only auth and `/me` for now).

**The contract is [`docs/BACKEND_API_SPEC.md`](docs/BACKEND_API_SPEC.md)**: models, all 27 routes, error codes,
business rules (§8) and acceptance tests (§11). [`docs/api-contract.md`](docs/api-contract.md) and
[`docs/endpoints.json`](docs/endpoints.json) are mirrored from the app.

## Stack
Node.js 22 · TypeScript (strict, ESM) · Express 5 · MongoDB (Mongoose 8) · Zod · JWT + bcrypt · Luxon
(facility timezone) · multer (uploads) · pino · Vitest + Supertest + mongodb-memory-server

## Run locally (macOS)
1. **Install MongoDB Community and Compass** (needs [Homebrew](https://brew.sh)):
   ```sh
   brew tap mongodb/brew
   brew install mongodb-community
   brew services start mongodb-community
   brew install --cask mongodb-compass
   ```
2. **Use Node 22**: `nvm use` (reads `.nvmrc`), or install Node 22 LTS.
3. **Create your env file**: `cp .env.example .env`. The defaults work for local development. Never commit `.env`.
4. **Install dependencies**: `npm install`
5. **Load the seed data**: `npm run seed`, or `npm run seed:today` to move all booking and payment dates so that
   23 Nov 2026 becomes today, which gives a lively dashboard.
   - The seed drops `users`, `dogs`, `bookings`, `settings` and `refreshTokens`, plus the old `pets`, `services` and
     `notifications` collections, then loads `seed/*.json`. This logs everyone out.
   - It refuses to run when `NODE_ENV=production`, and against a non-local URI (Atlas) unless you add
     `-- --force`, e.g. `npm run seed -- --force`.
6. **Start the API**: `npm run dev`. It listens on `HOST:PORT` (default `0.0.0.0:4000`) and logs the LAN URL for
   the phone.
7. **Check it works**: open <http://localhost:4000/api/v1/health>. You should see
   `{"data":{"status":"ok","time":"...","db":"connected"}}`.
8. **Browse the data**: in MongoDB Compass, connect to `mongodb://127.0.0.1:27017` and open the database
   **`pawsnplay`**.

Seed logins (all use the password `password123`):

| Email | Role |
|---|---|
| `kush@pawsnplay.com`, `divya@pawsnplay.com`, `shreya@pawsnplay.com` | admin |
| `neha.staff@pawsnplay.com`, `vikram.staff@pawsnplay.com` | staff |
| `priya@example.com` | user |
| `ananya@example.com` | user, inactive (login fails with 403) |

IDs are MongoDB ObjectIds, freshly generated on every seed. Look them up with `GET /dogs` or `GET /bookings`,
or in Compass.

## Environment
Every variable is listed in [`.env.example`](.env.example).

| Variable | Default | Notes |
|---|---|---|
| `PORT`, `HOST` | `4000`, `0.0.0.0` | `0.0.0.0` lets phones on the same Wi-Fi reach the API |
| `MONGODB_URI` | - | e.g. `mongodb://127.0.0.1:27017/pawsnplay` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | - | long, random and different from each other |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | `15m`, `30d` | units are required |
| `BCRYPT_COST` | `12` | |
| `CORS_ORIGINS` | `*` | comma-separated list in production |
| `UPLOAD_PROVIDER` | `local` | `local` saves to `UPLOAD_DIR` and serves the files at `/uploads`. `s3` and `cloudinary` are not implemented yet (they return 501) |
| `UPLOAD_DIR`, `PUBLIC_BASE_URL` | `uploads`, - | `PUBLIC_BASE_URL` overrides the host used in upload URLs (set it behind a proxy) |

## Try the API
With the server running and the seed loaded (`brew install jq` for the `jq` parts):
```sh
API=http://localhost:4000/api/v1
login() { curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"password123\"}" | jq -r .data.accessToken; }
ADMIN=$(login kush@pawsnplay.com); STAFF=$(login neha.staff@pawsnplay.com)
H() { echo "Authorization: Bearer $1"; }

curl -s $API/me -H "$(H $ADMIN)" | jq                                    # who am I
curl -s "$API/dogs?search=lab" -H "$(H $STAFF)" | jq '.data[].name'      # find a dog
curl -s $API/admin/dashboard -H "$(H $STAFF)" | jq                       # today, capacity, payments due

# Book Bruno for 10-13 Dec (10:00 -> 18:00 IST); the server computes nights and total
DOG=$(curl -s "$API/dogs?search=bruno" -H "$(H $ADMIN)" | jq -r '.data[0].id')
BOOKING=$(curl -s -X POST $API/bookings -H "$(H $ADMIN)" -H 'Content-Type: application/json' \
  -d "{\"dogId\":\"$DOG\",\"checkIn\":\"2026-12-10T04:30:00.000Z\",\"checkOut\":\"2026-12-13T12:30:00.000Z\"}" \
  | jq -r .data.id)

# Record a 50% advance, check in (staff), then look at November billing
curl -s -X POST $API/bookings/$BOOKING/payments -H "$(H $ADMIN)" -H 'Content-Type: application/json' \
  -d '{"amount":1800,"type":"advance","method":"upi"}' | jq '.data | {amountPaid, balanceDue, paymentStatus}'
curl -s -X PATCH $API/bookings/$BOOKING/status -H "$(H $STAFF)" -H 'Content-Type: application/json' \
  -d '{"status":"checked_in"}' | jq .data.status
curl -s "$API/admin/billing?from=2026-10-31T18:30:00.000Z&to=2026-11-30T18:30:00.000Z" -H "$(H $ADMIN)" | jq

# Upload a vaccination card (admin), then attach the returned URL to the dog
curl -s -X POST $API/uploads -H "$(H $ADMIN)" -F "file=@card.pdf;type=application/pdf" | jq
```
Access tokens last 15 minutes. Get a new one with `POST /auth/refresh` and the body `{"refreshToken":"..."}`.

### Postman
Import [`docs/PawsNPlay.postman_collection.json`](docs/PawsNPlay.postman_collection.json) and run **Login as admin
(Kush)** or **Login as staff (Neha)** first. The login test scripts save `accessToken` and `refreshToken`.
- The list requests save the first dog's and booking's id into `dogId` and `bookingId`, so the detail and update
  requests work right after a seed.
- `baseUrl` defaults to `http://localhost:4000/api/v1`.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server (`NODE_ENV=production`) |
| `npm run seed` / `npm run seed:today` | Reset the local DB to `seed/*.json`, as-is or shifted to today |
| `npm test` | Vitest + Supertest against an in-memory MongoDB (includes the spec §11 acceptance tests) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint checks |

The first `npm test` downloads a MongoDB binary for `mongodb-memory-server`, so it needs internet access once.

## Connecting the app
In PawsNPlayRender's `.env`, set:
- `EXPO_PUBLIC_USE_MOCKS=false`
- `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api/v1`

On a phone, use the LAN URL that `npm run dev` prints, not `localhost`.

## Project layout
```
src/
  server.ts, app.ts, routes.ts   # entry point, express app (+ /uploads static), /api/v1 router
  config/env.ts                  # Zod-validated environment
  db/                            # connect + ping, toJSON safety net, seed logic (id mapping, --shift-to-today)
  middleware/                    # auth (requireAuth/requireRole), validate, error, notFound, methodNotAllowed, rateLimit
  utils/                         # AppError, respond, pagination, clock, time (Luxon facility tz), objectId, regex, logger
  modules/
    auth/ users/                 # login/register/refresh/logout, /me, admin user management
    dogs/                        # dogs + embedded documents
    bookings/                    # stays, status machine, payments; bookings.rules.ts = pure spec §8 rules
    settings/                    # single settings document + facility lock (spec §8.2 concurrency)
    admin/                       # dashboard, occupancy calendar, billing
    uploads/                     # POST /uploads (multer) + storage providers
scripts/seed.ts                  # npm run seed
seed/                            # copy of PawsNPlayRender/mock/data/{users,dogs,bookings,settings}.json
tests/                           # Vitest + Supertest
```

## Working with Claude
Backend work uses the `server-agent` subagent (`.claude/agents/server-agent.md`). See `CLAUDE.md`.
