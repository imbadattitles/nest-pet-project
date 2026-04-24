import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { Types } from 'mongoose';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createUploadConfig } from 'src/common/imageHelper';
import { DeleteMessagesDto } from './dto/delete-messages.dto';

@Controller('chat')
@UseGuards(AccessTokenGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  async getDialogs(@Req() req) {
    return this.chatService.getUserDialogs(req.user.id);
  }

  @Post(':userId')
  async createPrivateChat(@Req() req, @Param('userId') userId: string) {
    return this.chatService.createPrivateChat(
      req.user.id,
      new Types.ObjectId(userId),
    );
  }

  @Post('groups')
  async createGroup(@Req() req, @Body() dto: CreateGroupDto) {
    return this.chatService.createGroupChat(req.user.id, dto);
  }

  @Get(':dialogId')
  async getDialog(@Req() req, @Param('dialogId') dialogId: string) {
    return this.chatService.getDialogById(
      new Types.ObjectId(dialogId),
      req.user.id,
    );
  }

  @Delete(':dialogId/deleteAll')
  async deleteDialog(@Req() req, @Param('dialogId') dialogId: string) {
    return this.chatService.deleteDialogAll(
      new Types.ObjectId(dialogId),
      req.user.id,
    );
  }
  @Get(':dialogId/messages')
  async getMessages(
    @Req() req,
    @Param('dialogId') dialogId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: Date,
  ) {
    return this.chatService.getMessages(
      new Types.ObjectId(dialogId),
      req.user.id,
      limit,
      before,
    );
  }

  @Post(':dialogId/messages')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: 10 },
        { name: 'videos', maxCount: 3 },
        { name: 'audios', maxCount: 5 },
        { name: 'documents', maxCount: 10 },
      ],
      createUploadConfig('messages'),
    ),
  )
  async sendMessage(
    @Req() req,
    @Param('dialogId') dialogId: string,
    @UploadedFiles()
    files: {
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
      audios?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
    @Body() dto: CreateMessageDto,
  ) {
    const attachments = [
      ...(files.images || []).map((f) => ({ ...f, type: 'image' })),
      ...(files.videos || []).map((f) => ({ ...f, type: 'video' })),
      ...(files.audios || []).map((f) => ({ ...f, type: 'audio' })),
      ...(files.documents || []).map((f) => ({ ...f, type: 'document' })),
    ];

    const attachmentsData = attachments.map((file) => ({
      name: file.filename,
      originalname: file.originalname,
      url: `uploads/messages/${file.type}s/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      type: file.type, // 'image', 'video', 'audio', 'document'
    }));
    // console.log(attachmentsData);
    return this.chatService.sendMessage(req.user.id, {
      ...dto,
      dialogId: new Types.ObjectId(dialogId),
      attachments: attachmentsData,
    });
  }

  @Delete(':dialogId/deleteMessagesForMe')
  async deleteMessagesFormMe(
    @Req() req,
    @Param('dialogId') dialogId: string,
    @Body() dto: DeleteMessagesDto,
  ) {
    return this.chatService.deleteMessagesArrayForMe(
      new Types.ObjectId(dialogId),
      dto.messagesId,
      req.user.id,
    );
  }

  @Delete(':dialogId/deleteMessagesForAll')
  async deleteMessagesFormAll(
    @Req() req,
    @Param('dialogId') dialogId: string,
    @Body() dto: DeleteMessagesDto,
  ) {
    return this.chatService.deleteMessagesArrayForAll(
      new Types.ObjectId(dialogId),
      dto.messagesId,
      req.user.id,
    );
  }

  // @Patch(':dialogId/read')
  // async markAsRead(@Req() req, @Param('dialogId') dialogId: string) {
  //   return this.chatService.markAsRead(
  //     new Types.ObjectId(dialogId),
  //     req.user.id
  //   );
  // }
}
