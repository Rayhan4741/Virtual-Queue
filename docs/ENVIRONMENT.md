# Environment Variables & Secret Management Guide

## 1. Local Setup

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

Generate cryptographically secure secrets for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `QR_SIGNING_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> **Security Rule:** `.env`, `.env.local`, and `.env.production` are listed in `.gitignore` and must never be committed to GitHub. Never expose private keys or secrets via `NEXT_PUBLIC_*`.

## 2. Backend Variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `PORT` | Yes | Backend HTTP/Socket.IO port (default `5000`) |
| `INSTANCE_ID` | No | Instance identifier for load-balanced logs & `/api/health` |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `MONGODB_URI` | Yes (prod) | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | Yes (prod, ≥32 chars) | Secret for signing 15m JWT access tokens |
| `JWT_REFRESH_SECRET` | Yes (prod, ≥32 chars) | Secret for signing 7d rotating refresh tokens |
| `QR_SIGNING_SECRET` | Yes (prod, ≥32 chars) | HMAC-SHA256 secret for expiring entrance QR payloads |
| `FRONTEND_URL` | Yes | Comma-separated allowed CORS origins |
| `REDIS_URL` | Optional | Redis / Upstash URL; falls back to MongoDB atomic counters if omitted |
| `SMTP_*` | Optional | SMTP credentials for email alerts |
| `VAPID_*` | Optional | Web Push VAPID keys |
| `OPENROUTESERVICE_API_KEY` | Optional | OpenRouteService key for travel-time leave alerts |
| `AI_PROVIDER` / `AI_API_KEY` | Optional | `mock` or `openai` |

## 3. Frontend Variables (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | Application display name (`Virtual Queue`) |
| `NEXT_PUBLIC_API_URL` | API base path (`/api` uses Next.js rewrite proxy) |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server origin (`http://localhost:5000`) |
| `NEXT_PUBLIC_BACKEND_ORIGIN` | Server-side Next.js rewrite target for `/api/:path*` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public VAPID key for browser Web Push subscription |
