# Architecture

A Next.js 14 App Router chatbot that streams answers from Google Gemini (and
other providers through the Vercel AI SDK), with authentication, persistence and
rate limiting around the model call.

## Request flow

1. `app/(chat)/page.tsx` renders the chat shell; `lib/chat/actions.tsx` exposes
   the server action that the composer posts to.
2. `lib/chat/ratelimit.ts` checks the caller against Upstash Ratelimit before any
   token is spent.
3. The action builds the message list and calls the AI SDK provider adapter.
   Responses stream back to the client through `lib/chat/responses.tsx`.
4. `auth.ts` / `auth.config.ts` gate the route with NextAuth; `app/login` and
   `app/signup` own the credential flows.
5. Chat history and user records are stored through the Vercel KV / Postgres
   adapters described in the README; `app/actions.ts` holds the read/write
   actions.

## Components

| Path | Responsibility |
|---|---|
| `app/(chat)` | Chat route, layout, error boundary |
| `app/login`, `app/signup` | Authentication screens and server actions |
| `app/new` | New-chat entry point |
| `lib/chat` | Server actions, rate limiting, streamed response rendering |
| `lib/kasada` | Kasada bot-defence client and server helpers |
| `lib/neurobot.ts` | Cognitive-robotics simulation module |
| `lib/hooks` | Client hooks for scroll, clipboard, sidebar, local storage |
| `components` | shadcn/ui component library |

## Model providers

The default provider is Google Gemini. The AI SDK adapter layer lets an
operator point the same UI at OpenAI, Anthropic, Cohere, Hugging Face or a
custom OpenAI-compatible endpoint by changing the provider factory and the
matching environment variables.

## Trust boundaries

- Provider API keys are read from server-side environment variables and never
  reach the browser.
- Authentication state is signed by NextAuth; the session cookie is HTTP-only.
- Every model call passes through the rate limiter first.
- Bot traffic is screened by the Kasada integration before the chat action runs.

## Validation

`lib/__tests__/neurobot.test.ts` runs under the Node test runner:

```bash
node --experimental-strip-types --test lib/__tests__/neurobot.test.ts
```

CI runs the same command on Node 22 for every push and pull request.
