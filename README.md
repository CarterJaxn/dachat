# DaChat — Live Chat Platform

> Change the live chat standard.

## Architecture

Monorepo with three packages:

| Package | Purpose | Tech |
|---|---|---|
| `packages/server` | API + WebSocket server | Node.js, Fastify, PostgreSQL, Redis |
| `packages/widget` | Embeddable chat widget | React, TypeScript, Vite |
| `packages/dashboard` | Agent/operator dashboard | React, TypeScript, Vite |

## Infrastructure

- **Database**: PostgreSQL 16
- **Cache/Pub-sub**: Redis 7
- **Containerization**: Docker (local dev via `infra/docker-compose.yml`)
- **CI**: GitHub Actions

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker (for local database/Redis)

## Local Dev Setup

```bash
# 1. Start backing services
docker compose -f infra/docker-compose.yml up -d

# 2. Install dependencies
npm install

# 3. Copy env
cp .env.example .env

# 4. Start all packages in dev mode
npm run dev
```

## Project Structure

```
dachat/
├── packages/
│   ├── server/        # API + WebSocket
│   ├── widget/        # Embeddable chat widget
│   └── dashboard/     # Operator dashboard
├── infra/
│   └── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml
└── package.json       # npm workspace root
```
