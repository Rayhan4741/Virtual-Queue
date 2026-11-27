# VIRTUAL QUEUE
## A Real-Time Remote Token, Queue Fairness & Multi-Tenant Service Orchestration Platform
### Comprehensive Project Proposal, System Architecture & Technical Verification Report

**Repository:** `https://github.com/Rayhan4741/Virtual-Queue.git`  
**Stack:** Next.js 15 (App Router) • TypeScript • Tailwind CSS • Node.js • Express 5 • Socket.IO • MongoDB • Redis • Nginx  

---

## 1. Executive Summary

Physical waiting lines in banks, hospitals, passport/public offices, universities, and utility centers waste millions of productive hours, create overcrowding, and offer customers zero visibility into when they will actually be served.

**Virtual Queue** is a full-stack, real-time, horizontally scalable SaaS platform that replaces physical queues with a unified digital queue engine. Customers can book remote tokens from anywhere, monitor their live queue position and approximate waiting time over WebSockets, receive travel-time-aware leave alerts with 3D map routing, check in at the venue using cryptographically signed QR codes, and recover missed turns fairly through controlled Snooze and Late Pass mechanisms. Walk-in customers without smartphones are served equally through a dedicated full-screen Kiosk interface that feeds into the exact same atomic queue.

For organizations, Virtual Queue provides a low-friction **Counter Staff Desk**, an **Organization Admin Console** with live Recharts operational analytics and immutable append-only audit logs, and a **Public Display Board** featuring automated Web Speech API voice announcements.

---

## 2. Problem Statement

Traditional physical and basic ticket-dispenser queues suffer from five systemic failures:
1. **Blind Waiting:** Customers must arrive early and wait on-site because they do not know current throughput or queue length.
2. **Digital Exclusion:** Purely app-based systems exclude elderly or walk-in visitors without smartphones.
3. **Queue Manipulation & Starvation:** Uncontrolled VIP/priority lanes starve standard customers indefinitely, while unpoliced re-entry allows abuse.
4. **No-Show Bottlenecks:** Counters sit idle when called customers are absent without a structured recall and grace-period workflow.
5. **Single-Point Bottlenecks:** Naive in-memory counters fail under concurrent load or multi-instance horizontal scaling, producing duplicate token numbers.

---

## 3. Project Objectives & Scope

### Included Core & Extended Scope
- Multi-tenant **Organization & Service Discovery** with 3D interactive maps (MapLibre GL JS / MapTiler / Google Maps / OSM).
- **Five Dedicated Interfaces:** Customer Web App, Self-Service Kiosk & Guest Tracker, Counter Staff Desk, Organization Admin Console, and Public TV Display Board.
- **Concurrency-Safe Token Engine:** Atomic Redis `INCR` with automatic MongoDB `TokenCounter` fallback.
- **Fairness Policies:** Explicit state machine, anti-starvation priority aging, 2-recall + 3-minute No-Show automation, one-time Late Pass (5 places back), controlled Snooze, and monthly remote quotas.
- **Smart Features:** Exponential Moving Average (EMA) waiting-time estimation, OpenRouteService/Haversine travel-time leave alerts, multi-channel notifications (In-App, Web Push VAPID, Email SMTP), and a guarded AI Assistant (Google Gemini / OpenAI / rule-based fallback).
- **Monetized Quota Extension (Optional):** 3 free remote tokens/month per organization, with +5 extra token packs via Stripe, SSLCommerz, or bKash.
- **Horizontal Scalability:** Stateless backend instances behind an Nginx Load Balancer with `ip_hash` sticky sessions and Socket.IO Redis Adapter.

### Explicit Out-of-Scope Boundaries
- Native iOS/Android mobile apps (addressed via installable PWA + Lite Mode).
- SMS/USSD booking, bank core / HIS / national ID integrations, and biometric/facial recognition.

---

## 4. High-Level System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER (Next.js 15)                  │
│  Customer App  │  Kiosk Mode  │  Staff Desk  │  Admin Console  │  TV DB │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS / WSS
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                LOAD BALANCER (Nginx — infra/nginx/nginx.conf)           │
│   • ip_hash sticky sessions     • WebSocket Upgrade (/socket.io/)       │
│   • /api/health failover        • TLS termination ready                 │
└───────────────┬─────────────────────────────────────────┬───────────────┘
                │                                         │
                ▼                                         ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│   Backend Instance 1 (Node)   │         │   Backend Instance 2 (Node)   │
