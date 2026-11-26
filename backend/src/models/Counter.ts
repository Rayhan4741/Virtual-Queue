import mongoose, { Schema, Document } from 'mongoose';

export type CounterStatus = 'ACTIVE' | 'PAUSED' | 'INACTIVE';

export interface ICounter extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  counterNumber: number;
  assignedServices: mongoose.Types.ObjectId[];
  assignedStaff?: mongoose.Types.ObjectId;
  status: CounterStatus;
  currentTokenId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const counterSchema = new Schema<ICounter>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    counterNumber: { type: Number, required: true, min: 1 },
    assignedServices: [{ type: Schema.Types.ObjectId, ref: 'Service', index: true }],
    assignedStaff: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    status: { type: String, enum: ['ACTIVE', 'PAUSED', 'INACTIVE'], default: 'ACTIVE', index: true },
    currentTokenId: { type: Schema.Types.ObjectId, ref: 'Token', default: null },
  },
  { timestamps: true }
);

counterSchema.index({ organizationId: 1, counterNumber: 1 }, { unique: true });

export const Counter = mongoose.model<ICounter>('Counter', counterSchema);
