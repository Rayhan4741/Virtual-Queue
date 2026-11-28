# Virtual Queue — Real-Time Remote Token & Queue Management Platform

A full-stack, real-time queue management SaaS platform for **Banks, Hospitals, and Public Offices** built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Express 5**, **MongoDB**, **Redis**, and **Socket.IO**.

## Five Interfaces
1. **Customer Web Application** (`/`, `/organizations`, `/dashboard`, `/history`, `/tokens/:id`, `/billing`) — Remote booking, 3D Map & routing, live Socket.IO tracking, EMA wait estimates, QR check-in, Snooze, Late Pass, Travel-Time Leave Alerts, Rating & Feedback, Accessibility Mode (`A+`), Lite Mode, PWA, and AI Assistant.
2. **Kiosk & Guest Interface** (`/kiosk`, `/track/:trackingCode`) — Large touch-friendly `EN | বাংলা` bilingual UI, printable token slips with QR tracking, automatic 30s inactivity reset.
3. **Counter Staff Dashboard** (`/staff`) — Call Next, Recall (max 2), Start, Complete, Skip/No-Show, Transfer, Pause/Resume Counter, Walk-in & Manual Fallback tokens, Announcements.
4. **Organization Admin Console** (`/admin`) — Organization, Service, Counter, and Staff management, Entrance QR generator, Recharts Analytics, System Status Dashboard (`/api/admin/system-status`), and Append-only Audit Logs.
5. **Public Display Board** (`/display/:organizationId`) — Real-time `EN | বাংলা` TV screen with Web Speech API voice announcements and mute control.

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
- **Frontend**: Deploy `frontend/` to **Vercel** (Next.js 15 App Router, Root Directory: `frontend`).
- **Backend**: Deploy `backend/` to **Render / Railway** or self-host behind **Nginx** using `infra/docker-compose.yml`.
- **Database**: **MongoDB Atlas Replica Set** (`mongodb+srv://...` with `retryWrites=true&w=majority`). Optional DR URI fallback requires `ALLOW_URI_FALLBACK=true`.
- **Redis**: **Upstash Redis** (`REDIS_URL`). If unavailable, the token engine automatically falls back to MongoDB atomic `TokenCounter` documents.
- **Load Testing**: Run `k6 run infra/k6/load-test.js` (up to 1,000 VUs covering token issuance, tracking, and display board) against the load-balanced endpoint.
