import mongoose, { Schema, Document } from 'mongoose';

export interface IServiceLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  counterId: mongoose.Types.ObjectId;
  tokenId: mongoose.Types.ObjectId;
  durationSec: number;
  waitTimeSec: number;
  hourOfDay: number;
  completedAt: Date;
}

const serviceLogSchema = new Schema<IServiceLog>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
  counterId: { type: Schema.Types.ObjectId, ref: 'Counter', required: true, index: true },
  tokenId: { type: Schema.Types.ObjectId, ref: 'Token', required: true, unique: true },
  durationSec: { type: Number, required: true, min: 0 },
  waitTimeSec: { type: Number, required: true, min: 0 },
  hourOfDay: { type: Number, required: true, min: 0, max: 23, index: true },
  completedAt: { type: Date, default: Date.now, index: true },
});

serviceLogSchema.index({ organizationId: 1, completedAt: -1 });

export const ServiceLog = mongoose.model<IServiceLog>('ServiceLog', serviceLogSchema);
