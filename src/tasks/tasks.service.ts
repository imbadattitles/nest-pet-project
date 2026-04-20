import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CleanupService } from '../commands/cleanup.service';

@Injectable()
export class TasksService {
  constructor(private readonly cleanupService: CleanupService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleOrphanCleanup() {
    console.log('Запуск ежедневной очистки файлов-сирот...');
    const result = await this.cleanupService.cleanupOrphanFiles();
    console.log(`Очистка завершена. Удалено ${result.deleted.length} файлов.`);
  }
}