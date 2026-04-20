# DaChat

Open-source live chat platform. Drop a widget on any webpage; operators reply in real-time.

## Monorepo

| Package | Description |
|---|---|
| `packages/api` | Fastify API + WebSocket server + Drizzle/Postgres |
| `packages/widget` | React widget, compiled to a single IIFE bundle |
| `packages/shared` | Shared TypeScript types |

## Local Development

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL (or `docker compose up db`)

### Setup

```bash
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev                    # starts API on :3000 + widget dev server on :5173
```

### Environment variables

| Var | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | Secret for signing operator JWTs |
| `PORT` | no | API port (default 3000) |

## Embedding the widget

```html
<script
  src="https://cdn.dachat.io/dachat-widget.iife.js"
  data-api-url="https://api.dachat.io"
  data-api-key="wk_YOUR_API_KEY"
  data-accent-color="#6366f1">
</script>
```

## Deploying the widget bundle

```bash
export R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
export R2_BUCKET=dachat-cdn
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
./scripts/deploy-widget.sh
```
