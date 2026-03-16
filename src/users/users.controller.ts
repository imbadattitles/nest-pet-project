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
    Body
  } from '@nestjs/common';
  import { UsersService } from './users.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { CurrentUser } from '../common/decorators/current-user.decorator';
  import { PostsService } from 'src/posts/posts.service';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
  
  @Controller('users')
  export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly postsService: PostsService
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
  
    /**
     * Получение текущего пользователя
     * GET /api/users/me/profile
     * Доступно только владельцу
     */
    @Get('me/profile')
    @UseGuards(AccessTokenGuard)
    async getMyProfile(@CurrentUser() currentUser: any) {
      const user = await this.usersService.findById(currentUser.id);
      
      return {
        success: true,
        data: user,
        message: 'Профиль получен',
      };
    }

    @Put('me/profile')
    @UseGuards(AccessTokenGuard)
    async changeMyProfile(@CurrentUser() currentUser: any, @Body() data: any) {
      console.log(currentUser)
      console.log(data)
      const user = await this.usersService.update(currentUser.id, data);

      return {
        success: true,
        data: user,
        message: 'Профиль изменён',
      };
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
  
    /**
     * Поиск пользователей по username
     * GET /api/users/search?username=...
     */
    @Get('search')
    @UseGuards(AccessTokenGuard)
    async searchUsers(@Param('username') username: string) {
      if (!username) {
        return {
          success: true,
          data: [],
          message: 'Укажите username для поиска',
        };
      }
  
      const user = await this.usersService.findByUsername(username);
      
      return {
        success: true,
        data: user ? [user] : [],
        message: user ? 'Пользователь найден' : 'Пользователь не найден',
      };
    }
  }