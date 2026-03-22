import { forwardRef, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service'; // ваш сервис пользователей
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtWsService {
  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => UsersService)) private usersService: UsersService, // 👈 добавили forwardRef
    private configService: ConfigService,
  ) {}

  async validateToken(token: string) {
    try {
      // Верифицируем токен с тем же секретом, что и в стратегии
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.access.secret'),
      });

      // Находим пользователя как в вашей стратегии
      const user = await this.usersService.findMyProfile(payload.sub);
      
      if (!user) {
        throw new UnauthorizedException('Пользователь не найден');
      }

      // Возвращаем данные пользователя (как в validate методе стратегии)
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}