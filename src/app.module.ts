import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    // Конфигурация
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
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

    // Модули приложения
    UsersModule,
    AuthModule,
    PostsModule,
    CommentsModule,
    GatewayModule,
  ],
})
export class AppModule {}