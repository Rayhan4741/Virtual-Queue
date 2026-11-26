import mongoose, { Schema, Document } from 'mongoose';

export interface IBranch extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  location: {
    address: string;
    city: string;
    lat?: number;
    lng?: number;
  };
  timezone: string;
  workingHours: {
    open: string;
    close: string;
    days: string[];
  };
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}

const branchSchema = new Schema<IBranch>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 12 },
    location: {
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      lat: { type: Number },
      lng: { type: Number },
    },
    timezone: { type: String, default: 'Asia/Dhaka' },
    workingHours: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '17:00' },
      days: { type: [String], default: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] },
    },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

branchSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export const Branch = mongoose.model<IBranch>('Branch', branchSchema);
