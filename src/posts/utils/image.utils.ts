import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// Извлекает все URL изображений, начинающиеся с /uploads/content/
export function extractContentImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $('img').each((_, el) => {
    console.log(el);
    const src = $(el).attr('src');
    if (src && src.startsWith('/uploads/content/')) {
      console.log(src);
      urls.push(src);
    }
  });
  console.log(urls);
  return urls;
}

// Удаляет файл по URL (относительно корня проекта)
export function deleteFileByUrl(url: string): void {
  try {
    const filePath = path.join(process.cwd(), url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Ошибка удаления файла ${url}:`, err);
  }
}
