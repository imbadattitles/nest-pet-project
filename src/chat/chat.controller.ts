import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { Types } from 'mongoose';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';

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
      new Types.ObjectId(userId)
    );
  }

  @Post('groups')
  async createGroup(@Req() req, @Body() dto: CreateGroupDto) {
    return this.chatService.createGroupChat(req.user.id, dto);
  }

  @Get(':dialogId/messages')
  async getMessages(
    @Req() req,
    @Param('dialogId') dialogId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: Date
  ) {
    return this.chatService.getMessages(
      new Types.ObjectId(dialogId),
      req.user.id,
      limit,
      before
    );
  }

  @Post('messages')
  async sendMessage(@Req() req, @Body() dto: CreateMessageDto) {
    return this.chatService.sendMessage(req.user.id, dto);
  }

  @Patch(':dialogId/read')
  async markAsRead(@Req() req, @Param('dialogId') dialogId: string) {
    return this.chatService.markAsRead(
      new Types.ObjectId(dialogId),
      req.user.id
    );
  }
}