import mongoose, { Schema, Document } from 'mongoose';

export type TokenSource = 'REMOTE' | 'KIOSK' | 'GUEST' | 'STAFF';
export type TokenStatus =
  | 'WAITING'
  | 'CHECKED_IN'
  | 'CALLED'
  | 'SERVING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'SKIPPED';

export interface IToken extends Document {
  organizationId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  counterId?: mongoose.Types.ObjectId;
  tokenNumber: string;
  sequenceNumber: number;
  queueDate: string; // YYYY-MM-DD
  source: TokenSource;
  priority: number; // 0 = standard, 1..3 = priority tiers
  queueOrderScore: number; // lower = earlier in queue; adjusted by Late Pass / Snooze
  status: TokenStatus;
  guestName?: string;
  guestPhone?: string;
  trackingCode: string;
  checkedInAt?: Date;
  calledAt?: Date;
  servingStartedAt?: Date;
  completedAt?: Date;
  recallCount: number;
  lastRecalledAt?: Date;
  latePassUsed: boolean;
  snoozeCount: number;
  snoozedUntil?: Date;
  rating?: number;
  ratingComment?: string;
  manualFallback: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tokenSchema = new Schema<IToken>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    counterId: { type: Schema.Types.ObjectId, ref: 'Counter', index: true },
    tokenNumber: { type: String, required: true, trim: true },
    sequenceNumber: { type: Number, required: true },
    queueDate: { type: String, required: true, index: true },
    source: { type: String, enum: ['REMOTE', 'KIOSK', 'GUEST', 'STAFF'], required: true },
    priority: { type: Number, default: 0, min: 0, max: 5 },
    queueOrderScore: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ['WAITING', 'CHECKED_IN', 'CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'],
      default: 'WAITING',
      index: true,
    },
    guestName: { type: String, trim: true, maxlength: 100 },
    guestPhone: { type: String, trim: true, maxlength: 30 },
    trackingCode: { type: String, required: true, unique: true, index: true },
    checkedInAt: { type: Date },
    calledAt: { type: Date },
    servingStartedAt: { type: Date },
    completedAt: { type: Date },
    recallCount: { type: Number, default: 0, min: 0 },
    lastRecalledAt: { type: Date },
    latePassUsed: { type: Boolean, default: false },
    snoozeCount: { type: Number, default: 0, min: 0 },
    snoozedUntil: { type: Date },
    rating: { type: Number, min: 1, max: 5 },
    ratingComment: { type: String, trim: true, maxlength: 500 },
    manualFallback: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Zero duplicate token numbers per service per day
tokenSchema.index({ serviceId: 1, queueDate: 1, sequenceNumber: 1 }, { unique: true });
tokenSchema.index({ serviceId: 1, queueDate: 1, tokenNumber: 1 }, { unique: true });
tokenSchema.index({ serviceId: 1, status: 1, queueOrderScore: 1 });

export const Token = mongoose.model<IToken>('Token', tokenSchema);
