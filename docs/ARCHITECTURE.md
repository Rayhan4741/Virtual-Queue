# Virtual Queue — System Architecture

## 1. Horizontal Scaling & Load Balancing

```
Client (PWA / Kiosk / Display Board / Staff / Admin)
   │
   ▼  HTTPS / WSS
Nginx Load Balancer (ip_hash sticky sessions + WS Upgrade + /api/health failover)
   ├──► Backend Instance 1 (Node.js + Express + Socket.IO)
   └──► Backend Instance 2 (Node.js + Express + Socket.IO)
           │                          │
           ▼                          ▼
   Redis (INCR Atomic Counters, Socket.IO Redis Adapter)
           │
           ▼
   MongoDB Atlas (Primary Persistence + Atomic Counter Fallback)
```

### Stateless Backend Design
- Authentication uses short-lived JWT access tokens (15m) and rotating HttpOnly refresh cookies (`tokenVersion` checked in MongoDB).
- No authoritative queue state or token counter is stored in Node.js process memory.
- Socket.IO uses `@socket.io/redis-adapter` so events emitted on `backend-1` reach clients connected to `backend-2`.
- Graceful `SIGTERM` connection draining stops accepting new connections and closes DB/Redis cleanly.

## 2. Token Lifecycle State Machine
- `WAITING` → `CHECKED_IN` | `CALLED` | `CANCELLED`
- `CHECKED_IN` → `CALLED` | `CANCELLED`
- `CALLED` → `SERVING` | `NO_SHOW` | `SKIPPED`
- `SERVING` → `COMPLETED` | `SKIPPED`
- `NO_SHOW` → `CHECKED_IN` (One-time **Late Pass** recovery: moves 5 places back in queue)
- `COMPLETED`, `CANCELLED`, `SKIPPED` → Terminal states

## 4. Cloud Deployment & Hosting Notes
- **Frontend (Vercel):** Deploy `frontend/` (Next.js 15 App Router) with `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, and `NEXT_PUBLIC_BACKEND_ORIGIN` set in Vercel Environment Variables.
- **Backend (Render / Railway / Self-Hosted Nginx):**
  - Self-hosted Docker Compose (`infra/docker-compose.yml`) provides an explicit **Nginx Load Balancer** (`infra/nginx/nginx.conf`) with `ip_hash` sticky sessions, WebSocket upgrade headers, and `/api/health` failover across `backend-1` and `backend-2`.
  - On managed PaaS providers (Render / Railway) where a custom Nginx LB is not directly exposed, use the provider's managed horizontal scaling & WebSocket routing with `REDIS_URL` (Upstash Redis) so `@socket.io/redis-adapter` and atomic `INCR` counters coordinate across replicas.
- **Environment & Secrets:** See [ENVIRONMENT.md](./ENVIRONMENT.md) for variable definitions and secret generation.
