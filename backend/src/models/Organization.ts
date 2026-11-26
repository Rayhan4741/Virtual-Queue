import mongoose, { Schema, Document } from 'mongoose';

export type OrganizationType = 'BANK' | 'HOSPITAL' | 'PUBLIC_OFFICE' | 'UNIVERSITY' | 'UTILITY' | 'OTHER';
export type OrganizationStatus = 'ACTIVE' | 'INACTIVE';
export type SubscriptionPlan = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface IOrganization extends Document {
  name: string;
  type: OrganizationType;
  description?: string;
  timezone: string;
  plan: SubscriptionPlan;
  location: {
    address: string;
    city: string;
    lat?: number;
    lng?: number;
  };
  workingHours: {
    open: string;
    close: string;
    days: string[];
  };
  adminId: mongoose.Types.ObjectId;
  status: OrganizationStatus;
  entranceQrCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150, index: true },
    type: {
      type: String,
      enum: ['BANK', 'HOSPITAL', 'PUBLIC_OFFICE', 'UNIVERSITY', 'UTILITY', 'OTHER'],
      required: true,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 500 },
    timezone: { type: String, default: 'Asia/Dhaka' },
    plan: { type: String, enum: ['FREE', 'PRO', 'ENTERPRISE'], default: 'FREE' },
    location: {
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true, index: true },
      lat: { type: Number },
      lng: { type: Number },
    },
    workingHours: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '17:00' },
      days: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
    },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    entranceQrCode: { type: String, required: true },
  },
  { timestamps: true }
);

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
