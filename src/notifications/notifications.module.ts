import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.conroller';
import { NotificationsService } from './notifications.service';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema'; // путь под себя
import { WebsocketModule } from 'src/gateway/gateway.module';
import { Post, PostSchema } from 'src/posts/schemas/post.schema';
import { Comment, CommentSchema } from 'src/comments/schemas/comment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema }, // чтобы работать с User
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    forwardRef(() => WebsocketModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // если нужно будет вызывать из других модулей
})
export class NotificationsModule {}
