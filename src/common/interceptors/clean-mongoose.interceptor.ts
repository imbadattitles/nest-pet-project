import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class CleanMongooseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.cleanDocument(data))
    );
  }

  private cleanDocument(doc: any): any {
    if (!doc || typeof doc !== 'object') return doc;
    
    // Если это Mongoose документ - берем _doc
    if (doc._doc) {
      return this.cleanDocument(doc._doc);
    }
    
    // Если это массив
    if (Array.isArray(doc)) {
      return doc.map(item => this.cleanDocument(item));
    }
    
    // Если это объект
    const cleaned = {};
    for (const key in doc) {
      if (doc.hasOwnProperty(key) && !key.startsWith('$') && key !== '_doc') {
        // Конвертируем _id в строку
        // if (key === '_id') {
          // cleaned['id'] = doc[key].toString();
        // } else {
          cleaned[key] = this.cleanDocument(doc[key]);
        // }
      }
    }
    return cleaned;
  }
}