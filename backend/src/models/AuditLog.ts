import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  action: string;
  tokenId?: mongoose.Types.ObjectId;
  counterId?: mongoose.Types.ObjectId;
  previousState?: string;
  newState?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    tokenId: { type: Schema.Types.ObjectId, ref: 'Token', index: true },
    counterId: { type: Schema.Types.ObjectId, ref: 'Counter', index: true },
    previousState: { type: String },
    newState: { type: String },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false }
);

// Append-only: block updates/deletes via Mongoose hooks
auditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'deleteOne', 'findOneAndDelete'], function () {
  throw new Error('Audit logs are append-only and cannot be modified or deleted.');
});

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
