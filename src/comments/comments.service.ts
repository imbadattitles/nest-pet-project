import { AppGateway } from './../gateway/app.gateway';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
      @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway
  ) {}

  /**
   * Создание комментария
   */
  async create(createCommentDto: CreateCommentDto, authorId: string): Promise<CommentDocument> {
    // Проверяем, существует ли родительский комментарий
    if (createCommentDto.parentCommentId) {
      const parentComment = await this.commentModel.findById(createCommentDto.parentCommentId);
      if (!parentComment) {
        throw new BadRequestException('Родительский комментарий не найден');
      }
      
      // Проверяем, что родительский комментарий принадлежит тому же посту
      if (parentComment.post.toString() !== createCommentDto.postId) {
        throw new BadRequestException('Родительский комментарий не относится к этому посту');
      }
    }

    const comment = new this.commentModel({
      content: createCommentDto.content,
      author: new Types.ObjectId(authorId),
      post: new Types.ObjectId(createCommentDto.postId),
      parentComment: createCommentDto.parentCommentId 
        ? new Types.ObjectId(createCommentDto.parentCommentId) 
        : null,
    });

    const savedComment = await comment.save();
    
    // Загружаем автора для отправки
    await savedComment.populate('author', 'username email avatar');
    
    // Отправляем через WebSocket
    this.appGateway.sendNewComment(createCommentDto.postId, savedComment);
    
    return savedComment;
  }

  /**
   * Получение комментариев к посту (с пагинацией и вложенностью)
   */
  async getPostComments(
    postId: string,
    page = 1,
    limit = 20,
    sortBy: 'newest' | 'oldest' | 'popular' = 'newest',
  ) {
    const skip = (page - 1) * limit;

    // Определяем сортировку
    let sort: any = { createdAt: -1 };
    if (sortBy === 'oldest') sort = { createdAt: 1 };
    if (sortBy === 'popular') sort = { likesCount: -1, createdAt: -1 };

    // Получаем только корневые комментарии (без parent)
    const query = {
      post: new Types.ObjectId(postId),
      parentComment: null,
      isDeleted: false,
    };

    const [rootComments, total] = await Promise.all([
      this.commentModel
        .find(query)
        .populate('author', 'username email avatar')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments(query),
    ]);

    // Для каждого корневого комментария рекурсивно получаем все ответы
    const commentsWithReplies = await Promise.all(
      rootComments.map(comment => this.buildCommentTree(comment)),
    );

    return {
      comments: commentsWithReplies,
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
   * Рекурсивное построение дерева комментариев
   */
  private async buildCommentTree(comment: any, depth: number = 0): Promise<any> {
    // Защита от бесконечной рекурсии (макс глубина 10)
    if (depth > 10) {
      return {
        ...comment,
        replies: [],
        _hasMoreReplies: true, // Флаг, что есть еще ответы
      };
    }

    // Получаем прямые ответы на этот комментарий
    const replies = await this.commentModel
      .find({
        parentComment: comment._id,
        isDeleted: false,
      })
      .populate('author', 'username email avatar')
      .sort({ createdAt: 1 })
      .lean();

    // Рекурсивно получаем ответы на ответы
    const repliesWithNested = await Promise.all(
      replies.map(reply => this.buildCommentTree(reply, depth + 1)),
    );

    return {
      ...comment,
      replies: repliesWithNested,
      _replyCount: repliesWithNested.length,
    };
  }

  /**
   * Получение одного комментария с ответами
   */
  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Неверный формат ID комментария');
    }

    const comment = await this.commentModel
      .findById(id)
      .populate('author', 'username email avatar')
      .populate({
        path: 'replies',
        populate: { path: 'author', select: 'username email avatar' },
        options: { sort: { createdAt: 1 } },
      })
      .lean();

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }

    return comment;
  }

  /**
   * Обновление комментария
   */
  async update(id: string, updateCommentDto: UpdateCommentDto, userId: string) {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }

    // Проверяем, что пользователь - автор комментария
    if (comment.author.toString() !== userId) {
      throw new ForbiddenException('Нет прав для редактирования этого комментария');
    }

    // Нельзя изменить пост или родительский комментарий
    if (updateCommentDto.postId || updateCommentDto.parentCommentId) {
      throw new BadRequestException('Нельзя изменить пост или родительский комментарий');
    }

    comment.content = updateCommentDto.content || comment.content;
    comment.isEdited = true;
    comment.editedAt = new Date();

    return comment.save();
  }

  /**
   * Мягкое удаление комментария
   */
  async softDelete(id: string, userId: string, isAdmin = false) {
    const comment = await this.commentModel.findById(id);

    if (!comment) {
      throw new NotFoundException('Комментарий не найден');
    }

    // Проверяем права (автор или админ)
    if (!isAdmin && comment.author.toString() !== userId) {
      throw new ForbiddenException('Нет прав для удаления этого комментария');
    }

    // Мягкое удаление
    comment.isDeleted = true;
    comment.deletedBy = new Types.ObjectId(userId);
    comment.content = '[Комментарий удален]'; // Заменяем текст

    return comment.save();
  }

  /**
   * Лайк/дизлайк комментария
   */
  async toggleLike(id: string, userId: string) {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }

    const userIdObj = new Types.ObjectId(userId);
    const hasLiked = comment.likes.some(id => id.toString() === userId);

    if (hasLiked) {
      // Убираем лайк
      comment.likes = comment.likes.filter(id => id.toString() !== userId);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    } else {
      // Добавляем лайк
      comment.likes.push(userIdObj);
      comment.likesCount += 1;
    }

    await comment.save();

    return {
      liked: !hasLiked,
      likesCount: comment.likesCount,
    };
  }

  /**
   * Получение количества комментариев к посту
   */
  async getCommentsCount(postId: string): Promise<number> {
    return this.commentModel.countDocuments({
      post: new Types.ObjectId(postId),
      isDeleted: false,
    });
  }

  /**
   * Получение последних комментариев пользователя
   */
  async getUserComments(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.commentModel
        .find({ author: new Types.ObjectId(userId), isDeleted: false })
        .populate('post', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments({ 
        author: new Types.ObjectId(userId), 
        isDeleted: false 
      }),
    ]);

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}