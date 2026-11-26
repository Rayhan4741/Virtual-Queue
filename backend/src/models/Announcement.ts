import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  organizationId: mongoose.Types.ObjectId;
  serviceId?: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  message: string;
  active: boolean;
  createdAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, maxlength: 300 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }, // 24-hour TTL
});

export const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema);
