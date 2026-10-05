---
name: ReplyMind local-only data
description: User-confirmed storage and account boundary for ReplyMind.
---

ReplyMind conversations and preferences must stay local to the current browser. Do not add accounts, cloud persistence, or cross-browser sync unless the user changes this product requirement. Screenshot retention is opt-in and stays in browser storage; images are sent to Groq only when the user requests analysis.

**Why:** The user chose browser-only storage with no sign-in or cross-device sync when asking to remove the authentication provider.

**How to apply:** Keep history and preferences local, keep AI endpoints stateless, and make screenshot retention opt-in.