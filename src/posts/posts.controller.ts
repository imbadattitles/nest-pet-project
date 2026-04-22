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
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { editFileName, imageFileFilter } from 'src/common/imageHelper';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/posts',
        filename: editFileName,
      }),
      fileFilter: imageFileFilter,
      limits: {
        files: 1,
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  create(
    @Body() createPostDto: CreatePostDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    if (file) {
      createPostDto.imageUrl = `/uploads/posts/${file.filename}`;
    }
    return this.postsService.create(createPostDto, req.user.id);
  }

  @Post('upload-content-image')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/content',
        filename: editFileName,
      }),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadContentImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не загружен');
    // Можно сразу создать миниатюры при необходимости
    return { url: `/uploads/content/${file.filename}` };
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('author') authorId?: string,
    @Req() req?,
  ) {
    return this.postsService.findAll(
      page,
      limit,
      search,
      authorId,
      req?.user?.id,
    );
  }

  @Patch(':id/toggle-like')
  @UseGuards(AccessTokenGuard)
  toggleLike(@Param('id') postId: string, @Req() req) {
    return this.postsService.toggleLike(postId, req.user.id);
  }

  @Get('my-posts')
  @UseGuards(AccessTokenGuard)
  findMyPosts(
    @Req() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.postsService.findByAuthor(
      req.user.id,
      page,
      limit,
      req.user.id,
    );
  }

  @Get(':id')
  @UseGuards(AccessTokenGuard)
  findOne(@Param('id') id: string, @Req() req) {
    return this.postsService.findOneWithComments(id, 1, 20, req?.user?.id);
  }

  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/posts',
        filename: editFileName,
      }),
      fileFilter: imageFileFilter,
      limits: {
        files: 1,
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    if (file) {
      updatePostDto.imageUrl = `/uploads/posts/${file.filename}`;
    }
    return this.postsService.update(id, updatePostDto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(AccessTokenGuard)
  remove(@Param('id') id: string, @Req() req) {
    return this.postsService.remove(id, req.user.id);
  }
}
