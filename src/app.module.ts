import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { WebsocketModule } from './gateway/gateway.module';
import { ChatModule } from './chat/chat.module';
import { BullModule } from '@nestjs/bull'
import { RedisModule } from './globalServices/redis.module';
@Module({
  imports: [
    // Конфигурация
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),

    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD,
      },
    }),
    // Регистрируем очередь для email верификации
    BullModule.registerQueue({
      name: 'email-verification',
    }),

    // База данных
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([  
      {
        ttl: 60000, 
        limit: 100,
      },
    ]),
    RedisModule,
    // Модули приложения
    UsersModule,
    AuthModule,
    PostsModule,
    CommentsModule,
    WebsocketModule,
    ChatModule
  ],
  // exports: [BullModule]
})
export class AppModule {}