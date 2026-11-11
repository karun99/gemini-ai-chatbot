# Documentation

- [Architecture](./ARCHITECTURE.md) — request flow, components, trust boundaries, validation.
- [README](../README.md) — features, model providers, local setup and deployment.
- [Security policy](../SECURITY.md) — supported versions and disclosure process.

## Local development

```bash
pnpm install
cp .env.example .env.local   # add AUTH_SECRET and the provider key
pnpm dev
```

## Checks

```bash
node --experimental-strip-types --test lib/__tests__/neurobot.test.ts
pnpm lint
```
