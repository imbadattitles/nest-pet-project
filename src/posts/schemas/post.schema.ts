import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, HydratedDocument } from 'mongoose';

export type PostDocument = HydratedDocument<Post>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Post extends Document {
  @Prop({
    required: [true, 'Заголовок обязателен'],
    trim: true,
    minlength: [3, 'Заголовок должен быть минимум 3 символа'],
    maxlength: [200, 'Заголовок должен быть максимум 200 символов'],
  })
  title: string;

  @Prop({
    required: [true, 'Содержание обязательно'],
    minlength: [10, 'Содержание должно быть минимум 10 символов'],
  })
  content: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: [true, 'Автор обязателен'],
  })
  author: Types.ObjectId;

  @Prop({
    default: null
  })
  imageUrl: string;

  @Prop({
    default: 0,
  })
  commentsCount: number; // Денормализованное поле для быстрого подсчета

  @Prop({
    default: [],
    type: [String]
  })
  contentImages: string[];
  // ---------- НОВОЕ: ПОЛЕ ЛАЙКОВ ----------
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,// 1️⃣ индекс для быстрой проверки "лайкал ли юзер"
  })
  likes: Types.ObjectId[];

  // ---------- НОВОЕ: ДЕНОРМАЛИЗОВАННЫЙ СЧЁТЧИК ----------
  @Prop({
    default: 0,
    index: true,// 2️⃣ индекс для сортировки по популярности
  })
  likesCount: number;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Виртуальное поле для комментариев
PostSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'post',
  options: { sort: { createdAt: -1 } },
});

// ---------- ИНДЕКСЫ ----------
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ title: 'text', content: 'text' });

// 🔥 Основной индекс для выдачи "популярных" записей
PostSchema.index({ likesCount: -1, createdAt: -1 });
