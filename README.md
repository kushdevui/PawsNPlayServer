# PawsNPlayServer

Node.js REST API for **PawsNPlay**, the pet care app ([PawsNPlayRender](https://github.com/kushdevui/PawsNPlayRender))
used by **admin**, **user** (pet owner) and **staff** roles.

## Status
Project setup has not started yet. The API contract is ready in [`docs/api-contract.md`](docs/api-contract.md)
and [`docs/endpoints.json`](docs/endpoints.json), mirrored from the app's mock backend.

## Planned stack
Node.js 22 · TypeScript · Express 5 · MongoDB (Mongoose) · Zod · JWT · Vitest + Supertest

## API
- Base URL: `http://localhost:4000/api/v1`
- Auth: `Authorization: Bearer <accessToken>`
- Responses: `{ data }`, `{ data, meta }` for lists, `{ error: { code, message } }` for errors

## Working with Claude
Backend work uses the `server-agent` subagent (`.claude/agents/server-agent.md`). See `CLAUDE.md`.
