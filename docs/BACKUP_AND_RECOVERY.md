# Database Backup, Restore & Data Retention Policy

## 1. Backup Policy
- **Managed Cloud (MongoDB Atlas M10+ in Production):** Enable **Continuous Cloud Backup** with point-in-time recovery (PITR) and automated daily snapshots retained for 30 days, plus weekly snapshots retained for 90 days.
- **Logical Export (M0 / Self-Hosted):** Schedule daily `mongodump --uri="$MONGODB_URI" --archive=vq_$(date +%F).gz --gzip` to encrypted off-site object storage (S3 / Cloudflare R2).

## 2. Restore Procedure & Accidental Deletion Recovery
1. Stop write traffic (or put backend instances into maintenance mode).
2. Restore to a staging cluster first:
   ```bash
   mongorestore --uri="$STAGING_MONGODB_URI" --archive=vq_YYYY-MM-DD.gz --gzip --drop
   ```
3. Verify collection counts (`users`, `organizations`, `tokens`, `tokencounters`, `auditlogs`, `paymenttransactions`).
4. Run `recoverQueueStateOnStartup()` to reconcile `Counter.currentTokenId` and `Redis` `TokenCounter` sequences before resuming traffic.

## 3. Data Retention & Audit Log Policy
| Collection | Retention | Mechanism |
|---|---|---|
| `Notification` | 30 days | MongoDB TTL index (`createdAt`, `expires: 2592000`) |
| `Announcement` | 24 hours | MongoDB TTL index (`createdAt`, `expires: 86400`) |
| `AuditLog` | Minimum 1 year (immutable) | Append-only Mongoose pre-hooks + DB-level `insert`/`find`-only RBAC role in production |
| `PaymentTransaction` | Minimum 5 years | Retained for financial reconciliation & dispute resolution |
| `Token` / `ServiceLog` | 1 year active, archive older | Indexed by `queueDate` / `completedAt` |

## 4. Recovery Testing Status (Honest Verification Note)
- **Tested Locally:** Application-level crash recovery (`recoverQueueStateOnStartup()` in `disasterRecovery.test.ts`) and PSS failover (`pssFailover.test.ts`) are verified via automated Vitest integration tests against `MongoMemoryServer`.
- **Not Yet Executed:** A live production MongoDB Atlas snapshot restore drill has **not** been executed in this local environment; schedule a staging restore drill prior to production launch.
