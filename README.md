# PawsNPlayServer

Node.js REST API for **Paws N' Play**, a **dog boarding** facility. The mobile app
([PawsNPlayRender](https://github.com/kushdevui/PawsNPlayRender)) uses it to manage dogs, boarding stays,
capacity, payments and billing. Roles: **admin** (full access), **staff** (read + check-in/out) and
**user** (customer; only auth and `/me` for now).

**The contract is [`docs/BACKEND_API_SPEC.md`](docs/BACKEND_API_SPEC.md)**: models, all routes (27 core + 4 questionnaire + 6 waiver routes), error codes,
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

### "Know Your Dog" questionnaire
The form screen is part of the app (PawsNPlayRender, public route `/know-your-dog`, also on the web build).
Owners use it to send their dog's details before a stay; this server only stores and serves the submissions.
- It posts `multipart/form-data` to the public `POST /api/v1/questionnaires`: `answers` (a JSON string), `website`
  (a honeypot) and up to 5 photo/PDF `documents`.
- Submissions are rate-limited per IP (`QUESTIONNAIRE_RATE_PER_HOUR` = 5, `QUESTIONNAIRE_RATE_PER_DAY` = 20).
- Files are stored under `uploads/questionnaires/`.
- Admins and staff read submissions with `GET /api/v1/questionnaires` and `GET /api/v1/questionnaires/:id`. Admins mark
  them reviewed or link a dog with `PATCH`. The app has no screen for this yet; spec §7.12 has the details.
```sh
curl -s "$API/questionnaires?status=new" -H "$(H $ADMIN)" | jq '.data[] | {dogName, ownerName, ownerPhone}'
```

### Boarding Consent & Waiver
Dog parents sign the waiver online at `/waiver` (an app screen). The legal text is versioned in
`src/modules/waivers/content/` (currently `v2026-11.ts`, transcribed word for word from the PDF) and served by the public
`GET /api/v1/waivers/current`, so the app renders exactly what is signed.
- `POST /api/v1/waivers` stores the signature together with a full snapshot of the text, the version and its SHA-256
  hash, the ticked consents, the typed and drawn signature, `signedAt` (server time), an HMAC of the IP and the user
  agent. It is rate-limited per IP (`WAIVER_RATE_PER_HOUR` = 5, `WAIVER_RATE_PER_DAY` = 20).
- Admins and staff list and read waivers. `GET /api/v1/waivers/:id/document` is a printable HTML record; it also
  accepts `?token=<accessToken>` so the app can open it in a browser tab.
- Admins can only link a dog or Know Your Dog form; the signed content is immutable.
- To change the text, add a new version file and point `CURRENT_WAIVER` at it. Never edit a published version.
- Legal review of the online wording is recommended. Spec §7.13 has the details.

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

## Deploy to EC2 with your domain
One instance serves everything through Nginx:

| Path | Served by |
|---|---|
| `/api/v1/*`, `/uploads/*` | the API (PM2, `127.0.0.1:4000`) |
| `/` | redirects to `/faqs` (an app route) |
| everything else | the Expo web build of the app in `/var/www/pawsnplay/app`, e.g. `/faqs`, `/login`, `/admin` |

The two repos deploy separately, in two steps. This repo's script sets up the server; the app repo's script builds
and publishes the web app.

1. **DNS** at your registrar: create an `A` record for `@` and another for `www`, both pointing to the instance's
   public IP. Use an Elastic IP so the address survives a stop/start.
2. **Security group**: allow inbound `22` (SSH, ideally from your IP only), `80` and `443` from anywhere.
3. **MongoDB Atlas -> Network Access**: add the instance's public IP.
4. **Step 1, server** (on the instance, Amazon Linux 2023 as `ec2-user`, or Ubuntu as `ubuntu`):
   ```sh
   bash <(curl -fsSL https://raw.githubusercontent.com/kushdevui/PawsNPlayServer/main/scripts/deploy-ec2.sh)
   ```
   - The first run asks for `MONGODB_URI`, the domain (default `pawsnplaywithme.com`; type `none` for IP-only) and
     an optional email for certificate notices.
   - To skip the questions: `DOMAIN=pawsnplaywithme.com CERT_EMAIL=you@example.com MONGODB_URI=... bash <(curl ...)`.
   - It installs Node 22, Nginx and PM2, adds swap on small instances, builds and starts the API, and configures
     Nginx.
   - If the domain already points to the instance, it also gets a free Let's Encrypt certificate, which renews
     automatically and redirects HTTP to HTTPS. Otherwise it prints the DNS records to create and serves plain
     HTTP until you run it again.
   - It saves `DOMAIN`, `CERT_EMAIL` and `SITE_URL` (`https://<domain>`, or `http://<ip>` without a certificate) in
     `~/.pawsnplay-deploy`, a non-secret file the app script reads.
   - It prepares `/var/www/pawsnplay/app`, owned by your user so the app script can publish without sudo. A real
     build there is never overwritten.
   - Re-run the same command to update the API. `.env` is never overwritten; only `PUBLIC_BASE_URL` changes from
     `http://<ip>` to `https://<domain>` once HTTPS works.
5. **Step 2, app**: build and publish the web app from the app repo:
   ```sh
   git clone -b feat/admin-boarding https://github.com/kushdevui/PawsNPlayRender.git ~/PawsNPlayRender   # first time
   cd ~/PawsNPlayRender && bash scripts/deploy-web.sh
   ```
   It builds the Expo web export against `SITE_URL/api/v1`, copies it to `/var/www/pawsnplay/app` and reloads Nginx.
   Re-run it whenever the app changes.
6. **Phone app**: set `EXPO_PUBLIC_API_URL=https://pawsnplaywithme.com/api/v1`.

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
    questionnaires/              # public "Know Your Dog" submissions + admin/staff review
    waivers/                     # versioned waiver text (content/), online signing, printable record
scripts/seed.ts                  # npm run seed
seed/                            # copy of PawsNPlayRender/mock/data/{users,dogs,bookings,settings}.json
tests/                           # Vitest + Supertest
```

## Working with Claude
Backend work uses the `server-agent` subagent (`.claude/agents/server-agent.md`). See `CLAUDE.md`.
