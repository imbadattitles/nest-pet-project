import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, HydratedDocument } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class RefreshToken extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  token: string;

  @Prop({
    required: true,
  })
  expiresAt: Date;

  @Prop({
    default: true,
  })
  isValid: boolean;

  @Prop()
  userAgent?: string;

  @Prop()
  ipAddress?: string;

  @Prop({
    type: Date,
    default: null,
  })
  revokedAt?: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// TTL index для автоматического удаления истекших токенов
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });