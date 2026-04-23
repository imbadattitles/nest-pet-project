import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /**
   * Создание комментария
   */
  @Post()
  @UseGuards(AccessTokenGuard)
  create(@Body() createCommentDto: CreateCommentDto, @Req() req) {
    return this.commentsService.create(createCommentDto, req.user.id);
  }

  /**
   * Получение комментариев к посту
   */
  @Get('post/:postId')
  @UseGuards(AccessTokenGuard)
  async getPostComments(
    @Param('postId') postId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('sort') sortBy: 'newest' | 'oldest' | 'popular' = 'newest',
    @Req() req,
  ) {
    return this.commentsService.getPostComments(
      postId,
      page,
      limit,
      sortBy,
      req?.user?.id,
    );
  }

  /**
   * Получение одного комментария
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  /**
   * Обновление комментария
   */
  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  update(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Req() req,
  ) {
    return this.commentsService.update(id, updateCommentDto, req.user.id);
  }

  /**
   * Удаление комментария (soft delete)
   */
  @Delete(':id')
  @UseGuards(AccessTokenGuard)
  remove(@Param('id') id: string, @Req() req) {
    return this.commentsService.softDelete(id, req.user.id, false);
  }

  /**
   * Лайк/дизлайк комментария
   */
  @Post(':id/like')
  @UseGuards(AccessTokenGuard)
  toggleLike(@Param('id') id: string, @Req() req) {
    return this.commentsService.toggleLike(id, req.user.id);
  }

  /**
   * Получение комментариев текущего пользователя
   */
  @Get('user/me')
  @UseGuards(AccessTokenGuard)
  getMyComments(
    @Req() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.commentsService.getUserComments(req.user.id, page, limit);
  }
}
