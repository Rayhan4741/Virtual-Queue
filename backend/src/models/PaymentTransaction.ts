import mongoose, { Schema, Document } from 'mongoose';

export type PaymentProvider = 'STRIPE' | 'SSLCOMMERZ' | 'BKASH';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface IPaymentTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  provider: PaymentProvider;
  providerSessionId: string;
  amount: number;
  currency: string;
  tokensUnlocked: number;
  month: string;
  status: PaymentStatus;
  quotaFulfilled: boolean;
  quotaFulfilledAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    provider: { type: String, enum: ['STRIPE', 'SSLCOMMERZ', 'BKASH'], required: true },
    providerSessionId: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' },
    tokensUnlocked: { type: Number, required: true, default: 5 },
    month: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING', index: true },
    quotaFulfilled: { type: Boolean, default: false, index: true },
    quotaFulfilledAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const PaymentTransaction = mongoose.model<IPaymentTransaction>('PaymentTransaction', paymentTransactionSchema);
