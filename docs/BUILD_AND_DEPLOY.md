# Build & Deploy

## Prerequisites

- Node.js >= 20
- npm

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API (4318) + Vite web (4317) together |
| `npm run dev:api` | API only (tsx watch) |
| `npm run dev:web` | Vite web only |
| `npm run typecheck` | Client + server TypeScript checks |
| `npm test` | Vitest suite |
| `npm run build` | Compile server (`tsc`) + production client (`vite build`) |
| `npm start` | Serve built app + API from port `PORT` (default 4318) |
| `npm run verify` | Typecheck, tests, build |

## Production

```bash
npm run build
npm start
```

The server serves `/dist` static files and falls back to `index.html` for client routes. API routes under `/api` are handled by Express.

## Environment (.env)

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4318` | API / production web port |
| `TESTPILOT_DATA_DIR` | `./data` | JSON store + evidence dir |
| `TESTPILOT_SEED` | unset | Set `0` to skip demo seeding |
| `AI_PROVIDER` | `local` | `local` \| `ollama` \| `openai-compatible` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model |
| `OPENAI_COMPATIBLE_BASE_URL` | empty | OpenAI-compatible base URL |
| `OPENAI_COMPATIBLE_MODEL` | empty | Model name |
| `OPENAI_COMPATIBLE_API_KEY` | empty | Server-side only |
| `TRUST_PROXY` | `0` | Set `1` behind trusted TLS proxy |

## Security headers in production

Set `TRUST_PROXY=1` when behind a TLS proxy to enable `Strict-Transport-Security` and correct IP-based rate limiting.

## Data

The JSON store is at `data/testpilot.json`; screenshots at `data/evidence/`. Both are gitignored. Back up `data/` regularly.

## Desktop (Tauri) — documented, not built

Tauri packaging is planned (Phase 23) but not produced in this environment: no Rust toolchain confirmed. Installers not published. Do not claim a Windows .exe exists.

## Mobile — documented, not built

No mobile toolchain (Android Studio / Xcode) confirmed. Responsive CSS breakpoints exist for tablet/mobile; store builds not produced.
