import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RefreshTokenService } from './refresh-token.service';
import { CookieService } from './cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import type { Response, Request } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
    private cookieService: CookieService,
    private configService: ConfigService,
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
  async register(registerDto: RegisterDto, req: Request, res: Response) {
    try {
      // Создаем пользователя
      const user = await this.usersService.create(registerDto);

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
        message: 'Регистрация успешна',
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
        },
      };
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Email или username уже используются');
      }
      throw error;
    }
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