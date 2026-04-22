import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, HydratedDocument } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Comment extends Document {
  @Prop({
    required: [true, 'Текст комментария обязателен'],
    trim: true,
    minlength: [1, 'Комментарий не может быть пустым'],
    maxlength: [1000, 'Комментарий не может быть длиннее 1000 символов'],
  })
  content: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  author: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Post',
    required: true,
  })
  post: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Comment',
    default: null,
  })
  parentComment: Types.ObjectId | null; // null для корневых комментариев

  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: [],
  })
  likes: Types.ObjectId[]; // Кто лайкнул комментарий

  @Prop({
    default: 0,
    min: 0,
  })
  likesCount: number;

  @Prop({
    default: false,
  })
  isEdited: boolean;

  @Prop()
  editedAt: Date;

  @Prop({
    default: false,
  })
  isDeleted: boolean; // Soft delete

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  deletedBy: Types.ObjectId | null;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// Индексы для оптимизации запросов
// Индексы для оптимизации запросов - объявляем ВСЕ индексы здесь
CommentSchema.index({ post: 1, createdAt: -1 }); // Для получения комментариев поста
CommentSchema.index({ parentComment: 1 }); // Для получения ответов на комментарий
CommentSchema.index({ author: 1, createdAt: -1 }); // Для получения комментариев пользователя
CommentSchema.index({ post: 1, parentComment: 1 }); // Составной индекс

// Виртуальное поле для подсчета ответов
CommentSchema.virtual('repliesCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment',
  count: true,
});

// Виртуальное поле для получения ответов
CommentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment',
  options: { sort: { createdAt: 1 } }, // Сортировка по дате
});
