import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RefreshTokenService } from './refresh-token.service';
import { CookieService } from './cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import type { Response, Request } from 'express';
import { TempRegistrationService } from './temp-registration.service';
import { EmailService } from './email.service';
import { v4 as uuidv4 } from 'uuid';
import { AuthException, EmailException, RecoveryException, RegistrationException, ValidationException } from 'src/common/expections/custom-exceptions';
import { ErrorCode } from 'src/common/expections/error-codes';
import { RecoveryDto } from './dto/recovery.dto';
import { TempResetService } from './temp-reset.service';
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
    private cookieService: CookieService,
    private configService: ConfigService,
    private tempRegistrationService: TempRegistrationService,
    private tempResetService: TempResetService,
    private emailService: EmailService,
  ) {}
  private readonly logger = new Logger(AuthService.name)
  /**
   * Валидация пользователя
   */
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  /**
   * Регистрация
   */
  async register(registerDto: RegisterDto) {
    try {
    const { email, username, password } = registerDto;
    
    // Проверяем, не существует ли уже пользователь с таким email
    const existingUser = await this.usersService.findByEmail( email );
    if (existingUser) {
      throw new RegistrationException(
        ErrorCode.REGISTRATION_EMAIL_EXISTS,
        'Email already exists',
        { email }
      );
    }
    
    // Проверяем username
    // const existingUsername = await this.usersService.findOne({ username });
    // if (existingUsername) {
    //   throw new ConflictException('Пользователь с таким username уже существует');
    // }
    
    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Генерируем код и временный ID
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const tempUserId = uuidv4();
    
    // Сохраняем во временное хранилище (Redis)
    await this.tempRegistrationService.save(tempUserId, {
      email,
      username,
      password: hashedPassword,
      code: verificationCode,
      createdAt: Date.now(),
    });
    
    try {
      await this.emailService.sendVerificationEmail(email, verificationCode);
    } catch (emailError) {
      await this.tempRegistrationService.delete(tempUserId);
      throw emailError; // Пробрасываем с уже правильным errorCode
    }
    
    return {
      success: true,
      message: 'Код подтверждения отправлен',
      tempUserId,
    };

    } catch (error) {
      if (error instanceof RegistrationException || error instanceof EmailException) {
        throw error;
      }
      
      
      throw new HttpException(
        { errorCode: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async passwordRecovery(recoveryDto: RecoveryDto) {
    try {
    const { email } = recoveryDto;
    
    const existingUser = await this.usersService.findByEmail( email );
    if (!existingUser) {
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_CREDENTIALS,
          'Invalid email',
          { email }
        );
    }
    
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const tempUserId = uuidv4();
    
    await this.tempResetService.save(tempUserId, {
      email,
      userId: existingUser._id,
      code: verificationCode,
      createdAt: Date.now(),
    });
    
    try {
      await this.emailService.sendResetPasswordEmail(email, verificationCode);
    } catch (emailError) {
      await this.tempRegistrationService.delete(tempUserId);
      throw emailError;
    }
    
    return {
      success: true,
      message: 'Код подтверждения отправлен',
      tempUserId,
    };

    } catch (error) {
      if (error instanceof RecoveryException || error instanceof EmailException) {
        throw error;
      }
      this.logger.error(`Registration failed: ${error}`);
      throw new HttpException(
        { errorCode: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async verifyResetPassword(
    tempUserId: string, 
    code: string, 
  ) {
    try {
      if (!tempUserId) {
        throw new ValidationException(
          ErrorCode.VALIDATION_TEMP_USER_ID_REQUIRED,
          'Reset ID is required',
          { tempUserId }
        );
      }
      
      if (!code) {
        throw new ValidationException(
          ErrorCode.VALIDATION_CODE_REQUIRED,
          'Verification code is required',
          { code }
        );
      }
      
      if (!/^\d{6}$/.test(code)) {
        throw new ValidationException(
          ErrorCode.VALIDATION_CODE_FORMAT,
          'Code must be 6 digits',
          { code }
        );
      }

      const tempData = await this.tempResetService.get(tempUserId);
      
      if (!tempData) {
        this.logger.warn(`Verification failed: temp data not found for ${tempUserId}`);
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_DATA_NOT_FOUND,
          'Reset data not found or expired. Please register again.',
          { tempUserId }
        );
      }
      
      const attempts = (tempData.attempts || 0) + 1;
      await this.tempResetService.updateAttempts(tempUserId, attempts);
      
      if (attempts > 5) {
        this.logger.warn(`Max attempts exceeded for ${tempData.email}`);
        await this.tempResetService.delete(tempUserId);
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_MAX_ATTEMPTS,
          'Maximum verification attempts exceeded. Please register again.',
          { maxAttempts: 5, attempts }
        );
      }
      
      if (tempData.code !== code) {
        const remainingAttempts = 5 - attempts;
        this.logger.warn(`Invalid code for ${tempData.email}, attempts: ${attempts}`);
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_CODE_INVALID,
          `Invalid verification code. ${remainingAttempts} attempts remaining.`,
          { remainingAttempts, attempts }
        );
      }
      
      const isExpired = Date.now() - tempData.createdAt > 15 * 60 * 1000;
      if (isExpired) {
        this.logger.warn(`Code expired for ${tempData.email}`);
        await this.tempResetService.delete(tempUserId);
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_CODE_EXPIRED,
          'Verification code has expired. Please register again.',
          { expiredAt: new Date(tempData.createdAt + 15 * 60 * 1000).toISOString() }
        );
      }
      
      const existingUser = await this.usersService.findByEmail(tempData.email);
      if (!existingUser) {
        this.logger.warn(`User not exists: ${tempData.email}`);
        await this.tempResetService.delete(tempUserId);
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_CREDENTIALS,
          'User with this email not exists',
          { email: tempData.email }
        );
      }
      
      await this.tempResetService.save(tempUserId, {
        email: tempData.email,
        userId: existingUser._id,
        code: 'verified',
        createdAt: Date.now(),
      });
      
      return {
        success: true,
        message: 'Verification successful',
      };
      
    } catch (error: any) {
      this.logger.error(`Verification failed: ${error.message}`);
      
      if (error instanceof ValidationException || 
          error instanceof RecoveryException) {
        throw error;
      }
      
      throw new RecoveryException(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to verify registration. Please try again later.',
        { originalError: error.message }
      );
    }
  }


  async verifyRegistration(
    tempUserId: string, 
    code: string, 
    req: Request, 
    res: Response
  ) {
    try {
      if (!tempUserId) {
        throw new ValidationException(
          ErrorCode.VALIDATION_TEMP_USER_ID_REQUIRED,
          'Registration ID is required',
          { tempUserId }
        );
      }
      
      if (!code) {
        throw new ValidationException(
          ErrorCode.VALIDATION_CODE_REQUIRED,
          'Verification code is required',
          { code }
        );
      }
      
      if (!/^\d{6}$/.test(code)) {
        throw new ValidationException(
          ErrorCode.VALIDATION_CODE_FORMAT,
          'Code must be 6 digits',
          { code }
        );
      }

      const tempData = await this.tempRegistrationService.get(tempUserId);
      
      if (!tempData) {
        this.logger.warn(`Verification failed: temp data not found for ${tempUserId}`);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_DATA_NOT_FOUND,
          'Registration data not found or expired. Please register again.',
          { tempUserId }
        );
      }
      
      const attempts = (tempData.attempts || 0) + 1;
      await this.tempRegistrationService.updateAttempts(tempUserId, attempts);
      
      if (attempts > 5) {
        this.logger.warn(`Max attempts exceeded for ${tempData.email}`);
        await this.tempRegistrationService.delete(tempUserId);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_MAX_ATTEMPTS,
          'Maximum verification attempts exceeded. Please register again.',
          { maxAttempts: 5, attempts }
        );
      }
      
      if (tempData.code !== code) {
        const remainingAttempts = 5 - attempts;
        this.logger.warn(`Invalid code for ${tempData.email}, attempts: ${attempts}`);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_CODE_INVALID,
          `Invalid verification code. ${remainingAttempts} attempts remaining.`,
          { remainingAttempts, attempts }
        );
      }
      
      const isExpired = Date.now() - tempData.createdAt > 15 * 60 * 1000;
      if (isExpired) {
        this.logger.warn(`Code expired for ${tempData.email}`);
        await this.tempRegistrationService.delete(tempUserId);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_CODE_EXPIRED,
          'Verification code has expired. Please register again.',
          { expiredAt: new Date(tempData.createdAt + 15 * 60 * 1000).toISOString() }
        );
      }
      
      const existingUser = await this.usersService.findByEmail(tempData.email);
      if (existingUser) {
        this.logger.warn(`User already exists: ${tempData.email}`);
        await this.tempRegistrationService.delete(tempUserId);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_EMAIL_EXISTS,
          'User with this email already exists',
          { email: tempData.email }
        );
      }
      
      const user = await this.usersService.create({
        email: tempData.email,
        username: tempData.username,
        password: tempData.password,
      });
      
      this.logger.log(`User created successfully: ${user.email} (${user._id})`);
      
      await this.tempRegistrationService.delete(tempUserId);
      
      const accessToken = await this.generateAccessToken(user);
      const refreshToken = await this.refreshTokenService.createRefreshToken(
        user._id.toString(),
        req.headers['user-agent'],
        req.ip,
      );
      
      this.cookieService.setAccessTokenCookie(res, accessToken);
      this.cookieService.setRefreshTokenCookie(res, refreshToken);
      return {
        success: true,
        message: 'Registration completed successfully',
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
        },
      };
      
    } catch (error: any) {
      this.logger.error(`Verification failed: ${error.message}`);
      
      if (error instanceof ValidationException || 
          error instanceof RegistrationException) {
        throw error;
      }
      
      throw new RegistrationException(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to verify registration. Please try again later.',
        { originalError: error.message }
      );
    }
  }

  async resendVerificationCode(tempUserId: string) {
    try {
      if (!tempUserId) {
        throw new ValidationException(
          ErrorCode.VALIDATION_TEMP_USER_ID_REQUIRED,
          'Registration ID is required',
          { tempUserId }
        );
      }

      const tempData = await this.tempRegistrationService.get(tempUserId);
      
      if (!tempData) {
        this.logger.warn(`Resend failed: temp data not found for ${tempUserId}`);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_DATA_NOT_FOUND,
          'Registration data not found. Please register again.',
          { tempUserId }
        );
      }
      
      const existingUser = await this.usersService.findByEmail(tempData.email);
      if (existingUser) {
        this.logger.warn(`Resend failed: user already exists ${tempData.email}`);
        await this.tempRegistrationService.delete(tempUserId);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_EMAIL_EXISTS,
          'User with this email already exists',
          { email: tempData.email }
        );
      }
      
      const isExpired = Date.now() - tempData.createdAt > 15 * 60 * 1000;
      if (isExpired) {
        this.logger.warn(`Resend failed: data expired for ${tempData.email}`);
        await this.tempRegistrationService.delete(tempUserId);
        throw new RegistrationException(
          ErrorCode.REGISTRATION_CODE_EXPIRED,
          'Registration has expired. Please register again.',
          { email: tempData.email }
        );
      }
      
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      await this.tempRegistrationService.save(tempUserId, {
        ...tempData,
        code: newCode,
        createdAt: Date.now(),
        attempts: 0,
      });
      
      this.logger.log(`New code generated for ${tempData.email}`);
      
      try {
        await this.emailService.sendVerificationEmail(tempData.email, newCode);
        this.logger.log(`Resend email sent to ${tempData.email}`);
      } catch (emailError: any) {
        this.logger.error(`Failed to resend email: ${emailError.message}`);
        
        if (emailError instanceof EmailException) {
          throw emailError;
        }
        
        throw new EmailException(
          ErrorCode.EMAIL_SENDING_FAILED,
          'Failed to send verification code',
          { originalError: emailError.message, email: tempData.email }
        );
      }
      
      return {
        success: true,
        message: 'New verification code has been sent to your email. Valid for 15 minutes.',
      };
      
    } catch (error:any) {
      this.logger.error(`Resend failed: ${error.message}`);
      
      if (error instanceof ValidationException || 
          error instanceof RegistrationException || 
          error instanceof EmailException) {
        throw error;
      }
      
      throw new RegistrationException(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to resend verification code. Please try again later.',
        { originalError: error.message }
      );
    }
  }

  /**
   * Вход
   */
  async login(loginDto: LoginDto, req: Request, res: Response) {
    try {
      const { email, password } = loginDto;
      
      // 🔥 Validate user
      const user = await this.validateUser(email, password);
      
      if (!user) {
        this.logger.warn(`Failed login attempt for email: ${email}`);
        throw new AuthException(
          ErrorCode.AUTH_INVALID_CREDENTIALS,
          'Invalid email or password',
          { email }
        );
      }
      
      
      // 🔥 Generate tokens
      const accessToken = await this.generateAccessToken(user);
      const refreshToken = await this.refreshTokenService.createRefreshToken(
        user._id.toString(),
        req.headers['user-agent'],
        req.ip,
      );
      
      // 🔥 Set cookies
      this.cookieService.setAccessTokenCookie(res, accessToken);
      this.cookieService.setRefreshTokenCookie(res, refreshToken);
      
      this.logger.log(`User logged in successfully: ${user.email}`);
      
      return {
        success: true,
        message: 'Login successful',
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
        },
      };
      
    } catch (error:any) {
      this.logger.error(`Login failed: ${error.message}`);
      
      if (error instanceof AuthException) {
        throw error;
      }
      
      throw new AuthException(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to login. Please try again later.',
        { originalError: error.message }
      );
    }
  }

  /**
   * Обновление токенов
   */
  async refreshTokens(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    // console.log(refreshToken);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token не найден');
    }

    // Проверяем refresh token в БД
    const userId = await this.refreshTokenService.validateRefreshToken(refreshToken);

    // Получаем пользователя
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    // Инвалидируем старый refresh token
    await this.refreshTokenService.revokeRefreshToken(refreshToken);

    // Генерируем новый access token
    const newAccessToken = await this.generateAccessToken(user);

    // Создаем новый refresh token
    const newRefreshToken = await this.refreshTokenService.createRefreshToken(
      userId,
      req.headers['user-agent'],
      req.ip,
    );

    // Устанавливаем новые куки
    this.cookieService.setAccessTokenCookie(res, newAccessToken);
    this.cookieService.setRefreshTokenCookie(res, newRefreshToken);

    return {
      success: true,
      message: 'Токены обновлены',
    };
  }

  /**
   * Выход
   */
  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token;

    if (refreshToken) {
      // Инвалидируем refresh token в БД
      await this.refreshTokenService.revokeRefreshToken(refreshToken);
    }

    // Очищаем куки
    this.cookieService.clearAuthCookies(res);

    return {
      success: true,
      message: 'Выход выполнен успешно',
    };
  }

  /**
   * Получение профиля
   */
  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    return {
      id: user._id,
      email: user.email,
      username: user.username,
      createdAt: user['createdAt'],
    };
  }

  /**
   * Генерация access token
   */
  private async generateAccessToken(user: any): Promise<string> {
    const payload = {
      sub: user._id,
      email: user.email,
      username: user.username,
    };

    const secret = this.configService.get<string>('jwt.access.secret');
    const expiresIn = this.configService.get<string>('jwt.access.expiresIn') || '15m';

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: expiresIn as any, // Исправление для TypeScript
    });
  }
}