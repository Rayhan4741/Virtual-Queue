import mongoose, { Schema, Document } from 'mongoose';

export interface IMonthlyUsage extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  month: string; // YYYY-MM
  remoteUsed: number;
  paidExtraQuota: number;
  strikes: number;
  updatedAt: Date;
}

const monthlyUsageSchema = new Schema<IMonthlyUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    month: { type: String, required: true },
    remoteUsed: { type: Number, default: 0, min: 0 },
    paidExtraQuota: { type: Number, default: 0, min: 0 },
    strikes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

monthlyUsageSchema.index({ userId: 1, organizationId: 1, month: 1 }, { unique: true });

export const MonthlyUsage = mongoose.model<IMonthlyUsage>('MonthlyUsage', monthlyUsageSchema);
