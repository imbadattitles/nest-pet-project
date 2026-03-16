import { IsString, IsOptional, IsMongoId, MinLength, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;

  @IsMongoId()
  postId: string;

  @IsOptional()
  @IsMongoId()
  parentCommentId?: string; // Для ответов на комментарии
}
