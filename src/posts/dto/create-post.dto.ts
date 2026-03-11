import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(3, { message: 'Заголовок должен быть минимум 3 символа' })
  @MaxLength(200, { message: 'Заголовок должен быть максимум 200 символов' })
  title: string;

  @IsString()
  @MinLength(10, { message: 'Содержание должно быть минимум 10 символов' })
  content: string;
}