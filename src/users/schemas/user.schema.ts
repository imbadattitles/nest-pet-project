import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';
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
    unique: true,
    trim: true,
    minlength: [3, 'Имя пользователя должно быть минимум 3 символа'],
    maxlength: [20, 'Имя пользователя должно быть максимум 20 символов'],
  })
  username: string;

  @Prop({
    required: [true, 'Пароль обязателен'],
    minlength: [6, 'Пароль должен быть минимум 6 символов'],
    select: false,
  })
  password: string;

  @Prop({
    required: false
  })
  avatar: string

  @Prop({
    type: [String],
    default: [],
    select: false,
    ref: 'User',
  })
  contacts: string[]; // Список ID друзей или контактов
}

export const UserSchema = SchemaFactory.createForClass(User);

// Хеширование пароля перед сохранением
UserSchema.pre<UserDocument>('save', async function (next) {
  if (!this.isModified('password')) {
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
  }
});

// Метод для сравнения паролей
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};