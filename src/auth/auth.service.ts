import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
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
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
    private cookieService: CookieService,
    private configService: ConfigService,
    private tempRegistrationService: TempRegistrationService,
    private emailService: EmailService,
    private readonly logger = new Logger(AuthService.name)
  ) {}

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
      throw new ConflictException('Пользователь с таким email уже существует');
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
      } catch (emailError: any) {
        // Если email не отправился - удаляем временные данные
        await this.tempRegistrationService.delete(tempUserId);
        this.logger.error(`Email sending failed for ${email}: ${emailError.message}`);
        throw new BadRequestException(
          `Не удалось отправить код подтверждения. ${emailError.message}`
        );
      }
    
    return {
      success: true,
      message: 'Код подтверждения отправлен на почту. Действителен 15 минут.',
      tempUserId, // Отдаем клиенту для последующих запросов
    };

    } catch (error:any) {
      this.logger.error(`Registration failed for ${registerDto.email}: ${error.message}`);
      
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException(
        'Ошибка при регистрации. Пожалуйста, попробуйте позже.'
      );
    }
  }

  // 2. ПОДТВЕРЖДЕНИЕ РЕГИСТРАЦИИ (ввод кода)
  async verifyRegistration(
    tempUserId: string, 
    code: string, 
    req: Request, 
    res: Response
  ) {
    // Получаем временные данные
    const tempData = await this.tempRegistrationService.get(tempUserId);
    
    if (!tempData) {
      throw new NotFoundException('Данные регистрации не найдены или истекли. Зарегистрируйтесь заново.');
    }
    
    // Проверяем код
    if (tempData.code !== code) {
      throw new UnauthorizedException('Неверный код подтверждения');
    }
    
    // Проверяем, не истек ли срок (хотя Redis сам удалит, но на всякий случай)
    const isExpired = Date.now() - tempData.createdAt > 15 * 60 * 1000;
    if (isExpired) {
      await this.tempRegistrationService.delete(tempUserId);
      throw new UnauthorizedException('Срок действия кода истек. Зарегистрируйтесь заново.');
    }
    
    // Финальная проверка: не создал ли кто-то пользователя за это время
    const existingUser = await this.usersService.findByEmail(tempData.email );
    if (existingUser) {
      await this.tempRegistrationService.delete(tempUserId);
      throw new ConflictException('Пользователь с таким email уже существует');
    }
    
    // Создаем пользователя в БД
    const user = await this.usersService.create({
      email: tempData.email,
      username: tempData.username,
      password: tempData.password, // уже хешированный
      // isEmailVerified: true,
    });
    
    // Удаляем временные данные
    await this.tempRegistrationService.delete(tempUserId);
    
    // Генерируем токены (как в твоем изначальном коде)
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user._id.toString(),
      req.headers['user-agent'],
      req.ip,
    );
    
    // Устанавливаем куки
    this.cookieService.setAccessTokenCookie(res, accessToken);
    this.cookieService.setRefreshTokenCookie(res, refreshToken);
    
    return {
      success: true,
      message: 'Регистрация успешно завершена',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
      },
    };
  }

  // 3. ПОВТОРНАЯ ОТПРАВКА КОДА
  async resendVerificationCode(tempUserId: string) {
    // Получаем временные данные
    const tempData = await this.tempRegistrationService.get(tempUserId);
    
    if (!tempData) {
      throw new NotFoundException('Данные регистрации не найдены. Зарегистрируйтесь заново.');
    }
    
    // Генерируем новый код
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Обновляем данные в Redis
    await this.tempRegistrationService.save(tempUserId, {
      ...tempData,
      code: newCode,
      createdAt: Date.now(), // сбрасываем таймер
    });
    
    // Отправляем новое письмо
    await this.emailService.sendVerificationEmail(tempData.email, newCode);
    
    return {
      success: true,
      message: 'Новый код подтверждения отправлен на почту. Действителен 15 минут.',
    };
  }

  /**
   * Вход
   */
  async login(loginDto: LoginDto, req: Request, res: Response) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Генерируем access token
    const accessToken = await this.generateAccessToken(user);

    // Создаем refresh token
    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user._id.toString(),
      req.headers['user-agent'],
      req.ip,
    );

    // Устанавливаем куки
    this.cookieService.setAccessTokenCookie(res, accessToken);
    this.cookieService.setRefreshTokenCookie(res, refreshToken);

    return {
      success: true,
      message: 'Вход выполнен успешно',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
      },
    };
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