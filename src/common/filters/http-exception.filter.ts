import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode, ErrorResponse } from '../expections/error-codes';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Внутренняя ошибка сервера';
    let details = null;

    // Обработка известных исключений
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      
      // Если у нас уже есть структурированная ошибка
      if (exceptionResponse.errorCode && Object.values(ErrorCode).includes(exceptionResponse.errorCode)) {
        errorCode = exceptionResponse.errorCode;
        message = exceptionResponse.message;
        details = exceptionResponse.details;
      } else {
        message = exceptionResponse.message || exception.message;
      }
    } 
    // Обработка обычных ошибок
    else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.stack}`);
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      errorCode,
      details,
    };

    response.status(statusCode).json(errorResponse);
  }
}