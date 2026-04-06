import { IsString, IsNotEmpty } from 'class-validator';

export class ResendCodeDto {
  @IsString()
  @IsNotEmpty()
  tempUserId: string;
}