// import { sanitizeHtml } from 'sanitize-html';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema, Types, model } from 'mongoose';

import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CommentsService } from '../comments/comments.service';
import {
  IPostWithComments,
  IAuthor,
} from './interfaces/post-with-comments.interface';
import { deleteFileByUrl, extractContentImageUrls } from './utils/image.utils';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private commentsService: CommentsService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Создание поста
   */

  sanitizeHtml = require('sanitize-html');

  private buildPostAggregationPipeline(
    filter: Record<string, any>,
    options: {
      page: number;
      limit: number;
      sort?: Record<string, 1 | -1>;
      userId?: string;
      populateAuthor?: boolean;
      projectLikes?: boolean;
      addSavedFlag?: boolean;
    },
  ): any[] {
    const {
      page,
      limit,
      sort = { createdAt: -1 },
      userId,
      populateAuthor = true,
      projectLikes = true,
      addSavedFlag = false,
    } = options;

    const pipeline: any[] = [];

    // 1. Фильтрация
    pipeline.push({ $match: filter });

    // 2. Сортировка
    pipeline.push({ $sort: sort });

    // 3. Пагинация
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    // 4. Флаги взаимодействия пользователя
    if (userId) {
      const userObjectId = new Types.ObjectId(userId);

      // likedByMe
      pipeline.push({
        $addFields: {
          likedByMe: {
            $in: [userObjectId, { $ifNull: ['$likes', []] }],
          },
        },
      });

      // isSaved (если нужно)
      if (addSavedFlag) {
        pipeline.push({
          $lookup: {
            from: 'users',
            let: { postId: '$_id' },
            pipeline: [
              { $match: { _id: userObjectId } },
              {
                $project: {
                  isSaved: {
                    $in: ['$$postId', { $ifNull: ['$savedPosts', []] }],
                  },
                },
              },
            ],
            as: 'userSavedInfo',
          },
        });
        pipeline.push({
          $addFields: {
            isSaved: {
              $ifNull: [{ $arrayElemAt: ['$userSavedInfo.isSaved', 0] }, false],
            },
          },
        });
        pipeline.push({ $project: { userSavedInfo: 0 } });
      }
    } else {
      // Без userId — флаги false
      const falseFlags: any = { likedByMe: false };
      if (addSavedFlag) falseFlags.isSaved = false;
      pipeline.push({ $addFields: falseFlags });
    }

    // 5. Убираем массив likes (опционально)
    if (!projectLikes) {
      pipeline.push({ $project: { likes: 0 } });
    }

    // 6. Populate автора
    if (populateAuthor) {
      pipeline.push(
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'author',
          },
        },
        { $unwind: '$author' },
        { $project: { 'author.password': 0, 'author.__v': 0 } },
      );
    }

    return pipeline;
  }

  private normalizeContentImageUrls(html: string): string {
    // Заменяем http(s)://домен/ на / во всех src изображений
    return html.replace(
      /(<img[^>]+src=")([^"]+)("[^>]*>)/gi,
      (match, p1, src, p3) => {
        // Удаляем протокол и домен
        const cleanSrc = src.replace(/^https?:\/\/[^\/]+/i, '');
        return p1 + cleanSrc + p3;
      },
    );
  }
  async create(createPostDto: CreatePostDto, authorId: string) {
    const nonDomenContent = this.normalizeContentImageUrls(
      createPostDto.content,
    );
    const cleanContent = this.sanitizeHtml(nonDomenContent, {
      allowedTags: this.sanitizeHtml.defaults.allowedTags.concat(['img']),
      allowedAttributes: {
        ...this.sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'width', 'height'],
      },
      allowedSchemes: ['http', 'https', 'data'], // data для base64, но лучше только http/https
    });

    const contentImages = extractContentImageUrls(cleanContent);
    console.log(contentImages);
    const post = new this.postModel({
      ...createPostDto,
      content: cleanContent,
      contentImages, // <-- сохраняем массив
      author: new Types.ObjectId(authorId),
    });

    const savedPost = await post.save();
    console.log(savedPost);
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
  async findAll(
    page = 1,
    limit = 10,
    search?: string,
    authorId?: string,
    userId?: string,
  ) {
    const filter: Record<string, any> = {};

    if (search) {
      filter.$text = { $search: search };
    }

    if (authorId && Types.ObjectId.isValid(authorId)) {
      filter.author = new Types.ObjectId(authorId);
    }

    // Пайплайн для получения постов
    const pipeline = this.buildPostAggregationPipeline(filter, {
      page,
      limit,
      userId,
      populateAuthor: true,
      projectLikes: false, // или false, чтобы скрыть likes
      addSavedFlag: !!userId,
    });
    pipeline.push({ $project: { content: 0 } }); // исключаем content

    const posts = await this.postModel.aggregate(pipeline).exec();

    // Отдельный запрос для подсчёта total (можно также через агрегацию с $count)
    const total = await this.postModel.countDocuments(filter);

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
  async findOne(id: string, userId?: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Неверный формат ID поста');
    }

    const pipeline: any[] = [{ $match: { _id: new Types.ObjectId(id) } }];

    if (userId) {
      const userObjectId = new Types.ObjectId(userId);

      // likedByMe
      pipeline.push({
        $addFields: {
          likedByMe: {
            $in: [userObjectId, { $ifNull: ['$likes', []] }],
          },
        },
      });

      // isSaved с защитой от отсутствия поля savedPosts
      pipeline.push({
        $lookup: {
          from: 'users',
          let: { postId: '$_id' },
          pipeline: [
            { $match: { _id: userObjectId } },
            {
              $project: {
                isSaved: {
                  $in: ['$$postId', { $ifNull: ['$savedPosts', []] }],
                },
              },
            },
          ],
          as: 'userSavedInfo',
        },
      });
      pipeline.push({
        $addFields: {
          isSaved: {
            $ifNull: [{ $arrayElemAt: ['$userSavedInfo.isSaved', 0] }, false],
          },
        },
      });
      pipeline.push({ $project: { userSavedInfo: 0 } });
    } else {
      pipeline.push({ $addFields: { likedByMe: false, isSaved: false } });
    }

    // lookup автора
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: '$author' },
      { $project: { 'author.password': 0 } },
    );

    const results = await this.postModel.aggregate(pipeline).exec();
    if (!results.length) {
      throw new NotFoundException('Пост не найден');
    }
    return results[0];
  }

  /**
   * Получение поста с комментариями (с явным типом)
   */
  async findOneWithComments(
    id: string,
    page = 1,
    limit = 20,
    userId?: string,
  ): Promise<IPostWithComments> {
    // Получаем пост
    const post = await this.findOne(id, userId);

    // Получаем комментарии к посту
    const comments = await this.commentsService.getPostComments(
      id,
      page,
      limit,
      'newest',
      userId,
    );

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
  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    userId: string,
  ): Promise<PostDocument> {
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Пост не найден');
    if (post.author.toString() !== userId)
      throw new ForbiddenException('Нет прав для редактирования');

    // Обработка контента
    if (updatePostDto.content) {
      // 1. Убираем домен из src
      const nonDomenContent = this.normalizeContentImageUrls(
        updatePostDto.content,
      );
      // 2. Санитизация
      const cleanContent = this.sanitizeHtml(nonDomenContent, {
        allowedTags: this.sanitizeHtml.defaults.allowedTags.concat(['img']),
        allowedAttributes: {
          ...this.sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'width', 'height'],
        },
        allowedSchemes: ['http', 'https', 'data'],
      });
      // 3. Извлечение URL
      const newImageUrls = extractContentImageUrls(cleanContent);
      const oldImageUrls = post.contentImages || [];

      // 4. Удаление неиспользуемых файлов
      oldImageUrls.forEach((url) => {
        if (!newImageUrls.includes(url)) {
          deleteFileByUrl(url);
        }
      });

      // 5. Присваиваем очищенный контент и новый массив URL
      updatePostDto.content = cleanContent;
      post.contentImages = newImageUrls;
    }

    // Обработка обложки (если загружена новая)
    if (updatePostDto.imageUrl) {
      if (post.imageUrl) {
        deleteFileByUrl(post.imageUrl);
      }
      this.processImage(post._id.toString(), updatePostDto.imageUrl);
    }

    // Применяем остальные поля (title и т.д.)
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

    // Удаляем обложку, если она есть
    if (post.imageUrl) {
      deleteFileByUrl(post.imageUrl);
    }

    // Удаляем все изображения из контента
    (post.contentImages || []).forEach((url) => deleteFileByUrl(url));

    await post.deleteOne();
  }

  /**
   * Получение постов автора
   */
  async findByAuthor(authorId: string, page = 1, limit = 10, userId?: string) {
    const filter = { author: new Types.ObjectId(authorId) };
    const pipeline = this.buildPostAggregationPipeline(filter, {
      page,
      limit,
      userId,
      populateAuthor: true,
      addSavedFlag: !!userId,
    });

    const [posts, total] = await Promise.all([
      this.postModel.aggregate(pipeline).exec(),
      this.postModel.countDocuments(filter),
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

  async findSavedPosts(userId: string, page = 1, limit = 20) {
    // 1. Получаем массив savedPosts пользователя (только ID)
    const user = await this.userModel
      .findById(userId)
      .select('savedPosts')
      .lean();
    const savedIds = user?.savedPosts || [];

    // 2. Фильтр для постов
    const filter = { _id: { $in: savedIds } };

    // 3. Используем общий билдер пайплайна
    const pipeline = this.buildPostAggregationPipeline(filter, {
      page,
      limit,
      userId,
      populateAuthor: true,
      projectLikes: true,
      addSavedFlag: true, // чтобы подсветить, что они уже сохранены
    });

    const posts = await this.postModel.aggregate(pipeline);
    const total = savedIds.length;

    return {
      data: posts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async toggleLike(
    postId: string,
    userId: string,
  ): Promise<{ liked: boolean; likesCount: number }> {
    const userObjectId = new Types.ObjectId(userId);

    // Сначала пытаемся добавить лайк
    const addResult = await this.postModel.updateOne(
      { _id: postId, likes: { $ne: userObjectId } },
      { $addToSet: { likes: userObjectId }, $inc: { likesCount: 1 } },
    );

    // Если добавили (modifiedCount > 0), значит раньше лайка не было
    if (addResult.modifiedCount > 0) {
      const post = await this.postModel
        .findById(postId)
        .select('likesCount')
        .lean();
      return { liked: true, likesCount: post?.likesCount || 0 };
    }

    // Иначе лайк уже был — удаляем
    await this.postModel.updateOne(
      { _id: postId },
      { $pull: { likes: userObjectId }, $inc: { likesCount: -1 } },
    );

    const post = await this.postModel
      .findById(postId)
      .select('likesCount')
      .lean();
    return { liked: false, likesCount: post?.likesCount || 0 };
  }
}
