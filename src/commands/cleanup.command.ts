import { Command, Positional } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { CleanupService } from './cleanup.service';

@Injectable()
export class CleanupCommand {
  constructor(private readonly cleanupService: CleanupService) {}

  @Command({
    command: 'cleanup:orphan-files',
    describe: 'Удалить неиспользуемые файлы из uploads/posts и uploads/content',
  })
  async run() {
    console.log('🔍 Поиск файлов-сирот...');
    const result = await this.cleanupService.cleanupOrphanFiles();

    console.log(`✅ Удалено файлов: ${result.deleted.length}`);
    if (result.deleted.length > 0) {
      console.log('Удалённые файлы:');
      result.deleted.forEach((f) => console.log(`  - ${f}`));
    }

    if (result.errors.length > 0) {
      console.log(`❌ Ошибок: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`  - ${e}`));
    }
  }
}
