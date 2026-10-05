# ReplyMind

ReplyMind is a mobile-first, installable web app for understanding a conversation and drafting a reply in your own voice.

## What it does

- Analyze pasted conversation text, a single latest message, or a screenshot.
- Summarize tone and likely context, offer reply options, and rewrite an option on request.
- Save conversations, preferences, and usage counts in the current browser.
- Let the user optionally keep an analyzed screenshot in that browser.

There is no sign-in, account, cloud conversation history, or cross-device sync. Local records can be removed in **Settings → Delete all local ReplyMind data**. Clearing browser data also removes them.

## Privacy and AI

Conversation text and screenshots are sent for AI processing only after the user requests analysis. The API forwards the request to Groq but does not store conversation or screenshot content. Screenshots are retained in browser storage only when the user turns on **Keep this screenshot**. Analysis and reply rewriting require an internet connection; the cached PWA shell can load offline.

The browser keeps provisional convenience limits of 100 conversation generations and 30 image analyses per calendar month, plus up to 100 MB of opt-in screenshot storage. These counts are local to the browser and reset if its site data is cleared. They are not secure, account-wide quotas.

## Run in Replit

The project has managed workflows for the web app and API server. Configure `GROQ_API_KEY` in Replit Secrets to enable analysis and rewrites; do not add it to frontend code or commit it.

Useful commands:

```sh
pnpm install
pnpm run typecheck
PORT=23669 BASE_PATH=/ pnpm run build
pnpm --filter @workspace/api-spec run codegen
```

The API is exposed on the same origin under `/api`. Its OpenAPI contract is maintained in `lib/api-spec/openapi.yaml`.