# Proposal Traceability & Design Patterns Mapping — Virtual Queue

## 1. Core Proposal Requirement Traceability

| Proposal Area | Status | Code & Verification Evidence |
|---|---|---|
| **Five Dedicated Interfaces** (Customer, Kiosk, Staff, Admin, Display) | **PASS** | `frontend/src/app/{dashboard,kiosk,staff,admin,display/[organizationId]}/page.tsx`, `npm run build` |
| **Atomic Token Engine & Redis/MongoDB Fallback** | **PASS** | `backend/src/services/tokenEngine.ts`, `concurrency.test.ts` (100 concurrent tokens, 0 duplicates), `faultTolerance.test.ts` |
| **Queue Fairness** (State machine, Priority Aging, 2-Recall, 3-Min No-Show, Snooze, Late Pass) | **PASS** | `tokenEngine.ts`, `stateMachine.test.ts`, `queueOrdering.test.ts`, `tokenLifecycle.test.ts` |
| **Signed QR Entrance Check-In & Replay Prevention** | **PASS** | `qrService.ts`, `qrService.test.ts`, `resilienceAndPrivacy.test.ts` |
| **EMA Waiting-Time Estimation & Leave Alerts** | **PASS** | `etaService.ts`, `etaService.test.ts`, `travelService.ts` |
| **Multi-Channel Notifications** (In-App, Web Push VAPID, Email SMTP) | **PASS** | `notificationService.ts`, `Notification` model, `socket.ts` |
| **Real-Time Socket.IO + Redis Adapter + Reconnect Resync** | **PASS** | `backend/src/config/socket.ts`, `frontend/src/app/tokens/[id]/page.tsx` |
| **Multi-Tenant Security, RBAC, IDOR Fixes & Audit Trail** | **PASS** | `auth.ts`, `staff.routes.ts`, `admin.routes.ts`, `authAndSecurity.test.ts`, `securityAudit.test.ts` |
| **Guarded AI Queue Assistant** | **PASS** | `backend/src/services/aiService.ts`, `backend/src/routes/ai.routes.ts` |
| **3D Interactive Map & Routing** | **PARTIAL** | `frontend/src/components/map/Map3D.tsx` (MapLibre GL JS); live road-traffic routing requires external OpenRouteService API key |
| **Analytics & Customer Feedback** | **PASS** | `analyticsService.ts`, `token.routes.ts` (`/rate`), `admin/page.tsx`, `history/page.tsx` |
| **API Documentation (Swagger / OpenAPI)** | **PASS** | `backend/src/config/swagger.ts` mounted at `/api/docs` |
| **Accessibility Mode (`A+`) & Bilingual (`EN \| বাংলা`) Kiosk/Display** | **PASS** | `LiteModeContext.tsx`, `globals.css`, `kiosk/page.tsx`, `display/[organizationId]/page.tsx` |
| **PSS Database Failover** | **PARTIAL (Local Verified)** | `backend/src/config/db.ts`, `pssFailover.test.ts` (MongoMemoryServer; live Atlas Replica Set drill pending staging) |
| **Optional Learning Extension: Sandbox Payment (Stripe/SSLCommerz/bKash)** | **PASS (Sandbox)** | `paymentService.ts`, `billing.test.ts` (crash recovery & idempotency verified; live merchant webhooks out of scope) |
| **Docker/Nginx Multi-Instance & k6 500–1000 VU Load Test** | **NOT EXECUTED** | Configs present in `infra/docker-compose.yml`, `infra/nginx/nginx.conf`, `infra/k6/load-test.js` (requires Docker/k6 staging runner) |

---

## 2. GoF Design Patterns Mapping

| Pattern | Implementation in Codebase | Purpose |
|---|---|---|
| **Singleton** | `backend/src/config/db.ts`, `redis.ts`, `metricsService.ts`, `socket.ts` | Single shared MongoDB connection manager, Redis client pool, metrics registry, and Socket.IO server per instance |
| **Factory** | `backend/src/services/paymentService.ts` (`initiateExtraTokenCheckout`) & `aiService.ts` | Selects Stripe / SSLCommerz / bKash checkout flow or Gemini / OpenAI / rule-based AI provider from runtime config |
| **Strategy** | `backend/src/services/tokenEngine.ts` (`issueToken` Redis vs MongoDB `TokenCounter`) & `travelService.ts` (OpenRouteService vs Haversine) | Interchangeable execution strategies with automatic fallback |
| **State** | `backend/src/services/tokenEngine.ts` (`ALLOWED_TRANSITIONS` matrix) | Enforces valid token lifecycle transitions (`WAITING -> CHECKED_IN -> CALLED -> SERVING -> COMPLETED`) |
| **Observer (Pub/Sub)** | `backend/src/config/socket.ts` + `@socket.io/redis-adapter` + `notificationService.ts` | Emits queue/counter/announcement events to subscribed organization, service, and token rooms |
| **Proxy / Middleware** | `backend/src/middleware/{auth,validate,rateLimiter,errorHandler}.ts` & `frontend/next.config.ts` | Guards routes via JWT/RBAC, Zod schemas, rate limits, and first-party `/api/*` cookie proxy |
| **Adapter** | `backend/src/config/socket.ts` (`createAdapter`) & `frontend/src/lib/api.ts` | Adapts Socket.IO pub/sub across Redis and normalizes fetch/refresh-token retries on the client |
| **Audit / Command Log** | `backend/src/services/auditService.ts` (`recordAuditLog`) & `AuditLog.ts` | Captures immutable-hooked state-changing commands with actor, role, previous/new state, and metadata |
