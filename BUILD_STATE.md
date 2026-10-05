# ReplyMind build state

## Product mode

- Browser-only history and preferences; no sign-in, accounts, or cross-device synchronization.
- IndexedDB stores conversations, usage counts, and screenshots only when retention is explicitly enabled.
- The API handles one-shot analysis and reply rewrites; it does not persist conversation or screenshot content.
- Groq is required for AI features. The PWA shell can load offline; AI actions need a network connection.

## Implemented

- Mobile-first app shell and installable PWA with offline shell caching.
- Local create, read, rename, archive, and delete conversation flows.
- Local preferences, usage counters, optional screenshot retention, and a clear-all action.
- Stateless analysis and rewrite endpoints with validation and per-IP in-memory request limits.
- Screenshot resizing/compression in the browser before analysis.
- Clarification flow when the model reports that a screenshot or conversation is unclear.

## Verification

- Workspace typecheck and full build pass with `PORT=23669 BASE_PATH=/`.
- API and web artifact builds also pass individually.
- API health returns 200; invalid and context-free analysis requests return JSON 400 responses.
- Web and API workflows restart cleanly; mobile `/app` and `/settings` previews load without browser errors.
- Browser storage interactions have not yet been automated; a follow-up test task is proposed.

## Manual cleanup

- Remove the unused `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY` entries in Replit Tools → Secrets. The available workspace secret tooling can report their presence but cannot delete secret entries.

## Operational requirement

- Set `GROQ_API_KEY` in Replit Secrets to enable analysis and rewrites.