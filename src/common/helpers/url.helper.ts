import { ConfigService } from '@nestjs/config';

export class UrlHelper {
  static getFullUrl(path: string, configService: ConfigService): string {
    if (!path || !path.startsWith('/')) return path;
    
    const baseUrl = configService.get('app.url') || 'http://localhost:5000';
    return `${baseUrl}${path}`;
  }

  static transformPostUrls(post: any, configService: ConfigService): any {
    if (!post) return post;
    
    // Создаем новый объект, чтобы не мутировать оригинал
    const transformed = { ...post };
    
    if (transformed.imageUrl && typeof transformed.imageUrl === 'string') {
      transformed.imageUrl = this.getFullUrl(transformed.imageUrl, configService);
    }
    
    if (transformed.avatar && typeof transformed.avatar === 'string') {
      transformed.avatar = this.getFullUrl(transformed.avatar, configService);
    }

    if (transformed.url && typeof transformed.url === 'string') {
      transformed.url = this.getFullUrl(transformed.url, configService);
    }
    
    return transformed;
  }
  
  static transformArrayUrls(items: any[], configService: ConfigService): any[] {
    return items.map(item => this.transformPostUrls(item, configService));
  }
}