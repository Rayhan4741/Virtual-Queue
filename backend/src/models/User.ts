import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';

export interface IUser extends Document {
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  organizationId?: mongoose.Types.ObjectId;
  tokenVersion: number;
  status: AccountStatus;
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  notificationPreferences: {
    inApp: boolean;
    webPush: boolean;
    email: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['CUSTOMER', 'STAFF', 'ADMIN'], default: 'CUSTOMER', index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    tokenVersion: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    resetTokenHash: { type: String },
    resetTokenExpires: { type: Date },
    notificationPreferences: {
      inApp: { type: Boolean, default: true },
      webPush: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
