import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { Dialog, DialogSchema } from './schemas/dialog.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
        { name: User.name, schema: UserSchema },
        { name: Dialog.name, schema: DialogSchema },
        { name: Message.name, schema: MessageSchema }
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}