import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, HydratedDocument, SchemaTypes } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;
export type NotificationType =
  | 'administration'
  | 'postLike'
  | 'postComment'
  | 'commentLike'
  | 'commentAnswer';
@Schema({
  timestamps: true,
  versionKey: false,
})
export class Notification extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipient: Types.ObjectId; // кому
  @Prop({ type: String, default: null }) // <-- теперь просто String
  sender?: string; // ID отправителя или "system", "admin" и т.п.
  @Prop({
    required: true,
    enum: [
      'administration',
      'postLike',
      'commentAnswer',
      'postComment',
      'commentLike',
    ],
  })
  type: NotificationType;

  @Prop({ type: Types.ObjectId, refPath: 'onModel' })
  referenceId: Types.ObjectId; // ID сущности (пост, сообщение, запрос)

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: SchemaTypes.Mixed })
  payload: any; // дополнительная инфа (текст, картинка)
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// ---------- ИНДЕКСЫ ----------
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isRead: 1 });