│   Express 5 + Socket.IO       │         │   Express 5 + Socket.IO       │
│   Cron + Services             │         │   Cron + Services             │
└───────────────┬───────────────┘         └───────────────┬───────────────┘
                │                                         │
                └────────────────────┬────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     Redis (Upstash / Local)     │     │       MongoDB (Atlas / Local)   │
│ • Atomic INCR token counters    │     │ • 13 Mongoose Schemas & Indexes │
│ • Socket.IO Redis Pub/Sub       │     │ • Atomic TokenCounter Fallback  │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

### Architectural Principles
1. **Stateless Application Tier:** No queue state, session state, or authoritative token sequence is stored in Node.js memory. JWT access tokens (15m) and MongoDB-backed `tokenVersion` checks allow any backend instance to authenticate any request.
2. **Next.js API Rewrite Proxy:** `frontend/next.config.ts` proxies `/api/*` to `NEXT_PUBLIC_BACKEND_ORIGIN`, keeping HttpOnly refresh cookies first-party.
3. **Graceful Connection Draining:** `backend/src/index.ts` handles `SIGTERM` and `SIGINT` by stopping cron jobs, closing the HTTP server to new requests, and cleanly disconnecting Redis and MongoDB.

---

## 5. Database Design (13 Mongoose Models)

| Collection | Key Fields & Constraints | Purpose |
|---|---|---|
| `User` | `name`, `phone` (unique), `email`, `passwordHash`, `role` (`CUSTOMER` \| `STAFF` \| `ADMIN`), `organizationId`, `tokenVersion`, `notificationPreferences` | Identity, RBAC, and refresh-token revocation |
| `Organization` | `name`, `type`, `location` (`address`, `city`, `lat`, `lng`), `workingHours`, `adminId`, `status`, `entranceQrCode` | Multi-tenant organization profiles |
| `Service` | `organizationId`, `name`, `codePrefix`, `avgServiceTimeSec`, `emaServiceTimeSec`, `monthlyQuota` (default 3), `maxSnoozes`, `priorityPolicy` | Queue configuration & EMA tracking |
| `Counter` | `organizationId`, `name`, `counterNumber` (unique per org), `assignedServices`, `assignedStaff`, `status`, `currentTokenId` | Physical/virtual service desks |
| `Token` | `organizationId`, `serviceId`, `userId`, `counterId`, `tokenNumber`, `sequenceNumber`, `queueDate`, `source`, `priority`, `queueOrderScore`, `status`, `trackingCode` (unique), `latePassUsed`, `snoozeCount`, `recallCount` | Core queue unit with unique compound index `(serviceId, queueDate, sequenceNumber)` |
| `TokenCounter` | `serviceId`, `date`, `sequence` (unique `(serviceId, date)`) | Atomic MongoDB fallback counter |
| `MonthlyUsage` | `userId`, `organizationId`, `month`, `remoteUsed`, `paidExtraQuota`, `strikes` | Monthly quota & no-show strike enforcement |
| `ServiceLog` | `organizationId`, `serviceId`, `counterId`, `tokenId` (unique), `durationSec`, `waitTimeSec`, `hourOfDay` | Historical throughput & analytics aggregations |
| `AuditLog` | `organizationId`, `actorId`, `actorRole`, `action`, `tokenId`, `counterId`, `previousState`, `newState`, `metadata` | **Append-only** log (Mongoose hooks throw on update/delete) |
| `Notification` | `userId`, `type`, `title`, `message`, `read`, `dedupeKey` (unique sparse), 30-day TTL | Deduplicated in-app notification feed |
| `PushSubscription` | `userId`, `endpoint` (unique), `keys` (`p256dh`, `auth`) | Web Push VAPID endpoints |
| `Announcement` | `organizationId`, `serviceId`, `authorId`, `message`, 24-hour TTL | Live display board announcements |
| `PaymentTransaction` | `userId`, `organizationId`, `provider` (`STRIPE` \| `SSLCOMMERZ` \| `BKASH`), `providerSessionId` (unique), `tokensUnlocked`, `status` | Idempotent payment audit & quota unlock |

---

## 6. Core Algorithms & Business Logic

