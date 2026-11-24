# PawsNPlayServer

Node.js REST API for **PawsNPlay**, the pet care app ([PawsNPlayRender](https://github.com/kushdevui/PawsNPlayRender))
used by **admin**, **user** (pet owner) and **staff** roles.

## Status
Done: M1 (skeleton, error envelope, `GET /api/v1/health`, models, seed) and M2 (auth: login, register, refresh,
logout; `GET/PATCH /me`; admin `/users`). Next: pets, services, bookings, notifications, dashboard. The API contract
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
