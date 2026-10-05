# ReplyMind

ReplyMind helps people understand a conversation and draft a reply that still sounds like them.

## Run & operate

- The managed `artifacts/replymind: web` workflow runs the React/Vite PWA.
- The managed `artifacts/api-server: API Server` workflow runs the stateless Groq API.
- `pnpm run typecheck` — typecheck workspace libraries and artifacts.
- `PORT=23669 BASE_PATH=/ pnpm run build` — typecheck and build all packages outside the managed workflows.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and Zod schemas from the OpenAPI contract.
- Configure `GROQ_API_KEY` in Replit Secrets for AI analysis and rewrites. Never put it in source or expose it to the browser.

## Stack

- pnpm workspace, TypeScript, React, Vite, TanStack Query, and Express 5.
- Groq is called by the API server; browser code never receives the Groq key.
- IndexedDB stores conversations, preferences, local usage counters, and screenshots the user explicitly chooses to keep.
- No sign-in, user account, cloud history, or cross-browser synchronization.

## Source map

- `artifacts/replymind/src/App.tsx` — user-facing routes and interaction flows.
- `artifacts/replymind/src/lib/local-store.ts` — browser-only IndexedDB persistence.
- `artifacts/replymind/src/lib/local-hooks.ts` — React Query adapters for IndexedDB and stateless AI calls.
- `artifacts/replymind/public/sw.js` — installable/offline app shell; AI API requests are not cached.
- `artifacts/api-server/src/routes/analysis.ts` and `replies.ts` — stateless AI endpoints.
- `artifacts/api-server/src/lib/ai/` — Groq client, prompts, and response parsing.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract and generated types.

## Privacy and data handling

- Conversation history, preferences, and usage counts stay in this browser's IndexedDB.
- Text and screenshots are sent to the API only when the user requests analysis; screenshots are forwarded to Groq and are not persisted by the API server.
- Screenshot retention defaults off. When enabled, the image is stored in IndexedDB on this device and can be removed from its conversation or cleared in Settings.
- The Settings screen's delete action clears all ReplyMind records from this browser.
- The app shell can load offline, but analysis and rewriting require an internet connection.
- Browser-local usage limits are convenience limits, not account-wide quotas; clearing browser data also clears those counters.

## Product constraints

- Keep storage local to the current browser unless the product owner explicitly changes that requirement.
- Do not add authentication, cloud persistence, or cross-device sync without an explicit product change.
- Do not store conversation text or screenshot bytes on the API server.
- Keep screenshots opt-in for local retention and send them only with an explicit AI analysis request.