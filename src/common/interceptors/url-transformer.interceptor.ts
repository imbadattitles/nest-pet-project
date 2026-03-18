import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UrlTransformerInterceptor implements NestInterceptor {
  constructor(private configService: ConfigService) {}

intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  const baseUrl = this.configService.get('app.url');
  
  return next.handle().pipe(
    map(response => {
      // Если ответ имеет структуру { success, data }
      if (response && response.success !== undefined && response.data) {
        return {
          ...response,
          data: this.transformData(response.data, baseUrl)
        };
      }
      // Если ответ - просто данные
      return this.transformData(response, baseUrl);
    })
  );
}

private transformData(data: any, baseUrl: string): any {
  if (data?.imageUrl) {
    data.imageUrl = `${baseUrl}${data.imageUrl}`;
  }
    if (data?.avatar) {
    data.avatar = `${baseUrl}${data.avatar}`;
  }
  return data;
}}