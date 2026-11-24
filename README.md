# PawsNPlayServer

Node.js REST API for **PawsNPlay**, the pet care app ([PawsNPlayRender](https://github.com/kushdevui/PawsNPlayRender))
used by **admin**, **user** (pet owner) and **staff** roles.

## Status
Every endpoint in the contract is implemented: auth, `/me`, users, pets, services, bookings, notifications and the
admin dashboard. Not done yet: notifications are not created server-side, only the seeded ones exist. The API contract
is in [`docs/api-contract.md`](docs/api-contract.md) and [`docs/endpoints.json`](docs/endpoints.json), mirrored
from the app's mock backend.

## Stack
Node.js 22 · TypeScript (strict, ESM) · Express 5 · MongoDB (Mongoose 8) · Zod · JWT · Vitest + Supertest

## Run locally (macOS)
1. **Install MongoDB Community and Compass** (needs [Homebrew](https://brew.sh)):
   ```sh
   brew tap mongodb/brew
   brew install mongodb-community
   brew services start mongodb-community
   brew install --cask mongodb-compass
   ```
   You can also download Compass from mongodb.com/products/compass.
2. **Use Node 22**: `nvm use` (reads `.nvmrc`), or install Node 22 LTS.
3. **Create your env file**: `cp .env.example .env`. The defaults work for local development.
   Never commit `.env`.
4. **Install dependencies**: `npm install`
5. **Load the seed data**: `npm run seed`. This wipes and refills the `users`, `pets`, `services`, `bookings` and
   `notifications` collections in the `pawsnplay` database and clears all refresh tokens, which logs everyone out.
   It refuses to run against a non-local URI such as Atlas; if you really mean it, run `npm run seed -- --force`.
6. **Start the API**: `npm run dev` (starts on port 4000 and restarts when files change).
7. **Check it works**: open <http://localhost:4000/api/v1/health>. You should see
   `{"data":{"status":"ok","db":"connected"}}`.
8. **Browse the data**: in MongoDB Compass, connect to `mongodb://127.0.0.1:27017` and open the database
   **`pawsnplay`**.

Test logins (all use the password `password123`): `admin@pawsnplay.com` (admin), `priya@example.com` (user),
`neha.staff@pawsnplay.com` (staff).

## Try the API
With the server running and the seed loaded (`jq` is optional: `brew install jq`):
```sh
API=http://localhost:4000/api/v1

# 1. Log in as admin -> { data: { accessToken, refreshToken, user } }
TOKEN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pawsnplay.com","password":"password123"}' | jq -r .data.accessToken)

# 2. Who am I?
curl -s $API/me -H "Authorization: Bearer $TOKEN" | jq

# 3. List users (admin only); filters: role, status, search, page, limit
curl -s "$API/users?role=staff&page=1&limit=20" -H "Authorization: Bearer $TOKEN" | jq
```
Access tokens last 15 minutes (`JWT_ACCESS_TTL`). Get a new one with
`POST /auth/refresh` and the body `{"refreshToken":"..."}`.

### A booking from start to finish
```sh
login() { curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"password123\"}" | jq -r .data.accessToken; }
ADMIN=$(login admin@pawsnplay.com); USER=$(login priya@example.com); STAFF=$(login neha.staff@pawsnplay.com)

# 1. Priya books a Play Session (s_003) for Bruno (p_001). startTime must be in the future.
#    The server sets endTime, totalPrice, currency, status "pending" and staffId null.
START=$(date -u -v+2d +%Y-%m-%dT10:00:00.000Z 2>/dev/null || date -u -d '+2 days' +%Y-%m-%dT10:00:00.000Z)
BOOKING=$(curl -s -X POST $API/bookings -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' \
  -d "{\"petId\":\"p_001\",\"serviceId\":\"s_003\",\"startTime\":\"$START\",\"notes\":\"First visit\"}" | jq -r .data.id)

# 2. Admin confirms it and assigns Neha (u_004)
curl -s -X PATCH $API/bookings/$BOOKING/status -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"status":"confirmed"}' | jq .data.status
curl -s -X PATCH $API/bookings/$BOOKING/assign -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"staffId":"u_004"}' | jq .data.staffId

# 3. Neha marks it completed (staff can only complete confirmed bookings assigned to them)
curl -s -X PATCH $API/bookings/$BOOKING/status -H "Authorization: Bearer $STAFF" \
  -H 'Content-Type: application/json' -d '{"status":"completed"}' | jq .data.status

# 4. The admin dashboard now counts it in bookingsByStatus.completed and revenue
curl -s $API/admin/dashboard -H "Authorization: Bearer $ADMIN" | jq
```

### Postman
Import [`docs/PawsNPlay.postman_collection.json`](docs/PawsNPlay.postman_collection.json). Run one of the
**Login as admin / user / staff** requests first. Its test script saves `accessToken` and `refreshToken` into the
collection variables, and every other request sends `Bearer {{accessToken}}`. `baseUrl` defaults to
`http://localhost:4000/api/v1`. The example paths use seed IDs, so run `npm run seed` first to get the expected data.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server (`NODE_ENV=production`) |
| `npm run seed` | Reset the local DB to `seed/*.json` (a copy of the app's `mock/data`) |
| `npm test` | Vitest + Supertest against an in-memory MongoDB |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint checks |

The first `npm test` downloads a MongoDB binary for `mongodb-memory-server`, so it needs internet access once.

## API
- Base URL: `http://localhost:4000/api/v1`
- Auth: `Authorization: Bearer <accessToken>`
- Responses: `{ data }`, or `{ data, meta }` for lists, or `{ error: { code, message } }` for errors

To use it from the app: in PawsNPlayRender's `.env`, set `EXPO_PUBLIC_USE_MOCKS=false` and
`EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api/v1`.

## Project layout
```
src/
  server.ts, app.ts, routes.ts   # entry point, express app, /api/v1 router
  config/env.ts                  # Zod-validated environment
  db/                            # connect, shared toJSON options, seed logic
  middleware/                    # error, notFound, validate
  utils/                         # AppError, respond helpers, pagination, ids, logger
  modules/<feature>/             # routes, controller, service, schema, model per feature
scripts/seed.ts                  # npm run seed
seed/                            # copy of PawsNPlayRender/mock/data/*.json
tests/                           # Vitest + Supertest
```

## Working with Claude
Backend work uses the `server-agent` subagent (`.claude/agents/server-agent.md`). See `CLAUDE.md`.