### 6.1 Token Lifecycle State Machine (`backend/src/services/tokenEngine.ts`)
Arbitrary status updates are rejected by an explicit transition matrix:
- `WAITING` → `CHECKED_IN` | `CALLED` | `CANCELLED`
- `CHECKED_IN` → `CALLED` | `CANCELLED`
- `CALLED` → `SERVING` | `NO_SHOW` | `SKIPPED`
- `SERVING` → `COMPLETED` | `SKIPPED`
- `NO_SHOW` → `CHECKED_IN` *(permitted **only once** via Late Pass)*
- `COMPLETED`, `CANCELLED`, `SKIPPED` → Terminal states

### 6.2 Anti-Starvation Priority Aging & Queue Ordering
Eligible tokens are sorted by:
1. **Effective Priority (DESC):** `min(maxPriorityLevel, basePriority + floor(waitedMinutes / agingMinutes))`
2. **`queueOrderScore` (ASC):** Initialized to `Date.now()`; shifted forward by Snooze or placed **5 places behind** the head of the active queue by Late Pass.
3. **`sequenceNumber` (ASC):** Deterministic FCFS tie-breaker.

### 6.3 Waiting Time Estimation Engine (`backend/src/services/etaService.ts`)
- **EMA Update:** On each `COMPLETED` token, `emaServiceTimeSec = round(0.25 * observedDuration + 0.75 * previousEma)`.
- **Estimate:** `waitSeconds = (peopleAhead * emaServiceTimeSec) / activeCounters`, with safe guards for 0 people ahead (`0s`), paused services (`0s`), and 0 active counters (single-counter fallback).

### 6.4 Automated No-Show Enforcement (`backend/src/services/cronService.ts`)
A `node-cron` job runs every minute, identifies `CALLED` tokens with `recallCount >= 2` and `> 3 minutes` elapsed since their last recall/call, transitions them to `NO_SHOW`, releases the counter, increments `MonthlyUsage.strikes`, emits Socket.IO updates, and notifies the customer.

---

## 7. Real-Time & Security Architecture

### Socket.IO Rooms & Cross-Instance Sync (`backend/src/services/socketService.ts`)
- **Rooms:** `user:{userId}`, `organization:{organizationId}`, `service:{serviceId}`, and `counter:{counterId}` (restricted to authenticated `STAFF` / `ADMIN` sockets).
- **Events:** `token:created`, `token:updated`, `queue:updated`, `token:called`, `token:recalled`, `token:completed`, `token:cancelled`, `counter:updated`, `announcement:created`.
- **Multi-Instance Pub/Sub:** Attaches `@socket.io/redis-adapter` when `REDIS_URL` is configured.

### Security Controls
- **Passwords & Tokens:** `bcryptjs` hashing; 15-minute JWT access tokens; 7-day rotating `HttpOnly` refresh cookies validated against `User.tokenVersion`.
- **QR Anti-Spoofing:** Entrance QR codes are base64url payloads signed with HMAC-SHA256 (`QR_SIGNING_SECRET`) and expiration timestamps, verified via `crypto.timingSafeEqual`.
- **Hardening:** `helmet`, strict `cors`, `express-rate-limit` (separate strict limiter for `/api/auth/*`), Zod input & environment validation (`env.ts` fails fast in `production` if secrets are missing or `< 32` chars), cross-tenant IDOR guards (`assertOrgAccess`, `assertCounterAccess`), and authenticated `/api/admin/system-status` (keeping public `/api/health` minimal).
- **Database High Availability & Payment Recovery:** Ordered PSS (`PRIMARY -> SECONDARY_1 -> SECONDARY_2`) failover with `retryWrites: true, w: 'majority'` (requiring a MongoDB Replica Set in production to prevent split-brain), plus crash-safe `PaymentTransaction.quotaFulfilled` recovery (`recoverPendingQuotaFulfillments()`).
- **Zero Frontend Secret Exposure:** All private keys reside in `backend/.env`; `frontend/.env.local` contains only safe `NEXT_PUBLIC_*` keys.

---

## 8. Five-Interface Functional Summary

