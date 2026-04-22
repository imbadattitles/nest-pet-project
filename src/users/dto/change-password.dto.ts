import { IsOptional, IsString } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsOptional()
  tempUserId?: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  from?: 'reset' | 'change';
}
