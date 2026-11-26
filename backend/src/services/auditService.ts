import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';

export interface AuditEntryInput {
  organizationId: string | mongoose.Types.ObjectId;
  actorId: string | mongoose.Types.ObjectId;
  actorRole: string;
  action: string;
  tokenId?: string | mongoose.Types.ObjectId;
  counterId?: string | mongoose.Types.ObjectId;
  previousState?: string;
  newState?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(entry: AuditEntryInput): Promise<void> {
  await AuditLog.create({
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    tokenId: entry.tokenId,
    counterId: entry.counterId,
    previousState: entry.previousState,
    newState: entry.newState,
    metadata: entry.metadata,
  });
}
