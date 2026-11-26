import mongoose, { Schema, Document } from 'mongoose';

export interface ITokenCounter extends Document {
  serviceId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  sequence: number;
}

const tokenCounterSchema = new Schema<ITokenCounter>({
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  date: { type: String, required: true },
  sequence: { type: Number, default: 0 },
});

tokenCounterSchema.index({ serviceId: 1, date: 1 }, { unique: true });

export const TokenCounter = mongoose.model<ITokenCounter>('TokenCounter', tokenCounterSchema);
