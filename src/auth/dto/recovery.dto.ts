import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RecoveryDto {
  @IsEmail({}, { message: 'Пожалуйста, введите корректный email' })
  email: string;
}
