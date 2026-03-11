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

  // Middleware
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: configService.get<string>('clientUrl') || 'http://localhost:3000',
    credentials: true,
  });

  // Глобальный префикс
  app.setGlobalPrefix('api');

  await app.listen(port);
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`📍 http://localhost:${port}/api`);
}
bootstrap();