import { Document } from 'mongoose';

export interface TimestampDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
}
