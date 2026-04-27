import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Request } from 'express';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';

@Controller('notifications')
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @Req() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.id; // из JWT
    return this.notificationsService.getNotifications(userId, page, limit);
  }

  @Post('mark-all-as-read')
  async markAllAsRead(@Req() req: Request & { user: { id: string } }) {
    const userId = req.user.id; // из JWT
    return await this.notificationsService.markAllAsRead(userId);
  }
}
