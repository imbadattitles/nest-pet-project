import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Query, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class User extends Document {
  @Prop({
    required: [true, 'Email обязателен'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Пожалуйста, введите корректный email',
    ],
  })
  email: string;

  @Prop({
    required: [true, 'Имя пользователя обязательно'],
    minlength: [3, 'Имя пользователя должно быть минимум 3 символа'],
    maxlength: [20, 'Имя пользователя должно быть максимум 20 символов'],
  })
  username: string;

  @Prop({
    unique: true,
    trim: true,
    minlength: [5, 'Имя пользователя должно быть минимум 5 символов'],
    maxlength: [20, 'Имя пользователя должно быть максимум 20 символов'],
  })
  nickname: string;

  @Prop({
    required: false,
    trim: true,
    maxlength: [500, 'Описание должно быть максимум 500 символов'],
  })
  about: string;

  @Prop({
    required: [true, 'Пароль обязателен'],
    minlength: [6, 'Пароль должен быть минимум 6 символов'],
    select: false,
  })
  password: string;

  @Prop({
    required: false,
  })
  avatar: string;

  @Prop({
    type: [String],
    default: [],
    select: false,
    ref: 'User',
  })
  contacts: string[]; // Список ID друзей или контактов

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Post' }],
    default: [],
    index: true,
  })
  savedPosts: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ username: 'text', email: 'text' });
// Хеширование пароля перед сохранением
UserSchema.pre<UserDocument>('save', async function () {
  if (!this.isModified('password')) {
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {}
});
UserSchema.pre<Query<any, UserDocument>>('findOneAndUpdate', async function () {
  const update = this.getUpdate() as any;
  if (update?.password) {
    const salt = await bcrypt.genSalt(10);
    update.password = await bcrypt.hash(update.password, salt);
  }
  if (update?.$set?.password) {
    const salt = await bcrypt.genSalt(10);
    update.$set.password = await bcrypt.hash(update.$set.password, salt);
  }
});
// Метод для сравнения паролей
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};
