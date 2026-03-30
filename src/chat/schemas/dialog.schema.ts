import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Message } from './message.schema';
import { HydratedDocument } from 'mongoose';

export type DialogDocument = HydratedDocument<Dialog & {
  createdAt: Date;
  updatedAt: Date;
}>;

@Schema({ timestamps: true })
export class Dialog extends Document {
  @Prop({ required: true, enum: ['private', 'group'] })
  type: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  participants: Types.ObjectId[];

  @Prop({ trim: true, maxlength: 100 })
  groupName?: string;

  @Prop({ default: '' })
  groupAvatar?: string;

  @Prop({ maxlength: 500 })
  groupDescription?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessage?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastMessageSender?: Types.ObjectId;

  @Prop({ type: Map, of: Number, default: {} })
  unreadCount: Map<string, number>;

  @Prop({ type: Map, of: Object, default: {} })
  userSettings: Map<string, {
    muted: boolean;
    pinned: boolean;
    nickname?: string;
    joinedAt: Date;
  }>;

  @Prop({ default: true })
  isActive: boolean;
}

export const DialogSchema = SchemaFactory.createForClass(Dialog);

// Индексы
DialogSchema.index({ participants: 1 });
DialogSchema.index({ type: 1, participants: 1 });
DialogSchema.index({ lastMessageTime: -1 });

