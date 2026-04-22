import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global() // Делает сервис доступным во всем приложении без импорта в каждый модуль
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
