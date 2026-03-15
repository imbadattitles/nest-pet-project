import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Создание refresh токена (JWT)
   */
  async createRefreshToken(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<string> {
    // Создаем payload
    const payload = { sub: userId };
    
    // Получаем секрет и время жизни
    const secret = this.configService.get<string>('jwt.refresh.secret');
    const expiresIn = this.configService.get<string>('jwt.refresh.expiresIn') || '7d';
    
    // ВАЖНО: Сначала создаем options объект
    const options: any = {
      secret: secret,
      expiresIn: expiresIn,
    };
    
    // Затем вызываем sign
    const token = this.jwtService.sign(payload, options);

    // Рассчитываем дату истечения
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + this.parseExpiresInToMs(expiresIn));

    // Сохраняем в БД
    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(userId),
      token,
      expiresAt,
      userAgent,
      ipAddress,
      isValid: true,
    });

    return token;
  }

  /**
   * Проверка валидности refresh токена
   */
  async validateRefreshToken(token: string): Promise<string> {
    try {
      const secret = this.configService.get<string>('jwt.refresh.secret');
      
      // Проверяем JWT подпись
      const payload = this.jwtService.verify(token, {
        secret: secret,
      });

      // Проверяем в БД
      const tokenDoc = await this.refreshTokenModel
        .findOne({ token, isValid: true })
        .exec();

      if (!tokenDoc) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (tokenDoc.expiresAt < new Date()) {
        tokenDoc.isValid = false;
        await tokenDoc.save();
        throw new UnauthorizedException('Refresh token expired');
      }

      return payload.sub;
    } catch (error) {
      console.error('Refresh token validation error:', error);
      
      if (error.name === 'TokenExpiredError') {
        // Токен истек - помечаем в БД
        await this.refreshTokenModel.updateOne(
          { token },
          { isValid: false, revokedAt: new Date() }
        ).exec();
      }
      
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Инвалидация refresh токена
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await this.refreshTokenModel.updateOne(
      { token },
      {
        isValid: false,
        revokedAt: new Date(),
      }
    ).exec();
  }

  /**
   * Парсинг времени жизни в миллисекунды
   */
  private parseExpiresInToMs(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1), 10);

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }
}