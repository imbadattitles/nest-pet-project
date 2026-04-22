import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from '../posts/schemas/post.schema'; // ваш путь
import { CleanupService } from './cleanup.service';
import { CleanupCommand } from './cleanup.command';

@Module({
  imports: [
    CommandModule,
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
  ],
  providers: [CleanupService, CleanupCommand],
})
export class CommandsModule {}
