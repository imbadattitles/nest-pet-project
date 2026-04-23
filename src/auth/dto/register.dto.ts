import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Пожалуйста, введите корректный email' })
  email: string;

  @IsString()
  @MinLength(3, { message: 'Имя пользователя должно быть минимум 3 символа' })
  @MaxLength(20, {
    message: 'Имя пользователя должно быть максимум 20 символов',
  })
  @Matches(/^[\p{L}\d_]+$/u, {
    message:
      'Имя пользователя может содержать только буквы любых алфавитов, цифры и символ подчёркивания',
  })
  username: string;

  @IsString()
  @MinLength(6, { message: 'Пароль должен быть минимум 6 символов' })
  password: string;
}
