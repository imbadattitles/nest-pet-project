import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

@Injectable()
export class CleanMongooseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.cleanDocument(data)) // чистим данные
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
        cleaned[key] = this.cleanDocument(doc[key]);
      }
    }
    return cleaned;
  }
}