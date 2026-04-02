import { IsString, IsOptional, IsArray, IsMongoId, MaxLength, ArrayMaxSize, isArray } from 'class-validator';
import { Types } from 'mongoose';

export class DeleteMessagesDto {
    @IsMongoId()
    dialogId: Types.ObjectId[];

    @IsArray()
    @IsMongoId({ each: true })
    messagesId: Types.ObjectId[];

    @IsOptional()
    forAll?: boolean;
}