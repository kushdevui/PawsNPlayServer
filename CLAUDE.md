# PawsNPlayServer

Backend for **PawsNPlay** - a Node.js REST API used by the React Native (Expo) app
**PawsNPlayRender** (separate repo) for **admin, user and staff** roles.

- For any work in this repo, use the **`server-agent`** subagent (`.claude/agents/server-agent.md`);
  it holds the stack, structure, role/authorization rules and the API contract rules.
- The contract is `docs/api-contract.md` + `docs/endpoints.json`, mirrored from the app repo
  (`PawsNPlayRender/docs/api-contract.md` and `mock/endpoints.json`). Responses must match it exactly
  so the app switches from mocks to this API with one env change. Keep both repos in sync.
- Seed data comes from the app's `mock/data/*.json`. Test logins: admin@pawsnplay.com /
  priya@example.com / neha.staff@pawsnplay.com, password `password123`.
- Before finishing a change: `npm run typecheck`, `npm run lint`, `npm test`.
- Never commit `.env` files, secrets or tokens.
