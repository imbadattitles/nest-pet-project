import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';
// NOTE: Многие классы сейчас идентичны, но разделены для будущих
// различных требований к валидации и регистрации
export class EmailException extends HttpException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super({ errorCode, message, details }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class ValidationException extends HttpException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super({ errorCode, message, details }, HttpStatus.BAD_REQUEST);
  }
}

export class RegistrationException extends HttpException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super({ errorCode, message, details }, HttpStatus.BAD_REQUEST);
  }
}

export class AuthException extends HttpException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(
      { errorCode, message, details, timestamp: new Date().toISOString() },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class RecoveryException extends HttpException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(
      { errorCode, message, details, timestamp: new Date().toISOString() },
      HttpStatus.BAD_REQUEST,
    );
  }
}
