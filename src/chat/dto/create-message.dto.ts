import {
  IsString,
  IsOptional,
  IsArray,
  IsMongoId,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateMessageDto {
  @IsMongoId()
  dialogId: Types.ObjectId;

  @IsString()
  @MaxLength(5000)
  text: string;

  @IsOptional()
  @IsArray()
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  mentions?: Types.ObjectId[];
}

export class AttachmentDto {
  @IsString()
  type: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  size?: number;
}
