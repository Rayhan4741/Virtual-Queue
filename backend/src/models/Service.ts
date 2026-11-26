import mongoose, { Schema, Document } from 'mongoose';

export interface IService extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  codePrefix: string;
  description?: string;
  avgServiceTimeSec: number;
  emaServiceTimeSec: number;
  isAvailable: boolean;
  remoteBookingEnabled: boolean;
  monthlyQuota: number;
  maxSnoozes: number;
  snoozeDelayMinutes: number;
  priorityPolicy: {
    enabled: boolean;
    agingMinutes: number;
    maxPriorityLevel: number;
  };
  workingHours: {
    open: string;
    close: string;
  };
  eligibilityRules?: string;
  createdAt: Date;
  updatedAt: Date;
}

const serviceSchema = new Schema<IService>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    codePrefix: { type: String, required: true, trim: true, uppercase: true, maxlength: 4, default: 'A' },
    description: { type: String, trim: true, maxlength: 500 },
    avgServiceTimeSec: { type: Number, required: true, min: 30, max: 7200, default: 300 },
    emaServiceTimeSec: { type: Number, min: 30, max: 7200, default: 300 },
    isAvailable: { type: Boolean, default: true, index: true },
    remoteBookingEnabled: { type: Boolean, default: true },
    monthlyQuota: { type: Number, default: 3, min: 0 },
    maxSnoozes: { type: Number, default: 2, min: 0, max: 5 },
    snoozeDelayMinutes: { type: Number, default: 10, min: 2, max: 60 },
    priorityPolicy: {
      enabled: { type: Boolean, default: true },
      agingMinutes: { type: Number, default: 15, min: 1 },
      maxPriorityLevel: { type: Number, default: 3, min: 0, max: 5 },
    },
    workingHours: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '17:00' },
    },
    eligibilityRules: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

serviceSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const Service = mongoose.model<IService>('Service', serviceSchema);
