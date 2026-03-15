import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 5000;

  // Глобальные pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Cookie parser middleware
  app.use(cookieParser());

  // Упрощенные CORS настройки для development
  app.enableCors({
    origin: 'http://localhost:5173', // Точное указание фронтенд origin
    credentials: true, // Обязательно для кук
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Глобальный префикс
  app.setGlobalPrefix('api');

  await app.listen(port);
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`📍 http://localhost:${port}/api`);
  console.log(`🍪 CORS origin: http://localhost:5173`);
  console.log(`🍪 Credentials: true`);
}
bootstrap();