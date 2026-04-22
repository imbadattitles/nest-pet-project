import { IsString, IsNotEmpty, Length } from 'class-validator';

export class VerifyRegistrationDto {
  @IsString()
  @IsNotEmpty()
  tempUserId: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Код должен состоять из 6 цифр' })
  code: string;
}