| Interface | Route(s) | Key Capabilities |
|---|---|---|
| **Customer Web App** | `/`, `/organizations`, `/dashboard`, `/history`, `/tokens/[id]`, `/billing` | Remote booking, 3D Map & route preview, live Socket.IO tracker, QR check-in, Leave Alert, Snooze, Late Pass, Rating & Feedback Modal, Accessibility Mode (`A+`), Stripe/SSLCommerz/bKash sandbox quota unlock, AI Assistant |
| **Kiosk & Guest** | `/kiosk`, `/track/[trackingCode]` | Accountless touch booking into the shared queue, `EN \| বাংলা` bilingual UI, printable QR slip, 30s auto-reset |
| **Staff Desk** | `/staff` | Call Next, Recall (max 2), Start, Complete, Skip/No-Show, Transfer, Pause/Resume Counter, Walk-in & Manual Fallback tokens, Announcements |
| **Admin Console** | `/admin` | Live Active Queue + `Done (Complete)`, KPI overview, Recharts daily/peak-hour/service-popularity/counter-utilization analytics, **System Status** dashboard (`/api/admin/system-status`), Org/Service/Counter/Staff CRUD, Entrance QR generator, Audit Logs |
| **Display Board** | `/display/[organizationId]` | Real-time Now Serving & Recently Called, `EN \| বাংলা` bilingual UI, announcements ticker, Web Speech API voice announcements with deduplication & mute control |

---

## 9. Verification & Test Evidence

### Automated Test Suite (`npm run test:coverage --workspace=backend` — Vitest + Supertest + MongoMemoryServer)
**Result: 17 Test Files Passed, 26 Tests Passed (0 Failed)**  
**v8 Code Coverage:** Overall `53.3%` statements / `73.33%` functions (`tokenEngine.ts` `74.72%`, `etaService.ts` `89.32%`, `scheduleService.ts` `89.83%`, `qrService.ts` `81.25%`, `auditService.ts` `100%`, `metricsService.ts` `86.95%`).
- **Unit Tests (7 files, 15 tests):**
  - `stateMachine.test.ts` (2), `queueOrdering.test.ts` (2), `etaService.test.ts` (2), `qrService.test.ts` (3), `envValidation.test.ts` (2), `scheduleService.test.ts` (2), `timezone.test.ts` (2).
- **Integration, Concurrency & Security Tests (10 files, 11 tests):**
  - `authAndSecurity.test.ts` (1), `tokenLifecycle.test.ts` (1), `concurrency.test.ts` (1 — 100 simultaneous requests, 0 duplicates), `faultTolerance.test.ts` (1 — 2 stateless instances without Redis, 0 duplicates), `securityAudit.test.ts` (1 — cross-tenant IDOR & payment idempotency), `billing.test.ts` (1 — quota + crash recovery), `disasterRecovery.test.ts` (1), `resilienceAndPrivacy.test.ts` (1 — counter pause release, QR replay, guest PII mask, `/api/health` vs `/api/admin/system-status`), `edgeCasesAndSocket.test.ts` (1 — token transfer, simultaneous `call-next`, multi-instance no-show cron race, duplicate rating `409` & XSS stripping), `pssFailover.test.ts` (2 — Primary → Secondary 1 → Secondary 2 failover).

### Build & Typecheck Verification
- `npm run build` (`backend` `tsc -p tsconfig.json` + `frontend` `next build` across 16 routes): **Passed (0 errors)**.
- `npm run typecheck` (`backend` + `frontend` `tsc --noEmit`): **Passed (0 errors)**.
- **Additional Documentation:** See `FINAL_PROJECT_AUDIT_REPORT.md`, `docs/BACKUP_AND_RECOVERY.md`, and `docs/TRACEABILITY_AND_PATTERNS.md`.

---

## 10. Known Limitations & Deployment Readiness

1. **Docker & k6 Load Testing:** `infra/docker-compose.yml`, `infra/nginx/nginx.conf`, and `infra/k6/load-test.js` (500-VU script) are configured and version-controlled, but were not executed in this local Windows environment because `k6` and a running Docker daemon were unavailable.
2. **Browser E2E & DAST:** End-to-end flows and RBAC were verified via Supertest integration tests; Playwright browser automation and OWASP ZAP scans were not run locally.
3. **External Credentials:** In local dev, `MongoMemoryServer` provides an automatic fallback if MongoDB Atlas Network Access blocks the local IP, and SSLCommerz/bKash support built-in sandbox simulation when live merchant keys are absent.
4. **Cloud Deployment Blueprint:**
   - **Frontend:** Vercel (Root Directory: `frontend`)
   - **Backend:** Render / Railway (Root Directory: `backend`) or Docker Compose + Nginx LB
   - **Database & Cache:** MongoDB Atlas + Upstash Redis (`rediss://`)
   - **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`)
