import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { PostsModule } from 'src/posts/posts.module';
import { WebsocketModule } from 'src/gateway/gateway.module';
import { ChatModule } from 'src/chat/chat.module';
import { TempResetService } from 'src/auth/temp-reset.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PostsModule,
    forwardRef(() => WebsocketModule),
    ChatModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, TempResetService],
  exports: [UsersService],
})
export class UsersModule {}
