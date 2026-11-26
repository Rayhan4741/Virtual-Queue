import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  tokenId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  read: boolean;
  dedupeKey?: string;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenId: { type: Schema.Types.ObjectId, ref: 'Token' },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false, index: true },
  dedupeKey: { type: String, sparse: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // 30-day TTL
});

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
