import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RefreshTokenService } from '../refresh-token.service';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private refreshTokenService: RefreshTokenService,
  ) {
    const secret = configService.get<string>('jwt.refresh.secret');
    
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET не определен');
    }

    super({
      jwtFromRequest: (req: Request) => {
        console.log(req?.cookies?.refresh_token);
        return req?.cookies?.refresh_token;
      },
      passReqToCallback: true,
      secretOrKey: secret,
    });
  }

  async validate(req: Request, payload: any) {
    console.log('asdasd')
    const refreshToken = req.cookies?.refresh_token;
    console.log(refreshToken);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Проверяем валидность refresh токена в БД
    const userId = await this.refreshTokenService.validateRefreshToken(refreshToken);
    console.log(userId)
    return {
      id: userId,
      email: payload.email,
      username: payload.username,
    };
  }
}