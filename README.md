# Virtual Queue — Real-Time Remote Token & Queue Management Platform

A full-stack, real-time queue management SaaS platform for **Banks, Hospitals, and Public Offices** built with React 18, TypeScript, Tailwind CSS, Express, MongoDB, Redis, and Socket.IO.

## Five Interfaces
1. **Customer Web Application** (`/`, `/organizations`, `/dashboard`, `/tokens/:id`) — Remote booking, live Socket.IO tracking, EMA wait estimates, QR check-in, Snooze, Late Pass, Travel-Time Leave Alerts, Lite Mode, PWA, and AI Assistant.
2. **Kiosk & Guest Interface** (`/kiosk`, `/track/:trackingCode`) — Large touch-friendly UI, printable token slips with QR tracking, automatic inactivity reset.
3. **Counter Staff Dashboard** (`/staff`) — Call Next, Recall (max 2), Start, Complete, Skip/No-Show, Transfer, Pause/Resume Counter, Walk-in & Manual Fallback tokens, Announcements.
4. **Organization Admin Console** (`/admin`) — Organization, Service, Counter, and Staff management, Entrance QR generator, Recharts Analytics, and Append-only Audit Logs.
5. **Public Display Board** (`/display/:organizationId`) — Real-time TV screen with Web Speech API voice announcements and mute control.

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Start both backend & frontend (uses MongoMemoryServer automatically in dev if local MongoDB is not running)
npm run dev
```

### Seeded Demo Accounts (Password: `DemoPass123!`)
- **Admin**: `01700000001`
- **Customer**: `01700000002`
- **Staff**: `01700000003`

## Testing & Verification

```bash
# Typecheck backend & frontend
npm run typecheck

# Run unit + integration + concurrency + security tests
npm test

# Production build
npm run build
```

## Load Balancing & Cloud Deployment
- **Frontend**: Deploy `frontend/` to **Vercel** (`npm run build`, output `dist`).
- **Backend**: Deploy `backend/` to **Render / Railway** or self-host behind **Nginx** using `infra/docker-compose.yml` (`docker compose up --scale ...`).
- **Database**: **MongoDB Atlas**.
- **Redis**: **Upstash Redis** (`REDIS_URL`). If unavailable, the token engine automatically falls back to MongoDB atomic `TokenCounter` documents.
- **Load Testing**: Run `k6 run infra/k6/load-test.js` against the load-balanced endpoint.
