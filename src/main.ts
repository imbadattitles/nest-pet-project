import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { join } from 'path';
import * as express from 'express';
import { CleanMongooseInterceptor } from './common/interceptors/clean-mongoose.interceptor';
import { UrlTransformerInterceptor } from './common/interceptors/url-transformer.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 5000;

  // Cookie parser middleware
  app.use(cookieParser());

  // Глобальные CORS настройки для API
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Раздаем статические файлы с CORS заголовками (ОДИН РАЗ!)
  app.use('/uploads', (req, res, next) => {
    // Добавляем CORS заголовки для статических файлов
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    // Обрабатываем preflight запросы
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  }, express.static(join(__dirname, '..', 'uploads')));
  app.useGlobalFilters(new HttpExceptionFilter());
  // Глобальные pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Глобальный префикс
  app.setGlobalPrefix('api');
  
  app.useGlobalInterceptors(
    // new CleanMongooseInterceptor(),
    // new UrlTransformerInterceptor(configService)
  );
  
  await app.listen(port);
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`📍 http://localhost:${port}/api`);
  console.log(`🍪 CORS origin: http://localhost:5173`);
  console.log(`🍪 Credentials: true`);
  console.log(`📁 Статические файлы доступны по адресу: http://localhost:${port}/uploads`);
}
bootstrap();