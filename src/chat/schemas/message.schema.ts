import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Dialog } from './dialog.schema';
import { TimestampDocument } from 'src/types/mongoose.types';

export type MessageDocument = HydratedDocument<Message & {
  createdAt: Date;
  updatedAt: Date;
}>;

class ReadBy {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ default: Date.now })
  readAt: Date;
}

class Attachment {
  @Prop({ required: true, enum: ['image', 'video', 'file', 'audio'] })
  type: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  name?: string;

  @Prop()
  size?: number;

  @Prop()
  mimeType?: string;

  @Prop()
  duration?: number;
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Dialog', required: true, index: true })
  dialogId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  receiverId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 5000 })
  text?: string;

  @Prop({ type: [ReadBy], default: [] })
  readBy: ReadBy[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  deliveredTo: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  pendingFor: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  replyTo?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentions: Types.ObjectId[];

  @Prop({ type: Map, of: Boolean, select: false, default: {} })
  isDeleted?: Map<string, boolean>;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  deletedBy: Types.ObjectId[];

  @Prop({ type: [Attachment], default: [] })
  attachments: Attachment[];

  @Prop({ default: false })
  isSystem: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
// Включаем виртуальные поля при преобразовании в JSON/объект
MessageSchema.set('toJSON', { virtuals: true });
MessageSchema.set('toObject', { virtuals: true });
MessageSchema.virtual('sender', {
  ref: 'User',           // ссылаемся на модель User
  localField: 'senderId', // поле в текущей модели
  foreignField: '_id',    // поле в модели User
  justOne: true          // так как это один пользователь, а не массив
});

// Индексы
MessageSchema.index({ dialogId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ mentions: 1 });
MessageSchema.index({ dialogId: 1, "isDeleted.userId": 1, createdAt: -1 });