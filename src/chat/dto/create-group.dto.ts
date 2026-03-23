import { IsArray, IsMongoId, IsOptional, IsString } from "class-validator";
import { Types } from "mongoose";

export class CreateGroupDto {
  @IsString()
  groupName: string;

  @IsOptional()
  @IsString()
  groupDescription?: string;

  @IsOptional()
  @IsString()
  groupAvatar?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  participants?: Types.ObjectId[];
}