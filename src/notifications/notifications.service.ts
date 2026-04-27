import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AppGateway } from 'src/gateway/app.gateway';
import { Post, PostDocument } from 'src/posts/schemas/post.schema';
import { Comment, CommentDocument } from 'src/comments/schemas/comment.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway,
  ) {}

  /**
   * Создать уведомление и увеличить счётчик непрочитанных
   */
  async addNotification(
    recipientId: string | Types.ObjectId,
    type: string,
    referenceId?: string | Types.ObjectId,
    payload?: any,
    senderId?: string, // теперь строка
  ): Promise<NotificationDocument | null> {
    const recipient = new Types.ObjectId(recipientId);
    const reference = referenceId ? new Types.ObjectId(referenceId) : null;

    // 1. Не уведомляем о собственных действиях
    if (senderId && recipient.equals(senderId)) {
      return null;
    }

    // 2. Проверка на дубликат
    const duplicate = await this.notificationModel.findOne({
      recipient,
      type,
      referenceId: reference,
      sender: senderId ?? null,
    });

    if (duplicate) {
      // уведомление уже существует – не создаём новое
      return duplicate;
    }

    const notification = new this.notificationModel({
      recipient,
      sender: senderId ?? null,
      type,
      referenceId: reference,
      payload: payload || {},
      isRead: false,
    });

    const saved = await notification.save();
    console.log('saved', saved);
    this.appGateway.sendNotification(recipientId.toString(), saved);

    // 3. Инкремент счётчика непрочитанных
    await this.userModel.findByIdAndUpdate(recipient, {
      $inc: { unreadNotificationsCount: 1 },
    });

    return saved;
  }

  /**
   * Получить уведомления пользователя с пагинацией
   * Возвращает массив уведомлений и общее количество (для пагинатора)
   */
  async getNotifications(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{
    notifications: NotificationDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Преобразуем строку в ObjectId, иначе запрос может не сработать
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Некорректный ID пользователя');
    }
    const userObjectId = new Types.ObjectId(userId);

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find({ recipient: userObjectId }) // передаём объект ObjectId
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.notificationModel.countDocuments({ recipient: userObjectId }),
    ]);

    return {
      notifications,
      total,
      page,
      limit,
    };
  }

  /**
   * Пометить одно уведомление как прочитанное
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipient: userId, isRead: false },
      { $set: { isRead: true } },
      { new: true },
    );

    if (notification) {
      // Уменьшаем счётчик, но не ниже нуля
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: { unreadNotificationsCount: -1 },
      });
    }
  }

  /**
   * Пометить все уведомления пользователя как прочитанные
   */
  async markAllAsRead(
    userId: string,
  ): Promise<{ unreadNotificationsCount: number }> {
    const userObjectId = new Types.ObjectId(userId);
    // const not = await this.notificationModel.find({ recipient: userId });
    // console.log(not);
    // Находим количество непрочитанных, чтобы обновить счётчик
    const unreadCount = await this.notificationModel.countDocuments({
      recipient: userObjectId,
      isRead: false,
    });
    console.log('unreadCount', unreadCount);
    if (true) {
      await this.notificationModel.updateMany(
        { recipient: userObjectId, isRead: false },
        { $set: { isRead: true } },
      );

      await this.userModel.findByIdAndUpdate(userObjectId, {
        $set: { unreadNotificationsCount: 0 },
      });
    }
    return {
      unreadNotificationsCount: 0,
    };
  }
  async postCommentNotification(
    postId: string,
    commentId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    const post = await this.postModel
      .findById(postId)
      .select('author title')
      .lean();
    if (!post) return;
    await this.addNotification(
      post?.author.toString(),
      'postComment',
      commentId,
      {
        user: userId,
        post: postId,
        postTitle: post?.title,
        content: content.slice(0, 100),
      },
      userId,
    );
  }
  async answerCommentNotification(
    parentId: string,
    commentId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    const parentComment = await this.commentModel
      .findById(parentId)
      .select('author content')
      .lean();
    if (!parentComment) return;
    await this.addNotification(
      parentComment?.author.toString(),
      'commentAnswer',
      commentId,
      {
        user: userId,
        parentId: parentId,
        parrentComment: parentComment.content.slice(0, 100),
        content: content.slice(0, 100),
      },
      userId,
    );
  }
  async commentLikeNotification(
    commentId: string,
    userId: string,
  ): Promise<void> {
    const comment = await this.commentModel
      .findById(commentId)
      .select('author content')
      .lean();
    if (!comment) return;
    await this.addNotification(
      comment?.author.toString(),
      'commentLike',
      commentId,
      {
        user: userId,
        commentId: commentId,
        content: comment.content.slice(0, 100),
      },
      userId,
    );
  }
}
