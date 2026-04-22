import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookieService {
  constructor(private configService: ConfigService) {}

  /**
   * Установка access token в httpOnly куку
   */
  setAccessTokenCookie(res: Response, token: string): void {
    const expiresIn = this.configService.get<string>(
      'jwt.access.expiresIn',
    ) as string;
    const maxAge = this.parseExpiresInToMs(expiresIn);

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: this.configService.get<'lax' | 'strict' | 'none'>(
        'cookie.sameSite',
      ),
      domain: 'localhost',
      maxAge,
      path: '/',
    });
  }

  /**
   * Установка refresh token в httpOnly куку
   */
  setRefreshTokenCookie(res: Response, token: string): void {
    const expiresIn = this.configService.get<string>(
      'jwt.refresh.expiresIn',
    ) as string;
    const maxAge = this.parseExpiresInToMs(expiresIn);
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: this.configService.get<'lax' | 'strict' | 'none'>(
        'cookie.sameSite',
      ),
      domain: 'localhost',
      maxAge,
      path: '/api/auth/refresh', // Только для refresh маршрута
    });
  }

  /**
   * Очистка всех кук (logout)
   */
  clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: this.configService.get<boolean>('cookie.secure'),
      sameSite: this.configService.get<'lax' | 'strict' | 'none'>(
        'cookie.sameSite',
      ),
      domain: this.configService.get<string>('cookie.domain'),
      path: '/',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.get<boolean>('cookie.secure'),
      sameSite: this.configService.get<'lax' | 'strict' | 'none'>(
        'cookie.sameSite',
      ),
      domain: this.configService.get<string>('cookie.domain'),
      path: '/api/auth/refresh',
    });
  }

  /**
   * Парсинг expiresIn в миллисекунды
   */
  private parseExpiresInToMs(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 15 * 60 * 1000; // 15 минут по умолчанию для access
    }
  }
}
