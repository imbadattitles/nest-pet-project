import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, HydratedDocument } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CommentsService } from '../comments/comments.service';
import { 
  IPostWithComments, 
  IAuthor, 
  ICommentWithAuthor,
  IApiResponse 
} from './interfaces/post-with-comments.interface';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private commentsService: CommentsService,
  ) {}

  /**
   * Создание поста
   */
  async create(createPostDto: CreatePostDto, authorId: string) {
    const post = new this.postModel({
      ...createPostDto,
      author: new Types.ObjectId(authorId),
    });
    
    const savedPost = await post.save();
    
    // Если есть изображение, можно запустить обработку (ресайз и т.д.)
    if (createPostDto.imageUrl) {
      // Асинхронно: создать миниатюры, оптимизировать и т.д.
      this.processImage(savedPost._id.toString(), createPostDto.imageUrl);
    }
    
    return savedPost;
  }
  
  private async processImage(postId: string, imageUrl: string) {
    // Здесь можно:
    // 1. Создать миниатюру
    // 2. Оптимизировать размер
    // 3. Загрузить в S3 вместо локального хранения
    // 4. Обновить пост с новыми ссылками
  }
  /**
   * Получение всех постов с пагинацией
   */
  async findAll(page = 1, limit = 10, search?: string, authorId?: string) {
    const skip = (page - 1) * limit;

    const query: any = {};

    if (search) {
      query.$text = { $search: search };
    }

    if (authorId && Types.ObjectId.isValid(authorId)) {
      query.author = new Types.ObjectId(authorId);
    }

    const [posts, total] = await Promise.all([
      this.postModel
        .find(query)
        .populate<{ author: IAuthor }>('author', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(query),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Получение одного поста
   */
  async findOne(id: string): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Неверный формат ID поста');
    }

    const post = await this.postModel
      .findById(id)
      .populate('author', 'username email')
      .lean()
      .exec();

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    return post;
  }

  /**
   * Получение поста с комментариями (с явным типом)
   */
  async findOneWithComments(
    id: string, 
    page = 1, 
    limit = 20
  ): Promise<IPostWithComments> {
    // Получаем пост
    const post = await this.findOne(id) as any;

    // Получаем комментарии к посту
    const comments = await this.commentsService.getPostComments(id, page, limit, 'newest');

    // Формируем ответ с правильным типом
    const result: IPostWithComments = {
      ...post,
      author: post.author as IAuthor,
      comments: {
        comments: comments.comments,
        pagination: comments.pagination,
      },
    };

    return result;
  }

  /**
   * Обновление поста
   */
  async update(id: string, updatePostDto: UpdatePostDto, userId: string): Promise<PostDocument> {
    const post = await this.postModel.findById(id);

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    if (post.author.toString() !== userId) {
      throw new ForbiddenException('Нет прав для редактирования этого поста');
    }

    Object.assign(post, updatePostDto);
    return post.save();
  }

  /**
   * Удаление поста
   */
  async remove(id: string, userId: string): Promise<void> {
    const post = await this.postModel.findById(id);

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    if (post.author.toString() !== userId) {
      throw new ForbiddenException('Нет прав для удаления этого поста');
    }

    await post.deleteOne();
  }

  /**
   * Получение постов автора
   */
  async findByAuthor(authorId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find({ author: new Types.ObjectId(authorId) })
        .populate<{ author: IAuthor }>('author', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments({ author: new Types.ObjectId(authorId) }),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Обновление счетчика комментариев
   */
  async updateCommentsCount(postId: string): Promise<void> {
    const count = await this.commentsService.getCommentsCount(postId);
    await this.postModel.findByIdAndUpdate(postId, { commentsCount: count });
  }
}