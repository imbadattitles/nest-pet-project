import { ChatService } from './../chat/chat.service';
import {
  Controller,
  Get,
  Param,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Put,
  Body,
  Post,
  UseInterceptors,
  UploadedFile,
  Delete,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PostsService } from 'src/posts/posts.service';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { editFileName, imageFileFilter } from 'src/common/imageHelper';
import { ChangePasswordDto } from './dto/change-password.dto';
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly postsService: PostsService,
    private readonly ChatService: ChatService,
  ) {}

  /**
   * Получение всех пользователей
   * GET /api/users
   * Доступно только администраторам (в будущем)
   */
  @Get()
  @UseGuards(AccessTokenGuard)
  async findAll() {
    const users = await this.usersService.findAll();
    return {
      success: true,
      data: users,
      message: 'Пользователи получены',
    };
  }

  @Get('search')
  @UseGuards(AccessTokenGuard)
  async searchUsers(@Query('searchStr') searchStr: string) {
    if (!searchStr) {
      return {
        success: true,
        data: [],
        message: 'Укажите строку для поиска',
      };
    }

    const users = await this.usersService.findByString(searchStr);

    return {
      success: true,
      data: users?.length ? users : [],
      message: users?.length
        ? 'Пользователи найдены'
        : 'Пользователи не найдены',
    };
  }
  /**
   * Получение пользователя по ID
   * GET /api/users/:id
   * Доступно всем авторизованным пользователям
   */
  @Get(':id')
  @UseGuards(AccessTokenGuard)
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return {
      success: true,
      data: user,
      message: 'Пользователь получен',
    };
  }

  @Get('me/contacts')
  @UseGuards(AccessTokenGuard)
  async getMyContacts(@CurrentUser() currentUser: any) {
    return await this.usersService.getMyContacts(currentUser);
  }

  @Post('me/contacts')
  @UseGuards(AccessTokenGuard)
  async addContact(
    @CurrentUser() currentUser: any,
    @Body() data: { userId: string },
  ) {
    return await this.usersService.toggleContact(currentUser, data);
  }

  /**
   * Получение текущего пользователя
   * GET /api/users/me/profile
   * Доступно только владельцу
   */
  @Get('me/profile')
  @UseGuards(AccessTokenGuard)
  async getMyProfile(
    @CurrentUser() currentUser: any,
  ): Promise<{ success: boolean; data: any; message: string }> {
    const user = await this.usersService.findMyProfile(currentUser.id);
    const dialogs = await this.ChatService.getUserDialogs(currentUser.id);
    return {
      success: true,
      data: { user, dialogs },
      message: 'Профиль получен',
    };
  }

  @Patch('me/toggle-save-post')
  @UseGuards(AccessTokenGuard)
  async toggleSavePost(
    @CurrentUser() currentUser: any,
    @Body() data: { postId: string },
  ) {
    return await this.usersService.toggleSavePost(currentUser.id, data.postId);
  }

  @Put('me/profile')
  @UseGuards(AccessTokenGuard)
  async changeMyProfile(@CurrentUser() currentUser: any, @Body() data: any) {
    const user = await this.usersService.update(currentUser.id, data);

    return {
      success: true,
      data: user,
      message: 'Профиль изменён',
    };
  }

  @Put('me/profile/reset-password')
  async resetPassword(@Body() changePasswordDto: ChangePasswordDto) {
    await this.usersService.changePassword({
      ...changePasswordDto,
      from: 'reset',
    });
    return {
      success: true,
      message: 'Пароль изменён',
    };
  }

  @Post('me/profile/avatar')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: editFileName,
      }),
      fileFilter: imageFileFilter,
      limits: {
        files: 1,
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadAvatarLocal(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    await this.usersService.update(user.id, { avatar: avatarUrl });

    return {
      success: true,
      url: avatarUrl,
      message: 'Avatar uploaded successfully',
    };
  }

  @Get('me/saved-posts')
  @UseGuards(AccessTokenGuard)
  async getMySavedPosts(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.postsService.findSavedPosts(user.id, page, limit);
  }

  /**
   * Получение постов пользователя
   * GET /api/users/:id/posts
   * Доступно всем
   */
  @Get(':id/posts')
  @UseGuards(AccessTokenGuard)
  async getUserPosts(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    // Проверяем существование пользователя
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Получаем посты пользователя
    const posts = await this.postsService.findByAuthor(id, page, limit);

    return {
      success: true,
      data: posts,
      message: `Посты пользователя ${user.username}`,
    };
  }
}
