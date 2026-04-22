import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post } from '../posts/schemas/post.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CleanupService {
  constructor(@InjectModel(Post.name) private postModel: Model<Post>) {}

  /**
   * Рекурсивно получить все файлы в директории
   */
  private getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });

    return arrayOfFiles;
  }

  /**
   * Удалить файлы-сироты
   */
  async cleanupOrphanFiles(): Promise<{ deleted: string[]; errors: string[] }> {
    const posts = await this.postModel
      .find()
      .select('imageUrl contentImages')
      .lean();

    // Собираем все легитимные URL из базы
    const usedUrls = new Set<string>();

    posts.forEach((post) => {
      if (post.imageUrl) usedUrls.add(post.imageUrl);
      console.log(post.contentImages);
      if (post.contentImages && Array.isArray(post.contentImages)) {
        post.contentImages.forEach((url) => usedUrls.add(url));
      }
    });
    console.log(usedUrls);
    // Папки для проверки
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const foldersToCheck = ['posts', 'content'].map((f) =>
      path.join(uploadsDir, f),
    );

    const deleted: string[] = [];
    const errors: string[] = [];

    for (const folder of foldersToCheck) {
      if (!fs.existsSync(folder)) continue;

      const allFiles = this.getAllFiles(folder);

      for (const absolutePath of allFiles) {
        // Преобразуем абсолютный путь обратно в URL вида /uploads/posts/filename.jpg
        const relativePath = path.relative(process.cwd(), absolutePath);
        const url = '/' + relativePath.replace(/\\/g, '/'); // для Windows

        if (!usedUrls.has(url)) {
          try {
            fs.unlinkSync(absolutePath);
            deleted.push(url);
          } catch (err) {
            errors.push(`${url}: ${err.message}`);
          }
        }
      }
    }
    console.log(deleted);
    return { deleted, errors };
  }
}
